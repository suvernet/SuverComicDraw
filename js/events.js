// =====================================================================
// SuverComicDraw — events.js
// Мышь/стилус: рисование, панорама, зум колесом
// =====================================================================

// --- Клавиатура: пробел = панорама ---
window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') spaceDown = true;
});
window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') spaceDown = false;
});
window.addEventListener('keydown', function (e) {
    if (e.code === 'Escape' && selection) {
        selection = null;
        scheduleRender();
        return;
    }
    if (tool === 'select' && (e.key === 'Delete' || e.key === 'Backspace') &&
        selection && selection.strokes) {
        const layer = getLayer(selection.layerId);
        if (layer) {
            history.push({
                type: 'deleteMulti',
                layerId: layer.id,
                strokes: selection.strokes.slice()
            });
            layer.strokes = layer.strokes.filter(s => !selection.strokes.includes(s));
            redoStack = [];
            selection = null;
            delete layerCaches[layer.id];
            render();
            updateHistoryButtons();
        }
    }
});



// --- Зум колесом — к точке под курсором ---
c.addEventListener('wheel', function (e) {
    e.preventDefault();
    const sp = getScreenPos(e);
    const before = screenToWorld(sp);
    setZoom(view.zoom * Math.pow(1.1, -e.deltaY / 100));
    const after = screenToWorld(sp);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
    for (const key in layerCaches) delete layerCaches[key];
    scheduleRender();
}, { passive: false });

// === НОРМАЛИЗАЦИЯ НАЖИМА ===
// лёгкое касание стилуса больше не даёт волосок;
// слайдер нажима: 0 — линия равномерная, 1 — полная чувствительность планшета
function normP(p) {
    const k = toolPress[tool] !== undefined ? toolPress[tool] : 1;
    if (k === 0) return 1; // нажим отключён — все точки одинаковые
    if (p === undefined || p === null || p <= 0) p = 1;
    const v = Math.min(1, 0.12 + 0.88 * Math.pow(p, 0.8));
    return Math.max(0.02, Math.min(1, v * k));
}


// === Защита текстового слоя ===
// Текстовый слой хранит ровно один штрих tool:'text'.
// Любая попытка рисовать кистью/маркером по активному текстовому слою
// молча уводила бы краску в тот же слой — потом текст не выделить,
// история ломается. Поэтому уводим рисование на соседний обычный слой
// или создаём новый. Возвращает слой для рисования.
function ensureDrawableLayer() {
    let layer = (typeof getLayer === 'function') ? getLayer(activeLayerId) : null;
    const isTextLayer = function (l) {
        if (!l) return false;
        if (l.type === 'text') return true;
        if (!Array.isArray(l.strokes)) return false;
        return l.strokes.length === 1 && l.strokes[0] && l.strokes[0].tool === 'text';
    };
    if (layer && !isTextLayer(layer)) return layer;

    // 1. Ищем верхний видимый НЕ текстовый слой — рисуем туда
    if (typeof layers !== 'undefined' && Array.isArray(layers)) {
        for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i];
            if (!l || !l.visible) continue;
            if (!isTextLayer(l)) {
                activeLayerId = l.id;
                if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) {
                    try { layersModule.renderLayersList(); } catch (e) {}
                }
                return l;
            }
        }
    }

    // 2. Все слои текстовые (или их нет) — создаём новый обычный слой
    const L = {
        id: (typeof nextLayerId !== 'undefined') ? nextLayerId++ : Date.now(),
        name: 'Слой ' + ((typeof nextLayerId !== 'undefined') ? nextLayerId - 1 : layers.length + 1),
        visible: true,
        strokes: []
    };
    if (typeof layers !== 'undefined') layers.push(L);
    activeLayerId = L.id;
    if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) {
        try { layersModule.renderLayersList(); } catch (e) {}
    }
    return (typeof getLayer === 'function') ? getLayer(activeLayerId) : L;
}

