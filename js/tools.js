
// --- Отрисовка текста на холсте комикса ---
function strokeText(g, s) {
    if (!s || !s.text || !s.points || s.points.length === 0) return;
    const pt = s.points[0];
    
    g.save();
    let styleStr = '';
    if (s.italic) styleStr += 'italic ';
    if (s.bold) styleStr += 'bold ';
    const size = s.size || 28;
    const family = s.family || "'Comic Relief', cursive, sans-serif";
    
    g.font = `${styleStr}${size}px ${family}`;
    g.fillStyle = s.color || '#000000';
    g.globalAlpha = (s.alpha !== undefined ? s.alpha : 1);
    g.textBaseline = 'top';
    
    // Поддержка многострочного текста
    const lines = s.text.split('\n');
    const lineHeight = size * 1.25;
    for (let i = 0; i < lines.length; i++) {
        g.fillText(lines[i], pt.x, pt.y + i * lineHeight);
    }
    g.restore();
}

// --- Рисование геометрических фигур для комиксов ---
function strokeShape(g, s) {
    if (!s || !s.points || s.points.length < 2) return;
    const p1 = s.points[0];
    const p2 = s.points[s.points.length - 1];

    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = s.size || 2;
    g.strokeStyle = s.color || '#000000';
    g.globalAlpha = (s.alpha !== undefined ? s.alpha : 1);

    g.beginPath();
    if (s.tool === 'line') {
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        g.stroke();
    } else if (s.tool === 'rect') {
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        g.strokeRect(x, y, w, h);
    } else if (s.tool === 'ellipse') {
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        if (rx > 0 && ry > 0) {
            g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            g.stroke();
        }
    }
    g.restore();
}

// =====================================================================
// SuverComicDraw — tools.js
// Кисти: strokeOne, размыватель (smudge), аэрограф (airbrush), заливка
// =====================================================================

// --- Базовый штрих (кисть, ластик, размытие) ---
// Один-единственный stroke через кривые по серединам сегментов:
// плавно и без перекрытий, поэтому полупрозрачная линия не темнеет пятнами.
function strokeOne(g, s) {
    const pts = s.points;
    if (!pts || pts.length === 0) return;

    // Средний нажим штриха — он задаёт плотность, а не толщину
    let sum = 0;
    for (const pt of pts) sum += (pt.p !== undefined ? pt.p : 1);
    const press = sum / pts.length;

    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = s.size;
    g.strokeStyle = s.color;

    if (s.tool === 'eraser') {
        g.globalCompositeOperation = 'destination-out';
    }
    if (s.tool === 'blur') {
        g.filter = 'blur(' + Math.max(2, s.size * 0.35) + 'px)';
        // блюр рассеивает краску — поднимаем плотность, чтобы след не таял слишком быстро
        g.globalAlpha = Math.min(1, s.alpha * press * 1.6);
    } else {
        g.globalAlpha = s.alpha * press;
    }


  

    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 1) {
        // Точка: крошечный отрезок, round cap сделает из него круг
        g.lineTo(pts[0].x + 0.01, pts[0].y);
    } else {
        const mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
        let m = mid(pts[0], pts[1]);
        g.quadraticCurveTo(pts[0].x, pts[0].y, m.x, m.y);
        for (let i = 1; i < pts.length - 1; i++) {
            m = mid(pts[i], pts[i + 1]);
            g.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
        }
        g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }

    g.stroke();
    g.restore();
}


