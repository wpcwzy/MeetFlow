from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime

from app.database import get_db
from app.models.user import User, UserRole
from app.models.meeting import Meeting, MeetingStatus
from app.models.chat import ChatMessage, MessageType
from app.schemas.user import UserResponse
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)

async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)

    # Total Users
    user_count = (await db.execute(select(func.count(User.id)))).scalar()
    admin_count = (await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.ADMIN)
    )).scalar()
    
    # New Users Today
    new_users_count = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= today_start)
    )).scalar()

    # Total Meetings
    meeting_count = (await db.execute(select(func.count(Meeting.id)))).scalar()

    # Active Meetings (Started)
    active_meeting_count = (await db.execute(
        select(func.count(Meeting.id)).where(Meeting.status == MeetingStatus.STARTED)
    )).scalar()
    
    # Ended Meetings
    ended_meeting_count = (await db.execute(
        select(func.count(Meeting.id)).where(Meeting.status == MeetingStatus.ENDED)
    )).scalar()

    # Meetings Today
    meetings_today_count = (await db.execute(
        select(func.count(Meeting.id)).where(Meeting.created_at >= today_start)
    )).scalar()

    # Total Chat Messages
    message_count = (await db.execute(select(func.count(ChatMessage.id)))).scalar()
    
    # Messages Today
    messages_today_count = (await db.execute(
        select(func.count(ChatMessage.id)).where(ChatMessage.created_at >= today_start)
    )).scalar()
    
    # Average participants per meeting
    result = await db.execute(
        select(Meeting.id, func.count(Meeting.id).label('participant_count'))
        .join(Meeting.participants)
        .group_by(Meeting.id)
    )
    participant_counts = [row.participant_count for row in result]
    avg_participants = sum(participant_counts) / len(participant_counts) if participant_counts else 0

    return {
        "total_users": user_count,
        "admin_count": admin_count,
        "new_users_today": new_users_count,
        "total_meetings": meeting_count,
        "active_meetings": active_meeting_count,
        "ended_meetings": ended_meeting_count,
        "meetings_today": meetings_today_count,
        "total_messages": message_count,
        "messages_today": messages_today_count,
        "avg_participants_per_meeting": round(avg_participants, 2)
    }

@router.get("/users", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    query = select(User).order_by(desc(User.created_at)).offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    return users

@router.get("/meetings")
async def get_meetings(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    query = select(Meeting).options(
        selectinload(Meeting.host),
        selectinload(Meeting.participants)
    ).order_by(desc(Meeting.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    meetings = result.scalars().all()
    
    return [
        {
            "id": m.id,
            "meeting_number": m.meeting_number,
            "host_email": m.host.email if m.host else "Unknown",
            "status": m.status,
            "start_time": m.start_time,
            "created_at": m.created_at,
            "participant_count": len(m.participants)
        }
        for m in meetings
    ]

@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    # Get recent users
    recent_users = await db.execute(
        select(User).order_by(desc(User.created_at)).limit(5)
    )
    users = recent_users.scalars().all()
    
    # Get recent meetings
    recent_meetings = await db.execute(
        select(Meeting).options(selectinload(Meeting.host))
        .order_by(desc(Meeting.created_at)).limit(5)
    )
    meetings = recent_meetings.scalars().all()
    
    # Get recent messages
    recent_messages = await db.execute(
        select(ChatMessage).options(
            selectinload(ChatMessage.sender),
            selectinload(ChatMessage.meeting)
        ).order_by(desc(ChatMessage.created_at)).limit(5)
    )
    messages = recent_messages.scalars().all()
    
    activities = []
    
    for user in users:
        activities.append({
            "type": "user_registered",
            "description": f"新用户注册: {user.email}",
            "timestamp": user.created_at,
            "user_email": user.email
        })
    
    for meeting in meetings:
        activities.append({
            "type": "meeting_created",
            "description": f"会议创建: {meeting.meeting_number}",
            "timestamp": meeting.created_at,
            "host_email": meeting.host.email if meeting.host else "Unknown"
        })
    
    for msg in messages:
        activities.append({
            "type": "message_sent",
            "description": f"{msg.sender.email if msg.sender else 'Unknown'} 在会议中发送消息",
            "timestamp": msg.created_at,
            "sender_email": msg.sender.email if msg.sender else "Unknown"
        })
    
    # Sort by timestamp
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities[:limit]

@router.get("/system-health")
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    import psutil
    import os
    
    # System metrics
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    return {
        "cpu_usage": cpu_percent,
        "memory_total": memory.total,
        "memory_used": memory.used,
        "memory_percent": memory.percent,
        "disk_total": disk.total,
        "disk_used": disk.used,
        "disk_percent": disk.percent
    }
