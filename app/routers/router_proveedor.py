from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.database import get_db
from app.models import Proveedor, Usuario
from app.models.model_usuario import ROL_BODEGUERO
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina, Referencia
from app.schemas.schema_compra import ProveedorCreate, ProveedorResponse, ProveedorUpdate
from app.security import get_current_user, obtener_ip, requiere_rol
from app.validaciones import clave_nit

router = APIRouter(prefix="/api/proveedores", tags=["Proveedores"])
puede_editar = requiere_rol(ROL_BODEGUERO)


def _obtener(db: Session, id_proveedor: int) -> Proveedor:
    proveedor = db.get(Proveedor, id_proveedor)
    if proveedor is None:
        raise HTTPException(status_code=404, detail="No se encontró el proveedor")
    return proveedor


def _revisar_nit_unico(db: Session, nit: str, excluir_id: int | None = None) -> None:
    clave = clave_nit(nit)
    if clave is None:  # CF se puede repetir
        return
    consulta = select(Proveedor).where(Proveedor.nit_unico == clave)
    if excluir_id is not None:
        consulta = consulta.where(Proveedor.id != excluir_id)
    existente = db.scalars(consulta).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe un proveedor con ese NIT ({existente.nombre})")


@router.get("", response_model=Pagina[ProveedorResponse])
def listar(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    consulta = select(Proveedor).order_by(Proveedor.nombre)
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Proveedor.nombre.icontains(texto, autoescape=True),
            Proveedor.nit.icontains(texto, autoescape=True),
        ))
    if activo is not None:
        consulta = consulta.where(Proveedor.activo == activo)
    return paginar(db, consulta, paginacion, ProveedorResponse)


@router.get("/opciones", response_model=list[Referencia])
def opciones(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return db.scalars(select(Proveedor).where(Proveedor.activo.is_(True)).order_by(Proveedor.nombre)).all()


@router.get("/{id_proveedor}", response_model=ProveedorResponse)
def obtener(id_proveedor: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return _obtener(db, id_proveedor)


@router.post("", response_model=ProveedorResponse, status_code=201)
def crear(datos: ProveedorCreate, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    _revisar_nit_unico(db, datos.nit)
    proveedor = Proveedor(**datos.model_dump())
    db.add(proveedor)
    registrar_actividad(db, "CREAR", "Proveedores", f"Registró al proveedor '{proveedor.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.put("/{id_proveedor}", response_model=ProveedorResponse)
def editar(
    id_proveedor: int,
    datos: ProveedorUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_editar),
):
    proveedor = _obtener(db, id_proveedor)
    _revisar_nit_unico(db, datos.nit, excluir_id=proveedor.id)
    for campo, valor in datos.model_dump().items():
        setattr(proveedor, campo, valor)
    registrar_actividad(db, "EDITAR", "Proveedores", f"Editó al proveedor '{proveedor.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.patch("/{id_proveedor}/desactivar", response_model=Mensaje)
def desactivar(id_proveedor: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    proveedor = _obtener(db, id_proveedor)
    if not proveedor.activo:
        raise HTTPException(status_code=400, detail="El proveedor ya está inactivo")
    proveedor.activo = False
    registrar_actividad(db, "DESACTIVAR", "Proveedores", f"Desactivó al proveedor '{proveedor.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se desactivó a '{proveedor.nombre}'")


@router.patch("/{id_proveedor}/reactivar", response_model=Mensaje)
def reactivar(id_proveedor: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    proveedor = _obtener(db, id_proveedor)
    if proveedor.activo:
        raise HTTPException(status_code=400, detail="El proveedor ya está activo")
    proveedor.activo = True
    registrar_actividad(db, "REACTIVAR", "Proveedores", f"Reactivó al proveedor '{proveedor.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se reactivó a '{proveedor.nombre}'")