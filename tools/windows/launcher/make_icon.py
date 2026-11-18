"""Значок Dinastia.exe и инсталлятора: `python make_icon.py <путь.ico>` (Pillow)."""

import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = 256
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((8, 8, SIZE - 8, SIZE - 8), radius=56, fill=(37, 99, 235, 255))
try:
    font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 168)
except OSError:
    font = ImageFont.load_default(size=168)
draw.text((SIZE / 2, SIZE / 2 + 6), "D", font=font, fill="white", anchor="mm")
img.save(sys.argv[1], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
