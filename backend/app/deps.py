import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db import Base, get_db
from app.models import User
from app.security import read_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión no válida o caducada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    sub = read_access_token(token)
    if sub is None:
        raise unauthorized
    try:
        user = db.get(User, uuid.UUID(sub))
    except ValueError:
        raise unauthorized from None
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_owned[M: Base](db: Session, model: type[M], id: uuid.UUID, user: User) -> M:
    """Devuelve el objeto si existe y es del usuario; si no, 404 (sin revelar si existe)."""
    obj = db.get(model, id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise HTTPException(status_code=404, detail="No encontrado")
    return obj
