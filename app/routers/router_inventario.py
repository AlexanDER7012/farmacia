from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import Inventario, Lote, MovimientoInventario, Producto, Ubicacion, Usuario
from app.models.model_usuario import ROL_BODEGUERO
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina
from app.schemas.schema_inventario import (
    ExistenciaResponse, LoteResponse, MovimientoCreate, MovimientoResponse,
)
from app.security import get_current_user, obtener_ip, requiere_rol
from app.stock import mover_stock, obtener_o_crear_lote
from app.validaciones import validar_rango_fechas

router = APIRouter(prefix="/api/inventario", tags=["Inventario"])
puede_mover = requiere_rol(ROL_BODEGUERO)


def _filtro_buscar(consulta, texto: str | None):
    if texto:
        consulta = consulta.where(or_(
            Producto.codigo.icontains(texto, autoescape=True),
            Producto.nombre.icontains(texto, autoescape=True),
            Lote.numero_lote.icontains(texto, autoescape=True),
        ))
    return consulta


@router.get("/existencias", response_model=Pagina[ExistenciaResponse])
def existencias(
    paginacion: Paginacion = Depends(),
    id_ubicacion: int | None = Query(None),
    id_producto: int | None = Query(None),
    solo_con_stock: bool = Query(True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Stock de cada lote en cada ubicación."""
    consulta = (
        select(
            Inventario.id, Inventario.cantidad,
            Lote.id.label("id_lote"), Lote.numero_lote, Lote.fecha_vencimiento,
            Producto.id.label("id_producto"), Producto.codigo, Producto.nombre.label("producto"),
            Ubicacion.id.label("id_ubicacion"), Ubicacion.nombre.label("ubicacion"),
        )
        .join(Lote, Inventario.id_lote == Lote.id)
        .join(Producto, Lote.id_producto == Producto.id)
        .join(Ubicacion, Inventario.id_ubicacion == Ubicacion.id)
        .order_by(Producto.nombre, Lote.fecha_vencimiento)
    )
    consulta = _filtro_buscar(consulta, paginacion.buscar)
    if id_ubicacion is not None:
        consulta = consulta.where(Inventario.id_ubicacion == id_ubicacion)
    if id_producto is not None:
        consulta = consulta.where(Lote.id_producto == id_producto)
    if solo_con_stock:
        consulta = consulta.where(Inventario.cantidad > 0)
    return paginar(db, consulta, paginacion, ExistenciaResponse)


@router.get("/lotes", response_model=Pagina[LoteResponse])
def lotes(
    paginacion: Paginacion = Depends(),
    id_producto: int | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Lotes con su stock total en todas las ubicaciones."""
    stock = func.coalesce(func.sum(Inventario.cantidad), 0)
    consulta = (
        select(
            Lote.id, Lote.numero_lote, Lote.fecha_vencimiento, Lote.costo_unitario,
            Producto.id.label("id_producto"), Producto.codigo, Producto.nombre.label("producto"),
            stock.label("stock"),
        )
        .join(Producto, Lote.id_producto == Producto.id)
        .outerjoin(Inventario, Inventario.id_lote == Lote.id)
        .group_by(
            Lote.id, Lote.numero_lote, Lote.fecha_vencimiento, Lote.costo_unitario,
            Producto.id, Producto.codigo, Producto.nombre,
        )
        .order_by(Lote.fecha_vencimiento)
    )
    consulta = _filtro_buscar(consulta, paginacion.buscar)
    if id_producto is not None:
        consulta = consulta.where(Lote.id_producto == id_producto)
    return paginar(db, consulta, paginacion, LoteResponse)


@router.get("/movimientos", response_model=Pagina[MovimientoResponse])
def movimientos(
    paginacion: Paginacion = Depends(),
    id_producto: int | None = Query(None),
    id_ubicacion: int | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Historial (kardex): cada entrada y salida, de la más reciente a la más antigua."""
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    consulta = (
        select(
            MovimientoInventario.id, MovimientoInventario.fecha, MovimientoInventario.tipo,
            MovimientoInventario.origen, MovimientoInventario.cantidad,
            MovimientoInventario.referencia, MovimientoInventario.observaciones,
            Lote.numero_lote, Producto.codigo, Producto.nombre.label("producto"),
            Ubicacion.nombre.label("ubicacion"), Usuario.nombre_usuario.label("usuario"),
        )
        .join(Lote, MovimientoInventario.id_lote == Lote.id)
        .join(Producto, Lote.id_producto == Producto.id)
        .join(Ubicacion, MovimientoInventario.id_ubicacion == Ubicacion.id)
        .join(Usuario, MovimientoInventario.id_usuario == Usuario.id)
        .order_by(MovimientoInventario.fecha.desc(), MovimientoInventario.id.desc())
    )
    consulta = _filtro_buscar(consulta, paginacion.buscar)
    if id_producto is not None:
        consulta = consulta.where(Lote.id_producto == id_producto)
    if id_ubicacion is not None:
        consulta = consulta.where(MovimientoInventario.id_ubicacion == id_ubicacion)
    if desde:
        consulta = consulta.where(MovimientoInventario.fecha >= desde)
    if hasta:
        consulta = consulta.where(MovimientoInventario.fecha < hasta + timedelta(days=1))
    return paginar(db, consulta, paginacion, MovimientoResponse)


@router.post("/movimientos", response_model=Mensaje, status_code=201)
def movimiento_manual(
    datos: MovimientoCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_mover),
):
    producto = db.get(Producto, datos.id_producto)
    if producto is None:
        raise HTTPException(status_code=404, detail="No se encontró el producto")
    ubicacion = obtener_activo(db, Ubicacion, datos.id_ubicacion, "la ubicación")

    # En una entrada el lote puede ser nuevo; en una salida tiene que existir
    fecha = datos.fecha_vencimiento if datos.tipo == "Entrada" else None
    lote = obtener_o_crear_lote(db, producto, datos.numero_lote, fecha, producto.precio_compra)

    queda = mover_stock(
        db, lote, ubicacion.id, datos.cantidad, datos.tipo, "Manual", usuario.id,
        referencia=datos.referencia, observaciones=datos.observaciones,
    )
    registrar_actividad(
        db, "CREAR", "Inventario",
        f"{datos.tipo} manual de {datos.cantidad:g} de '{producto.nombre}' (lote {lote.numero_lote}) "
        f"en {ubicacion.nombre}: {datos.observaciones}",
        id_usuario=usuario.id, ip=obtener_ip(request),
    )
    db.commit()
    return Mensaje(mensaje=f"Se registró la {datos.tipo.lower()}. Quedan {queda:g} en {ubicacion.nombre}.")