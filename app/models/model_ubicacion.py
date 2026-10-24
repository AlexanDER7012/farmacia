from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.catalogos import CatalogoMixin
from app.database import Base

TIPOS_UBICACION = ("Sucursal", "Bodega")


class Ubicacion(CatalogoMixin, Base):
    __tablename__ = "ubicacion"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="Sucursal")
    direccion: Mapped[str | None] = mapped_column(String(255))
    telefono: Mapped[str | None] = mapped_column(String(9))

    __table_args__ = (
        CheckConstraint("tipo IN ('Sucursal', 'Bodega')", name="tipo"),
    )