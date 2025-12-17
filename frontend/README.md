# MeetFlow Web Client

This lightweight web client provides a console-style interface for interacting with the MeetFlow FastAPI backend. It is a static application built with vanilla JavaScript modules, so no build tooling is required.

## Project structure

```
frontend/
├── index.html            # Entry point for the web client
├── styles/
│   └── main.css          # Global styling for the UI
└── scripts/              # ES module-based client logic
    ├── api.js            # Fetch helpers and API wrappers
    ├── main.js           # Bootstraps the app and wires up handlers
    ├── state.js          # Lightweight client-side state management
    ├── ui.js             # DOM rendering helpers
    ├── websocket.js      # Live meeting event streaming support
    └── livekit.js        # LiveKit video conferencing bridge
```

## Running the client locally

1. Start the FastAPI backend if it is not already running:
   ```bash
   uvicorn app.main:app --reload
   ```

2. From a separate terminal, serve the static frontend (any static file server works). For example:
   ```bash
   cd frontend
   python -m http.server 5173
   ```

3. Open the client at [http://localhost:5173](http://localhost:5173). The frontend will communicate with the backend at `http://localhost:8000` by default. To target a different backend URL, set `window.MEETFLOW_API_BASE` in the browser console before interacting with the app.

The backend now enables permissive CORS during development, so cross-origin requests from the static server are allowed.

## LiveKit integration

The UI now bundles a simple LiveKit client so that meeting hosts and participants can join full video conferences. Configure the backend with your LiveKit credentials before launching the frontend:

```bash
export LIVEKIT_URL=ws://localhost:7880
export LIVEKIT_API_KEY=livekit_key
export LIVEKIT_API_SECRET=livekit_secret
```

If you do not already have a LiveKit server, you can spin one up locally with Docker (keys must match the environment variables above):

```bash
docker compose -f docker-compose.livekit.yml up
```

Once the backend is running with LiveKit configured, load a meeting and click **Join session** in the Live video card to publish your camera and subscribe to other participants.

### Docker Compose workflow

如果你使用仓库根目录的 `docker-compose.yml`，运行：

```bash
docker compose up --build
```

即可同时启动前端、后端与 LiveKit Server。此时直接访问 http://localhost:8080 即可。若需要指向其他后端，可在浏览器控制台设置 `window.MEETFLOW_API_BASE`。

> 提示：默认情况下前端通过 `/api` 和 `/ws` 路径由 Nginx 反向代理到后端服务。如果你单独启动前端（例如使用 `python -m http.server`），别忘了先在浏览器里执行 `window.MEETFLOW_API_BASE = "http://localhost:8000"; window.MEETFLOW_WS_BASE = "ws://localhost:8000";` 再进行操作。
