from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import Empleado, Puesto, Ubicacion, Usuario
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina, Referencia
from app.schemas.schema_empleado import EmpleadoCreate, EmpleadoResponse, EmpleadoUpdate
from app.security import obtener_ip, requiere_rol
from app.validaciones import validar_dpi

router = APIRouter(prefix="/api/empleados", tags=["Empleados"])
solo_admin = requiere_rol()


def _obtener(db: Session, id_empleado: int) -> Empleado:
    empleado = db.get(Empleado, id_empleado)
    if empleado is None:
        raise HTTPException(status_code=404, detail="No se encontró el empleado")
    return empleado


def _revisar_dpi_unico(db: Session, dpi: str, excluir_id: int | None = None) -> None:
    consulta = select(Empleado).where(Empleado.dpi == dpi)
    if excluir_id is not None:
        consulta = consulta.where(Empleado.id != excluir_id)
    existente = db.scalars(consulta).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un empleado con ese DPI ({existente.nombres} {existente.apellidos})",
        )


def _nombre(e: Empleado) -> str:
    return f"{e.nombres} {e.apellidos}"


@router.get("", response_model=Pagina[EmpleadoResponse])
def listar(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    consulta = (
        select(Empleado)
        .options(selectinload(Empleado.puesto), selectinload(Empleado.ubicacion))
        .order_by(Empleado.nombres, Empleado.apellidos)
    )
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Empleado.nombres.icontains(texto, autoescape=True),
            Empleado.apellidos.icontains(texto, autoescape=True),
            Empleado.dpi.contains(texto, autoescape=True),
        ))
    if activo is not None:
        consulta = consulta.where(Empleado.activo == activo)
    return paginar(db, consulta, paginacion, EmpleadoResponse)


@router.get("/sin-usuario", response_model=list[Referencia])
def sin_usuario(db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    """Empleados activos que todavía no tienen usuario (para el formulario de usuarios)."""
    empleados = db.scalars(
        select(Empleado)
        .outerjoin(Usuario, Usuario.id_empleado == Empleado.id)
        .where(Empleado.activo.is_(True), Usuario.id.is_(None))
        .order_by(Empleado.nombres, Empleado.apellidos)
    ).all()
    return [Referencia(id=e.id, nombre=_nombre(e)) for e in empleados]


@router.get("/{id_empleado}", response_model=EmpleadoResponse)
def obtener(id_empleado: int, db: Session = Depends(get_db), _: Usuario = Depends(solo_admin)):
    return _obtener(db, id_empleado)


@router.post("", response_model=EmpleadoResponse, status_code=201)
def crear(
    datos: EmpleadoCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(solo_admin),
):
    obtener_activo(db, Puesto, datos.id_puesto, "el puesto")
    obtener_activo(db, Ubicacion, datos.id_ubicacion, "la ubicación")
    _revisar_dpi_unico(db, datos.dpi)

    empleado = Empleado(**datos.model_dump())
    db.add(empleado)
    registrar_actividad(db, "CREAR", "Empleados", f"Registró al empleado '{_nombre(empleado)}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(empleado)
    return empleado


@router.put("/{id_empleado}", response_model=EmpleadoResponse)
def editar(
    id_empleado: int,
    datos: EmpleadoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(solo_admin),
):
    empleado = _obtener(db, id_empleado)
    valores = datos.model_dump()

    # El DPI solo se valida si cambió: los que ya estaban guardados no se tocan
    if valores["dpi"] != empleado.dpi:
        try:
            valores["dpi"] = validar_dpi(valores["dpi"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        _revisar_dpi_unico(db, valores["dpi"], excluir_id=empleado.id)

    if valores["id_puesto"] != empleado.id_puesto:
        obtener_activo(db, Puesto, valores["id_puesto"], "el puesto")
    if valores["id_ubicacion"] != empleado.id_ubicacion:
        obtener_activo(db, Ubicacion, valores["id_ubicacion"], "la ubicación")

    for campo, valor in valores.items():
        setattr(empleado, campo, valor)

    registrar_actividad(db, "EDITAR", "Empleados", f"Editó al empleado '{_nombre(empleado)}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(empleado)
    return empleado


@router.patch("/{id_empleado}/desactivar", response_model=Mensaje)
def desactivar(
    id_empleado: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(solo_admin),
):
    empleado = _obtener(db, id_empleado)
    if empleado.id == usuario.id_empleado:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    if not empleado.activo:
        raise HTTPException(status_code=400, detail="El empleado ya está inactivo")

    empleado.activo = False
    registrar_actividad(db, "DESACTIVAR", "Empleados", f"Desactivó al empleado '{_nombre(empleado)}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    aviso = "Su usuario ya no podrá iniciar sesión" if empleado.usuario else None
    return Mensaje(mensaje=f"Se desactivó a '{_nombre(empleado)}'", aviso=aviso)


@router.patch("/{id_empleado}/reactivar", response_model=Mensaje)
def reactivar(
    id_empleado: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(solo_admin),
):
    empleado = _obtener(db, id_empleado)
    if empleado.activo:
        raise HTTPException(status_code=400, detail="El empleado ya está activo")

    empleado.activo = True
    registrar_actividad(db, "REACTIVAR", "Empleados", f"Reactivó al empleado '{_nombre(empleado)}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se reactivó a '{_nombre(empleado)}'")