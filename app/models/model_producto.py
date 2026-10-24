from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Numeric, String, Text, event, func, true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.catalogos import CatalogoMixin
from app.database import Base
from app.validaciones import limpiar_texto, normalizar_codigo


# ===================== Catalogos =====================
class Categoria(CatalogoMixin, Base):
    __tablename__ = "categoria"
    id: Mapped[int] = mapped_column(primary_key=True)


class Laboratorio(CatalogoMixin, Base):
    __tablename__ = "laboratorio"
    id: Mapped[int] = mapped_column(primary_key=True)


class PrincipioActivo(CatalogoMixin, Base):
    __tablename__ = "principio_activo"
    id: Mapped[int] = mapped_column(primary_key=True)


class Presentacion(CatalogoMixin, Base):
    __tablename__ = "presentacion"
    id: Mapped[int] = mapped_column(primary_key=True)


class UnidadMedida(CatalogoMixin, Base):
    __tablename__ = "unidad_medida"
    id: Mapped[int] = mapped_column(primary_key=True)
    abreviatura: Mapped[str] = mapped_column(String(10), nullable=False)


# ===================== Producto =====================
class Producto(Base):
    __tablename__ = "producto"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(50), nullable=False)
    codigo_normalizado: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    concentracion: Mapped[str | None] = mapped_column(String(50))  

    id_categoria: Mapped[int] = mapped_column(ForeignKey("categoria.id"), nullable=False)
    id_laboratorio: Mapped[int] = mapped_column(ForeignKey("laboratorio.id"), nullable=False)
    id_principio_activo: Mapped[int | None] = mapped_column(ForeignKey("principio_activo.id"))
    id_presentacion: Mapped[int] = mapped_column(ForeignKey("presentacion.id"), nullable=False)
    id_unidad_medida: Mapped[int] = mapped_column(ForeignKey("unidad_medida.id"), nullable=False)

    precio_compra: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    precio_venta: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    stock_minimo: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    stock_maximo: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)  # 0 = sin máximo

    requiere_receta: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    categoria: Mapped["Categoria"] = relationship()
    laboratorio: Mapped["Laboratorio"] = relationship()
    principio_activo: Mapped["PrincipioActivo | None"] = relationship()
    presentacion: Mapped["Presentacion"] = relationship()
    unidad_medida: Mapped["UnidadMedida"] = relationship()

    __table_args__ = (
        CheckConstraint("precio_compra >= 0", name="precio_compra"),
        CheckConstraint("precio_venta >= 0", name="precio_venta"),
        CheckConstraint("stock_minimo >= 0", name="stock_minimo"),
        CheckConstraint("stock_maximo >= 0", name="stock_maximo"),
        CheckConstraint("stock_maximo = 0 OR stock_minimo <= stock_maximo", name="min_max"),
    )


@event.listens_for(Producto, "before_insert")
@event.listens_for(Producto, "before_update")
def _sincronizar_codigo(mapper, connection, target):
    """Antes de guardar, limpia el código y calcula su clave única."""
    target.codigo = limpiar_texto(target.codigo, campo="El código")
    target.codigo_normalizado = normalizar_codigo(target.codigo)