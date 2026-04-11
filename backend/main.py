from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pypdf  # <-- Changed from PyPDF2
import io
import os
# Notice the cleaner imports! We are assuming you run this FROM the backend folder.
from src.ingest import ingest_text
from src.rag_engine import get_answer
from src.rag_engine import get_graph_data

app = FastAPI(title="GraphSumm-Hindi API")

# Setup CORS so your React frontend (port 5173) can talk to this backend (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request Models ---
class IngestRequest(BaseModel):
    text: str
    year: int
    author: str

class QueryRequest(BaseModel):
    question: str

# --- API Endpoints ---
@app.post("/api/ingest")
async def api_ingest(request: IngestRequest):
    try:
        meta = {"year": request.year, "source": request.author, "title": "User Input"}
        ingest_text(request.text, meta)
        return {"status": "success", "message": "Data successfully ingested into Neo4j!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/upload")
async def api_upload(
    file: UploadFile = File(...), 
    year: int = Form(...), 
    author: str = Form(...)
):
    try:
        # 1. Read the uploaded PDF file
        contents = await file.read()
        pdf_reader = pypdf.PdfReader(io.BytesIO(contents))
        
        # 2. Extract all the text
        extracted_text = ""
        for page in pdf_reader.pages:
            if page.extract_text():
                extracted_text += page.extract_text() + "\n"
                
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text. Is this a scanned PDF?")

        # 3. Send it to your existing ingest engine!
        meta = {"year": year, "source": author, "title": file.filename}
        from src.ingest import ingest_text # Local import to ensure it grabs the right function
        ingest_text(extracted_text, meta)
        
        return {"status": "success", "message": f"{file.filename} successfully added to Graph!"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ask")
async def api_ask(request: QueryRequest):
    try:
        # get_answer now returns a dictionary with 'answer' and 'sources'
        result = get_answer(request.question) 
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/graph")
async def api_graph():
    try:
        data = get_graph_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Basic health check route
@app.get("/")
async def root():
    return {"message": "GraphSumm Backend is running!"}