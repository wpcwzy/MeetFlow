from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .user import Base

class RecordingStatus(enum.Enum):
    STARTING = "starting"
    RECORDING = "recording"
    FINISHED = "finished"
    FAILED = "failed"

class Recording(Base):
    __tablename__ = "recordings"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    file_path = Column(String, nullable=True)
    status = Column(Enum(RecordingStatus), default=RecordingStatus.STARTING)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)

    meeting = relationship("Meeting", back_populates="recordings")
