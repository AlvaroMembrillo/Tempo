from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración leída de variables de entorno (prefijo TEMPO_) o del archivo .env."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEMPO_", extra="ignore")

    database_url: str = "postgresql+psycopg://tempo:tempo@localhost:5433/tempo"
    secret_key: str = "solo-para-desarrollo-cambiala-en-produccion"
    access_token_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:4200"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
