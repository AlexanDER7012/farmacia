from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import Empleado, Rol, Usuario
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina
from app.schemas.schema_usuario import (
    RestablecerPassword, UsuarioCreate, UsuarioResponse, UsuarioUpdate,
)
from app.security import hash_password, obtener_ip, requiere_rol
from app.validaciones import validar_password

router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])
solo_admin = requiere_rol()


def _obtener(db: Session, id_usuario: int) -> Usuario:
    usuario = db.get(Usuario, id_usuario)
    if usuario is None:
        raise HTTPException(status_code=404, detail="No se encontró el usuario")
    return usuario


def _no_a_si_mismo(objetivo: Usuario, actual: Usuario, accion: str) -> None:
    if objetivo.id == actual.id:
        raise HTTPException(status_code=400, detail=f"No puedes {accion} tu propio usuario")


@router.get("", response_model=Pagina[UsuarioResponse])
def listar(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    consulta = (
        select(Usuario)
        .join(Empleado, Usuario.id_empleado == Empleado.id)
        .options(selectinload(Usuario.rol), selectinload(Usuario.empleado))
        .order_by(Usuario.nombre_usuario)
    )
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Usuario.nombre_usuario.icontains(texto, autoescape=True),
            Empleado.nombres.icontains(texto, autoescape=True),
            Empleado.apellidos.icontains(texto, autoescape=True),
        ))
    if activo is not None:
        consulta = consulta.where(Usuario.activo == activo)
    return paginar(db, consulta, paginacion, UsuarioResponse)


@router.get("/{id_usuario}", response_model=UsuarioResponse)
def obtener(id_usuario: int, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    return _obtener(db, id_usuario)


@router.post("", response_model=UsuarioResponse, status_code=201)
def crear(
    datos: UsuarioCreate,
    request: Request,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(solo_admin),
):
    empleado = db.get(Empleado, datos.id_empleado)
    if empleado is None:
        raise HTTPException(status_code=404, detail="No se encontró el empleado")
    if not empleado.activo:
        raise HTTPException(status_code=400, detail="El empleado está inactivo")
    if empleado.usuario is not None:
        raise HTTPException(status_code=409, detail="Ese empleado ya tiene un usuario")

    obtener_activo(db, Rol, datos.id_rol, "el rol")

    if db.scalars(select(Usuario).where(Usuario.nombre_usuario == datos.nombre_usuario)).first():
        raise HTTPException(status_code=409, detail=f"El nombre de usuario '{datos.nombre_usuario}' ya existe")

    usuario = Usuario(
        id_empleado=empleado.id,
        nombre_usuario=datos.nombre_usuario,
        password_hash=hash_password(datos.password),
        id_rol=datos.id_rol,
    )
    db.add(usuario)
    registrar_actividad(db, "CREAR", "Usuarios",
                        f"Creó el usuario '{usuario.nombre_usuario}' para {empleado.nombres} {empleado.apellidos}",
                        id_usuario=actual.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(usuario)
    return usuario


@router.put("/{id_usuario}", response_model=UsuarioResponse)
def editar(
    id_usuario: int,
    datos: UsuarioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(solo_admin),
):
    usuario = _obtener(db, id_usuario)
    if datos.id_rol != usuario.id_rol:
        _no_a_si_mismo(usuario, actual, "cambiar el rol de")
        rol = obtener_activo(db, Rol, datos.id_rol, "el rol")
        anterior = usuario.rol.nombre
        usuario.id_rol = rol.id
        registrar_actividad(db, "EDITAR", "Usuarios",
                            f"Cambió el rol de '{usuario.nombre_usuario}' de {anterior} a {rol.nombre}",
                            id_usuario=actual.id, ip=obtener_ip(request))
        db.commit()
        db.refresh(usuario)
    return usuario


@router.patch("/{id_usuario}/desactivar", response_model=Mensaje)
def desactivar(id_usuario: int, request: Request, db: Session = Depends(get_db), actual: Usuario = Depends(solo_admin)):
    usuario = _obtener(db, id_usuario)
    _no_a_si_mismo(usuario, actual, "desactivar")
    if not usuario.activo:
        raise HTTPException(status_code=400, detail="El usuario ya está inactivo")
    usuario.activo = False
    registrar_actividad(db, "DESACTIVAR", "Usuarios", f"Desactivó el usuario '{usuario.nombre_usuario}'",
                        id_usuario=actual.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se desactivó el usuario '{usuario.nombre_usuario}'")


@router.patch("/{id_usuario}/reactivar", response_model=Mensaje)
def reactivar(id_usuario: int, request: Request, db: Session = Depends(get_db), actual: Usuario = Depends(solo_admin)):
    usuario = _obtener(db, id_usuario)
    if usuario.activo:
        raise HTTPException(status_code=400, detail="El usuario ya está activo")
    usuario.activo = True
    registrar_actividad(db, "REACTIVAR", "Usuarios", f"Reactivó el usuario '{usuario.nombre_usuario}'",
                        id_usuario=actual.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se reactivó el usuario '{usuario.nombre_usuario}'")


@router.patch("/{id_usuario}/desbloquear", response_model=Mensaje)
def desbloquear(id_usuario: int, request: Request, db: Session = Depends(get_db), actual: Usuario = Depends(solo_admin)):
    usuario = _obtener(db, id_usuario)
    if not usuario.bloqueado:
        raise HTTPException(status_code=400, detail="El usuario no está bloqueado")
    usuario.intentos_fallidos = 0
    registrar_actividad(db, "EDITAR", "Usuarios", f"Desbloqueó el usuario '{usuario.nombre_usuario}'",
                        id_usuario=actual.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se desbloqueó el usuario '{usuario.nombre_usuario}'")


@router.patch("/{id_usuario}/restablecer-password", response_model=Mensaje)
def restablecer_password(
    id_usuario: int,
    datos: RestablecerPassword,
    request: Request,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(solo_admin),
):
    """El administrador le pone una contraseña nueva a un usuario que la olvidó."""
    usuario = _obtener(db, id_usuario)
    try:
        validar_password(datos.password_nueva, usuario.nombre_usuario)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    usuario.password_hash = hash_password(datos.password_nueva)
    usuario.intentos_fallidos = 0
    registrar_actividad(db, "EDITAR", "Usuarios", f"Restableció la contraseña de '{usuario.nombre_usuario}'",
                        id_usuario=actual.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se restableció la contraseña de '{usuario.nombre_usuario}'")