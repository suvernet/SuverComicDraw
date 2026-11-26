// === ВЫДЕЛЕНИЕ И ТРАНСФОРМАЦИЯ ШТРИХОВ (групповая) ===
let selection = null;   // { layerId, strokes: [...], bbox, mode, orig, ... }
let selBand = null;     // рамка выделения в процессе растягивания
const HANDLE = 9;

function strokeBBox(s) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let maxP = 1;
    for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        const pr = p.p !== undefined ? p.p : 1;
        if (pr > maxP) maxP = pr;
    }
    const pad = (s.size || 2) * maxP / 2 + 1;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

// общий габарит группы
function groupBBox(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
        const b = strokeBBox(s);
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function selHandles() {
    if (!selection) return null;
    const b = selection.bbox;
    const toScr = p => ({ x: (p.x - view.x) * view.zoom, y: (p.y - view.y) * view.zoom });
    const corners = [
        toScr({ x: b.x, y: b.y }), toScr({ x: b.x + b.w, y: b.y }),
        toScr({ x: b.x + b.w, y: b.y + b.h }), toScr({ x: b.x, y: b.y + b.h })
    ];
    const cx = (corners[0].x + corners[2].x) / 2;
    const cy = (corners[0].y + corners[2].y) / 2;
    const rot = { x: cx, y: Math.min(corners[0].y, corners[1].y) - 26 };
    return { corners, rot };
}

function snapshotStroke(s) {
    return {
        stroke: s,
        points: s.points.map(p => ({ x: p.x, y: p.y, p: p.p })),
        size: s.size
    };
}

function beginTransform(mode, sp, aux) {
    selection.mode = mode;
    selection.orig = selection.strokes.map(snapshotStroke);
    selection.startSp = sp;
    selection.dirty = false;
    if (aux) Object.assign(selection, aux);
}

function selectionDown(e) {
    if (e.button !== 0) return;
    const sp = getScreenPos(e);

    // маркеры уже выделенной группы?
    if (selection) {
        const h = selHandles();
        if (h && Math.hypot(sp.x - h.rot.x, sp.y - h.rot.y) <= 12) {
            beginTransform('rotate', sp, {
                centerScr: { x: cx(h), y: cy(h) },
                centerWorld: { x: selection.bbox.x + selection.bbox.w / 2,
                               y: selection.bbox.y + selection.bbox.h / 2 },
                startAngle: Math.atan2(sp.y - cy(h), sp.x - cx(h))
            });
            return;
        }
        if (h) {
            for (let k = 0; k < 4; k++) {
                const q = h.corners[k];
                if (Math.hypot(sp.x - q.x, sp.y - q.y) <= 12) {
                    const opp = h.corners[(k + 2) % 4];
                    beginTransform('scale', sp, {
                        anchorScr: opp,
                        anchorWorld: { x: opp.x / view.zoom + view.x, y: opp.y / view.zoom + view.y },
                        startDist: Math.hypot(sp.x - opp.x, sp.y - opp.y) || 1
                    });
                    return;
                }
            }
        }
    }

    const wp = screenToWorld(sp);
    const layer = getLayer(activeLayerId);
    if (!layer) { selection = null; scheduleRender(); return; }

    // клик по штриху активного слоя?
    let hit = null;
    for (let i = layer.strokes.length - 1; i >= 0; i--) {
        const b = strokeBBox(layer.strokes[i]);
        if (wp.x >= b.x && wp.x <= b.x + b.w && wp.y >= b.y && wp.y <= b.y + b.h) {
            hit = layer.strokes[i];
            break;
        }
    }

    if (hit) {
        // если кликнули внутрь уже выделенной группы — двигаем её целиком
        if (selection && selection.layerId === layer.id &&
            selection.strokes.includes(hit)) {
            beginTransform('move', sp, null);
        } else {
            selection = { layerId: layer.id, strokes: [hit] };
            selection.bbox = groupBBox(selection.strokes);
            beginTransform('move', sp, null);
        }
        scheduleRender();
        return;
    }

    // пустое место: начинаем тянуть рамку выделения
    selBand = { layerId: layer.id, x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y };
    scheduleRender();
}

function cy(h) { return (h.corners[0].y + h.corners[2].y) / 2; }
function cx(h) { return (h.corners[0].x + h.corners[2].x) / 2; }

function selectionMove(e) {
    if (selBand) {
        const wp = screenToWorld(getScreenPos(e));
        selBand.x1 = wp.x; selBand.y1 = wp.y;
        scheduleRender();
        return;
    }
    if (!selection || !selection.mode) return;
    const sp = getScreenPos(e);
    selection.dirty = true;

    if (selection.mode === 'move') {
        const dx = (sp.x - selection.startSp.x) / view.zoom;
        const dy = (sp.y - selection.startSp.y) / view.zoom;
        for (const o of selection.orig) {
            o.stroke.points = o.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p }));
        }
    } else if (selection.mode === 'scale') {
        const d = Math.hypot(sp.x - selection.anchorScr.x, sp.y - selection.anchorScr.y);
        let f = d / selection.startDist;
        if (!isFinite(f) || f <= 0) f = 0.02;
        f = Math.max(0.02, Math.min(60, f));
        const a = selection.anchorWorld;
        for (const o of selection.orig) {
            o.stroke.points = o.points.map(p => ({
                x: a.x + (p.x - a.x) * f,
                y: a.y + (p.y - a.y) * f,
                p: p.p
            }));
            o.stroke.size = Math.max(0.5, o.size * f);
        }
    } else if (selection.mode === 'rotate') {
        const ang = Math.atan2(sp.y - selection.centerScr.y, sp.x - selection.centerScr.x)
                  - selection.startAngle;
        const c = selection.centerWorld;
        const cos = Math.cos(ang), sin = Math.sin(ang);
        for (const o of selection.orig) {
            o.stroke.points = o.points.map(p => {
                const dx = p.x - c.x, dy = p.y - c.y;
                return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos, p: p.p };
            });
        }
    }

    selection.bbox = groupBBox(selection.strokes);
    delete layerCaches[selection.layerId];
    scheduleRender();
}

