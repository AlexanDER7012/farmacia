# pyright: reportInvalidTypeForm=false
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bitacora import registrar_actividad
from app.catalogos import validar_nombre_unico
from app.database import get_db
from app.models import (
    Categoria, Laboratorio, Presentacion, PrincipioActivo,
    Puesto, Rol, TipoPago, Ubicacion,
)
from app.models.model_usuario import ROL_ADMINISTRADOR, ROL_BODEGUERO, ROL_VENDEDOR, Usuario
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import (
    CatalogoCreate, CatalogoResponse, CatalogoUpdate, Mensaje, Pagina, Referencia,
)
from app.schemas.schema_ubicacion import UbicacionCreate, UbicacionResponse, UbicacionUpdate
from app.security import get_current_user, obtener_ip, requiere_rol
from app.validaciones import normalizar

from app.models import UnidadMedida
from app.schemas.schema_producto import UnidadMedidaCreate, UnidadMedidaResponse, UnidadMedidaUpdate


def crear_router_catalogo(
    Modelo,
    prefijo: str,
    etiqueta: str,              # con artículo: "la categoría", "el laboratorio"
    titulo: str,                # nombre del módulo en /docs y en la bitácora
    roles_editar: tuple = (),   # además del Administrador
    SchemaCreate=CatalogoCreate,
    SchemaUpdate=CatalogoUpdate,
    SchemaResponse=CatalogoResponse,
    protegidos: tuple = (),     # nombres que no se pueden renombrar ni desactivar
) -> APIRouter:
    router = APIRouter(prefix=prefijo, tags=[titulo])
    puede_editar = requiere_rol(*roles_editar)
    nombres_protegidos = {normalizar(n) for n in protegidos}

    def _obtener(db: Session, id_registro: int):
        registro = db.get(Modelo, id_registro)
        if registro is None:
            raise HTTPException(status_code=404, detail=f"No se encontró {etiqueta}")
        return registro

    def _revisar_protegido(registro, accion: str):
        if registro.nombre_normalizado in nombres_protegidos:
            raise HTTPException(
                status_code=400,
                detail=f"No se puede {accion} '{registro.nombre}' porque lo usa el sistema",
            )

    @router.get("", response_model=Pagina[SchemaResponse])
    def listar(
        paginacion: Paginacion = Depends(),
        activo: bool | None = Query(None, description="Filtrar por estado"),
        db: Session = Depends(get_db),
        _: Usuario = Depends(get_current_user),
    ):
        consulta = select(Modelo).order_by(Modelo.nombre)
        if paginacion.buscar:
            consulta = consulta.where(Modelo.nombre.icontains(paginacion.buscar, autoescape=True))
        if activo is not None:
            consulta = consulta.where(Modelo.activo == activo)
        return paginar(db, consulta, paginacion, SchemaResponse)

    @router.get("/opciones", response_model=list[Referencia])
    def opciones(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
        """Solo los activos: los inactivos no aparecen para elegirse en los formularios."""
        return db.scalars(select(Modelo).where(Modelo.activo.is_(True)).order_by(Modelo.nombre)).all()

    @router.get("/{id_registro}", response_model=SchemaResponse)
    def obtener(id_registro: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
        return _obtener(db, id_registro)

    @router.post("", response_model=SchemaResponse, status_code=201)
    def crear(
        datos: SchemaCreate,
        request: Request,
        db: Session = Depends(get_db),
        usuario: Usuario = Depends(puede_editar),
    ):
        valores = datos.model_dump()
        valores["nombre"] = validar_nombre_unico(db, Modelo, valores["nombre"], etiqueta)
        registro = Modelo(**valores)
        db.add(registro)
        registrar_actividad(db, "CREAR", titulo, f"Creó {etiqueta} '{registro.nombre}'",
                            id_usuario=usuario.id, ip=obtener_ip(request))
        db.commit()
        db.refresh(registro)
        return registro

    @router.put("/{id_registro}", response_model=SchemaResponse)
    def editar(
        id_registro: int,
        datos: SchemaUpdate,
        request: Request,
        db: Session = Depends(get_db),
        usuario: Usuario = Depends(puede_editar),
    ):
        registro = _obtener(db, id_registro)
        valores = datos.model_dump()
        valores["nombre"] = validar_nombre_unico(db, Modelo, valores["nombre"], etiqueta, excluir_id=registro.id)
        if normalizar(valores["nombre"]) != registro.nombre_normalizado:
            _revisar_protegido(registro, "renombrar")

        nombre_anterior = registro.nombre
        for campo, valor in valores.items():
            setattr(registro, campo, valor)

        detalle = f"Editó {etiqueta} '{registro.nombre}'"
        if nombre_anterior != registro.nombre:
            detalle += f" (antes '{nombre_anterior}')"
        registrar_actividad(db, "EDITAR", titulo, detalle, id_usuario=usuario.id, ip=obtener_ip(request))
        db.commit()
        db.refresh(registro)
        return registro

    @router.patch("/{id_registro}/desactivar", response_model=Mensaje)
    def desactivar(
        id_registro: int,
        request: Request,
        db: Session = Depends(get_db),
        usuario: Usuario = Depends(puede_editar),
    ):
        registro = _obtener(db, id_registro)
        _revisar_protegido(registro, "desactivar")
        if not registro.activo:
            raise HTTPException(status_code=400, detail=f"{etiqueta.capitalize()} '{registro.nombre}' ya está inactivo(a)")
        registro.activo = False
        registrar_actividad(db, "DESACTIVAR", titulo, f"Desactivó {etiqueta} '{registro.nombre}'",
                            id_usuario=usuario.id, ip=obtener_ip(request))
        db.commit()
        return Mensaje(mensaje=f"Se desactivó '{registro.nombre}'")

    @router.patch("/{id_registro}/reactivar", response_model=Mensaje)
    def reactivar(
        id_registro: int,
        request: Request,
        db: Session = Depends(get_db),
        usuario: Usuario = Depends(puede_editar),
    ):
        registro = _obtener(db, id_registro)
        if registro.activo:
            raise HTTPException(status_code=400, detail=f"{etiqueta.capitalize()} '{registro.nombre}' ya está activo(a)")
        registro.activo = True
        registrar_actividad(db, "REACTIVAR", titulo, f"Reactivó {etiqueta} '{registro.nombre}'",
                            id_usuario=usuario.id, ip=obtener_ip(request))
        db.commit()
        return Mensaje(mensaje=f"Se reactivó '{registro.nombre}'")

    return router


# ===================================================================
# CATÁLOGOS DEL SISTEMA
# ===================================================================
ROUTERS_CATALOGO = [
    crear_router_catalogo(
        UnidadMedida, "/api/unidades-medida", "la unidad de medida", "Unidades de medida",
        roles_editar=(ROL_BODEGUERO,),
        SchemaCreate=UnidadMedidaCreate, SchemaUpdate=UnidadMedidaUpdate, SchemaResponse=UnidadMedidaResponse,
    ),
    crear_router_catalogo(
        Rol, "/api/roles", "el rol", "Roles",
        protegidos=(ROL_ADMINISTRADOR, ROL_VENDEDOR, ROL_BODEGUERO),
    ),
    crear_router_catalogo(Puesto, "/api/puestos", "el puesto", "Puestos"),
    crear_router_catalogo(
        Ubicacion, "/api/ubicaciones", "la ubicación", "Ubicaciones",
        SchemaCreate=UbicacionCreate, SchemaUpdate=UbicacionUpdate, SchemaResponse=UbicacionResponse,
    ),
    crear_router_catalogo(Categoria, "/api/categorias", "la categoría", "Categorías", roles_editar=(ROL_BODEGUERO,)),
    crear_router_catalogo(Laboratorio, "/api/laboratorios", "el laboratorio", "Laboratorios", roles_editar=(ROL_BODEGUERO,)),
    crear_router_catalogo(PrincipioActivo, "/api/principios-activos", "el principio activo", "Principios activos", roles_editar=(ROL_BODEGUERO,)),
    crear_router_catalogo(Presentacion, "/api/presentaciones", "la presentación", "Presentaciones", roles_editar=(ROL_BODEGUERO,)),
    crear_router_catalogo(TipoPago, "/api/tipos-pago", "el tipo de pago", "Tipos de pago"),
]