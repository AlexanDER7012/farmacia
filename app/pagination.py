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


def paginar(db: Session, consulta, paginacion: Paginacion, Schema) -> Pagina:
    total = db.scalar(select(func.count()).select_from(consulta.order_by(None).subquery()))
    pagina = consulta.offset((paginacion.pagina - 1) * paginacion.por_pagina).limit(paginacion.por_pagina)

    if len(consulta.selected_columns) == 1 and hasattr(consulta.column_descriptions[0]["entity"], "__table__"):
        items = [Schema.model_validate(r) for r in db.scalars(pagina).all()]
    else:
        items = [Schema(**fila._mapping) for fila in db.execute(pagina).all()]

    return Pagina(total=total or 0, pagina=paginacion.pagina, por_pagina=paginacion.por_pagina, items=items)