// === НАЖАТИЕ ===
c.addEventListener('pointerdown', function (e) {

    // Панорама: средняя кнопка или пробел + левая
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
        e.preventDefault();
        isPanning = true;
        panStart = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
        c.classList.add('panning');
        return;
    }
    if (e.button !== 0) return;
            if (tool === 'text') {
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp);

        let targetTextLayer = null;
        for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i];
            if (!l || !l.visible) continue;
            const s = (l.textItem) || (l.strokes && l.strokes.find(st => st.tool === 'text'));
            if (s && s.points && s.points[0]) {
                const pt = s.points[0];
                const fontSize = s.size || 28;
                const txt = s.text || '';
                const lines = txt.split(/\r?\n/);
                let maxLen = 0;
                for (let k = 0; k < lines.length; k++) {
                    if (lines[k].length > maxLen) maxLen = lines[k].length;
                }
                const estW = Math.max(40, maxLen * fontSize * 0.7);
                const estH = Math.max(30, lines.length * fontSize * 1.3);

                if (wp.x >= pt.x - 15 && wp.x <= pt.x + estW + 15 &&
                    wp.y >= pt.y - 15 && wp.y <= pt.y + estH + 15) {
                    targetTextLayer = l;
                    break;
                }
            }
        }

        if (targetTextLayer) {
            openTextEditorModal(targetTextLayer, false);
        } else {
            openTextEditorModal(null, true, wp);
        }
        return;
    }
    if (tool === 'select') {
        selectionDown(e);
        return;

    // --- ВЫДЕЛЕНИЕ ---
    if (tool === 'select') {
        e.preventDefault();                     // блокируем стандартное выделение/скролл
        selectionDown(e);
        return;
    }
    }    

    const sp = getScreenPos(e);
    const wp = screenToWorld(sp);

    // --- Заливка: мгновенный штрих ---
    if (tool === 'fill') {
        const layer = ensureDrawableLayer();
        if (!layer) return;
        const s = {
            layerId: activeLayerId, tool: 'fill',
            color: colorInput.value, alpha: Number(opacityInput.value),
            points: [{ x: wp.x, y: wp.y }]
        };
        const g = getLayerCanvas(layer).getContext('2d');
        applyViewTransform(g);
        floodFill(g, s);
        commitStroke(layer, s);
        render();
        pushRecent(s.color);
        return;
    }

    // --- Аэрограф: буферный движок, первая клякса сразу ---
    if (tool === 'airbrush') {
        ensureDrawableLayer();
        isDrawing = true; isProjectDirty = true;
        const seed = Math.floor(Math.random() * 1e9);
        const R = Math.max(4, Number(thicknessInput.value) * view.zoom / 2);
        const eng = airbrushCreate(colorInput.value, R, seed);
        eng.dab(sp.x, sp.y);
        airbrushState = { eng: eng, last: sp };
        current = {
            layerId: activeLayerId, tool: 'airbrush',
            color: colorInput.value,
            size: Number(thicknessInput.value),
            alpha: Number(opacityInput.value),
            seed: seed,
            points: [{ x: wp.x, y: wp.y, p: normP(getPressure(e, null, wp)) }]
        };
        scheduleRender();
        return;
    }

    // --- Обычные инструменты: кисть, ластик, размытие ---
    // ВАЖНО: если активен текстовый слой — сначала уходим на рисуемый,
    // иначе current.layerId укажет на текст и штрих ляжет в него
    ensureDrawableLayer();
    isDrawing = true; isProjectDirty = true;
    current = {
        layerId: activeLayerId, tool: tool,
        color: colorInput.value,
        size: Number(thicknessInput.value),
        alpha: Number(opacityInput.value),
        seed: Math.floor(Math.random() * 1e9),
        points: [{ x: wp.x, y: wp.y, p: normP(getPressure(e, null, wp)) }]
    };
    // новый штрих — сбросить инкрементное превью (чистим один раз здесь, а не каждый кадр)
    try {
        if (typeof octx !== 'undefined' && typeof W !== 'undefined') {
            octx.setTransform(1, 0, 0, 1, 0, 0);
            octx.clearRect(0, 0, W, H);
        }
        if (typeof previewSeed !== 'undefined') { previewSeed = null; previewN = 0; }
    } catch (e2) {}
});

