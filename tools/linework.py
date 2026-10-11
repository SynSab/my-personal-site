#!/usr/bin/env python3
"""
Rhino linework -> self-drawing SVG.

Reads a native .3dm (preferred: real curves + layer names) or a Rhino .AI
PostScript export (fallback: fragmented, no layers), and emits an SVG whose
strokes draw themselves with stroke-dashoffset, as if by hand.

  .3dm needs rhino3dm:  pip install rhino3dm

Usage:
  python3 tools/linework.py FILE.3dm -o house.svg --preview
  python3 tools/linework.py FILE.3dm --duration 14 --amp 0.004 --order wave
"""

import argparse, math, os, random, sys

# ── geometry helpers ───────────────────────────────────────────────────────

def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def plen(p):
    return sum(dist(p[i], p[i + 1]) for i in range(len(p) - 1))


def rdp(pts, tol):
    """Douglas-Peucker: drop points that don't change the shape."""
    if len(pts) < 3:
        return list(pts)
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy)
    worst, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        if n == 0:
            d = dist(p, a)
        else:
            d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / n
        if d > worst:
            worst, idx = d, i
    if worst > tol:
        return rdp(pts[:idx + 1], tol)[:-1] + rdp(pts[idx:], tol)
    return [a, b]


# ── readers ────────────────────────────────────────────────────────────────

def read_3dm(path, samples=260, skip_layers=("image",), only_layers=None):
    """Return [(points, layer_name), ...] from a native Rhino file."""
    try:
        import rhino3dm
    except ImportError:
        sys.exit("Reading .3dm needs rhino3dm:  pip install rhino3dm")

    f = rhino3dm.File3dm.Read(path)
    if f is None:
        sys.exit(f"Could not read {path}")
    layers = {i: f.Layers[i].Name for i in range(len(f.Layers))}

    out = []
    for ob in f.Objects:
        g = ob.Geometry
        layer = layers.get(ob.Attributes.LayerIndex, "")
        nm = layer.strip().lower()
        if nm in skip_layers:
            continue
        if only_layers and nm not in only_layers:
            continue
        if not hasattr(g, "PointAt"):
            continue                      # Breps, meshes, text — not linework

        pts = None
        # exact point lists where the type provides them
        if hasattr(g, "PointCount") and hasattr(g, "Point"):
            try:
                pts = [(g.Point(i).X, g.Point(i).Y) for i in range(g.PointCount)]
            except Exception:
                pts = None
        if pts is None:
            try:
                d = g.Domain
                t0, t1 = d.T0, d.T1
                if not (t1 > t0):
                    continue
                pts = []
                for k in range(samples + 1):
                    p = g.PointAt(t0 + (t1 - t0) * k / samples)
                    pts.append((p.X, p.Y))
            except Exception:
                continue

        # drop consecutive duplicates
        clean = [pts[0]]
        for p in pts[1:]:
            if dist(p, clean[-1]) > 1e-9:
                clean.append(p)
        if len(clean) > 1:
            out.append((clean, layer))
    return out


AI_OPS = set('m l L c C v V y Y S s f F b B n N'.split())


def read_ai(path):
    """Fallback reader for Rhino's Illustrator PostScript export."""
    toks = open(path, errors="ignore").read().split()
    paths, cur, nums = [], None, []

    def bez(p0, c1, c2, p3):
        chord = dist(p0, c1) + dist(c1, c2) + dist(c2, p3)
        n = max(3, min(24, int(chord / 25)))
        r = []
        for k in range(1, n + 1):
            t = k / n; u = 1 - t
            r.append((u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p3[0],
                      u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p3[1]))
        return r

    for t in toks:
        if t in AI_OPS:
            if t == 'm' and len(nums) >= 2:
                if cur and len(cur) > 1: paths.append(cur)
                cur = [(nums[-2], nums[-1])]
            elif t in 'lL' and cur and len(nums) >= 2:
                cur.append((nums[-2], nums[-1]))
            elif t in 'cC' and cur and len(nums) >= 6:
                cur += bez(cur[-1], (nums[-6], nums[-5]), (nums[-4], nums[-3]), (nums[-2], nums[-1]))
            elif t in 'vV' and cur and len(nums) >= 4:
                cur += bez(cur[-1], cur[-1], (nums[-4], nums[-3]), (nums[-2], nums[-1]))
            elif t in 'yY' and cur and len(nums) >= 4:
                cur += bez(cur[-1], (nums[-4], nums[-3]), (nums[-2], nums[-1]), (nums[-2], nums[-1]))
            elif t in 'SsfFbBnN':
                if t in 'sbB' and cur and len(cur) > 2:
                    cur.append(cur[0])
                if cur and len(cur) > 1: paths.append(cur)
                cur = None
            nums = []
        else:
            try: nums.append(float(t))
            except ValueError: nums = []
    if cur and len(cur) > 1:
        paths.append(cur)
    return [(p, "") for p in paths]


