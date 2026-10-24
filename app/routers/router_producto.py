from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.bitacora import registrar_actividad
from app.catalogos import obtener_activo
from app.database import get_db
from app.models import (
    Categoria, Inventario, Laboratorio, Lote, Presentacion,
    PrincipioActivo, Producto, UnidadMedida, Usuario,
)
from app.models.model_usuario import ROL_BODEGUERO
from app.pagination import Paginacion, paginar
from app.schemas.schema_comun import Mensaje, Pagina
from app.schemas.schema_producto import ProductoCreate, ProductoResponse, ProductoUpdate
from app.security import get_current_user, obtener_ip, requiere_rol
from app.validaciones import normalizar_codigo

router = APIRouter(prefix="/api/productos", tags=["Productos"])
puede_editar = requiere_rol(ROL_BODEGUERO)

AVISO_PERDIDA = "El precio de venta es menor que el precio de compra"

# Catálogos del producto: campo -> (modelo, etiqueta, obligatorio)
CATALOGOS = {
    "id_categoria": (Categoria, "la categoría", True),
    "id_laboratorio": (Laboratorio, "el laboratorio", True),
    "id_principio_activo": (PrincipioActivo, "el principio activo", False),
    "id_presentacion": (Presentacion, "la presentación", True),
    "id_unidad_medida": (UnidadMedida, "la unidad de medida", True),
}


def _consulta_base():
    return select(Producto).options(
        selectinload(Producto.categoria),
        selectinload(Producto.laboratorio),
        selectinload(Producto.principio_activo),
        selectinload(Producto.presentacion),
        selectinload(Producto.unidad_medida),
    )


def _obtener(db: Session, id_producto: int) -> Producto:
    producto = db.scalars(_consulta_base().where(Producto.id == id_producto)).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="No se encontró el producto")
    return producto


def stock_por_producto(db: Session, ids: list[int]) -> dict[int, Decimal]:
    """Stock total de varios productos en una sola consulta."""
    if not ids:
        return {}
    filas = db.execute(
        select(Lote.id_producto, func.coalesce(func.sum(Inventario.cantidad), 0))
        .join(Inventario, Inventario.id_lote == Lote.id)
        .where(Lote.id_producto.in_(ids))
        .group_by(Lote.id_producto)
    ).all()
    return {id_producto: Decimal(total) for id_producto, total in filas}


def _respuesta(db: Session, producto: Producto) -> ProductoResponse:
    respuesta = ProductoResponse.model_validate(producto)
    respuesta.stock_total = stock_por_producto(db, [producto.id]).get(producto.id, Decimal("0"))
    if producto.precio_venta < producto.precio_compra:
        respuesta.aviso = AVISO_PERDIDA
    return respuesta


def _revisar_codigo_unico(db: Session, codigo: str, excluir_id: int | None = None) -> None:
    consulta = select(Producto).where(Producto.codigo_normalizado == normalizar_codigo(codigo))
    if excluir_id is not None:
        consulta = consulta.where(Producto.id != excluir_id)
    existente = db.scalars(consulta).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un producto con el código '{existente.codigo}' ({existente.nombre})",
        )


def _revisar_catalogos(db: Session, valores: dict, producto: Producto | None = None) -> None:
    """Los catálogos tienen que existir y estar activos. Al editar, solo se revisan los que cambiaron."""
    for campo, (Modelo, etiqueta, obligatorio) in CATALOGOS.items():
        if producto is not None and getattr(producto, campo) == valores[campo]:
            continue
        obtener_activo(db, Modelo, valores[campo], etiqueta, obligatorio=obligatorio)


@router.get("", response_model=Pagina[ProductoResponse])
def listar(
    paginacion: Paginacion = Depends(),
    activo: bool | None = Query(None),
    id_categoria: int | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    consulta = _consulta_base().order_by(Producto.nombre)
    if paginacion.buscar:
        texto = paginacion.buscar
        consulta = consulta.where(or_(
            Producto.codigo.icontains(texto, autoescape=True),
            Producto.nombre.icontains(texto, autoescape=True),
        ))
    if activo is not None:
        consulta = consulta.where(Producto.activo == activo)
    if id_categoria is not None:
        consulta = consulta.where(Producto.id_categoria == id_categoria)

    pagina = paginar(db, consulta, paginacion, ProductoResponse)
    stocks = stock_por_producto(db, [p.id for p in pagina.items])
    for item in pagina.items:
        item.stock_total = stocks.get(item.id, Decimal("0"))
        if item.precio_venta < item.precio_compra:
            item.aviso = AVISO_PERDIDA
    return pagina


@router.get("/{id_producto}", response_model=ProductoResponse)
def obtener(id_producto: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return _respuesta(db, _obtener(db, id_producto))


@router.post("", response_model=ProductoResponse, status_code=201)
def crear(
    datos: ProductoCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_editar),
):
    valores = datos.model_dump()
    _revisar_codigo_unico(db, valores["codigo"])
    _revisar_catalogos(db, valores)

    producto = Producto(**valores)
    db.add(producto)
    registrar_actividad(db, "CREAR", "Productos",
                        f"Creó el producto '{producto.nombre}' (código {producto.codigo})",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return _respuesta(db, _obtener(db, producto.id))


@router.put("/{id_producto}", response_model=ProductoResponse)
def editar(
    id_producto: int,
    datos: ProductoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_editar),
):
    producto = _obtener(db, id_producto)
    valores = datos.model_dump()
    _revisar_codigo_unico(db, valores["codigo"], excluir_id=producto.id)
    _revisar_catalogos(db, valores, producto)

    cambios = []
    if valores["precio_venta"] != producto.precio_venta:
        cambios.append(f"precio de venta {producto.precio_venta} → {valores['precio_venta']}")
    if valores["precio_compra"] != producto.precio_compra:
        cambios.append(f"precio de compra {producto.precio_compra} → {valores['precio_compra']}")

    for campo, valor in valores.items():
        setattr(producto, campo, valor)

    detalle = f"Editó el producto '{producto.nombre}' (código {producto.codigo})"
    if cambios:
        detalle += ": " + ", ".join(cambios)
    registrar_actividad(db, "EDITAR", "Productos", detalle, id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return _respuesta(db, _obtener(db, producto.id))


@router.patch("/{id_producto}/desactivar", response_model=Mensaje)
def desactivar(id_producto: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    producto = _obtener(db, id_producto)
    if not producto.activo:
        raise HTTPException(status_code=400, detail="El producto ya está inactivo")
    producto.activo = False
    registrar_actividad(db, "DESACTIVAR", "Productos", f"Desactivó el producto '{producto.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(
        mensaje=f"Se desactivó '{producto.nombre}'",
        aviso="No recibirá entradas, salidas ni ventas hasta que se reactive",
    )


@router.patch("/{id_producto}/reactivar", response_model=Mensaje)
def reactivar(id_producto: int, request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(puede_editar)):
    producto = _obtener(db, id_producto)
    if producto.activo:
        raise HTTPException(status_code=400, detail="El producto ya está activo")
    producto.activo = True
    registrar_actividad(db, "REACTIVAR", "Productos", f"Reactivó el producto '{producto.nombre}'",
                        id_usuario=usuario.id, ip=obtener_ip(request))
    db.commit()
    return Mensaje(mensaje=f"Se reactivó '{producto.nombre}'")