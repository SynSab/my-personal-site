#!/usr/bin/env python3
"""
Single-stroke ("plotter") lettering.

A normal font describes the OUTLINE of a letter. Stroking that outline with
stroke-dashoffset animates a contour crawling around each glyph, which reads
as tracing, not as writing. These glyphs are centrelines instead — one path
straight down the middle of each pen stroke — so the same draw-on animation
that draws the house also genuinely writes the word.

Coordinates: baseline y=0, cap height y=1, y increasing upward.
Only the letters needed for the site's labels are defined; add more as needed.
"""

import math

__all__ = ["render_word", "STYLES"]


def arc(cx, cy, rx, ry, a0, a1, n=None):
    """Points along an ellipse, angles in degrees, counter-clockwise if a1>a0."""
    if n is None:
        n = max(6, int(abs(a1 - a0) / 12))
    out = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        out.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return out


# ── architectural capitals ────────────────────────────────────────────────
# Upright, slightly condensed, the way drawings are lettered by hand.

CAPS = {
    "B": (0.70, [
        [(0, 0), (0, 1)],
        [(0, 1), (0.36, 1)] + arc(0.36, 0.76, 0.20, 0.24, 90, -90) + [(0, 0.52)],
        [(0, 0.52), (0.40, 0.52)] + arc(0.40, 0.26, 0.23, 0.26, 90, -90) + [(0, 0)],
    ]),
    "E": (0.64, [
        [(0.58, 1), (0, 1), (0, 0), (0.58, 0)],
        [(0, 0.52), (0.44, 0.52)],
    ]),
    "D": (0.72, [
        [(0, 0), (0, 1), (0.28, 1)] + arc(0.28, 0.5, 0.38, 0.5, 90, -90) + [(0, 0)],
    ]),
    "F": (0.58, [
        [(0, 0), (0, 1), (0.56, 1)],
        [(0, 0.54), (0.42, 0.54)],
    ]),
    "O": (0.76, [arc(0.38, 0.5, 0.36, 0.5, 90, 450)]),
    "R": (0.70, [
        [(0, 0), (0, 1), (0.36, 1)] + arc(0.36, 0.77, 0.21, 0.23, 90, -90) + [(0, 0.54)],
        [(0.26, 0.54), (0.44, 0.30), (0.64, 0)],
    ]),
}


# ── print handwriting ─────────────────────────────────────────────────────
# Mixed case, unjoined — the hand you'd letter a drawing with, not copperplate.
# x-height 0.58, ascenders to 1.0, descenders to -0.24.

HAND = {
    "B": (0.66, [
        [(0.02, 0), (0, 1)],
        [(0, 1), (0.34, 1.01)] + arc(0.34, 0.77, 0.19, 0.24, 90, -90) + [(0.01, 0.53)],
        [(0.01, 0.53), (0.38, 0.54)] + arc(0.38, 0.27, 0.22, 0.27, 90, -90) + [(0.02, 0)],
    ]),
    "e": (0.52, [
        [(0.03, 0.30), (0.46, 0.33)] + arc(0.25, 0.30, 0.23, 0.28, 12, 310),
    ]),
    "d": (0.56, [
        [(0.52, 1.0), (0.50, 0)],
        arc(0.26, 0.29, 0.24, 0.29, 55, 340),
    ]),
    "f": (0.42, [
        [(0.11, 0), (0.12, 0.78)] + arc(0.27, 0.78, 0.15, 0.22, 180, 60),
        [(-0.02, 0.55), (0.34, 0.57)],
    ]),
    "o": (0.54, [arc(0.27, 0.29, 0.25, 0.29, 90, 450)]),
    "r": (0.44, [
        [(0.09, 0), (0.08, 0.57)],
        [(0.08, 0.40)] + arc(0.24, 0.40, 0.16, 0.18, 180, 70),
    ]),
}

STYLES = {"caps": CAPS, "hand": HAND}


def render_word(text, style="hand", tracking=0.10):
    """Return (strokes, width, ymin, ymax) in em units, baseline y=0."""
    glyphs = STYLES[style]
    if style == "caps":
        text = text.upper()

    strokes, x = [], 0.0
    for ch in text:
        if ch == " ":
            x += 0.45
            continue
        if ch not in glyphs:
            raise KeyError(
                f"no glyph for {ch!r} in style {style!r}; "
                f"available: {''.join(sorted(glyphs))}")
        adv, gs = glyphs[ch]
        for s in gs:
            strokes.append([(px + x, py) for px, py in s])
        x += adv + tracking

    width = max(x - tracking, 0.0)
    ys = [p[1] for s in strokes for p in s]
    return strokes, width, min(ys), max(ys)
