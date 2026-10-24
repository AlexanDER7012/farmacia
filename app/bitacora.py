import logging

from sqlalchemy.orm import Session

from app.models.model_configuracion import Bitacora

log = logging.getLogger(__name__)

ACCIONES_VALIDAS = {
    "LOGIN", "LOGIN_FALLIDO", "LOGOUT",
    "CREAR", "EDITAR", "DESACTIVAR", "REACTIVAR",
    "ANULAR", "RECIBIR", "ABRIR", "CERRAR",
}


def registrar_actividad(
    db: Session,
    accion: str,
    modulo: str,
    detalle: str | None = None,
    id_usuario: int | None = None,
    ip: str | None = None,
) -> None:

    if accion not in ACCIONES_VALIDAS:
        log.warning("Acción de bitácora no estándar: %s", accion)

    db.add(Bitacora(
        id_usuario=id_usuario,
        accion=accion,
        modulo=modulo,
        detalle=detalle[:2000] if detalle else None,
        ip=ip,
    ))