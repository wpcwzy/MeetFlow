# MeetFlow

认证与用户服务（Auth & User Service）

## 项目结构

```
meetflow/
├── app/
│   ├── main.py                # FastAPI 应用主文件
│   ├── config.py              # 环境变量配置
│   ├── websocket_manager.py   # WebSocket 连接与广播
│   ├── routers/               # 路由模块（认证、会议、参会者等）
│   ├── services/              # 业务逻辑（认证、会议、LiveKit 等）
│   ├── schemas/               # Pydantic 模型
│   └── models/                # SQLAlchemy ORM 模型
├── frontend/                  # 纯静态 Web 客户端（HTML/CSS/ES Modules）
├── docker-compose.livekit.yml # 本地 LiveKit Server 启动配置
├── meetflow.db                # SQLite 数据库文件
├── main.py                    # 应用入口
├── pyproject.toml             # 项目依赖
└── README.md
```

## 功能

- 用户注册、登录与 JWT 鉴权
- 会议创建、更新、删除与参会名单管理
- 等候室、参会者审批、角色升级/降级
- WebSocket 会议事件广播
- LiveKit 视频会议：为会议生成房间 Token，前端可直接加入实时音视频

## 安装

使用 uv 管理项目：

```bash
uv sync
```

## 运行

```bash
uv run python main.py
```

服务器将在 http://localhost:8000 运行。

需要前端页面时，在 `frontend/` 目录下启动任意静态资源服务器，例如：

```bash
cd frontend
python -m http.server 5173
```

然后访问 http://localhost:5173。

## 一键启动（Docker Compose）

仓库内置 `docker-compose.yml`，可同时启动 LiveKit、FastAPI 后端与 Nginx 静态前端：

```bash
docker compose up --build
```

服务启动后：

- 前端访问：http://localhost:8080
- 后端 API：http://localhost:8000
- LiveKit 信令端口：http://localhost:7880

初次运行会自动创建 SQLite 数据库（卷挂载在 `backend_data`）。如需修改数据库连接，可通过环境变量 `DATABASE_URL` 覆盖。
前端容器内置 Nginx，会将 `/api` 与 `/ws` 前缀的请求反代到后端，因此即使不暴露 8000 端口也能正常访问服务。
若在远端服务器部署，请将 compose 中的 `LIVEKIT_URL` 替换为实际域名或公网 IP 对应的地址，以便浏览器能够连接。

## LiveKit 集成

后端会使用 LiveKit API Key/Secret 为参会者生成访问 Token。运行前设置以下环境变量（与 docker compose 中保持一致）：

```bash
export LIVEKIT_URL=ws://localhost:7880
export LIVEKIT_API_KEY=livekit_key
export LIVEKIT_API_SECRET=livekit_secret
```

若本地没有 LiveKit Server，可使用仓库提供的 Compose 文件快速启动：

```bash
docker compose -f docker-compose.livekit.yml up
```

启动后，登录前端加载会议并点击 “Join session” 即可进入实时音视频会议。

> 注：`docker-compose.yml` 中已集成 LiveKit，如采用一键启动则无需单独运行此文件。

## API 端点

- POST /register - 用户注册
- POST /token - 用户登录
- POST /forgot-password - 密码找回
- POST /oauth/google - 第三方登录
- GET /users/me - 获取当前用户信息
- PUT /users/me - 更新当前用户信息
- DELETE /users/me - 删除当前用户

## 数据库

使用 SQLite 数据库 `meetflow.db`。
