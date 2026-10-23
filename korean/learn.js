/*
   Learn mode.

   A few words at a time, over and over, until they stick. There are no
   rounds: a small handful of new words cycles fast, and as each one
   sticks it comes back less and less often, which leaves room for the
   next new word to join and take its turn at the front.

   Every word has a level (LEVELS). The level sets how it's asked and how
   many cards later it comes back. A new word is first shown with its
   meaning, then asked as a plain flip card (think of it, flip, say
   whether you knew it) until it's familiar; only then as four choices,
   then typed. Knowing it moves it up a level; missing it drops it back
   toward the flip cards. At most FRESH_LIMIT words are at the flip
   stage at once; a new word joins when one moves past it.

   A word is learned once it's been typed right twice (the two write
   levels), and then it's out of play. When every word is learned the
   deck is done, and its progress is wiped so the next time starts
   fresh. Leaving partway keeps your place.

   The toggle above sets the language of the questions: in Korean, you
   answer in English; in English, you answer in Korean. Knowing a word
   one way isn't knowing it the other, so each way keeps its own levels,
   per word, in this browser.

   Needs app.js loaded first (window.Korean).
*/

(function () {
    const PROGRESS_KEY = 'korean.learn';   // { korean: { "korean|english": level }, english: {…} }

    // How a word is asked at each level, and how many cards later it
    // comes back (2 = one other card in between). Right at the last
    // level, and it's learned.
    const LEVELS = [
        { ask: 'flip',   gap: 2 },
        { ask: 'flip',   gap: 3 },
        { ask: 'flip',   gap: 5 },
        { ask: 'choice', gap: 8 },
        { ask: 'write',  gap: 13 },
        { ask: 'write',  gap: 21 },
    ];
    const LEARNED = LEVELS.length;   // the level past the end
    const FRESH_LIMIT = 4;       // words at the flip stage at once
    const RIGHT_PAUSE = 1100;    // ms a right answer shows before moving on

    const K = window.Korean;

    const stage       = document.querySelector('.learn-stage');
    const countEl     = document.querySelector('.learn-count');
    const learnedBar  = document.querySelector('.meter-learned');
    const learningBar = document.querySelector('.meter-learning');
    const summaryEl   = document.querySelector('.learn-summary');
    const restartBtn  = document.querySelector('.restart');

    let progress = readProgress();
    let deck = null;        // the deck on the mode screen or being learned
    let active = false;     // on the study screen
    let pool = new Map();   // words in play this visit: key → { c, due }
    let turn = 0;           // cards shown this visit
    let lastKey = null;     // the word just asked, not to be asked twice running
    let onKey = null;       // the current card's keyboard handler
    let timer = null;       // pending move-on after a right answer


    // ─── Progress ────────────────────────────────────────

    function readProgress() {
        try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function saveProgress() {
        try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) {}
    }

    // The language questions are asked in, and the one answered in.
    const asked = () => K.front();
    const answered = () => asked() === 'korean' ? 'english' : 'korean';

    const keyOf = c => c.korean + '|' + c.english;
    const table = (lang = asked()) => progress[lang] || {};
    const levelOf = (c, lang) => table(lang)[keyOf(c)];   // undefined until first shown
    const isLearned = (c, lang) => levelOf(c, lang) >= LEARNED;

    function setLevel(c, level) {
        progress[asked()] = Object.assign(table(), { [keyOf(c)]: level });
        saveProgress();
    }

    function forget(lang) {
        if (!progress[lang]) return;
        K.listed(deck.name).forEach(c => { delete progress[lang][keyOf(c)]; });
        saveProgress();
    }

    function deckWords() {
        return K.listed(deck.name);
    }

    function renderMeter() {
        const words = deckWords();
        const learned = words.filter(c => isLearned(c)).length;
        const learning = words.filter(c => levelOf(c) !== undefined && !isLearned(c)).length;
        const fresh = words.length - learned - learning;
        learnedBar.style.width = (100 * learned / words.length) + '%';
        learningBar.style.width = (100 * learning / words.length) + '%';
        countEl.textContent =
            learned + ' learned · ' + learning + ' learning · ' + fresh + ' not studied';
    }

    // On the mode screen: how far each way has got.
    function describe(d) {
        deck = d;
        const words = deckWords();
        const count = lang => words.filter(c => isLearned(c, lang)).length;
        const started = words.some(c => levelOf(c, 'korean') !== undefined || levelOf(c, 'english') !== undefined);
        summaryEl.textContent = started
            ? 'Learned ' + count('korean') + ' of ' + words.length + ' from Korean, ' +
              count('english') + ' from English.'
            : '';
        restartBtn.hidden = !started;
    }

    restartBtn.addEventListener('click', () => {
        if (!confirm('Forget your Learn progress on ' + deck.label + ', both ways?')) return;
        forget('korean');
        forget('english');
        describe(deck);
    });


    // ─── Which card next ─────────────────────────────────

    // Words already started come back into play, the least known soonest.
    function begin() {
        clearTimeout(timer);
        pool = new Map();
        turn = 0;
        lastKey = null;
        K.shuffled(deckWords()).forEach(c => {
            const level = levelOf(c);
            if (level === undefined || level >= LEARNED) return;
            pool.set(keyOf(c), { c, due: 1 + Math.floor(Math.random() * LEVELS[level].gap) });
        });
        renderMeter();
        next();
    }

    const isFresh = e => LEVELS[levelOf(e.c)].ask === 'flip';

    // The most overdue word; or, with nothing due and room at the flip
    // stage, a new one; or else whichever word is due soonest.
    function next() {
        clearTimeout(timer);
        turn++;
        const unseen = deckWords().filter(c => levelOf(c) === undefined);
        if (!pool.size && !unseen.length) return finish();
        const inPlay = [...pool.values()].filter(e => keyOf(e.c) !== lastKey || pool.size === 1);
        const soonest = inPlay.sort((a, b) => a.due - b.due)[0];
        if (soonest && soonest.due <= turn) return ask(soonest.c);
        const fresh = [...pool.values()].filter(isFresh).length;
        if (fresh < FRESH_LIMIT && unseen.length) return introduce(unseen[Math.floor(Math.random() * unseen.length)]);
        ask(soonest.c);
    }

    function ask(c) {
        lastKey = keyOf(c);
        const how = LEVELS[levelOf(c)].ask;
        if (how === 'flip') askFlip(c);
        else if (how === 'choice') askChoice(c);
        else askWritten(c);
    }

    // Knowing it moves it up a level, and past the last it's learned and
    // leaves play. Missing a flip card starts it over; missing a harder
    // question drops it two levels, back toward flipping.
    function settle(c, right) {
        const level = levelOf(c) || 0;
        const now = right ? level + 1
            : LEVELS[level].ask === 'flip' ? 0 : Math.max(level - 2, 0);
        setLevel(c, now);
        if (now >= LEARNED) pool.delete(keyOf(c));
        else pool.get(keyOf(c)).due = turn + LEVELS[now].gap;
        renderMeter();
        next();
    }

    // Every word typed right twice: the deck is done. Its progress this
    // way round is wiped, so the next time starts fresh.
    function finish() {
        forget(asked());
        const actions = el('div', 'learn-actions');
        screen('Deck learned',
            el('p', 'note', 'You typed every word in ' + deck.label + ' correctly twice.'),
            actions);
        actions.appendChild(continueButton(begin, 'Start again'));
    }


    // ─── Pieces of a card ────────────────────────────────

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function button(className, text, onClick) {
        const b = el('button', className, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    // A word in Korean or English, with a speaker button for Korean.
    function wordLine(c, lang, className) {
        const line = el('div', className);
        const word = el('div', 'word' + (lang === 'korean' ? ' ko' : ''), c[lang]);
        word.lang = lang === 'korean' ? 'ko' : 'en';
        line.appendChild(word);
        const btn = lang === 'korean' && K.speakButton(c.korean);
        if (btn) line.appendChild(btn);
        return line;
    }

    // Korean questions are read as they're asked. With English questions
    // the Korean is the answer, so it's read only once it's shown.
    function readAloud(c) {
        K.sayIfOn(c.korean, stage.querySelector('.speak'));
    }

    function screen(label, ...children) {
        stage.innerHTML = '';
        stage.onclick = null;
        stage.append(el('p', 'learn-label', label), ...children);
    }

    // Enter (or a click) moves on. Enter is ignored for a moment so the
    // keypress that submitted an answer can't also skip past the result:
    // a Korean keyboard can send Enter twice while finishing a syllable.
    function onEnter(go) {
        const shownAt = performance.now();
        onKey = e => {
            if (e.key === 'Enter' && performance.now() - shownAt > 400) {
                e.preventDefault();
                go();
            }
        };
    }

    // Each of these runs once, however many ways it's set off.
    function once(fn) {
        let used = false;
        return (...args) => { if (!used) { used = true; fn(...args); } };
    }

    function continueButton(onGo, text) {
        const go = once(onGo);
        onEnter(go);
        return button('primary', text || 'Continue', go);
    }

    // A right answer shows for a moment, then moves on; Enter skips the wait.
    function moveOnSoon(c) {
        const go = once(() => settle(c, true));
        onEnter(go);
        timer = setTimeout(go, RIGHT_PAUSE);
    }


    // ─── New word ────────────────────────────────────────

    // Shown with its meaning straight away: nothing to recall yet.
    function introduce(c) {
        lastKey = keyOf(c);
        setLevel(c, 0);
        pool.set(keyOf(c), { c, due: turn + LEVELS[0].gap });
        renderMeter();
        const actions = el('div', 'learn-actions');
        screen('New word',
            wordLine(c, asked(), 'prompt'),
            wordLine(c, answered(), 'answer-line reveal'),
            actions);
        readAloud(c);
        const go = once(next);
        actions.appendChild(button('primary', 'Next', go));
        onKey = e => {
            if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
                e.preventDefault();
                go();
            }
        };
    }


    // ─── Flip card ───────────────────────────────────────

    // Think of the answer, flip (tap the card, or space), then say
    // whether you knew it. Nothing typed: just seeing it often.
    function askFlip(c) {
        const actions = el('div', 'learn-actions');
        const flipBtn = button('primary', 'Flip', flip);
        actions.appendChild(flipBtn);
        screen('Think of it, then flip', wordLine(c, asked(), 'prompt'), actions);
        if (asked() === 'korean') readAloud(c);
        stage.onclick = e => { if (!e.target.closest('button')) flip(); };
        onKey = e => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
        };

        let flipped = false;
        function flip() {
            if (flipped) return;
            flipped = true;
            stage.onclick = null;
            stage.insertBefore(wordLine(c, answered(), 'answer-line reveal'), actions);
            if (asked() === 'english') readAloud(c);
            const choose = once(right => settle(c, right));
            actions.innerHTML = '';
            actions.append(
                button('quiet', 'Not yet', () => choose(false)),
                button('primary', 'Got it', () => choose(true)));
            onKey = e => {
                if (e.key === '1' || e.key === 'ArrowLeft') choose(false);
                if (e.key === '2' || e.key === 'ArrowRight') choose(true);
            };
        }
    }


    // ─── Multiple choice ─────────────────────────────────

    // Three wrong answers, as alike the right one as the deck allows:
    // same deck first, and numbers only alongside numbers.
    function distractors(c) {
        const all = K.listed('all');
        const isNumber = o => /^\d/.test(o.english);   // "0 (as in nothing)" too
        const alike = o => isNumber(o) === isNumber(c);
        const sameDeck = all.filter(o => o.deck === c.deck);
        const seen = new Set([c[answered()]]);
        const out = [];
        for (const group of [sameDeck.filter(alike), sameDeck, all.filter(alike), all]) {
            for (const o of K.shuffled(group)) {
                if (out.length === 3) return out;
                if (!seen.has(o[answered()])) { seen.add(o[answered()]); out.push(o); }
            }
        }
        return out;
    }

    function askChoice(c) {
        const lang = answered();
        const options = K.shuffled([c, ...distractors(c)]);
        const list = el('div', 'choices');
        const feedback = el('div', 'feedback');
        const actions = el('div', 'learn-actions');
        let done = false;

        options.forEach((o, i) => {
            const b = button('choice', '', () => pick(o));
            const text = el('span', lang === 'korean' ? 'ko' : '', o[lang]);
            text.lang = lang === 'korean' ? 'ko' : 'en';
            b.append(el('span', 'choice-key', String(i + 1)), text);
            list.appendChild(b);
        });
        actions.appendChild(button('quiet', 'Don’t know', () => pick(null)));

        screen(lang === 'english' ? 'Choose the meaning' : 'Choose the Korean',
            wordLine(c, asked(), 'prompt'), list, feedback, actions);
        if (asked() === 'korean') readAloud(c);

        onKey = e => {
            const n = Number(e.key);
            if (n >= 1 && n <= options.length) pick(options[n - 1]);
        };

        function pick(o) {
            if (done) return;
            done = true;
            const right = o === c;
            list.querySelectorAll('.choice').forEach((b, i) => {
                b.disabled = true;
                if (options[i] === c) b.classList.add('right');
                else if (options[i] === o) b.classList.add('wrong');
            });
            if (asked() === 'english') readAloud(c);
            actions.innerHTML = '';
            if (right) {
                feedback.append(el('p', 'verdict right', 'Right'));
                moveOnSoon(c);
            } else {
                feedback.append(el('p', 'verdict wrong', o ? 'Not quite' : 'Here it is'));
                actions.appendChild(continueButton(() => settle(c, false)));
            }
        }
    }


    // ─── Written ─────────────────────────────────────────

    // Case, spacing and punctuation never count: 안 좋아요 = 안좋아요!
    function squash(s) {
        return s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    }

    // In English any one meaning will do ("country" for "country, nation"),
    // with or without what's in brackets ("Korea" for "(South) Korea").
    function accepted(c) {
        if (answered() === 'korean') return [squash(c.korean)];
        const out = new Set([squash(c.english)]);
        c.english.split(/[,;\/]/).forEach(part => {
            out.add(squash(part));
            out.add(squash(part.replace(/\([^)]*\)/g, '')));
        });
        out.delete('');
        return [...out];
    }

    const isRight = (typed, c) => accepted(c).includes(squash(typed));
    const hasHangul = s => /[ㄱ-ㆎ가-힣]/.test(s);

    function answerForm(placeholder, onSubmit) {
        const form = el('form', 'answer');
        const input = el('input');
        input.lang = answered() === 'korean' ? 'ko' : 'en';
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('aria-label', placeholder);
        form.append(input, el('button', 'primary', 'Check'));
        form.addEventListener('submit', e => {
            e.preventDefault();
            if (input.value.trim()) onSubmit(input.value, input);
        });
        return { form, input };
    }

    function askWritten(c) {
        const lang = answered();
        const { form, input } = answerForm(lang === 'korean' ? 'Type it in Korean' : 'Type it in English', check);
        const feedback = el('div', 'feedback');
        const actions = el('div', 'learn-actions');
        actions.appendChild(button('quiet', 'Don’t know', () => check(null)));

        screen(lang === 'korean' ? 'Write the Korean' : 'Write the meaning',
            wordLine(c, asked(), 'prompt'), form, feedback, actions);
        if (asked() === 'korean') readAloud(c);
        onKey = null;
        input.focus();

        function check(typed) {
            const right = typed !== null && isRight(typed, c);
            input.readOnly = true;
            form.querySelector('button').remove();
            actions.innerHTML = '';
            input.classList.add(right ? 'right' : 'wrong');

            if (right) {
                feedback.append(el('p', 'verdict right', 'Right'), wordLine(c, lang, 'answer-line'));
                if (lang === 'korean') readAloud(c);
                moveOnSoon(c);
                return;
            }

            feedback.append(
                el('p', 'verdict wrong', typed === null ? 'Here it is' : 'Not quite'),
                wordLine(c, lang, 'answer-line'));
            if (typed !== null && lang === 'korean' && !hasHangul(typed)) {
                feedback.appendChild(el('p', 'note', 'Tip: switch your keyboard to Korean to type Hangul.'));
            } else if (typed !== null && lang === 'english' && hasHangul(typed)) {
                feedback.appendChild(el('p', 'note', 'Tip: switch your keyboard back to English.'));
            }
            if (lang === 'korean') readAloud(c);

            // Type the right answer once to move on: practice writing it.
            let settled = false;
            const finish = r => { if (!settled) { settled = true; settle(c, r); } };
            const copy = answerForm('Type the answer to continue', (value, box) => {
                if (isRight(value, c)) finish(false);
                else box.classList.add('wrong');
            });
            copy.input.addEventListener('input', () => copy.input.classList.remove('wrong'));
            copy.form.querySelector('button').textContent = 'Continue';
            feedback.appendChild(copy.form);
            if (typed !== null) {
                actions.appendChild(button('quiet', 'I was right', () => finish(true)));
            }
            onKey = null;
            copy.input.focus();
        }
    }


    // ─── The mode ────────────────────────────────────────

    K.modes.learn = {
        frontLabel: 'Questions in',
        describe,
        start(d) {
            deck = d;
            active = true;
            begin();
        },
        stop() {
            active = false;
            clearTimeout(timer);
            onKey = null;
        },
        // Switching language brings in that language's words.
        refront() { if (active) begin(); },
        key(e) { if (onKey && !e.isComposing) onKey(e); },
    };
})();
