from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Numeric,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.model_producto import Producto
    from app.models.model_ubicacion import Ubicacion
    from app.models.model_usuario import Usuario

TIPOS_MOVIMIENTO = ("Entrada", "Salida")
ORIGENES_MOVIMIENTO = ("Manual", "Ajuste", "Compra", "Venta")


class Lote(Base):
    __tablename__ = "lote"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_producto: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)
    numero_lote: Mapped[str] = mapped_column(String(50), nullable=False)
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    producto: Mapped["Producto"] = relationship()
    existencias: Mapped[list["Inventario"]] = relationship(back_populates="lote")

    __table_args__ = (
        # Un producto no puede tener dos lotes con el mismo número
        UniqueConstraint("id_producto", "numero_lote", name="uq_lote_producto_numero"),
        CheckConstraint("costo_unitario >= 0", name="costo"),
    )


class Inventario(Base):
    __tablename__ = "inventario"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_lote: Mapped[int] = mapped_column(ForeignKey("lote.id"), nullable=False)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    lote: Mapped["Lote"] = relationship(back_populates="existencias")
    ubicacion: Mapped["Ubicacion"] = relationship()

    __table_args__ = (
        # Un solo registro por lote en cada ubicación
        UniqueConstraint("id_lote", "id_ubicacion", name="uq_inventario_lote_ubicacion"),
        CheckConstraint("cantidad >= 0", name="cantidad"),
    )


class MovimientoInventario(Base):
    __tablename__ = "movimiento_inventario"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)       # Entrada / Salida
    origen: Mapped[str] = mapped_column(String(10), nullable=False)     # Manual / Ajuste / Compra / Venta
    id_lote: Mapped[int] = mapped_column(ForeignKey("lote.id"), nullable=False)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(100))         # ej. "Factura A-123"
    observaciones: Mapped[str | None] = mapped_column(Text)

    lote: Mapped["Lote"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()
    usuario: Mapped["Usuario"] = relationship()

    __table_args__ = (
        CheckConstraint("tipo IN ('Entrada', 'Salida')", name="tipo"),
        CheckConstraint("origen IN ('Manual', 'Ajuste', 'Compra', 'Venta')", name="origen"),
        CheckConstraint("cantidad > 0", name="cantidad"),
    )