// === Закрас: гладкая лента переменной ширины, плотный цвет ===
// === Закрас: гладкая лента переменной ширины, плотный цвет ===
function flatStroke(g, s) {
    const pts = s.points;
    if (!pts.length) return;

    g.save();
    

    g.fillStyle = s.color;
    g.globalAlpha = 1;

    const toScr = p => ({
        x: (p.x),
        y: (p.y),
        p: p.p !== undefined ? p.p : 1
    });

    if (pts.length === 1) {
        const q = toScr(pts[0]);
        g.beginPath();
        g.arc(q.x, q.y, Math.max(0.5, s.size * q.p / 2), 0, Math.PI * 2);
        g.fill();
        g.restore();
        return;
    }

    // сглаженная центральная линия: исходные точки + середины отрезков
    const P = pts.map(toScr);
    const path = [P[0]];
    for (let i = 1; i < P.length; i++) {
        path.push({ x: (P[i-1].x + P[i].x) / 2, y: (P[i-1].y + P[i].y) / 2,
                    p: (P[i-1].p + P[i].p) / 2 });
    }
    path.push(P[P.length - 1]);

    // конические кончики: первые и последние точки прижимаем
    // к нажиму из глубины штриха и дополнительно сужаем по нарастающей —
    // торец на конце ленты теперь гарантированно меньше тела
    const TAPER = 5;
    const n = path.length;
    if (n > TAPER + 1) {
        for (let i = 0; i < TAPER; i++) {
            path[i].p = Math.min(path[i].p, path[TAPER].p * (i + 1) / (TAPER + 1));
        }
        for (let i = n - TAPER; i < n; i++) {
            path[i].p = Math.min(path[i].p,
                path[n - 1 - TAPER].p * (n - i) / (TAPER + 1));
        }
    }


    // ширины: полутолщина в каждой точке пути
    let hw = path.map(q => Math.max(0.5, s.size * q.p) / 2);

    // сглаживаем ширину по всему пути, включая края
    const sm = hw.slice();
    for (let i = 0; i < hw.length; i++) {
        const a = hw[Math.max(0, i - 1)];
        const c = hw[Math.min(hw.length - 1, i + 1)];
        sm[i] = (a + hw[i] * 2 + c) / 4;
    }
    hw = sm;

    // лента: левая и правая кромки по нормалям
    const L = [], Rr = [];
    for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        let dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        L.push({ x: path[i].x - dy * hw[i], y: path[i].y + dx * hw[i] });
        Rr.push({ x: path[i].x + dy * hw[i], y: path[i].y - dx * hw[i] });
    }

    g.beginPath();
    g.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) g.lineTo(L[i].x, L[i].y);
    for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i].x, Rr[i].y);
    g.closePath();
    g.fill();

    // торцы по тем же сглаженным ширинам, что и лента
    g.beginPath();
    g.arc(path[0].x, path[0].y, hw[0], 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    const e = path[path.length - 1];
    g.arc(e.x, e.y, hw[hw.length - 1], 0, Math.PI * 2);
    g.fill();

    g.restore();
}


const MP_A0        = 0.35;  // базовая плотность штампа
const MP_SPEED_MAX = 8;     // px за сегмент: скорость «максимально быстро»
const MP_SIZE_MIN  = 0.15;  // минимальный радиус в долях базового
const MP_STEP      = 0.12;  // шаг штампов в долях радиуса

function mpHex(a) {
    return ('0' + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16)).slice(-2);
}

// === Мягкая кисть: линия с размытой тенью (координаты — мировые) ===
function softStroke(g, s) {
    const pts = s.points;
    if (!pts || !pts.length) return;

    let sum = 0;
    for (const pt of pts) sum += (pt.p !== undefined ? pt.p : 1);
    const press = sum / pts.length;

    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(0.5, s.size);
    g.strokeStyle = s.color;
    g.shadowColor = s.color;
    g.shadowBlur = s.size * 1.5;
    g.globalAlpha = s.alpha * press;

    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 1) {
        g.lineTo(pts[0].x + 0.01, pts[0].y);
    } else {
        const mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
        let m = mid(pts[0], pts[1]);
        g.quadraticCurveTo(pts[0].x, pts[0].y, m.x, m.y);
        for (let i = 1; i < pts.length - 1; i++) {
            m = mid(pts[i], pts[i + 1]);
            g.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
        }
        g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }

    g.stroke();
    g.restore();
}

// === Панель комикса: жёсткий прямоугольник без сглаживания ===
function panelStroke(g, s) {
    const pts = s.points;
    if (!pts || pts.length < 4) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(0.5, s.size);
    g.strokeStyle = s.color;
    g.globalAlpha = s.alpha !== undefined ? s.alpha : 1;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.stroke();
    g.restore();
}


