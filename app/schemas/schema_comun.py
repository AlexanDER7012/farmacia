from datetime import date
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from app.validaciones import (
    limpiar_nit, limpiar_texto, validar_correo, validar_dpi,
    validar_rango_fechas, validar_telefono,
)


def _como_error_pydantic(funcion):
    """Convierte el ValueError de validaciones.py en un error de Pydantic con el mensaje limpio."""
    def envoltura(valor):
        try:
            return funcion(valor)
        except ValueError as e:
            raise PydanticCustomError("valor_invalido", str(e))
    return envoltura


# ===================== Tipos validados =====================
TextoObligatorio = Annotated[str, BeforeValidator(_como_error_pydantic(
    lambda v: limpiar_texto(v, obligatorio=True, campo="Este campo")
))]
TextoOpcional = Annotated[str | None, BeforeValidator(_como_error_pydantic(
    lambda v: limpiar_texto(v, obligatorio=False)
))]
Correo = Annotated[str | None, BeforeValidator(_como_error_pydantic(validar_correo))]
Telefono = Annotated[str | None, BeforeValidator(_como_error_pydantic(validar_telefono))]
Dpi = Annotated[str, BeforeValidator(_como_error_pydantic(validar_dpi))]
Nit = Annotated[str, BeforeValidator(limpiar_nit)]

MontoPositivo = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
MontoNoNegativo = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
CantidadPositiva = Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]


# ===================== Bases =====================
class ORMBase(BaseModel):
    """Base de las respuestas: permite crear el schema directo desde un modelo de SQLAlchemy."""
    model_config = ConfigDict(from_attributes=True)


class Referencia(ORMBase):
    """Forma corta de un registro relacionado (ej. la categoría de un producto)."""
    id: int
    nombre: str


class Mensaje(BaseModel):
    """Respuesta simple para acciones (dar de baja, reactivar...)."""
    mensaje: str
    aviso: str | None = None  


T = TypeVar("T")


class Pagina(BaseModel, Generic[T]):
    """Respuesta paginada de cualquier listado."""
    total: int
    pagina: int
    por_pagina: int
    items: list[T]


class FiltroFechas(BaseModel):
    desde: date | None = None
    hasta: date | None = None

    @model_validator(mode="after")
    def _revisar_rango(self):
        try:
            validar_rango_fechas(self.desde, self.hasta)
        except ValueError as e:
            raise PydanticCustomError("rango_fechas", str(e))
        return self


# ===================== Catálogos =====================
# Sirven para rol, puesto, categoría, laboratorio, principio activo,
# presentación y tipo de pago (todos tienen nombre y descripción).
class CatalogoCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=100)]
    descripcion: TextoOpcional = None


class CatalogoUpdate(CatalogoCreate):
    pass


class CatalogoResponse(ORMBase):
    id: int
    nombre: str
    descripcion: str | None
    activo: bool