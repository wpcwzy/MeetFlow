from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.meeting import (
    create_meeting,
    get_meeting,
    get_meeting_by_number,
    update_meeting,
    delete_meeting,
    start_meeting,
    end_meeting,
    get_meeting_with_details,
    add_participant,
    get_participant_by_user,
)
from app.services.chat import get_chat_messages
from app.database import get_db
from app.models.user import User
from app.models.meeting import ParticipantStatus
from app.schemas.meeting import (
    MeetingCreate,
    MeetingUpdate,
    MeetingJoinRequest,
    MeetingResponse,
    MeetingWithParticipants,
    ParticipantCreate,
    ParticipantResponse,
    LiveKitSession,
)
from app.schemas.chat import ChatMessageResponse
from app.dependencies import get_current_user
from typing import List
from app.websocket_manager import broadcast_meeting_event
from app.services.livekit import create_livekit_token, LiveKitConfigurationError

router = APIRouter()


def _ensure_meeting_password(meeting, provided_password: str | None):
    if meeting.password:
        if not provided_password:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "password_required",
                    "message": "会议已设置入会密码，请输入后再试。",
                },
            )
        if meeting.password != provided_password:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "password_invalid",
                    "message": "入会密码不正确，请重新输入。",
                },
            )

@router.post("/meetings", response_model=MeetingResponse)
async def create_meeting_endpoint(
    meeting_data: MeetingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await create_meeting(db, meeting_data, current_user.id)
    return MeetingResponse.from_orm(meeting)

@router.post("/meetings/{meeting_id}/join", response_model=ParticipantResponse)
async def join_meeting_endpoint(
    meeting_id: int,
    join_request: MeetingJoinRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    _ensure_meeting_password(meeting, join_request.password)

    participant_data = ParticipantCreate(user_id=current_user.id, role=join_request.role)
    participant = await add_participant(db, meeting_id, participant_data)
    if not participant:
        raise HTTPException(status_code=403, detail="无法加入会议，可能已被主持人移出。")

    await broadcast_meeting_event(
        meeting_id,
        "participant_joined",
        {
            "participant_id": participant.id,
            "user_id": participant.user_id,
            "role": participant.role.value,
        },
    )
    return ParticipantResponse.from_orm(participant)


@router.post("/meetings/by-number/{meeting_number}/join", response_model=ParticipantResponse)
async def join_meeting_by_number_endpoint(
    meeting_number: str,
    join_request: MeetingJoinRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    meeting = await get_meeting_by_number(db, meeting_number)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    _ensure_meeting_password(meeting, join_request.password)

    participant_data = ParticipantCreate(user_id=current_user.id, role=join_request.role)
    participant = await add_participant(db, meeting.id, participant_data)
    if not participant:
        raise HTTPException(status_code=403, detail="无法加入会议，可能已被主持人移出。")

    await broadcast_meeting_event(
        meeting.id,
        "participant_joined",
        {
            "participant_id": participant.id,
            "user_id": participant.user_id,
            "role": participant.role.value,
        },
    )
    return ParticipantResponse.from_orm(participant)


@router.get("/meetings/{meeting_id}", response_model=MeetingWithParticipants)
async def get_meeting_endpoint(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting_details = await get_meeting_with_details(db, meeting_id)
    if not meeting_details:
        raise HTTPException(status_code=404, detail="Meeting not found")
    # Check if user is host or participant
    if (meeting_details.meeting.host_id != current_user.id and
        not any(p.user_id == current_user.id for p in meeting_details.participants)):
        raise HTTPException(status_code=403, detail="Not authorized to view this meeting")
    return meeting_details


@router.get("/meetings/by-number/{meeting_number}", response_model=MeetingWithParticipants)
async def get_meeting_by_number_endpoint(
    meeting_number: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    meeting = await get_meeting_by_number(db, meeting_number)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    meeting_details = await get_meeting_with_details(db, meeting.id)
    if not meeting_details:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if (
        meeting.host_id != current_user.id
        and not any(p.user_id == current_user.id for p in meeting_details.participants)
    ):
        raise HTTPException(status_code=403, detail="Not authorized to view this meeting")
    return meeting_details

@router.get("/meetings/{meeting_id}/livekit", response_model=LiveKitSession)
async def get_livekit_session(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if not settings.livekit_configured:
        raise HTTPException(status_code=503, detail="LiveKit integration is not configured.")

    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    is_host = meeting.host_id == current_user.id
    participant = None
    if not is_host:
        participant = await get_participant_by_user(db, meeting_id, current_user.id)
        if not participant:
            raise HTTPException(status_code=403, detail="Not authorized to join this meeting")
        if participant.status in (ParticipantStatus.LEFT, ParticipantStatus.KICKED):
            raise HTTPException(status_code=403, detail="Access to this meeting has been revoked")

    try:
        token = create_livekit_token(
            identity=str(current_user.id),
            name=current_user.email,
            room_name=meeting.meeting_number,
            is_host=is_host,
            metadata={"meeting_id": meeting_id, "user_id": current_user.id},
        )
    except LiveKitConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return LiveKitSession(
        url=settings.livekit_public_url,
        token=token,
        room=meeting.meeting_number,
        identity=str(current_user.id),
        user_name=current_user.email,
        is_host=is_host,
    )

@router.put("/meetings/{meeting_id}", response_model=MeetingResponse)
async def update_meeting_endpoint(
    meeting_id: int,
    meeting_update: MeetingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await get_meeting(db, meeting_id)
    if not meeting or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    updated_meeting = await update_meeting(db, meeting_id, meeting_update)
    return MeetingResponse.from_orm(updated_meeting)

@router.delete("/meetings/{meeting_id}")
async def delete_meeting_endpoint(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await get_meeting(db, meeting_id)
    if not meeting or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    success = await delete_meeting(db, meeting_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"message": "Meeting deleted"}

@router.post("/meetings/{meeting_id}/start", response_model=MeetingResponse)
async def start_meeting_endpoint(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await get_meeting(db, meeting_id)
    if not meeting or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    started_meeting = await start_meeting(db, meeting_id)
    if not started_meeting:
        raise HTTPException(status_code=400, detail="Cannot start meeting")
    
    # Broadcast event
    await broadcast_meeting_event(meeting_id, "meeting_started", {
        "host_id": current_user.id,
        "start_time": str(started_meeting.start_time)
    })
    
    return MeetingResponse.from_orm(started_meeting)

@router.post("/meetings/{meeting_id}/end", response_model=MeetingResponse)
async def end_meeting_endpoint(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = await get_meeting(db, meeting_id)
    if not meeting or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    ended_meeting = await end_meeting(db, meeting_id)
    if not ended_meeting:
        raise HTTPException(status_code=400, detail="Cannot end meeting")
    
    # Broadcast event
    await broadcast_meeting_event(meeting_id, "meeting_ended", {
        "host_id": current_user.id,
        "end_time": str(ended_meeting.end_time)
    })
    
    return MeetingResponse.from_orm(ended_meeting)

@router.get("/meetings/{meeting_id}/chat", response_model=List[ChatMessageResponse])
async def get_chat_history(
    meeting_id: int,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get chat history for a meeting.
    """
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check if user is participant or host
    # This logic is similar to other endpoints, could be refactored
    is_host = meeting.host_id == current_user.id
    if not is_host:
        participant = await get_participant_by_user(db, meeting_id, current_user.id)
        if not participant:
             raise HTTPException(status_code=403, detail="Not a participant of this meeting")

    messages = await get_chat_messages(db, meeting_id, skip, limit)
    
    # Map to response schema
    response = []
    for msg in messages:
        # We need to fetch sender name. 
        # Ideally we should join with User table in get_chat_messages
        # For now, let's assume msg.sender is loaded or we can access it.
        # Since get_chat_messages uses sync query (wait, I defined it as async but used sync query style?)
        # Let's check app/services/chat.py again.
        
        response.append(ChatMessageResponse(
            id=msg.id,
            meeting_id=msg.meeting_id,
            sender_id=msg.sender_id,
            sender_name=msg.sender.email if msg.sender else "Unknown",
            content=msg.content,
            message_type=msg.message_type,
            file_name=msg.file_name,
            created_at=msg.created_at
        ))
    return response
