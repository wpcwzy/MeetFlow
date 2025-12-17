from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt

from app.database import get_db, create_tables
from app.services.auth import SECRET_KEY, ALGORITHM, get_user_by_email
from app.services.meeting import get_meeting, get_meeting_with_details
from app.services.chat import create_chat_message
from app.schemas.chat import ChatMessageCreate, MessageType
from app.routers.auth import router as auth_router
from app.routers.meetings import router as meetings_router
from fastapi.staticfiles import StaticFiles
from app.routers.participants import router as participants_router
from app.routers.upload import router as upload_router
from app.routers.admin import router as admin_router
from app.routers.recordings import router as recordings_router
from app.websocket_manager import manager
from fastapi.responses import FileResponse

app = FastAPI()

# Mount uploads directory
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")
app.mount("/styles", StaticFiles(directory="frontend/styles"), name="styles")
app.mount("/scripts", StaticFiles(directory="frontend/scripts"), name="scripts")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(meetings_router)
app.include_router(participants_router)
app.include_router(upload_router)
app.include_router(admin_router)
app.include_router(recordings_router)

@app.get("/admin")
async def read_admin():
    return FileResponse("frontend/admin.html")

@app.on_event("startup")
async def startup_event():
    await create_tables()

# WebSocket endpoint for meeting events
@app.websocket("/ws/meetings/{meeting_id}")
async def meeting_websocket(websocket: WebSocket, meeting_id: int, token: str):
    # Authenticate user
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            await websocket.close(code=1008)
            return
    except JWTError:
        await websocket.close(code=1008)
        return

    # Check if user has access to meeting
    db_gen = get_db()
    db = await db_gen.__anext__()
    try:
        user = await get_user_by_email(db, email)
        if not user:
            await websocket.close(code=1008)
            return

        meeting = await get_meeting(db, meeting_id)
        if not meeting:
            await websocket.close(code=1008)
            return

        meeting_details = await get_meeting_with_details(db, meeting_id)
        participants = meeting_details.participants if meeting_details else []
        is_participant = any(p.user_id == user.id for p in participants)
        if meeting.host_id != user.id and not is_participant:
            await websocket.close(code=1008)
            return

        await manager.connect(websocket, meeting_id)
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "chat":
                    # Create chat message
                    chat_msg = ChatMessageCreate(
                        content=data.get("content"),
                        message_type=MessageType(data.get("message_type", "text")),
                        file_name=data.get("file_name")
                    )
                    saved_msg = await create_chat_message(db, meeting_id, user.id, chat_msg)
                    
                    # Broadcast message
                    await manager.broadcast_to_meeting(meeting_id, {
                        "event": "chat_message",
                        "data": {
                            "id": saved_msg.id,
                            "sender_id": user.id,
                            "sender_name": user.email, # Or user.name if available
                            "content": saved_msg.content,
                            "message_type": saved_msg.message_type.value,
                            "file_name": saved_msg.file_name,
                            "created_at": saved_msg.created_at.isoformat()
                        }
                    })
        except WebSocketDisconnect:
            manager.disconnect(websocket, meeting_id)
    finally:
        await db_gen.aclose()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
