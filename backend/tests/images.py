"""Тестовые фото: настоящие JPEG и PNG нужного размера, сделанные Pillow."""

import io

from PIL import Image


def image_bytes(width: int = 1280, height: int = 720, fmt: str = "JPEG", shade: int = 90) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (shade, shade, shade)).save(buffer, format=fmt)
    return buffer.getvalue()
