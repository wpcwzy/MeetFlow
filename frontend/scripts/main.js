import {
    registerUser,
    loginUser,
    logoutUser,
    fetchCurrentUser,
    createMeeting,
    getMeetingByNumber,
    startMeeting,
    endMeeting,
    joinMeeting,
    updateParticipant,
    removeParticipant,
    kickParticipant,
    fetchLiveKitSession,
    muteParticipant,
    fetchChatHistory,
} from "./api.js";
import {
    showNotification,
    clearNotification,
    updateAccountInfo,
    renderMeetingDetails,
    appendEvent,
    resetEventsLog,
    updateWsStatus,
    getParticipantsContainer,
    initChatUI,
    appendChatMessage,
    renderDashboardChat,
} from "./ui.js";
import { state, setCurrentUser, resetState } from "./state.js";
import { connectMeeting, disconnectMeeting, getActiveMeetingId } from "./websocket.js";
import {
    joinLiveSession,
    leaveLiveSession,
    isLiveSessionActive,
    startScreenShare,
    stopScreenShare,
    toggleMicrophone,
    toggleCamera,
    setMicrophoneEnabled,
    getMediaState,
} from "./livekit.js";
import { startRecording, stopRecording, isRecording, createCombinedCanvas } from "./recorder.js";

const PAGE = document.body.dataset.page || "auth";
const LIVE_REFRESH_EVENTS = new Set([
    "participant_joined",
    "participant_kicked",
    "participant_muted",
    "participant_removed",
    "participant_updated",
    "meeting_started",
    "meeting_ended",
]);

let registerForm = null;
let loginForm = null;
let logoutButton = null;
let createMeetingForm = null;
let joinMeetingForm = null;
let loadMeetingForm = null;
let liveJoinForm = null;
let startMeetingButton = null;
let endMeetingButton = null;
let refreshMeetingButton = null;
let connectWsForm = null;
let disconnectWsButton = null;
let joinLivekitButton = null;
let leaveLivekitButton = null;
let livekitStatusEl = null;
let localVideoEl = null;
let remoteVideosContainer = null;
let authTabsContainer = null;
let authSummaryEl = null;
let quickJoinForm = null;
let instantMeetingButton = null;
let toggleMicButton = null;
let toggleCameraButton = null;
let mediaStateIndicator = null;
let recordButton = null;
let recordingCanvas = null;

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
    switch (PAGE) {
        case "dashboard":
            await initDashboardPage();
            break;
        case "live":
            await initLivePage();
            break;
        case "auth":
        default:
            await initAuthPage();
            break;
    }
}

async function initAuthPage() {
    registerForm = document.getElementById("register-form");
    loginForm = document.getElementById("login-form");
    logoutButton = document.getElementById("logout-button");
    authTabsContainer = document.getElementById("auth-tabs");
    authSummaryEl = document.getElementById("auth-summary");
    quickJoinForm = document.getElementById("quick-join-form");

    initAuthTabs();

    registerForm?.addEventListener("submit", handleRegister);
    loginForm?.addEventListener("submit", handleLogin);
    logoutButton?.addEventListener("click", handleLogout);
    quickJoinForm?.addEventListener("submit", handleQuickJoin);

    if (state.token) {
        try {
            await loadCurrentUser();
            showPostAuthActions();
        } catch {
            resetState();
            updateAccountInfo(null);
        }
    } else {
        updateAccountInfo(null);
    }

    syncLivekitButtons();
}

async function initDashboardPage() {
    createMeetingForm = document.getElementById("create-meeting-form");
    const viewChatHistoryForm = document.getElementById("view-chat-history-form");
    logoutButton = document.getElementById("logout-button");

    createMeetingForm?.addEventListener("submit", handleCreateMeeting);
    viewChatHistoryForm?.addEventListener("submit", handleViewChatHistory);
    logoutButton?.addEventListener("click", handleLogout);

    const authenticated = await ensureAuthenticated({ redirect: true, suppressNotice: true });
    if (!authenticated) {
        return;
    }

    updateAccountInfo(state.currentUser);
    logoutButton?.classList.remove("hidden");
}

