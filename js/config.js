// =====================================================================
// SuverComicDraw — config.js
// Элементы интерфейса, глобальное состояние, координаты, инструменты
// =====================================================================

// --- Холст и элементы меню ---
const c = document.getElementById('c');
const ctx = c.getContext('2d');

const fileMenu   = document.getElementById('fileMenu');
const fileMenuBtn = document.getElementById('fileMenuBtn');

const overlay = document.createElement('canvas');
const octx = overlay.getContext('2d');

let W = 0, H = 0;

// --- Элементы тулбара ---
const colorInput     = document.getElementById('color');
const bgColorInput   = document.getElementById('bg-color');
const thicknessInput = document.getElementById('thickness');
const opacityInput   = document.getElementById('opacity');
const thicknessVal   = document.getElementById('thickness-val');
const opacityVal     = document.getElementById('opacity-val');
const zoomBtn        = document.getElementById('zoom-btn');
const undoBtn        = document.getElementById('undo');
const redoBtn        = document.getElementById('redo');
const clearBtn       = document.getElementById('clear');
const addLayerBtn    = document.getElementById('add-layer');
const layersList     = document.getElementById('layers-list');
const pressureBtn    = document.getElementById('pressure-btn');
const pressInput     = document.getElementById('pressInput');

// клик по холсту и повторный клик по кнопке закрывают меню
c.addEventListener('pointerdown', function () {
    if (fileMenu) fileMenu.classList.remove('open');
});
document.addEventListener('click', function (e) {
    if (fileMenu && !fileMenu.contains(e.target)) fileMenu.classList.remove('open');
});
// Ловим событие создания копии слоя
document.getElementById('duplicate-btn').addEventListener('click', function() {
    const idx = layers.findIndex(l => l && l.id === activeLayerId);
    if (idx !== -1) {
        layersModule.duplicateLayer(idx);
    }
});

// Ловим событие объединения всех слоёв
document.getElementById('group-all-btn').addEventListener('click', function() {
    layersModule.groupAllLayers();
});

// --- Элементы оверлея сохранения ---
const saveOverlay   = document.getElementById('save-overlay');
const savedImg      = document.getElementById('saved-img');
const downloadLink  = document.getElementById('download-link');


// --- Глобальное состояние ---
let tool = 'brush';
let toolSizes = { brush: 2, line: 2, rect: 2, ellipse: 2, soft: 2, smudge: 45, eraser: 20, blur: 35, airbrush: 5, fill: 20, chalk: 8, flat: 12, select: 2, panel: 3 };
let isDrawing = false;
let isPanning = false;
let spaceDown = false;
let panStart  = null;
let mypaintState = null;
let bgMode = 'plain';

let toolPress = { brush: 1, line: 1, rect: 1, ellipse: 1, soft: 1, flat: 1, marker: 1, airbrush: 1, mypaint: 1,
                  eraser: 1, smudge: 1, blur: 1, fill: 1, select: 1, panel: 1 };

pressInput.addEventListener('input', function () {
    toolPress[tool] = Number(pressInput.value);
    pressVal.textContent = Number(pressInput.value).toFixed(1);
});

let current = null;
let smudgeState = null;
let airbrushState = null;

let hasBackground = false;
let usePressure = true;

// --- Слои ---
let nextLayerId = 2;
let activeLayerId = 1;
let layers = [{ id: 1, name: 'Слой 1', visible: true, strokes: [] }];

const layerCaches = {};

// --- TEXT ---
let currentFontSize = 36; // Размер шрифта по умолчанию
let currentFontFamily = '"Segoe UI", sans-serif'; // Семейство шрифта

// --- История ---
let history   = [];
let redoStack = [];

const TOL = 32;

// --- МИР И ВИД ---
let view = { x: 0, y: 0, zoom: 1 };

function screenToWorld(p) {
    return { x: p.x / view.zoom + view.x, y: p.y / view.zoom + view.y };
}

function applyViewTransform(g) {
    g.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom);
}

