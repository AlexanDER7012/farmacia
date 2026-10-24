from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    Integer, Numeric, String, func, true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.catalogos import CatalogoMixin
from app.database import Base

if TYPE_CHECKING:
    from app.models.model_ubicacion import Ubicacion

# Nombres de los roles que usa el sistema para dar acceso
ROL_ADMINISTRADOR = "Administrador"
ROL_VENDEDOR = "Vendedor"
ROL_BODEGUERO = "Bodeguero"


class Rol(CatalogoMixin, Base):
    __tablename__ = "rol"

    id: Mapped[int] = mapped_column(primary_key=True)

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="rol")


class Puesto(CatalogoMixin, Base):
    __tablename__ = "puesto"

    id: Mapped[int] = mapped_column(primary_key=True)

    empleados: Mapped[list["Empleado"]] = relationship(back_populates="puesto")


class Empleado(Base):
    __tablename__ = "empleado"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombres: Mapped[str] = mapped_column(String(100), nullable=False)
    apellidos: Mapped[str] = mapped_column(String(100), nullable=False)
    dpi: Mapped[str] = mapped_column(String(13), nullable=False, unique=True)
    telefono: Mapped[str | None] = mapped_column(String(9))
    correo: Mapped[str | None] = mapped_column(String(100))
    direccion: Mapped[str | None] = mapped_column(String(255))
    fecha_contratacion: Mapped[date | None] = mapped_column(Date)
    salario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    id_puesto: Mapped[int] = mapped_column(ForeignKey("puesto.id"), nullable=False)
    id_ubicacion: Mapped[int] = mapped_column(ForeignKey("ubicacion.id"), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    puesto: Mapped["Puesto"] = relationship(back_populates="empleados")
    ubicacion: Mapped["Ubicacion"] = relationship()
    usuario: Mapped["Usuario | None"] = relationship(back_populates="empleado", uselist=False)

    __table_args__ = (
        CheckConstraint("salario >= 0", name="salario"),
    )


class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_empleado: Mapped[int] = mapped_column(ForeignKey("empleado.id"), nullable=False, unique=True)
    nombre_usuario: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    id_rol: Mapped[int] = mapped_column(ForeignKey("rol.id"), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    intentos_fallidos: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    empleado: Mapped["Empleado"] = relationship(back_populates="usuario")
    rol: Mapped["Rol"] = relationship(back_populates="usuarios")

    __table_args__ = (
        CheckConstraint("intentos_fallidos >= 0", name="intentos"),
    )