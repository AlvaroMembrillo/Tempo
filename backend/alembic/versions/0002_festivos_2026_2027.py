"""festivos 2026 y 2027 (España, Andalucía y Sevilla)

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-05

Fuentes: Decreto 101/2025 (BOJA nº 93, 19/05/2025) y Decreto 84/2026
(BOJA nº 84, 05/05/2026); fiestas locales de Sevilla publicadas en BOJA
de 14/10/2025 y acordadas por el Pleno en junio de 2026.

Los datos van copiados aquí a propósito: una migración tiene que hacer
siempre lo mismo aunque el resto del código cambie. Los años siguientes
se añaden con migraciones nuevas.
"""

import datetime as dt
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (fecha, nombre, región, nota) — ES = nacional, ES-AN = Andalucía, ES-AN-SE = Sevilla
HOLIDAYS = [
    # 2026
    ("2026-01-01", "Año Nuevo", "ES", None),
    ("2026-01-06", "Epifanía del Señor", "ES", None),
    ("2026-02-28", "Día de Andalucía", "ES-AN", None),
    ("2026-04-02", "Jueves Santo", "ES-AN", None),
    ("2026-04-03", "Viernes Santo", "ES", None),
    ("2026-04-22", "Miércoles de Feria", "ES-AN-SE", None),
    ("2026-05-01", "Fiesta del Trabajo", "ES", None),
    ("2026-06-04", "Corpus Christi", "ES-AN-SE", None),
    ("2026-08-15", "Asunción de la Virgen", "ES", None),
    ("2026-10-12", "Fiesta Nacional de España", "ES", None),
    ("2026-11-02", "Todos los Santos", "ES-AN", "Trasladado del domingo 1 de noviembre"),
    ("2026-12-07", "Día de la Constitución", "ES-AN", "Trasladado del domingo 6 de diciembre"),
    ("2026-12-08", "Inmaculada Concepción", "ES", None),
    ("2026-12-25", "Natividad del Señor", "ES", None),
    # 2027
    ("2027-01-01", "Año Nuevo", "ES", None),
    ("2027-01-06", "Epifanía del Señor", "ES", None),
    ("2027-03-01", "Día de Andalucía", "ES-AN", "Trasladado del domingo 28 de febrero"),
    ("2027-03-25", "Jueves Santo", "ES-AN", None),
    ("2027-03-26", "Viernes Santo", "ES", None),
    ("2027-04-14", "Miércoles de Feria", "ES-AN-SE", None),
    ("2027-05-01", "Fiesta del Trabajo", "ES", None),
    ("2027-05-27", "Corpus Christi", "ES-AN-SE", None),
    ("2027-08-16", "Asunción de la Virgen", "ES-AN", "Trasladado del domingo 15 de agosto"),
    ("2027-10-12", "Fiesta Nacional de España", "ES", None),
    ("2027-11-01", "Todos los Santos", "ES", None),
    ("2027-12-06", "Día de la Constitución", "ES", None),
    ("2027-12-08", "Inmaculada Concepción", "ES", None),
    ("2027-12-25", "Natividad del Señor", "ES", None),
]

holidays = sa.table(
    "holidays",
    sa.column("date", sa.Date),
    sa.column("name", sa.String),
    sa.column("region", sa.String),
    sa.column("note", sa.String),
)


def upgrade() -> None:
    op.bulk_insert(
        holidays,
        [
            {"date": dt.date.fromisoformat(d), "name": name, "region": region, "note": note}
            for d, name, region, note in HOLIDAYS
        ],
    )


def downgrade() -> None:
    years = sorted({d[:4] for d, *_ in HOLIDAYS})
    op.execute(
        holidays.delete().where(
            holidays.c.date.between(dt.date(int(years[0]), 1, 1), dt.date(int(years[-1]), 12, 31))
        )
    )
