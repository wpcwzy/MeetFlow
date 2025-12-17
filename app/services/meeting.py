from datetime import datetime
import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import (
    Meeting,
    Participant,
    MeetingStatus,
    ParticipantRole,
    ParticipantStatus,
)
from app.schemas.meeting import (
    MeetingCreate,
    MeetingUpdate,
    MeetingResponse,
    ParticipantCreate,
    ParticipantUpdate,
    ParticipantResponse,
    MeetingWithParticipants,
)


# Meeting CRUD -----------------------------------------------------------------
async def create_meeting(db: AsyncSession, meeting_data: MeetingCreate, host_id: int) -> Meeting:
    """Create a meeting row and ensure a unique meeting number."""
    meeting_number = meeting_data.meeting_number or str(uuid.uuid4())[:8]

    meeting = Meeting(
        meeting_number=meeting_number,
        password=meeting_data.password,
        host_id=host_id,
        max_participants=meeting_data.max_participants,
        enable_waiting_room=False,
    )
    db.add(meeting)
    await db.flush()

    host_participant = Participant(
        meeting_id=meeting.id,
        user_id=host_id,
        role=ParticipantRole.HOST,
        status=ParticipantStatus.JOINED,
    )
    db.add(host_participant)

    await db.commit()
    await db.refresh(meeting)
    return meeting


async def get_meeting(db: AsyncSession, meeting_id: int) -> Optional[Meeting]:
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    return result.scalars().first()


async def get_meeting_by_number(db: AsyncSession, meeting_number: str) -> Optional[Meeting]:
    result = await db.execute(select(Meeting).where(Meeting.meeting_number == meeting_number))
    return result.scalars().first()


async def update_meeting(db: AsyncSession, meeting_id: int, meeting_update: MeetingUpdate) -> Optional[Meeting]:
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalars().first()
    if not meeting:
        return None

    if meeting_update.password is not None:
        meeting.password = meeting_update.password
    if meeting_update.max_participants is not None:
        meeting.max_participants = meeting_update.max_participants
    if meeting_update.status:
        meeting.status = MeetingStatus(meeting_update.status)

    await db.commit()
    await db.refresh(meeting)
    return meeting


async def delete_meeting(db: AsyncSession, meeting_id: int) -> bool:
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalars().first()
    if not meeting:
        return False

    await db.delete(meeting)
    await db.commit()
    return True


# Meeting lifecycle ------------------------------------------------------------
async def start_meeting(db: AsyncSession, meeting_id: int) -> Optional[Meeting]:
    meeting = await get_meeting(db, meeting_id)
    if meeting and meeting.status == MeetingStatus.CREATED:
        meeting.status = MeetingStatus.STARTED
        meeting.start_time = datetime.utcnow()
        await db.commit()
        await db.refresh(meeting)
    return meeting


async def end_meeting(db: AsyncSession, meeting_id: int) -> Optional[Meeting]:
    meeting = await get_meeting(db, meeting_id)
    if meeting and meeting.status == MeetingStatus.STARTED:
        meeting.status = MeetingStatus.ENDED
        meeting.end_time = datetime.utcnow()
        await db.commit()
        await db.refresh(meeting)
    return meeting


# Participant management -------------------------------------------------------
async def add_participant(db: AsyncSession, meeting_id: int, participant_data: ParticipantCreate) -> Optional[Participant]:
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        return None

    result = await db.execute(
        select(Participant).where(
            Participant.meeting_id == meeting_id,
            Participant.user_id == participant_data.user_id,
        )
    )
    existing = result.scalars().first()
    if existing:
        if existing.status == ParticipantStatus.KICKED:
            return None
        existing.status = ParticipantStatus.JOINED
        existing.left_at = None
        await db.commit()
        await db.refresh(existing)
        return existing

    participant = Participant(
        meeting_id=meeting_id,
        user_id=participant_data.user_id,
        role=ParticipantRole(participant_data.role),
        status=ParticipantStatus.JOINED,
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return participant


async def get_participant(db: AsyncSession, participant_id: int) -> Optional[Participant]:
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    return result.scalars().first()


async def get_participant_by_user(db: AsyncSession, meeting_id: int, user_id: int) -> Optional[Participant]:
    result = await db.execute(
        select(Participant).where(
            Participant.meeting_id == meeting_id,
            Participant.user_id == user_id,
        )
    )
    return result.scalars().first()


async def update_participant(
    db: AsyncSession,
    participant_id: int,
    participant_update: ParticipantUpdate,
) -> Optional[Participant]:
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalars().first()
    if not participant:
        return None

    if participant_update.role:
        participant.role = ParticipantRole(participant_update.role)
    if participant_update.status:
        participant.status = ParticipantStatus(participant_update.status)
        if participant_update.status in {"left", ParticipantStatus.LEFT.value}:
            participant.left_at = datetime.utcnow()

    await db.commit()
    await db.refresh(participant)
    return participant


async def remove_participant(db: AsyncSession, participant_id: int) -> bool:
    participant = await get_participant(db, participant_id)
    if not participant:
        return False

    participant.status = ParticipantStatus.LEFT
    participant.left_at = datetime.utcnow()
    await db.commit()
    return True


async def kick_participant(db: AsyncSession, participant_id: int) -> bool:
    participant = await get_participant(db, participant_id)
    if not participant:
        return False

    participant.status = ParticipantStatus.KICKED
    participant.left_at = datetime.utcnow()
    await db.commit()
    return True


# Read models ------------------------------------------------------------------
async def get_meeting_with_details(db: AsyncSession, meeting_id: int) -> Optional[MeetingWithParticipants]:
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        return None

    participants_result = await db.execute(select(Participant).where(Participant.meeting_id == meeting_id))
    participants: List[Participant] = participants_result.scalars().all()

    return MeetingWithParticipants(
        meeting=MeetingResponse.from_orm(meeting),
        participants=[ParticipantResponse.from_orm(p) for p in participants],
    )
