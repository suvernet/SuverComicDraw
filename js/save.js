// =====================================================================
// SuverComicDraw — save.js
// Экспорт: PNG (вид целиком) и SVG (вектор, где возможно)
// =====================================================================

const savePngBtn = document.getElementById('save-png');
const saveSvgBtn = document.getElementById('save-svg');



// --- Путь SVG из точек штриха ---
function pathFor(s, color, filterId, width, opacity) {
    let d = 'M ' + s.points[0].x + ' ' + s.points[0].y;
    for (let i = 1; i < s.points.length; i++) d += ' L ' + s.points[i].x + ' ' + s.points[i].y;
    let style = 'stroke="' + color + '" stroke-width="' + width +
        '" fill="none" stroke-linecap="round" stroke-linejoin="round"';
    if (opacity < 1) style += ' stroke-opacity="' + opacity + '"';
    if (filterId) style += ' filter="url(#' + filterId + ')"';
    return '<path d="' + d + '" ' + style + '/>';
}

// --- SVG: вектор для кисти/ластика/аэрографа/размытия,
//     растровая вставка для заливки, смаджа и запечённых штрихов ---
if (saveSvgBtn) {
saveSvgBtn.addEventListener('click', function () {
    let defs = '';
    let body = '';
    let airbrushCount = 0;
    const vw = W / view.zoom, vh = H / view.zoom;

    for (const layer of layers) {
        let g = '<g id="layer-' + layer.id + '" data-name="' + layer.name + '"';
        if (!layer.visible) g += ' display="none"';
        g += '>';

        // Слои с "неточными" штрихами (fill, smudge, baked) — целиком картинкой
        if (layer.strokes.some(function (s) {
            return s.tool === 'fill' || s.tool === 'smudge' || s.tool === 'baked';
        })) {
            if (layer.visible) {
                const dataUrl = getLayerCanvas(layer).toDataURL('image/png');
                body += g + '<image x="' + view.x + '" y="' + view.y +
                    '" width="' + vw + '" height="' + vh + '" href="' + dataUrl + '"/></g>';
            } else {
                body += g + '</g>';
            }
            continue;
        }

        if (layer.visible) {
            // Ластик реализуем SVG-маской: белая плоскость минус чёрные штрихи
            const erasers = layer.strokes.filter(function (s) {
                return s.tool === 'eraser' && s.points.length > 1;
            });
            let maskAttr = '';
            if (erasers.length > 0) {
                const maskId = 'mask-layer-' + layer.id;
                let m = '<mask id="' + maskId + '">';
                m += '<rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>';
                for (const s of erasers) m += pathFor(s, '#000000', '', s.size, 1);
                m += '</mask>';
                defs += m;
                maskAttr = ' mask="url(#' + maskId + ')"';
            }
            g = '<g id="layer-' + layer.id + '" data-name="' + layer.name + '"' + maskAttr;
            if (!layer.visible) g += ' display="none"';
            g += '>';

            for (const s of layer.strokes) {
                if (s.points.length < 2 || s.tool === 'eraser') continue;

                // средний нажим штриха — общий для всех инструментов
                const avgP = s.points.reduce(function (a, pt) { return a + (pt.p || 1); }, 0) / s.points.length;

                if (s.tool === 'airbrush') {
                    airbrushCount++;
                    const fid = 'airb-' + airbrushCount;
                    defs += '<filter id="' + fid + '" x="-50%" y="-50%" width="200%" height="200%">' +
                        '<feGaussianBlur stdDeviation="' + (s.size * 0.35) + '"/></filter>';
                    g += pathFor(s, s.color, fid, s.size, s.alpha * 0.5);
                } else if (s.tool === 'blur') {
                    if (defs.indexOf('blur-main') === -1) {
                        defs += '<filter id="blur-main" x="-50%" y="-50%" width="200%" height="200%">' +
                            '<feGaussianBlur stdDeviation="5"/></filter>';
                    }
                    g += pathFor(s, s.color, 'blur-main', s.size, s.alpha * avgP);
                } else {
                    g += pathFor(s, s.color, '', s.size, s.alpha * avgP);
                }
            }
        }
        g += '</g>';
        body += g;
    }

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + vw + '" height="' + vh +
        '" viewBox="' + view.x + ' ' + view.y + ' ' + vw + ' ' + vh + '">';
    svg += '<defs>' + defs + '</defs>';
    if (hasBackground) {
        svg += '<rect x="' + view.x + '" y="' + view.y + '" width="' + vw +
            '" height="' + vh + '" fill="' + bgColorInput.value + '"/>';
    }
    svg += body;
    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    savedImg.src = url;
    downloadLink.href = url;
    downloadLink.download = 'drawing.svg';
    saveOverlay.style.display = 'flex';
});



// --- JPG: как PNG, но с заливкой фона (у JPEG нет прозрачности) ---
const saveJpgBtn = document.getElementById('save-jpg');
saveJpgBtn.addEventListener('click', function () {
    render();

    // Временный холст: сначала белый фон, поверх — кадр
    const jc = document.createElement('canvas');
    jc.width = W; jc.height = H;
    const jg = jc.getContext('2d');
    jg.fillStyle = '#ffffff';
    jg.fillRect(0, 0, W, H);
    jg.drawImage(c, 0, 0);

    const data = jc.toDataURL('image/jpeg', 0.92);
    savedImg.src = data;
    downloadLink.href = data;
    downloadLink.download = 'drawing.jpg';
    saveOverlay.style.display = 'flex';
});

}