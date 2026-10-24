from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.bitacora import registrar_actividad
from app.database import get_db
from app.models import CajaTurno, Gasto, TipoPago, Usuario, Venta
from app.models.model_usuario import ROL_ADMINISTRADOR, ROL_VENDEDOR
from app.pagination import Paginacion, paginar
from app.schemas.schema_caja import (
    AbrirTurno, AnularGasto, CerrarTurno, GastoCreate, GastoResponse, ResumenTurno, TurnoResponse,
)
from app.schemas.schema_comun import Mensaje, Pagina
from app.security import obtener_ip, requiere_rol
from app.validaciones import normalizar, validar_rango_fechas

router = APIRouter(prefix="/api/caja", tags=["Caja"])
puede_usar_caja = requiere_rol(ROL_VENDEDOR)
EFECTIVO = normalizar("Efectivo")


def _es_admin(usuario: Usuario) -> bool:
    return usuario.rol.nombre_normalizado == normalizar(ROL_ADMINISTRADOR)


def turno_abierto(db: Session, usuario: Usuario) -> CajaTurno | None:
    return db.scalars(
        select(CajaTurno)
        .options(selectinload(CajaTurno.usuario), selectinload(CajaTurno.ubicacion))
        .where(CajaTurno.id_usuario == usuario.id, CajaTurno.estado == "Abierto")
    ).first()


def resumen_turno(db: Session, turno: CajaTurno) -> ResumenTurno:
    es_efectivo = TipoPago.nombre_normalizado == EFECTIVO
    efectivo, otros, cantidad = db.execute(
        select(
            func.coalesce(func.sum(case((es_efectivo, Venta.total), else_=0)), 0),
            func.coalesce(func.sum(case((es_efectivo, 0), else_=Venta.total)), 0),
            func.count(Venta.id),
        )
        .join(TipoPago, Venta.id_tipo_pago == TipoPago.id)
        .where(Venta.id_caja_turno == turno.id, Venta.estado == "Completada")
    ).one()
    gastos = db.scalar(
        select(func.coalesce(func.sum(Gasto.monto), 0))
        .where(Gasto.id_caja_turno == turno.id, Gasto.anulado.is_(False))
    )
    efectivo, otros, gastos = Decimal(efectivo), Decimal(otros), Decimal(gastos)
    return ResumenTurno(
        turno=TurnoResponse.model_validate(turno),
        cantidad_ventas=cantidad,
        ventas_efectivo=efectivo,
        ventas_otros_pagos=otros,
        gastos_de_caja=gastos,
        efectivo_esperado=turno.fondo_inicial + efectivo - gastos,
    )


# ===================== Turnos =====================
@router.get("/turnos/actual", response_model=ResumenTurno | None)
def turno_actual(db: Session = Depends(get_db), usuario: Usuario = Depends(puede_usar_caja)):
    """El turno abierto del usuario con su resumen, o null si no tiene."""
    turno = turno_abierto(db, usuario)
    return resumen_turno(db, turno) if turno else None


