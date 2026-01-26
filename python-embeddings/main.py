from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

app = FastAPI()

# Load embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

# FAISS setup
DIMENSION = 384
index = faiss.IndexFlatL2(DIMENSION)
documents = []

@app.get("/")
def health():
    return {"status": "Embedding service running"}

@app.post("/store")
def store(texts: list[str]):
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