function selectionUp() {
    // отпустили рамку выделения: выбираем всё, что в неё попало
    if (selBand) {
        const layer = getLayer(selBand.layerId);
        const bx = Math.min(selBand.x0, selBand.x1);
        const by = Math.min(selBand.y0, selBand.y1);
        const bw = Math.abs(selBand.x1 - selBand.x0);
        const bh = Math.abs(selBand.y1 - selBand.y0);
        selBand = null;
        if (layer) {
            const picked = layer.strokes.filter(s => {
                const b = strokeBBox(s);
                return b.x < bx + bw && b.x + b.w > bx && b.y < by + bh && b.y + b.h > by;
            });
            selection = picked.length ? { layerId: layer.id, strokes: picked } : null;
            if (selection) selection.bbox = groupBBox(selection.strokes);
        }
        scheduleRender();
        return;
    }

    if (!selection || !selection.mode) return;
    if (selection.dirty) {
        history.push({
            type: 'transform',
            layerId: selection.layerId,
            entries: selection.orig.map(o => ({
                stroke: o.stroke,
                before: { points: o.points, size: o.size },
                after: snapshotStroke(o.stroke)
            }))
        });
        redoStack = [];
        updateHistoryButtons();
    }
    selection.mode = null;
    selection.bbox = groupBBox(selection.strokes);
    scheduleRender();
}

// рамка группы и растягиваемая рамка выделения — рисуются в конце render()
function drawSelection(g) {
    if (selBand) {
        const sx = (Math.min(selBand.x0, selBand.x1) - view.x) * view.zoom;
        const sy = (Math.min(selBand.y0, selBand.y1) - view.y) * view.zoom;
        const w = Math.abs(selBand.x1 - selBand.x0) * view.zoom;
        const h = Math.abs(selBand.y1 - selBand.y0) * view.zoom;
        g.save();
        g.strokeStyle = '#0073aa';
        g.fillStyle = 'rgba(0,115,170,0.08)';
        g.setLineDash([4, 4]);
        g.lineWidth = 1;
        g.fillRect(sx, sy, w, h);
        g.strokeRect(sx, sy, w, h);
        g.restore();
        return;
    }
    if (!selection) return;
    const h = selHandles();
    if (!h) return;
    g.save();
    g.strokeStyle = '#0073aa';
    g.fillStyle = '#fff';
    g.lineWidth = 1;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(h.corners[0].x, h.corners[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(h.corners[i].x, h.corners[i].y);
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    for (const q of h.corners) {
        g.beginPath();
        g.rect(q.x - HANDLE / 2, q.y - HANDLE / 2, HANDLE, HANDLE);
        g.fill(); g.stroke();
    }
    g.beginPath();
    g.moveTo(h.rot.x, h.rot.y + 6);
    g.lineTo((h.corners[0].x + h.corners[1].x) / 2,
             Math.min(h.corners[0].y, h.corners[1].y));
    g.stroke();
    g.beginPath();
    g.arc(h.rot.x, h.rot.y, 6, 0, Math.PI * 2);
    g.fill(); g.stroke();
    g.restore();
}
