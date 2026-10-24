import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.routers import (
    router_auth, router_bitacora, router_caja, router_cliente, router_compra,
    router_configuracion, router_consulta, router_empleado, router_inventario,
    router_producto, router_proveedor, router_usuario, router_venta,
)
from app.routers.router_catalogo import ROUTERS_CATALOGO


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("farmacia")

app = FastAPI(
    title="Sistema de Farmacia",
    version="1.0.0",
    description="API del sistema de farmacia: inventario por lote, compras, ventas y caja.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================== Manejo de errores =====================
@app.exception_handler(IntegrityError)
async def error_integridad(request: Request, exc: IntegrityError):
    """Un registro repetido o una referencia que no existe, detectado por la base."""
    log.warning("Error de integridad en %s: %s", request.url.path, exc.orig)
    return JSONResponse(
        status_code=409,
        content={"detail": "No se pudo guardar: el registro ya existe o hace referencia a datos que no existen"},
    )


@app.exception_handler(Exception)
async def error_inesperado(request: Request, exc: Exception):
    """Cualquier otro error: se guarda el detalle en consola, al usuario solo un mensaje general."""
    log.exception("Error inesperado en %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Ocurrió un error inesperado. Intenta de nuevo."})


# ===================== Rutas de la API =====================
ROUTERS = [
    router_auth.router,
    *ROUTERS_CATALOGO,
    router_empleado.router,
    router_usuario.router,
    router_producto.router,
    router_proveedor.router,
    router_inventario.router,
    router_compra.router,
    router_cliente.router,
    router_caja.router,
    router_venta.router,
    router_configuracion.router,
    router_bitacora.router,
    router_consulta.router,
]

for router in ROUTERS:
    app.include_router(router)


@app.get("/api/salud", tags=["Sistema"])
def salud():
    """Para comprobar que el servidor está corriendo."""
    return {"estado": "ok"}


# ===================== Frontend =====================
# Va al final para que no tape las rutas de /api
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")