// === ДВИЖЕНИЕ ===
window.addEventListener('pointermove', function (e) {
    // Панорама
    if (isPanning && panStart) {
        view.x = panStart.vx - (e.clientX - panStart.sx) / view.zoom;
        view.y = panStart.vy - (e.clientY - panStart.sy) / view.zoom;
        for (const key in layerCaches) delete layerCaches[key];
        scheduleRender();
        return;
    }
        if (tool === 'select') {
        selectionMove(e);
        return;
    }


    if (!isDrawing || !current) return;
    if (current.tool === 'panel' || current.tool === 'line' || current.tool === 'rect' || current.tool === 'ellipse') {
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp);
        current.points = [current.points[0], { x: wp.x, y: wp.y, p: 1 }];
        scheduleRender();
        return;
    }

    // --- Аэрограф: дабы в буфер штриха ---
    if (current.tool === 'airbrush' && airbrushState) {
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ev of evs) {
            const sp = getScreenPos(ev);
            const wp2 = screenToWorld(sp);
            const prev = current.points[current.points.length - 1];
            const pr = normP(getPressure(ev, prev, wp2));
            current.points.push({ x: wp2.x, y: wp2.y, p: pr });
            airbrushState.eng.along(airbrushState.last, sp);
            airbrushState.last = sp;
        }
        scheduleRender();
        return;
    }

    // --- Обычные инструменты: копим точки, превью инкрементное ---
    // Режем точки по дистанции: стилус шлёт 120-240 Гц + coalesced,
    // без фильтра штрих за секунды набирает тысячи точек и каждый кадр
    // перерисовывал бы всё с нуля (отсюда секунды задержки и хвостик).
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
        const sp = getScreenPos(ev);
        const wp = screenToWorld(sp);
        const prev = current.points[current.points.length - 1];
        const pr = normP(getPressure(ev, prev, wp));
        const dx = (wp.x - prev.x) * view.zoom;
        const dy = (wp.y - prev.y) * view.zoom;
        if (current.points.length > 1 && (dx * dx + dy * dy) < 0.56 && Math.abs(pr - prev.p) < 0.08) {
            prev.p = pr;
            continue;
        }
        current.points.push({ x: wp.x, y: wp.y, p: pr });
    }
    scheduleRender();
});


// === ОТПУСКАНИЕ ===
window.addEventListener('pointerup', function (e) {
    if (tool === 'select') {
        if (e.altKey && selection && selection.strokes && selection.strokes.length) {
            const layer = getLayer(selection.layerId);
            if (!layer) return;

            const pos = screenToWorld(getScreenPos(e));
            const firstPoint = selection.strokes[0].points[0];
            const dx = pos.x - firstPoint.x;
            const dy = pos.y - firstPoint.y;

            const newStrokes = selection.strokes.map(s => ({
                id: 's_' + Date.now(),
                tool: s.tool,
                color: s.color,
                size: s.size,
                alpha: s.alpha,
                points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
            }));

            const newSel = {
                layerId: selection.layerId,
                strokes: newStrokes,
                bbox: {
                    x_min: Math.min(...newStrokes.flatMap(st => st.points.map(p => p.x))),
                    y_min: Math.min(...newStrokes.flatMap(st => st.points.map(p => p.y))),
                    x_max: Math.max(...newStrokes.flatMap(st => st.points.map(p => p.x))),
                    y_max: Math.max(...newStrokes.flatMap(st => st.points.map(p => p.y)))
                }
            };

            // Добавляем клон в слой
            const targetLayer = getLayer(newSel.layerId);
            if (targetLayer) {
                targetLayer.strokes = targetLayer.strokes.concat(newStrokes);
                delete layerCaches[targetLayer.id];
                render();
                if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
            }

            selection = newSel;   // не selectionUp(), выделение остаётся активным
            return;
        }

        selectionUp();
        return;
    }

    if (isPanning) {
        isPanning = false;
        panStart = null;
        c.classList.remove('panning');
        return;
    }

 if (isDrawing && current) {
    if (current.tool === 'panel') {
        const a = current.points[0];
        const b = current.points[current.points.length - 1];
        if (Math.abs(b.x - a.x) < 5 && Math.abs(b.y - a.y) < 5) {
            current = null;
            isDrawing = false;
            scheduleRender();
            return;
        }
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
        current.points = [
            { x: minX, y: minY }, { x: maxX, y: minY },
            { x: maxX, y: maxY }, { x: minX, y: maxY },
            { x: minX, y: minY }
        ];
    } else if (current.tool === 'line' || current.tool === 'rect' || current.tool === 'ellipse') {
        const p1 = current.points[0];
        const p2 = current.points[current.points.length - 1];
        if (Math.abs(p2.x - p1.x) < 2 && Math.abs(p2.y - p1.y) < 2) {
            p2.x += 30; p2.y += 30;
        }
        current.points = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
    }

    const layer = getLayer(current.layerId);
    if (layer && current.points.length >= 1) {
        commitStroke(layer, current);
        if (current.tool !== 'mypaint') pushRecent(current.color);
    }
    
}


    current = null;
    isDrawing = false;
    mypaintState = null;
    airbrushState = null;
    render();
    updateHistoryButtons();
});

