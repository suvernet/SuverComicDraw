// =====================================================================
// SuverComicDraw — hotkeys.js
// Горячие клавиши
// =====================================================================

// Поиск кнопки тулбара по кусочку подсказки, подписи или data-атрибуту.
// Если не нашлась — печатаем в консоль все кнопки с их title,
// чтобы сразу было видно, как они подписаны на самом деле.
function findButton(words, label) {
    const btns = document.querySelectorAll('#controls button');
    for (const b of btns) {
        const text = ((b.title || '') + ' ' +
            (b.getAttribute('aria-label') || '') + ' ' +
            (b.dataset.tool || '') + ' ' +
            (b.textContent || '')).toLowerCase();
        for (const w of words) {
            if (text.indexOf(w) !== -1) return b;
        }
    }
    console.warn('SuverComicDraw: не нашёл кнопку для «' + label + '». ' +
        'Найдено кнопок в тулбаре: ' + btns.length);
    btns.forEach(function (b, i) {
        console.warn('  ' + i + ': title="' + (b.title || '—') +
            '", текст="' + (b.textContent || '').trim() + '"');
    });
    return null;
}



const TOOL_KEYS = {
    'KeyT': ['текст', 'text'],
    'KeyB': ['кисть', 'brush'],
    'KeyL': ['линия', 'line'],
    'KeyR': ['прямоугольник', 'rect'],
    'KeyO': ['эллипс', 'ellipse'],
    'KeyV': ['закрас', 'flat'],
    'KeyC': ['мел', 'chalk'],
    'KeyE': ['ластик', 'eraser'],
    'KeyS': ['смадж', 'smudge', 'палец'],
    'KeyA': ['аэрограф', 'airbrush'],
    'KeyF': ['заливка', 'fill', 'ведро'],
    'KeyG': ['размытие', 'blur']
};

window.addEventListener('keydown', function (e) {
    // Не мешаем только текстовому вводу: поле цвета и селект фона.
    // Ползунки (range) фокус НЕ отбирают — хоткеи работают всегда.
    const t = e.target;
    if (t) {
        if (t.tagName === 'TEXTAREA') return;
        if (t.tagName === 'INPUT' && t.type !== 'range') return;
        if (t.tagName === 'SELECT') return;
    }

    // --- Undo / Redo / Сохранение ---
    if (e.ctrlKey || e.metaKey) {
        if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
            e.preventDefault(); redo(); return;
        }
        if (e.code === 'KeyS') { e.preventDefault(); savePngBtn.click(); return; }
        return;
    }

    // --- Прозрачность: Shift+[ / Shift+] ---
    if (e.shiftKey && e.code === 'BracketLeft') {
        opacityInput.value = Math.max(0.05, (Number(opacityInput.value) - 0.1).toFixed(1));
        opacityInput.dispatchEvent(new Event('input'));
        return;
    }
    if (e.shiftKey && e.code === 'BracketRight') {
        opacityInput.value = Math.min(1, (Number(opacityInput.value) + 0.1).toFixed(1));
        opacityInput.dispatchEvent(new Event('input'));
        return;
    }

    if (e.code === 'KeyM') {
    if (!selection || !selection.strokes || selection.strokes.length === 0) return;
    e.preventDefault();
    const axis = e.shiftKey ? 'V' : 'H';
    mirrorSelection(axis);
    return;
}


    // --- Очистка холста: D ---
        if (e.code === 'KeyD') {
        const b = findButton(
            ['очист', 'стереть', 'мусор', 'корзин', 'clear', 'удалит', 'trash', 'bin'],
            'очистка холста (D)');
        if (b) { e.preventDefault(); b.click(); }
        return;
    }


    // --- Инструменты ---
    if (TOOL_KEYS[e.code]) {
        const b = findButton(TOOL_KEYS[e.code], e.code);
        if (b) { e.preventDefault(); b.click(); }
        return;
    }


    // --- Размер кисти: [ и ] , шаг 1 ---
    if (e.code === 'BracketLeft') {
        thicknessInput.value = Math.max(1, Number(thicknessInput.value) - 1);
        thicknessInput.dispatchEvent(new Event('input'));
        return;
    }
    if (e.code === 'BracketRight') {
        thicknessInput.value = Number(thicknessInput.value) + 1;
        thicknessInput.dispatchEvent(new Event('input'));
        return;
    }
});


// --- Быстрое добавление горячих клавиш для слоев ---
document.addEventListener('keydown', (e) => {
    if (e.shiftKey) {
        const activeLayer = layers.find(l => l.id === activeLayerId);
        if (!activeLayer) return;

        let modeChanged = false;
        if (e.key.toLowerCase() === 'm') {
            activeLayer.blendMode = 'multiply';
            modeChanged = true;
        } else if (e.key.toLowerCase() === 's') {
            activeLayer.blendMode = 'screen';
            modeChanged = true;
        } else if (e.key.toLowerCase() === 'n') {
            activeLayer.blendMode = 'source-over';
            modeChanged = true;
        }

        if (modeChanged) {
            e.preventDefault();
            // Синхронизируем UI
            const modeSelect = document.getElementById('layer-blend-mode-global');
            if (modeSelect) modeSelect.value = activeLayer.blendMode;
            
            // Перерисовываем и обновляем кэш
            if (typeof layerCaches !== 'undefined') delete layerCaches[activeLayer.id];
            if (typeof render === 'function') render();
        }
    }
});
