// Small chart kit, drawn as HTML / SVG (no library). Rules it follows:
// thin bars (never thicker than 24px) with a rounded data-end and a square baseline; 2px lines; hairline solid
// gridlines; one colour for one series; a legend only when there are two or more series; text in ink colours,
// never in the series colour; every chart has a "Show as table" twin and a hover / focus tooltip.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Round axis steps: 0, 1,000, 2,000 ... never an awkward 1,137. */
function niceScale(max, steps = 4) {
    if (!(max > 0)) {
        return { top: 1, ticks: [0, 1] };
    }
    const raw = max / steps;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) {
        ticks.push(Math.round(v * 100) / 100);
    }
    return { top, ticks };
}

const tip = (label, rows) => `data-tip="${esc(label)}" data-tip-rows="${esc(JSON.stringify(rows))}" tabindex="0"`;

/** The same numbers as a table, behind "Show as table": the reading that never depends on colour or hover. */
export function tableTwin(columns, rows) {
    return `<details class="twin"><summary>Show as table</summary><div class="table-wrap"><table>
        <thead><tr>${columns.map((c, i) => `<th class="${i ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${i ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

/** Horizontal bars for named things (categories, accounts, people): one colour, value at the tip. */
export function hbars(items, fmt, empty = 'Nothing to show for this period.') {
    if (!items.length) {
        return `<p class="empty">${esc(empty)}</p>`;
    }
    const max = Math.max(...items.map((x) => x.value), 0) || 1;
    return `<div class="hbars">${items
        .map((x) => `<div class="hbar" ${tip(x.label, [{ name: x.note || 'Amount', value: fmt(x.value) }])}>
            <span class="hb-label">${esc(x.label)}</span>
            <span class="hb-track"><i style="width:${Math.max(0, (x.value / max) * 100)}%"></i></span>
            <span class="hb-value">${esc(fmt(x.value))}</span></div>`)
        .join('')}</div>${tableTwin(['Name', 'Amount'], items.map((x) => [x.label, fmt(x.value)]))}`;
}

/** A limit and how much of it is used, one row each. The state is written out, not left to colour. */
export function meters(items, fmt) {
    if (!items.length) {
        return '<p class="empty">No budget set for this month.</p>';
    }
    return `<div class="meters">${items
        .map((x) => {
            const pct = x.limit ? Math.round((x.value / x.limit) * 100) : 0;
            const state = x.value > x.limit ? 'over' : pct >= 90 ? 'near' : 'ok';
            const word = state === 'over' ? `Over by ${fmt(x.value - x.limit)}` : x.value === x.limit ? 'Fully used' : state === 'near' ? `Near the limit · ${fmt(x.limit - x.value)} left` : `${fmt(x.limit - x.value)} left`;
            return `<div class="meter m-${state}" ${tip(x.label, [{ name: 'Spent', value: fmt(x.value) }, { name: 'Budget', value: fmt(x.limit) }])}>
                <span class="m-label">${esc(x.label)}</span><span class="m-state">${state === 'ok' ? '' : state === 'over' ? '▲ ' : '● '}${esc(word)}</span>
                <span class="m-track"><i style="width:${Math.min(100, pct)}%"></i></span>
                <span class="m-value">${esc(fmt(x.value))} of ${esc(fmt(x.limit))} · ${pct}%</span></div>`;
        })
        .join('')}</div>${tableTwin(['Category', 'Spent', 'Budget', 'Used'], items.map((x) => [x.label, fmt(x.value), fmt(x.limit), `${x.limit ? Math.round((x.value / x.limit) * 100) : 0}%`]))}`;
}

function frame(width, height, top, tickFmt, m) {
    const plotH = height - m.top - m.bottom;
    const y = (v) => m.top + plotH - (v / top.top) * plotH;
    const grid = top.ticks.map((t) => `<line class="grid" x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${esc(tickFmt(t))}</text>`).join('');
    return { y, grid, plotH, base: `<line class="axis" x1="${m.left}" x2="${width - m.right}" y1="${y(0)}" y2="${y(0)}"/>` };
}

/** Columns over time. series: [{ name, slot: 1 | 2, values }]. Two or more series get a legend. */
export function columns(labels, series, fmt, tickFmt, width = 640, height = 240) {
    const m = { top: 12, right: 8, bottom: 26, left: 52 };
    const max = Math.max(0, ...series.flatMap((s) => s.values));
    if (!max) {
        return '<p class="empty">Nothing to show for this period.</p>';
    }
    const top = niceScale(max);
    const f = frame(width, height, top, tickFmt, m);
    const band = (width - m.left - m.right) / labels.length;
    const k = series.length;
    const barW = Math.max(2, Math.min(24, (band * 0.72 - (k - 1) * 2) / k));
    const groupW = barW * k + (k - 1) * 2;
    const every = Math.ceil(labels.length / Math.max(1, Math.floor((width - m.left - m.right) / 34)));
    let marks = '';
    labels.forEach((label, i) => {
        const x0 = m.left + band * i + (band - groupW) / 2;
        series.forEach((s, j) => {
            const v = s.values[i] || 0;
            if (v > 0) {
                const x = x0 + j * (barW + 2);
                const yTop = f.y(v);
                const r = Math.min(4, barW / 2, f.y(0) - yTop);
                marks += `<path class="bar s${s.slot}" d="M${x},${f.y(0)}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barW - r}Q${x + barW},${yTop} ${x + barW},${yTop + r}V${f.y(0)}Z"/>`;
            }
        });
        if (i % every === 0) {
            marks += `<text class="tick" x="${m.left + band * i + band / 2}" y="${height - 8}" text-anchor="middle">${esc(label.short || label)}</text>`;
        }
        // the whole band is the hover target, and the tooltip lists every series
        marks += `<rect class="hit" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${f.plotH}" ${tip(label.full || label, series.map((s) => ({ name: s.name, value: fmt(s.values[i] || 0), slot: s.slot })))}/>`;
    });
    const legend = k > 1 ? `<div class="legend">${series.map((s) => `<span><i class="sw s${s.slot}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `${legend}<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map((s) => s.name).join(' and '))} by ${labels.length} periods">${f.grid}${f.base}${marks}</svg>
        ${tableTwin(['Period', ...series.map((s) => s.name)], labels.map((l, i) => [l.full || l, ...series.map((s) => fmt(s.values[i] || 0))]))}`;
}

/** One line over time with a light wash under it; the last point is labelled. values may hold null (no data yet). */
export function line(labels, values, name, fmt, tickFmt, width = 640, height = 240) {
    const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && p.v !== undefined);
    if (pts.length < 2) {
        return '<p class="empty">Not enough months yet to draw a trend.</p>';
    }
    const m = { top: 16, right: 14, bottom: 26, left: 52 };
    const min = Math.min(0, ...pts.map((p) => p.v));
    const span = Math.max(...pts.map((p) => p.v)) - min;
    const top = niceScale(span);
    const plotH = height - m.top - m.bottom;
    const y = (v) => m.top + plotH - ((v - min) / top.top) * plotH;
    const step = (width - m.left - m.right) / (labels.length - 1);
    const x = (i) => m.left + step * i;
    const grid = top.ticks.map((t) => `<line class="grid" x1="${m.left}" x2="${width - m.right}" y1="${y(t + min)}" y2="${y(t + min)}"/><text class="tick" x="${m.left - 8}" y="${y(t + min) + 4}" text-anchor="end">${esc(tickFmt(t + min))}</text>`).join('');
    const path = pts.map((p, n) => `${n ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join('');
    const last = pts[pts.length - 1];
    const every = Math.ceil(labels.length / Math.max(1, Math.floor((width - m.left - m.right) / 44)));
    let marks = '';
    labels.forEach((label, i) => {
        if (i % every === 0) {
            marks += `<text class="tick" x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(label.short || label)}</text>`;
        }
        const p = pts.find((q) => q.i === i);
        if (p) {
            marks += `<g class="step"><line class="cross" x1="${x(i)}" x2="${x(i)}" y1="${m.top}" y2="${m.top + plotH}"/><circle class="dot hover" cx="${x(i)}" cy="${y(p.v)}" r="4"/>
                <rect class="hit" x="${x(i) - step / 2}" y="${m.top}" width="${step}" height="${plotH}" ${tip(label.full || label, [{ name, value: fmt(p.v), slot: 1 }])}/></g>`;
        }
    });
    const labelLeft = x(last.i) > width - 110;
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(name)} over ${pts.length} periods">${grid}
        <path class="area" d="${path}L${x(last.i)},${y(min)}L${x(pts[0].i)},${y(min)}Z"/><path class="line" d="${path}"/>
        <circle class="dot" cx="${x(last.i)}" cy="${y(last.v)}" r="4"/>
        <text class="end-label" x="${x(last.i) + (labelLeft ? -8 : 8)}" y="${y(last.v) - 9}" text-anchor="${labelLeft ? 'end' : 'start'}">${esc(fmt(last.v))}</text>${marks}</svg>
        ${tableTwin(['Period', name], labels.map((l, i) => [l.full || l, values[i] === null || values[i] === undefined ? '–' : fmt(values[i])]))}`;
}
