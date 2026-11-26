// =====================================================================
// SuverComicDraw — autosave.js
// Автосейв projektu в СВОЁМ формате .suver:
//  - тихий черновик в localStorage (пережил перезагрузку вкладки)
//  - восстановление черновика при старте
//  - индикатор в футере: ● изменено / ✓ сохранено
// Расширение .suver введено чтобы отличать СВОЙ формат (JSON + мета)
// от чужого .json. Внутри — обычный JSON.
// =====================================================================

const AUTOSAVE_KEY = 'suvercomicdraw.autosave.v1';
const AUTOSAVE_DELAY = 1500; // мс после последнего изменения

let autosaveTimer = null;
let autosaveRestoredAtStart = false;

function collectProjectData() {
    for (const L of layers) {
        for (const s of (L.strokes || [])) {
            if ((s.tool === 'raster' || s.tool === 'image') && s.image && !s.imageData) {
                try { s.imageData = s.image.toDataURL('image/png'); } catch (e) {}
            }
            if (s.tool === 'baked' && s.image && !s.imageData) {
                try { s.imageData = s.image.toDataURL('image/png'); } catch (e) {}
            }
        }
    }
    return {
        app: 'SuverComicDraw',
        format: 'suver',
        ext: '.suver',
        version: 1,
        savedAt: new Date().toISOString(),
        hasBackground: (typeof hasBackground !== 'undefined') ? hasBackground : false,
        bgColor: (typeof bgColorInput !== 'undefined' && bgColorInput) ? bgColorInput.value : '#ffffff',
        bgMode: (typeof bgMode !== 'undefined') ? bgMode : 'plain',
        activeLayerId: (typeof activeLayerId !== 'undefined') ? activeLayerId : null,
        nextLayerId: (typeof nextLayerId !== 'undefined') ? nextLayerId : null,
        currentFileName: (typeof currentFileName !== 'undefined') ? currentFileName : 'Мой рисунок',
        layers: (typeof layers !== 'undefined') ? layers.map(function (L) {
            return {
                id: L.id, name: L.name, visible: L.visible,
                opacity: (L.opacity !== undefined ? L.opacity : 1),
                blendMode: L.blendMode || 'source-over',
                type: L.type || null,
                textItem: L.textItem || null,
                strokes: L.strokes || []
            };
        }) : []
    };
}

function applyProjectData(data) {
    if (!data || data.app !== 'SuverComicDraw') throw new Error('это не файл проекта SuverComicDraw');
    if (typeof layers === 'undefined') throw new Error('ядро ещё не загружено');
    layers.length = 0;
    for (const L of (data.layers || [])) {
        layers.push({
            id: L.id, name: L.name,
            visible: (L.visible !== false),
            opacity: (L.opacity !== undefined ? L.opacity : 1),
            blendMode: L.blendMode || 'source-over',
            type: L.type || ((L.strokes || []).length === 1 && L.strokes[0] && L.strokes[0].tool === 'text' ? 'text' : null),
            textItem: L.textItem || null,
            strokes: L.strokes || []
        });
    }
    if (typeof nextLayerId !== 'undefined' && data.nextLayerId) nextLayerId = data.nextLayerId;
    else if (typeof nextLayerId !== 'undefined') {
        let mx = 0;
        for (const L of layers) { const n = Number(L.id); if (isFinite(n) && n > mx) mx = n; }
        nextLayerId = mx + 1;
    }
    if (typeof activeLayerId !== 'undefined') {
        activeLayerId = data.activeLayerId;
        if (!layers.some(function (L) { return L.id === activeLayerId; }) && layers.length) {
            activeLayerId = layers[layers.length - 1].id;
        }
    }
    if (typeof hasBackground !== 'undefined') hasBackground = !!data.hasBackground;
    if (typeof bgColorInput !== 'undefined' && bgColorInput && data.bgColor) bgColorInput.value = data.bgColor;
    if (typeof bgMode !== 'undefined' && data.bgMode) bgMode = data.bgMode;
    if (typeof currentFileName !== 'undefined' && data.currentFileName) {
        currentFileName = data.currentFileName;
        if (typeof updateFooter === 'function') updateFooter();
    }
    if (typeof history !== 'undefined') history.length = 0;
    if (typeof redoStack !== 'undefined') redoStack.length = 0;
    if (typeof selection !== 'undefined') selection = null;
    if (typeof layerCaches !== 'undefined') for (const k in layerCaches) delete layerCaches[k];

    // растры из base64 обратно в картинки
    let pending = 0;
    const done = function () {
        if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) {
            try { layersModule.renderLayersList(); } catch (e) {}
        } else if (typeof renderLayersUI === 'function') { try { renderLayersUI(); } catch (e) {} }
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    };
    for (const L of layers) {
        for (const s of (L.strokes || [])) {
            if ((s.tool === 'raster' || s.tool === 'image' || s.tool === 'baked') && s.imageData && !s.image) {
                pending++;
                const im = new Image();
                (function (st, img) {
                    img.onload = function () { st.image = img; if (--pending === 0) done(); };
                    img.onerror = function () { if (--pending === 0) done(); };
                })(s, im);
                im.src = s.imageData;
            }
        }
    }
    done();
    if (pending === 0) done();
}

