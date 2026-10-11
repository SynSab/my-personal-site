(function () {
    'use strict';

    const W      = CONFIG.homepage.wheel;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // How fast the final rock-back dies away. Higher settles sooner.
    const SETTLE_DAMP = 3.2;


    // ── The spin ──────────────────────────────────────────────────────
    //
    // A spin is one number over time: `p`, how far the strip of words has
    // travelled upward in pixels. Four phases, each a closed-form function
    // of t, each starting at the position AND the speed the previous one
    // ended at — so there is no frame in the whole spin where either jumps.
    //
    //   accelerate   v: 0 -> vMax      constant acceleration
    //   run          v: vMax           words blur past
    //   decelerate   v: vMax -> ~0     exponential decay, i.e. friction
    //   settle       a damped rock about the landing
    //
    // The landing is exact rather than corrected. We take the decel
    // distance the requested duration implies, push it forward to the next
    // distance that comes to rest on the row we want, and then derive the
    // decel's duration from that distance. Distance is what has to be a
    // whole number of rows; duration is free, so duration is what gives.
    // That is why the wheel never has to snap or nudge at the end.

    function Spin(cfg) {
        const L     = cfg.rowH * cfg.rows;              // one full turn, px
        const vMax  = cfg.topSpeed * cfg.rowH / 1000;   // px per ms
        const decay = 1 - Math.exp(-cfg.friction);
        const C     = cfg.friction / decay;

        const dAccel = vMax * cfg.accelMs / 2;
        const pRun   = cfg.p0 + dAccel + vMax * cfg.fastMs;   // decel starts here

        let dDecel = Math.max(vMax * cfg.decelMs / C, cfg.minTurns * L);
        let pEnd   = pRun + dDecel;

        if (cfg.targetRow === null) {
            // Physics decides: stop at the nearest detent.
            pEnd = Math.round(pEnd / cfg.rowH) * cfg.rowH;
            // Nearest can round backwards. A wheel does not reverse, and a
            // landing behind the start would give the decel a negative
            // duration, so step on to the next row instead.
            while (pEnd < pRun + cfg.rowH * 0.15) pEnd += cfg.rowH;
        } else {
            // Carry on to the next landing that is the row we want.
            pEnd += (((cfg.targetRow * cfg.rowH - pEnd) % L) + L) % L;
            while (pEnd < pRun + cfg.rowH * 0.15) pEnd += L;
        }
        dDecel = pEnd - pRun;

        const tDecel = dDecel * C / vMax;               // the honest duration
        const vRes   = vMax * Math.exp(-cfg.friction);  // speed still left over
        const amp    = Math.min(vRes * cfg.settleMs / (2 * Math.PI),
                                cfg.overshoot * cfg.rowH);

        const total = cfg.accelMs + cfg.fastMs + tDecel + cfg.settleMs;

        return {
            total: total,
            end:   pEnd,
            row:   ((Math.round(pEnd / cfg.rowH) % cfg.rows) + cfg.rows) % cfg.rows,

            at: function (t) {
                if (t <= 0)     return cfg.p0;
                if (t >= total) return pEnd;

                if (t < cfg.accelMs) {
                    const u = t / cfg.accelMs;
                    return cfg.p0 + dAccel * u * u;
                }
                t -= cfg.accelMs;

                if (t < cfg.fastMs) return cfg.p0 + dAccel + vMax * t;
                t -= cfg.fastMs;

                if (t < tDecel) {
                    const u = t / tDecel;
                    return pRun + dDecel * (1 - Math.exp(-cfg.friction * u)) / decay;
                }
                t -= tDecel;

                const u = t / cfg.settleMs;
                return pEnd + amp * Math.exp(-SETTLE_DAMP * u) * Math.sin(2 * Math.PI * u);
            },

            // Speed right now, so a click can brake from wherever it is.
            speed: function (t) {
                if (t <= 0 || t >= total) return 0;
                if (t < cfg.accelMs) return vMax * (t / cfg.accelMs);
                t -= cfg.accelMs;
                if (t < cfg.fastMs) return vMax;
                t -= cfg.fastMs;
                if (t < tDecel) {
                    const u = t / tDecel;
                    return dDecel * cfg.friction * Math.exp(-cfg.friction * u) / decay / tDecel;
                }
                return 0;
            }
        };
    }


    // ── A wheel ───────────────────────────────────────────────────────

    function Wheel(picker, onLand) {
        const words = Array.from(picker.querySelectorAll('.word'));
        const n     = words.length;
        if (!n) return null;

        picker.style.setProperty('--row',  W.rowHeightEm + 'em');
        picker.style.setProperty('--fade', W.edgeFadeEm  + 'em');

        // The words move into a strip, and a second copy follows them, so
        // that at any offset the window has something in it. Without the
        // copy the wheel would show a gap every time it came round.
        const win   = document.createElement('span');
        const strip = document.createElement('span');
        win.className   = 'picker-window';
        strip.className = 'picker-strip';
        // Turning downward, the strip slides the other way, so the words
        // are laid on it in reverse. That keeps the order they come round
        // in — and all the arithmetic below — the same in both directions.
        const down  = W.direction !== 'up';
        const order = down ? [words[0]].concat(words.slice(1).reverse()) : words;
        order.forEach(w => strip.appendChild(w));
        if (n > 1) order.forEach(w => strip.appendChild(w.cloneNode(true)));
        win.appendChild(strip);
        win.setAttribute('aria-hidden', 'true');   // a spinning wheel is not read aloud
        picker.appendChild(win);
        picker.classList.add('ready');

        picker.setAttribute('role', 'button');
        picker.setAttribute('tabindex', '0');

        let rowH = 0, L = 0;
        function measure() {
            rowH = words[0].getBoundingClientRect().height;
            L    = rowH * n;
        }
        measure();

        let p         = 0;      // strip travel, px
        let row       = 0;      // the word currently in the window
        let spin      = null;   // the spin in flight, or null at rest
        let t0        = 0;
        let raf       = null;
        let pause     = null;
        let finishing = false;  // a click is waiting for this spin to land
        let locked    = false;

        function draw() {
            let off = ((p % L) + L) % L;
            if (down) off = (L - off) % L;
            strip.style.transform = 'translate3d(0,' + (-off) + 'px,0)';
        }

        function label() {
            picker.setAttribute('aria-label', words[row].textContent.trim());
        }

        function targetRow() {
            const t = W.target;
            if (t === 'random') return Math.floor(Math.random() * n);
            if (typeof t === 'number') return ((t % n) + n) % n;
            if (typeof t === 'string') {
                const i = words.findIndex(w => w.dataset.value === t);
                if (i >= 0) return i;
            }
            return null;   // let the physics land it
        }

        function launch(opts) {
            measure();
            spin = Spin({
                p0: p, rowH: rowH, rows: n, targetRow: targetRow(),
                friction: W.friction,
                settleMs: W.settleMs, overshoot: W.settleOvershoot,
                topSpeed: opts.topSpeed,
                accelMs:  opts.accelMs,
                fastMs:   opts.fastMs,
                decelMs:  opts.decelMs,
                minTurns: opts.minTurns
            });
            t0 = performance.now();
            if (raf === null) raf = requestAnimationFrame(frame);
        }

        function start() {
            if (locked || spin) return;
            launch({
                topSpeed: W.topSpeed, accelMs: W.accelMs,
                fastMs: W.fastMs, decelMs: W.decelMs, minTurns: W.minTurns
            });
        }

        function frame(now) {
            raf = null;
            if (!spin) return;

            const t = now - t0;
            p = spin.at(t);
            draw();

            if (t < spin.total) {
                raf = requestAnimationFrame(frame);
                return;
            }

            p   = spin.end;
            row = spin.row;
            spin = null;
            draw();
            label();

            if (finishing)            { finish(); return; }
            if (onLand) onLand(words[row].dataset.value, false);
            if (W.loop && !locked)    pause = setTimeout(function () {
                pause = null;
                start();
            }, W.pauseMs);
        }

        // A click does not stop the wheel dead — it puts the brake on, and
        // the wheel coasts to whatever word that brings up.
        function choose() {
            if (locked || finishing) return;
            clearTimeout(pause);
            pause = null;

            if (spin) {
                const t = performance.now() - t0;
                // Bring the wheel up to date before reading it. `p` is only
                // as fresh as the last frame, and frames stop arriving
                // whenever the tab is hidden or the main thread stalls — so
                // a click can otherwise be answered from a stale position.
                p = spin.at(t);
                const v = spin.speed(t) * 1000 / rowH;
                finishing = true;

                if (t >= spin.total) {
                    // Logically over; frame() simply has not run yet.
                    p    = spin.end;
                    row  = spin.row;
                    spin = null;
                    draw();
                } else if (v >= W.minBrakeSpeed) {
                    launch({
                        topSpeed: v,                 // brake from this speed
                        accelMs: 0, fastMs: 0,
                        decelMs: W.brakeMs, minTurns: 0
                    });
                    return;
                } else {
                    // Already crawling. Braking from here would take seconds
                    // to cover the last few pixels, and a click should feel
                    // answered, so take the word it is sitting on — it is
                    // within a pixel of the row, so nothing visibly moves.
                    spin = null;
                    p    = Math.round(p / rowH) * rowH;
                    row  = ((Math.round(p / rowH) % n) + n) % n;
                    draw();
                }
            }
            finish();
        }

        function finish() {
            locked    = true;
            finishing = false;
            picker.classList.add('locked');
            picker.removeAttribute('tabindex');
            label();
            // The wheel has stopped being a wheel. Shrink the reserved
            // width from the longest word down to the one that landed, so
            // the finished sentence closes up and reads as ordinary text.
            const ghost = picker.querySelector('.picker-ghost');
            if (ghost) ghost.textContent = words[row].textContent.trim();
            if (onLand) onLand(words[row].dataset.value, true);
        }

        function rest(value) {
            const i = Math.max(0, words.findIndex(w => w.dataset.value === value));
            row = i;
            p   = i * rowH;
            draw();
            label();
        }

        picker.addEventListener('click', choose);
        picker.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
        });

        let resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                measure();
                if (!spin) { p = row * rowH; draw(); }
            }, 150);
        });

        return {
            // One word, or reduced motion: nothing turns, the word is there.
            still: function (value) { rest(value); },
            spin:  function () { start(); },
            spinWhenVisible: function () {
                if (!('IntersectionObserver' in window)) { start(); return; }
                const io = new IntersectionObserver(function (entries) {
                    if (entries[0].isIntersecting) { io.disconnect(); start(); }
                }, { threshold: 0.25 });
                io.observe(picker);
            }
        };
    }


    // ── Reveal (the horizontal branch) ────────────────────────────────

    function reveal(id, callback) {
        const el = document.getElementById(id);
        el.style.display = 'block';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                el.classList.add('revealed');
                if (callback) setTimeout(callback, 750);
            });
        });
    }


    // ── The sentence ──────────────────────────────────────────────────

    const who = Wheel(document.getElementById('picker-who'), function (value, chosen) {
        if (chosen && value === 'friend') reveal('branch-friend', initFor);
    });

    if (reduce) who.still(W.reducedMotionWord);
    else        who.spinWhenVisible();

    function initFor() {
        const el = document.getElementById('picker-for');
        const forWhat = Wheel(el, function (value, chosen) {
            if (!chosen) return;
            const url = CONFIG.ties2.design.version === 'green'
                ? 'ties-2-green.html'
                : 'ties-2.html';
            setTimeout(function () { window.location.href = url; }, 500);
        });
        // One word on this wheel, so there is nothing to spin.
        forWhat.still('ties');
    }

})();
