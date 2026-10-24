from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bitacora, Usuario
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Pagina
from app.schemas.schema_configuracion import BitacoraResponse
from app.security import requiere_rol
from app.validaciones import validar_rango_fechas

router = APIRouter(prefix="/api/bitacora", tags=["Bitácora"])
solo_admin = requiere_rol()


@router.get("", response_model=Pagina[BitacoraResponse])
def listar(
    paginacion: Paginacion = Depends(),
    accion: str | None = Query(None),
    modulo: str | None = Query(None),
    id_usuario: int | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    try:
        validar_rango_fechas(desde, hasta)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    consulta = (
        select(
            Bitacora.id, Bitacora.fecha, Bitacora.accion, Bitacora.modulo,
            Bitacora.detalle, Bitacora.ip, Usuario.nombre_usuario.label("usuario"),
        )
        .outerjoin(Usuario, Bitacora.id_usuario == Usuario.id)
        .order_by(Bitacora.fecha.desc(), Bitacora.id.desc())
    )
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Bitacora.detalle.icontains(texto, autoescape=True),
            Usuario.nombre_usuario.icontains(texto, autoescape=True),
        ))
    if accion:
        consulta = consulta.where(Bitacora.accion == accion.upper())
    if modulo:
        consulta = consulta.where(Bitacora.modulo == modulo)
    if id_usuario is not None:
        consulta = consulta.where(Bitacora.id_usuario == id_usuario)
    if desde:
        consulta = consulta.where(Bitacora.fecha >= desde)
    if hasta:
        consulta = consulta.where(Bitacora.fecha < hasta + timedelta(days=1))
    return paginar(db, consulta, paginacion, BitacoraResponse)