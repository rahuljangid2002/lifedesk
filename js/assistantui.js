// Assistant screen: the money check-up (score, five areas, suggestions with Done) and questions answered by the rules
// in js/assistant.js. Same tool as Salesforce's Assistant tab. Also the Money health tile on Home.
import * as A from './assistant.js';

export const ASSIST_STATE = () => ({ area: null, showDone: false, group: 'Overall', chat: [], text: '' });

const DONE_KEY = 'lifedesk-assistant-done'; // suggestions marked done today, on this device
const TONE = { risk: 'Act now', warn: 'Important', action: 'To do', info: 'Good to know', good: 'Going well' };
const AREA_ICON = { Spending: 'cart', Saving: 'wallet', 'Debt & cards': 'card', Investments: 'chart', 'Bills & people': 'users' };
const LINKS = { budget: 'Open Budget', daily: 'See daily expenses', people: 'Open People & Loans', pay: 'Open Payments', renewals: 'Open Renewals', invest: 'Open Investments', add: 'Open Add Entry' };

/** The Assistant screen, its actions and the Home tile. c: helpers from app.js. */
export function assistantTool(c) {
    const { S, L, icon, esc } = c;
    const st = () => c.state.assistant;
    const ctx = () => ({ yearOf: c.yearOf, netWorth: c.netWorth });
    const check = () => A.checkup(S.data, c.today(), ctx());

    function doneKeys() {
        try {
            const d = JSON.parse(localStorage.getItem(DONE_KEY) || 'null');
            return d && d.day === c.today() ? d.keys : [];
        } catch (e) {
            return [];
        }
    }
    function setDone(keys) {
        try {
            localStorage.setItem(DONE_KEY, JSON.stringify({ day: c.today(), keys }));
        } catch (e) {
            // remembered for this visit only
        }
    }

    const ringTone = (s) => (s >= 80 ? 'good' : s >= 60 ? 'ok' : 'low');
    const ring = (score, sub, big) => `<span class="as-ring as-${ringTone(score)} ${big ? 'big' : ''}" style="--p:${score}"><b>${score}</b><small>${esc(sub)}</small></span>`;

    function tipCard(t, done, rank) {
        return `<div class="as-tip as-${t.tone} ${done ? 'done' : ''}">
            ${rank ? `<span class="as-rank">${rank}</span>` : `<span class="as-tip-ic">${icon(AREA_ICON[t.area] || 'chart')}</span>`}
            <div class="as-tip-body">
                <small class="as-tag">${esc(t.area)} · ${TONE[t.tone]}</small>
                <b>${esc(t.title)}</b>
                <span>${esc(t.detail)}</span>
                <span class="split wrap">
                    ${t.link ? `<button class="link-btn" data-action="asOpen" data-link="${t.link}" data-tab="${esc(t.tab || '')}">${LINKS[t.link] || 'Open'} ${icon('chevRight')}</button>` : ''}
                    ${t.tone !== 'good' ? `<button class="btn small" data-action="asDone" data-key="${esc(t.key)}">${done ? 'Undo' : '✓ Done'}</button>` : ''}
                </span>
            </div>
        </div>`;
    }

    function screen() {
        const s = st();
        const r = check();
        const done = new Set(doneKeys());
        const open = r.tips.filter((t) => t.tone !== 'good' && !done.has(t.key));
        const top = open.slice(0, 3);
        const topKeys = new Set(s.area ? [] : top.map((t) => t.key)); // the Top 3 are not listed twice
        const list = r.tips.filter((t) => (!s.area || t.area === s.area) && !topKeys.has(t.key) && (s.showDone || !done.has(t.key)));
        const areas = r.areas.map((a) => `<button class="as-area ${s.area === a.name ? 'on' : ''}" data-action="asArea" data-area="${esc(a.name)}" aria-pressed="${s.area === a.name}">
                <span class="as-area-top">${icon(AREA_ICON[a.name])}<b>${a.score}</b></span>
                <span class="as-area-name">${esc(a.name)}</span>
                <span class="as-bar"><i class="as-${ringTone(a.score)}" style="width:${a.score}%"></i></span>
                <small>${esc(a.status)} · ${a.open ? `${a.open} to look at` : 'nothing open'}</small>
            </button>`).join('');
        const groups = Object.keys(A.QUESTIONS);
        return `<header class="hero">
            ${c.backLink('home')}
            <small class="eyebrow">Assistant</small><h1>Money check-up</h1>
            <p class="hero-sub">${esc(r.headline)}</p>
        </header>
        <main class="assist">
            <section class="card as-hero">
                ${ring(r.score, 'money health', true)}
                <div class="as-hero-text"><b>${esc(r.scoreLabel)}</b><small>Worked out from your own entries by fixed rules, here in your browser. Nothing is sent anywhere. General guidance, not financial advice.</small>
                    <div class="as-stats">${r.stats.map((x) => `<span><small>${esc(x.label)}</small><b>${L.money(x.value)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>`).join('')}</div></div>
            </section>
            <div class="as-areas">${areas}</div>
            <div class="as-cols">
                <div class="as-main">
                    ${top.length && !s.area ? `<h3>Top ${top.length} for today</h3><div class="as-tips">${top.map((t, i) => tipCard(t, false, i + 1)).join('')}</div>` : ''}
                    <div class="as-list-head"><h3>${s.area ? esc(s.area) : top.length ? 'More suggestions' : 'All suggestions'}</h3>
                        <span class="split">${s.area ? '<button class="link-btn" data-action="asArea" data-area="">Show all areas</button>' : ''}${done.size ? `<button class="link-btn" data-action="asShowDone">${s.showDone ? 'Hide done' : `Show done (${done.size})`}</button>` : ''}</span></div>
                    ${list.length ? `<div class="as-tips">${list.map((t) => tipCard(t, done.has(t.key))).join('')}</div>` : '<p class="empty">Nothing here: this area is in good shape.</p>'}
                    <section class="card as-short"><h3>In short</h3><ul>${r.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
                </div>
                <aside class="card as-chat">
                    <div class="card-head"><span><b>Ask me anything</b><small>About your spending, savings, loans, investments and bills</small></span>${s.chat.length ? '<button class="link-btn" data-action="asClear">Clear</button>' : ''}</div>
                    <div class="as-log">${s.chat.length ? s.chat.map((m) => `<div class="as-msg me">${esc(m.question)}</div><div class="as-msg bot">${m.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${m.tips.map((t) => `<div class="as-mini as-${t.tone}"><b>${esc(t.title)}</b><span>${esc(t.detail)}</span>${t.link ? `<button class="link-btn" data-action="asOpen" data-link="${t.link}" data-tab="${esc(t.tab || '')}">${LINKS[t.link] || 'Open'} ${icon('chevRight')}</button>` : ''}</div>`).join('')}</div>`).join('') : '<p class="empty">Tap a question below, or type your own.</p>'}</div>
                    <div class="seg as-groups">${groups.map((g) => `<button class="${s.group === g ? 'on' : ''}" data-action="asGroup" data-group="${esc(g)}">${esc(g)}</button>`).join('')}</div>
                    <div class="pills">${A.QUESTIONS[s.group].map((q) => `<button class="pill-btn" data-action="asAsk" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
                    <div class="split" data-form="asSend"><input type="text" placeholder="Type a question…" value="${esc(s.text)}" data-model="assistant.text" aria-label="Your question"><button class="btn primary" data-action="asSend">Ask</button></div>
                </aside>
            </div>
        </main>`;
    }

    /** Home: the score ring, the label, the most important suggestion and the five areas. */
    function homeCard() {
        const r = check();
        const done = new Set(doneKeys());
        const top = r.tips.find((t) => t.tone !== 'good' && !done.has(t.key));
        const open = r.tips.filter((t) => t.tone !== 'good').length;
        const short = { 'Debt & cards': 'Debt', 'Bills & people': 'Bills', Investments: 'Invest' };
        return `<a class="card link span as-home" href="#assistant">
            <div class="card-head"><h2>Money health</h2><span class="pill">${open ? `${open} to look at` : 'All good'}</span></div>
            <div class="as-home-body">${ring(r.score, 'of 100')}
                <div class="as-home-side"><b>${esc(r.scoreLabel)}</b>${top ? `<small>Top: ${esc(top.title)}</small>` : ''}
                    <div class="as-home-areas">${r.areas.map((a) => `<span class="as-ha"><small>${esc(short[a.name] || a.name)}</small><span class="as-bar"><i class="as-${ringTone(a.score)}" style="width:${a.score}%"></i></span><b>${a.score}</b></span>`).join('')}</div></div></div>
            <small class="as-go">See every suggestion ${icon('chevRight')}</small>
        </a>`;
    }

    /** Home, At a glance: the score ring, the label and the most important suggestion. */
    function mini() {
        const r = check();
        const done = new Set(doneKeys());
        const top = r.tips.find((t) => t.tone !== 'good' && !done.has(t.key));
        return `<a class="hc as-home" href="#assistant">${ring(r.score, 'of 100')}<small>Money health</small><b>${esc(r.scoreLabel)}</b>${top ? `<small>Top: ${esc(top.title)}</small>` : '<small>Nothing to look at</small>'}</a>`;
    }

    function askNow(q) {
        const question = String(q || '').trim();
        if (!question) {
            return;
        }
        st().chat.push(A.ask(question, S.data, c.today(), ctx()));
        st().text = '';
        c.render();
        const log = document.querySelector('.as-log');
        if (log) {
            log.scrollTop = log.scrollHeight;
        }
    }

    const actions = {
        asArea(el) {
            st().area = el.dataset.area && st().area !== el.dataset.area ? el.dataset.area : null;
            c.render();
        },
        asShowDone() {
            st().showDone = !st().showDone;
            c.render();
        },
        asDone(el) {
            const keys = new Set(doneKeys());
            const k = el.dataset.key;
            keys.has(k) ? keys.delete(k) : keys.add(k);
            setDone([...keys]);
            c.render();
        },
        asOpen(el) {
            if (el.dataset.link === 'invest' && el.dataset.tab) {
                c.state.invest.tab = el.dataset.tab;
            }
            c.go(el.dataset.link);
        },
        asGroup(el) {
            st().group = el.dataset.group;
            c.render();
        },
        asAsk(el) {
            askNow(el.dataset.q);
        },
        asSend() {
            askNow(st().text);
        },
        asClear() {
            st().chat = [];
            c.render();
        }
    };

    return { screen, homeCard, mini, actions };
}
