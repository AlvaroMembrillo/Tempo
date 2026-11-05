import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Holiday
from app.regions import REGION_NAMES, regions_for
from app.schemas import HolidayOut

router = APIRouter(prefix="/holidays", tags=["Festivos"])


@router.get("", response_model=list[HolidayOut])
def list_holidays(
    user: CurrentUser,
    db: DbSession,
    start: Annotated[dt.date | None, Query(alias="from")] = None,
    end: Annotated[dt.date | None, Query(alias="to", description="Incluido")] = None,
    region: Annotated[str | None, Query(description="Por defecto, la del usuario")] = None,
):
    """Festivos de la región (incluye los nacionales y autonómicos que le corresponden)."""
    query = select(Holiday).where(Holiday.region.in_(regions_for(region or user.holiday_region)))
    if start is not None:
        query = query.where(Holiday.date >= start)
    if end is not None:
        query = query.where(Holiday.date <= end)
    return [
        HolidayOut(
            date=h.date,
            name=h.name,
            region=h.region,
            scope=REGION_NAMES.get(h.region, h.region),
            note=h.note,
        )
        for h in db.scalars(query.order_by(Holiday.date))
    ]
