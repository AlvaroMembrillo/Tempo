"""Importar y exportar todos los datos del usuario.

Sirve para subir lo que ya está guardado en el navegador (localStorage) la
primera vez que se usa el backend, y para hacer copias de seguridad.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Base
from app.deps import CurrentUser, DbSession
from app.models import Event, Project, TimeBlock, User
from app.schemas import DataIn, DataOut, ImportResult

router = APIRouter(prefix="/data", tags=["Importar / exportar"])


@router.get("/export", response_model=DataOut)
def export_data(user: CurrentUser, db: DbSession):
    def owned(model):
        return db.scalars(select(model).where(model.user_id == user.id)).all()

    return DataOut(projects=owned(Project), events=owned(Event), time_blocks=owned(TimeBlock))


@router.post("/import", response_model=ImportResult)
def import_data(body: DataIn, user: CurrentUser, db: DbSession):
    """Crea o actualiza (por id) proyectos, eventos y franjas. Se puede repetir sin duplicar."""
    for p in body.projects:
        _upsert(db, Project, p.id, user, p.model_dump(exclude={"id"}))
    db.flush()

    project_ids = set(db.scalars(select(Project.id).where(Project.user_id == user.id)))
    for e in body.events:
        values = e.model_dump(exclude={"id"})
        # Un evento que apunta a un proyecto que no existe se queda sin proyecto
        if values["project_id"] not in project_ids:
            values["project_id"] = None
        _upsert(db, Event, e.id, user, values)

    for b in body.time_blocks:
        _upsert(db, TimeBlock, b.id, user, b.model_dump(exclude={"id"}))

    db.commit()
    return ImportResult(
        projects=len(body.projects), events=len(body.events), time_blocks=len(body.time_blocks)
    )


def _upsert(
    db: Session, model: type[Base], id: uuid.UUID | None, user: User, values: dict[str, Any]
) -> None:
    obj = db.get(model, id) if id is not None else None
    if obj is not None and obj.user_id != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"El id {id} ya está en uso")
    if obj is None:
        obj = model(id=id or uuid.uuid4(), user_id=user.id)
        db.add(obj)
    for field, value in values.items():
        setattr(obj, field, value)
