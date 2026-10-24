from pydantic import BaseModel


class LoginRequest(BaseModel):
    nombre_usuario: str
    password: str


class UsuarioSesion(BaseModel):
    """Datos del usuario que inició sesión (para mostrar en el menú)."""
    id: int
    nombre_usuario: str
    nombre_completo: str
    rol: str
    ubicacion: str