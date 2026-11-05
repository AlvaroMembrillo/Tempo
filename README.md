# Tempo
Aplicación para gestionar las horas de trabajo, organizarse por proyectos, calcular facturas...

## Estructura

| Carpeta | Qué hay |
|---|---|
| [`frontend/`](frontend) | Aplicación web en Angular (calendario, proyectos, horas no disponibles) |
| [`backend/`](backend) | API en FastAPI con PostgreSQL ([cómo arrancarla](backend/README.md)) |

## Arrancar en local

```bash
# Backend (necesita uv y Docker)
cd backend
docker compose up -d db
uv run alembic upgrade head
uv run fastapi dev app/main.py     # http://localhost:8000/docs

# Frontend (en otra terminal)
cd frontend
pnpm install
pnpm start                         # http://localhost:4200
```

El frontend necesita el backend arrancado: los datos se guardan en tu cuenta. La
dirección de la API está en `frontend/src/app/core/api.ts` (`http://localhost:8000`).

Si antes usabas Tempo sin cuenta, lo que tenías guardado en el navegador se sube
solo a tu cuenta la primera vez que inicias sesión (y queda una copia en
`localStorage`, en la clave `tempo.copia-antes-de-subir`).
