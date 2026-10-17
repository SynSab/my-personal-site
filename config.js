const CONFIG = {


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HOMEPAGE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    homepage: {

        // ── The word wheel ────────────────────────────────────────────
        // A strip of words turning behind a window the width of one word.
        // Every value here is a dial; none of them are load-bearing for
        // correctness, so tune freely and reload.

        wheel: {

            // ── Motion, phase by phase ──
            // Total spin is roughly accelMs + fastMs + decelMs + settleMs.
            // The real decel is a little longer than decelMs, because the
            // wheel is only allowed to stop exactly on a word — see below.

            accelMs:   200,   // still  -> full speed
            fastMs:    700,   // full speed, words too fast to read
            decelMs:  2000,   // full speed -> nearly stopped
            settleMs:  300,   // the last small rock into place

            // Which way the words travel through the window: 'down' or 'up'.
            direction: 'down',

            // Top speed, in words per second. Above ~14 they blur.
            topSpeed:   18,

            // The shape of the deceleration. This is the exponent of the
            // decay, so it behaves like friction rather than like a curve
            // someone drew: higher bites harder at first and crawls longer
            // at the end. 1.5 is loose and coasting, 5 is a firm brake.
            //
            // It also decides how hard the wheel rocks when it lands. The
            // settle is not a separate flourish — it is the momentum the
            // friction failed to absorb, which is why it has to stay
            // fairly low. Above about 3.5 the wheel arrives dead and the
            // settle disappears entirely.
            friction:  3.0,

            // The wheel must turn at least this many full times before it
            // is allowed to land.
            minTurns:    1,

            // A ceiling on how far past the landing the wheel is carried
            // before it rocks back, as a fraction of one row. The actual
            // overshoot is whatever momentum survived the friction; this
            // only stops a very fast spin from lurching.
            settleOvershoot: 0.15,

            // How hard the wheel brakes when clicked mid-spin. Shorter than
            // decelMs because a click should feel answered.
            brakeMs:   900,

            // Below this speed (words per second) a click stops asking for a
            // brake and simply takes the word underneath. Braking from a
            // crawl is arithmetically correct and feels broken: it can spend
            // two seconds travelling four pixels.
            minBrakeSpeed: 3,

            // ── Where it lands ──
            //   null      -> wherever the physics puts it, like a real wheel
            //   'random'  -> a different word each spin
            //   'friend'  -> always this word (any word on the wheel)
            target:   null,

            // ── Between spins ──
            loop:     true,
            pauseMs:  1800,   // how long the landed word is held

            // ── Geometry ──
            // rowHeight is both the window's height and the spacing of the
            // words on the strip, so a landed word sits exactly on the
            // sentence's own baseline. In em, so it scales with the type.
            rowHeightEm: 1.5,
            edgeFadeEm:  0.14,  // softens the crop at the window's edges

            // ── prefers-reduced-motion ──
            // No wheel, no spinning. This word is simply there, and
            // clicking it still works, so the Ties branch stays reachable.
            reducedMotionWord: 'friend',

        },

    },


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TIES 2  (March 28)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ties2: {

        design: {
            // Which Ties 2 page the picker's 'Ties' word opens
            // 'minimal' — matches the main site aesthetic (warm off-white, Cormorant)
            // 'green'   — uses the original Ties green aesthetic
            version: 'green',
        },

    },


    // ══════════════════════════════════════════════════════════════════
    //  LOGIN REVEAL
    // ══════════════════════════════════════════════════════════════════
    // "Solomon" in the heading rearranges itself into "login" (login.js).
    // A click on any plant in front of the house starts it (plants.js);
    // a second click puts the name back.

    login: {

        durationMs: 3600,   // the whole rearrangement, start to finish
        shiftEm:    0.42,   // how far "lomon" steps away from "So"
        hopEm:      0.78,   // how high the i jumps over the g

        // Where "login" goes when clicked: the plant app. Set to null
        // and the word is not a link.
        href: '/plants',

        // Each beat's [start, end] on a 0..1 timeline can be overridden
        // here, e.g.  beats: { hop: [0.60, 0.90] }.  The full table, with
        // what each beat does, is at the top of login.js.
        beats: {},

    },


    // ══════════════════════════════════════════════════════════════════
    //  PLANTS
    // ══════════════════════════════════════════════════════════════════
    // The beds in front of the house. They grow once the house is drawn,
    // and a click on any plant plays the login reveal above (plants.js).

    plants: {

        // 'house' — the same ink as the house
        // 'green' — sage green
        // 'beige' — warm beige
        colour: 'house',

        // 'regular' — the same line weight as the house
        // 'thin'    — a finer line, so the leaves do not clot together
        line: 'thin',

        // How a plant shows it can be clicked.
        // 'quiet'  — only the cursor changes
        // 'ink'    — the plant under the cursor darkens (on a phone, when tapped)
        // 'rustle' — as 'ink', and now and then one plant sways
        hint: 'ink',

    },


};
