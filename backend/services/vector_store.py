import chromadb
from chromadb.utils import embedding_functions
from pathlib import Path
from typing import List
import os

# ── Setup ──────────────────────────────────────────────────────────────

# Always store ChromaDB next to this file, regardless of CWD
CHROMA_PATH = str(Path(__file__).resolve().parent.parent / "chroma_db")

# Use a free, local sentence-transformer model for embeddings.
# This converts text → numbers (vectors) so ChromaDB can search them.
# "all-MiniLM-L6-v2" is small, fast, and very good for this use case.
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name=EMBEDDING_MODEL
)

# Create the ChromaDB client (saves to disk automatically)
client = chromadb.PersistentClient(path=CHROMA_PATH)


# ── Core Functions ─────────────────────────────────────────────────────

def get_or_create_collection(file_id: str):
    """
    Each uploaded paper gets its own ChromaDB collection.
    Collection name = paper's unique file_id.
    If it already exists, return it. If not, create it.
    """
    collection_name = f"paper_{file_id}"
    collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_fn
    )
    return collection


def store_chunks(file_id: str, chunks: List[dict]) -> int:
    """
    Stores all chunks of a paper into its ChromaDB collection.

    Each chunk is stored with:
    - A unique ID
    - The actual text (document)
    - Metadata: page number, chunk_id, char positions

    Returns the number of chunks stored.
    """
    collection = get_or_create_collection(file_id)

    # Prepare data in the format ChromaDB expects
    ids        = [f"{file_id}_chunk_{c['chunk_id']}" for c in chunks]
    documents  = [c["text"] for c in chunks]
    metadatas  = [
        {
            "chunk_id":   c["chunk_id"],
            "page":       c.get("page", 0),
            "start_char": c["start_char"],
            "end_char":   c["end_char"]
        }
        for c in chunks
    ]

    # Store in ChromaDB (it auto-generates embeddings using our model)
    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )

    return len(chunks)


def search_chunks(file_id: str, query: str, top_k: int = 4) -> List[dict]:
    """
    Given a user's question, find the most relevant chunks from the paper.

    How it works:
    1. Convert the question into a vector using the same embedding model
    2. ChromaDB finds the chunks whose vectors are closest to the question
    3. Return the top_k most relevant chunks

    Args:
        file_id: which paper to search in
        query:   the user's question
        top_k:   how many chunks to return (4 is usually enough)

    Returns:
        List of dicts with text, page number, and relevance score
    """
    collection = get_or_create_collection(file_id)

    # Check if collection has any data
    if collection.count() == 0:
        return []

    results = collection.query(
        query_texts=[query],
        n_results=min(top_k, collection.count())  # can't ask for more than we have
    )

    # Reformat results into a clean list
    chunks = []
    for i in range(len(results["documents"][0])):
        chunks.append({
            "text":       results["documents"][0][i],
            "page":       results["metadatas"][0][i].get("page", "?"),
            "chunk_id":   results["metadatas"][0][i].get("chunk_id"),
            "distance":   results["distances"][0][i]  # lower = more relevant
        })

    return chunks


def delete_collection(file_id: str):
    """
    Deletes a paper's collection from ChromaDB.
    Call this if you want to clean up after a session.
    """
    try:
        client.delete_collection(f"paper_{file_id}")
        return True
    except Exception:
        return False