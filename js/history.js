// =====================================================================
// SuverComicDraw — history.js
// Undo / redo, очистка, заливка фона, состояние кнопок
// =====================================================================

// --- Отмена ---
function undo() {
    if (!history.length) return;
    const rec = history.pop();
    const layer = getLayer(rec.layerId);
    if (layer) {
        if (rec.type === 'bake') {
            layer.strokes = rec.prevStrokes;   // возвращаем штрихи до запекания
        } else {
            const i = layer.strokes.lastIndexOf(rec.stroke);
            if (i !== -1) layer.strokes.splice(i, 1);
        }
    }
    redoStack.push(rec);
    for (const key in layerCaches) delete layerCaches[key];
    render();
    updateHistoryButtons();
}

// --- Повтор ---
function redo() {
    if (!redoStack.length) return;
    const rec = redoStack.pop();
    const layer = getLayer(rec.layerId);
    if (layer) {
        if (rec.type === 'bake') {
            layer.strokes = [rec.stroke];      // снова запечённый кадр
        } else {
            layer.strokes.push(rec.stroke);
        }
    }
    history.push(rec);
    for (const key in layerCaches) delete layerCaches[key];
    render();
    updateHistoryButtons();
}


// --- Запись штриха в историю (вызывается из events.js при pointerup) ---
function commitStroke(layer, stroke) {
    layer.strokes.push(stroke);
    if (typeof isProjectDirty !== 'undefined') isProjectDirty = true;
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    history.push({ layerId: layer.id, stroke: stroke });
    redoStack = [];
    delete layerCaches[layer.id];
    updateHistoryButtons();
}


// --- Кнопки активны, только если есть что отменять/возвращать ---
function updateHistoryButtons() {
    undoBtn.disabled = !history.length;
    redoBtn.disabled = !redoStack.length;
}

// Очистка только активного слоя. Shift+клик — все слои.
clearBtn.addEventListener('click', function (e) {
    if (e.shiftKey) {
        for (const layer of layers) layer.strokes = [];
        history = [];
        redoStack = [];
        for (const key in layerCaches) delete layerCaches[key];
    } else {
        const layer = getLayer(activeLayerId);
        if (!layer) return;
        layer.strokes = [];
        delete layerCaches[layer.id];
        // убираем историю этого слоя, чтобы undo не вернул "призраки"
        history = history.filter(h => h.layerId !== layer.id);
        redoStack = redoStack.filter(h => h.layerId !== layer.id);
    }
    if (typeof isProjectDirty !== 'undefined') isProjectDirty = true;
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    render();
    updateHistoryButtons();
});

undoBtn.addEventListener('click', function () {
    if (history.length === 0) return;
    const action = history.pop();
    const layer = getLayer(action.layerId);
    if (action.type === 'transform') {
        for (const en of action.entries) {
            en.stroke.points = en.before.points;
            en.stroke.size = en.before.size;
        }
        if (selection && selection.layerId === action.layerId)
            selection.bbox = groupBBox(selection.strokes);
    } else if (action.type === 'deleteMulti') {
        layer.strokes.push(...action.strokes);
        selection = null;
    } else if (action.type === 'addMulti') {
        layer.strokes = layer.strokes.filter(s => !action.strokes.includes(s));
        selection = null;
    } else {
        if (layer) {
            const i = layer.strokes.indexOf(action.stroke);
            if (i > -1) layer.strokes.splice(i, 1);
            if (selection && selection.strokes && selection.strokes.includes(action.stroke))
                selection = null;
        }
    }
    delete layerCaches[action.layerId];
    redoStack.push(action);
    if (typeof isProjectDirty !== 'undefined') isProjectDirty = true;
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    render();
    updateHistoryButtons();
});

redoBtn.addEventListener('click', function () {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    const layer = getLayer(action.layerId);
    if (action.type === 'transform') {
        for (const en of action.entries) {
            en.stroke.points = en.after.points;
            en.stroke.size = en.after.size;
        }
        if (selection && selection.layerId === action.layerId)
            selection.bbox = groupBBox(selection.strokes);
    } else if (action.type === 'deleteMulti') {
        for (const s of action.strokes) {
            const i = layer.strokes.indexOf(s);
            if (i > -1) layer.strokes.splice(i, 1);
        }
        selection = null;
    } else if (action.type === 'addMulti') {
        layer.strokes.push(...action.strokes);
    } else {
        if (layer) layer.strokes.push(action.stroke);
    }
    delete layerCaches[action.layerId];
    history.push(action);
    render();
    updateHistoryButtons();
});