function getLayer(id) {
    for (const l of layers) if (l.id === id) return l;
    return null;
}

// --- Кнопки инструментов ---
const toolBtns = {
    brush:    document.getElementById('tool-brush'),
    soft:     document.getElementById('tool-soft'),
    flat:     document.getElementById('tool-flat'),
    smudge:   document.getElementById('tool-smudge'),
    eraser:   document.getElementById('tool-eraser'),
    blur:     document.getElementById('tool-blur'),
    airbrush: document.getElementById('tool-airbrush'),
    fill:     document.getElementById('tool-fill'),
    select:   document.getElementById('tool-select'),
    panel:    document.getElementById('tool-panel'),
    chalk:    document.getElementById('tool-chalk'),    
    line:     document.getElementById('tool-line'),
    rect:     document.getElementById('tool-rect'),
    ellipse:  document.getElementById('tool-ellipse'),
    text:     document.getElementById('tool-text')
};

function setTool(name) {
    if (tool === name) return;

    toolSizes[tool] = Number(thicknessInput.value);
    tool = name;

    pressInput.value = toolPress[name] !== undefined ? toolPress[name] : 1;
    pressVal.textContent = Number(pressInput.value).toFixed(1);

    const s = toolSizes[name];
    thicknessInput.value = s;
    thicknessVal.textContent = s;

    for (const key in toolBtns) toolBtns[key].classList.toggle('active', key === name);
    if (typeof updateFooter === 'function') updateFooter();
    if (textOptionsDiv) {
        textOptionsDiv.style.display = (name === 'text') ? 'flex' : 'none';
    }
}

// --- Кнопка нажима пера ---
pressureBtn.addEventListener('click', function () {
    usePressure = !usePressure;
    pressureBtn.classList.toggle('active', usePressure);
});

// --- Координаты: экран -> пиксели буфера ---
function getScreenPos(e) {
    const r = c.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * (c.width / r.width),
        y: (e.clientY - r.top) * (c.height / r.height)
    };
}

// --- Ресайз ---
function resizeCanvas() {
    const main = document.getElementById('main');
    W = Math.max(1, main.clientWidth - 200);
    H = window.innerHeight - document.getElementById('controls').offsetHeight;
    c.width = W; c.height = H;
    overlay.width = W; overlay.height = H;
    for (const key in layerCaches) delete layerCaches[key];
    render();
}
window.addEventListener('resize', resizeCanvas);

// --- Зум ---
function setZoom(z) {
    view.zoom = Math.max(0.1, Math.min(8, z));
    zoomBtn.textContent = Math.round(view.zoom * 100) + '%';
}

zoomBtn.addEventListener('click', function () {
    setZoom(1);
    view.x = 0; view.y = 0;
    for (const key in layerCaches) delete layerCaches[key];
    render();
});

// --- Нажим ---
function getPressure(e, prev) {
    if (!usePressure) return 1;
    if (e.pointerType === 'pen') {
        const p = e.pressure;
        if (p !== undefined && p !== null && p > 0) return p;
        if (prev && prev.p !== undefined && prev.p > 0) return prev.p;
        return 0.1;
    }
    return 1;
}

// --- Синхронизация ползунков ---
function syncSliders() {
    thicknessVal.textContent = thicknessInput.value;
    opacityVal.textContent = Number(opacityInput.value).toFixed(1);
}
thicknessInput.addEventListener('input', syncSliders);
opacityInput.addEventListener('input', syncSliders);
syncSliders();

setTool('brush');

for (const key in toolBtns) {
    const btn = toolBtns[key];
    if (btn) btn.addEventListener('click', () => setTool(key));
}


// --- Сглаживание штриха (Smooth / Lazy Mouse для XP-Pen и мыши) ---
let smoothEnabled = true;
const smoothBtn = document.getElementById('smooth-btn');
if (smoothBtn) {
    smoothBtn.addEventListener('click', function() {
        smoothEnabled = !smoothEnabled;
        smoothBtn.classList.toggle('active', smoothEnabled);
    });
}