@router.post("/turnos/abrir", response_model=ResumenTurno, status_code=201)
def abrir_turno(datos: AbrirTurno, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_usar_caja)):
    if turno_abierto(db, usuario):
        raise HTTPException(status_code=409, detail="Ya tienes un turno de caja abierto")
    ubicacion = usuario.empleado.ubicacion
    if not ubicacion.activo:
        raise HTTPException(status_code=400, detail=f"Tu ubicación '{ubicacion.nombre}' está inactiva")

    turno = CajaTurno(
        id_usuario=usuario.id,
        id_ubicacion=ubicacion.id,
        fondo_inicial=datos.fondo_inicial,
        observaciones=datos.observaciones,
        estado="Abierto",
    )
    db.add(turno)
    registrar_actividad(db, "ABRIR", "Caja", f"Abrió turno de caja en {ubicacion.nombre} con Q{datos.fondo_inicial:,.2f}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return resumen_turno(db, turno_abierto(db, usuario))


@router.post("/turnos/cerrar", response_model=TurnoResponse)
def cerrar_turno(datos: CerrarTurno, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_usar_caja)):
    turno = turno_abierto(db, usuario)
    if turno is None:
        raise HTTPException(status_code=400, detail="No tienes un turno de caja abierto")

    resumen = resumen_turno(db, turno)
    turno.total_esperado = resumen.efectivo_esperado
    turno.total_contado = datos.total_contado
    turno.diferencia = datos.total_contado - resumen.efectivo_esperado
    turno.fecha_cierre = datetime.now()
    turno.estado = "Cerrado"
    if datos.observaciones:
        turno.observaciones = f"{turno.observaciones or ''}\nCierre: {datos.observaciones}".strip()

    if turno.diferencia == 0:
        resultado = "cuadre exacto"
    elif turno.diferencia > 0:
        resultado = f"sobrante de Q{turno.diferencia:,.2f}"
    else:
        resultado = f"faltante de Q{abs(turno.diferencia):,.2f}"
    registrar_actividad(db, "CERRAR", "Caja", f"Cerró turno de caja: {resultado}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(turno)
    return turno


@router.get("/turnos", response_model=Pagina[TurnoResponse])
def listar_turnos(
    paginacion: Paginacion = Depends(),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_usar_caja),
):
    """El administrador ve todos los turnos; los demás, solo los suyos."""
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    consulta = (
        select(CajaTurno)
        .options(selectinload(CajaTurno.usuario), selectinload(CajaTurno.ubicacion))
        .order_by(CajaTurno.fecha_apertura.desc())
    )
    if not _es_admin(usuario):
        consulta = consulta.where(CajaTurno.id_usuario == usuario.id)
    if desde:
        consulta = consulta.where(CajaTurno.fecha_apertura >= desde)
    if hasta:
        consulta = consulta.where(CajaTurno.fecha_apertura < hasta + timedelta(days=1))
    return paginar(db, consulta, paginacion, TurnoResponse)


# ===================== Gastos =====================
@router.get("/gastos", response_model=Pagina[GastoResponse])
def listar_gastos(
    paginacion: Paginacion = Depends(),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(puede_usar_caja),
):
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    consulta = (
        select(Gasto)
        .options(selectinload(Gasto.ubicacion), selectinload(Gasto.usuario))
        .order_by(Gasto.fecha.desc())
    )
    if paginacion.buscar:
        consulta = consulta.where(Gasto.concepto.icontains(paginacion.buscar, autoescape=True))
    if desde:
        consulta = consulta.where(Gasto.fecha >= desde)
    if hasta:
        consulta = consulta.where(Gasto.fecha < hasta + timedelta(days=1))
    return paginar(db, consulta, paginacion, GastoResponse)


@router.post("/gastos", response_model=GastoResponse, status_code=201)
def crear_gasto(datos: GastoCreate, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_usar_caja)):
    turno = None
    if datos.de_caja:
        turno = turno_abierto(db, usuario)
        if turno is None:
            raise HTTPException(status_code=400, detail="Para pagar un gasto con dinero de caja necesitas un turno abierto")
        disponible = resumen_turno(db, turno).efectivo_esperado
        if datos.monto > disponible:
            raise HTTPException(
                status_code=400,
                detail=f"No hay suficiente efectivo en caja: disponible Q{disponible:,.2f}, el gasto es de Q{datos.monto:,.2f}",
            )

    gasto = Gasto(
        id_ubicacion=turno.id_ubicacion if turno else usuario.empleado.id_ubicacion,
        id_usuario=usuario.id,
        id_caja_turno=turno.id if turno else None,
        concepto=datos.concepto,
        monto=datos.monto,
        anulado=False,
        observaciones=datos.observaciones,
    )
    db.add(gasto)
    registrar_actividad(db, "CREAR", "Caja", f"Registró el gasto '{gasto.concepto}' por Q{gasto.monto:,.2f}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(gasto)
    return gasto


@router.patch("/gastos/{id_gasto}/anular", response_model=Mensaje)
def anular_gasto(
    id_gasto: int,
    datos: AnularGasto,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_usar_caja),
):
    gasto = db.get(Gasto, id_gasto)
    if gasto is None:
        raise HTTPException(status_code=404, detail="No se encontró el gasto")
    if gasto.anulado:
        raise HTTPException(status_code=400, detail="El gasto ya está anulado")
    if gasto.caja_turno and gasto.caja_turno.estado == "Cerrado":
        raise HTTPException(status_code=400, detail="No se puede anular un gasto de un turno de caja ya cerrado")

    gasto.anulado = True
    gasto.observaciones = f"{gasto.observaciones or ''}\nAnulado: {datos.motivo}".strip()
    registrar_actividad(db, "ANULAR", "Caja", f"Anuló el gasto '{gasto.concepto}': {datos.motivo}",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se anuló el gasto '{gasto.concepto}'")