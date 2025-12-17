let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let audioContext = null;

export async function startRecording(canvas, audioStream = null) {
    recordedChunks = [];
    recordingStartTime = Date.now();

    try {
        const canvasStream = canvas.captureStream(30); //30fps
        const combinedStream = new MediaStream();
        canvasStream.getTracks().forEach(track => {
            if (track.kind === 'video') {
                combinedStream.addTrack(track);
            }
        });
        // audio context for mixing multiple audio sources
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn("Could not create AudioContext:", e);
        }
        let mixedAudioDestination = null;
        if (audioContext) {
            try {
                mixedAudioDestination = audioContext.createMediaStreamDestination();
                // try to add system audio
                if (audioStream && audioStream.getTracks().length > 0) {
                    const source = audioContext.createMediaStreamSource(audioStream);
                    source.connect(mixedAudioDestination);
                    console.log("Added system audio to recording");
                }
                // try to add microphone audio
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                        },
                        video: false 
                    });
                    const micSource = audioContext.createMediaStreamSource(micStream);
                    micSource.connect(mixedAudioDestination);
                    console.log("Added microphone audio to recording");
                } catch (e) {
                    console.warn("Microphone not available, continuing with system audio only:", e);
                }
                // add mixed audio to combined stream
                mixedAudioDestination.stream.getTracks().forEach(track => {
                    if (track.kind === 'audio') {
                        combinedStream.addTrack(track);
                    }
                });
            } catch (e) {
                console.warn("Failed to setup audio mixing:", e);
                // Fallback: just add raw audio stream if available
                if (audioStream) {
                    audioStream.getTracks().forEach(track => {
                        if (track.kind === 'audio') {
                            combinedStream.addTrack(track);
                        }
                    });
                }
            }
        } else {
            // No AudioContext available, add raw streams
            if (audioStream) {
                audioStream.getTracks().forEach(track => {
                    if (track.kind === 'audio') {
                        combinedStream.addTrack(track);
                    }
                });
            }
        }

        // create MediaRecorder
        const mimeType = getPreferredMimeType();
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            console.log("Recording started with MIME type:", mimeType);
        };

        mediaRecorder.onstop = () => {
            console.log("Recording stopped, total chunks:", recordedChunks.length);
        };

        mediaRecorder.onerror = (event) => {
            console.error("Recording error:", event.error);
        };

        mediaRecorder.start();
        return true;
    } catch (error) {
        console.error("Failed to start recording:", error);
        throw error;
    }
}

/**
 * Stop recording and download the file
 * Cleans up all audio context and media resources
 * @param {string} filename - Optional filename for the recording
 * @returns {Promise<void>}
 */
export async function stopRecording(filename = null) {
    return new Promise((resolve, reject) => {
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
            // Clean up audio context even if recording isn't active
            if (audioContext) {
                try {
                    audioContext.close();
                    audioContext = null;
                } catch (e) {
                    console.warn("Error closing audio context:", e);
                }
            }
            reject(new Error("No active recording"));
            return;
        }

        mediaRecorder.onstop = () => {
            try {
                // Clean up audio context
                if (audioContext) {
                    try {
                        audioContext.close();
                        audioContext = null;
                    } catch (e) {
                        console.warn("Error closing audio context:", e);
                    }
                }

                const mimeType = getPreferredMimeType();
                const blob = new Blob(recordedChunks, { type: mimeType });

                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                
                // Generate filename if not provided
                if (!filename) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
                    const ext = mimeType === "video/webm" ? "webm" : "mp4";
                    filename = `meeting-${timestamp}.${ext}`;
                }
                
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                console.log("Recording saved as:", filename, "Size:", blob.size, "bytes");

                recordedChunks = [];
                mediaRecorder = null;
                recordingStartTime = null;

                resolve();
            } catch (error) {
                reject(error);
            }
        };

        mediaRecorder.stop();
    });
}

export function isRecording() {
    return mediaRecorder !== null && mediaRecorder.state === "recording";
}

function getPreferredMimeType() {
    const types = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm",
        "video/mp4",
    ];

    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }

    return "video/mp4";
}

/**
 * Create a canvas that combines multiple video streams for recording
 * Dynamically detects and includes all video elements (cameras, screen shares)
 * @param {HTMLVideoElement} localVideo - Local video element
 * @param {HTMLElement} remoteContainer - Container with remote video elements
 * @returns {HTMLCanvasElement}
 */
export function createCombinedCanvas(localVideo, remoteContainer = null) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Set canvas size (16:9 aspect ratio)
    canvas.width = 1280;
    canvas.height = 720;

    function getRemoteVideos() {
        if (!remoteContainer) return [];
        return Array.from(remoteContainer.querySelectorAll("video"));
    }

    function drawFrame() {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const remoteVideos = getRemoteVideos();
        const hasRemotes = remoteVideos.length > 0;

        if (hasRemotes) {
            // Draw remote videos in grid layout
            const remoteCount = remoteVideos.length;
            
            // Calculate grid dimensions for optimal layout
            let cols, rows;
            if (remoteCount === 1) {
                cols = 1; rows = 1;
            } else if (remoteCount === 2) {
                cols = 2; rows = 1;
            } else if (remoteCount === 3 || remoteCount === 4) {
                cols = 2; rows = 2;
            } else if (remoteCount <= 6) {
                cols = 3; rows = 2;
            } else if (remoteCount <= 9) {
                cols = 3; rows = 3;
            } else {
                cols = Math.ceil(Math.sqrt(remoteCount));
                rows = Math.ceil(remoteCount / cols);
            }

            const remoteWidth = canvas.width / cols;
            const remoteHeight = canvas.height / rows;

            remoteVideos.forEach((video, index) => {
                if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
                    const row = Math.floor(index / cols);
                    const col = index % cols;
                    const x = col * remoteWidth;
                    const y = row * remoteHeight;

                    ctx.drawImage(video, x, y, remoteWidth, remoteHeight);
                    
                    // border around each video
                    ctx.strokeStyle = "rgba(100, 100, 100, 0.5)";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, remoteWidth, remoteHeight);
                }
            });

            // local video in corner with semi-transparent background
            if (localVideo && localVideo.readyState === localVideo.HAVE_ENOUGH_DATA) {
                const localWidth = canvas.width * 0.15;
                const localHeight = canvas.height * 0.15;
                const localX = canvas.width - localWidth - 8;
                const localY = canvas.height - localHeight - 8;

                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(localX, localY, localWidth, localHeight);

                // local video
                ctx.drawImage(
                    localVideo,
                    localX,
                    localY,
                    localWidth,
                    localHeight
                );

                // local video border
                ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
                ctx.lineWidth = 2;
                ctx.strokeRect(localX, localY, localWidth, localHeight);
            }
        } else {
            if (localVideo && localVideo.readyState === localVideo.HAVE_ENOUGH_DATA) {
                ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
            }
        }

        requestAnimationFrame(drawFrame);
    }
    drawFrame();
    return canvas;
}
