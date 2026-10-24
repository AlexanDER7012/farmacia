from getpass import getpass

from sqlalchemy import select

from app.bitacora import registrar_actividad
from app.database import SessionLocal
from app.models import (
    Categoria, ConfiguracionGeneral, Empleado, Laboratorio, Presentacion,
    PrincipioActivo, Puesto, Rol, TipoPago, Ubicacion, UnidadMedida, Usuario,
)
from app.models.model_usuario import ROL_ADMINISTRADOR, ROL_BODEGUERO, ROL_VENDEDOR
from app.security import hash_password
from app.validaciones import normalizar, validar_password

ROLES = [
    (ROL_ADMINISTRADOR, "Acceso completo al sistema"),
    (ROL_VENDEDOR, "Ventas, clientes y caja"),
    (ROL_BODEGUERO, "Inventario, compras y proveedores"),
]
PUESTOS = ["Administrador", "Farmacéutico", "Cajero", "Bodeguero"]
TIPOS_PAGO = ["Efectivo", "Tarjeta", "Transferencia"]
CATEGORIAS = ["Analgésicos", "Antibióticos", "Antigripales", "Antialérgicos", "Vitaminas", "Cuidado personal"]
LABORATORIOS = ["Genérico"]
PRINCIPIOS_ACTIVOS = ["Paracetamol", "Ibuprofeno", "Amoxicilina", "Loratadina", "Omeprazol"]
PRESENTACIONES = ["Tabletas", "Cápsulas", "Jarabe", "Suspensión", "Inyectable", "Crema", "Gotas"]
UNIDADES = [("Unidad", "und"), ("Caja", "cja"), ("Frasco", "fco"), ("Blíster", "blt"), ("Tubo", "tbo")]
UBICACIONES = [("Sucursal Central", "Sucursal"), ("Bodega Central", "Bodega")]


def obtener_o_crear(db, Modelo, nombre: str, **extra):
    """Busca por nombre normalizado; si no existe, lo crea."""
    existente = db.scalars(
        select(Modelo).where(Modelo.nombre_normalizado == normalizar(nombre))
    ).first()
    if existente:
        return existente, False
    registro = Modelo(nombre=nombre, **extra)
    db.add(registro)
    db.flush()
    return registro, True


def cargar_catalogo(db, Modelo, etiqueta: str, filas) -> dict:
    creados = 0
    registros = {}
    for fila in filas:
        if isinstance(fila, tuple):
            nombre, extra = fila[0], fila[1]
        else:
            nombre, extra = fila, None
        kwargs = {}
        if Modelo is Rol and extra:
            kwargs["descripcion"] = extra
        elif Modelo is UnidadMedida:
            kwargs["abreviatura"] = extra
        elif Modelo is Ubicacion:
            kwargs["tipo"] = extra
        registro, nuevo = obtener_o_crear(db, Modelo, nombre, **kwargs)
        registros[nombre] = registro
        creados += int(nuevo)
    print(f"  {etiqueta}: {creados} nuevos, {len(filas) - creados} ya existían")
    return registros


def pedir_password() -> str:
    while True:
        password = getpass("  Contraseña para el usuario 'admin': ")
        try:
            validar_password(password, "admin")
        except ValueError as e:
            print(f"  {e}")
            continue
        if getpass("  Repite la contraseña: ") != password:
            print("  Las contraseñas no coinciden")
            continue
        return password


def main():
    db = SessionLocal()
    try:
        print("Cargando datos iniciales...")
        roles = cargar_catalogo(db, Rol, "Roles", ROLES)
        puestos = cargar_catalogo(db, Puesto, "Puestos", PUESTOS)
        cargar_catalogo(db, TipoPago, "Tipos de pago", TIPOS_PAGO)
        cargar_catalogo(db, Categoria, "Categorías", CATEGORIAS)
        cargar_catalogo(db, Laboratorio, "Laboratorios", LABORATORIOS)
        cargar_catalogo(db, PrincipioActivo, "Principios activos", PRINCIPIOS_ACTIVOS)
        cargar_catalogo(db, Presentacion, "Presentaciones", PRESENTACIONES)
        cargar_catalogo(db, UnidadMedida, "Unidades de medida", UNIDADES)
        ubicaciones = cargar_catalogo(db, Ubicacion, "Ubicaciones", UBICACIONES)

        principal = ubicaciones["Sucursal Central"]

        if db.scalars(select(ConfiguracionGeneral)).first() is None:
            db.add(ConfiguracionGeneral(
                nombre_negocio="Farmacia",
                iva_porcentaje=12,
                moneda="Q",
                dias_alerta_vencimiento=90,
                id_ubicacion_defecto=principal.id,
            ))
            print("  Configuración general: creada")
        else:
            print("  Configuración general: ya existía")

        if db.scalars(select(Usuario).where(Usuario.nombre_usuario == "admin")).first():
            print("  Usuario 'admin': ya existía")
        else:
            empleado = Empleado(
                nombres="Administrador",
                apellidos="del Sistema",
                dpi="0000000000101",   # DPI de sistema; se puede editar después
                salario=0,
                id_puesto=puestos["Administrador"].id,
                id_ubicacion=principal.id,
            )
            db.add(empleado)
            db.flush()

            usuario = Usuario(
                id_empleado=empleado.id,
                nombre_usuario="admin",
                password_hash=hash_password(pedir_password()),
                id_rol=roles[ROL_ADMINISTRADOR].id,
            )
            db.add(usuario)
            db.flush()
            registrar_actividad(db, "CREAR", "Sistema", "Carga de datos iniciales y usuario administrador",
                                id_usuario=usuario.id)
            print("  Usuario 'admin': creado")

        db.commit()
        print("Listo.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()