// --- черновик в localStorage (тихо, без скачивания) ---
function writeAutosaveDraft() {
    try {
        const data = collectProjectData();
        data.isDraft = true;
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
        if (typeof isProjectDirty !== 'undefined') isProjectDirty = false;
    } catch (e) {
        // localStorage переполнен (много растров) — молча пропускаем,
        // ручное сохранение в .suver всё равно работает
        if (typeof setSaveIndicator === 'function') setSaveIndicator(false, 'черновик не влез');
    }
}

function scheduleAutosave() {
    if (typeof setSaveIndicator === 'function') setSaveIndicator(false);
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeAutosaveDraft, AUTOSAVE_DELAY);
}
window.scheduleAutosave = scheduleAutosave;

// Восстановление черновика при старте. Спрашиваем только если черновик новее/не пуст.
function tryRestoreAutosave() {
    let raw = null;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || !Array.isArray(data.layers) || !data.layers.length) return false;
    const hasContent = data.layers.some(function (L) { return L.strokes && L.strokes.length; });
    if (!hasContent) return false;
    const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : '';
    if (!confirm('Найден несохранённый черновик' + (when ? ' от ' + when : '') + '. Восстановить?')) {
        return false;
    }
    try {
        applyProjectData(data);
        autosaveRestoredAtStart = true;
        if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
        return true;
    } catch (e) {
        console.warn('Автосейв битый:', e);
        return false;
    }
}

// --- ручное сохранение в СВОЙ формат .suver (скачивание файла рядом) ---
function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function saveSuverFile() {
    const data = collectProjectData();
    data.isDraft = false;
    const safe = String((typeof currentFileName !== 'undefined' && currentFileName) || 'drawing')
        .replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'drawing';
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), safe + '.suver');
    for (const L of layers) {
        for (const s of (L.strokes || [])) {
            if ((s.tool === 'raster' || s.tool === 'image' || s.tool === 'baked') && s.imageData && s.image) {
                // imageData оставляем — пригодится для черновика; не трём
            }
        }
    }
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data)); } catch (e) {}
    if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
    if (typeof isProjectDirty !== 'undefined') isProjectDirty = false;
    if (typeof updateFooter === 'function') updateFooter();
}
window.saveSuverFile = saveSuverFile;
window.applyProjectData = applyProjectData;

// --- открытие .suver / .suver.json / .json ---
function openSuverFile(file) {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = function () {
        try {
            const data = JSON.parse(rd.result);
            applyProjectData(data);
            if (typeof currentFileName !== 'undefined') {
                currentFileName = String(file.name).replace(/\.(suver|json)$/i, '');
                if (typeof updateFooter === 'function') updateFooter();
            }
            if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
            if (typeof isProjectDirty !== 'undefined') isProjectDirty = false;
        } catch (err) {
            alert('Не удалось открыть проект: ' + err.message);
        }
    };
    rd.readAsText(file);
}
window.openSuverFile = openSuverFile;
