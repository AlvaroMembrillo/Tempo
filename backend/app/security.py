from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

ALGORITHM = "HS256"
_hasher = PasswordHash.recommended()  # Argon2
# Hash de relleno para que comprobar un email inexistente tarde lo mismo que uno real
_DUMMY_HASH = _hasher.hash("contraseña-de-relleno")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        _hasher.verify(password, _DUMMY_HASH)
        return False
    return _hasher.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def read_access_token(token: str) -> str | None:
    """Devuelve el `sub` del token, o None si no es válido o ha caducado."""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
