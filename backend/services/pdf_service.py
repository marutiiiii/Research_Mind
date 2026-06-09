import fitz  # PyMuPDF
from pathlib import Path

def extract_text_from_pdf(file_path: str) -> dict:
    """
    Opens a PDF and extracts:
    - Full text of every page
    - Total page count
    - A preview (first 500 chars)
    """
    doc = fitz.open(file_path)
    
    pages_text = []
    full_text = ""

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()           # extract raw text
        pages_text.append({
            "page": page_num + 1,
            "text": text.strip()
        })
        full_text += text

    doc.close()

    return {
        "total_pages": len(pages_text),
        "preview": full_text[:500],      # first 500 chars as preview
        "pages": pages_text,             # all pages with their text
        "full_text": full_text           # entire paper as one string
    }