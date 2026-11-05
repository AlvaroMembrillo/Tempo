import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Project, User


def apply_update(obj: Base, data: dict[str, Any], required: set[str]) -> None:
    """Aplica un PATCH. Los campos obligatorios no se pueden poner a null."""
    for field, value in data.items():
        if value is None and field in required:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"«{field}» no puede ser nulo"
            )
        setattr(obj, field, value)


def check_new_id(db: Session, model: type[Base], id: uuid.UUID | None) -> None:
    if id is not None and db.get(model, id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un elemento con ese id")


def check_project(db: Session, project_id: uuid.UUID | None, user: User) -> None:
    """El proyecto de un evento tiene que existir y ser del mismo usuario."""
    if project_id is None:
        return
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "El proyecto no existe")