# ── chaining ───────────────────────────────────────────────────────────────

def chain(items, tol):
    """Rejoin strokes that share endpoints (only within the same layer)."""
    out = []
    by_layer = {}
    for pts, layer in items:
        by_layer.setdefault(layer, []).append(pts)

    for layer, segs in by_layer.items():
        q = lambda p: (round(p[0] / tol), round(p[1] / tol))
        used = [False] * len(segs)
        ends = {}
        for i, s in enumerate(segs):
            ends.setdefault(q(s[0]), []).append(i)
            ends.setdefault(q(s[-1]), []).append(i)
        for i, s in enumerate(segs):
            if used[i]:
                continue
            used[i] = True
            ch = list(s)
            grew = True
            while grew:
                grew = False
                for tail in (True, False):
                    key = q(ch[-1] if tail else ch[0])
                    for j in ends.get(key, []):
                        if used[j]:
                            continue
                        o = segs[j]
                        if q(o[0]) == key:      add = o[1:]
                        elif q(o[-1]) == key:   add = o[::-1][1:]
                        else:                   continue
                        used[j] = True
                        if tail: ch.extend(add)
                        else:    ch[:0] = add[::-1]
                        grew = True
                        break
                    if grew:
                        break
            out.append((ch, layer))
    return out


# ── warmth ─────────────────────────────────────────────────────────────────

