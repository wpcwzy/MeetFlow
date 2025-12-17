from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.auth import authenticate_user, create_access_token, create_user, get_user_by_email
from app.services.user import get_user, update_user, delete_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, Token
from app.schemas.user import UserUpdate, UserResponse
from app.dependencies import get_current_user
from datetime import timedelta

router = APIRouter()

@router.post("/register", response_model=Token)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    db_user = await get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    db_user = await create_user(db, user)
    access_token = create_access_token(data={"sub": db_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/users/me")
async def update_user_me(user_update: UserUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    updated_user = await update_user(db, current_user.id, user_update)
    return {"email": updated_user.email, "role": updated_user.role}

@router.delete("/users/me")
async def delete_user_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await delete_user(db, current_user.id)
    return {"message": "User deleted"}

@router.post("/forgot-password")
async def forgot_password(email: str, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=400, detail="Email not found")
    # In a real app, send email with reset token
    reset_token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(minutes=15))
    return {"message": "Reset email sent", "reset_token": reset_token}  # For demo, return token

@router.post("/oauth/google")
async def oauth_google(token: str, db: AsyncSession = Depends(get_db)):
    # In a real app, verify Google token
    # For demo, assume token is email
    email = token  # Simplified
    user = await get_user_by_email(db, email)
    if not user:
        # Create user
        user_create = UserCreate(email=email, password="oauth_password")  # Dummy password
        user = await create_user(db, user_create)
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}