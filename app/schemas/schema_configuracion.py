from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.schema_comun import Correo, ORMBase, Referencia, Telefono, TextoObligatorio, TextoOpcional


class ConfiguracionUpdate(BaseModel):
    nombre_negocio: Annotated[TextoObligatorio, Field(max_length=100)]
    nit: Annotated[TextoOpcional, Field(max_length=20)] = None
    direccion: Annotated[TextoOpcional, Field(max_length=255)] = None
    telefono: Telefono = None
    correo: Correo = None
    iva_porcentaje: Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]
    moneda: Annotated[TextoObligatorio, Field(max_length=10)]
    dias_alerta_vencimiento: Annotated[int, Field(ge=0, le=365)]
    id_ubicacion_defecto: int | None = None


class ConfiguracionResponse(ORMBase):
    nombre_negocio: str
    nit: str | None
    direccion: str | None
    telefono: str | None
    correo: str | None
    iva_porcentaje: Decimal
    moneda: str
    dias_alerta_vencimiento: int
    ubicacion_defecto: Referencia | None
    fecha_actualizacion: datetime


class BitacoraResponse(BaseModel):
    id: int
    fecha: datetime
    accion: str
    modulo: str
    detalle: str | None
    ip: str | None
    usuario: str | None   # None en intentos con un usuario que no existe