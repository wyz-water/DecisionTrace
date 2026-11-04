"""File-format extraction for the discussion import endpoint.

Pure functions: bytes in, (text, encoding) out. The route owns HTTP and
persistence; these functions only turn an uploaded file into the plain
text a discussion stores.
"""

from io import BytesIO


def decode_text_bytes(data: bytes):
    """Decode a text file, preferring UTF-8 and falling back to GBK.

    Windows editors in the team save notes as UTF-8 (often with a BOM)
    or as GBK; try UTF-8 strictly first so Chinese notes never turn into
    mojibake, then GBK, then UTF-8 lossy as a last resort.

    Returns ``(text, encoding)`` where encoding is the label shown to the
    user ("UTF-8", "GBK", "unknown").
    """
    for encoding in ("utf-8", "gbk"):
        try:
            text = data.decode(encoding).lstrip("﻿")
            return text, encoding.upper()
        except UnicodeDecodeError:
            continue

    return data.decode("utf-8", errors="replace").lstrip("﻿"), "unknown"


def extract_docx_text(data: bytes) -> str:
    """Paragraphs then table cells, in document order."""
    from docx import Document

    document = Document(BytesIO(data))
    parts = [paragraph.text for paragraph in document.paragraphs]

    for table in document.tables:
        for row in table.rows:
            cells = [cell.text for cell in row.cells]
            parts.append(" | ".join(cells))

    return "\n".join(parts)


def extract_pdf_text(data: bytes) -> str:
    """Concatenate every page's extracted text."""
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data))
    pages = [page.extract_text() or "" for page in reader.pages]

    return "\n\n".join(pages)
