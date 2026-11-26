// =====================================================================
// SuverComicDraw — files.js
// Меню «Файл»: PNG, JPEG, SVG, проект (.json), импорт картинки
// =====================================================================

// --- Меню: открытие / закрытие ---
const fileMenuList = document.getElementById('fileMenuList');

const fmBtn = document.getElementById('fileMenuBtn');
if (fmBtn) {
    fmBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const fm = document.getElementById('fileMenu');
        if (fm) fm.classList.toggle('open');
    });
}

c.addEventListener('pointerdown', function () {
    const fm = document.getElementById('fileMenu');
    if (fm) fm.classList.remove('open');
});

document.addEventListener('click', function (e) {
    const fm = document.getElementById('fileMenu');
    if (fm && !fm.contains(e.target)) fm.classList.remove('open');
});

// --- Диспетчер пунктов ---
if (fileMenuList) {
    fileMenuList.addEventListener('click', function (e) {
        const act = e.target.dataset.act;
        if (!act) return;
        const fm = document.getElementById('fileMenu');
        if (fm) fm.classList.remove('open');

        if (act === 'save-png') {
            render();
            const data = c.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = data;
            a.download = exportName('png');
            a.click();
            if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
        }

        if (act === 'save-jpeg') saveJPEG();
        if (act === 'save-svg') saveSVG();
        if (act === 'save-project') saveProject();
        if (act === 'save-suver') saveSuverFile();
        if (act === 'save-suver-backup') saveSuverFile();

        if (act === 'open-project' || act === 'open-suver') {
            const pf = document.getElementById('projectFile');
            if (pf) pf.click();
        }

        if (act === 'open-image') {
            const im = document.getElementById('imageFile');
            if (im) im.click();
        }

        if (act === 'save-svg') {
            render();
            saveSVG();
}

    });
}

// =====================================================================
// Сохранения
// =====================================================================

function saveImage() {
    render();
    const data = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = 'drawing.png';
    a.click();
}

function saveJPEG() {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = hasBackground ? (bgColorInput && bgColorInput.value) : '#ffffff';
    g.fillRect(0, 0, W, H);
    for (const layer of layers) {
        if (layer.visible) g.drawImage(getLayerCanvas(layer), 0, 0);
    }
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/jpeg', 0.92);
    a.download = exportName('jpg');
    a.click();
    if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
}

function saveSVG() {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

    if (hasBackground) {
        svg += `<rect width="${W}" height="${H}" fill="${bgColorInput.value}" />`;
    }

    for (const L of layers) {
        if (!L.visible) continue;
        for (const s of L.strokes) {
            if (s.tool === 'raster') {
                const url = s.image.toDataURL('image/png');
                svg += `<image href="${url}" width="${W}" height="${H}" />`;
                continue;
            }

            const pts = s.points;
            if (pts.length < 2) continue;

            const coords = pts.map(p => `${p.x},${p.y}`).join(' ');
            const color = s.color || '#000000';
            const size = s.size || 2;
            const op = (s.alpha !== undefined && s.alpha >= 0) ? s.alpha : 1;

            svg += `<polyline points="${coords}" stroke="${color}" fill="none" stroke-width="${size}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}" />`;
        }
    }

    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportName('svg');
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof setSaveIndicator === 'function') setSaveIndicator(true);
}


function saveProject() {
    for (const L of layers) {
        for (const s of L.strokes) {
            if (s.tool === 'raster' && !s.imageData) {
                try {
                    s.imageData = s.image.toDataURL('image/png');
                } catch (e) {
                    alert('Нельзя сохранить: растровое изображение нарушает безопасность (CORS). Сохраните как PNG сначала.');
                    return;
                }
            }
        }
    }

    const data = {
        app: 'SuverComicDraw',
        version: 1,
        layers: layers.map(L => ({
            id: L.id,
            name: L.name,
            visible: L.visible,
            strokes: L.strokes
        })),
        hasBackground: hasBackground,
        bgColor: (bgColorInput && bgColorInput.value) || '#ffffff',
        bgMode: (typeof bgMode !== 'undefined' ? bgMode : 'plain')
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportName('suver.json');
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof setSaveIndicator === 'function') setSaveIndicator(true);

    // Очистка временных полей (чтобы не раздувать следующие сохранения)
    for (const L of layers) {
        for (const s of L.strokes) {
            if (s.tool === 'raster' && s.imageData) delete s.imageData;
        }
    }
}


document.getElementById('projectFile').addEventListener('change', function () {
    const f = this.files[0];
    this.value = '';
    if (!f) return;
    if (/\.suver(\.json)?$/i.test(f.name) && typeof openSuverFile === 'function') {
        openSuverFile(f);
        return;
    }
    const rd = new FileReader();
    rd.onload = function () {
        try {
            const data = JSON.parse(rd.result);
            if (data.app !== 'SuverComicDraw') throw new Error('это не файл проекта SuverComicDraw');

            layers.length = 0;
            for (const L of data.layers) {
                layers.push({
                    id: L.id,
                    name: L.name,
                    visible: L.visible,
                    strokes: L.strokes || []
                });
            }
            hasBackground = data.hasBackground;
            bgColorInput.value = (data.bgColor || '#ffffff');
            bgMode = data.bgMode || 'plain';

            history.length = 0;
            redoStack.length = 0;
            selection = null;
            for (const k in layerCaches) delete layerCaches[k];

            let pending = 0;
            for (const L of layers) {
                for (const s of L.strokes) {
                    if (s.tool === 'raster' && s.imageData) {
                        pending++;
                        const im = new Image();
                        im.onload = function () {
                            s.image = im;
                            if (--pending === 0) render();
                        };
                        im.src = s.imageData;
                    }
                }
            }

            if (typeof renderLayersUI === 'function') renderLayersUI();
            render();
            if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
        } catch (err) {
            alert('Не удалось открыть проект: ' + err.message);
        }
    };
    rd.readAsText(f);
});

// --- Картинка как нижний слой ---
const imageFile = document.getElementById('imageFile');
if (imageFile) {
    imageFile.addEventListener('change', function () {
        const f = this.files[0];
        this.value = '';
        if (!f) return;
        const img = new Image();
        img.onload = function () {
            const k = Math.min(1, W / img.width, H / img.height);
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const g = cv.getContext('2d');
            g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2,
                        img.width * k, img.height * k);
            const layer = {
                id: 'L' + Date.now(),
                name: f.name,
                visible: true,
                strokes: []
            };
            layer.strokes.push({
                tool: 'raster',
                image: cv,
                layerId: layer.id,
                points: []
            });
            layers.unshift(layer);
            if (typeof renderLayersUI === 'function') renderLayersUI();
            render();
        };
        img.src = URL.createObjectURL(f);
    });
}

// Имя для всех экспортов: берём из футера, чистим от мусора
function exportName(ext) {
    let base = 'drawing';
    try { base = (typeof currentFileName !== 'undefined' && currentFileName) || base; } catch (e) {}
    base = String(base).replace(/\.(suver|json|png|jpe?g|svg)$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'drawing';
    return base + '.' + ext;
}
window.exportName = exportName;