def resample(p, step):
    out = [p[0]]
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        n = max(1, int(dist(a, b) / step))
        for k in range(1, n + 1):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def warm(p, rng, amp, scale):
    """Bow + jitter + overshoot: make a CAD line look like a drawn one."""
    if amp <= 0 or len(p) < 2:
        return p
    p = resample(p, max(scale * 0.010, 1e-6))
    n = len(p)
    if n < 3:
        return p

    phase = rng.uniform(0, math.tau)
    freq = rng.uniform(0.6, 1.7)
    bow = amp * rng.uniform(0.5, 1.4)

    out = []
    for i, (x, y) in enumerate(p):
        t = i / (n - 1)
        a, b = p[max(0, i - 1)], p[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        # taper to zero at the ends so corners stay tight
        d = bow * math.sin(math.pi * t) * math.sin(phase + freq * math.pi * t)
        d += rng.gauss(0, amp * 0.16)
        out.append((x + nx * d, y + ny * d))

    def extend(p0, p1, amt):
        dx, dy = p0[0] - p1[0], p0[1] - p1[1]
        L = math.hypot(dx, dy) or 1.0
        return (p0[0] + dx / L * amt, p0[1] + dy / L * amt)

    out[0]  = extend(out[0],  out[1],  amp * rng.uniform(0.2, 1.0))
    out[-1] = extend(out[-1], out[-2], amp * rng.uniform(0.2, 1.0))
    return out


# ── emit ───────────────────────────────────────────────────────────────────

def fmt(v):
    s = f"{v:.2f}".rstrip('0').rstrip('.')
    return s if s not in ('-0', '') else '0'


def to_d(p):
    return "M" + fmt(p[0][0]) + " " + fmt(p[0][1]) + "".join(
        f"L{fmt(x)} {fmt(y)}" for x, y in p[1:])


def build(items, duration=20.0, seed=7, amp_ratio=0.003, overlap=0.55,
          order="layer", layer_order=("outlines",), pad=0.03, width=0.0016,
          simplify=0.0006):

    xs = [q[0] for p, _ in items for q in p]
    ys = [q[1] for p, _ in items for q in p]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    w, h = maxx - minx, maxy - miny
    scale = max(w, h)

    # flip Rhino's y-up into SVG's y-down, and zero the origin
    items = [([(x - minx, maxy - y) for x, y in p], l) for p, l in items]
    items = chain(items, tol=scale * 0.0012)
    items = [(rdp(p, scale * simplify), l) for p, l in items]
    items = [(p, l) for p, l in items if plen(p) > scale * 0.002]

    rng = random.Random(seed)
    # warm, then re-simplify: the wobble pass resamples densely, and most of
    # those points sit on a near-straight run and cost bytes for nothing.
    items = [(rdp(warm(p, rng, scale * amp_ratio, scale), scale * 0.00035), l)
             for p, l in items]

    # A single pen sweeping out from the bottom-left corner.
    corner = (0.0, h)
    def rank(it):
        p, l = it
        d = min(dist(corner, p[0]), dist(corner, p[-1]))
        if order == "layer":
            pri = next((i for i, nm in enumerate(layer_order)
                        if nm == l.strip().lower()), len(layer_order))
            return (pri, d)
        return (0, d)
    items.sort(key=rank)

    ordered = []
    for p, l in items:
        if dist(corner, p[-1]) < dist(corner, p[0]):
            p = p[::-1]                      # draw from the end nearer the pen
        ordered.append((p, l))

    lens = [plen(p) for p, _ in ordered]
    total = sum(lens) or 1.0
    # Solve pen speed so the last stroke finishes exactly at `duration`,
    # accounting for the fact that overlap compresses the schedule.
    span = ((total - lens[-1]) * (1 - overlap) + lens[-1]) if lens else total
    pen = span / duration                    # constant hand speed

    parts, cum = [], 0.0
    for (p, l), L in zip(ordered, lens):
        dur = max(L / pen, 0.10)
        delay = (cum / pen) * (1 - overlap)
        cum += L
        wv = width * scale * (1 + rng.uniform(-0.20, 0.20))
        cls = "ln" + (" ln-" + l.strip().lower().replace(" ", "-") if l else "")
        parts.append(f'<path class="{cls}" style="--l:{L:.1f};--d:{dur:.2f}s;'
                     f'--t:{delay:.2f}s;--w:{wv:.2f}" d="{to_d(p)}"/>')

    runtime = (cum / pen) * (1 - overlap) + lens[-1] / pen if lens else 0
    px, py = w * pad, h * pad
    vb = f"{-px:.1f} {-py:.1f} {w + 2*px:.1f} {h + 2*py:.1f}"
    svg = ('<svg class="linework" viewBox="' + vb + '" fill="none" '
           'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" '
           'stroke-linecap="round" stroke-linejoin="round">\n'
           + "\n".join(parts) + "\n</svg>")
    return svg, dict(n=len(ordered), ink=total, w=w, h=h, runtime=runtime)


START = "<!-- linework:start — generated by tools/linework.py, do not hand-edit -->"
END   = "<!-- linework:end -->"

def build_label(text, style="hand", start=0.0, duration=2.6, seed=11,
                amp_ratio=0.0035, overlap=0.20, width=0.0131, pad=0.10):
    """A written word, drawn by the same pen and starting after the house."""
    import lettering
    strokes, w, y0, y1 = lettering.render_word(text, style)
    strokes = [[(x, y1 - y) for x, y in s] for s in strokes]   # flip to y-down
    scale = max(w, y1 - y0)

    rng = random.Random(seed)
    strokes = [rdp(warm(s, rng, scale * amp_ratio, scale), scale * 0.0004)
               for s in strokes]

    lens = [plen(s) for s in strokes]
    total = sum(lens) or 1.0
    span = ((total - lens[-1]) * (1 - overlap) + lens[-1]) if lens else total
    pen = span / duration

    parts, cum = [], 0.0
    for st_, L in zip(strokes, lens):
        dur = max(L / pen, 0.08)
        t = start + (cum / pen) * (1 - overlap)
        cum += L
        wv = width * scale * (1 + rng.uniform(-0.15, 0.15))
        parts.append(f'<path class="ln" style="--l:{L:.2f};--d:{dur:.2f}s;'
                     f'--t:{t:.2f}s;--w:{wv:.3f}" d="{to_d(st_)}"/>')

    xs = [q[0] for st_ in strokes for q in st_]
    ys = [q[1] for st_ in strokes for q in st_]
    bw, bh = max(xs) - min(xs), max(ys) - min(ys)
    px, py = bw * pad, bh * pad
    vb = f"{min(xs)-px:.2f} {min(ys)-py:.2f} {bw+2*px:.2f} {bh+2*py:.2f}"
    svg = ('<svg class="linework-label" viewBox="' + vb + '" fill="none" '
           'xmlns="http://www.w3.org/2000/svg" role="img" '
           f'aria-label="{text}" '
           'stroke-linecap="round" stroke-linejoin="round">\n'
           + "\n".join(parts) + "\n</svg>")
    return svg, start + duration


CSS = """.linework-bed .ln{
  stroke-width: var(--w);
  /* --l is rounded: pad the dash and follow it with a gap no stroke can
     outrun, or the round cap shows as a dot at the stroke's tail */
  stroke-dasharray: calc(var(--l) + 0.1) 1000;
  stroke-dashoffset: calc(var(--l) + 0.1);
  animation: ln-draw var(--d) linear var(--t) forwards;
}
@keyframes ln-draw{ to{ stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce){
  .linework-bed .ln{ animation: none; stroke-dashoffset: 0; }
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("-o", "--out")
    ap.add_argument("--duration", type=float, default=20.0,
                    help="seconds for the house to draw; the label follows at 30%% of it")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--amp", type=float, default=0.003,
                    help="hand wobble as a fraction of drawing size; 0 = pure CAD")
    ap.add_argument("--overlap", type=float, default=0.55)
    ap.add_argument("--order", choices=("layer", "wave"), default="layer")
    ap.add_argument("--width", type=float, default=0.0016,
                    help="stroke weight as a fraction of the drawing's size")
    ap.add_argument("--simplify", type=float, default=0.0006)
    ap.add_argument("--skip", default="image",
                    help="comma-separated layer names to exclude (.3dm only)")
    ap.add_argument("--only", default="",
                    help="comma-separated layer names to include, excluding all others")
    ap.add_argument("--inject", metavar="HTML",
                    help="also drop the SVG into this file between the linework markers")
    ap.add_argument("--label", default="", help="word to write above the drawing")
    ap.add_argument("--label-style", choices=("hand", "caps"), default="hand")
    ap.add_argument("--label-duration", type=float, default=None,
                    help="seconds to write the label; defaults to 30%% of --duration")
    ap.add_argument("--label-gap", type=float, default=0.6,
                    help="seconds between the house finishing and the word starting")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()

    ext = os.path.splitext(a.input)[1].lower()
    if ext == ".3dm":
        skip = {x.strip().lower() for x in a.skip.split(",") if x.strip()}
        only = {x.strip().lower() for x in a.only.split(",") if x.strip()} or None
        items = read_3dm(a.input, skip_layers=skip, only_layers=only)
    else:
        items = read_ai(a.input)
    if not items:
        sys.exit("No linework found in that file.")
    src_n = len(items)

    svg, st = build(items, a.duration, a.seed, a.amp, a.overlap,
                    a.order, width=a.width, simplify=a.simplify)

    label_svg = ""
    if a.label:
        label_dur = a.label_duration
        if label_dur is None:
            label_dur = a.duration * 0.30
        label_svg, label_end = build_label(
            a.label, a.label_style, start=st["runtime"] + a.label_gap,
            duration=label_dur)

    out = a.out or os.path.splitext(os.path.basename(a.input))[0] + ".svg"
    open(out, "w").write(svg)
    print(f"{src_n} source curves -> {st['n']} strokes")
    print(f"aspect {st['w']/st['h']:.2f}:1   runtime ~{st['runtime']:.1f}s   "
          f"{os.path.getsize(out)/1024:.1f} KB")
    if a.label:
        print(f"label {a.label!r} ({a.label_style}) writes "
              f"{st['runtime'] + a.label_gap:.1f}s -> {label_end:.1f}s")

    if a.inject:
        import re as _re
        html = open(a.inject).read()
        inner = (label_svg + "\n" + svg) if label_svg else svg
        block = (START + "\n    <div class=\"linework-bed\">\n" + inner
                 + "\n    </div>\n    " + END)
        if START in html and END in html:
            html = _re.sub(_re.escape(START) + r".*?" + _re.escape(END),
                           lambda _m: block, html, flags=_re.S)
        else:
            html = html.replace("\n    <script", "\n    " + block + "\n\n    <script", 1)
        open(a.inject, "w").write(html)
        print(f"injected into {a.inject}")

    if a.preview:
        p = os.path.splitext(out)[0] + "-preview.html"
        open(p, "w").write(f"""<!DOCTYPE html><meta charset="utf-8">
<title>linework preview</title>
<style>
body{{background:#f8f5f0;margin:0;min-height:100vh;display:grid;place-items:center;padding:3vh 3vw;}}
.linework-bed{{display:flex;flex-direction:column;align-items:center;stroke:#1a1a18;}}
.linework{{width:min(820px,90vw);height:auto;}}
.linework-label{{width:min(190px,24vw);height:auto;margin-bottom:.7rem;}}
{CSS}
button{{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%);
font:400 .8rem/1 system-ui;padding:.55rem 1.1rem;border:1px solid #d8d2c8;
border-radius:2rem;background:#fffdf9;color:#6b6862;cursor:pointer;}}
</style>
<div class="linework-bed">{label_svg}{svg}</div>
<button onclick="document.querySelectorAll('svg').forEach(s=>s.replaceWith(s.cloneNode(true)))">replay</button>
""")
        print(f"wrote {p}")


if __name__ == "__main__":
    main()
