import os

# Antes de importar la app: los tests usan su propia base de datos
os.environ["TEMPO_DATABASE_URL"] = os.environ.get(
    "TEMPO_TEST_DATABASE_URL", "postgresql+psycopg://tempo:tempo@localhost:5433/tempo_test"
)

from collections.abc import Callable, Iterator  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from alembic import command  # noqa: E402
from app.db import engine, get_db  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session", autouse=True)
def database() -> None:
    """Base de datos limpia con las migraciones reales (esquema y festivos)."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    command.upgrade(Config(BACKEND_DIR / "alembic.ini"), "head")


@pytest.fixture
def db() -> Iterator[Session]:
    """Sesión dentro de una transacción que se deshace al acabar cada test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(client: TestClient) -> Callable[..., dict[str, str]]:
    """Crea un usuario y devuelve las cabeceras con su token."""

    def make(email: str = "ana@example.com", password: str = "contraseña-segura") -> dict:
        r = client.post("/auth/register", json={"email": email, "password": password})
        assert r.status_code == 201, r.text
        r = client.post("/auth/token", data={"username": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return make


@pytest.fixture
def auth(make_user) -> dict[str, str]:
    return make_user()
