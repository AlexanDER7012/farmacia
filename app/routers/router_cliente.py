from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.database import get_db
from app.models import Cliente, Usuario
from app.models.model_usuario import ROL_VENDEDOR
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina
from app.schemas.schema_venta import ClienteCreate, ClienteResponse, ClienteUpdate
from app.security import get_current_user, obtener_ip, requiere_rol
from app.validaciones import clave_nit

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])
puede_editar = requiere_rol(ROL_VENDEDOR)


def _obtener(db: Session, id_cliente: int) -> Cliente:
    cliente = db.get(Cliente, id_cliente)
    if cliente is None:
        raise HTTPException(status_code=404, detail="No se encontró el cliente")
    return cliente


def _revisar_nit_unico(db: Session, nit: str, excluir_id: int | None = None) -> None:
    clave = clave_nit(nit)
    if clave is None:  # CF se puede repetir
        return
    consulta = select(Cliente).where(Cliente.nit_unico == clave)
    if excluir_id is not None:
        consulta = consulta.where(Cliente.id != excluir_id)
    existente = db.scalars(consulta).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe un cliente con ese NIT ({existente.nombre})")


@router.get("", response_model=Pagina[ClienteResponse])
def listar(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    consulta = select(Cliente).order_by(Cliente.nombre)
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Cliente.nombre.icontains(texto, autoescape=True),
            Cliente.nit.icontains(texto, autoescape=True),
        ))
    if activo is not None:
        consulta = consulta.where(Cliente.activo == activo)
    return paginar(db, consulta, paginacion, ClienteResponse)


@router.get("/{id_cliente}", response_model=ClienteResponse)
def obtener(id_cliente: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return _obtener(db, id_cliente)


@router.post("", response_model=ClienteResponse, status_code=201)
def crear(datos: ClienteCreate, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    _revisar_nit_unico(db, datos.nit)
    cliente = Cliente(**datos.model_dump())
    db.add(cliente)
    registrar_actividad(db, "CREAR", "Clientes", f"Registró al cliente '{cliente.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(cliente)
    return cliente


@router.put("/{id_cliente}", response_model=ClienteResponse)
def editar(
    id_cliente: int,
    datos: ClienteUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_editar),
):
    cliente = _obtener(db, id_cliente)
    _revisar_nit_unico(db, datos.nit, excluir_id=cliente.id)
    for campo, valor in datos.model_dump().items():
        setattr(cliente, campo, valor)
    registrar_actividad(db, "EDITAR", "Clientes", f"Editó al cliente '{cliente.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    db.refresh(cliente)
    return cliente


@router.patch("/{id_cliente}/desactivar", response_model=Mensaje)
def desactivar(id_cliente: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    cliente = _obtener(db, id_cliente)
    if not cliente.activo:
        raise HTTPException(status_code=400, detail="El cliente ya está inactivo")
    cliente.activo = False
    registrar_actividad(db, "DESACTIVAR", "Clientes", f"Desactivó al cliente '{cliente.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se desactivó a '{cliente.nombre}'")


@router.patch("/{id_cliente}/reactivar", response_model=Mensaje)
def reactivar(id_cliente: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    cliente = _obtener(db, id_cliente)
    if cliente.activo:
        raise HTTPException(status_code=400, detail="El cliente ya está activo")
    cliente.activo = True
    registrar_actividad(db, "REACTIVAR", "Clientes", f"Reactivó al cliente '{cliente.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se reactivó a '{cliente.nombre}'")