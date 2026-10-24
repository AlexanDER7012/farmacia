from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import ConfiguracionGeneral, Ubicacion, Usuario
from app.schemas.schema_configuracion import ConfiguracionResponse, ConfiguracionUpdate
from app.security import get_current_user, obtener_ip, requiere_rol

router = APIRouter(prefix="/api/configuracion", tags=["Configuración"])
solo_admin = requiere_rol()


def _obtener(db: Session) -> ConfiguracionGeneral:
    config = db.scalars(select(ConfiguracionGeneral)).first()
    if config is None:
        raise HTTPException(status_code=404, detail="No hay configuración. Ejecuta el script de datos iniciales.")
    return config


@router.get("", response_model=ConfiguracionResponse)
def obtener(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return _obtener(db)


@router.put("", response_model=ConfiguracionResponse)
def editar(datos: ConfiguracionUpdate, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(solo_admin)):
    config = _obtener(db)
    if datos.id_ubicacion_defecto is not None and datos.id_ubicacion_defecto != config.id_ubicacion_defecto:
        obtener_activo(db, Ubicacion, datos.id_ubicacion_defecto, "la ubicación")

    for campo, valor in datos.model_dump().items():
        setattr(config, campo, valor)

    registrar_actividad(db, "EDITAR", "Configuración", "Actualizó la configuración general",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(config)
    return config