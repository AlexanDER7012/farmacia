from typing import Literal

from app.schemas.schema_comun import CatalogoCreate, CatalogoResponse, Telefono, TextoOpcional255


class UbicacionCreate(CatalogoCreate):
    tipo: Literal["Sucursal", "Bodega"] = "Sucursal"
    direccion: TextoOpcional255 = None
    telefono: Telefono = None


class UbicacionUpdate(UbicacionCreate):
    pass


class UbicacionResponse(CatalogoResponse):
    tipo: str
    direccion: str | None
    telefono: str | None