function mirrorSelection(axis) {
    const strokes = selection.strokes;

    // глобальный bbox выделения
    const allX = strokes.flatMap(s => s.points.map(p => p.x));
    const allY = strokes.flatMap(s => s.points.map(p => p.y));
    const x_min = Math.min(...allX), x_max = Math.max(...allX);
    const y_min = Math.min(...allY), y_max = Math.max(...allY);

    const newStrokes = strokes.map(s => ({
        id: 's_' + Date.now(),
        tool: s.tool,
        color: s.color,
        size: s.size,
        alpha: s.alpha,
        points: s.points.map(p => {
            if (axis === 'H') return { x: x_min + x_max - p.x, y: p.y };
            return { x: p.x, y: y_min + y_max - p.y };
        })
    }));

    const layer = getLayer(selection.layerId);
    if (!layer) return;

    layer.strokes = layer.strokes.concat(newStrokes);
    delete layerCaches[layer.id];
    render();
    if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
}


// =====================================================================
// SuverComicDraw — Вставка из буфера обмена (Ctrl+V) и Drag-and-Drop
// =====================================================================

// Вставка из буфера обмена
window.addEventListener('paste', function (e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = function (event) {
                const img = new Image();
                img.onload = function () {
                    // Создаём новый слой под вставленную картинку или рисуем на текущем
                    const layer = getLayer(activeLayerId);
                    if (!layer) return;
                    const stroke = {
                        tool: 'image',
                        img: img,
                        x: view.x + W / (2 * view.zoom) - img.width / 2,
                        y: view.y + H / (2 * view.zoom) - img.height / 2,
                        w: img.width,
                        h: img.height,
                        points: [{ x: 0, y: 0 }]
                    };
                    commitStroke(layer, stroke);
                    isProjectDirty = true;
                    render();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(blob);
            break;
        }
    }
});

// Drag and drop картинок на холст
window.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
});

window.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.suver') || file.name.endsWith('.json')) {
            loadProjectFile(file);
            return;
        }
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                const img = new Image();
                img.onload = function () {
                    const layer = getLayer(activeLayerId);
                    if (!layer) return;
                    const sp = getScreenPos(e);
                    const wp = screenToWorld(sp);
                    const stroke = {
                        tool: 'image',
                        img: img,
                        x: wp.x - img.width / 2,
                        y: wp.y - img.height / 2,
                        w: img.width,
                        h: img.height,
                        points: [{ x: 0, y: 0 }]
                    };
                    commitStroke(layer, stroke);
                    isProjectDirty = true;
                    render();
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
});

// =====================================================================
// SuverComicDraw — Режим Референса
// =====================================================================
const refPanel = document.getElementById('reference-panel');
const refBtn = document.getElementById('ref-btn');
const refCloseBtn = document.getElementById('refCloseBtn');
const refLoadBtn = document.getElementById('refLoadBtn');
const refPipetteBtn = document.getElementById('refPipetteBtn');
const refImageFile = document.getElementById('refImageFile');
const refCanvas = document.getElementById('refCanvas');
const refEmptyPrompt = document.getElementById('refEmptyPrompt');
let refCtx = refCanvas ? refCanvas.getContext('2d') : null;
let refPipetteActive = false;

