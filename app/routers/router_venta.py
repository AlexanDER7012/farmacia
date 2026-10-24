from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import Cliente, DetalleVenta, Inventario, Lote, Producto, TipoPago, Usuario, Venta
from app.models.model_usuario import ROL_VENDEDOR
from app.pagination import Paginacion, paginar
from app.routers.router_caja import turno_abierto
from app.schemas.schema_comun import Pagina
from app.schemas.schema_venta import AnularVenta, LoteDisponible, VentaCreate, VentaResponse, VentaResumen
from app.security import obtener_ip, requiere_rol
from app.stock import mover_stock
from app.validaciones import CONSUMIDOR_FINAL, limpiar_nit, validar_rango_fechas

router = APIRouter(prefix="/api/ventas", tags=["Ventas"])
puede_vender = requiere_rol(ROL_VENDEDOR)
CENTAVO = Decimal("0.01")


def _consulta():
    return select(Venta).options(
        selectinload(Venta.cliente),
        selectinload(Venta.tipo_pago),
        selectinload(Venta.ubicacion),
        selectinload(Venta.usuario),
        selectinload(Venta.caja_turno),
        selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
        selectinload(Venta.detalles).selectinload(DetalleVenta.lote),
    )


def _obtener(db: Session, id_venta: int) -> Venta:
    venta = db.scalars(_consulta().where(Venta.id == id_venta)).first()
    if venta is None:
        raise HTTPException(status_code=404, detail="No se encontró la venta")
    return venta


def _consumidor_final(db: Session) -> Cliente:
    """Cliente genérico para ventas sin cliente. Se crea la primera vez que se necesita."""
    cliente = db.scalars(
        select(Cliente).where(Cliente.nit == CONSUMIDOR_FINAL, Cliente.nombre == "Consumidor Final")
    ).first()
    if cliente is None:
        cliente = Cliente(nombre="Consumidor Final", nit=CONSUMIDOR_FINAL)
        db.add(cliente)
        db.flush()
    return cliente


@router.get("/lotes-disponibles", response_model=list[LoteDisponible])
def lotes_disponibles(
    id_producto: int = Query(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_vender),
):
    """Lotes con stock y sin vencer en la ubicación donde vende el usuario. El primero es el que vence antes."""
    turno = turno_abierto(db, usuario)
    id_ubicacion = turno.id_ubicacion if turno else usuario.empleado.id_ubicacion
    filas = db.execute(
        select(Lote.id, Lote.numero_lote, Lote.fecha_vencimiento, Inventario.cantidad)
        .join(Inventario, Inventario.id_lote == Lote.id)
        .where(
            Lote.id_producto == id_producto,
            Inventario.id_ubicacion == id_ubicacion,
            Inventario.cantidad > 0,
            Lote.fecha_vencimiento > date.today(),
        )
        .order_by(Lote.fecha_vencimiento)
    ).all()
    return [LoteDisponible(**f._mapping) for f in filas]


@router.get("", response_model=Pagina[VentaResumen])
def listar(
    paginacion: Paginacion = Depends(),
    estado: Literal["Completada", "Anulada"] | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(puede_vender),
):
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    consulta = (
        select(Venta)
        .join(Cliente, Venta.id_cliente == Cliente.id)
        .options(
            selectinload(Venta.cliente), selectinload(Venta.tipo_pago),
            selectinload(Venta.ubicacion), selectinload(Venta.usuario),
        )
        .order_by(Venta.fecha.desc(), Venta.id.desc())
    )
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Cliente.nombre.icontains(texto, autoescape=True),
            Venta.nit.icontains(texto, autoescape=True),
        ))
    if estado:
        consulta = consulta.where(Venta.estado == estado)
    if desde:
        consulta = consulta.where(Venta.fecha >= desde)
    if hasta:
        consulta = consulta.where(Venta.fecha < hasta + timedelta(days=1))
    return paginar(db, consulta, paginacion, VentaResumen)


