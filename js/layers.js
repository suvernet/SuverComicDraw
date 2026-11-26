// =====================================================================
// SuverComicDraw — js/layers.js
// Управление слоями в стиле GIMP:
// - Верхний блок: Режим наложения и Непрозрачность активного слоя (ползунок + числовое поле)
// - Список слоёв с превью-миниатюрами холста, глазком видимости, именем и индикаторами
// - Нижний тулбар: Новый слой, Поднять, Опустить, Дублировать, Объединить с нижним, Удалить, Объединить все
// =====================================================================

(function() {
    if (window._layersPanelDone) return;
    window._layersPanelDone = true;

    // Проверка глобальных переменных
    const validateGlobals = () => {
        if (!Array.isArray(layers)) throw new Error('Глобальная переменная "layers" должна быть массивом.');
        if (typeof activeLayerId !== 'number') throw new Error('"activeLayerId" должен быть числом.');
        if (typeof nextLayerId !== 'number') throw new Error('"nextLayerId" должен быть числом.');
    };

    /**
     * Создает или обновляет миниатюру (превью) содержимого слоя
     */
    function updateLayerThumbnail(layer, canvasEl) {
        if (!canvasEl) return;
        const tw = 36;
        const th = 28;
        canvasEl.width = tw;
        canvasEl.height = th;
        const g = canvasEl.getContext('2d');
        g.clearRect(0, 0, tw, th);

        // Рисуем шахматную подложку прозрачности
        const sz = 4;
        for (let y = 0; y < th; y += sz) {
            for (let x = 0; x < tw; x += sz) {
                g.fillStyle = ((Math.floor(x / sz) + Math.floor(y / sz)) % 2 === 0) ? '#ffffff' : '#dcdcdc';
                g.fillRect(x, y, sz, sz);
            }
        }

        // Если у слоя есть штрихи или кэш — отрисовываем масштабированную копию
        try {
            if (layer.strokes && layer.strokes.length > 0) {
                // Если есть кэш getLayerCanvas
                let srcCanvas = null;
                if (typeof getLayerCanvas === 'function') {
                    srcCanvas = getLayerCanvas(layer);
                } else if (typeof layerCaches !== 'undefined' && layerCaches[layer.id]) {
                    srcCanvas = layerCaches[layer.id];
                }

                if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
                    g.drawImage(srcCanvas, 0, 0, tw, th);
                } else if (typeof drawStrokes === 'function') {
                    // Fallback прямая отрисовка штрихов
                    g.save();
                    const scale = Math.min(tw / (typeof W !== 'undefined' ? W : 800), th / (typeof H !== 'undefined' ? H : 600));
                    g.scale(scale, scale);
                    drawStrokes(g, layer.strokes);
                    g.restore();
                }
            }
        } catch (e) {
            console.warn('Не удалось создать превью слоя:', e);
        }
    }

    /**
     * Рендерит список слоёв в панели управления и синхронизирует верхние контролы GIMP
     */
    function renderLayersList() {
        try {
            validateGlobals();

            const list = document.getElementById('layers-list');
            if (!list) return;

            list.innerHTML = '';

            // Отображаем слои сверху вниз (как в GIMP/Photoshop: верхний слой в стопке находится вверху списка)
            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                if (!layer || !layer.id) continue;

                const row = createLayerRow(layer, i);
                list.appendChild(row);
            }

            highlightActiveLayer(list);
            syncTopControlsWithActiveLayer();
            updateToolbarButtonsState();
        } catch (e) {
            console.error('Ошибка при рендере слоёв:', e);
        }
    }

    /**
     * Создаёт элемент строки слоя в стиле GIMP
     */
    function createLayerRow(layer, index) {
        const row = document.createElement('div');
        row.className = 'gimp-layer-row';
        row.setAttribute('data-layer-id', layer.id);
        if (layer.visible === false) row.classList.add('hidden-layer');

        const isTextLayer = layer.type === 'text' || layer.textItem || (layer.strokes && layer.strokes.some(s => s && s.tool === 'text')) || (layer.name && layer.name.startsWith('Текст:'));
        if (isTextLayer) {
            layer.type = 'text';
            row.setAttribute('data-layer-type', 'text');
        }

        // 1. Глазок видимости (GIMP eye icon)
        const eyeBtn = document.createElement('button');
        eyeBtn.type = 'button';
        eyeBtn.className = 'gimp-layer-eye-btn';
        eyeBtn.title = layer.visible === false ? 'Показать слой' : 'Скрыть слой';
        eyeBtn.innerHTML = `<svg viewBox="0 0 24 24" class="gimp-eye-icon" width="16" height="16" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
        </svg>`;
        if (layer.visible === false) {
            eyeBtn.classList.add('eye-hidden');
        }
        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            if (layer.visible) {
                eyeBtn.classList.remove('eye-hidden');
                row.classList.remove('hidden-layer');
            } else {
                eyeBtn.classList.add('eye-hidden');
                row.classList.add('hidden-layer');
            }
            if (typeof render === 'function') render();
            if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
        });

        // 2. Превью-миниатюра слоя
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.className = 'gimp-layer-thumb';
        thumbCanvas.title = 'Миниатюра слоя';
        updateLayerThumbnail(layer, thumbCanvas);

        // 3. Бэйдж если это текстовый слой
        let badge = null;
        if (isTextLayer) {
            badge = document.createElement('span');
            badge.className = 'gimp-layer-type-badge';
            badge.textContent = 'Т';
            badge.title = 'Текстовый слой';
        }

        // 4. Название слоя
        const nameSpan = document.createElement('span');
        nameSpan.className = 'gimp-layer-name';
        nameSpan.textContent = layer.name || `Слой ${layer.id}`;
        nameSpan.title = 'Двойной клик для переименования';

        // Двойной клик по названию
        if (!isTextLayer) {
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const n = prompt('Имя слоя:', layer.name);
                if (n !== null && n.trim()) {
                    layer.name = n.trim();
                    nameSpan.textContent = layer.name;
                    if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
                }
            });
        } else {
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (typeof setTool === 'function') setTool('text');
                if (window.openTextEditorModal) window.openTextEditorModal(layer, false);
            });
        }

        // 5. Кнопка редактирования для текстового слоя
        let editBtn = null;
        if (isTextLayer) {
            editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'gimp-layer-text-edit-btn';
            editBtn.title = 'Редактировать текст';
            editBtn.textContent = '✎';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof setTool === 'function') setTool('text');
                if (window.openTextEditorModal) window.openTextEditorModal(layer, false);
            });
        }

        // Сборка строки
        row.appendChild(eyeBtn);
        row.appendChild(thumbCanvas);
        if (badge) row.appendChild(badge);
        row.appendChild(nameSpan);
        if (editBtn) row.appendChild(editBtn);

        // Клик по строке делает слой активным
        row.addEventListener('click', () => {
            if (activeLayerId !== layer.id) {
                activeLayerId = layer.id;
                highlightActiveLayer(document.getElementById('layers-list'));
                syncTopControlsWithActiveLayer();
                updateToolbarButtonsState();
                if (typeof render === 'function') render();
            }
        });

        return row;
    }

    /**
     * Подсвечивает активную строку
     */
    function highlightActiveLayer(list) {
        if (!list) return;
        const rows = list.querySelectorAll('.gimp-layer-row');
        rows.forEach(r => {
            const id = Number(r.getAttribute('data-layer-id'));
            if (id === activeLayerId) {
                r.classList.add('active');
            } else {
                r.classList.remove('active');
            }
        });
    }

    /**
     * Синхронизирует верхние элементы GIMP (режим и непрозрачность) с активным слоем
     */
    function syncTopControlsWithActiveLayer() {
        const activeLayer = layers.find(l => l && l.id === activeLayerId);
        const modeSelect = document.getElementById('layer-blend-mode-global');
        const opSlider = document.getElementById('layer-opacity-slider-global');
        const opNum = document.getElementById('layer-opacity-val-global');

        if (!activeLayer) return;

        if (modeSelect) {
            modeSelect.value = activeLayer.blendMode || 'source-over';
        }

        const opVal = activeLayer.opacity !== undefined ? Math.round(Number(activeLayer.opacity) * 100) : 100;
        if (opSlider) opSlider.value = opVal;
        if (opNum) opNum.value = opVal;
    }

    /**
     * Обновляет состояние доступности кнопок в нижнем тулбаре
     */
    function updateToolbarButtonsState() {
        const idx = layers.findIndex(l => l && l.id === activeLayerId);
        const upBtn = document.getElementById('btn-layer-up');
        const downBtn = document.getElementById('btn-layer-down');
        const mergeBtn = document.getElementById('btn-layer-merge');
        const delBtn = document.getElementById('btn-layer-delete');

        if (upBtn) upBtn.disabled = (idx === -1 || idx >= layers.length - 1);
        if (downBtn) downBtn.disabled = (idx <= 0);
        if (mergeBtn) mergeBtn.disabled = (idx <= 0);
        if (delBtn) delBtn.disabled = (layers.length <= 1);
    }

    /**
     * Перемещение слоя
     */
    function moveLayer(idx, offset) {
        const newIdx = idx + offset;
        if (newIdx < 0 || newIdx >= layers.length) return;

        const [removed] = layers.splice(idx, 1);
        layers.splice(newIdx, 0, removed);
        renderLayersList();
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    /**
     * Удаление активного слоя
     */
    function removeActiveLayer() {
        if (layers.length <= 1) {
            alert('Нельзя удалить единственный слой!');
            return;
        }
        const idx = layers.findIndex(l => l && l.id === activeLayerId);
        if (idx === -1) return;

        const layer = layers[idx];
        if (!confirm(`Удалить слой "${layer.name}"?`)) return;

        if (typeof layerCaches !== 'undefined' && layerCaches[layer.id]) {
            delete layerCaches[layer.id];
        }

        layers.splice(idx, 1);
        // Выбираем соседний слой
        const nextActive = layers[Math.min(idx, layers.length - 1)];
        activeLayerId = nextActive.id;

        renderLayersList();
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    /**
     * Слияние слоя с нижележащим
     */
    function mergeDown(idx) {
        if (idx <= 0) return;
        const topLayer = layers[idx];
        const bottomLayer = layers[idx - 1];

        if (!topLayer || !bottomLayer) return;

        // Если есть штрихи
        if (topLayer.strokes && topLayer.strokes.length > 0) {
            if (!bottomLayer.strokes) bottomLayer.strokes = [];
            // Переносим штрихи с учетом opacity и blendMode, если они были заданы
            bottomLayer.strokes.push(...topLayer.strokes);
        }

        // Очищаем кэши слоев
        if (typeof layerCaches !== 'undefined') {
            delete layerCaches[topLayer.id];
            delete layerCaches[bottomLayer.id];
        }

        layers.splice(idx, 1);
        activeLayerId = bottomLayer.id;

        renderLayersList();
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    /**
     * Добавление нового слоя
     */
    function handleAddLayer() {
        const id = nextLayerId++;
        const newLayer = {
            id: id,
            name: `Слой ${id}`,
            visible: true,
            opacity: 1,
            blendMode: 'source-over',
            strokes: []
        };
        // Вставляем сразу над активным слоем (как в GIMP)
        const activeIdx = layers.findIndex(l => l && l.id === activeLayerId);
        if (activeIdx !== -1) {
            layers.splice(activeIdx + 1, 0, newLayer);
        } else {
            layers.push(newLayer);
        }
        activeLayerId = id;

        renderLayersList();
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    /**
     * Дублирование активного слоя
     */
    function duplicateLayer(srcIdx) {
        if (srcIdx === undefined || srcIdx === null || srcIdx < 0) {
            srcIdx = layers.findIndex(l => l && l.id === activeLayerId);
        }
        const src = layers[srcIdx];
        if (!src) return;

        const newId = nextLayerId++;
        const clonedStrokes = src.strokes ? JSON.parse(JSON.stringify(src.strokes)) : [];
        const copy = {
            id: newId,
            name: `${src.name} (копия)`,
            visible: src.visible,
            opacity: src.opacity !== undefined ? src.opacity : 1,
            blendMode: src.blendMode || 'source-over',
            strokes: clonedStrokes,
            type: src.type
        };

        layers.splice(srcIdx + 1, 0, copy);
        activeLayerId = newId;

        renderLayersList();
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    /**
     * Объединение всех слоев в один
     */
    function groupAllLayers() {
        if (layers.length <= 1) return;
        if (!confirm('Объединить все видимые слои в один?')) return;

        // Создаем результирующий холст
        const baseLayer = {
            id: nextLayerId++,
            name: 'Объединенный',
            visible: true,
            opacity: 1,
            blendMode: 'source-over',
            strokes: []
        };

        // Собираем штрихи всех слоев по порядку
        for (const l of layers) {
            if (l.visible && l.strokes) {
                baseLayer.strokes.push(...JSON.parse(JSON.stringify(l.strokes)));
            }
        }

        if (typeof layerCaches !== 'undefined') {
            for (const key in layerCaches) delete layerCaches[key];
        }

        layers = [baseLayer];
        activeLayerId = baseLayer.id;

        renderLayersList();
        if (typeof render === 'function') render();
        if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    }

    /**
     * Инициализация панели слоев и привязка обработчиков событий
     */
    function initLayersPanel() {
        validateGlobals();

        // 1. Верхний селект режима наложения
        const modeSelect = document.getElementById('layer-blend-mode-global');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                const activeLayer = layers.find(l => l && l.id === activeLayerId);
                if (activeLayer) {
                    activeLayer.blendMode = e.target.value;
                    if (typeof render === 'function') render();
                    if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
                }
            });
        }

        // 2. Верхний ползунок непрозрачности
        const opSlider = document.getElementById('layer-opacity-slider-global');
        const opNum = document.getElementById('layer-opacity-val-global');

        if (opSlider && opNum) {
            opSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                opNum.value = val;
                const activeLayer = layers.find(l => l && l.id === activeLayerId);
                if (activeLayer) {
                    activeLayer.opacity = val / 100;
                    if (typeof render === 'function') render();
                }
            });

            opSlider.addEventListener('change', () => {
                if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
            });

            opNum.addEventListener('input', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val)) val = 100;
                val = Math.max(0, Math.min(100, val));
                opSlider.value = val;
                const activeLayer = layers.find(l => l && l.id === activeLayerId);
                if (activeLayer) {
                    activeLayer.opacity = val / 100;
                    if (typeof render === 'function') render();
                }
            });

            opNum.addEventListener('change', () => {
                if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
            });
        }

        // 3. Нижние кнопки GIMP
        const btnNew = document.getElementById('btn-layer-new');
        if (btnNew) btnNew.addEventListener('click', handleAddLayer);

        const btnUp = document.getElementById('btn-layer-up');
        if (btnUp) btnUp.addEventListener('click', () => {
            const idx = layers.findIndex(l => l && l.id === activeLayerId);
            if (idx !== -1 && idx < layers.length - 1) moveLayer(idx, 1);
        });

        const btnDown = document.getElementById('btn-layer-down');
        if (btnDown) btnDown.addEventListener('click', () => {
            const idx = layers.findIndex(l => l && l.id === activeLayerId);
            if (idx > 0) moveLayer(idx, -1);
        });

        const btnDup = document.getElementById('btn-layer-duplicate');
        if (btnDup) btnDup.addEventListener('click', () => {
            const idx = layers.findIndex(l => l && l.id === activeLayerId);
            if (idx !== -1) duplicateLayer(idx);
        });

        const btnMerge = document.getElementById('btn-layer-merge');
        if (btnMerge) btnMerge.addEventListener('click', () => {
            const idx = layers.findIndex(l => l && l.id === activeLayerId);
            if (idx > 0) mergeDown(idx);
        });

        const btnDel = document.getElementById('btn-layer-delete');
        if (btnDel) btnDel.addEventListener('click', removeActiveLayer);

        const btnGroupAll = document.getElementById('group-all-btn');
        if (btnGroupAll) btnGroupAll.addEventListener('click', groupAllLayers);

        // Совместимость со старыми вызовами #add-layer если есть
        const oldAdd = document.getElementById('add-layer');
        if (oldAdd) oldAdd.addEventListener('click', handleAddLayer);

        // Отрисовываем список
        renderLayersList();
    }

    // Экспорт в глобальный модуль для совместимости
    if (!window.layersModule) {
        window.layersModule = {};
    }
    window.layersModule.renderLayersList = renderLayersList;
    window.layersModule.initLayersPanel = initLayersPanel;
    window.layersModule.duplicateLayer = duplicateLayer;
    window.layersModule.groupAllLayers = groupAllLayers;
    window.layersModule.moveLayer = moveLayer;
    window.layersModule.removeActiveLayer = removeActiveLayer;
    window.layersModule.mergeDown = mergeDown;
    window.layersModule.addLayer = handleAddLayer;

    window.renderLayersList = renderLayersList;
    window.initLayersPanel = initLayersPanel;

    // Автоинициализация при загрузке DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayersPanel);
    } else {
        initLayersPanel();
    }
})();
