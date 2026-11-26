// =====================================================================
// SuverComicDraw — footer.js
// Статус-бар: инструмент, цвет, размер холста, имя файла, фон, зум, часы
// =====================================================================

const ftTool       = document.getElementById('ftTool');
const ftZoom       = document.getElementById('ftZoom');
const ftClock      = document.getElementById('ftClock');
const ftCanvasSize = document.getElementById('ftCanvasSize');
const ftFileName   = document.getElementById('ftFileName');
const ftBgSelect   = document.getElementById('ftBgSelect');

const ftSave = document.createElement('span');
ftSave.id = 'ftSaveState';
ftSave.className = 'ft-muted';
ftSave.title = 'Состояние сохранения';
ftSave.textContent = '✓';
if (ftFileName && ftFileName.parentNode) ftFileName.after(ftSave);

// ● изменено / ✓ сохранено (без SVG — только проект/.suver и черновик)
function setSaveIndicator(saved, hint) {
    if (!ftSave) return;
    // не дёргаем DOM если состояние не менялось — иначе "моргает" от updateFooter/setInterval
    var sig = (saved ? '1' : '0') + '|' + (hint || '');
    if (ftSave._sig === sig) return;
    ftSave._sig = sig;
    ftSave.textContent = saved ? '✓' : '●';
    ftSave.style.color = saved ? '#1a9e4b' : '#d07a00';
    ftSave.title = saved ? 'Все изменения сохранены' : ('Есть несохранённые изменения' + (hint ? ' (' + hint + ')' : ''));
    if (ftFileName) ftFileName.title = ftSave.title;
}
window.setSaveIndicator = setSaveIndicator;

const ftSwatch = document.createElement('span');
ftSwatch.className = 'ft-swatch';
ftTool.after(ftSwatch);

const toolNames = {
    brush: 'Кисть', smudge: 'Смадж', eraser: 'Ластик',
    blur: 'Размытие', airbrush: 'Аэрограф', fill: 'Заливка'
};

let currentFileName = 'my drawing';
try { currentFileName = localStorage.getItem('suvercomicdraw.filename') || currentFileName; } catch (e) {}
function setFileName(n) {
    n = String(n || '').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'drawing';
    currentFileName = n;
    try { localStorage.setItem('suvercomicdraw.filename', n); } catch (e) {}
    updateFooter();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}
window.setFileName = setFileName;

function updateFooter() {
    try {
        ftTool.textContent = toolNames[tool] || tool;
        ftSwatch.style.background = colorInput.value;
        ftZoom.textContent = Math.round(view.zoom * 100) + '%';
        ftCanvasSize.textContent = W + '×' + H;
        ftFileName.textContent = currentFileName + (ftSave && ftSave.textContent === '●' ? ' ●' : '');
        ftFileName.title = 'Нажмите, чтобы переименовать';
        ftFileName.style.cursor = 'pointer';
        ftFileName.style.textDecoration = 'underline dotted';
    } catch (e) {}
}

// --- Режим фона ---
// bgMode берётся из config.js (let bgMode = 'plain';), здесь только запись

function setBackground(bgType) {
    bgMode = bgType;

    if (bgType === 'white' || bgType === 'grid' || bgType === 'lined') {
        hasBackground = true;
        bgColorInput.value = '#ffffff';
    }
    if (bgType === 'transparent') {
        hasBackground = false;
    }
    render();
}

ftBgSelect.addEventListener('change', function (e) {
    setBackground(e.target.value);
});

// --- Часы ---
function tickClock() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    ftClock.textContent = p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

tickClock();
setInterval(tickClock, 10000);
setInterval(updateFooter, 500);

// Клик по имени — переименование (имя идёт в .suver/.png/.jpg/.svg)
if (typeof ftFileName !== 'undefined' && ftFileName && !ftFileName._renameBound) {
    ftFileName._renameBound = true;
    ftFileName.addEventListener('click', function () {
        const n = prompt('Имя проекта:', currentFileName);
        if (n !== null) setFileName(n);
    });
}
