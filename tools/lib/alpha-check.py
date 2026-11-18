#!/usr/bin/env python3
"""Alpha coverage and edge margins of a PNG, as JSON (for tools/ghost-checkpoint.mjs)."""
import json
import sys

from PIL import Image


def main(path: str) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    alpha = im.getchannel("A")
    px = alpha.load()
    covered = 0
    min_x, max_x = w, -1
    for y in range(h):
        for x in range(w):
            if px[x, y] > 0:
                covered += 1
                min_x = min(min_x, x)
                max_x = max(max_x, x)
    if covered == 0:
        print(json.dumps({"width": w, "height": h, "coverage": 0.0, "leftMargin": 0.0, "rightMargin": 0.0}))
        return
    print(json.dumps({
        "width": w,
        "height": h,
        "coverage": covered / (w * h),
        "leftMargin": min_x / w,
        "rightMargin": (w - 1 - max_x) / w,
    }))


if __name__ == "__main__":
    main(sys.argv[1])
