from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, computed_field

from app.schemas.schema_comun import MontoNoNegativo, MontoPositivo, ORMBase, Referencia, TextoObligatorio, TextoOpcional
from app.schemas.schema_compra import UsuarioRef


# ===================== Turno de caja =====================
class AbrirTurno(BaseModel):
    fondo_inicial: MontoNoNegativo
    observaciones: TextoOpcional = None


class CerrarTurno(BaseModel):
    total_contado: MontoNoNegativo
    observaciones: TextoOpcional = None


class TurnoResponse(ORMBase):
    id: int
    fecha_apertura: datetime
    fondo_inicial: Decimal
    fecha_cierre: datetime | None
    total_esperado: Decimal | None
    total_contado: Decimal | None
    diferencia: Decimal | None
    estado: str
    observaciones: str | None
    usuario: UsuarioRef
    ubicacion: Referencia


class ResumenTurno(BaseModel):
    """Cómo va el turno: lo vendido, lo gastado y el efectivo que debería haber."""
    turno: TurnoResponse
    cantidad_ventas: int
    ventas_efectivo: Decimal
    ventas_otros_pagos: Decimal
    gastos_de_caja: Decimal
    efectivo_esperado: Decimal


# ===================== Gasto =====================
class GastoCreate(BaseModel):
    concepto: Annotated[TextoObligatorio, Field(max_length=150)]
    monto: MontoPositivo
    de_caja: bool = True   # True = se paga con el efectivo del turno abierto
    observaciones: TextoOpcional = None


class AnularGasto(BaseModel):
    motivo: TextoObligatorio


class GastoResponse(ORMBase):
    id: int
    fecha: datetime
    concepto: str
    monto: Decimal
    anulado: bool
    observaciones: str | None
    ubicacion: Referencia
    usuario: UsuarioRef
    id_caja_turno: int | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def de_caja(self) -> bool:
        return self.id_caja_turno is not None