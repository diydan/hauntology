"""Makes the six Relic Token QR stickers for the 3D props.

Each Relic Token carries the text `hw:<relic id>` (party-mode: parseRelicToken accepts exactly that, and the ids
are r1 to r6 in shared/src/party/pool.ts). Output goes next to this script:

  hw-r1-music-box.png ... hw-r6-bell.png   one image per Relic, quiet zone included, sized for a 36 mm sticker
  qr-sticker-sheet-A4.png / .pdf           12 stickers (two of each, one set is spare) with cut marks, 600 dpi

Needs: pip install segno pillow   (and, only for the check at the end: opencv-python-headless numpy)
Run:   python make-qr.py
"""
import os
import sys

import segno
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RELICS = [("r1", "music box"), ("r2", "wax hand"), ("r3", "locket"), ("r4", "planchette"), ("r5", "silver key"), ("r6", "bell")]
STICKER_MM = 36.0   # the pocket on the Relic Token plate
QUIET = 4           # modules of white around the code (the QR standard)
DPI = 600
MM = DPI / 25.4


def matrix(text):
    # Version 1 (21 x 21), error correction Q (25%), so a scratched sticker still scans.
    qr = segno.make(text, version=1, error="q", boost_error=False)
    assert qr.designator == "1-Q", qr.designator
    return [list(row) for row in qr.matrix]


def draw_qr(draw, m, x0, y0, size):
    """Draws the code with its quiet zone into a size x size square at x0, y0. Module edges are rounded to whole pixels."""
    n = len(m) + 2 * QUIET
    for r, row in enumerate(m):
        for c, dark in enumerate(row):
            if dark:
                xa = x0 + round((c + QUIET) * size / n)
                xb = x0 + round((c + QUIET + 1) * size / n)
                ya = y0 + round((r + QUIET) * size / n)
                yb = y0 + round((r + QUIET + 1) * size / n)
                draw.rectangle([xa, ya, xb - 1, yb - 1], fill=0)


def font(pt):
    for p in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, int(pt * DPI / 72))
        except OSError:
            continue
    return ImageFont.load_default()


def single(rid, name):
    m = matrix("hw:" + rid)
    n = len(m) + 2 * QUIET
    mod = 30
    img = Image.new("L", (n * mod, n * mod), 255)
    draw_qr(ImageDraw.Draw(img), m, 0, 0, n * mod)
    dpi = img.width / (STICKER_MM / 25.4)   # so that "actual size" prints it 36 mm wide
    path = os.path.join(HERE, "hw-%s-%s.png" % (rid, name.replace(" ", "-")))
    img.save(path, dpi=(dpi, dpi))
    return path, m


def sheet(mats):
    W, H = round(210 * MM), round(297 * MM)
    page = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(page)
    d.text((round(15 * MM), round(10 * MM)), "Hauntology Relic Tokens: QR stickers (36 x 36 mm)", font=font(13), fill=0)
    d.text((round(15 * MM), round(17 * MM)), "Print at 100% / actual size. Cut on the corner marks. Set B is a spare. Check: the bar is exactly 50 mm.", font=font(8), fill=0)
    bx, by = round(15 * MM), round(25 * MM)
    d.rectangle([bx, by, bx + round(50 * MM), by + round(1.2 * MM)], fill=0)
    cell_w, cell_h = round(60 * MM), round(62 * MM)
    side = round(STICKER_MM * MM)
    for i in range(12):
        rid, name = RELICS[i % 6]
        col, row = i % 3, i // 3
        cx = round(15 * MM) + col * cell_w
        cy = round(34 * MM) + row * cell_h
        x0 = cx + (cell_w - side) // 2
        y0 = cy + round(3 * MM)
        draw_qr(d, mats[rid], x0, y0, side)
        g, ln = round(1.5 * MM), round(3 * MM)   # cut marks just outside each corner
        for (px, py, sx, sy) in ((x0, y0, -1, -1), (x0 + side, y0, 1, -1), (x0, y0 + side, -1, 1), (x0 + side, y0 + side, 1, 1)):
            d.line([px + sx * g, py, px + sx * (g + ln), py], fill=0, width=3)
            d.line([px, py + sy * g, px, py + sy * (g + ln)], fill=0, width=3)
        label = "%s  %s  (%s)" % (rid, name, "set A" if i < 6 else "set B")
        tw = d.textlength(label, font=font(8))
        d.text((cx + (cell_w - tw) / 2, y0 + side + round(4 * MM)), label, font=font(8), fill=0)
    png = os.path.join(HERE, "qr-sticker-sheet-A4.png")
    page.save(png, dpi=(DPI, DPI))
    page.convert("RGB").save(os.path.join(HERE, "qr-sticker-sheet-A4.pdf"), resolution=DPI)
    return png


def check(paths, sheet_png):
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("skipped the decode check (opencv not installed)")
        return True
    det = cv2.QRCodeDetector()
    ok = True

    def decode(img):
        txt, pts, _ = det.detectAndDecode(img)
        return txt

    for (rid, name), p in zip(RELICS, paths):
        im = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
        full = decode(im)
        # A phone sees a 36 mm sticker at several hundred pixels. 240 px is about 8 px per module, blurred, a hard case.
        low = cv2.GaussianBlur(cv2.resize(im, (240, 240), interpolation=cv2.INTER_AREA), (3, 3), 0)
        small = decode(low)
        if hasattr(cv2, "QRCodeDetectorAruco"):
            small = small if small == cv2.QRCodeDetectorAruco().detectAndDecode(low)[0] else "(two decoders disagree)"
        good = full == "hw:" + rid and small == "hw:" + rid
        ok &= good
        print("%s %-7s %-12s full=%r small=%r" % ("ok " if good else "BAD", rid, name, full, small))
    sh = cv2.imread(sheet_png, cv2.IMREAD_GRAYSCALE)
    found = 0
    side = round(STICKER_MM * MM)
    for i in range(12):
        rid = RELICS[i % 6][0]
        col, row = i % 3, i // 3
        cx = round(15 * MM) + col * round(60 * MM)
        cy = round(34 * MM) + row * round(62 * MM)
        x0 = cx + (round(60 * MM) - side) // 2 - 40
        y0 = cy + round(3 * MM) - 40
        crop = sh[y0:y0 + side + 80, x0:x0 + side + 80]
        if decode(crop) == "hw:" + rid:
            found += 1
    print("sheet: %d of 12 stickers decode to the right text" % found)
    ok &= found == 12
    return ok


if __name__ == "__main__":
    mats, paths = {}, []
    for rid, name in RELICS:
        p, m = single(rid, name)
        mats[rid] = m
        paths.append(p)
    png = sheet(mats)
    mm_per_module = STICKER_MM / (21 + 2 * QUIET)
    print("version 1, level Q, 21 x 21 modules + %d-module quiet zone, %.2f mm per module (the plate rule is at least 1.2 mm)" % (QUIET, mm_per_module))
    sys.exit(0 if check(paths, png) else 1)
