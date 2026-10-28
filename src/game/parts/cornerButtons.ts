import Phaser from 'phaser';
import { createFullscreenTexture, createGearTexture, FULLSCREEN_TEXTURE, GEAR_TEXTURE } from '../decor';
import { addText, GAME_OVER_DEPTH, HINT_TEXT, IS_TOUCH_ONLY } from '../theme';

// Значки в левом нижнем углу экрана.
const CORNER_Y = 618;
const GEAR_X = 26; // пауза и настройки
const SILENT_X = 62; // 🔇 — виден, только когда звук выключен
const FULLSCREEN_X = 98; // во весь экран — только на телефоне
const ICON_ALPHA = 0.55; // значки-картинки бледные, как подсказки
const CORNER_DEPTH = GAME_OVER_DEPTH + 1; // над экраном DEATH и паузой

/**
 * Значки в углу экрана, при любом повороте вида: ⚙ — пауза и настройки, 🔇 — звук выключен (нажми — включится),
 * на телефоне ещё «во весь экран». Что делать по нажатию, решает сцена (колбэки); значки только показывают.
 */
export class CornerButtons {
  private readonly silent: Phaser.GameObjects.Text;

  /** openSettings — нажали ⚙, unmute — нажали 🔇. */
  constructor(scene: Phaser.Scene, openSettings: () => void, unmute: () => void) {
    createGearTexture(scene);
    this.addButton(scene.add.image(GEAR_X, CORNER_Y, GEAR_TEXTURE).setAlpha(ICON_ALPHA), openSettings);
    this.silent = this.addButton(addText(scene, SILENT_X, CORNER_Y, '🔇', { fontSize: '20px', color: HINT_TEXT }), unmute);
    if (IS_TOUCH_ONLY && scene.sys.game.device.fullscreen.available) {
      createFullscreenTexture(scene);
      const fullscreen = scene.add.image(FULLSCREEN_X, CORNER_Y, FULLSCREEN_TEXTURE);
      // Браузер пускает во весь экран только из pointerup — не из pointerdown.
      this.addButton(fullscreen, () => scene.scale.toggleFullscreen(), 'pointerup');
    }
  }

  /** Значок в углу: не уезжает с видом, лежит поверх всего, нажимается. */
  private addButton<T extends Phaser.GameObjects.Text | Phaser.GameObjects.Image>(
    button: T,
    onPress: () => void,
    event: 'pointerdown' | 'pointerup' = 'pointerdown',
  ): T {
    button.setOrigin(0.5).setScrollFactor(0).setDepth(CORNER_DEPTH).setInteractive({ useHandCursor: true });
    button.on(event, onPress);
    return button;
  }

  /** Звук выключен (M или громкости на 0) — в углу 🔇; включён — значка нет. */
  showSilent(isSilent: boolean): void {
    this.silent.setVisible(isSilent);
  }
}
