/**
 * Обвязка телефона — то, чего у игры в холсте быть не может:
 * 1) экран «поверни телефон» (#rotate в index.html, стиль — src/style.css) поверх всего окна: стоя 16:9
 *    занимает только полоску по центру, и надпись, нарисованная в игре, была бы крошечной;
 * 2) замок на ландшафт после входа в полный экран — если браузер умеет;
 * 3) долгое нажатие не открывает меню браузера поверх игры.
 * Всё это живёт дольше сцены, поэтому зовётся один раз из main.ts, а не из GameScene (там «ЗАНОВО» перезапускает сцену).
 */

/** Телефон в портрете: тот же запрос, что IS_TOUCH_ONLY (theme.ts), плюс направление окна. */
const PORTRAIT_PHONE = '(orientation: portrait) and (hover: none) and (pointer: coarse)';

export function setupPhoneShell(): void {
  const overlay = document.getElementById('rotate');
  if (overlay) {
    // Phaser слушает касания не только на холсте, но и на окне (inputWindowEvents), поэтому одного «экран сверху»
    // мало: касание мимо холста всё равно дошло бы до игры. Гасим его прямо на экране поворота.
    const block = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'click']) {
      overlay.addEventListener(type, block, { passive: false });
    }
    const portrait = window.matchMedia(PORTRAIT_PHONE);
    const update = (): void => {
      overlay.classList.toggle('is-on', portrait.matches);
      overlay.setAttribute('aria-hidden', portrait.matches ? 'false' : 'true');
    };
    update();
    portrait.addEventListener('change', update);
  }

  // Полный экран на телефоне — просим телефон лечь боком. Браузер пускает замок только в полном экране;
  // если API нет или браузер отказал — молча играем как есть (без ошибок в консоли).
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) return;
    const orientation = screen.orientation as ScreenOrientation | undefined;
    if (!orientation || typeof orientation.lock !== 'function') return;
    try {
      void orientation.lock('landscape').catch(() => undefined);
    } catch {
      /* старый браузер: замка нет — не беда */
    }
  });

  // Долгое нажатие пальцем на телефоне не открывает «сохранить картинку» и прочее меню браузера.
  document.addEventListener('contextmenu', (event) => {
    if (window.matchMedia('(hover: none)').matches) event.preventDefault();
  });
}