// === MyPaint basic smudging: тянет цвет из-под кисти ===
const MP_SMUDGE     = 0.65; // сколько тянем холст 0..1
const MP_SMUDGE_LEN = 0.25; // как быстро кисть пачкается

function hex2rgb(h) {
    if (typeof h !== 'string') return [0,0,0];
    h = h.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(h)) {
        return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    }
    if (/^#[0-9a-fA-F]{3}$/.test(h)) {
        return [parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16), parseInt(h[3]+h[3],16)];
    }
    return [0,0,0];
}
function toHexByte(v) {
    v = Math.round(v);
    if (!isFinite(v)) v = 0;
    v = Math.max(0, Math.min(255, v));
    return ('0' + v.toString(16)).slice(-2);
}
function rgb2hex(r,g,b) { return '#' + toHexByte(r) + toHexByte(g) + toHexByte(b); }

function mypaintCreate(color, R, seed, srcData) {
    R = Math.max(4, R);
    const buf = document.createElement('canvas');
    buf.width = W; buf.height = H;
    const bg = buf.getContext('2d', { willReadFrequently: true });

    const brush = hex2rgb(color);
    let loaded = brush.slice();
    let vSmooth = 0;

    function pick(x, y) {
        if (!srcData || !srcData.length) return null;
        x = Math.max(0, Math.min(W - 1, x | 0));
        y = Math.max(0, Math.min(H - 1, y | 0));
        const i = (y * W + x) * 4;
        if (i < 0 || i + 3 >= srcData.length) return null;
        const r = srcData[i], g = srcData[i+1], b = srcData[i+2], a = srcData[i+3];
        if (!isFinite(r+g+b+a)) return null;
        return [r, g, b, a];
    }

    function dab(x, y, r, a, p) {
        r = Math.max(2, r);
        if (p === undefined || p === null || !isFinite(p)) p = 1;
        const picked = pick(x, y);
        if (picked && picked[3] > 8) {
            const k = MP_SMUDGE_LEN * (1.2 - Math.min(1, Math.max(0, p)) * 0.6);
            loaded[0] += (picked[0] - loaded[0]) * k;
            loaded[1] += (picked[1] - loaded[1]) * k;
            loaded[2] += (picked[2] - loaded[2]) * k;
        }
        const m = MP_SMUDGE * (1 - Math.min(1, Math.max(0, p)) * 0.5);
        let fr = brush[0] * (1 - m) + loaded[0] * m;
        let fg = brush[1] * (1 - m) + loaded[1] * m;
        let fb = brush[2] * (1 - m) + loaded[2] * m;
        if (!isFinite(fr+fg+fb)) { fr = brush[0]; fg = brush[1]; fb = brush[2]; }
        const col = rgb2hex(fr, fg, fb);

        const g2 = bg.createRadialGradient(x, y, 0, x, y, r);
        g2.addColorStop(0.00, col + mpHex(a));
        g2.addColorStop(0.50, col + mpHex(a * 0.7));
        g2.addColorStop(0.85, col + mpHex(a * 0.15));
        g2.addColorStop(1.00, col + '00');
        bg.fillStyle = g2;
        bg.beginPath();
        bg.arc(x, y, r, 0, Math.PI * 2);
        bg.fill();
    }

    function along(p1, p2) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        const pAvg = ((p1.p !== undefined ? p1.p : 1) +
                      (p2.p !== undefined ? p2.p : 1)) / 2;
        const r = R * (MP_SIZE_MIN + (1 - MP_SIZE_MIN) * pAvg);
        vSmooth = vSmooth * 0.7 + dist * 0.3;
        const k = Math.min(1, vSmooth / MP_SPEED_MAX);
        const a = MP_A0 * (1 - 0.4 * k) * pAvg;
        const step = Math.max(1.5, r * MP_STEP);
        const n = Math.max(1, Math.ceil(dist / step));
        for (let j = 1; j <= n; j++) {
            const t = j / n;
            dab(p1.x + dx * t, p1.y + dy * t, r, a, pAvg);
        }
    }

    return { R: R, step: MP_STEP, buf: buf, dab: dab, along: along };
}

