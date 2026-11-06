import Phaser from 'phaser';
import { createDarkRoomTextures, DARK_ROOM_SIDE_TEXTURE, DARK_ROOM_TEXTURE } from '../decor';
import { TURN_SCROLL } from '../layout';

/**
 * Как комната закрывает вид у Коллектора: целиком (рулетка — ты в его тёмной комнате) или справа
 * (выстрел в автомат — левый край вида остаётся прозрачным, чтобы было видно разбитый экран).
 */
export type RoomMode = 'none' | 'full' | 'side';

/**
 * Тёмная комната Коллектора — картинка на весь вид (стена, пол, лампа над столом, его силуэт). Лежит над всем, что нарисовано
 * раньше неё, — автоматом, панелью, телевизором, — поэтому в комнате их не видно; стол, дробовик, видеомагнитофон и прочее,
 * что создано позже, остаётся поверх.
 */
export class DarkRoom {
  private readonly full: Phaser.GameObjects.Image;
  private readonly side: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    createDarkRoomTextures(scene);
    this.full = scene.add.image(TURN_SCROLL, 0, DARK_ROOM_TEXTURE).setOrigin(0).setVisible(false);
    this.side = scene.add.image(TURN_SCROLL, 0, DARK_ROOM_SIDE_TEXTURE).setOrigin(0).setVisible(false);
  }

  /** Показать комнату: на весь вид или справа. */
  show(mode: 'full' | 'side'): void {
    this.full.setVisible(mode === 'full');
    this.side.setVisible(mode === 'side');
  }

  hide(): void {
    this.full.setVisible(false);
    this.side.setVisible(false);
  }
}
