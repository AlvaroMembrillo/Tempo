from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import AwareDatetime
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Event, Project
from app.schemas import ProjectReportOut, ProjectTotalOut

router = APIRouter(prefix="/reports", tags=["Informes"])

CENT = Decimal("0.01")


@router.get("/projects", response_model=ProjectReportOut)
def project_report(
    user: CurrentUser,
    db: DbSession,
    start: Annotated[AwareDatetime, Query(alias="from")],
    end: Annotated[AwareDatetime, Query(alias="to", description="No incluido")],
):
    """Horas e importe por proyecto en un periodo.

    Los eventos que empiezan antes o terminan después del periodo solo cuentan
    la parte que cae dentro. Los eventos sin proyecto aparecen con `projectId: null`.
    """
    if end <= start:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "«to» debe ser posterior a «from»"
        )

    clipped = func.least(Event.end, end) - func.greatest(Event.start, start)
    seconds = func.sum(func.extract("epoch", clipped))
    rows = db.execute(
        select(Event.project_id, seconds)
        .where(Event.user_id == user.id, Event.start < end, Event.end > start)
        .group_by(Event.project_id)
    ).all()

    projects = {p.id: p for p in db.scalars(select(Project).where(Project.user_id == user.id))}
    totals: list[ProjectTotalOut] = []
    total_minutes = 0.0
    total_amount = Decimal(0)
    for project_id, secs in rows:
        minutes = float(secs) / 60
        project = projects.get(project_id)
        amount = None
        if project is not None and project.hourly_rate is not None:
            amount = (Decimal(str(secs)) / 3600 * project.hourly_rate).quantize(CENT, ROUND_HALF_UP)
            total_amount += amount
        if project is not None:
            total_minutes += minutes
        totals.append(
            ProjectTotalOut(
                project_id=project_id,
                project_name=project.name if project else None,
                minutes=minutes,
                amount=amount,
            )
        )

    # Más horas primero; «sin proyecto» al final
    totals.sort(key=lambda t: (t.project_id is None, -t.minutes))
    return ProjectReportOut(
        start=start,
        end=end,
        totals=totals,
        total_minutes=total_minutes,
        total_amount=total_amount,
    )
