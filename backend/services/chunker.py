from typing import List

def chunk_text(full_text: str, chunk_size: int = 500, overlap: int = 100) -> List[dict]:
    """
    Splits a long text into overlapping chunks.

    Why overlap? So that if an important sentence falls at the
    edge of a chunk, it still appears in the next chunk too.
    No context gets accidentally cut off.

    Args:
        full_text:  the entire paper as one string
        chunk_size: how many characters per chunk (500 ≈ 1 paragraph)
        overlap:    how many characters to repeat between chunks

    Returns:
        List of dicts: [{ "chunk_id": 0, "text": "...", "start": 0 }, ...]
    """

    chunks = []
    start = 0
    chunk_id = 0

    while start < len(full_text):
        end = start + chunk_size

        # Get the chunk
        chunk_text = full_text[start:end]

        # Skip empty or whitespace-only chunks
        if chunk_text.strip():
            chunks.append({
                "chunk_id": chunk_id,
                "text": chunk_text.strip(),
                "start_char": start,
                "end_char": end
            })
            chunk_id += 1

        # Move forward, but step back by 'overlap' so chunks overlap
        start += chunk_size - overlap

    return chunks


def chunk_by_pages(pages: list, chunk_size: int = 1000, overlap: int = 150) -> List[dict]:
    """
    Same as chunk_text but keeps track of which page each chunk came from.
    Useful for telling the user 'this answer is from page 4'.
    """

    chunks = []
    chunk_id = 0

    for page_data in pages:
        page_num = page_data["page"]
        text = page_data["text"]

        if not text.strip():
            continue  # skip blank pages

        start = 0
        while start < len(text):
            end = start + chunk_size
            piece = text[start:end]

            if piece.strip():
                chunks.append({
                    "chunk_id": chunk_id,
                    "text": piece.strip(),
                    "page": page_num,
                    "start_char": start,
                    "end_char": end
                })
                chunk_id += 1

            start += chunk_size - overlap

    return chunks