@router.get("/{id_venta}", response_model=VentaResponse)
def obtener(id_venta: int, db: Session = Depends(get_db), _: Usuario = Depends(puede_vender)):
    return _obtener(db, id_venta)


@router.post("", response_model=VentaResponse, status_code=201)
def crear(datos: VentaCreate, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_vender)):
    turno = turno_abierto(db, usuario)
    if turno is None:
        raise HTTPException(status_code=400, detail="Debes abrir un turno de caja para poder vender")

    tipo_pago = obtener_activo(db, TipoPago, datos.id_tipo_pago, "el tipo de pago")
    cliente = obtener_activo(db, Cliente, datos.id_cliente, "el cliente") if datos.id_cliente else _consumidor_final(db)

    venta = Venta(
        id_cliente=cliente.id,
        nit=limpiar_nit(datos.nit) if datos.nit else cliente.nit,
        id_usuario=usuario.id,
        id_ubicacion=turno.id_ubicacion,
        id_caja_turno=turno.id,
        id_tipo_pago=tipo_pago.id,
        descuento=datos.descuento,
        observaciones=datos.observaciones,
        estado="Completada",
    )

    hoy = date.today()
    salidas = []
    for d in datos.detalles:
        producto = db.get(Producto, d.id_producto)
        if producto is None:
            raise HTTPException(status_code=404, detail="Uno de los productos de la venta no existe")
        lote = db.get(Lote, d.id_lote)
        if lote is None or lote.id_producto != producto.id:
            raise HTTPException(status_code=400, detail=f"El lote elegido no pertenece a '{producto.nombre}'")
        if lote.fecha_vencimiento <= hoy:
            raise HTTPException(status_code=400, detail=f"El lote {lote.numero_lote} de '{producto.nombre}' está vencido")

        venta.detalles.append(DetalleVenta(
            id_producto=producto.id,
            id_lote=lote.id,
            cantidad=d.cantidad,
            precio_unitario=producto.precio_venta,
            costo_unitario=lote.costo_unitario,
            subtotal=(d.cantidad * producto.precio_venta).quantize(CENTAVO),
        ))
        salidas.append((lote, d.cantidad))

    venta.subtotal = sum((det.subtotal for det in venta.detalles), Decimal("0"))
    if venta.descuento > venta.subtotal:
        raise HTTPException(status_code=400, detail="El descuento no puede ser mayor que el subtotal de la venta")
    venta.total = venta.subtotal - venta.descuento

    db.add(venta)
    db.flush()   # para tener el número de venta

    for lote, cantidad in salidas:
        mover_stock(db, lote, turno.id_ubicacion, cantidad, "Salida", "Venta", usuario.id,
                    referencia=f"Venta No. {venta.id}")

    registrar_actividad(db, "CREAR", "Ventas",
                        f"Venta No. {venta.id} a '{cliente.nombre}' por Q{venta.total:,.2f} ({tipo_pago.nombre})",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return _obtener(db, venta.id)


@router.patch("/{id_venta}/anular", response_model=VentaResponse)
def anular(
    id_venta: int,
    datos: AnularVenta,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_vender),
):
    venta = _obtener(db, id_venta)
    if venta.estado == "Anulada":
        raise HTTPException(status_code=400, detail="La venta ya está anulada")
    if venta.caja_turno.estado == "Cerrado":
        raise HTTPException(status_code=400, detail="No se puede anular una venta de un turno de caja ya cerrado")

    for d in venta.detalles:
        mover_stock(db, d.lote, venta.id_ubicacion, d.cantidad, "Entrada", "Venta", usuario.id,
                    referencia=f"Anulación de venta No. {venta.id}", observaciones=datos.motivo,
                    permitir_inactivo=True)

    venta.estado = "Anulada"
    venta.motivo_anulacion = datos.motivo
    registrar_actividad(db, "ANULAR", "Ventas", f"Anuló la venta No. {venta.id}: {datos.motivo}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return _obtener(db, venta.id)