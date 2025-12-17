from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.user import UserRole

class MeetingCreate(BaseModel):
    meeting_number: Optional[str] = None
    password: Optional[str] = None
    max_participants: Optional[int] = 100

class MeetingUpdate(BaseModel):
    password: Optional[str] = None
    max_participants: Optional[int] = None
    status: Optional[str] = None

class MeetingJoinRequest(BaseModel):
    role: Optional[str] = "participant"
    password: Optional[str] = None

class MeetingResponse(BaseModel):
    id: int
    meeting_number: str
    password: Optional[str]
    host_id: int
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    max_participants: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class ParticipantCreate(BaseModel):
    user_id: int
    role: Optional[str] = "participant"

class ParticipantUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None

class ParticipantResponse(BaseModel):
    id: int
    meeting_id: int
    user_id: int
    role: str
    status: str
    joined_at: datetime
    left_at: Optional[datetime]

    class Config:
        from_attributes = True

class MeetingWithParticipants(BaseModel):
    meeting: MeetingResponse
    participants: List[ParticipantResponse]


class LiveKitSession(BaseModel):
    url: str
    token: str
    room: str
    identity: str
    user_name: str
    is_host: bool