// Кеш живого штриха: буфер пересоздаётся не на каждый кадр,
// а лишь при новом штрихе; за кадр дорисовываются только новые точки.
let mpLive = null;

function mypaintStroke(g, s) {
    const pts = s.points;
    if (!pts.length) return;
    const R = Math.max(4, s.size * view.zoom / 2);

    // ключ: тот же ли это штрих (цвет, размер, зерно, вид)
    const key = [s.color, s.size, s.seed, view.zoom, view.x, view.y].join('|');

    if (mpLive && mpLive.key === key && pts.length === mpLive.n) {
        // ничего нового — просто показываем уже готовый буфер
    } else if (mpLive && mpLive.key === key && pts.length > mpLive.n) {
        // штрих подрос: доклеиваем только новые сегменты
        for (let i = mpLive.n; i < pts.length; i++) {
            mpLive.eng.along(
                { x: (pts[i - 1].x - view.x) * view.zoom, y: (pts[i - 1].y - view.y) * view.zoom,
                  p: pts[i - 1].p },
                { x: (pts[i].x - view.x) * view.zoom, y: (pts[i].y - view.y) * view.zoom,
                  p: pts[i].p }
            );
        }
        mpLive.n = pts.length;
    } else {
        // новый штрих (или вернулся из истории): строим с нуля
        // Снапшот берём ТОЛЬКО для живого штриха из готового кеша,
        // чтобы не уйти в рекурсию getLayerCanvas -> drawStrokes -> mypaintStroke.
        let srcData = null;
        try {
            if (typeof current !== 'undefined' && s === current) {
                const layer = getLayer(s.layerId);
                const cached = layer ? layerCaches[layer.id] : null;
                if (cached && cached.width === W && cached.height === H) {
                    srcData = cached.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
                }
            }
        } catch (e) { srcData = null; }

        const eng = mypaintCreate(s.color, R, s.seed, srcData);
        const p0 = pts[0].p !== undefined ? pts[0].p : 1;
        eng.dab((pts[0].x - view.x) * view.zoom, (pts[0].y - view.y) * view.zoom,
                eng.R * p0, MP_A0 * p0, p0);
        for (let i = 1; i < pts.length; i++) {
            eng.along(
                { x: (pts[i - 1].x - view.x) * view.zoom, y: (pts[i - 1].y - view.y) * view.zoom,
                  p: pts[i - 1].p },
                { x: (pts[i].x - view.x) * view.zoom, y: (pts[i].y - view.y) * view.zoom,
                  p: pts[i].p }
            );
        }
        mpLive = { key: key, eng: eng, n: pts.length };
    }

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = s.alpha;
    g.drawImage(mpLive.eng.buf, 0, 0);
    g.restore();
}

// =====================================================================
// Мел / пастель: зернистый штрих из случайных песчинок
// Детерминированный: seed штриха задаёт разброс — undo рисует то же.
// =====================================================================
const CH_DOT_R = 0.18;
const CH_DOTS  = 40;
const CH_STEP  = 0.35;

// сеяный генератор: одинаковая «случайность» при каждом воспроизведении
function mulberry32(seed) {
    let a = (seed || 1) >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function chalkCreate(color, R, seed) {
    R = Math.max(2, R);
    const buf = document.createElement('canvas');
    buf.width = W; buf.height = H;
    const bg = buf.getContext('2d');
    const rnd = mulberry32(seed);

    bg.fillStyle = color;   // ← параметр функции, не s.color


    function dab(x, y) {
        // мягкое ядро — тело штриха
        bg.globalAlpha = 0.22;
        bg.beginPath();
        bg.arc(x, y, R * 0.55, 0, Math.PI * 2);
        bg.fill();


        // зерно поверх ядра
        for (let i = 0; i < CH_DOTS; i++) {
            const ang = rnd() * Math.PI * 2;
            const rr = R * Math.pow(rnd(), 2.2);   // кучнее к центру
            const dr = Math.max(0.8, R * CH_DOT_R * (0.5 + rnd() * 0.7));
            bg.globalAlpha = 0.25 + rnd() * 0.45;  // заметная, но живая плотность
            bg.beginPath();
            bg.arc(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, dr, 0, Math.PI * 2);
            bg.fill();
        }
        bg.globalAlpha = 1;
    }


    function along(p1, p2) {
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const step = Math.max(2, R * CH_STEP);
        const n = Math.max(1, Math.ceil(dist / step));
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            dab(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t);
        }
    }

    return { R: R, step: CH_STEP, buf: buf, dab: dab, along: along };
}

