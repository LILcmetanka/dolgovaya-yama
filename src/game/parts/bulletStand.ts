import Phaser from 'phaser';
import { createItemTextures, createTicketTexture, itemTexture, TICKET_TEXTURE } from '../decor';
import { t } from '../lang';
import { BOARD_TICKET_X, BULLET_STAND, DISPLAY, ITEM_SIZE } from '../layout';
import { BULLET } from '../shot';
import { addKeyHint, addText, CHIP_DEPTH, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';
import { attachHint, type Hint } from './tooltip';

const PRICE_Y = BULLET_STAND.y + 40; // ценник «билет × 3» — под патроном
const PRICE_TEXT_X = BULLET_STAND.x - 6;
const KEY_Y = BULLET_STAND.y - 40; // номер клавиши — над ним
const PRICE_ICON_SCALE = 0.6;
const TICKETS_FLYING = 3; // купили: столько билетов летит с табло к патрону (для красоты: цена может быть любой)
// Анимации, мс.
const PAY_FLY_TIME = 450;
const PAY_STAGGER = 90;
const SHAKE_TIME = 50; // один рывок тряски «не хватает»

/**
 * Патрон на стене магазина — для выстрела в автомат: под ним цена в билетах, над ним клавиша «-».
 * Клик (или «-» — её ловит сцена) — купить: билеты летят с табло к патрону, а сам патрон сцена отправляет на полку.
 * Патронов сколько угодно, только каждый следующий дороже. Когда что можно, решает сцена.
 */
export class BulletStand {
  private readonly scene: Phaser.Scene;
  private readonly priceText: Phaser.GameObjects.Text; // «× 3» рядом с билетом

  /** buy — кликнули по патрону. */
  constructor(scene: Phaser.Scene, buy: () => void, hint: Hint) {
    this.scene = scene;
    createItemTextures(scene, [BULLET], ITEM_SIZE);
    createTicketTexture(scene);
    const bullet = scene.add.image(BULLET_STAND.x, BULLET_STAND.y, itemTexture(BULLET));
    bullet.setInteractive({ useHandCursor: true });
    attachHint(bullet, hint, () => [t(BULLET.name), t(BULLET.description)], buy);
    scene.add.image(BULLET_STAND.x - 18, PRICE_Y, TICKET_TEXTURE).setScale(PRICE_ICON_SCALE);
    this.priceText = addText(scene, PRICE_TEXT_X, PRICE_Y, '', { ...LED_STYLE, fontSize: '16px' }).setOrigin(0, 0.5);
    addKeyHint(scene, BULLET_STAND.x, KEY_Y, '−'); // клавиша «-»; знак минуса шире дефиса — его видно
  }

  /** Цена патрона в билетах; не хватает билетов — красная. */
  showPrice(price: number, canAfford: boolean): void {
    this.priceText.setText(`× ${price}`).setColor(canAfford ? LED_COLOR : RED_TEXT);
  }

  /** Не хватает билетов — ценник трясётся. */
  deny(): void {
    this.scene.tweens.killTweensOf(this.priceText);
    this.priceText.setX(PRICE_TEXT_X);
    this.scene.tweens.add({
      targets: this.priceText,
      x: PRICE_TEXT_X + 6,
      duration: SHAKE_TIME,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.priceText.setX(PRICE_TEXT_X),
    });
  }

  /** Патрон купили: билеты летят с табло к нему, потом bought(x, y) — отсюда сцена отправит патрон на полку. */
  sell(bought: (x: number, y: number) => void): void {
    for (let index = 0; index < TICKETS_FLYING; index++) {
      const ticket = this.scene.add.image(BOARD_TICKET_X, DISPLAY.y, TICKET_TEXTURE).setDepth(CHIP_DEPTH);
      this.scene.tweens.add({
        targets: ticket,
        x: BULLET_STAND.x,
        y: BULLET_STAND.y,
        scale: 0.5,
        delay: index * PAY_STAGGER,
        duration: PAY_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => ticket.destroy(),
      });
    }
    this.scene.time.delayedCall(TICKETS_FLYING * PAY_STAGGER + PAY_FLY_TIME, () => bought(BULLET_STAND.x, BULLET_STAND.y));
  }
}
