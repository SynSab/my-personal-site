(function () {

    const SETTLE_MODE = CONFIG.homepage.intro.settleMode;


    // ── Utilities ──────────────────────────────────────────────────────

    function show(el) {
        el.classList.add('visible');
    }

    function reveal(id, callback) {
        const el = document.getElementById(id);
        el.style.display = 'block';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.add('revealed');
                if (callback) setTimeout(callback, 750);
            });
        });
    }


    // ── Picker 1: Who ─────────────────────────────────────────────────

    const picker1 = document.getElementById('picker-who');
    const words1  = Array.from(picker1.querySelectorAll('.word'));
    const ghost1  = picker1.querySelector('.picker-ghost');
    let   idx1    = 0;
    let   timer1  = null;
    let   locked1 = false;

    const spinSteps = [75, 90, 110, 140, 180, 230, 295, 380, 490, 630, 815, 1055, 1365, 1770, 2200];
    const steadyMs  = 2500;

    function cycle(stepMs, isSettling = false) {
        const duration = Math.min(Math.floor(stepMs * 0.65), 380);

        const prev = words1[idx1];
        idx1 = (idx1 + 1) % words1.length;
        const next = words1[idx1];

        // Exit — always the same
        prev.style.animation  = 'none';
        prev.style.transition = `transform ${duration}ms ease-in-out, opacity ${Math.floor(duration * 0.75)}ms ease`;
        prev.classList.remove('visible');
        prev.classList.add('exiting');

        // Enter — normal or settling
        next.style.animation  = '';
        if (isSettling && SETTLE_MODE === 'bounce') {
            const bounceDuration = Math.max(duration * 1.8, 850);
            next.style.transition = 'none';
            next.style.animation  = `word-bounce ${bounceDuration}ms linear forwards`;
        } else if (isSettling && SETTLE_MODE === 'overshoot') {
            next.style.transition = 'none';
            next.style.animation  = `word-overshoot 750ms linear forwards`;
        } else {
            next.style.transition = `transform ${duration}ms ease-in-out, opacity ${Math.floor(duration * 0.75)}ms ease`;
        }
        next.classList.add('visible');

        // After exit completes, snap prev back above the slot (no animation)
        setTimeout(() => {
            prev.style.transition = 'none';
            prev.style.animation  = '';
            prev.classList.remove('exiting');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                prev.style.transition = '';
            }));
        }, duration + 30);
    }

    function startSpin() {
        words1[0].style.transition = 'none';
        show(words1[0]);

        let step = 0;

        function runStep() {
            if (locked1) return;

            const ms          = spinSteps[step];
            const isLastStep  = (step === spinSteps.length - 1);
            // Overshoot settles only on the final spin-down step
            const isSettling  = (SETTLE_MODE === 'overshoot' && isLastStep);

            cycle(ms, isSettling);
            step++;

            if (step < spinSteps.length) {
                setTimeout(runStep, ms);
            } else {
                // Bounce applies to every steady-state cycle
                timer1 = setInterval(() => {
                    if (!locked1) cycle(steadyMs, SETTLE_MODE === 'bounce');
                }, steadyMs);
            }
        }

        setTimeout(runStep, spinSteps[0]);
    }

    function select1() {
        if (locked1) return;
        locked1 = true;
        clearInterval(timer1);

        words1.forEach(w => {
            w.style.transition = 'none';
            w.style.animation  = '';
            w.classList.remove('visible', 'exiting');
        });

        words1[idx1].classList.add('selected');
        picker1.classList.add('locked');
        picker1.removeEventListener('click', select1);

        // Collapse picker width to fit the selected word (removes the gap)
        ghost1.textContent = words1[idx1].textContent.trim();

        const val = words1[idx1].dataset.value;
        if (val === 'friend') reveal('branch-friend', initPicker2);
    }

    startSpin();
    picker1.addEventListener('click', select1);


    // ── Picker 2: For what ────────────────────────────────────────────

    function initPicker2() {
        const picker2 = document.getElementById('picker-for');
        const words2  = Array.from(picker2.querySelectorAll('.word'));

        show(words2[0]);

        function selectTies() {
            words2[0].classList.remove('visible');
            words2[0].classList.add('selected');
            picker2.classList.add('locked');
            picker2.removeEventListener('click', selectTies);

            const version = CONFIG.ties2.design.version;
            const url     = version === 'green' ? 'ties-2-green.html' : 'ties-2.html';
            setTimeout(() => { window.location.href = url; }, 500);
        }

        picker2.addEventListener('click', selectTies);
    }

})();