function chalkStroke(g, s) {
    const pts = s.points;
    if (!pts.length) return;
    const R = Math.max(2, s.size * view.zoom / 2);
    const eng = chalkCreate(s.color, R, s.seed);

    eng.dab((pts[0].x - view.x) * view.zoom, (pts[0].y - view.y) * view.zoom);
    for (let i = 1; i < pts.length; i++) {
        eng.along(
            { x: (pts[i - 1].x - view.x) * view.zoom, y: (pts[i - 1].y - view.y) * view.zoom },
            { x: (pts[i].x - view.x) * view.zoom, y: (pts[i].y - view.y) * view.zoom }
        );
    }

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = s.alpha;
    g.drawImage(eng.buf, 0, 0);
    g.restore();
}


// === Диспетчер воспроизведения штрихов ===
function drawStrokes(g, strokes) {
    for (const s of strokes) {
        if (s.tool === 'text') {
            strokeText(g, s);
            continue;
        }
        if (s.tool === 'line' || s.tool === 'rect' || s.tool === 'ellipse') {
            strokeShape(g, s);
            continue;
        }
        if (s.tool === 'image' && s.img) {
            g.drawImage(s.img, s.x, s.y, s.w, s.h);
            continue;
        }
        if (s.tool === 'fill') floodFill(g, s);
        else if (s.tool === 'soft') softStroke(g, s);
        else if (s.tool === 'chalk') chalkStroke(g, s);
        else if (s.tool === 'flat') flatStroke(g, s);
        else if (s.tool === 'smudge') mypaintStroke(g, s);
        else if (s.tool === 'airbrush') airbrushStroke(g, s);
        else if (s.tool === 'panel') panelStroke(g, s);
        else if (s.tool === 'raster') g.drawImage(s.image, 0, 0);
        else if (s.tool === 'baked') {
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.drawImage(s.image, 0, 0);
            g.restore();
        }
        else strokeOne(g, s);
    }
}


// --- Маркер: полупрозрачный мазок, темнеющий при пересечении штрихов ---
// Профиль почти плоский: красится всё пятно равномерно, край коротко тает.
const MK_A0   = 0.45;   // плотность мазка: гуще — крути тут
const MK_STEP = 0.20;   // шаг штампов в долях радиуса

function airbrushCreate(color, R, seed) {
    R = Math.max(4, R);
    const buf = document.createElement('canvas');
    buf.width = W; buf.height = H;
    const bg = buf.getContext('2d');

    const step = Math.max(2, R * MK_STEP);

    function dab(x, y) {
        const g = bg.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0.00, color + '73');   // 0.45 — плоское ядро
        g.addColorStop(0.65, color + '73');   // держим до 65% радиуса
        g.addColorStop(1.00, color + '00');   // короткий тающий край
        bg.fillStyle = g;
        bg.beginPath();
        bg.arc(x, y, R, 0, Math.PI * 2);
        bg.fill();
    }

    function along(p1, p2) {
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const n = Math.max(1, Math.ceil(dist / step));
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            dab(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t);
        }
    }

    return { R: R, step: step, buf: buf, dab: dab, along: along };
}




// Воспроизведение аэрографного штриха: тот же seed — пиксель в пиксель
function airbrushStroke(g, s) {
    const pts = s.points;
    if (!pts.length) return;
    const R = Math.max(4, s.size * view.zoom / 2);
    const eng = airbrushCreate(s.color, R, s.seed);

    eng.dab((pts[0].x - view.x) * view.zoom, (pts[0].y - view.y) * view.zoom);
    for (let i = 1; i < pts.length; i++) {
        eng.along(
            { x: (pts[i - 1].x - view.x) * view.zoom, y: (pts[i - 1].y - view.y) * view.zoom },
            { x: (pts[i].x - view.x) * view.zoom, y: (pts[i].y - view.y) * view.zoom }
        );
    }

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = s.alpha;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(eng.buf, 0, 0);
    g.restore();
}

