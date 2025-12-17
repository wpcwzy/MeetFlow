from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from .user import Base, User

class MeetingStatus(enum.Enum):
    CREATED = "created"
    STARTED = "started"
    ENDED = "ended"
    DESTROYED = "destroyed"

class ParticipantRole(enum.Enum):
    HOST = "host"
    CO_HOST = "co_host"
    PARTICIPANT = "participant"

class ParticipantStatus(enum.Enum):
    WAITING = "waiting"
    JOINED = "joined"
    LEFT = "left"
    KICKED = "kicked"

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    meeting_number = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=True)
    host_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    max_participants = Column(Integer, default=100)
    status = Column(Enum(MeetingStatus), default=MeetingStatus.CREATED)
    enable_waiting_room = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    host = relationship("User", back_populates="hosted_meetings")
    participants = relationship("Participant", back_populates="meeting", cascade="all, delete-orphan")
    recordings = relationship("Recording", back_populates="meeting", cascade="all, delete-orphan")

# Configure relationships after all classes are defined
from sqlalchemy.orm import relationship

# Note: Relationships are defined directly in the classes above

class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(Enum(ParticipantRole), default=ParticipantRole.PARTICIPANT)
    status = Column(Enum(ParticipantStatus), default=ParticipantStatus.JOINED)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User", back_populates="meeting_participations")

# Configure relationships after all classes are defined
from sqlalchemy.orm import relationship

# Note: Relationships are defined directly in the classes above