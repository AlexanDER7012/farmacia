from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.config import settings
from app.database import get_db
from app.models.model_usuario import ROL_ADMINISTRADOR, Usuario
from app.validaciones import normalizar


# ===================================================================
# CONTRASEÑAS
# ===================================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# Hash de relleno: si el usuario no existe se compara igual contra algo,
# así la respuesta tarda lo mismo y no se puede adivinar qué usuarios existen.
_HASH_RELLENO = hash_password("relleno-no-es-una-contraseña")


# ===================================================================
# TOKEN Y COOKIE
# ===================================================================
def crear_token(id_usuario: int) -> str:
    ahora = datetime.now(timezone.utc)
    datos = {
        "sub": str(id_usuario),
        "iat": ahora,
        "exp": ahora + timedelta(minutes=settings.SESSION_INACTIVITY_MINUTES),
    }
    return jwt.encode(datos, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def leer_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise _no_autenticado("Tu sesión expiró por inactividad. Inicia sesión de nuevo.")
    except jwt.InvalidTokenError:
        raise _no_autenticado("Sesión no válida. Inicia sesión de nuevo.")


def poner_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_INACTIVITY_MINUTES * 60,
        httponly=True,                   # JavaScript no la puede leer
        secure=settings.COOKIE_SECURE,   # solo por HTTPS en producción
        samesite="strict",               # no se envía desde otros sitios
        path="/",
    )


def borrar_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.COOKIE_NAME, path="/")


def _no_autenticado(mensaje: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=mensaje)


def obtener_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# ===================================================================
# LOGIN
# ===================================================================
def usuario_bloqueado(usuario: Usuario) -> bool:
    return usuario.intentos_fallidos >= settings.MAX_LOGIN_ATTEMPTS


def autenticar(db: Session, nombre_usuario: str, password: str, ip: str | None = None) -> Usuario:
    """
    Devuelve el usuario si todo está bien. Si no, registra el intento en la
    bitácora, guarda y lanza el error. El mensaje es genérico para no revelar
    si lo que falló fue el usuario o la contraseña.
    """
    nombre = (nombre_usuario or "").strip().lower()
    error_generico = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")

    usuario = db.scalars(select(Usuario).where(Usuario.nombre_usuario == nombre)).first()

    if usuario is None:
        verify_password(password or "", _HASH_RELLENO)
        registrar_actividad(db, "LOGIN_FALLIDO", "Autenticación",
                            f"Intento con un usuario que no existe: '{nombre[:50]}'", ip=ip)
        db.commit()
        raise error_generico

    if usuario_bloqueado(usuario):
        registrar_actividad(db, "LOGIN_FALLIDO", "Autenticación",
                            "Intento de ingreso con el usuario bloqueado", id_usuario=usuario.id, ip=ip)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario bloqueado por demasiados intentos fallidos. Contacta al administrador.",
        )

    if not verify_password(password or "", usuario.password_hash):
        usuario.intentos_fallidos += 1
        registrar_actividad(db, "LOGIN_FALLIDO", "Autenticación",
                            f"Contraseña incorrecta (intento {usuario.intentos_fallidos})",
                            id_usuario=usuario.id, ip=ip)
        db.commit()
        if usuario_bloqueado(usuario):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario bloqueado por demasiados intentos fallidos. Contacta al administrador.",
            )
        raise error_generico

    # La contraseña es correcta: se revisa si puede entrar
    if not usuario.activo or not usuario.empleado.activo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="El usuario está inactivo")

    usuario.intentos_fallidos = 0
    usuario.ultimo_acceso = datetime.now()
    registrar_actividad(db, "LOGIN", "Autenticación", "Inició sesión", id_usuario=usuario.id, ip=ip)
    db.commit()
    return usuario


# ===================================================================
# DEPENDENCIAS PARA LOS ROUTERS
# ===================================================================
def get_current_user(request: Request, response: Response, db: Session = Depends(get_db)) -> Usuario:
    """
    Exige sesión iniciada. En cada petición válida renueva la cookie,
    así la sesión solo vence tras 15 minutos SIN actividad.
    """
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise _no_autenticado("Debes iniciar sesión")

    datos = leer_token(token)
    usuario = db.get(Usuario, int(datos.get("sub", 0)))

    if (
        usuario is None
        or not usuario.activo
        or not usuario.empleado.activo
        or usuario_bloqueado(usuario)
    ):
        raise _no_autenticado("Tu sesión ya no es válida. Inicia sesión de nuevo.")

    poner_cookie(response, crear_token(usuario.id))
    return usuario


def requiere_rol(*roles: str):
    """
    Uso en un router:
        usuario = Depends(requiere_rol("Vendedor"))
    El Administrador siempre tiene acceso. Si el rol no está permitido,
    el servidor responde 403 aunque llamen el endpoint directo.
    """
    permitidos = {normalizar(r) for r in roles} | {normalizar(ROL_ADMINISTRADOR)}

    def _dependencia(usuario: Usuario = Depends(get_current_user)) -> Usuario:
        if usuario.rol.nombre_normalizado not in permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para realizar esta acción",
            )
        return usuario

    return _dependencia