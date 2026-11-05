"""Esquemas de entrada y salida de la API.

El JSON va en camelCase y con la misma forma que usa el frontend
(`start`/`end`, `projectId`, `hourlyRate`...), para que pasar de
localStorage a la API no obligue a transformar nada.
"""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated
from zoneinfo import available_timezones

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$", examples=["#2563eb"])]
# Decimal internamente (exacto), número en el JSON (cómodo para el frontend)
Money = Annotated[
    Decimal,
    Field(ge=0, max_digits=10, decimal_places=2),
    PlainSerializer(float, return_type=float, when_used="json"),
]
# Las franjas usan «HH:MM», como los <input type="time">
ClockTime = Annotated[
    dt.time, PlainSerializer(lambda t: t.strftime("%H:%M"), return_type=str, when_used="json")
]
Weekday = Annotated[int, Field(ge=0, le=6, description="0 = lunes ... 6 = domingo")]


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------


class RegisterIn(Schema):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class UserOut(Schema):
    id: uuid.UUID
    email: str
    name: str | None
    timezone: str
    holiday_region: str


class UserUpdate(Schema):
    name: str | None = Field(default=None, max_length=120)
    timezone: str | None = None
    holiday_region: str | None = Field(default=None, pattern=r"^[A-Z]{2}(-[A-Z]{2,3}){0,2}$")

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, v: str | None) -> str | None:
        if v is not None and v not in available_timezones():
            raise ValueError("zona horaria desconocida")
        return v


class Token(BaseModel):
    # Formato estándar OAuth2 (snake_case): lo espera el botón «Authorize» de /docs
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Proyectos
# ---------------------------------------------------------------------------


class ProjectIn(Schema):
    id: uuid.UUID | None = Field(default=None, description="Opcional: el cliente puede fijarlo")
    name: str = Field(min_length=1, max_length=200)
    client: str | None = Field(default=None, max_length=200)
    color: Color
    hourly_rate: Money | None = None
    archived: bool = False


class ProjectUpdate(Schema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    client: str | None = Field(default=None, max_length=200)
    color: Color | None = None
    hourly_rate: Money | None = None
    archived: bool | None = None


class ProjectOut(Schema):
    id: uuid.UUID
    name: str
    client: str | None
    color: str
    hourly_rate: Money | None
    archived: bool


# ---------------------------------------------------------------------------
# Eventos
# ---------------------------------------------------------------------------


class EventIn(Schema):
    id: uuid.UUID | None = None
    title: str = Field(default="", max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    start: AwareDatetime
    end: AwareDatetime
    color: Color
    project_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end <= self.start:
            raise ValueError("el fin debe ser posterior al inicio")
        return self


class EventUpdate(Schema):
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    color: Color | None = None
    project_id: uuid.UUID | None = None


class EventOut(Schema):
    id: uuid.UUID
    title: str
    description: str | None
    start: dt.datetime
    end: dt.datetime
    color: str
    project_id: uuid.UUID | None


# ---------------------------------------------------------------------------
# Franjas no disponibles
# ---------------------------------------------------------------------------


class TimeBlockIn(Schema):
    id: uuid.UUID | None = None
    label: str = Field(default="", max_length=120)
    start: dt.time
    end: dt.time
    days: list[Weekday]
    color: Color
    enabled: bool = True
    keep_on_holidays: bool | None = None
    exceptions: list[dt.date] = []


class TimeBlockUpdate(Schema):
    label: str | None = Field(default=None, max_length=120)
    start: dt.time | None = None
    end: dt.time | None = None
    days: list[Weekday] | None = None
    color: Color | None = None
    enabled: bool | None = None
    keep_on_holidays: bool | None = None


class TimeBlockOut(Schema):
    id: uuid.UUID
    label: str
    start: ClockTime
    end: ClockTime
    days: list[int]
    color: str
    enabled: bool
    keep_on_holidays: bool | None
    exceptions: list[dt.date]


class ExceptionIn(Schema):
    date: dt.date


# ---------------------------------------------------------------------------
# Festivos e informes
# ---------------------------------------------------------------------------


class HolidayOut(Schema):
    date: dt.date
    name: str
    region: str
    scope: str = Field(description="España, Andalucía, Sevilla...")
    note: str | None


class ProjectTotalOut(Schema):
    project_id: uuid.UUID | None = Field(description="null = eventos sin proyecto")
    project_name: str | None
    minutes: float
    amount: Money | None


class ProjectReportOut(Schema):
    start: dt.datetime
    end: dt.datetime
    totals: list[ProjectTotalOut]
    total_minutes: float
    total_amount: Money


# ---------------------------------------------------------------------------
# Importar / exportar (mismo formato que guarda el frontend)
# ---------------------------------------------------------------------------


class DataIn(Schema):
    projects: list[ProjectIn] = []
    events: list[EventIn] = []
    time_blocks: list[TimeBlockIn] = []


class DataOut(Schema):
    projects: list[ProjectOut]
    events: list[EventOut]
    time_blocks: list[TimeBlockOut]


class ImportResult(Schema):
    projects: int
    events: int
    time_blocks: int
