# Tempo · Backend

API de Tempo hecha con **FastAPI** y **PostgreSQL**.

## Requisitos

- [uv](https://docs.astral.sh/uv/) (instala Python 3.13 y las dependencias por su cuenta)
- Docker (para la base de datos)

## Arrancar en local

```bash
cd backend
docker compose up -d db          # PostgreSQL en localhost:5433
uv run alembic upgrade head      # crea las tablas y carga los festivos
uv run fastapi dev app/main.py   # API en http://localhost:8000 (recarga al guardar)
```

La documentación interactiva queda en <http://localhost:8000/docs>: desde ahí se puede
registrar un usuario, pulsar **Authorize** y probar cualquier ruta.

> La base de datos se publica en el puerto **5433** para no chocar con un PostgreSQL
> que ya tengas instalado en el 5432.

Para levantarlo todo en contenedores (aplica las migraciones al arrancar):

```bash
docker compose up --build
```

## Configuración

Variables de entorno con prefijo `TEMPO_` (o un archivo `.env`; ver `.env.example`):

| Variable | Para qué |
|---|---|
| `TEMPO_DATABASE_URL` | Conexión a PostgreSQL |
| `TEMPO_SECRET_KEY` | Firma de los tokens. **Cámbiala en producción** |
| `TEMPO_ACCESS_TOKEN_MINUTES` | Duración de la sesión (por defecto, una semana) |
| `TEMPO_CORS_ORIGINS` | Orígenes del frontend permitidos |

## Tests

Usan la base de datos `tempo_test` del mismo contenedor y aplican las migraciones reales:

```bash
docker compose up -d db
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

## Migraciones

```bash
uv run alembic revision --autogenerate -m "lo que cambia"   # tras tocar app/models.py
uv run alembic upgrade head
uv run alembic check      # comprueba que modelos y migraciones coinciden
```

Los festivos de cada año nuevo se añaden con una migración de datos, como
`alembic/versions/0002_festivos_2026_2027.py`.

## Rutas

| Ruta | Qué hace |
|---|---|
| `POST /auth/register` · `POST /auth/token` · `GET/PATCH /auth/me` | Cuenta e inicio de sesión (JWT) |
| `/projects` | Proyectos con cliente y tarifa por hora |
| `/events?from=&to=` | Eventos; con `from`/`to`, los que se solapan con ese periodo |
| `/time-blocks` y `/time-blocks/{id}/exceptions` | Horas no disponibles y días sueltos quitados |
| `GET /holidays?from=&to=&region=` | Festivos de la región del usuario (por defecto, Sevilla) |
| `GET /reports/projects?from=&to=` | Horas e importe por proyecto en un periodo |
| `GET /data/export` · `POST /data/import` | Copia de seguridad y subida de lo guardado en el navegador |

El JSON va en camelCase y con la misma forma que usa el frontend, así que los datos de
`localStorage` se pueden importar tal cual.

## Decisiones de diseño

- **Dinero en `NUMERIC(10,2)`**, nunca en coma flotante.
- **Eventos en `timestamptz`** (instantes exactos); la API rechaza fechas sin zona horaria.
- **Las franjas se guardan como reglas** (días + horas locales) y no como una fila por día;
  por eso cada usuario tiene su zona horaria (`Europe/Madrid` por defecto).
- **Festivos en la base de datos** por región (`ES` → `ES-AN` → `ES-AN-SE`): una región
  incluye los de sus «padres».
- **Cada usuario solo ve lo suyo**: pedir algo de otro devuelve 404, sin revelar que existe.
