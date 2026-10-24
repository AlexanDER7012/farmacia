from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.schema_comun import ORMBase, Referencia
from app.validaciones import validar_password

# Solo minúsculas, números, punto y guion bajo. De 3 a 50 caracteres.
NombreUsuario = Annotated[str, Field(pattern=r"^[a-z0-9._]{3,50}$")]


def _revisar_password(password: str, nombre_usuario: str | None = None) -> None:
    try:
        validar_password(password, nombre_usuario)
    except ValueError as e:
        raise PydanticCustomError("password_invalida", str(e))


class UsuarioCreate(BaseModel):
    id_empleado: int
    nombre_usuario: NombreUsuario
    password: str
    id_rol: int

    @model_validator(mode="before")
    @classmethod
    def _minusculas(cls, datos):
        if isinstance(datos, dict) and isinstance(datos.get("nombre_usuario"), str):
            datos["nombre_usuario"] = datos["nombre_usuario"].strip().lower()
        return datos

    @model_validator(mode="after")
    def _validar_password(self):
        _revisar_password(self.password, self.nombre_usuario)
        return self


class UsuarioUpdate(BaseModel):
    """Lo que el administrador puede cambiar de un usuario."""
    id_rol: int


class CambioPassword(BaseModel):
    password_actual: str
    password_nueva: str

    @model_validator(mode="after")
    def _validar(self):
        _revisar_password(self.password_nueva)
        if self.password_actual == self.password_nueva:
            raise PydanticCustomError("password_igual", "La contraseña nueva debe ser distinta de la actual")
        return self


class RestablecerPassword(BaseModel):
    """El administrador le pone una contraseña nueva a un usuario que la olvidó."""
    password_nueva: str


class EmpleadoResumen(ORMBase):
    id: int
    nombres: str
    apellidos: str


class UsuarioResponse(ORMBase):
    id: int
    nombre_usuario: str
    activo: bool
    bloqueado: bool
    ultimo_acceso: datetime | None
    rol: Referencia
    empleado: EmpleadoResumen