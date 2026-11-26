// =====================================================================
// SuverComicDraw — utils.js
// Мелкие помощники: генератор случайностей, цвета
// =====================================================================

// --- Детерминированный генератор случайных чисел ---
// По одному и тому же seed всегда выдаёт одну и ту же последовательность.
// Благодаря этому переигранный штрих (undo/redo, ресайз) совпадает
// с живым пиксель в пиксель.
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// --- Цвет: '#rrggbb' + альфа -> строка 'rgba(...)' ---
function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

// --- Штамп спрея для экспорта SVG (strokeAirbrush) ---
// В живом рисовании аэрограф работает через буфер (tools.js),
// этот штамп остался для векторного сохранения.
function sprayStamp(g, x, y, r, color, a) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0,   hexToRgba(color, a));
    grad.addColorStop(0.5, hexToRgba(color, a * 0.5));
    grad.addColorStop(1,   hexToRgba(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
}
