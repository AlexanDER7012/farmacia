from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.schema_comun import (
    Correo, Dpi, MontoNoNegativo, ORMBase, Referencia,
    Telefono, TextoObligatorio, TextoOpcional,
)


class EmpleadoCreate(BaseModel):
    nombres: Annotated[TextoObligatorio, Field(max_length=100)]
    apellidos: Annotated[TextoObligatorio, Field(max_length=100)]
    dpi: Dpi
    telefono: Telefono = None
    correo: Correo = None
    direccion: Annotated[TextoOpcional, Field(max_length=255)] = None
    fecha_contratacion: date | None = None
    salario: MontoNoNegativo = Decimal("0")
    id_puesto: int
    id_ubicacion: int


class EmpleadoUpdate(EmpleadoCreate):
    dpi: TextoObligatorio


class EmpleadoResponse(ORMBase):
    id: int
    nombres: str
    apellidos: str
    dpi: str
    telefono: str | None
    correo: str | None
    direccion: str | None
    fecha_contratacion: date | None
    salario: Decimal
    activo: bool
    puesto: Referencia
    ubicacion: Referencia