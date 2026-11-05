FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Primero las dependencias, para aprovechar la caché de Docker
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 8000
# Aplica las migraciones pendientes y arranca la API
CMD ["sh", "-c", "alembic upgrade head && fastapi run app/main.py --port 8000"]
