import datetime as dt
import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, get_owned
from app.models import TimeBlock
from app.routers.common import apply_update, check_new_id
from app.schemas import ExceptionIn, TimeBlockIn, TimeBlockOut, TimeBlockUpdate

router = APIRouter(prefix="/time-blocks", tags=["Horas no disponibles"])


@router.get("", response_model=list[TimeBlockOut])
def list_blocks(user: CurrentUser, db: DbSession):
    return db.scalars(
        select(TimeBlock).where(TimeBlock.user_id == user.id).order_by(TimeBlock.created_at)
    ).all()


@router.post("", response_model=TimeBlockOut, status_code=status.HTTP_201_CREATED)
def create_block(body: TimeBlockIn, user: CurrentUser, db: DbSession):
    check_new_id(db, TimeBlock, body.id)
    block = TimeBlock(id=body.id or uuid.uuid4(), user_id=user.id)
    apply_update(block, body.model_dump(exclude={"id"}), set())
    db.add(block)
    db.commit()
    return block


@router.patch("/{block_id}", response_model=TimeBlockOut)
def update_block(block_id: uuid.UUID, body: TimeBlockUpdate, user: CurrentUser, db: DbSession):
    block = get_owned(db, TimeBlock, block_id, user)
    # keep_on_holidays sí admite null: significa «decidir por el nombre»
    apply_update(
        block,
        body.model_dump(exclude_unset=True),
        {"label", "start", "end", "days", "color", "enabled"},
    )
    db.commit()
    return block


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(block_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    db.delete(get_owned(db, TimeBlock, block_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{block_id}/exceptions", response_model=TimeBlockOut)
def skip_day(block_id: uuid.UUID, body: ExceptionIn, user: CurrentUser, db: DbSession):
    """Quita la franja solo en una fecha (festivo, vacaciones...). Repetirlo no hace nada."""
    block = get_owned(db, TimeBlock, block_id, user)
    block.exceptions = [*block.exceptions, body.date]
    db.commit()
    return block


@router.delete("/{block_id}/exceptions/{date}", response_model=TimeBlockOut)
def restore_day(block_id: uuid.UUID, date: dt.date, user: CurrentUser, db: DbSession):
    """Vuelve a aplicar la franja en una fecha que se había quitado."""
    block = get_owned(db, TimeBlock, block_id, user)
    block.exceptions = [d for d in block.exceptions if d != date]
    db.commit()
    return block
