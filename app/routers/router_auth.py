from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.config import settings
from app.database import get_db
from app.models.model_usuario import Usuario
from app.schemas.schema_auth import LoginRequest, UsuarioSesion
from app.schemas.schema_comun import Mensaje
from app.schemas.schema_usuario import CambioPassword
from app.security import (  
    autenticar, borrar_cookie, crear_token, get_current_user,
    hash_password, leer_token, obtener_ip, poner_cookie, verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


def _sesion(usuario: Usuario) -> UsuarioSesion:
    return UsuarioSesion(
        id=usuario.id,
        nombre_usuario=usuario.nombre_usuario,
        nombre_completo=f"{usuario.empleado.nombres} {usuario.empleado.apellidos}",
        rol=usuario.rol.nombre,
        ubicacion=usuario.empleado.ubicacion.nombre,
    )


@router.post("/login", response_model=UsuarioSesion)
def login(datos: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    usuario = autenticar(db, datos.nombre_usuario, datos.password, ip=obtener_ip(request))
    poner_cookie(response, crear_token(usuario.id))
    return _sesion(usuario)


@router.post("/logout", response_model=Mensaje)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    # Aunque la sesión ya haya vencido, se borra la cookie igual
    token = request.cookies.get(settings.COOKIE_NAME)
    if token:
        try:
            datos = leer_token(token)
            registrar_actividad(db, "LOGOUT", "Autenticación", "Cerró sesión",
                                id_usuario=int(datos["sub"]), ip=obtener_ip(request))
            db.commit()
        except HTTPException:
            pass
    borrar_cookie(response)
    return Mensaje(mensaje="Sesión cerrada")


@router.get("/me", response_model=UsuarioSesion)
def usuario_actual(usuario: Usuario = Depends(get_current_user)):
    return _sesion(usuario)


@router.post("/cambiar-password", response_model=Mensaje)
def cambiar_password(
    datos: CambioPassword,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    if not verify_password(datos.password_actual, usuario.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    if datos.password_nueva.casefold() == usuario.nombre_usuario.casefold():
        raise HTTPException(status_code=400, detail="La contraseña no puede ser igual al nombre de usuario")

    usuario.password_hash = hash_password(datos.password_nueva)
    registrar_actividad(db, "EDITAR", "Autenticación", "Cambió su contraseña",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje="Contraseña actualizada")