if (refBtn && refPanel) {
    refBtn.addEventListener('click', () => {
        refPanel.style.display = (refPanel.style.display === 'none') ? 'flex' : 'none';
        refBtn.classList.toggle('active', refPanel.style.display !== 'none');
    });
    refCloseBtn.addEventListener('click', () => {
        refPanel.style.display = 'none';
        refBtn.classList.remove('active');
    });
    refLoadBtn.addEventListener('click', () => refImageFile.click());

    refImageFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            loadRefImage(e.target.files[0]);
        }
    });

    function loadRefImage(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                refCanvas.width = img.width;
                refCanvas.height = img.height;
                refCtx.drawImage(img, 0, 0);
                if (refEmptyPrompt) refEmptyPrompt.style.display = 'none';
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Пипетка в окне референса
    if (refPipetteBtn) {
        refPipetteBtn.addEventListener('click', () => {
            refPipetteActive = !refPipetteActive;
            refPipetteBtn.classList.toggle('active', refPipetteActive);
        });
    }

    if (refCanvas) {
        refCanvas.addEventListener('pointerdown', (e) => {
            const rect = refCanvas.getBoundingClientRect();
            const scaleX = refCanvas.width / rect.width;
            const scaleY = refCanvas.height / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);

            const pixel = refCtx.getImageData(x, y, 1, 1).data;
            const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
            if (colorInput) {
                colorInput.value = hex;
                colorInput.dispatchEvent(new Event('input'));
            }
        });
    }

    // Перемещение окна референса
    const refHeader = document.getElementById('refHeader');
    let isDraggingRef = false, refOffset = { x: 0, y: 0 };
    if (refHeader) {
        refHeader.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDraggingRef = true;
            refOffset = {
                x: e.clientX - refPanel.offsetLeft,
                y: e.clientY - refPanel.offsetTop
            };
        });
        window.addEventListener('mousemove', (e) => {
            if (isDraggingRef) {
                refPanel.style.left = (e.clientX - refOffset.x) + 'px';
                refPanel.style.top = (e.clientY - refOffset.y) + 'px';
                refPanel.style.right = 'auto';
            }
        });
        window.addEventListener('mouseup', () => isDraggingRef = false);
    }
}

const canvas = document.getElementById('main-canvas'); // Ваш ID canvas

// Важно: pointerdown, pointermove, pointerup работают и для мыши, и для пера
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);

function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType !== 'pen') return; // Только ЛКМ или перо
    canvas.setPointerCapture(e.pointerId); // Захватываем перо, чтобы не терять его при быстром движении
    
    const pressure = e.pressure > 0 ? e.pressure :


// =====================================================================

// =====================================================================
// SuverComicDraw — Редактирование текста (модальное окно по фэн-шую)
// =====================================================================
const textModalBackdrop = document.getElementById('text-modal-backdrop');
const canvasTextEditor  = document.getElementById('canvas-text-editor');
const textApplyBtn      = document.getElementById('text-apply-btn');
const textCancelBtn     = document.getElementById('text-cancel-btn');
const textCancelBtn2    = document.getElementById('text-cancel-btn-2');
const modalTitle        = document.getElementById('modal-title');

let editingTargetLayerId = null;
let pendingNewTextWorldPos = null;

function openTextEditorModal(layer, isNew = false, clickWorldPos = null) {
    if (!textModalBackdrop || !canvasTextEditor) return;

    if (layer && !isNew) {
        editingTargetLayerId = layer.id;
        activeLayerId = layer.id;
        pendingNewTextWorldPos = null;
        
        let s = (layer.textItem) || (layer.strokes && layer.strokes.find(st => st.tool === 'text'));
        let currentTxt = '';
        if (s && s.text) {
            currentTxt = s.text;
        } else if (layer.name && layer.name.startsWith('Текст:')) {
            currentTxt = layer.name.replace(/^Текст:\s*/, '');
        }

        if (modalTitle) modalTitle.textContent = 'Редактирование реплики';
        canvasTextEditor.value = currentTxt;

        // Синхронизируем шрифт и свойства
        if (s && s.family && fontFamilyInput) fontFamilyInput.value = s.family;
        if (s && s.size && fontSizeInput) fontSizeInput.value = s.size;
        if (s && s.color && colorInput) colorInput.value = s.color;
    } else {
        editingTargetLayerId = null;
        pendingNewTextWorldPos = clickWorldPos || { x: view.x + 100, y: view.y + 100 };
        if (modalTitle) modalTitle.textContent = 'Новый текст';
        canvasTextEditor.value = '';
    }

    textModalBackdrop.style.display = 'flex';
    setTimeout(() => {
        canvasTextEditor.focus();
        canvasTextEditor.select();
    }, 50);
}
window.openTextEditorModal = openTextEditorModal;
window.openTextEditorForLayer = openTextEditorModal; // обратная совместимость

