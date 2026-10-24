from sqlalchemy import Boolean, Column, Date, Integer, MetaData, Numeric, String, Table

vistas = MetaData()

vw_cliente = Table(
    "vw_cliente", vistas,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(150)),
    Column("nit", String(20)),
    Column("telefono", String(9)),
    Column("correo", String(100)),
    Column("direccion", String(255)),
    Column("activo", Boolean),
)

vw_producto = Table(
    "vw_producto", vistas,
    Column("id", Integer, primary_key=True),
    Column("codigo", String(50)),
    Column("nombre", String(150)),
    Column("concentracion", String(50)),
    Column("categoria", String(100)),
    Column("laboratorio", String(100)),
    Column("principio_activo", String(100)),
    Column("presentacion", String(100)),
    Column("unidad", String(10)),
    Column("precio_compra", Numeric(10, 2)),
    Column("precio_venta", Numeric(10, 2)),
    Column("stock_minimo", Numeric(10, 2)),
    Column("requiere_receta", Boolean),
    Column("activo", Boolean),
    Column("stock_total", Numeric(12, 2)),
)

vw_existencia = Table(
    "vw_existencia", vistas,
    Column("id", Integer, primary_key=True),
    Column("cantidad", Numeric(10, 2)),
    Column("id_lote", Integer),
    Column("numero_lote", String(50)),
    Column("fecha_vencimiento", Date),
    Column("id_producto", Integer),
    Column("codigo", String(50)),
    Column("producto", String(150)),
    Column("id_ubicacion", Integer),
    Column("ubicacion", String(100)),
)

vw_stock_bajo = Table(
    "vw_stock_bajo", vistas,
    Column("id", Integer, primary_key=True),
    Column("codigo", String(50)),
    Column("nombre", String(150)),
    Column("stock_total", Numeric(12, 2)),
    Column("stock_minimo", Numeric(10, 2)),
)

vw_venta_diaria = Table(
    "vw_venta_diaria", vistas,
    Column("dia", Date, primary_key=True),
    Column("cantidad_ventas", Integer),
    Column("total", Numeric(12, 2)),
)