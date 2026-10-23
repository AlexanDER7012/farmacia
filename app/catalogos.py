from fastapi import HTTPException, status
from sqlalchemy import Boolean, String, Text, event, select, true
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.validaciones import limpiar_texto, normalizar


class CatalogoMixin:
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    nombre_normalizado: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )


@event.listens_for(CatalogoMixin, "before_insert", propagate=True)
@event.listens_for(CatalogoMixin, "before_update", propagate=True)
def _sincronizar_nombre(mapper, connection, target):
    """Antes de guardar cualquier catálogo, limpia el nombre y calcula su clave."""
    target.nombre = limpiar_texto(target.nombre, campo="El nombre")
    target.nombre_normalizado = normalizar(target.nombre)


def validar_nombre_unico(db: Session, Modelo, nombre, etiqueta: str, excluir_id: int | None = None) -> str:
    try:
        limpio = limpiar_texto(nombre, campo="El nombre")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    consulta = select(Modelo).where(Modelo.nombre_normalizado == normalizar(limpio))
    if excluir_id is not None:
        consulta = consulta.where(Modelo.id != excluir_id)
    existente = db.scalars(consulta).first()

    if existente:
        aviso = " (está inactivo; puedes reactivarlo)" if not existente.activo else ""
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe {etiqueta} con el nombre '{existente.nombre}'{aviso}",
        )
    return limpio


def obtener_activo(db: Session, Modelo, id_registro: int | None, etiqueta: str, obligatorio: bool = True):

    if id_registro is None:
        if obligatorio:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Debes seleccionar {etiqueta}")
        return None

    registro = db.get(Modelo, id_registro)
    if registro is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No se encontró {etiqueta} seleccionado(a)")
    if not registro.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede usar {etiqueta} '{registro.nombre}' porque está en estado inactivo",
        )
    return registro