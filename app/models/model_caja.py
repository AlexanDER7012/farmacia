from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, Numeric, String, Text, event, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.model_ubicacion import Ubicacion
    from app.models.model_usuario import Usuario
    from app.models.model_venta import Venta

ESTADOS_TURNO = ("Abierto", "Cerrado")


class CajaTurno(Base):
    __tablename__ = "caja_turno"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)
    fecha_apertura: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    fondo_inicial: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    fecha_cierre: Mapped[datetime | None] = mapped_column(DateTime)
    total_esperado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # fondo + ventas en efectivo - gastos
    total_contado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    diferencia: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))     # puede ser negativa (faltante)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="Abierto")
    observaciones: Mapped[str | None] = mapped_column(Text)
    # Vale el id del usuario mientras el turno está abierto y NULL al cerrarlo.
    # Con el índice único, un usuario no puede tener dos turnos abiertos.
    usuario_abierto: Mapped[int | None] = mapped_column(Integer, unique=True)

    usuario: Mapped["Usuario"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()
    ventas: Mapped[list["Venta"]] = relationship(back_populates="caja_turno")
    gastos: Mapped[list["Gasto"]] = relationship(back_populates="caja_turno")

    __table_args__ = (
        CheckConstraint("fondo_inicial >= 0", name="fondo"),
        CheckConstraint("total_contado IS NULL OR total_contado >= 0", name="contado"),
        CheckConstraint("estado IN ('Abierto', 'Cerrado')", name="estado"),
    )


@event.listens_for(CajaTurno, "before_insert")
@event.listens_for(CajaTurno, "before_update")
def _sincronizar_turno_abierto(mapper, connection, target):
    target.usuario_abierto = target.id_usuario if target.estado == "Abierto" else None


class Gasto(Base):
    __tablename__ = "gasto"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    # Si se pagó con dinero de la caja, se descuenta del efectivo esperado del turno
    id_caja_turno: Mapped[int | None] = mapped_column(ForeignKey("caja_turno.id"))
    concepto: Mapped[str] = mapped_column(String(150), nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    anulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    observaciones: Mapped[str | None] = mapped_column(Text)

    ubicacion: Mapped["Ubicacion"] = relationship()
    usuario: Mapped["Usuario"] = relationship()
    caja_turno: Mapped["CajaTurno | None"] = relationship(back_populates="gastos")

    __table_args__ = (
        CheckConstraint("monto > 0", name="monto"),
    )