async function handleViewChatHistory(event) {
    event.preventDefault();
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    const formData = new FormData(event.target);
    const meetingNumber = String(formData.get("meeting_number") || "").trim();
    if (!meetingNumber) {
        showNotification("请填写会议号。", "error");
        return;
    }

    try {
        const details = await getMeetingByNumber(meetingNumber);
        if (!details || !details.meeting) {
             showNotification("未找到会议或无权访问。", "error");
             return;
        }
        
        const messages = await fetchChatHistory(details.meeting.id);
        renderDashboardChat(messages);
        showNotification("聊天记录加载成功。");
    } catch (error) {
        showNotification(error.message || "加载聊天记录失败", "error");
    }
}

async function initLivePage() {
    liveJoinForm = document.getElementById("live-join-form");
    instantMeetingButton = document.getElementById("instant-meeting-button");
    joinLivekitButton = document.getElementById("join-livekit-button");
    leaveLivekitButton = document.getElementById("leave-livekit-button");
    endMeetingButton = document.getElementById("end-meeting-button");
    const shareScreenButton = document.getElementById("share-screen-button");
    livekitStatusEl = document.getElementById("livekit-status");
    localVideoEl = document.getElementById("local-video");
    remoteVideosContainer = document.getElementById("remote-videos");
    logoutButton = document.getElementById("logout-button");
    toggleMicButton = document.getElementById("toggle-mic-button");
    toggleCameraButton = document.getElementById("toggle-camera-button");
    mediaStateIndicator = document.getElementById("media-state-indicator");
    recordButton = document.getElementById("record-button");

    liveJoinForm?.addEventListener("submit", handleLiveJoinRequest);
    instantMeetingButton?.addEventListener("click", handleInstantMeeting);
    joinLivekitButton?.addEventListener("click", handleJoinLivekit);
    leaveLivekitButton?.addEventListener("click", handleLeaveLivekit);
    endMeetingButton?.addEventListener("click", handleEndMeeting);
    shareScreenButton?.addEventListener("click", handleToggleScreenShare);
    toggleMicButton?.addEventListener("click", handleToggleMicrophone);
    toggleCameraButton?.addEventListener("click", handleToggleCamera);
    recordButton?.addEventListener("click", handleToggleRecording);
    logoutButton?.addEventListener("click", handleLogout);
    const participantsContainer = getParticipantsContainer();
    participantsContainer?.addEventListener("click", handleParticipantAction);

    const authenticated = await ensureAuthenticated({ redirect: true, suppressNotice: true });
    if (!authenticated) {
        return;
    }

    updateAccountInfo(state.currentUser);
    logoutButton?.classList.remove("hidden");

    initChatUI();

    await loadMeetingFromQuery();
    syncLivekitButtons();
    refreshMediaControls();
}

function initAuthTabs() {
    if (!authTabsContainer) {
        return;
    }
    const tabs = Array.from(authTabsContainer.querySelectorAll("[data-auth-mode]"));
    const forms = Array.from(document.querySelectorAll("[data-auth-form]"));
    if (!tabs.length || !forms.length) {
        return;
    }
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const mode = tab.dataset.authMode;
            tabs.forEach((button) => {
                button.classList.toggle("is-active", button === tab);
            });
            forms.forEach((form) => {
                form.classList.toggle("is-active", form.dataset.authForm === mode);
            });
            clearNotification();
        });
    });

    const defaultMode = tabs.find((tab) => tab.classList.contains("is-active"))?.dataset.authMode || "login";
    forms.forEach((form) => {
        form.classList.toggle("is-active", form.dataset.authForm === defaultMode);
    });
}

function handleQuickJoin(event) {
    event.preventDefault();
    clearNotification();
    const formData = new FormData(event.target);
    const meetingNumber = String(formData.get("meeting_number") || "").trim();
    if (!meetingNumber) {
        showNotification("请输入会议号", "error");
        return;
    }
    const url = new URL("./live.html", window.location.href);
    url.searchParams.set("meeting_number", meetingNumber);
    window.location.href = url.toString();
}

