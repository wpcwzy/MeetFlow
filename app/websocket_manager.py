from datetime import datetime
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    """Tracks active websocket connections per meeting."""

    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: int) -> None:
        await websocket.accept()
        self.active_connections.setdefault(meeting_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, meeting_id: int) -> None:
        connections = self.active_connections.get(meeting_id)
        if not connections:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(meeting_id, None)

    async def broadcast_to_meeting(self, meeting_id: int, message: dict) -> None:
        connections = self.active_connections.get(meeting_id)
        if not connections:
            return
        disconnected = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            connections.remove(conn)
        if connections:
            self.active_connections[meeting_id] = connections
        else:
            self.active_connections.pop(meeting_id, None)


manager = ConnectionManager()


async def broadcast_meeting_event(meeting_id: int, event_type: str, data: dict) -> None:
    """Helper to broadcast standardised meeting events."""
    message = {
        "event": event_type,
        "meeting_id": meeting_id,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await manager.broadcast_to_meeting(meeting_id, message)
