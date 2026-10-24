from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Numeric, String, Text, event, func, true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.catalogos import CatalogoMixin
from app.database import Base
from app.validaciones import clave_nit, limpiar_nit

if TYPE_CHECKING:
    from app.models.model_caja import CajaTurno
    from app.models.model_inventario import Lote
    from app.models.model_producto import Producto
    from app.models.model_ubicacion import Ubicacion
    from app.models.model_usuario import Usuario

ESTADOS_VENTA = ("Completada", "Anulada")


class Cliente(Base):
    __tablename__ = "cliente"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    nit: Mapped[str] = mapped_column(String(20), nullable=False, default="CF")
    nit_unico: Mapped[str | None] = mapped_column(String(20), unique=True)  # NULL si es CF
    telefono: Mapped[str | None] = mapped_column(String(9))
    correo: Mapped[str | None] = mapped_column(String(100))
    direccion: Mapped[str | None] = mapped_column(String(255))
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


@event.listens_for(Cliente, "before_insert")
@event.listens_for(Cliente, "before_update")
def _sincronizar_nit_cliente(mapper, connection, target):
    target.nit = limpiar_nit(target.nit)
    target.nit_unico = clave_nit(target.nit)


class TipoPago(CatalogoMixin, Base):
    __tablename__ = "tipo_pago"
    id: Mapped[int] = mapped_column(primary_key=True)


class Venta(Base):
    __tablename__ = "venta"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    id_cliente: Mapped[int] = mapped_column(ForeignKey("cliente.id"), nullable=False)
    nit: Mapped[str] = mapped_column(String(20), nullable=False, default="CF")  # NIT usado en esta venta
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)
    id_caja_turno: Mapped[int] = mapped_column(ForeignKey("caja_turno.id"), nullable=False)
    id_tipo_pago: Mapped[int] = mapped_column(ForeignKey("tipo_pago.id"), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    descuento: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="Completada")
    motivo_anulacion: Mapped[str | None] = mapped_column(Text)
    observaciones: Mapped[str | None] = mapped_column(Text)

    cliente: Mapped["Cliente"] = relationship()
    usuario: Mapped["Usuario"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()
    caja_turno: Mapped["CajaTurno"] = relationship(back_populates="ventas")
    tipo_pago: Mapped["TipoPago"] = relationship()
    detalles: Mapped[list["DetalleVenta"]] = relationship(
        back_populates="venta", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("subtotal >= 0 AND descuento >= 0 AND total >= 0", name="montos"),
        CheckConstraint("descuento <= subtotal", name="descuento"),
        CheckConstraint("estado IN ('Completada', 'Anulada')", name="estado"),
    )


class DetalleVenta(Base):
    __tablename__ = "detalle_venta"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_venta: Mapped[int] = mapped_column(ForeignKey("venta.id"), nullable=False)
    id_producto: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)
    id_lote: Mapped[int] = mapped_column(ForeignKey("lote.id"), nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)  # para la utilidad
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    venta: Mapped["Venta"] = relationship(back_populates="detalles")
    producto: Mapped["Producto"] = relationship()
    lote: Mapped["Lote"] = relationship()

    __table_args__ = (
        CheckConstraint("cantidad > 0", name="cantidad"),
        CheckConstraint("precio_unitario >= 0", name="precio"),
        CheckConstraint("costo_unitario >= 0", name="costo"),
        CheckConstraint("subtotal >= 0", name="subtotal"),
    )