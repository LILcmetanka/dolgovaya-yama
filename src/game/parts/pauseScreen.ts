import Phaser from 'phaser';
import { createPauseIconTexture, createPlayButtonTexture, PAUSE_ICON_TEXTURE, PLAY_BUTTON_TEXTURE } from '../decor';
import { t } from '../lang';
import { VIEW_CENTER_X, VIEW_WIDTH } from '../layout';
import { addKeyHint, addText, GAME_OVER_DEPTH, POPUP_STYLE } from '../theme';

const SHADE_ALPHA = 0.85; // игру почти не видно: пауза — это остановка, а не время рассмотреть всё не спеша
const TITLE_Y = 100; // слово «ПАУЗА» — над знаком паузы (под знаком уже настройки)
const TITLE_STYLE = { ...POPUP_STYLE, fontSize: '40px', color: '#f8fafc' };
const ICON_Y = 190; // знак паузы; под ним настройки (SettingsPanel), ниже — «▶»
const ICON_SCALE = 4; // знак паузы крупно
const PLAY_Y = 520;
const PAUSE_DEPTH = GAME_OVER_DEPTH; // над игрой; значки в углу — выше: звук и язык меняются и на паузе

/**
 * Экран паузы: всё темнеет, сверху «ПАУЗА» и крупный знак паузы, в середине — настройки (их рисует SettingsPanel),
 * внизу «▶» — продолжить. Пока пауза, твины и таймеры сцены стоят, поэтому экран появляется и пропадает сразу, без анимации.
 */
export class PauseScreen {
  private readonly parts: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[];
  private readonly title: Phaser.GameObjects.Text;

  /** resume — нажали «▶». */
  constructor(scene: Phaser.Scene, resume: () => void) {
    createPauseIconTexture(scene);
    createPlayButtonTexture(scene);
    const shade = scene.add.rectangle(VIEW_CENTER_X, 320, VIEW_WIDTH, 640, 0x000000, SHADE_ALPHA);
    shade.setInteractive(); // ловит клики: под паузой ничего не нажимается
    this.title = addText(scene, VIEW_CENTER_X, TITLE_Y, t('pause'), TITLE_STYLE).setOrigin(0.5);
    const icon = scene.add.image(VIEW_CENTER_X, ICON_Y, PAUSE_ICON_TEXTURE).setScale(ICON_SCALE).setAlpha(0.8);
    const play = scene.add.image(VIEW_CENTER_X, PLAY_Y, PLAY_BUTTON_TEXTURE);
    play.setInteractive({ useHandCursor: true });
    play.on('pointerdown', resume);
    const key = addKeyHint(scene, VIEW_CENTER_X, PLAY_Y + 44, 'Esc');
    this.parts = [shade, this.title, icon, play, key];
    for (const part of this.parts) part.setDepth(PAUSE_DEPTH).setScrollFactor(0).setVisible(false);
  }

  show(): void {
    for (const part of this.parts) part.setVisible(true);
  }

  hide(): void {
    for (const part of this.parts) part.setVisible(false);
  }

  /** Сменился язык (на паузе — клавишей L или кнопкой RU/EN): «ПАУЗА» — на новом. */
  relabel(): void {
    this.title.setText(t('pause'));
  }
}
