from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ConfiguracionGeneral, Inventario, Lote, MovimientoInventario, Producto, Ubicacion

CERO = Decimal("0")


def _error(mensaje: str) -> HTTPException:
    return HTTPException(status_code=400, detail=mensaje)


def normalizar_lote(numero_lote: str) -> str:
    """Los números de lote se guardan sin espacios de más y en mayúsculas."""
    return " ".join(str(numero_lote or "").split()).upper()


def revisar_producto_activo(producto: Producto) -> None:
    if not producto.activo:
        raise _error(f"El producto '{producto.nombre}' está inactivo. Reactívalo para poder registrar movimientos.")


def ubicacion_por_defecto(db: Session) -> Ubicacion:
    """La ubicación de Configuración general o, si no hay, la primera activa."""
    config = db.scalars(select(ConfiguracionGeneral)).first()
    if config and config.id_ubicacion_defecto:
        ubicacion = db.get(Ubicacion, config.id_ubicacion_defecto)
        if ubicacion and ubicacion.activo:
            return ubicacion
    ubicacion = db.scalars(select(Ubicacion).where(Ubicacion.activo.is_(True)).order_by(Ubicacion.id)).first()
    if ubicacion is None:
        raise _error("No hay ninguna ubicación activa. Crea una en Ubicaciones.")
    return ubicacion


def obtener_o_crear_lote(
    db: Session,
    producto: Producto,
    numero_lote: str,
    fecha_vencimiento: date | None,
    costo_unitario: Decimal = CERO,
) -> Lote:
    """
    Busca el lote del producto por su número. Si no existe, lo crea
    (para crearlo hace falta la fecha de vencimiento).
    """
    numero = normalizar_lote(numero_lote)
    lote = db.scalars(
        select(Lote).where(Lote.id_producto == producto.id, Lote.numero_lote == numero)
    ).first()

    if lote:
        if fecha_vencimiento and lote.fecha_vencimiento != fecha_vencimiento:
            raise _error(
                f"El lote '{numero}' de '{producto.nombre}' ya existe con vencimiento "
                f"{lote.fecha_vencimiento:%d/%m/%Y}. Revisa el número de lote o la fecha."
            )
        return lote

    if fecha_vencimiento is None:
        raise _error(f"El lote '{numero}' de '{producto.nombre}' no existe")

    lote = Lote(
        id_producto=producto.id,
        numero_lote=numero,
        fecha_vencimiento=fecha_vencimiento,
        costo_unitario=costo_unitario,
    )
    db.add(lote)
    db.flush()
    return lote


def stock_disponible(db: Session, id_lote: int, id_ubicacion: int) -> Decimal:
    cantidad = db.scalar(
        select(Inventario.cantidad).where(Inventario.id_lote == id_lote, Inventario.id_ubicacion == id_ubicacion)
    )
    return cantidad if cantidad is not None else CERO


def stock_producto_en(db: Session, id_producto: int, id_ubicacion: int) -> Decimal:
    """Stock de un producto en UNA ubicación (suma de sus lotes ahí)."""
    total = db.scalar(
        select(func.coalesce(func.sum(Inventario.cantidad), 0))
        .join(Lote, Inventario.id_lote == Lote.id)
        .where(Lote.id_producto == id_producto, Inventario.id_ubicacion == id_ubicacion)
    )
    return Decimal(total or 0)


def mover_stock(
    db: Session,
    lote: Lote,
    id_ubicacion: int,
    cantidad: Decimal,
    tipo: str,            # "Entrada" o "Salida"
    origen: str,          # "Manual", "Ajuste", "Compra" o "Venta"
    id_usuario: int,
    referencia: str | None = None,
    observaciones: str | None = None,
    permitir_inactivo: bool = False,   # solo para revertir (anular una venta)
) -> Decimal:
    """Suma o resta stock de un lote en una ubicación. Devuelve lo que queda ahí."""
    cantidad = Decimal(cantidad)
    if cantidad <= 0:
        raise _error("La cantidad debe ser mayor a 0")
    if tipo not in ("Entrada", "Salida"):
        raise _error("Tipo de movimiento no válido")

    producto = lote.producto
    if not permitir_inactivo:
        revisar_producto_activo(producto)

    fila = db.scalars(
        select(Inventario)
        .where(Inventario.id_lote == lote.id, Inventario.id_ubicacion == id_ubicacion)
        .with_for_update()
    ).first()

    disponible = fila.cantidad if fila else CERO
    nuevo = disponible + cantidad if tipo == "Entrada" else disponible - cantidad

    if nuevo < 0:
        ubicacion = db.get(Ubicacion, id_ubicacion)
        raise _error(
            f"Stock insuficiente de '{producto.nombre}' (lote {lote.numero_lote}) en "
            f"{ubicacion.nombre if ubicacion else 'la ubicación'}: "
            f"disponible {disponible:g}, se necesitan {cantidad:g}"
        )

    if fila is None:
        fila = Inventario(id_lote=lote.id, id_ubicacion=id_ubicacion, cantidad=CERO)
        db.add(fila)
    fila.cantidad = nuevo

    db.add(MovimientoInventario(
        tipo=tipo,
        origen=origen,
        id_lote=lote.id,
        id_ubicacion=id_ubicacion,
        cantidad=cantidad,
        id_usuario=id_usuario,
        referencia=referencia,
        observaciones=observaciones,
    ))
    db.flush()
    return nuevo