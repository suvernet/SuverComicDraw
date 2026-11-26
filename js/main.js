// =====================================================================
// SuverComicDraw — main.js
// Запуск: стартовая инициализация
// =====================================================================

// Подгоняем холст под окно (первый раз — вручную, дальше — по событию resize)
resizeCanvas();

// Черновик из localStorage (если был) — до первого рендера.
// main.js теперь идёт ПОСЛЕ autosave.js, но defer-порядок на всякий случай ждём.
(function waitRestore(n) {
    if (typeof tryRestoreAutosave === 'function') {
        try { tryRestoreAutosave(); } catch (e) { console.warn('restore:', e); }
        return;
    }
    if (n < 50) setTimeout(function () { waitRestore(n + 1); }, 50);
    else console.warn('autosave.js не загрузился — восстановления не будет');
})(0);

// Рисуем панель слоёв и первый кадр
if (typeof layersModule !== 'undefined' && layersModule.renderLayersList) layersModule.renderLayersList();
updateFooter();
render();
updateHistoryButtons();
