from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.schema_comun import (
    CatalogoCreate, CatalogoResponse, ORMBase, Referencia,
    TextoObligatorio, TextoOpcional,
)

# Mismo tamaño que las columnas NUMERIC(10,2) de la tabla producto
ValorNoNegativo = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


# ===================== Unidad de medida =====================
class UnidadMedidaCreate(CatalogoCreate):
    abreviatura: Annotated[TextoObligatorio, Field(max_length=10)]


class UnidadMedidaUpdate(UnidadMedidaCreate):
    pass


class UnidadMedidaResponse(CatalogoResponse):
    abreviatura: str


# ===================== Producto =====================
class ProductoCreate(BaseModel):
    codigo: Annotated[TextoObligatorio, Field(max_length=50)]
    nombre: Annotated[TextoObligatorio, Field(max_length=150)]
    descripcion: TextoOpcional = None
    concentracion: Annotated[TextoOpcional, Field(max_length=50)] = None
    id_categoria: int
    id_laboratorio: int
    id_principio_activo: int | None = None
    id_presentacion: int
    id_unidad_medida: int
    precio_compra: ValorNoNegativo = Decimal("0")
    precio_venta: ValorNoNegativo = Decimal("0")
    stock_minimo: ValorNoNegativo = Decimal("0")
    stock_maximo: ValorNoNegativo = Decimal("0")   # 0 = sin máximo
    requiere_receta: bool = False

    @model_validator(mode="after")
    def _revisar_stock(self):
        if self.stock_maximo > 0 and self.stock_minimo > self.stock_maximo:
            raise PydanticCustomError(
                "stock_min_max", "El stock mínimo no puede ser mayor que el stock máximo"
            )
        return self


class ProductoUpdate(ProductoCreate):
    pass


class ProductoResponse(ORMBase):
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    concentracion: str | None
    precio_compra: Decimal
    precio_venta: Decimal
    stock_minimo: Decimal
    stock_maximo: Decimal
    requiere_receta: bool
    activo: bool
    categoria: Referencia
    laboratorio: Referencia
    principio_activo: Referencia | None
    presentacion: Referencia
    unidad_medida: Referencia
    stock_total: Decimal = Decimal("0")  
    aviso: str | None = None       