// === ЗАЛИВКА ОБЛАСТИ (flood fill) ===
function floodFill(g, s) {
    const wp = s.points[0];
    const x0 = Math.floor((wp.x - view.x) * view.zoom);
    const y0 = Math.floor((wp.y - view.y) * view.zoom);
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;

    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const start = (y0 * W + x0) * 4;
    const tr = d[start], tgr = d[start + 1], tb = d[start + 2], ta = d[start + 3];

    const fr = parseInt(s.color.slice(1, 3), 16);
    const fg = parseInt(s.color.slice(3, 5), 16);
    const fb = parseInt(s.color.slice(5, 7), 16);
    const fa = Math.round(s.alpha * 255);

    if (Math.abs(tr - fr) < 2 && Math.abs(tgr - fg) < 2 && Math.abs(tb - fb) < 2 && Math.abs(ta - fa) < 2) return;

    const visited = new Uint8Array(W * H);
    const stack = [y0 * W + x0];

    function match(i4) {
        return Math.abs(d[i4] - tr) <= TOL &&
               Math.abs(d[i4 + 1] - tgr) <= TOL &&
               Math.abs(d[i4 + 2] - tb) <= TOL &&
               Math.abs(d[i4 + 3] - ta) <= TOL;
    }

    while (stack.length) {
        const idx = stack.pop();
        if (visited[idx]) continue;
        visited[idx] = 1;
        const i4 = idx * 4;
        if (!match(i4)) continue;
        d[i4] = fr; d[i4 + 1] = fg; d[i4 + 2] = fb; d[i4 + 3] = fa;
        const x = idx % W, y = (idx - x) / W;
        if (x > 0) stack.push(idx - 1);
        if (x < W - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - W);
        if (y < H - 1) stack.push(idx + W);
    }
    g.putImageData(img, 0, 0);
}

