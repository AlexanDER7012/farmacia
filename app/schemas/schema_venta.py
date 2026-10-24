from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.schema_comun import (
    CantidadPositiva, Correo, MontoNoNegativo, Nit, ORMBase,
    Referencia, Telefono, TextoObligatorio, TextoOpcional,
)
from app.schemas.schema_compra import UsuarioRef


# ===================== Cliente =====================
class ClienteCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=150)]
    nit: Annotated[Nit, Field(max_length=20)] = "CF"
    telefono: Telefono = None
    correo: Correo = None
    direccion: Annotated[TextoOpcional, Field(max_length=255)] = None


class ClienteUpdate(ClienteCreate):
    pass


class ClienteResponse(ORMBase):
    id: int
    nombre: str
    nit: str
    telefono: str | None
    correo: str | None
    direccion: str | None
    activo: bool


# ===================== Venta =====================
class DetalleVentaCreate(BaseModel):
    id_producto: int
    id_lote: int
    cantidad: CantidadPositiva


class VentaCreate(BaseModel):
    id_cliente: int | None = None   # vacío = Consumidor Final
    nit: Annotated[TextoOpcional, Field(max_length=20)] = None   # vacío = el NIT del cliente
    id_tipo_pago: int
    descuento: MontoNoNegativo = Decimal("0")
    observaciones: TextoOpcional = None
    detalles: list[DetalleVentaCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def _sin_repetidos(self):
        vistos = set()
        for d in self.detalles:
            clave = (d.id_producto, d.id_lote)
            if clave in vistos:
                raise PydanticCustomError(
                    "detalle_repetido", "Hay un producto con el mismo lote repetido; suma las cantidades en una sola línea"
                )
            vistos.add(clave)
        return self


class AnularVenta(BaseModel):
    motivo: TextoObligatorio


class LoteRef(ORMBase):
    id: int
    numero_lote: str
    fecha_vencimiento: date


class LoteDisponible(BaseModel):
    """Lote con stock en la ubicación de venta, ordenados del que vence primero al último."""
    id: int
    numero_lote: str
    fecha_vencimiento: date
    cantidad: Decimal


class DetalleVentaResponse(ORMBase):
    id: int
    producto: Referencia
    lote: LoteRef
    cantidad: Decimal
    precio_unitario: Decimal
    subtotal: Decimal


class VentaResumen(ORMBase):
    id: int
    fecha: datetime
    nit: str
    subtotal: Decimal
    descuento: Decimal
    total: Decimal
    estado: str
    cliente: Referencia
    tipo_pago: Referencia
    ubicacion: Referencia
    usuario: UsuarioRef


class VentaResponse(VentaResumen):
    observaciones: str | None
    motivo_anulacion: str | None
    detalles: list[DetalleVentaResponse]