import { state, setCurrentMeeting } from "./state.js";
import { sendMessage } from "./websocket.js";
import { uploadFile } from "./api.js";

const notificationEl = document.getElementById("notification");
const accountInfoEl = document.getElementById("account-info");
const accountEmailEl = document.getElementById("account-email");
const accountRoleEl = document.getElementById("account-role");
const navAdminLink = document.getElementById("nav-admin-link");
const meetingSummaryEl = document.getElementById("meeting-summary");
const meetingActionsEl = document.getElementById("meeting-actions");
const participantsListEl = document.getElementById("participants-list");
const eventsLogEl = document.getElementById("events-log");
const wsStatusEl = document.getElementById("ws-status");
const connectWsForm = document.getElementById("connect-ws-form");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatMessages = document.getElementById("chat-messages");
const chatEmojiBtn = document.getElementById("chat-emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");
const chatFileBtn = document.getElementById("chat-file-btn");
const chatFileInput = document.getElementById("chat-file-input");

if (notificationEl && !notificationEl.dataset.baseClass) {
    notificationEl.dataset.baseClass = notificationEl.className || "toast";
}

const STATUS_LABELS = {
    created: "尚未开始",
    started: "进行中",
    ended: "已结束",
    scheduled: "尚未开始",
    pending: "等待中",
    in_progress: "进行中",
    joined: "已入会",
    left: "已离开",
    kicked: "已被移出",
};

const ROLE_LABELS = {
    host: "主持人",
    co_host: "联席主持",
    participant: "参会者",
};

export function showNotification(message, type = "success") {
    if (!notificationEl) {
        return;
    }
    notificationEl.textContent = message;
    const classes = ["toast", "toast--visible"];
    if (type === "error") {
        classes.push("toast--error");
    } else {
        classes.push("toast--success");
    }
    notificationEl.className = classes.join(" ");
}

export function clearNotification() {
    if (!notificationEl) {
        return;
    }
    notificationEl.textContent = "";
    const baseClass = notificationEl.dataset.baseClass || "toast";
    notificationEl.className = baseClass;
}

export function updateAccountInfo(user) {
    if (!accountInfoEl) {
        return;
    }
    if (user) {
        accountInfoEl.classList.remove("hidden");
        accountEmailEl.textContent = user.email;
        accountRoleEl.textContent = ROLE_LABELS[user.role] || "用户";
        
        if (navAdminLink) {
            if (user.role === "admin") {
                navAdminLink.classList.remove("hidden");
            } else {
                navAdminLink.classList.add("hidden");
            }
        }
    } else {
        accountInfoEl.classList.add("hidden");
        accountEmailEl.textContent = "";
        accountRoleEl.textContent = "";
        if (navAdminLink) navAdminLink.classList.add("hidden");
    }
}

export function renderMeetingDetails(meetingDetails) {
    setCurrentMeeting(meetingDetails);

    if (!meetingDetails) {
        if (meetingSummaryEl) {
            meetingSummaryEl.classList.add("empty");
            meetingSummaryEl.textContent = "暂无会议信息，请先加载或创建会议。";
        }
        meetingActionsEl?.classList.add("hidden");
        if (participantsListEl) {
            participantsListEl.classList.add("empty");
            participantsListEl.textContent = "当前会议暂无成员。";
        }
        if (connectWsForm) {
            delete connectWsForm.dataset.meetingId;
            const meetingNumberInput = connectWsForm.elements.namedItem("meeting_number");
            if (meetingNumberInput instanceof HTMLInputElement) {
                meetingNumberInput.value = "";
            }
        }
        return;
    }

    const { meeting, participants = [] } = meetingDetails;

    if (meetingSummaryEl) {
        meetingSummaryEl.classList.remove("empty");
        meetingSummaryEl.innerHTML = renderMeetingSummary(meeting);
    }

    if (meetingActionsEl && meetingActionsEl.querySelector("button")) {
        meetingActionsEl.classList.remove("hidden");
    }
    if (connectWsForm) {
        connectWsForm.dataset.meetingId = String(meeting.id);
        const meetingNumberInput = connectWsForm.elements.namedItem("meeting_number");
        if (meetingNumberInput instanceof HTMLInputElement && !meetingNumberInput.value) {
            meetingNumberInput.value = meeting.meeting_number ?? "";
        }
    }

    if (participantsListEl) {
        const participantsMarkup = renderParticipantsList(participants, meeting, state.currentUser);
        participantsListEl.innerHTML = participantsMarkup;
        participantsListEl.classList.toggle("empty", !participants.length);
    }

    const meetingControlsEl = document.getElementById("meeting-controls");
    if (meetingControlsEl) {
        if (state.currentUser && meeting.host_id === state.currentUser.id) {
            meetingControlsEl.classList.remove("hidden");
        } else {
            meetingControlsEl.classList.add("hidden");
        }
    }
}

