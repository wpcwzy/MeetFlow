import { state, setToken } from "./state.js";

const DEFAULT_API_BASE = "/api";

function normalizeHttpBase(rawBase) {
    const base = rawBase || DEFAULT_API_BASE;
    if (base.startsWith("http://") || base.startsWith("https://")) {
        return base.replace(/\/+$/, "");
    }
    // For local development, if the origin is not http/https, default to localhost:8000
    if (!window.location.origin.startsWith("http")) {
        const prefix = base.startsWith("/") ? base : `/${base}`;
        return `http://localhost:8000${prefix}`.replace(/\/+$/, "");
    }
    const prefix = base.startsWith("/") ? base : `/${base}`;
    return `${window.location.origin}${prefix}`.replace(/\/+$/, "");
}

function normalizeWsBase(rawBase) {
    const base = rawBase || window.location.origin;
    if (base.startsWith("ws://") || base.startsWith("wss://")) {
        return base.replace(/\/+$/, "");
    }
    if (base.startsWith("http://") || base.startsWith("https://")) {
        return base.replace(/^http/, "ws").replace(/\/+$/, "");
    }
    const prefix = base.startsWith("/") ? base : `/${base}`;
    const origin = window.location.origin.replace(/^http/, "ws");
    return `${origin}${prefix}`.replace(/\/+$/, "");
}

function buildUrl(base, path) {
    const cleanBase = base.replace(/\/+$/, "");
    const [purePath, query = ""] = path.split("?");
    const cleanPath = purePath.replace(/^\/+/, "");
    const url = `${cleanBase}/${cleanPath}`;
    return query ? `${url}?${query}` : url;
}

const rawApiBase = window.MEETFLOW_API_BASE || DEFAULT_API_BASE;
export const API_BASE_URL = normalizeHttpBase(rawApiBase);

const rawWsBase = window.MEETFLOW_WS_BASE || null;
export const WS_BASE_URL = normalizeWsBase(rawWsBase);

async function request(path, options = {}) {
    const {
        method = "GET",
        body = undefined,
        headers = {},
        skipAuth = false,
        formData = null,
    } = options;

    const url = buildUrl(API_BASE_URL, path);
    const fetchOptions = {
        method,
        headers: {
            ...headers,
        },
    };

    if (state.token && !skipAuth) {
        fetchOptions.headers["Authorization"] = `Bearer ${state.token}`;
    }

    if (formData) {
        fetchOptions.body = formData;
    } else if (body instanceof Blob || body instanceof ArrayBuffer) {
        fetchOptions.body = body;
    } else if (body !== undefined && body !== null) {
        fetchOptions.headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    const hasJSON = contentType.includes("application/json");
    let data = null;

    if (hasJSON) {
        data = await response.json();
    } else if (response.status !== 204) {
        data = await response.text();
    }

    if (!response.ok) {
        let detail = data?.detail ?? data?.message ?? data ?? response.statusText;
        let message = "";
        let code = null;
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
            message = detail.message || JSON.stringify(detail);
            code = detail.code || null;
        } else if (Array.isArray(detail)) {
            message = detail.join(", ");
        } else {
            message = String(detail);
        }
        const error = new Error(message || "请求失败");
        if (code) {
            error.code = code;
        }
        error.status = response.status;
        throw error;
    }

    return data;
}

export async function registerUser(email, password) {
    const payload = { email, password };
    const token = await request("/register", { method: "POST", body: payload, skipAuth: true });
    if (token?.access_token) {
        setToken(token.access_token);
    }
    return token;
}

export async function loginUser(email, password) {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    form.append("scope", "");
    form.append("grant_type", "password");
    const token = await request("/token", {
        method: "POST",
        formData: form,
        skipAuth: true,
    });
    if (token?.access_token) {
        setToken(token.access_token);
    }
    return token;
}

export async function logoutUser() {
    setToken(null);
}

export async function fetchCurrentUser() {
    return request("/users/me");
}

export async function createMeeting({ meeting_number, password, max_participants }) {
    const payload = {
        meeting_number,
        password: password || null,
        max_participants: max_participants ? Number(max_participants) : undefined,
    };
    return request("/meetings", { method: "POST", body: payload });
}

export async function getMeetingByNumber(meetingNumber) {
    const encoded = encodeURIComponent(meetingNumber);
    return request(`/meetings/by-number/${encoded}`);
}

export async function startMeeting(meetingId) {
    return request(`/meetings/${meetingId}/start`, { method: "POST" });
}

export async function endMeeting(meetingId) {
    return request(`/meetings/${meetingId}/end`, { method: "POST" });
}

export async function joinMeeting(meetingNumber, { role = "participant", password = null } = {}) {
    const payload = { role };
    if (password !== null && password !== undefined) {
        payload.password = password;
    }
    const encoded = encodeURIComponent(meetingNumber);
    return request(`/meetings/by-number/${encoded}/join`, { method: "POST", body: payload });
}

export async function updateParticipant(participantId, updates) {
    return request(`/participants/${participantId}`, { method: "PUT", body: updates });
}

export async function removeParticipant(participantId) {
    return request(`/participants/${participantId}`, { method: "DELETE" });
}

export async function kickParticipant(participantId) {
    return request(`/participants/${participantId}/kick`, { method: "POST" });
}

export async function muteParticipant(participantId) {
    return request(`/participants/${participantId}/mute`, { method: "POST" });
}

export { request };

export async function fetchLiveKitSession(meetingId) {
    return request(`/meetings/${meetingId}/livekit`);
}

export async function fetchChatHistory(meetingId) {
    return request(`/meetings/${meetingId}/chat`);
}

export async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const url = buildUrl(API_BASE_URL, "/upload");
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${state.token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(error.detail || "File upload failed");
    }

    return response.json();
}
