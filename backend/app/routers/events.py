import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import AwareDatetime
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, get_owned
from app.models import Event
from app.routers.common import apply_update, check_new_id, check_project
from app.schemas import EventIn, EventOut, EventUpdate

router = APIRouter(prefix="/events", tags=["Eventos"])


@router.get("", response_model=list[EventOut])
def list_events(
    user: CurrentUser,
    db: DbSession,
    start: Annotated[AwareDatetime | None, Query(alias="from")] = None,
    end: Annotated[AwareDatetime | None, Query(alias="to")] = None,
):
    """Eventos del usuario. Con `from`/`to`, solo los que se solapan con ese periodo."""
    query = select(Event).where(Event.user_id == user.id)
    if start is not None:
        query = query.where(Event.end > start)
    if end is not None:
        query = query.where(Event.start < end)
    return db.scalars(query.order_by(Event.start)).all()


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: EventIn, user: CurrentUser, db: DbSession):
    check_new_id(db, Event, body.id)
    check_project(db, body.project_id, user)
    event = Event(**body.model_dump(exclude={"id"}), id=body.id or uuid.uuid4(), user_id=user.id)
    db.add(event)
    db.commit()
    return event


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return get_owned(db, Event, event_id, user)


@router.patch("/{event_id}", response_model=EventOut)
def update_event(event_id: uuid.UUID, body: EventUpdate, user: CurrentUser, db: DbSession):
    event = get_owned(db, Event, event_id, user)
    data = body.model_dump(exclude_unset=True)
    if "project_id" in data:
        check_project(db, data["project_id"], user)
    apply_update(event, data, {"title", "start", "end", "color"})
    if event.end <= event.start:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "el fin debe ser posterior al inicio"
        )
    db.commit()
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    db.delete(get_owned(db, Event, event_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
