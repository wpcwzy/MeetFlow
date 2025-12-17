from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.models.chat import MessageType

class ChatMessageCreate(BaseModel):
    content: str
    message_type: MessageType = MessageType.TEXT
    file_name: Optional[str] = None

class ChatMessageResponse(BaseModel):
    id: int
    meeting_id: int
    sender_id: int
    sender_name: str
    content: str
    message_type: MessageType
    file_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