async function handleRegister(event) {
    event.preventDefault();
    clearNotification();
    const formData = new FormData(event.target);
    const email = formData.get("email");
    const password = formData.get("password");
    try {
        await registerUser(email, password);
        await loadCurrentUser();
        showNotification("账号创建成功，已自动登录。");
        event.target.reset();
        showPostAuthActions();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

async function handleLogin(event) {
    event.preventDefault();
    clearNotification();
    const formData = new FormData(event.target);
    const email = formData.get("email");
    const password = formData.get("password");
    try {
        await loginUser(email, password);
        await loadCurrentUser();
        showNotification("登录成功，欢迎回来。");
        event.target.reset();
        showPostAuthActions();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

async function handleLogout() {
    clearNotification();
    await logoutUser();
    resetState();
    updateAccountInfo(null);
    renderMeetingDetails(null);
    resetEventsLog();
    disconnectMeeting();
    await leaveLiveSession();
    updateLivekitStatus("尚未加入", "");
    syncLivekitButtons();
    refreshMediaControls();

    if (PAGE === "auth") {
        showNotification("已退出账号。", "success");
        logoutButton?.classList.add("hidden");
        authSummaryEl?.classList.add("hidden");
    } else {
        window.location.href = "./index.html";
    }
}

async function handleCreateMeeting(event) {
    event.preventDefault();
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    const formData = new FormData(event.target);
    try {
        const meeting = await createMeeting({
            meeting_number: formData.get("meeting_number"),
            password: formData.get("password"),
            max_participants: formData.get("max_participants"),
        });
        showNotification("会议创建成功，已自动加载详情。");
        await loadMeetingByNumber(meeting.meeting_number, { notify: false });
        event.target.reset();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

async function ensureMeetingMembership(meetingNumber, { role = "participant" } = {}) {
    let password = null;
    while (true) {
        try {
            await joinMeeting(meetingNumber, { role, password });
            return;
        } catch (error) {
            if (error.code === "password_required" || error.code === "password_invalid") {
                password = window.prompt(error.message || "会议已设置入会密码，请输入。");
                if (password === null) {
                    throw new Error("已取消加入会议。");
                }
                continue;
            }
            throw error;
        }
    }
}

async function handleLiveJoinRequest(event) {
    event.preventDefault();
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    const formData = new FormData(event.target);
    const meetingNumber = String(formData.get("meeting_number") || "").trim();
    if (!meetingNumber) {
        showNotification("请填写会议号。", "error");
        return;
    }
    try {
        await ensureMeetingMembership(meetingNumber);
        const details = await loadMeetingByNumber(meetingNumber, { notify: false });
        if (details) {
            showNotification("入会成功，正在连接音视频...");
            await handleJoinLivekit();
        }
    } catch (error) {
        showNotification(error.message, "error");
    }
}

async function handleInstantMeeting() {
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    const meetingNumber = generateInstantMeetingNumber();
    try {
        const meeting = await createMeeting({
            meeting_number: meetingNumber,
            password: null,
            max_participants: undefined,
        });
        await startMeeting(meeting.id).catch(() => {
            /* meeting might already be active */
        });
        await loadMeetingByNumber(meeting.meeting_number, { notify: false });
        showNotification(`已发起会议 ${meeting.meeting_number}，正在加入。`);
        await handleJoinLivekit();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

function handleToggleMicrophone() {
    try {
        toggleMicrophone();
        refreshMediaControls();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

function handleToggleCamera() {
    try {
        toggleCamera();
        refreshMediaControls();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

async function handleJoinLivekit() {
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    const meetingId = state.currentMeeting?.meeting?.id;
    if (!meetingId) {
        showNotification("请先加载一个会议。", "error");
        return;
    }
    try {
        const session = await fetchLiveKitSession(meetingId);
        await joinLiveSession({
            url: session.url,
            token: session.token,
            localVideoEl,
            remoteContainer: remoteVideosContainer,
            onStatus: (message, variant) => {
                updateLivekitStatus(message, variant);
            },
            onDisconnected: () => {
                syncLivekitButtons();
            },
        });
        syncLivekitButtons();
        refreshMediaControls();
        showNotification("已加入会议。");
    } catch (error) {
        await leaveLiveSession();
        updateLivekitStatus(error.message || "会议连接异常", "error");
        syncLivekitButtons();
        refreshMediaControls();
        showNotification(error.message || "会议连接失败。", "error");
    }
}

async function handleLeaveLivekit({
    reason = "已离开会议。",
    variant = "success",
    statusMessage = "尚未加入",
    statusVariant = "",
} = {}) {
    if (!isLiveSessionActive()) {
        updateLivekitStatus(statusMessage, statusVariant);
        syncLivekitButtons();
        refreshMediaControls();
        if (reason) {
            showNotification(reason, variant === "error" ? "error" : "success");
        }
        return;
    }
    // stop screen share first if active
    if (isSharingScreen) {
        try {
            await stopScreenShare({ localVideoEl, onStatus: updateLivekitStatus });
        } catch (e) {
            console.warn("Error stopping screen share on leave:", e);
        }
        isSharingScreen = false;
        const shareScreenButton = document.getElementById("share-screen-button");
        if (shareScreenButton) shareScreenButton.textContent = "共享屏幕";
    }
    // Stop recording if active
    if (isRecording()) {
        try {
            await stopRecording();
        } catch (e) {
            console.warn("Error stopping recording on leave:", e);
        }
        if (recordButton) {
            recordButton.textContent = "开始录制";
            recordButton.classList.remove("recording");
        }
    }
    // Clean up recording canvas
    if (recordingCanvas && recordingCanvas.parentElement) {
        recordingCanvas.parentElement.removeChild(recordingCanvas);
        recordingCanvas = null;
    }
    await leaveLiveSession();
    updateLivekitStatus(statusMessage, statusVariant);
    syncLivekitButtons();
    refreshMediaControls();
    if (reason) {
        showNotification(reason, variant === "error" ? "error" : "success");
    }
}

async function loadMeetingByNumber(meetingNumber, { notify = true } = {}) {
    const targetNumber = String(meetingNumber || "").trim();
    if (!targetNumber) {
        const message = "会议号不可为空。";
        if (notify) {
            showNotification(message, "error");
            return null;
        }
        throw new Error(message);
    }

    const previousMeetingId = state.currentMeeting?.meeting?.id;
    try {
        const details = await getMeetingByNumber(targetNumber);
        const nextMeetingId = details?.meeting?.id;
        if (isLiveSessionActive() && previousMeetingId && nextMeetingId && previousMeetingId !== nextMeetingId) {
            await leaveLiveSession();
            updateLivekitStatus("尚未加入", "");
        }
        renderMeetingDetails(details);
        syncLivekitButtons();
        if (PAGE === "live") {
            ensureLiveMeetingSocket();
            loadChat(details.meeting.id);
        }
        if (notify) {
            const displayNumber = details?.meeting?.meeting_number ?? targetNumber;
            showNotification(`会议 ${displayNumber} 已加载。`);
        }
        return details;
    } catch (error) {
        if (state.currentMeeting?.meeting?.meeting_number === targetNumber) {
            renderMeetingDetails(null);
            await leaveLiveSession();
            updateLivekitStatus("尚未加入", "");
            syncLivekitButtons();
            if (PAGE === "live") {
                disconnectMeeting();
            }
        }
        if (notify) {
            showNotification(error.message, "error");
            return null;
        }
        throw error;
    }
}

async function loadMeetingFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const meetingNumber = params.get("meeting") || params.get("meeting_number");
    if (meetingNumber) {
        const joinInput = document.getElementById("live-join-input");
        if (joinInput && !joinInput.value) {
            joinInput.value = meetingNumber;
        }
        try {
            await loadMeetingByNumber(meetingNumber, { notify: false });
        } catch (error) {
            console.warn("Unable to pre-load meeting from URL:", error);
        }
    }
}

function generateInstantMeetingNumber() {
    const randomDigits = String(Math.floor(100000000 + Math.random() * 900000000));
    const padded = randomDigits.padStart(9, "0");
    return `ZM-${padded.slice(0, 3)}-${padded.slice(3, 6)}-${padded.slice(6)}`;
}

function ensureLiveMeetingSocket() {
    if (PAGE !== "live") {
        return;
    }
    if (!state.token) {
        disconnectMeeting();
        return;
    }
    const meetingId = state.currentMeeting?.meeting?.id;
    if (!meetingId) {
        disconnectMeeting();
        return;
    }
    if (getActiveMeetingId() === meetingId) {
        return;
    }
    try {
        connectMeeting(meetingId, {
            onEvent: (payload) => handleLiveMeetingEvent(payload),
            onError: (error) => {
                console.warn("会议事件异常：", error);
            },
        });
    } catch (error) {
        console.warn("无法建立会议实时通道：", error);
    }
}

function handleLiveMeetingEvent(payload) {
    if (PAGE !== "live" || !payload) {
        return;
    }
    if (payload.event === "chat_message") {
        appendChatMessage(payload.data);
        return;
    }
    if (payload.event === "participant_muted" && payload.data?.user_id === state.currentUser?.id) {
        forceMuteLocalAudio();
        updateLivekitStatus("主持人已将你静音", "error");
        showNotification("主持人已将你静音。", "error");
    } else if (payload.event === "participant_kicked" && payload.data?.user_id === state.currentUser?.id) {
        handleForcedRemoval("主持人已将你请离会议。");
    } else if (payload.event === "participant_removed" && payload.data?.user_id === state.currentUser?.id) {
        handleForcedRemoval("主持人已将你移出会议。");
    } else if (payload.event === "meeting_ended" && payload.meeting_id === state.currentMeeting?.meeting?.id) {
        handleForcedRemoval("会议已结束。");
        return;
    }
    if (
        payload.meeting_id &&
        state.currentMeeting?.meeting?.id === payload.meeting_id &&
        LIVE_REFRESH_EVENTS.has(payload.event)
    ) {
        const meetingNumber = state.currentMeeting?.meeting?.meeting_number;
        if (!meetingNumber) {
            return;
        }
        loadMeetingByNumber(meetingNumber, { notify: false }).catch((error) => {
            console.warn("实时刷新会议失败：", error);
        });
    }
}

function forceMuteLocalAudio() {
    if (!isLiveSessionActive()) {
        refreshMediaControls();
        return;
    }
    try {
        setMicrophoneEnabled(false);
        refreshMediaControls();
    } catch (error) {
        console.warn("强制静音失败：", error);
    }
}

function handleForcedRemoval(message) {
    handleLeaveLivekit({
        reason: message,
        variant: "error",
        statusMessage: message,
        statusVariant: "error",
    }).catch((error) => {
        console.warn("强制离会失败：", error);
    });
}

async function loadCurrentUser() {
    const user = await fetchCurrentUser();
    setCurrentUser(user);
    updateAccountInfo(user);
}

async function ensureAuthenticated({ redirect = false, suppressNotice = false } = {}) {
    if (!state.token) {
        if (!suppressNotice) {
            showNotification("请先登录账号。", "error");
        }
        if (redirect) {
            window.location.href = "./index.html";
        }
        return false;
    }
    if (!state.currentUser) {
        try {
            await loadCurrentUser();
        } catch (error) {
            if (!suppressNotice) {
                showNotification(error.message, "error");
            }
            resetState();
            updateAccountInfo(null);
            if (redirect) {
                window.location.href = "./index.html";
            }
            return false;
        }
    }
    return true;
}

function updateLivekitStatus(message, variant = "") {
    if (!livekitStatusEl) {
        return;
    }
    livekitStatusEl.textContent = message;
    const classes = ["status-indicator"];
    if (variant) {
        classes.push(`status--${variant}`);
    }
    livekitStatusEl.className = classes.join(" ");
}

function syncLivekitButtons() {
    const active = isLiveSessionActive();
    const hasMeeting = Boolean(state.currentMeeting?.meeting?.id);
    const isHost = state.currentUser && state.currentMeeting?.meeting?.host_id === state.currentUser.id;

    if (joinLivekitButton) {
        joinLivekitButton.disabled = !hasMeeting || active;
    }
    if (leaveLivekitButton) {
        leaveLivekitButton.disabled = !active;
    }
    if (endMeetingButton) {
        if (active && isHost) {
            endMeetingButton.classList.remove("hidden");
        } else {
            endMeetingButton.classList.add("hidden");
        }
    }

    const shareScreenButton = document.getElementById("share-screen-button");
    if (shareScreenButton) {
        // only enabled when in a live session
        shareScreenButton.disabled = !active;
    }

    // Enable recording button when in a live session
    if (recordButton) {
        recordButton.disabled = !active;
    }

    refreshMediaControls();
}

let isSharingScreen = false;

function refreshMediaControls() {
    if (!toggleMicButton && !toggleCameraButton && !mediaStateIndicator) {
        return;
    }
    const { microphoneEnabled, cameraEnabled } = getMediaState();
    const active = isLiveSessionActive();
    if (toggleMicButton) {
        toggleMicButton.disabled = !active;
        if (!active) {
            toggleMicButton.textContent = "开启麦克风";
        } else {
            toggleMicButton.textContent = microphoneEnabled ? "静音" : "解除静音";
        }
    }
    if (toggleCameraButton) {
        toggleCameraButton.disabled = !active;
        if (!active) {
            toggleCameraButton.textContent = "开启摄像头";
        } else {
            toggleCameraButton.textContent = cameraEnabled ? "关闭摄像头" : "开启摄像头";
        }
    }
    updateMediaStateIndicator(microphoneEnabled, cameraEnabled, active);
}

function updateMediaStateIndicator(micEnabled, cameraEnabled, active) {
    if (!mediaStateIndicator) {
        return;
    }
    const mic = mediaStateIndicator.querySelector('[data-type="mic"]');
    const cam = mediaStateIndicator.querySelector('[data-type="camera"]');
    if (mic) {
        if (!active) {
            mic.textContent = "麦克风未连接";
        } else {
            mic.textContent = micEnabled ? "麦克风已打开" : "麦克风已静音";
        }
    }
    if (cam) {
        if (!active) {
            cam.textContent = "摄像头未连接";
        } else {
            cam.textContent = cameraEnabled ? "摄像头已打开" : "摄像头已关闭";
        }
    }
}

async function handleToggleScreenShare() {
    const shareScreenButton = document.getElementById("share-screen-button");
    if (!isSharingScreen) {
        try {
            await window.joinLiveScreen?.() ?? startScreenShareHelper();
        } catch (err) {
            showNotification(err.message || "无法开始屏幕共享", "error");
            return;
        }
        isSharingScreen = true;
        if (shareScreenButton) shareScreenButton.textContent = "停止共享";
        showNotification("已开始共享屏幕。", "success");
    } else {
        try {
            await window.leaveLiveScreen?.() ?? stopScreenShareHelper();
        } catch (err) {
            showNotification(err.message || "无法停止屏幕共享", "error");
            return;
        }
        isSharingScreen = false;
        if (shareScreenButton) shareScreenButton.textContent = "共享屏幕";
        showNotification("已停止共享屏幕。", "success");
    }
    syncLivekitButtons();
}

async function handleToggleRecording() {
    if (!recordButton) return;

    if (isRecording()) {
        // Stop recording
        try {
            recordButton.disabled = true;
            await stopRecording();
            recordButton.textContent = "开始录制";
            recordButton.classList.remove("recording");
            showNotification("录制已保存到下载文件夹。", "success");
        } catch (error) {
            showNotification(error.message || "停止录制失败", "error");
        } finally {
            recordButton.disabled = false;
        }
    } else {
        // Start recording
        try {
            recordButton.disabled = true;

            // Create canvas combining local and all remote videos
            // Pass the container so it can dynamically detect all videos including screen shares
            if (!recordingCanvas && localVideoEl && remoteVideosContainer) {
                recordingCanvas = createCombinedCanvas(localVideoEl, remoteVideosContainer);
                document.body.appendChild(recordingCanvas);
                recordingCanvas.style.display = "none";
            }

            if (recordingCanvas) {
                // Collect audio from all audio elements in the page (local + remote)
                const audioElements = document.querySelectorAll("audio");
                let audioStream = null;
                
                if (audioElements.length > 0) {
                    try {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        const audioDestination = audioContext.createMediaStreamDestination();
                        
                        audioElements.forEach(audio => {
                            try {
                                const source = audioContext.createMediaElementAudioSource(audio);
                                source.connect(audioDestination);
                            } catch (e) {
                                console.warn("Cannot create audio source for element:", e);
                            }
                        });
                        
                        audioStream = audioDestination.stream;
                    } catch (e) {
                        console.warn("Unable to capture system audio:", e);
                    }
                }

                await startRecording(recordingCanvas, audioStream);
                recordButton.textContent = "停止录制";
                recordButton.classList.add("recording");
                showNotification("开始录制。包含所有视频和音频", "success");
            } else {
                throw new Error("无法创建录制画布");
            }
        } catch (error) {
            showNotification(error.message || "开始录制失败", "error");
        } finally {
            recordButton.disabled = false;
        }
    }
}

// helpers that call into livekit.js functions if available
async function startScreenShareHelper() {
    // import functions dynamically from livekit module
    if (typeof startScreenShare === "function") {
        await startScreenShare({ localVideoEl, onStatus: updateLivekitStatus });
    } else if (window.startScreenShare) {
        await window.startScreenShare({ localVideoEl, onStatus: updateLivekitStatus });
    } else {
        throw new Error("屏幕共享未实现");
    }
}

async function stopScreenShareHelper() {
    if (typeof stopScreenShare === "function") {
        await stopScreenShare({ localVideoEl, onStatus: updateLivekitStatus });
    } else if (window.stopScreenShare) {
        await window.stopScreenShare({ localVideoEl, onStatus: updateLivekitStatus });
    } else {
        throw new Error("停止屏幕共享未实现");
    }
}

function showPostAuthActions() {
    logoutButton?.classList.remove("hidden");
    authSummaryEl?.classList.remove("hidden");
}

async function loadChat(meetingId) {
    try {
        const messages = await fetchChatHistory(meetingId);
        messages.forEach(appendChatMessage);
    } catch (error) {
        console.error("Failed to load chat history:", error);
    }
}

async function handleParticipantAction(event) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
        return;
    }
    const action = target.dataset.action;
    const participantId = Number(target.dataset.participant);
    if (!action || !participantId) {
        return;
    }
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    try {
        if (action === "mute") {
            await muteParticipant(participantId);
            showNotification("已将该成员静音。");
        } else if (action === "promote") {
            await updateParticipant(participantId, { role: "co_host" });
            showNotification("该成员已升级为联席主持。");
        } else if (action === "demote") {
            await updateParticipant(participantId, { role: "participant" });
            showNotification("该成员已调整为普通参会者。");
        } else if (action === "kick") {
            await kickParticipant(participantId);
            showNotification("该成员已被请离会议。");
        } else if (action === "remove") {
            await removeParticipant(participantId);
            showNotification("该成员已被移出会议。");
        }
        if (state.currentMeeting?.meeting?.meeting_number) {
            await loadMeetingByNumber(state.currentMeeting.meeting.meeting_number, { notify: false });
        }
    } catch (error) {
        showNotification(error.message, "error");
    }
}

async function handleEndMeeting() {
    if (!confirm("确定要结束会议吗？所有参会者将被移出。")) {
        return;
    }
    clearNotification();
    if (!(await ensureAuthenticated())) {
        return;
    }
    const meetingId = state.currentMeeting?.meeting?.id;
    if (!meetingId) {
        showNotification("当前没有进行中的会议。", "error");
        return;
    }
    try {
        await endMeeting(meetingId);
        showNotification("会议已结束。");
        await handleLeaveLivekit({ reason: "会议已结束。", variant: "success" });
    } catch (error) {
        showNotification(error.message, "error");
    }
}
