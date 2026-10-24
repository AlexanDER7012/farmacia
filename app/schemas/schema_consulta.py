from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ClienteVista(BaseModel):
    id: int
    nombre: str
    nit: str
    telefono: str | None
    correo: str | None
    direccion: str | None
    activo: bool


class ProductoVista(BaseModel):
    id: int
    codigo: str
    nombre: str
    concentracion: str | None
    categoria: str
    laboratorio: str
    principio_activo: str | None
    presentacion: str
    unidad: str
    precio_compra: Decimal
    precio_venta: Decimal
    stock_minimo: Decimal
    requiere_receta: bool
    activo: bool
    stock_total: Decimal


class ExistenciaVista(BaseModel):
    id: int
    cantidad: Decimal
    id_lote: int
    numero_lote: str
    fecha_vencimiento: date
    id_producto: int
    codigo: str
    producto: str
    id_ubicacion: int
    ubicacion: str


class LotePorVencer(ExistenciaVista):
    dias_restantes: int
    vencido: bool


class StockBajo(BaseModel):
    id: int
    codigo: str
    nombre: str
    stock_total: Decimal
    stock_minimo: Decimal


class VentaDiaria(BaseModel):
    dia: date
    cantidad_ventas: int
    total: Decimal