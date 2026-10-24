from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.schema_comun import CantidadPositiva, TextoObligatorio, TextoOpcional


def revisar_vencimiento(fecha: date | None) -> None:
    """No se ingresa mercadería que ya venció o vence hoy."""
    if fecha is not None and fecha <= date.today():
        raise PydanticCustomError("vencimiento", "La fecha de vencimiento debe ser posterior a hoy")


class ExistenciaResponse(BaseModel):
    """Cuánto hay de un lote en una ubicación."""
    id: int
    id_lote: int
    numero_lote: str
    fecha_vencimiento: date
    id_producto: int
    codigo: str
    producto: str
    id_ubicacion: int
    ubicacion: str
    cantidad: Decimal


class LoteResponse(BaseModel):
    id: int
    numero_lote: str
    fecha_vencimiento: date
    costo_unitario: Decimal
    id_producto: int
    codigo: str
    producto: str
    stock: Decimal


class MovimientoCreate(BaseModel):
    """Movimiento manual. Si es Entrada de un lote nuevo, hace falta su fecha de vencimiento."""
    id_producto: int
    id_ubicacion: int
    tipo: Literal["Entrada", "Salida"]
    numero_lote: Annotated[TextoObligatorio, Field(max_length=50)]
    fecha_vencimiento: date | None = None
    cantidad: CantidadPositiva
    referencia: Annotated[TextoOpcional, Field(max_length=100)] = None
    observaciones: TextoObligatorio   # el motivo es obligatorio en un movimiento manual

    @model_validator(mode="after")
    def _revisar(self):
        if self.tipo == "Entrada":
            revisar_vencimiento(self.fecha_vencimiento)
        return self


class MovimientoResponse(BaseModel):
    id: int
    fecha: datetime
    tipo: str
    origen: str
    cantidad: Decimal
    referencia: str | None
    observaciones: str | None
    numero_lote: str
    codigo: str
    producto: str
    ubicacion: str
    usuario: str