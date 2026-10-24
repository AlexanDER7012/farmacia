"""
app/pagination.py
-----------------
Paginación y búsqueda SIEMPRE en el servidor: la búsqueda revisa todos los
registros de la base, no solo los de la página que se ve en pantalla.
"""
from fastapi import Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.schemas.schema_comun import Pagina


class Paginacion:
    def __init__(
        self,
        pagina: int = Query(1, ge=1, description="Número de página (empieza en 1)"),
        por_pagina: int = Query(20, ge=1, le=100, description="Registros por página (máximo 100)"),
        buscar: str | None = Query(None, max_length=100, description="Texto a buscar"),
    ):
        self.pagina = pagina
        self.por_pagina = por_pagina
        self.buscar = buscar.strip() if buscar and buscar.strip() else None


def _es_consulta_de_modelo(consulta) -> bool:
    """
    True si la consulta trae un modelo completo, como select(Producto).
    False si trae columnas sueltas, como select(Lote.numero_lote, Producto.nombre)
    o una vista, como select(vw_cliente).
    """
    descripciones = consulta.column_descriptions
    return len(descripciones) == 1 and hasattr(descripciones[0].get("expr"), "__mapper__")


def paginar(db: Session, consulta, paginacion: Paginacion, Schema) -> Pagina:
    """Cuenta el total, trae solo la página pedida y la convierte al schema de respuesta."""
    total = db.scalar(select(func.count()).select_from(consulta.order_by(None).subquery()))
    pagina = consulta.offset((paginacion.pagina - 1) * paginacion.por_pagina).limit(paginacion.por_pagina)

    if _es_consulta_de_modelo(consulta):
        items = [Schema.model_validate(r) for r in db.scalars(pagina).all()]
    else:
        items = [Schema(**fila._mapping) for fila in db.execute(pagina).all()]

    return Pagina(total=total or 0, pagina=paginacion.pagina, por_pagina=paginacion.por_pagina, items=items)