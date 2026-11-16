// The sliding selection. In a row of choices (the dock's tabs, a segmented switch, the side menu) the glass highlight
// glides from the old choice to the new one, stretching a little on the way like liquid glass.
// Screens are redrawn on every change, so each row's last highlight position is kept here and the highlight is
// animated from it to the new choice. Only transform changes, so the GPU draws it and nothing is laid out again.
// The highlight can also be dragged along the row with a finger or the mouse (see "Dragging the highlight" below).

const ROWS = [
    ['.dock-pill', ':scope > a'],
    ['.seg', ':scope > button'],
    ['.side nav', 'a']
];
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const places = new Map();
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True when the row, or what holds it, scrolls sideways: there a sideways drag must keep scrolling. */
function slidesSideways(row) {
    for (let el = row, n = 0; el && n < 4; el = el.parentElement, n++) {
        if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) {
            return true;
        }
    }
    return false;
}

function glideAll() {
    for (const [box, items] of ROWS) {
        document.querySelectorAll(box).forEach((row) => {
            if (drag && drag.moving && drag.row === row) {
                return; // the finger is moving it
            }
            const choices = [...row.querySelectorAll(items)];
            const on = choices.find((c) => c.classList.contains('on'));
            let mark = row.querySelector(':scope > .glide');
            if (!on || !on.offsetWidth) {
                if (mark) {
                    mark.remove();
                }
                return;
            }
            if (!mark) {
                mark = document.createElement('i');
                mark.className = 'glide';
                mark.setAttribute('aria-hidden', 'true');
                row.prepend(mark);
            }
            row.classList.add('has-glide');
            if (row.matches(DRAG_ROWS)) {
                row.style.touchAction = slidesSideways(row) ? '' : 'pan-y'; // sideways drags move the highlight
            }
            const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
            // a row is known by its choices, so the same switch is matched again after a redraw
            const key = `${box}|${choices.map((c) => c.textContent.trim()).join('|')}`;
            const from = places.get(key);
            places.set(key, to);
            mark.style.width = `${to.w}px`;
            mark.style.height = `${to.h}px`;
            mark.style.transform = `translate(${to.x}px, ${to.y}px)`;
            if (!from || (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h) || still() || !mark.animate) {
                return;
            }
            const sideways = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
            const midW = (from.w + to.w) / 2 + (sideways ? Math.min(28, Math.abs(to.x - from.x) * 0.25) : 0);
            const midH = (from.h + to.h) / 2 * (sideways ? 0.9 : 1.04);
            const midX = (from.x + to.x) / 2 - (midW - (from.w + to.w) / 2) / 2;
            const midY = (from.y + to.y) / 2 + ((from.h + to.h) / 2 - midH) / 2;
            mark.animate([
                { transform: `translate(${from.x}px, ${from.y}px) scale(${from.w / to.w}, ${from.h / to.h})` },
                { transform: `translate(${midX}px, ${midY}px) scale(${midW / to.w}, ${midH / to.h})`, offset: 0.45 },
                { transform: `translate(${to.x}px, ${to.y}px)` }
            ], { duration: 440, easing: EASE });
        });
    }
}

// Dragging the highlight: press anywhere on the dock or a segmented switch and slide. The highlight lifts and follows
// the finger, taking the width of the choice underneath; on release it settles on the nearest choice and chooses it.
// A tap that does not move stays an ordinary tap.
const DRAG_ROWS = '.dock-pill, .seg';
const DRAG_START = 6; // px of sideways movement before a press becomes a drag
let drag = null;

function choiceAt(choices, x) {
    let best = null;
    let bestD = Infinity;
    for (const c of choices) {
        const mid = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(mid - x);
        if (d < bestD) {
            bestD = d;
            best = c;
        }
    }
    return best;
}

function onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') {
        return;
    }
    const row = e.target.closest(DRAG_ROWS);
    const mark = row && row.querySelector(':scope > .glide');
    if (!row || !mark || slidesSideways(row)) {
        return;
    }
    const [, items] = ROWS.find(([box]) => row.matches(box));
    const choices = [...row.querySelectorAll(items)];
    const on = choices.find((c) => c.classList.contains('on'));
    if (!on) {
        return;
    }
    const box = row.getBoundingClientRect();
    drag = { row, mark, items, choices, startX: e.clientX, left: box.left, id: e.pointerId, moving: false,
        x: on.offsetLeft, w: on.offsetWidth, y: on.offsetTop, h: on.offsetHeight, baseW: on.offsetWidth };
}

function onMove(e) {
    if (!drag || e.pointerId !== drag.id) {
        return;
    }
    const dx = e.clientX - drag.startX;
    if (!drag.moving) {
        if (Math.abs(dx) < DRAG_START) {
            return;
        }
        drag.moving = true;
        try {
            drag.row.setPointerCapture(drag.id);
        } catch (err) {
            // the pointer may already be gone
        }
        drag.mark.getAnimations().forEach((a) => a.cancel());
        drag.mark.classList.add('held');
        drag.row.classList.add('dragging');
    }
    e.preventDefault();
    const finger = e.clientX - drag.left;
    const under = choiceAt(drag.choices, finger) || drag.choices[0];
    const first = drag.choices[0];
    const last = drag.choices[drag.choices.length - 1];
    // the highlight takes the width of the choice under the finger and stays inside the row
    const w = under.offsetWidth;
    const x = Math.max(first.offsetLeft - 4, Math.min(last.offsetLeft + last.offsetWidth - w + 4, finger - w / 2));
    drag.x = x;
    drag.w = w;
    drag.y = under.offsetTop;
    drag.h = under.offsetHeight;
    drag.under = under;
    drag.mark.style.transform = `translate(${x}px, ${drag.y}px) scale(${w / drag.baseW}, ${drag.h / parseFloat(drag.mark.style.height || drag.h)})`;
    drag.choices.forEach((c) => c.classList.toggle('glide-over', c === under));
}

function onUp(e) {
    if (!drag || e.pointerId !== drag.id) {
        return;
    }
    const d = drag;
    drag = null;
    if (!d.moving) {
        return; // a plain tap: the choice's own click does the work
    }
    d.mark.classList.remove('held');
    d.row.classList.remove('dragging');
    d.choices.forEach((c) => c.classList.remove('glide-over'));
    const target = d.under || choiceAt(d.choices, d.x + d.w / 2);
    // the highlight continues from where the finger left it
    const key = `${ROWS.find(([box]) => d.row.matches(box))[0]}|${d.choices.map((c) => c.textContent.trim()).join('|')}`;
    places.set(key, { x: d.x, y: d.y, w: d.w, h: d.h, dragged: true });
    // the click that follows the release is not a choice of its own
    const swallow = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };
    window.addEventListener('click', swallow, true);
    window.setTimeout(() => {
        window.removeEventListener('click', swallow, true);
        if (target && !target.classList.contains('on')) {
            target.click();
        } else {
            places.delete(key);
            const to = { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
            places.set(key, to);
            d.mark.style.transform = `translate(${to.x}px, ${to.y}px)`;
            if (d.mark.animate && !still()) {
                d.mark.animate([
                    { transform: `translate(${d.x}px, ${d.y}px) scale(${d.w / to.w}, 1)` },
                    { transform: `translate(${to.x}px, ${to.y}px)` }
                ], { duration: 360, easing: EASE });
            }
        }
    }, 0);
}

/** Starts watching the page: any redraw or change of the chosen item moves the highlight. */
let started = false;
export function startGlide(root = document.body) {
    if (started) {
        return;
    }
    started = true;
    let queued = false;
    const run = () => {
        queued = false;
        glideAll();
    };
    new MutationObserver(() => {
        if (!queued) {
            queued = true;
            window.requestAnimationFrame(run);
        }
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => window.requestAnimationFrame(glideAll));
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    window.requestAnimationFrame(glideAll);
}
