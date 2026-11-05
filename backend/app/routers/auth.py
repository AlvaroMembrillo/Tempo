from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import RegisterIn, Token, UserOut, UserUpdate
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Cuenta"])

EMAIL_TAKEN = HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese email")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: DbSession) -> User:
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise EMAIL_TAKEN
    user = User(email=email, password_hash=hash_password(body.password), name=body.name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # dos registros a la vez con el mismo email
        db.rollback()
        raise EMAIL_TAKEN from None
    db.refresh(user)
    return user


@router.post("/token", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession) -> Token:
    """Inicio de sesión (OAuth2): `username` es el email."""
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if not verify_password(form.password, user.password_hash if user else None):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None and field != "name":
            raise HTTPException(422, f"«{field}» no puede ser nulo")
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
