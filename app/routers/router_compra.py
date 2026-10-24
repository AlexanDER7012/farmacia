from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import Compra, ConfiguracionGeneral, DetalleCompra, Producto, Proveedor, Ubicacion, Usuario
from app.models.model_usuario import ROL_BODEGUERO
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina
from app.schemas.schema_compra import CancelarCompra, CompraCreate, CompraResponse, CompraResumen
from app.security import get_current_user, obtener_ip, requiere_rol
from app.stock import mover_stock, normalizar_lote, obtener_o_crear_lote, revisar_producto_activo
from app.validaciones import validar_rango_fechas

router = APIRouter(prefix="/api/compras", tags=["Compras"])
puede_editar = requiere_rol(ROL_BODEGUERO)
CENTAVO = Decimal("0.01")


def _consulta():
    return select(Compra).options(
        selectinload(Compra.proveedor),
        selectinload(Compra.ubicacion),
        selectinload(Compra.usuario),
        selectinload(Compra.detalles).selectinload(DetalleCompra.producto),
    )


def _obtener(db: Session, id_compra: int) -> Compra:
    compra = db.scalars(_consulta().where(Compra.id == id_compra)).first()
    if compra is None:
        raise HTTPException(status_code=404, detail="No se encontró la compra")
    return compra


def _referencia(compra: Compra) -> str:
    """Cómo se nombra la compra en mensajes y en el kardex (sin IDs internos)."""
    if compra.numero_factura:
        return f"Compra factura {compra.numero_factura}"
    return f"Compra a {compra.proveedor.nombre} del {compra.fecha:%d/%m/%Y}"


def _iva_porcentaje(db: Session) -> Decimal:
    config = db.scalars(select(ConfiguracionGeneral)).first()
    return config.iva_porcentaje if config else Decimal("12")


@router.get("", response_model=Pagina[CompraResumen])
def listar(
    paginacion: Paginacion = Depends(),
    estado: Literal["Pendiente", "Recibida", "Cancelada"] | None = Query(None),
    estado_pago: Literal["Pendiente", "Pagada"] | None = Query(None),
    id_proveedor: int | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    consulta = (
        select(Compra)
        .join(Proveedor, Compra.id_proveedor == Proveedor.id)
        .options(selectinload(Compra.proveedor), selectinload(Compra.ubicacion), selectinload(Compra.usuario))
        .order_by(Compra.fecha.desc(), Compra.id.desc())
    )
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Compra.numero_factura.icontains(texto, autoescape=True),
            Proveedor.nombre.icontains(texto, autoescape=True),
        ))
    if estado:
        consulta = consulta.where(Compra.estado == estado)
    if estado_pago:
        consulta = consulta.where(Compra.estado_pago == estado_pago)
    if id_proveedor is not None:
        consulta = consulta.where(Compra.id_proveedor == id_proveedor)
    if desde:
        consulta = consulta.where(Compra.fecha >= desde)
    if hasta:
        consulta = consulta.where(Compra.fecha < hasta + timedelta(days=1))
    return paginar(db, consulta, paginacion, CompraResumen)


@router.get("/{id_compra}", response_model=CompraResponse)
def obtener(id_compra: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return _obtener(db, id_compra)


@router.post("", response_model=CompraResponse, status_code=201)
def crear(datos: CompraCreate, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    proveedor = obtener_activo(db, Proveedor, datos.id_proveedor, "el proveedor")
    obtener_activo(db, Ubicacion, datos.id_ubicacion, "la ubicación")

    compra = Compra(
        id_proveedor=proveedor.id,
        id_ubicacion=datos.id_ubicacion,
        id_usuario=usuario.id,
        numero_factura=datos.numero_factura,
        observaciones=datos.observaciones,
        estado="Pendiente",
        estado_pago="Pendiente",
    )
    for d in datos.detalles:
        producto = db.get(Producto, d.id_producto)
        if producto is None:
            raise HTTPException(status_code=404, detail="Uno de los productos del detalle no existe")
        revisar_producto_activo(producto)
        compra.detalles.append(DetalleCompra(
            id_producto=producto.id,
            numero_lote=normalizar_lote(d.numero_lote),
            fecha_vencimiento=d.fecha_vencimiento,
            cantidad=d.cantidad,
            costo_unitario=d.costo_unitario,
            subtotal=(d.cantidad * d.costo_unitario).quantize(CENTAVO),
        ))

    # Los costos incluyen IVA: se separa del total
    total = sum((det.subtotal for det in compra.detalles), Decimal("0"))
    iva = (total - total / (1 + _iva_porcentaje(db) / 100)).quantize(CENTAVO)
    compra.total = total
    compra.iva = iva
    compra.subtotal = total - iva

    db.add(compra)
    registrar_actividad(db, "CREAR", "Compras",
                        f"Registró una compra a '{proveedor.nombre}' por Q{total:,.2f}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return _obtener(db, compra.id)


@router.patch("/{id_compra}/recibir", response_model=CompraResponse)
def recibir(id_compra: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    compra = _obtener(db, id_compra)
    if compra.estado != "Pendiente":
        raise HTTPException(status_code=400, detail=f"Solo se pueden recibir compras pendientes (esta está {compra.estado.lower()})")

    referencia = _referencia(compra)
    for d in compra.detalles:
        lote = obtener_o_crear_lote(db, d.producto, d.numero_lote, d.fecha_vencimiento, d.costo_unitario)
        d.id_lote = lote.id
        mover_stock(db, lote, compra.id_ubicacion, d.cantidad, "Entrada", "Compra", usuario.id, referencia=referencia)

    compra.estado = "Recibida"
    compra.fecha_recepcion = datetime.now()
    registrar_actividad(db, "RECIBIR", "Compras", f"Recibió la {referencia.lower()} en {compra.ubicacion.nombre}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return _obtener(db, compra.id)


@router.patch("/{id_compra}/pagar", response_model=Mensaje)
def pagar(id_compra: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    compra = _obtener(db, id_compra)
    if compra.estado == "Cancelada":
        raise HTTPException(status_code=400, detail="No se puede pagar una compra cancelada")
    if compra.estado_pago == "Pagada":
        raise HTTPException(status_code=400, detail="La compra ya está pagada")

    compra.estado_pago = "Pagada"
    registrar_actividad(db, "EDITAR", "Compras", f"Marcó como pagada la {_referencia(compra).lower()}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje="La compra quedó como pagada")


@router.patch("/{id_compra}/cancelar", response_model=Mensaje)
def cancelar(
    id_compra: int,
    datos: CancelarCompra,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_editar),
):
    compra = _obtener(db, id_compra)
    if compra.estado == "Cancelada":
        raise HTTPException(status_code=400, detail="La compra ya está cancelada")

    referencia = _referencia(compra)
    if compra.estado == "Recibida":
        # Si ya se vendió parte, mover_stock lanza el error y no se cancela nada
        for d in compra.detalles:
            mover_stock(db, d.lote, compra.id_ubicacion, d.cantidad, "Salida", "Compra", usuario.id,
                        referencia=f"Cancelación de {referencia.lower()}", observaciones=datos.motivo)

    compra.estado = "Cancelada"
    compra.observaciones = f"{compra.observaciones or ''}\nCancelada: {datos.motivo}".strip()
    registrar_actividad(db, "ANULAR", "Compras", f"Canceló la {referencia.lower()}: {datos.motivo}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()

    aviso = "La compra ya estaba pagada: gestiona la devolución del dinero con el proveedor" \
        if compra.estado_pago == "Pagada" else None
    return Mensaje(mensaje="La compra fue cancelada", aviso=aviso)