function closeTextModal() {
    if (textModalBackdrop) textModalBackdrop.style.display = 'none';
    if (canvasTextEditor) canvasTextEditor.value = '';
    editingTargetLayerId = null;
    pendingNewTextWorldPos = null;
}

function applyTextModal() {
    if (!canvasTextEditor) return;
    const txt = canvasTextEditor.value.trim();
    if (!txt) {
        closeTextModal();
        return;
    }

    const strokeColor = colorInput ? colorInput.value : '#000000';
    const strokeAlpha = opacityInput ? Number(opacityInput.value) : 1;
    const fontSize = textFontSize || 28;
    const fontFamily = textFontFamily || "'Comic Relief', cursive, sans-serif";
    const isBold = !!textFontBold;
    const isItalic = !!textFontItalic;

    if (editingTargetLayerId !== null) {
        // Редактируем существующий слой
        const layer = getLayer(editingTargetLayerId);
        if (layer) {
            let s = (layer.textItem) || (layer.strokes && layer.strokes.find(st => st.tool === 'text'));
            const oldPos = (s && s.points && s.points[0]) ? s.points[0] : { x: view.x + 100, y: view.y + 100 };
            
            const updatedStroke = {
                tool: 'text',
                text: txt,
                color: strokeColor,
                alpha: strokeAlpha,
                size: fontSize,
                family: fontFamily,
                bold: isBold,
                italic: isItalic,
                points: [{ x: oldPos.x, y: oldPos.y }]
            };

            history.push({
                type: 'editText',
                layerId: layer.id,
                prevStrokes: layer.strokes.slice(),
                prevName: layer.name
            });
            redoStack = [];

            layer.strokes = [updatedStroke];
            layer.textItem = updatedStroke;
            layer.type = 'text';
            layer.name = 'Текст: ' + (txt.length > 15 ? txt.slice(0, 15) + '…' : txt);

            delete layerCaches[layer.id];
            isProjectDirty = true;
            render();
            if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) {
                layersModule.renderLayersList();
            }
            if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
        }
    } else {
        // Создаем новый слой с текстом
        const pos = pendingNewTextWorldPos || { x: view.x + 100, y: view.y + 100 };
        const newStroke = {
            tool: 'text',
            text: txt,
            color: strokeColor,
            alpha: strokeAlpha,
            size: fontSize,
            family: fontFamily,
            bold: isBold,
            italic: isItalic,
            points: [{ x: pos.x, y: pos.y }]
        };

        const newLayer = {
            id: nextLayerId++,
            name: ' ' + (txt.length > 15 ? txt.slice(0, 15) + '…' : txt),
            type: 'text',
            visible: true,
            opacity: 1,
            blendMode: 'source-over',
            strokes: [newStroke],
            textItem: newStroke
        };

        layers.push(newLayer);
        activeLayerId = newLayer.id;
        history.push({ type: 'addLayer', layer: newLayer });
        redoStack = [];

        delete layerCaches[newLayer.id];
        isProjectDirty = true;
        render();
        if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) {
            layersModule.renderLayersList();
        }
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    if (typeof pushRecent === 'function') pushRecent(strokeColor);
    closeTextModal();
}

if (textApplyBtn) textApplyBtn.onclick = applyTextModal;
if (textCancelBtn) textCancelBtn.onclick = closeTextModal;
if (textCancelBtn2) textCancelBtn2.onclick = closeTextModal;

// Закрытие по клику на подложку
if (textModalBackdrop) {
    textModalBackdrop.onclick = function(e) {
        if (e.target === textModalBackdrop) closeTextModal();
    };
}

if (canvasTextEditor) {
    canvasTextEditor.onkeydown = function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            applyTextModal();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeTextModal();
        }
    };
}