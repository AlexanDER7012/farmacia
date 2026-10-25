from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.schema_comun import (
    CantidadPositiva, Correo, Nit, ORMBase, Referencia, Telefono,
    TextoObligatorio, TextoOpcional, TextoOpcional50, TextoOpcional100, TextoOpcional255,
)
from app.schemas.schema_inventario import revisar_vencimiento

ValorNoNegativo = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


# ===================== Proveedor =====================
class ProveedorCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=150)]
    nit: Annotated[Nit, Field(max_length=20)]
    contacto: TextoOpcional100 = None
    telefono: Telefono = None
    correo: Correo = None
    direccion: TextoOpcional255 = None


class ProveedorUpdate(ProveedorCreate):
    pass


class ProveedorResponse(ORMBase):
    id: int
    nombre: str
    nit: str
    contacto: str | None
    telefono: str | None
    correo: str | None
    direccion: str | None
    activo: bool


# ===================== Compra =====================
class DetalleCompraCreate(BaseModel):
    id_producto: int
    numero_lote: Annotated[TextoObligatorio, Field(max_length=50)]
    fecha_vencimiento: date
    cantidad: CantidadPositiva
    costo_unitario: ValorNoNegativo

    @model_validator(mode="after")
    def _revisar(self):
        revisar_vencimiento(self.fecha_vencimiento)
        return self


class CompraCreate(BaseModel):
    id_proveedor: int
    id_ubicacion: int   # dónde va a entrar la mercadería
    numero_factura: TextoOpcional50 = None
    observaciones: TextoOpcional = None
    detalles: list[DetalleCompraCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def _sin_repetidos(self):
        vistos = set()
        for d in self.detalles:
            clave = (d.id_producto, " ".join(d.numero_lote.split()).upper())
            if clave in vistos:
                raise PydanticCustomError(
                    "detalle_repetido", "Hay un producto con el mismo lote repetido en el detalle"
                )
            vistos.add(clave)
        return self


class CancelarCompra(BaseModel):
    motivo: TextoObligatorio


class UsuarioRef(ORMBase):
    id: int
    nombre_usuario: str


class DetalleCompraResponse(ORMBase):
    id: int
    producto: Referencia
    numero_lote: str
    fecha_vencimiento: date
    cantidad: Decimal
    costo_unitario: Decimal
    subtotal: Decimal


class CompraResumen(ORMBase):
    id: int
    fecha: datetime
    numero_factura: str | None
    subtotal: Decimal
    iva: Decimal
    total: Decimal
    estado: str
    estado_pago: str
    fecha_recepcion: datetime | None
    proveedor: Referencia
    ubicacion: Referencia
    usuario: UsuarioRef


class CompraResponse(CompraResumen):
    observaciones: str | None
    detalles: list[DetalleCompraResponse]