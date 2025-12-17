import * as LivekitClient from "https://cdn.jsdelivr.net/npm/livekit-client@2.5.9/dist/livekit-client.esm.mjs";

const { Room, RoomEvent, Track, LogLevel, setLogLevel, createLocalTracks, LocalVideoTrack } = LivekitClient;

setLogLevel(LogLevel.warn);

let room = null;
let localTracks = [];
let screenPublication = null;
let screenLocalTrack = null;
let microphoneEnabled = false;
let cameraEnabled = false;
let localPreviewEl = null;
const remoteMedia = new Map();
const SCREEN_SHARE_MEDIA_CONSTRAINTS = {
    video: {
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: 15,
    },
    audio: false,
};

function safeDetach(track) {
    track.detach().forEach((element) => {
        if (element instanceof HTMLElement && element.parentElement) {
            element.parentElement.removeChild(element);
        }
    });
}

function cleanupRemoteMedia() {
    remoteMedia.forEach((entry) => {
        if (entry.track) {
            safeDetach(entry.track);
        }
        if (entry.element?.parentElement) {
            entry.element.parentElement.removeChild(entry.element);
        }
    });
    remoteMedia.clear();
}

export function isLiveSessionActive() {
    return room !== null;
}

export async function leaveLiveSession() {
    if (!room) {
        return;
    }
    if (screenPublication || screenLocalTrack) {
        try {
            await stopScreenShare();
        } catch (err) {
            console.warn("Failed to stop screen share before leaving:", err);
        }
    }
    try {
        room.disconnect();
    } catch {
        // ignore
    }
    localTracks.forEach((track) => {
        safeDetach(track);
        track.stop();
    });
    localTracks = [];
    microphoneEnabled = false;
    cameraEnabled = false;
    localPreviewEl = null;
    cleanupRemoteMedia();
    room = null;
}

function handleRemoteVideo(track, participant, remoteContainer) {
    const container = document.createElement("div");
    container.className = "remote-tile";

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    track.attach(video);
    container.appendChild(video);

    const label = document.createElement("span");
    label.className = "remote-label";
    label.textContent = participant.name || participant.identity || "Remote";
    container.appendChild(label);

    remoteContainer.appendChild(container);
    remoteMedia.set(track.sid, { element: container, track });
}

function handleRemoteAudio(track) {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    track.attach(audio);
    remoteMedia.set(track.sid, { element: audio, track });
}

function updateMediaStateFromTracks() {
    const audioTrack = localTracks.find((track) => track.kind === Track.Kind.Audio);
    microphoneEnabled = Boolean(audioTrack?.mediaStreamTrack?.enabled);
    const videoTrack = localTracks.find((track) => track.kind === Track.Kind.Video);
    cameraEnabled = Boolean(videoTrack?.mediaStreamTrack?.enabled);
}

function requireRoom() {
    if (!room) {
        throw new Error("Not connected to a room");
    }
}

function requireLocalTrack(kind) {
    const track = localTracks.find((item) => item.kind === kind);
    if (!track) {
        throw new Error(kind === Track.Kind.Audio ? "麦克风未准备好" : "摄像头未准备好");
    }
    return track;
}

function setTrackEnabled(kind, enabled) {
    requireRoom();
    const track = requireLocalTrack(kind);
    if (track.mediaStreamTrack) {
        track.mediaStreamTrack.enabled = enabled;
    }
    if (typeof track.mute === "function" && !enabled) {
        track.mute();
    } else if (typeof track.unmute === "function" && enabled) {
        track.unmute();
    }
    if (kind === Track.Kind.Audio) {
        microphoneEnabled = enabled;
    } else if (kind === Track.Kind.Video) {
        cameraEnabled = enabled;
        if (localPreviewEl && track.attach) {
            // Detach/attach only affects the media stream, keeps DOM node in place
            track.detach(localPreviewEl);
            if (enabled) {
                track.attach(localPreviewEl);
            }
        }
    }
    return { microphoneEnabled, cameraEnabled };
}

export function setMicrophoneEnabled(enabled) {
    return setTrackEnabled(Track.Kind.Audio, enabled);
}

export function toggleMicrophone() {
    return setMicrophoneEnabled(!microphoneEnabled);
}

export function setCameraEnabled(enabled) {
    return setTrackEnabled(Track.Kind.Video, enabled);
}

export function toggleCamera() {
    return setCameraEnabled(!cameraEnabled);
}

export function getMediaState() {
    return { microphoneEnabled, cameraEnabled };
}