function renderMeetingSummary(meeting) {
    const normalizedStatus = normalizeEnumValue(meeting.status);
    const statusLabel = STATUS_LABELS[normalizedStatus] || meeting.status || "未知状态";
    const meetingTitle = meeting.topic || `会议 ${meeting.meeting_number || meeting.id}`;

    const hostLabel = meeting.host_id ? `用户 ${meeting.host_id}` : "尚未指定";
    const startLabel = formatDate(meeting.start_time) || "尚未开始";
    const endLabel = formatDate(meeting.end_time) || "尚未结束";

    return `
        <div class="meeting-summary__headline">
            <div>
                <h3>${escapeHtml(meetingTitle)}</h3>
                <p class="helper-text">会议码：<strong>${escapeHtml(meeting.meeting_number ?? "未设置")}</strong></p>
            </div>
            <span class="badge badge--status" data-variant="${escapeHtml(meeting.status || "")}">
                ${escapeHtml(statusLabel)}
            </span>
        </div>
        <div class="meeting-meta">
            <div class="meta-group">
                ${renderMetaItem("会议号", meeting.meeting_number ?? "未设置")}
                ${renderMetaItem("主持人", hostLabel)}
            </div>
            <div class="meta-group">
                ${renderMetaItem("创建时间", formatDate(meeting.created_at))}
                ${renderMetaItem("开始时间", startLabel)}
                ${renderMetaItem("结束时间", endLabel)}
            </div>
        </div>
        <p class="meeting-summary__hint">准备好后点击上方按钮立即开会，或直接复制会议号分享给同事。</p>
    `;
}

function renderMetaItem(label, value) {
    return `
        <dl class="meta-item">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value ?? "-")}</dd>
        </dl>
    `;
}

function renderParticipantsList(participants, meeting, currentUser) {
    if (!participants || participants.length === 0) {
        return `<p class="helper-text">当前暂无参会者，分享会议号即可让同事加入。</p>`;
    }
    const currentUserId = Number(currentUser?.id ?? 0);
    const hostId = Number(meeting?.host_id ?? 0);
    const currentParticipant = participants.find((p) => Number(p.user_id) === currentUserId);
    const currentRole = hostId === currentUserId ? "host" : normalizeEnumValue(currentParticipant?.role);
    const canModerate = hostId === currentUserId || currentRole === "co_host";

    return participants
        .map((participant) => {
            const roleKey = normalizeEnumValue(participant.role);
            const statusKey = normalizeEnumValue(participant.status);
            const roleLabel = ROLE_LABELS[roleKey] || participant.role;
            const statusLabel = STATUS_LABELS[statusKey] || participant.status;
            const joinedLabel = participant.joined_at ? formatDate(participant.joined_at) : "未加入";
            const leftLabel = participant.left_at ? formatDate(participant.left_at) : "—";
            const participantUserId = Number(participant.user_id);
            const isSelf = currentUserId === participantUserId;
            const isHostParticipant = roleKey === "host";

            const actions = [];
            if (canModerate && !isSelf && statusKey === "joined" && !isHostParticipant) {
                actions.push(
                    `<button class="btn btn--ghost" data-action="mute" data-participant="${participant.id}">静音</button>`,
                );
            }
            if (canModerate && roleKey === "participant") {
                actions.push(
                    `<button class="btn btn--ghost" data-action="promote" data-participant="${participant.id}">升级为联席主持</button>`,
                );
            } else if (canModerate && roleKey === "co_host") {
                actions.push(
                    `<button class="btn btn--ghost" data-action="demote" data-participant="${participant.id}">降级为参会者</button>`,
                );
            }
            if (canModerate && !isSelf) {
                actions.push(
                    `<button class="btn btn--ghost" data-action="remove" data-participant="${participant.id}">踢出会议</button>`,
                );
            }
            if (canModerate && !isSelf && statusKey === "joined") {
                actions.push(
                    `<button class="btn btn--destructive" data-action="kick" data-participant="${participant.id}">封禁</button>`,
                );
            }

            return `
                <article class="participant-card">
                    <div class="participant-card__header">
                        <span class="participant-card__title">用户 ${escapeHtml(String(participant.user_id))}</span>
                        <span class="badge badge--status" data-variant="${escapeHtml(participant.role || "")}">${escapeHtml(roleLabel)}</span>
                    </div>
                    <div class="helper-text">状态：${escapeHtml(statusLabel || "未知")}</div>
                    ${actions.length ? `<div class="participant-actions">${actions.join("")}</div>` : ""}
                    <div class="participant-meta">
                        <span>加入于：${escapeHtml(joinedLabel)}</span>
                        <span>离开于：${escapeHtml(leftLabel)}</span>
                        <span>ID：${escapeHtml(String(participant.id))}</span>
                    </div>
                </article>
            `;
        })
        .join("");
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(value) {
    if (!value) {
        return "";
    }
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleString();
    } catch {
        return String(value);
    }
}

