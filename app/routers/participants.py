from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.services.meeting import (
    add_participant,
    update_participant,
    remove_participant,
    kick_participant,
    get_meeting,
)
from app.database import get_db
from app.models.user import User
from app.models.meeting import Participant, ParticipantRole
from app.schemas.meeting import ParticipantCreate, ParticipantUpdate, ParticipantResponse
from app.dependencies import get_current_user
from app.websocket_manager import broadcast_meeting_event

router = APIRouter()

@router.post("/meetings/{meeting_id}/participants", response_model=ParticipantResponse)
async def add_participant_endpoint(
    meeting_id: int,
    participant_data: ParticipantCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    # Only host can add participants directly
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    participant = await add_participant(db, meeting_id, participant_data)
    if not participant:
        raise HTTPException(status_code=400, detail="Cannot add participant")
    
    # Broadcast event
    await broadcast_meeting_event(meeting_id, "participant_joined", {
        "participant_id": participant.id,
        "user_id": participant.user_id,
        "role": participant.role.value
    })
    
    return ParticipantResponse.from_orm(participant)

@router.put("/participants/{participant_id}", response_model=ParticipantResponse)
async def update_participant_endpoint(
    participant_id: int,
    participant_update: ParticipantUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Get participant to check permissions
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalars().first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    meeting = await get_meeting(db, participant.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Only host can update roles
    if participant_update.role and meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to change roles")

    updated_participant = await update_participant(db, participant_id, participant_update)
    
    # Broadcast event
    await broadcast_meeting_event(meeting.id, "participant_updated", {
        "participant_id": updated_participant.id,
        "user_id": updated_participant.user_id,
        "role": updated_participant.role.value if updated_participant.role else None,
        "status": updated_participant.status.value if updated_participant.status else None
    })
    
    return ParticipantResponse.from_orm(updated_participant)

async def _get_actor_participant(db: AsyncSession, meeting_id: int, user_id: int) -> Optional[Participant]:
    result = await db.execute(
        select(Participant).where(
            Participant.meeting_id == meeting_id,
            Participant.user_id == user_id,
        )
    )
    return result.scalars().first()


def _can_moderate(meeting, actor_participant, current_user: User) -> bool:
    if meeting.host_id == current_user.id:
        return True
    if actor_participant and actor_participant.role == ParticipantRole.CO_HOST:
        return True
    return False


@router.delete("/participants/{participant_id}")
async def remove_participant_endpoint(
    participant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Get participant to check permissions
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalars().first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    meeting = await get_meeting(db, participant.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    actor_participant = await _get_actor_participant(db, meeting.id, current_user.id)

    # Host/co-host can remove anyone, members can still remove themselves
    if not _can_moderate(meeting, actor_participant, current_user) and participant.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    success = await remove_participant(db, participant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Participant not found")

    await broadcast_meeting_event(meeting.id, "participant_removed", {
        "participant_id": participant_id,
        "user_id": participant.user_id,
        "removed_by": current_user.id
    })
    return {"message": "Participant removed"}

@router.post("/participants/{participant_id}/kick")
async def kick_participant_endpoint(
    participant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Get participant to check permissions
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalars().first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    meeting = await get_meeting(db, participant.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    actor_participant = await _get_actor_participant(db, meeting.id, current_user.id)
    if not _can_moderate(meeting, actor_participant, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    success = await kick_participant(db, participant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    # Broadcast event
    await broadcast_meeting_event(meeting.id, "participant_kicked", {
        "participant_id": participant_id,
        "user_id": participant.user_id,
        "kicked_by": current_user.id
    })
    
    return {"message": "Participant kicked"}

@router.post("/participants/{participant_id}/mute")
async def mute_participant_endpoint(
    participant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalars().first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    meeting = await get_meeting(db, participant.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    actor_participant = await _get_actor_participant(db, meeting.id, current_user.id)
    if not _can_moderate(meeting, actor_participant, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    await broadcast_meeting_event(meeting.id, "participant_muted", {
        "participant_id": participant_id,
        "user_id": participant.user_id,
        "muted_by": current_user.id
    })

    return {"message": "Participant muted"}