export async function joinLiveSession({
    url,
    token,
    localVideoEl,
    remoteContainer,
    onStatus,
    onDisconnected,
}) {
    await leaveLiveSession();

    try {
        localTracks = await createLocalTracks({
            audio: true,
            video: { facingMode: "user" },
        });
    } catch (error) {
        onStatus?.(`媒体设备访问失败: ${error.message || error}`, "error");
        throw error;
    }

    try {
        room = new Room({
            autoSubscribe: true,
        });
        await room.connect(url, token);
        onStatus?.("会议连接成功，可以开始交流。", "connected");
    } catch (error) {
        await leaveLiveSession();
        onStatus?.(`会议连接失败: ${error.message || error}`, "error");
        throw error;
    }

    // Publish local tracks & render local preview
    let videoTrack = null;
    for (const track of localTracks) {
        await room.localParticipant.publishTrack(track);
        if (track.kind === Track.Kind.Video) {
            videoTrack = track;
        }
    }
    if (videoTrack && localVideoEl) {
        videoTrack.attach(localVideoEl);
    }
    localPreviewEl = localVideoEl || null;
    updateMediaStateFromTracks();

    const detachRemoteTrack = (trackSid) => {
        const entry = remoteMedia.get(trackSid);
        if (!entry) {
            return;
        }
        if (entry.track) {
            safeDetach(entry.track);
        }
        if (entry.element?.parentElement) {
            entry.element.parentElement.removeChild(entry.element);
        }
        remoteMedia.delete(trackSid);
    };

    // 处理已存在的远程参与者的轨道（B 加入时能看到 A）
    room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
            if (publication.track && publication.isSubscribed) {
                const track = publication.track;
                if (track.kind === Track.Kind.Video) {
                    handleRemoteVideo(track, participant, remoteContainer);
                } else if (track.kind === Track.Kind.Audio) {
                    handleRemoteAudio(track);
                }
            }
        });
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video) {
            handleRemoteVideo(track, participant, remoteContainer);
        } else if (track.kind === Track.Kind.Audio) {
            handleRemoteAudio(track);
        }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
        detachRemoteTrack(track.sid);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        for (const publication of participant.tracks.values()) {
            if (publication.track) {
                detachRemoteTrack(publication.track.sid);
            }
        }
    });

    room.on(RoomEvent.Disconnected, () => {
        onStatus?.("会议已断开，如需继续请重新加入。", "error");
        cleanupRemoteMedia();
        room = null;
        if (typeof onDisconnected === "function") {
            onDisconnected();
        }
    });
}

export async function startScreenShare({ localVideoEl, onStatus } = {}) {
    if (!room) {
        onStatus?.("需要先加入会议以共享屏幕。", "error");
        throw new Error("Not connected to a room");
    }
    if (screenPublication) {
        // already sharing
        return;
    }
    let stream = null;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARE_MEDIA_CONSTRAINTS);
    } catch (err) {
        onStatus?.(`无法获取屏幕捕获: ${err.message || err}`, "error");
        throw err;
    }

    // take first video track
    const mediaTrack = stream.getVideoTracks()[0];
    if (!mediaTrack) {
        onStatus?.("未检测到屏幕视频轨道。", "error");
        throw new Error("No screen video track");
    }

    const localTrack = new LocalVideoTrack(mediaTrack);
    const sourceTrack = localTrack.mediaStreamTrack || mediaTrack;
    sourceTrack.onended = async () => {
        try {
            await stopScreenShare({ localVideoEl, onStatus });
        } catch (e) {
            console.warn("stopScreenShare error", e);
        }
    };

    // wrap in LiveKit LocalVideoTrack
    try {
        screenLocalTrack = localTrack;
        screenPublication = await room.localParticipant.publishTrack(screenLocalTrack, {
            simulcast: false,
            source: Track.Source.ScreenShare,
        });
        // attach preview to local element if provided
        if (localVideoEl) {
            // detach previous local camera preview
            try {
                localTracks.forEach((t) => {
                    if (t.kind === Track.Kind.Video) {
                        t.detach().forEach((el) => el.remove());
                    }
                });
            } catch {}
            screenLocalTrack.attach(localVideoEl);
        }
        onStatus?.("正在共享屏幕", "connected");
    } catch (err) {
        try {
            localTrack.stop();
        } catch {}
        try {
            mediaTrack.stop();
        } catch {}
        screenLocalTrack = null;
        screenPublication = null;
        onStatus?.(`发布屏幕轨道失败: ${err.message || err}`, "error");
        throw err;
    }
}

export async function stopScreenShare({ localVideoEl, onStatus } = {}) {
    if (!screenPublication && !screenLocalTrack) {
        return;
    }
    try {
        if (screenPublication) {
            if (room?.localParticipant) {
                try {
                    await room.localParticipant.unpublishTrack(
                        screenPublication.trackSid || screenPublication.track?.sid
                    );
                } catch {}
            }
            screenPublication = null;
        }
        if (screenLocalTrack) {
            try {
                screenLocalTrack.stop();
                screenLocalTrack.detach().forEach((el) => {
                    if (el.parentElement) el.parentElement.removeChild(el);
                });
            } catch {}
            screenLocalTrack = null;
        }
        // restore camera preview if available
        if (localVideoEl) {
            const cameraTrack = localTracks.find((t) => t.kind === Track.Kind.Video);
            if (cameraTrack) {
                cameraTrack.attach(localVideoEl);
            } else {
                // clear preview
                try {
                    localVideoEl.srcObject = null;
                } catch {}
            }
        }
        onStatus?.("已停止屏幕共享", "");
    } catch (err) {
        onStatus?.(`停止屏幕共享出错: ${err.message || err}`, "error");
        throw err;
    }
}
