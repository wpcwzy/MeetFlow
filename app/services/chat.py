from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.models.chat import ChatMessage, MessageType
from app.schemas.chat import ChatMessageCreate

async def create_chat_message(db: AsyncSession, meeting_id: int, sender_id: int, message: ChatMessageCreate):
    db_message = ChatMessage(
        meeting_id=meeting_id,
        sender_id=sender_id,
        content=message.content,
        message_type=message.message_type,
        file_name=message.file_name
    )
    db.add(db_message)
    await db.commit()
    await db.refresh(db_message)
    return db_message

async def get_chat_messages(db: AsyncSession, meeting_id: int, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.meeting_id == meeting_id)
        .order_by(ChatMessage.created_at.asc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(ChatMessage.sender))
    )
    return result.scalars().all()