export function appendEvent(eventPayload) {
    if (!eventsLogEl) {
        return;
    }
    const item = document.createElement("li");
    item.className = "event-item";
    const time = new Date().toLocaleTimeString();
    const content =
        typeof eventPayload === "string"
            ? eventPayload
            : JSON.stringify(eventPayload, null, 2);
    item.innerHTML = `
        <span class="event-item__time">${escapeHtml(time)}</span>
        <pre class="event-item__body">${escapeHtml(content)}</pre>
    `;
    eventsLogEl.prepend(item);

    while (eventsLogEl.children.length > 50) {
        eventsLogEl.removeChild(eventsLogEl.lastChild);
    }
}

export function resetEventsLog() {
    if (!eventsLogEl) {
        return;
    }
    eventsLogEl.innerHTML = "";
}

export function updateWsStatus(message, status = "") {
    if (!wsStatusEl) {
        return;
    }
    wsStatusEl.textContent = message;
    const classes = ["status-indicator"];
    if (status) {
        classes.push(`status--${status}`);
    }
    wsStatusEl.className = classes.join(" ");
}

export function getParticipantsContainer() {
    return participantsListEl;
}

function normalizeEnumValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    const str = String(value);
    const parts = str.split(".");
    return parts[parts.length - 1].toLowerCase();
}

export function initChatUI() {
    if (chatSendBtn) {
        chatSendBtn.addEventListener("click", sendChatMessage);
    }
    if (chatInput) {
        chatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                sendChatMessage();
            }
        });
    }
    if (chatEmojiBtn) {
        chatEmojiBtn.addEventListener("click", () => {
            emojiPicker.classList.toggle("hidden");
        });
    }
    if (emojiPicker) {
        emojiPicker.addEventListener("click", (e) => {
            if (e.target.classList.contains("emoji-item")) {
                chatInput.value += e.target.textContent;
                emojiPicker.classList.add("hidden");
                chatInput.focus();
            }
        });
    }
    if (chatFileBtn) {
        chatFileBtn.addEventListener("click", () => {
            chatFileInput.click();
        });
    }
    if (chatFileInput) {
        chatFileInput.addEventListener("change", handleFileUpload);
    }
}

function sendChatMessage() {
    const content = chatInput.value.trim();
    if (!content) return;

    sendMessage({
        type: "chat",
        content: content,
        message_type: "text"
    });
    chatInput.value = "";
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        showNotification("正在上传文件...", "info");
        const result = await uploadFile(file);
        
        sendMessage({
            type: "chat",
            content: result.url,
            message_type: "file",
            file_name: result.filename
        });
        chatFileInput.value = "";
        showNotification("文件发送成功");
    } catch (error) {
        showNotification("文件上传失败: " + error.message, "error");
    }
}

export function appendChatMessage(message) {
    if (!chatMessages) return;

    const msgEl = document.createElement("div");
    msgEl.className = `chat-message ${message.sender_id === state.currentUser?.id ? "self" : ""}`;
    
    const senderEl = document.createElement("div");
    senderEl.className = "chat-message__sender";
    senderEl.textContent = message.sender_name;
    
    const contentEl = document.createElement("div");
    contentEl.className = "chat-message__content";
    
    if (message.message_type === "file") {
        const link = document.createElement("a");
        link.href = message.content;
        link.target = "_blank";
        link.textContent = `📄 ${message.file_name || "下载文件"}`;
        link.style.color = "inherit";
        link.style.textDecoration = "underline";
        contentEl.appendChild(link);
    } else {
        contentEl.textContent = message.content;
    }

    msgEl.appendChild(senderEl);
    msgEl.appendChild(contentEl);
    
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function renderDashboardChat(messages) {
    const container = document.getElementById("dashboard-chat-messages");
    if (!container) return;

    container.innerHTML = "";
    container.classList.remove("empty");
    
    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">
                暂无聊天记录
            </div>
        `;
        return;
    }

    messages.forEach(message => {
        const msgEl = document.createElement("div");
        msgEl.className = `chat-message ${message.sender_id === state.currentUser?.id ? "self" : ""}`;
        
        const senderEl = document.createElement("div");
        senderEl.className = "chat-message__sender";
        senderEl.textContent = message.sender_name;
        
        const contentEl = document.createElement("div");
        contentEl.className = "chat-message__content";
        
        if (message.message_type === "file") {
            const link = document.createElement("a");
            link.href = message.content;
            link.target = "_blank";
            link.textContent = `📄 ${message.file_name || "下载文件"}`;
            link.style.color = "inherit";
            link.style.textDecoration = "underline";
            contentEl.appendChild(link);
        } else {
            contentEl.textContent = message.content;
        }

        msgEl.appendChild(senderEl);
        msgEl.appendChild(contentEl);
        
        container.appendChild(msgEl);
    });
    container.scrollTop = container.scrollHeight;
}
