from pydantic import BaseModel
from typing import Optional

class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    role: str

    class Config:
        from_attributes = True