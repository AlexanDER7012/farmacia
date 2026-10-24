from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    Numeric, String, Text, event, func, true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.validaciones import clave_nit, limpiar_nit

if TYPE_CHECKING:
    from app.models.model_inventario import Lote
    from app.models.model_producto import Producto
    from app.models.model_ubicacion import Ubicacion
    from app.models.model_usuario import Usuario

ESTADOS_COMPRA = ("Pendiente", "Recibida", "Cancelada")
ESTADOS_PAGO = ("Pendiente", "Pagada")


class Proveedor(Base):
    __tablename__ = "proveedor"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    nit: Mapped[str] = mapped_column(String(20), nullable=False)
    nit_unico: Mapped[str | None] = mapped_column(String(20), unique=True)  # NULL si es CF
    contacto: Mapped[str | None] = mapped_column(String(100))
    telefono: Mapped[str | None] = mapped_column(String(9))
    correo: Mapped[str | None] = mapped_column(String(100))
    direccion: Mapped[str | None] = mapped_column(String(255))
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


@event.listens_for(Proveedor, "before_insert")
@event.listens_for(Proveedor, "before_update")
def _sincronizar_nit_proveedor(mapper, connection, target):
    target.nit = limpiar_nit(target.nit)
    target.nit_unico = clave_nit(target.nit)


class Compra(Base):
    __tablename__ = "compra"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    id_proveedor: Mapped[int] = mapped_column(ForeignKey("proveedor.id"), nullable=False)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)   # destino
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    numero_factura: Mapped[str | None] = mapped_column(String(50))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="Pendiente")
    estado_pago: Mapped[str] = mapped_column(String(20), nullable=False, default="Pendiente")
    fecha_recepcion: Mapped[datetime | None] = mapped_column(DateTime)
    observaciones: Mapped[str | None] = mapped_column(Text)

    proveedor: Mapped["Proveedor"] = relationship()
    ubicacion: Mapped["Ubicacion"] = relationship()
    usuario: Mapped["Usuario"] = relationship()
    detalles: Mapped[list["DetalleCompra"]] = relationship(
        back_populates="compra", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("subtotal >= 0 AND iva >= 0 AND total >= 0", name="montos"),
        CheckConstraint("estado IN ('Pendiente', 'Recibida', 'Cancelada')", name="estado"),
        CheckConstraint("estado_pago IN ('Pendiente', 'Pagada')", name="estado_pago"),
    )


class DetalleCompra(Base):
    __tablename__ = "detalle_compra"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_compra: Mapped[int] = mapped_column(ForeignKey("compra.id"), nullable=False)
    id_producto: Mapped[int] = mapped_column(ForeignKey("producto.id"), nullable=False)
    numero_lote: Mapped[str] = mapped_column(String(50), nullable=False)
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Se llena al recibir la compra, cuando se crea (o se encuentra) el lote
    id_lote: Mapped[int | None] = mapped_column(ForeignKey("lote.id"))

    compra: Mapped["Compra"] = relationship(back_populates="detalles")
    producto: Mapped["Producto"] = relationship()
    lote: Mapped["Lote | None"] = relationship()

    __table_args__ = (
        CheckConstraint("cantidad > 0", name="cantidad"),
        CheckConstraint("costo_unitario >= 0", name="costo"),
        CheckConstraint("subtotal >= 0", name="subtotal"),
    )