// --- Защита от случайной потери рисунка ---
let isProjectDirty = false;
window.addEventListener('beforeunload', function (e) {
    if (isProjectDirty && history.length > 0) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохранённые изменения в комиксе!';
        return e.returnValue;
    }
});

// --- Настройки текста (шрифт, размер, начертание) ---
let textFontFamily = "'Comic Relief', cursive, sans-serif";
let textFontSize = 28;
let textFontBold = true;
let textFontItalic = false;

const textOptionsDiv = document.getElementById('text-options');
const fontFamilyInput = document.getElementById('font-family');
const fontSizeInput = document.getElementById('font-size');
const fontBoldBtn = document.getElementById('font-bold-btn');
const fontItalicBtn = document.getElementById('font-italic-btn');

if (fontFamilyInput) {
    fontFamilyInput.addEventListener('change', (e) => textFontFamily = e.target.value);
}
if (fontSizeInput) {
    fontSizeInput.addEventListener('input', (e) => textFontSize = Math.max(8, parseInt(e.target.value) || 28));
}
if (fontBoldBtn) {
    fontBoldBtn.addEventListener('click', () => {
        textFontBold = !textFontBold;
        fontBoldBtn.classList.toggle('active', textFontBold);
    });
}
if (fontItalicBtn) {
    fontItalicBtn.addEventListener('click', () => {
        textFontItalic = !textFontItalic;
        fontItalicBtn.classList.toggle('active', textFontItalic);
    });
}


// --- Переключение тёмной/светлой темы ---
const themeToggleBtn = document.getElementById('theme-toggle-btn');
let isDarkTheme = false;

function makeIcon(dark) {
    if (dark) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="24px" width="24px" fill="currentColor"><path d="M11,5V1h2V5H11Zm6.65,2.75L16.28,6.38l2.8-2.88l1.4,1.43L17.65,7.75ZM19,13V11h4v2H19ZM11,23V19h2v4H11ZM6.35,7.7L3.5,4.93l1.43-1.4L7.75,6.35L6.35,7.7Zm12.7,12.8l-2.77-2.88l1.35-1.35l2.85,2.75L19.05,20.5ZM1,13V11H5v2H1Zm3.93,7.5l-1.4-1.43l2.8-2.8l0.73,0.68l0.72,0.7L4.93,20.5Zm2.82-4.25Q6,14.5 6,12T7.75,7.75T12,6t4.25,1.75T18,12t-1.75,4.25T12,18T7.75,16.25Zm7.08-1.43Q16,13.65 16,12T14.83,9.17T12,8T9.18,9.17T8,12t1.18,2.82T12,16t2.83-1.18ZM12,12Z"/></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="moon_sun" height="24px" width="24px" fill="currentColor"><path d="M12,21q-3.75,0-6.38-2.63T3,12T5.63,5.63T12,3q0.35,0 0.69,0.02q0.34,0.02 0.66,0.07q-1.03,0.73-1.64,1.89T11.1,7.5q0,2.25 1.57,3.82T16.5,12.9q1.38,0 2.53-0.61t1.88-1.64q0.05,0.33 0.07,0.66T21,12q0,3.75-2.63,6.38T12,21Zm0-2q2.2,0 3.95-1.21t2.55-3.16q-0.5,0.13-1,0.2t-1,0.08q-3.07,0-5.24-2.16Q9.1,10.58 9.1,7.5q0-0.5 0.08-1t0.2-1Q7.43,6.3 6.21,8.05T5,12q0,2.9 2.05,4.95T12,19Zm-0.25-6.75Z"/></svg>`;
}

function applyTheme(dark) {
    isDarkTheme = dark;
    document.body.classList.toggle('dark-theme', isDarkTheme);

    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = makeIcon(dark);          // было: textContent
        themeToggleBtn.title = isDarkTheme ? 'Светлая тема' : 'Тёмная тема';
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        applyTheme(!isDarkTheme);
    });

    themeToggleBtn.innerHTML = makeIcon(isDarkTheme);    // инициализация (было: эмодзи)
}
