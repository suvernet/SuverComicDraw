// =====================================================================
// SuverComicDraw — render.js
// Отрисовка кадра: фон, сетка, слои, превью активного штриха
// =====================================================================

// --- Кэш отрисовки слоя ---
// Слой перерисовывается только когда его изменили (undo, новый штрих,
// ресайз). Панорама и зум просто сбрасывают кэши — так дешевле.
function getLayerCanvas(layer) {
    if (layerCaches[layer.id]) return layerCaches[layer.id];

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');

    g.save();
    applyViewTransform(g);
    drawStrokes(g, layer.strokes);
    g.restore();

    layerCaches[layer.id] = cv;
    return cv;
}

// --- Точечная сетка ---
// Привязана к МИРОВЫМ координатам: при панораме точки «едут» вместе
// с холстом, при зуме — растягиваются. Так видно, что плоскость бесконечна.
function drawDotGrid() {
    const step = 40 * view.zoom;          // шаг в экранных пикселях
    if (step < 14) return;                // слишком часто — не мельчим

    const ox = (-view.x * view.zoom) % step;
    const oy = (-view.y * view.zoom) % step;

    // все точки за один вызов fill — в разы дешевле, чем по одной
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.beginPath();
    for (let x = ox; x < W; x += step) {
        for (let y = oy; y < H; y += step) {
            ctx.rect(x, y, 1, 1);
        }
    }
    ctx.fill();
}


// --- Сборка кадра ---
function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 1. Фон
    if (hasBackground) {
        ctx.fillStyle = bgColorInput.value;
        ctx.fillRect(0, 0, W, H);
        if (bgMode === 'grid') drawBgLines(true);
        if (bgMode === 'lined') drawBgLines(false);
    }

    // 2. Точечная сетка
    drawDotGrid();

    // 3. Слои снизу вверх
    for (const layer of layers) {
        if (!layer.visible) continue;

        if (current && current.tool === 'smudge' && smudgeState &&
            layer.id === current.layerId) {
            ctx.drawImage(smudgeState.work, 0, 0);
            continue;
        }

        ctx.save();
        if (layer.opacity !== undefined && layer.opacity !== null) {
            ctx.globalAlpha = Number(layer.opacity);
        }
        if (layer.blendMode) {
            ctx.globalCompositeOperation = layer.blendMode;
        }
        ctx.drawImage(getLayerCanvas(layer), 0, 0);
        ctx.restore();
    }

    // 4. Превью кисти MyPaint/smudge: живой буфер (mpLive уже инкрементный внутри).
    // Было только 'mypaint', поэтому кнопка 'smudge' ничего не показывала до отпускания.
    if (current && (current.tool === 'mypaint' || current.tool === 'smudge')) {
        const layer = getLayer(current.layerId);
        if (layer && layer.visible) mypaintStroke(ctx, current);
    }
    // Превью остальных инструментов через overlay — целиком.
    // Точек после фильтра в events.js мало, кадр быстрый, линия гладкая.
    else if (current && current.tool !== 'airbrush') {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(0, 0, W, H);
        const layer = getLayer(current.layerId);
        if (layer && layer.visible) {
            applyViewTransform(octx);
    if (current && (current.tool === 'line' || current.tool === 'rect' || current.tool === 'ellipse')) {
        strokeShape(octx, current);
        ctx.drawImage(overlay, 0, 0);
        return;
    }
        if (current.tool === 'panel') {
                octx.save();
                const a = current.points[0];
                const b = current.points[current.points.length - 1];
                octx.setLineDash([6, 6]);
                octx.strokeStyle = current.color;
                octx.lineWidth = current.size;
                octx.strokeRect(
                    Math.min(a.x, b.x), Math.min(a.y, b.y),
                    Math.abs(b.x - a.x), Math.abs(b.y - a.y)
                );
                octx.restore();
            } else {
                drawStrokes(octx, [current]);
            }


            ctx.drawImage(overlay, 0, 0);
        }
    }

    // 5. Превью аэрографа: тот же multiply, что и в airbrushStroke,
    // иначе после отпускания линия выглядит уже/темнее
    if (current && current.tool === 'airbrush' && airbrushState) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = current.alpha;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(airbrushState.eng.buf, 0, 0);
        ctx.restore();
    }
       
    if (tool === 'select') drawSelection(ctx);

    // Обновление превью активного слоя в панели слоев (GIMP)
    if (window.layersModule && typeof window.layersModule.updateActiveThumbnail === 'function') {
        window.layersModule.updateActiveThumbnail();
    }

}

// --- Линии для режимов фона «сетка» и «линовка» ---
// Привязаны к мировым координатам: при зуме и панораме едут вместе с холстом
function drawBgLines(withVertical) {
    const step = 40;
    ctx.save();
    applyViewTransform(ctx);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1 / view.zoom;
    ctx.beginPath();
    const x0 = view.x, x1 = view.x + W / view.zoom;
    const y0 = view.y, y1 = view.y + H / view.zoom;
    if (withVertical) {
        for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
        }
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
    }
    ctx.stroke();
    ctx.restore();
}


// --- Отложенный рендер ---
// Много событий за один кадр — рисуем только последний.
let rafPending = false;
function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
        rafPending = false;
        render();


    });


}



