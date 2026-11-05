import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

COLOR_CHECK = "~ '^#[0-9a-fA-F]{6}$'"


class Timestamps:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Timestamps, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(120))
    # Las franjas horarias son horas locales: hace falta saber de qué zona
    timezone: Mapped[str] = mapped_column(String(64), server_default="Europe/Madrid")
    # Región para los festivos: ES (nacional), ES-AN (Andalucía), ES-AN-SE (Sevilla)...
    holiday_region: Mapped[str] = mapped_column(String(16), server_default="ES-AN-SE")


class Project(Timestamps, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("hourly_rate >= 0", name="hourly_rate_non_negative"),
        CheckConstraint(f"color {COLOR_CHECK}", name="color_hex"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    client: Mapped[str | None] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(7))
    # Dinero siempre en NUMERIC: nada de float en importes
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Event(Timestamps, Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="end_after_start"),
        CheckConstraint(f"color {COLOR_CHECK}", name="color_hex"),
        Index("ix_events_user_start", "user_id", "start_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Al borrar un proyecto sus eventos se quedan sin proyecto (no se borran)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), default="", server_default="")
    description: Mapped[str | None] = mapped_column(Text)
    start: Mapped[dt.datetime] = mapped_column("start_at", DateTime(timezone=True))
    end: Mapped[dt.datetime] = mapped_column("end_at", DateTime(timezone=True))
    color: Mapped[str] = mapped_column(String(7))


class TimeBlock(Timestamps, Base):
    """Franja recurrente no disponible (sueño, trabajo, estudios...).

    Se guarda como regla (días + horas locales), no como una fila por día.
    Si `end` <= `start`, la franja cruza la medianoche.
    """

    __tablename__ = "time_blocks"
    __table_args__ = (
        CheckConstraint("days_mask BETWEEN 0 AND 127", name="days_mask_range"),
        CheckConstraint(f"color {COLOR_CHECK}", name="color_hex"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(120))
    start: Mapped[dt.time] = mapped_column("start_time", Time)
    end: Mapped[dt.time] = mapped_column("end_time", Time)
    # Bit 0 = lunes ... bit 6 = domingo
    days_mask: Mapped[int] = mapped_column(SmallInteger)
    color: Mapped[str] = mapped_column(String(7))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # None = se decide por el nombre (las de dormir se mantienen en festivos)
    keep_on_holidays: Mapped[bool | None] = mapped_column(Boolean)

    exception_rows: Mapped[list["TimeBlockException"]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TimeBlockException.date",
    )

    @property
    def days(self) -> list[int]:
        return [d for d in range(7) if self.days_mask & (1 << d)]

    @days.setter
    def days(self, days: list[int]) -> None:
        self.days_mask = sum(1 << d for d in set(days))

    @property
    def exceptions(self) -> list[dt.date]:
        """Fechas en las que esta franja no se aplica."""
        return [row.date for row in self.exception_rows]

    @exceptions.setter
    def exceptions(self, dates: list[dt.date]) -> None:
        wanted = set(dates)
        self.exception_rows = [r for r in self.exception_rows if r.date in wanted]
        existing = {r.date for r in self.exception_rows}
        for d in sorted(wanted - existing):
            self.exception_rows.append(TimeBlockException(date=d))


class TimeBlockException(Base):
    __tablename__ = "time_block_exceptions"

    block_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("time_blocks.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)


class Holiday(Base):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("date", "region"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(String(200))
