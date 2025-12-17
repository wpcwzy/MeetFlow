from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.dependencies import get_current_user
import shutil
import os
from pathlib import Path
import uuid
from urllib.parse import quote

router = APIRouter()

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user = Depends(get_current_user)):
    try:
        file_id = str(uuid.uuid4())
        file_dir = UPLOAD_DIR / file_id
        file_dir.mkdir(parents=True, exist_ok=True)
        
        # Use the original filename
        filename = os.path.basename(file.filename or "download")
        file_path = file_dir / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        encoded_filename = quote(filename)
        return {"url": f"/api/uploads/{file_id}/{encoded_filename}", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
