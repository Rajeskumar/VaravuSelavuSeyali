"""Content-type verification for uploads (security audit VS-14).

`UploadFile.content_type` is just a header the client wrote, so validating it alone lets
arbitrary bytes through under an allowed label. These signatures check what the file
actually is before it is forwarded to the OCR provider.
"""

from typing import Optional

# (offset, magic bytes) -> media type. JPEG has several valid third bytes, and WebP/HEIC
# carry their marker after a leading length/brand field, so a couple of these are matched
# by a windowed check below rather than a plain prefix.
_SIGNATURES = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"%PDF-", "application/pdf"),
]


def sniff_media_type(data: bytes) -> Optional[str]:
    """Returns the media type implied by the file's own leading bytes, or None."""
    if not data:
        return None
    for magic, media_type in _SIGNATURES:
        if data.startswith(magic):
            return media_type
    # RIFF....WEBP — the brand sits at offset 8, after the RIFF length field.
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    # ISO-BMFF: "ftyp" at offset 4, then a HEIF/HEIC brand.
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"heim"):
        return "image/heic"
    return None


def content_type_matches(declared: str, data: bytes) -> bool:
    """True when the bytes are consistent with the declared type.

    An unrecognized signature is rejected rather than waved through: the allow-list is a
    small set of image/PDF types, so anything whose magic we cannot identify is not one of
    them.
    """
    sniffed = sniff_media_type(data)
    if sniffed is None:
        return False
    if sniffed == declared:
        return True
    # image/jpg is a common (non-standard) spelling clients send for JPEG.
    return {sniffed, declared} == {"image/jpeg", "image/jpg"}
