import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, get_owned
from app.models import Project
from app.routers.common import apply_update, check_new_id
from app.schemas import ProjectIn, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["Proyectos"])


@router.get("", response_model=list[ProjectOut])
def list_projects(user: CurrentUser, db: DbSession):
    """Todos los proyectos, archivados incluidos (conservan sus horas)."""
    return db.scalars(
        select(Project).where(Project.user_id == user.id).order_by(Project.created_at, Project.name)
    ).all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectIn, user: CurrentUser, db: DbSession):
    check_new_id(db, Project, body.id)
    project = Project(
        **body.model_dump(exclude={"id"}), id=body.id or uuid.uuid4(), user_id=user.id
    )
    db.add(project)
    db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return get_owned(db, Project, project_id, user)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: uuid.UUID, body: ProjectUpdate, user: CurrentUser, db: DbSession):
    project = get_owned(db, Project, project_id, user)
    apply_update(project, body.model_dump(exclude_unset=True), {"name", "color", "archived"})
    db.commit()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    """Sus eventos no se borran: se quedan sin proyecto."""
    db.delete(get_owned(db, Project, project_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
