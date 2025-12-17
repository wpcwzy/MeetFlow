import os
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.user import Base
from app.models import meeting  # Import to register models

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./meetflow.db")

url = make_url(DATABASE_URL)
if url.drivername.startswith("sqlite"):
    db_path = url.database
    if db_path:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
