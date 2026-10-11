// ── The login reveal ──────────────────────────────────────────────────
//
// "Solomon" in the page heading rearranges itself into "login".
//
// DORMANT BY DEFAULT. Loading this file changes nothing on the page. The
// heading stays plain text until something calls
//
//     LoginReveal.play()
//
// which is the whole job of whatever trigger is added later (a click on
// part of the house drawing, say). LoginReveal.reset() puts the name back.
//
// Nothing is swapped for anything else. The two letters that change are
// the real glyphs of the heading font, drawn in SVG and shown through a
// mask. The mask is a fat stroke running along the path a pen would take,
// so lengthening it WRITES the letter and shortening it UNWRITES it:
//
//   m -> i   the third stem and second arch are unwritten, then the
//            second stem and first arch, leaving the m's own first post.
//            A dot grows above it, and it hops over the g.
//   o -> g   the o itself tightens into the bowl of a g, and the link and
//            lower loop are written out of its underside.
//
// The pen paths below were traced over Cormorant Garamond Light at 100
// units to the em. A different heading font means retracing them.
// Timing and distances are dials in config.js.

(function () {
    'use strict';

    const C = (typeof CONFIG !== 'undefined' && CONFIG.login) || {};
    const DURATION_MS = C.durationMs || 3600;
    const SHIFT_EM    = C.shiftEm    || 0.42;
    const HOP_EM      = C.hopEm      || 0.78;
    const HREF        = C.href       || null;

    // Each beat as [start, end] on a 0..1 timeline.
    const T = Object.assign({
        shift:  [0.00, 0.15],   // "lomon" steps out to the right
        arch2:  [0.15, 0.34],   // m: third stem + second arch unwritten
        arch1:  [0.31, 0.50],   // m: second stem + first arch unwritten
        dot:    [0.48, 0.58],   // a dot grows over the post that is left
        hop:    [0.56, 0.86],   // the i jumps over, to the right of the g
        oMove:  [0.20, 0.84],   // the o travels left
        oBowl:  [0.20, 0.38],   // ...tightening into the bowl of a g
        gTail:  [0.25, 0.80],   // ...the link and loop written out of it
        gEar:   [0.78, 0.88],   // ...and last the ear
        gTrue:  [0.86, 0.97],   // eases the bowl onto the font's exact shape
        nClose: [0.40, 0.90]    // the n closes the gap the m left
    }, C.beats || {});

    // Traced from the font, in 1/100 em, y down from the baseline.
    const O_BOX     = { cx: 23.75, cy: -19.5 };                        // the o
    const BOWL_BOX  = { cx: 21.25, cy: -26.5, sx: 0.753, sy: 0.634 };  // the g's bowl
    const DOT       = { cx: 12.5, cy: -55 };                           // the i's dot
    const POST_TO_I = 1.5;   // the m's post sits this far left of an i's stem

    const CSS =
        '.lr-surname,.lr-tail{white-space:nowrap}' +
        '.lr-letter{display:inline-block;position:relative;will-change:transform}' +
        '.lr-ghost{visibility:hidden}' +                 // holds width + baseline
        '.lr-probe{display:inline-block;width:0;height:0}' +
        '.lr-glyph{position:absolute;left:0;overflow:visible;pointer-events:none}' +
        '.lr-glyph text{font-family:inherit;font-weight:inherit;font-size:100px;letter-spacing:0;fill:currentColor}' +
        '.lr-glyph mask path{fill:none;stroke:#fff;stroke-dasharray:1 2}' +
        '.lr-glyph mask path.lr-foot{stroke-dasharray:none}' +
        '.lr-measure{position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap}' +
        '.lr-measure span{display:inline-block}' +
        '.lr-tail.lr-link{cursor:pointer;transition:color 0.4s ease}' +
        '.lr-tail.lr-link:hover,.lr-tail.lr-link:focus-visible{color:var(--accent)}';

    const MARKUP =
        '<span class="lr-surname">So<span class="lr-tail">' +
        '<span class="lr-letter" data-k="l">l</span>' +
        '<span class="lr-letter" data-k="o">o</span>' +
        '<span class="lr-letter" data-k="m"><span class="lr-ghost">m</span><span class="lr-probe"></span>' +
            '<svg class="lr-glyph" viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(0,70)">' +
            '<defs>' +
            '<clipPath id="lr-m-post"><path d="M -6,-60 H 15.7 V -6 H 26 V 10 H -6 Z"/></clipPath>' +
            '<mask id="lr-m-arches" maskUnits="userSpaceOnUse" x="-10" y="-70" width="120" height="90">' +
            '<path data-p="mA1" pathLength="1" stroke-width="11" d="M 15,-29.5 C 20,-34.5 25,-37.5 30,-37.3 C 35,-37.1 39.1,-34 39.1,-27 L 39.1,0.5"/>' +
            '<path data-p="mF1" class="lr-foot" stroke-width="6" d="M 29,-1.5 H 49.5"/>' +
            '<path data-p="mA2" pathLength="1" stroke-width="11" d="M 40.6,-29.5 C 45.6,-34.5 50.6,-37.5 55.6,-37.3 C 60.6,-37.1 64.7,-34 64.7,-27 L 64.7,0.5"/>' +
            '<path data-p="mF2" class="lr-foot" stroke-width="6" d="M 54.5,-1.5 H 76"/>' +
            '</mask>' +
            '<clipPath id="lr-i-dot"><rect x="0" y="-70" width="30" height="24"/></clipPath>' +
            '</defs>' +
            '<text clip-path="url(#lr-m-post)">m</text>' +
            '<text mask="url(#lr-m-arches)">m</text>' +
            '<g data-p="mDot"><text x="-1.5" clip-path="url(#lr-i-dot)">i</text></g>' +
            '</g></svg></span>' +
        '<span class="lr-letter" data-k="g"><span class="lr-ghost">o</span><span class="lr-probe"></span>' +
            '<svg class="lr-glyph" viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(0,70)">' +
            '<defs>' +
            '<mask id="lr-g-rest" maskUnits="userSpaceOnUse" x="-10" y="-60" width="80" height="100">' +
            '<path data-p="gT" pathLength="1" stroke-width="9" d="M 15.5,-16 C 11,-12 7,-8 7,-4.5 C 7,-1 10,0.2 16,0.2 L 31,0.4 C 38,0.6 41.6,4 41.6,10.5 C 41.6,19 33,26 21,26 C 11,26 5.5,22 5.5,16 C 5.5,10.5 9.5,6 16,2.2"/>' +
            '<path data-p="gE" pathLength="1" stroke-width="8" d="M 31,-36 C 35,-37.6 39,-38 44,-37"/>' +
            '<rect data-p="gAll" x="-10" y="-60" width="80" height="100" fill="#fff" fill-opacity="0"/>' +
            '</mask>' +
            '</defs>' +
            '<text data-p="gO">o</text>' +
            '<text mask="url(#lr-g-rest)">g</text>' +
            '</g></svg></span>' +
        '<span class="lr-letter" data-k="n">n</span>' +
        '</span></span>' +
        '<span class="lr-measure"><span>l</span><span>o</span><span>g</span><span>i</span><span>n</span></span>';

    const clamp  = u => u < 0 ? 0 : u > 1 ? 1 : u;
    const smooth = u => { u = clamp(u); return u * u * (3 - 2 * u); };
    const beat   = (t, k) => smooth((t - T[k][0]) / (T[k][1] - T[k][0]));
    const lerp   = (a, b, k) => a + (b - a) * k;

    let h1 = null, original = null;     // the heading, and what it said
    let el = null, part = null, tail = null, M = null;
    let raf = null, t = 0;

    // Swap the plain heading for the one that can move. Returns false if
    // the heading is not the one this was traced for.
    function build() {
        if (el) return true;
        h1 = document.querySelector('header h1');
        if (!h1 || !/Solomon\s*$/.test(h1.textContent)) return false;

        if (!document.getElementById('lr-style')) {
            const style = document.createElement('style');
            style.id = 'lr-style';
            style.textContent = CSS;
            document.head.appendChild(style);
        }

        original = h1.innerHTML;
        const said = h1.textContent.trim();
        h1.setAttribute('aria-label', said);       // still reads as the name
        h1.innerHTML = said.replace(/Solomon\s*$/, '') + MARKUP;

        tail = h1.querySelector('.lr-tail');
        el = {}; part = {};
        h1.querySelectorAll('.lr-letter').forEach(e => { el[e.dataset.k] = e; });
        h1.querySelectorAll('[data-p]').forEach(e => { part[e.dataset.p] = e; });

        tail.addEventListener('click', follow);
        tail.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') follow();
        });
        window.addEventListener('resize', onResize);
        measure();
        return true;
    }

    function measure() {
        Object.values(el).forEach(e => { e.style.transform = ''; });
        const em  = parseFloat(getComputedStyle(tail).fontSize);
        const x0  = el.l.getBoundingClientRect().left;
        const src = {};
        for (const k in el) src[k] = el[k].getBoundingClientRect().left - x0;
        const ms  = Array.from(h1.querySelector('.lr-measure').children)
                         .map(s => s.getBoundingClientRect());
        const tgt = { g: ms[2].left - ms[0].left, i: ms[3].left - ms[0].left, n: ms[4].left - ms[0].left };
        M = { em, src, tgt };

        // Sit each SVG so its baseline is the heading's baseline.
        [el.m, el.g].forEach(function (slot) {
            const svg  = slot.querySelector('svg');
            const base = slot.querySelector('.lr-probe').getBoundingClientRect().top
                       - slot.getBoundingClientRect().top;
            svg.style.width = svg.style.height = em + 'px';
            svg.style.top   = (base - 0.70 * em) + 'px';
        });
    }

    function onResize() { if (el) { measure(); render(t); } }

    // Unwrite a stroke: u = 0 fully written, 1 fully gone. The foot serif
    // goes first, then the stroke retracts from its far end.
    function unwrite(stroke, foot, u) {
        foot.style.opacity = 1 - clamp(u / 0.12);
        stroke.style.strokeDashoffset = u <= 0 ? 0 : lerp(0, 1.01, u);
    }
    function write(stroke, u) { stroke.style.strokeDashoffset = lerp(1.01, 0, u); }

    function render(now) {
        t = now;
        const em = M.em, shift = SHIFT_EM * em * beat(t, 'shift');

        el.l.style.transform = 'translateX(' + shift + 'px)';
        el.o.style.transform = 'translateX(' + shift + 'px)';
        el.n.style.transform = 'translateX(' +
            (shift + (M.tgt.n - M.src.n) * beat(t, 'nClose')) + 'px)';

        // m -> i
        unwrite(part.mA2, part.mF2, beat(t, 'arch2'));
        unwrite(part.mA1, part.mF1, beat(t, 'arch1'));
        const d = beat(t, 'dot');
        part.mDot.setAttribute('transform',
            'translate(' + DOT.cx + ',' + DOT.cy + ') scale(' + d + ') translate(' + (-DOT.cx) + ',' + (-DOT.cy) + ')');
        const hop = beat(t, 'hop');
        el.m.style.transform = 'translate(' +
            (shift + (M.tgt.i - M.src.m + POST_TO_I / 100 * em) * hop) + 'px,' +
            (-HOP_EM * em * Math.sin(Math.PI * hop)) + 'px)';

        // o -> g
        const b = beat(t, 'oBowl');
        part.gO.setAttribute('transform',
            'translate(' + lerp(O_BOX.cx, BOWL_BOX.cx, b) + ',' + lerp(O_BOX.cy, BOWL_BOX.cy, b) + ') ' +
            'scale(' + lerp(1, BOWL_BOX.sx, b) + ',' + lerp(1, BOWL_BOX.sy, b) + ') ' +
            'translate(' + (-O_BOX.cx) + ',' + (-O_BOX.cy) + ')');
        write(part.gT, beat(t, 'gTail'));
        write(part.gE, beat(t, 'gEar'));
        const tr = beat(t, 'gTrue');
        part.gAll.setAttribute('fill-opacity', tr);
        part.gO.style.opacity = 1 - tr;
        el.g.style.transform = 'translateX(' +
            (shift + (M.tgt.g - M.src.g) * beat(t, 'oMove')) + 'px)';

        // Once it says "login", it is one — but only if there is somewhere to go.
        const open = t >= 1 && !!HREF;
        tail.classList.toggle('lr-link', open);
        if (open) {
            tail.setAttribute('role', 'link');
            tail.setAttribute('tabindex', '0');
            tail.setAttribute('aria-label', 'login');
        } else {
            tail.removeAttribute('role');
            tail.removeAttribute('tabindex');
            tail.removeAttribute('aria-label');
        }
    }

    function follow() {
        if (t >= 1 && HREF) window.location.href = HREF;
    }

    function play() {
        if (!build()) return false;
        cancelAnimationFrame(raf);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            render(1);                       // no show: it simply says "login"
            return true;
        }
        const start = performance.now() - (t >= 1 ? 0 : t) * DURATION_MS;
        (function frame(now) {
            render(Math.min(1, (now - start) / DURATION_MS));
            if (t < 1) raf = requestAnimationFrame(frame);
        })(performance.now());
        return true;
    }

    // Put the plain heading back exactly as it was.
    function reset() {
        cancelAnimationFrame(raf);
        if (!el) return;
        window.removeEventListener('resize', onResize);
        h1.innerHTML = original;
        h1.removeAttribute('aria-label');
        el = part = tail = M = null;
        t = 0;
    }

    window.LoginReveal = {
        play:   play,
        reset:  reset,
        isOpen: function () { return !!el && t >= 1; },
        // Jump to any point, 0..1. For tuning the beats by eye.
        seek:   function (to) {
            if (!build()) return false;
            cancelAnimationFrame(raf);
            render(clamp(to));
            return true;
        }
    };

})();
