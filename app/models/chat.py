from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from .user import Base

class MessageType(enum.Enum):
    TEXT = "text"
    EMOJI = "emoji"
    FILE = "file"

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(String, nullable=False) # For file, this could be the URL
    message_type = Column(Enum(MessageType), default=MessageType.TEXT, nullable=False)
    file_name = Column(String, nullable=True) # Original file name if type is file
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    sender = relationship("User")
    meeting = relationship("Meeting")