// === РАСКАДРОВКА: шаблоны страниц комикса ===
const PANEL_TEMPLATES = {
    grid2x2: [
        { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    ],
    rows3: [
        { x: 0, y: 0, w: 1, h: 0.333 },
        { x: 0, y: 0.333, w: 1, h: 0.333 },
        { x: 0, y: 0.666, w: 1, h: 0.334 }
    ],
    splash2: [
        { x: 0, y: 0, w: 1, h: 0.55 },
        { x: 0, y: 0.55, w: 0.5, h: 0.45 },
        { x: 0.5, y: 0.55, w: 0.5, h: 0.45 }
    ],
    grid3x3: [
        { x: 0, y: 0, w: 0.333, h: 0.333 }, { x: 0.333, y: 0, w: 0.333, h: 0.333 }, { x: 0.666, y: 0, w: 0.333, h: 0.333 },
        { x: 0, y: 0.333, w: 0.333, h: 0.333 }, { x: 0.333, y: 0.333, w: 0.333, h: 0.333 }, { x: 0.666, y: 0.333, w: 0.333, h: 0.333 },
        { x: 0, y: 0.666, w: 0.333, h: 0.333 }, { x: 0.333, y: 0.666, w: 0.333, h: 0.333 }, { x: 0.666, y: 0.666, w: 0.333, h: 0.333 }
    ],
    asym: [
        { x: 0, y: 0, w: 1, h: 0.28 },
        { x: 0, y: 0.28, w: 0.48, h: 0.44 },
        { x: 0.48, y: 0.28, w: 0.52, h: 0.44 },
        { x: 0, y: 0.72, w: 1, h: 0.28 }
    ],
    diagonal_split: [
        { polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.35 }, { x: 0, y: 0.65 }] },
        { polygon: [{ x: 0, y: 0.68 }, { x: 1, y: 0.38 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
    ],
    manga_action: [
        { x: 0, y: 0, w: 1, h: 0.28 },
        { polygon: [{ x: 0, y: 0.30 }, { x: 0.58, y: 0.30 }, { x: 0.42, y: 0.70 }, { x: 0, y: 0.70 }] },
        { polygon: [{ x: 0.60, y: 0.30 }, { x: 1, y: 0.30 }, { x: 1, y: 0.70 }, { x: 0.44, y: 0.70 }] },
        { x: 0, y: 0.72, w: 1, h: 0.28 }
    ],
    manga_diagonal3: [
        { polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.28 }, { x: 0, y: 0.38 }] },
        { polygon: [{ x: 0, y: 0.40 }, { x: 1, y: 0.30 }, { x: 1, y: 0.65 }, { x: 0, y: 0.75 }] },
        { polygon: [{ x: 0, y: 0.77 }, { x: 1, y: 0.67 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
    ],
    shonen_slash: [
        { polygon: [{ x: 0, y: 0 }, { x: 0.52, y: 0 }, { x: 0.35, y: 0.52 }, { x: 0, y: 0.52 }] },
        { polygon: [{ x: 0.54, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.52 }, { x: 0.37, y: 0.52 }] },
        { polygon: [{ x: 0, y: 0.54 }, { x: 0.65, y: 0.54 }, { x: 0.48, y: 1 }, { x: 0, y: 1 }] },
        { polygon: [{ x: 0.67, y: 0.54 }, { x: 1, y: 0.54 }, { x: 1, y: 1 }, { x: 0.50, y: 1 }] }
    ]
};

function insertTemplate(name) {
    const rects = PANEL_TEMPLATES[name];
    if (!rects) return;

    // Выбираем или создаем подходящий растровый слой
    let layer = getLayer(activeLayerId);
    if (!layer || layer.type === 'text' || layer.textItem) {
        layer = layers.slice().reverse().find(l => l && l.type !== 'text' && !l.textItem);
    }
    if (!layer) {
        layer = {
            id: nextLayerId++,
            name: 'Кадры комикса',
            visible: true,
            opacity: 1,
            blendMode: 'source-over',
            strokes: []
        };
        layers.push(layer);
        activeLayerId = layer.id;
        if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) {
            layersModule.renderLayersList();
        }
    }

    // Рассчитываем размер страницы комикса в видимой области
    const margin = 40;
    const gap = 14;
    const pw = Math.max(500, (W / view.zoom) - margin * 2);
    const ph = Math.max(700, (H / view.zoom) - margin * 2);
    const startX = view.x + margin;
    const startY = view.y + margin;

    const strokeColor = colorInput ? colorInput.value : '#000000';
    const strokeSize = Number(thicknessInput ? thicknessInput.value : 3) || 3;
    const strokes = [];

    for (const r of rects) {
        if (r.polygon) {
            const pts = r.polygon.map(p => ({
                x: startX + p.x * pw,
                y: startY + p.y * ph,
                p: 1
            }));
            pts.push({ x: pts[0].x, y: pts[0].y, p: 1 });
            strokes.push({
                layerId: layer.id,
                tool: 'panel',
                color: strokeColor,
                size: strokeSize,
                alpha: 1,
                points: pts
            });
        } else {
            const x = startX + r.x * pw + gap / 2;
            const y = startY + r.y * ph + gap / 2;
            const w = r.w * pw - gap;
            const h = r.h * ph - gap;
            strokes.push({
                layerId: layer.id,
                tool: 'panel',
                color: strokeColor,
                size: strokeSize,
                alpha: 1,
                points: [
                    { x: x, y: y, p: 1 },
                    { x: x + w, y: y, p: 1 },
                    { x: x + w, y: y + h, p: 1 },
                    { x: x, y: y + h, p: 1 },
                    { x: x, y: y, p: 1 }
                ]
            });
        }
    }

    layer.strokes = layer.strokes.concat(strokes);
    history.push({ type: 'addMulti', layerId: layer.id, strokes: strokes });
    redoStack = [];
    delete layerCaches[layer.id];
    isProjectDirty = true;
    render();
    if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
}

document.getElementById('panel-templates').addEventListener('change', function () {
    if (this.value) insertTemplate(this.value);
    this.value = '';
});








// === Фигуры для комиксов: линия, прямоугольник (кадр), эллипс (бабл) ===

