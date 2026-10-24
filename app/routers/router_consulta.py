from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ConfiguracionGeneral, Usuario
from app.models.model_vistas import vw_cliente, vw_existencia, vw_producto, vw_stock_bajo, vw_venta_diaria
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Pagina
from app.schemas.schema_consulta import (
    ClienteVista, ExistenciaVista, LotePorVencer, ProductoVista, StockBajo, VentaDiaria,
)
from app.security import get_current_user
from app.validaciones import validar_rango_fechas

router = APIRouter(prefix="/api/consultas", tags=["Consultas (vistas)"])


@router.get("/clientes", response_model=Pagina[ClienteVista])
def clientes(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    v = vw_cliente.c
    consulta = select(vw_cliente).order_by(v.nombre)
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(v.nombre.icontains(texto, autoescape=True), v.nit.icontains(texto, autoescape=True)))
    if activo is not None:
        consulta = consulta.where(v.activo == activo)
    return paginar(db, consulta, paginacion, ClienteVista)


@router.get("/productos", response_model=Pagina[ProductoVista])
def productos(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    v = vw_producto.c
    consulta = select(vw_producto).order_by(v.nombre)
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            v.codigo.icontains(texto, autoescape=True),
            v.nombre.icontains(texto, autoescape=True),
            v.principio_activo.icontains(texto, autoescape=True),
        ))
    if activo is not None:
        consulta = consulta.where(v.activo == activo)
    return paginar(db, consulta, paginacion, ProductoVista)


@router.get("/existencias", response_model=Pagina[ExistenciaVista])
def existencias(
    paginacion: Paginacion = Depends(),
    id_ubicacion: int | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    v = vw_existencia.c
    consulta = select(vw_existencia).where(v.cantidad > 0).order_by(v.producto, v.fecha_vencimiento)
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            v.codigo.icontains(texto, autoescape=True),
            v.producto.icontains(texto, autoescape=True),
            v.numero_lote.icontains(texto, autoescape=True),
        ))
    if id_ubicacion is not None:
        consulta = consulta.where(v.id_ubicacion == id_ubicacion)
    return paginar(db, consulta, paginacion, ExistenciaVista)


@router.get("/alertas/stock-bajo", response_model=list[StockBajo])
def stock_bajo(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    filas = db.execute(select(vw_stock_bajo).order_by(vw_stock_bajo.c.nombre)).all()
    return [StockBajo(**f._mapping) for f in filas]


@router.get("/alertas/vencimientos", response_model=list[LotePorVencer])
def vencimientos(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Lotes con stock que vencen dentro de los días configurados (o que ya vencieron)."""
    config = db.scalars(select(ConfiguracionGeneral)).first()
    dias = config.dias_alerta_vencimiento if config else 90
    hoy = date.today()
    v = vw_existencia.c
    filas = db.execute(
        select(vw_existencia)
        .where(v.cantidad > 0, v.fecha_vencimiento <= hoy + timedelta(days=dias))
        .order_by(v.fecha_vencimiento)
    ).all()
    resultado = []
    for f in filas:
        restantes = (f.fecha_vencimiento - hoy).days
        resultado.append(LotePorVencer(**f._mapping, dias_restantes=restantes, vencido=restantes <= 0))
    return resultado


@router.get("/ventas-diarias", response_model=list[VentaDiaria])
def ventas_diarias(
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    v = vw_venta_diaria.c
    consulta = select(vw_venta_diaria).order_by(v.dia.desc())
    if desde:
        consulta = consulta.where(v.dia >= desde)
    if hasta:
        consulta = consulta.where(v.dia <= hasta)
    return [VentaDiaria(**f._mapping) for f in db.execute(consulta).all()]