from typing import Annotated, Literal

from pydantic import Field

from app.schemas.schema_comun import CatalogoCreate, CatalogoResponse, Telefono, TextoOpcional


class UbicacionCreate(CatalogoCreate):
    tipo: Literal["Sucursal", "Bodega"] = "Sucursal"
    direccion: Annotated[TextoOpcional, Field(max_length=255)] = None
    telefono: Telefono = None


class UbicacionUpdate(UbicacionCreate):
    pass


class UbicacionResponse(CatalogoResponse):
    tipo: str
    direccion: str | None
    telefono: str | None