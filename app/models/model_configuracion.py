from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Integer,
    Numeric, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.model_ubicacion import Ubicacion
    from app.models.model_usuario import Usuario


class ConfiguracionGeneral(Base):
    __tablename__ = "configuracion_general"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_negocio: Mapped[str] = mapped_column(String(100), nullable=False)
    nit: Mapped[str | None] = mapped_column(String(20))
    direccion: Mapped[str | None] = mapped_column(String(255))
    telefono: Mapped[str | None] = mapped_column(String(9))
    correo: Mapped[str | None] = mapped_column(String(100))
    iva_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=12)
    moneda: Mapped[str] = mapped_column(String(10), nullable=False, default="Q")
    dias_alerta_vencimiento: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    id_ubicacion_defecto: Mapped[int | None] = mapped_column(ForeignKey("ubicacion.id"))
    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    ubicacion_defecto: Mapped["Ubicacion | None"] = relationship()

    __table_args__ = (
        CheckConstraint("iva_porcentaje >= 0 AND iva_porcentaje <= 100", name="iva"),
        CheckConstraint("dias_alerta_vencimiento >= 0", name="dias_alerta"),
    )


class Bitacora(Base):
    __tablename__ = "bitacora"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    # Puede ser NULL: por ejemplo, un login fallido con un usuario que no existe
    id_usuario: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    accion: Mapped[str] = mapped_column(String(20), nullable=False)
    modulo: Mapped[str] = mapped_column(String(50), nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(String(45))

    usuario: Mapped["Usuario | None"] = relationship()