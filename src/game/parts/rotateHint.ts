import Phaser from 'phaser';
import { VIEW_CENTER_X, VIEW_WIDTH } from '../layout';
import { addText, GAME_OVER_DEPTH, IS_TOUCH_ONLY } from '../theme';

const ROTATE_DEPTH = GAME_OVER_DEPTH + 10; // поверх всего, даже значков в углу
const TURN_TIME = 700; // телефон поворачивается набок, мс
const TURN_PAUSE = 600; // и замирает, мс

/**
 * Телефон держат вертикально — автомат мелкий. Тогда поверх всего тёмный экран, и на нём телефон поворачивается набок:
 * «поверни». Без слов. Только на телефоне; повернул — пропадает сам.
 * Вертикально ли — CSS-запрос из JavaScript: «(orientation: portrait)» — окно выше, чем шире.
 */
export function addRotateHint(scene: Phaser.Scene): void {
  if (!IS_TOUCH_ONLY) return;
  const shade = scene.add.rectangle(VIEW_CENTER_X, 320, VIEW_WIDTH, 640, 0x000000, 0.94);
  shade.setInteractive(); // пока виден — ловит касания, игра под ним не нажимается
  const phone = addText(scene, VIEW_CENTER_X, 320, '📱', { fontSize: '200px' }).setOrigin(0.5);
  for (const part of [shade, phone]) part.setScrollFactor(0).setDepth(ROTATE_DEPTH);
  scene.tweens.add({
    targets: phone,
    angle: -90,
    duration: TURN_TIME,
    hold: TURN_PAUSE,
    repeatDelay: TURN_PAUSE,
    yoyo: true,
    repeat: -1,
    ease: 'Cubic.easeInOut',
  });
  const portrait = window.matchMedia('(orientation: portrait)');
  const update = (): void => {
    shade.setVisible(portrait.matches);
    phone.setVisible(portrait.matches);
  };
  update();
  portrait.addEventListener('change', update);
  // Слушатель — у окна браузера, он живёт дольше сцены: при «заново» его надо снять.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => portrait.removeEventListener('change', update));
}
