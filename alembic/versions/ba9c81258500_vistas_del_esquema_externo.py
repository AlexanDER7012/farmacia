"""vistas del esquema externo

Revision ID: ba9c81258500
Revises: bbd9c85e786c
Create Date: 2026-10-23 22:26:16.798035

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba9c81258500'
down_revision: Union[str, Sequence[str], None] = 'bbd9c85e786c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Vistas del esquema externo. SQL estándar para que funcione en cualquier motor.
# El orden importa: vw_stock_bajo se construye sobre vw_producto.
VISTAS = {
    "vw_cliente": """
        SELECT c.id, c.nombre, c.nit, c.telefono, c.correo, c.direccion, c.activo
        FROM cliente c
    """,
    "vw_producto": """
        SELECT p.id, p.codigo, p.nombre, p.concentracion,
               cat.nombre AS categoria,
               lab.nombre AS laboratorio,
               pa.nombre AS principio_activo,
               pre.nombre AS presentacion,
               um.abreviatura AS unidad,
               p.precio_compra, p.precio_venta, p.stock_minimo,
               p.requiere_receta, p.activo,
               COALESCE(s.stock, 0) AS stock_total
        FROM producto p
        JOIN categoria cat ON cat.id = p.id_categoria
        JOIN laboratorio lab ON lab.id = p.id_laboratorio
        LEFT JOIN principio_activo pa ON pa.id = p.id_principio_activo
        JOIN presentacion pre ON pre.id = p.id_presentacion
        JOIN unidad_medida um ON um.id = p.id_unidad_medida
        LEFT JOIN (
            SELECT lo.id_producto, SUM(inv.cantidad) AS stock
            FROM lote lo
            JOIN inventario inv ON inv.id_lote = lo.id
            GROUP BY lo.id_producto
        ) s ON s.id_producto = p.id
    """,
    "vw_existencia": """
        SELECT inv.id, inv.cantidad,
               lo.id AS id_lote, lo.numero_lote, lo.fecha_vencimiento,
               p.id AS id_producto, p.codigo, p.nombre AS producto,
               u.id AS id_ubicacion, u.nombre AS ubicacion
        FROM inventario inv
        JOIN lote lo ON lo.id = inv.id_lote
        JOIN producto p ON p.id = lo.id_producto
        JOIN ubicacion u ON u.id = inv.id_ubicacion
    """,
    "vw_stock_bajo": """
        SELECT id, codigo, nombre, stock_total, stock_minimo
        FROM vw_producto
        WHERE activo = TRUE AND stock_minimo > 0 AND stock_total <= stock_minimo
    """,
    "vw_venta_diaria": """
        SELECT CAST(v.fecha AS DATE) AS dia,
               COUNT(*) AS cantidad_ventas,
               SUM(v.total) AS total
        FROM venta v
        WHERE v.estado = 'Completada'
        GROUP BY CAST(v.fecha AS DATE)
    """,
}


def upgrade() -> None:
    """Crea las vistas."""
    for nombre, sql in VISTAS.items():
        op.execute(f"CREATE VIEW {nombre} AS {sql}")


def downgrade() -> None:
    """Borra las vistas en orden inverso (primero las que dependen de otras)."""
    for nombre in reversed(list(VISTAS)):
        op.execute(f"DROP VIEW IF EXISTS {nombre}")