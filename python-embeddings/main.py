from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from pydantic import BaseModel
from langchain_text_splitters import RecursiveCharacterTextSplitter

def get_text_splitter():
    return RecursiveCharacterTextSplitter(
        chunk_size=800,          # tokens/characters depending on config
        chunk_overlap=150,
        separators=[
            "\n\n",   # paragraphs
            "\n",     # lines
        ".",      # sentences
        " "       # words (last fallback)
    ]
)

app = FastAPI()

# Load embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

# FAISS setup
DIMENSION = 384
index = faiss.IndexFlatL2(DIMENSION)
documents = []

class StoreRequest(BaseModel):
    doc: str  # or docText, matching your DTO

@app.get("/")
def health():
    return {"status": "Embedding service running"}

@app.post("/store")
def store(doc: StoreRequest):
    text_splitter = get_text_splitter()
    texts = text_splitter.split_text(doc.doc)
    vectors = model.encode(texts)
    index.add(np.array(vectors).astype("float32"))
    documents.extend(texts)
    return {"stored_chunks": len(texts)}

@app.post("/search")
def search(query: str, top_k: int = 3):
    query_vector = model.encode([query])
    distances, indices = index.search(
        np.array(query_vector).astype("float32"),
        top_k
    )

    results = [documents[i] for i in indices[0]]
    return {"results": results}
