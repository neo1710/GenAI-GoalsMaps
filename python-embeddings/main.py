import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels


def get_text_splitter():
    """
    Builds the same LangChain splitter you had before.
    It tries to cut text at paragraph breaks first, then lines, then
    sentences, then words -- whichever produces chunks closest to
    chunk_size (800 chars) without going over, keeping 150 chars of
    overlap between consecutive chunks so context isn't lost at the
    boundaries between chunks.
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        separators=[
            "\n\n",   # paragraphs
            "\n",     # lines
            ".",      # sentences
            " ",      # words (last fallback)
        ],
    )


app = FastAPI()

load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / "goal-map" / ".env")

# ---- Embedding model ----
# Loaded once at startup and reused for every request. This is the same
# sentence-transformers model as before; it turns text into a 384-dim
# vector that captures its meaning, so similar text ends up close together
# in vector space.
model = SentenceTransformer("all-MiniLM-L6-v2")
DIMENSION = 384
COLLECTION_NAME = "documents"

# ---- Qdrant client setup ----
# A "collection" in Qdrant is roughly what an "index" was in FAISS: a named
# bucket of vectors (+ metadata) that you search within.

# Option A: Qdrant Cloud, configured through env:
#   QDRANT_URL=https://your-cluster-url
#   QDRANT_API_KEY=your-api-key
#
# For your existing env names, clusterurl/clusterkey are also supported.
#
# Option B: local disk mode, no cloud key/server needed:
#   QDRANT_PATH=./qdrant_data
#
# Option C: local in-memory mode, no cloud key/server needed:
#   QDRANT_LOCATION=:memory:
qdrant_path = os.getenv("QDRANT_PATH")
qdrant_location = os.getenv("QDRANT_LOCATION")

if qdrant_path:
    qdrant = QdrantClient(path=qdrant_path)
elif qdrant_location:
    qdrant = QdrantClient(location=qdrant_location)
else:
    qdrant_url = os.getenv("QDRANT_URL") or os.getenv("clusterurl") or "http://localhost:6333"
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or os.getenv("clusterkey")
    qdrant = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)

# Option B: no server needed, persists to local disk (good for dev/small deployments)
# qdrant = QdrantClient(path="./qdrant_data")

# Option C: pure in-memory, same lifecycle as your current FAISS setup (wiped on restart)
# qdrant = QdrantClient(location=":memory:")

# Create the collection once, if it doesn't already exist yet.
# vectors_config tells Qdrant the shape (384 floats) and how to compare
# vectors (distance metric), so it knows how to index and rank them.
if not qdrant.collection_exists(COLLECTION_NAME):
    qdrant.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=qmodels.VectorParams(
            size=DIMENSION,
            distance=qmodels.Distance.COSINE,  # swap to EUCLID to mirror FAISS's L2 exactly
        ),
    )

try:
    qdrant.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="doc_id",
        field_schema=qmodels.PayloadSchemaType.KEYWORD,
    )
except Exception as exc:
    if "already exists" not in str(exc).lower():
        raise


class StoreRequest(BaseModel):
    doc: str                     # the raw document text to chunk + embed
    doc_id: Optional[str] = None # optional caller-supplied id, used later to filter/delete


@app.get("/")
def health():
    return {"status": "Embedding service running"}


@app.post("/store")
def store(doc: StoreRequest):
    # If the caller didn't supply a doc_id, generate one. We return it in
    # the response so the caller can save it and use it later to delete
    # or filter-search this specific document.
    doc_id = doc.doc_id or str(uuid.uuid4())

    text_splitter = get_text_splitter()
    texts = text_splitter.split_text(doc.doc)  # -> list[str] of chunks

    if not texts:
        return {"stored_chunks": 0, "doc_id": doc_id}

    # encode() runs every chunk through the model in one batch call,
    # returning a list of numpy arrays -- one 384-float vector per chunk.
    vectors = model.encode(texts)

    # Build one Qdrant "point" per chunk. A point = (id, vector, payload):
    #   - id: unique identifier for this point (must be unique in the collection)
    #   - vector: the embedding, converted from a numpy array to a plain list
    #     of floats (Qdrant's client expects plain lists, not numpy types)
    #   - payload: arbitrary JSON-like metadata stored alongside the vector.
    #     We store the chunk's own text here (so a search result is
    #     self-contained -- no separate lookup table needed like your old
    #     `documents` list), plus doc_id so we can later filter/delete all
    #     chunks belonging to one document.
    points = [
        qmodels.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector.tolist(),
            payload={"text": text, "doc_id": doc_id},
        )
        for text, vector in zip(texts, vectors)
    ]

    # upsert = "insert, or update if the id already exists".
    # Sends all points to Qdrant in a single network call.
    qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

    return {"stored_chunks": len(texts), "doc_id": doc_id}


@app.post("/search")
def search(query: str, top_k: int = 3, doc_id: Optional[str] = None):
    # Embed the query text the same way documents were embedded, so both
    # the query and the stored chunks live in the same vector space and
    # can be meaningfully compared.
    query_vector = model.encode(query)

    # Optional metadata filter: if the caller passes a doc_id, Qdrant will
    # only search among points whose payload.doc_id matches that value.
    # This is the kind of thing plain FAISS couldn't do without you
    # manually managing separate indexes per document.
    query_filter = None
    if doc_id:
        query_filter = qmodels.Filter(
            must=[
                qmodels.FieldCondition(
                    key="doc_id",
                    match=qmodels.MatchValue(value=doc_id),
                )
            ]
        )

    # query_points runs the nearest-neighbor search: it compares
    # query_vector against every stored vector (using the collection's
    # distance metric, cosine here) and returns the `limit` closest
    # points -- each one already carrying its payload and a `.score`.
    results = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector.tolist(),
        query_filter=query_filter,
        limit=top_k,
    ).points

    return {
        "results": [
            {
                "text": point.payload.get("text"),
                "doc_id": point.payload.get("doc_id"),
                "score": point.score,  # higher = more similar, for cosine distance
            }
            for point in results
        ]
    }


@app.delete("/delete/{doc_id}")
def delete(doc_id: str):
    """
    Deletes every chunk belonging to a given doc_id.

    Because each chunk's point stored doc_id in its payload at /store
    time, we don't need to know the individual chunk ids -- we just tell
    Qdrant "delete anything where payload.doc_id equals this value", and
    it finds and removes every matching point for us.
    """
    delete_filter = qmodels.Filter(
        must=[
            qmodels.FieldCondition(
                key="doc_id",
                match=qmodels.MatchValue(value=doc_id),
            )
        ]
    )

    result = qdrant.delete(
        collection_name=COLLECTION_NAME,
        points_selector=qmodels.FilterSelector(filter=delete_filter),
    )

    # result.status is typically "completed" or "acknowledged"
    return {"doc_id": doc_id, "status": result.status}
