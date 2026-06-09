import os
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.pdf_service import extract_text_from_pdf
from services.chunker import chunk_by_pages
from services.vector_store import store_chunks

router = APIRouter()

# Always resolve uploads/ relative to this file, not the CWD
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):

    # 1. Validate PDF
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    # 2. Save file
    unique_id = str(uuid.uuid4())[:8]
    safe_filename = f"{unique_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # 3. Extract text
    try:
        extracted = extract_text_from_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")

    # 4. Chunk the text (NEW)
    chunks = chunk_by_pages(extracted["pages"])

    # 5. Store chunks in ChromaDB (NEW)
    try:
        stored_count = store_chunks(unique_id, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")

    # 6. Return response
    return {
        "success":       True,
        "file_id":       unique_id,
        "filename":      file.filename,
        "safe_filename": safe_filename,
        "file_url":      f"http://127.0.0.1:8000/uploads/{safe_filename}",
        "total_pages":   extracted["total_pages"],
        "total_chunks":  stored_count,
        "preview":       extracted["preview"],
        "pages":         extracted["pages"],
        "message":       f"Paper ready. {extracted['total_pages']} pages, {stored_count} chunks stored."
    }