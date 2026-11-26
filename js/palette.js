// =====================================================================
// SuverComicDraw — palette.js
// HSV-палитра: квадрат S/V, полоса тона, «Последние» цвета
// =====================================================================

const svBox = document.getElementById('svBox');
const hueBar = document.getElementById('hueBar');
const palCurrent = document.getElementById('palCurrent');
const recentsRow = document.getElementById('recentsRow');

const svg = svBox.getContext('2d');
const hueg = hueBar.getContext('2d');

// --- Преобразования цвета ---
function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function rgbToHex(rgb) {
    const p = function (n) { return n.toString(16).padStart(2, '0'); };
    return '#' + p(rgb.r) + p(rgb.g) + p(rgb.b);
}

function hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d > 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
}

// --- Состояние палитры ---
let palH = 0, palS = 0, palV = 0;

// --- Полоса тона ---
function drawHue() {
    const grad = hueg.createLinearGradient(0, 0, 0, hueBar.height);
    for (let i = 0; i <= 6; i++) {
        const rgb = hsvToRgb(i * 60, 1, 1);
        grad.addColorStop(i / 6, rgbToHex(rgb));
    }
    hueg.fillStyle = grad;
    hueg.fillRect(0, 0, hueBar.width, hueBar.height);

    // маркер текущего тона
    const y = (palH / 360) * hueBar.height;
    hueg.fillStyle = '#fff';
    hueg.fillRect(0, y - 2, hueBar.width, 1);
    hueg.fillRect(0, y + 2, hueBar.width, 1);
    hueg.strokeStyle = '#000';
    hueg.strokeRect(0.5, y - 2.5, hueBar.width - 1, 5);
}

// --- Квадрат насыщенность/яркость ---
function drawSV() {
    // базовый тон
    svg.fillStyle = rgbToHex(hsvToRgb(palH, 1, 1));
    svg.fillRect(0, 0, svBox.width, svBox.height);

    // насыщенность слева направо: белая -> прозрачная
    let grad = svg.createLinearGradient(0, 0, svBox.width, 0);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    svg.fillStyle = grad;
    svg.fillRect(0, 0, svBox.width, svBox.height);

    // яркость сверху вниз: прозрачная -> чёрная
    grad = svg.createLinearGradient(0, 0, 0, svBox.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    svg.fillStyle = grad;
    svg.fillRect(0, 0, svBox.width, svBox.height);

    // маркер текущей точки
    const x = palS * svBox.width;
    const y = (1 - palV) * svBox.height;
    svg.beginPath();
    svg.arc(x, y, 5, 0, Math.PI * 2);
    svg.strokeStyle = palV > 0.5 ? '#000' : '#fff';
    svg.lineWidth = 1.5;
    svg.stroke();
}

// --- Синхронизация с остальным интерфейсом ---
function applyPal() {
    const rgb = hsvToRgb(palH, palS, palV);
    const hex = rgbToHex(rgb);
    colorInput.value = hex;
    palCurrent.style.background = hex;
    drawSV();
    drawHue();
    if (typeof updateFooter === 'function') updateFooter();
}

function setFromHex(hex) {
    const hsv = hexToHsv(hex);
    palH = hsv.h; palS = hsv.s; palV = hsv.v;
    applyPal();
}

// --- Клик/перетаскивание по квадрату ---
function svPick(e) {
    const r = svBox.getBoundingClientRect();
    palS = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    palV = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    applyPal();
}
function huePick(e) {
    const r = hueBar.getBoundingClientRect();
    palH = Math.min(359.9, Math.max(0, (e.clientY - r.top) / r.height * 360));
    applyPal();
}

function bindPicker(cv, fn) {
    let down = false;
    cv.addEventListener('pointerdown', function (e) {
        down = true;
        cv.setPointerCapture(e.pointerId);
        fn(e);
    });
    cv.addEventListener('pointermove', function (e) { if (down) fn(e); });
    cv.addEventListener('pointerup', function () { down = false; });
}
bindPicker(svBox, svPick);
bindPicker(hueBar, huePick);

// --- «Последние» цвета ---
const RECENT_KEY = 'suverdraw_recents';
let recents = [];
try { recents = JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (err) { recents = []; }

function renderRecents() {
    recentsRow.innerHTML = '';
    for (const hex of recents) {
        const sw = document.createElement('div');
        sw.className = 'pal-recent';
        sw.style.background = hex;
        sw.title = hex;
        sw.addEventListener('click', function () { setFromHex(hex); });
        recentsRow.appendChild(sw);
    }
}

function pushRecent(hex) {
    recents = recents.filter(function (h) { return h !== hex; });
    recents.unshift(hex);
    if (recents.length > 16) recents.length = 16;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); } catch (err) {}
    renderRecents();
}

// Смена цвета штатным input[type=color] — палитра следует за ним
colorInput.addEventListener('input', function () { setFromHex(colorInput.value); });

// --- Старт ---
setFromHex(colorInput.value);
renderRecents();
