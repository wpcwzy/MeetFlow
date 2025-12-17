import { state } from "./state.js";
import { WS_BASE_URL } from "./api.js";

let meetingSocket = null;
let activeMeetingId = null;

export function isConnected() {
    return meetingSocket !== null && meetingSocket.readyState === WebSocket.OPEN;
}

export function getActiveMeetingId() {
    return activeMeetingId;
}

export function connectMeeting(meetingId, { onOpen, onClose, onError, onEvent } = {}) {
    if (!state.token) {
        throw new Error("Please sign in before connecting.");
    }
    if (meetingSocket) {
        meetingSocket.close();
        meetingSocket = null;
    }
    const url = new URL(`/ws/meetings/${meetingId}`, WS_BASE_URL);
    url.searchParams.set("token", state.token);
    meetingSocket = new WebSocket(url);
    activeMeetingId = meetingId;

    meetingSocket.onopen = (event) => {
        onOpen?.(event);
    };

    meetingSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            onEvent?.(data);
        } catch (err) {
            onError?.(err);
        }
    };

    meetingSocket.onerror = (event) => {
        onError?.(event);
    };

    meetingSocket.onclose = (event) => {
        onClose?.(event);
        meetingSocket = null;
        activeMeetingId = null;
    };

    return meetingSocket;
}

export function disconnectMeeting() {
    if (meetingSocket) {
        meetingSocket.close();
    }
}

export function sendMessage(message) {
    // Send a message to the websocket
    if (!isConnected()) {
        throw new Error("WebSocket is not connected.");
    }
    meetingSocket.send(JSON.stringify(message));
}
