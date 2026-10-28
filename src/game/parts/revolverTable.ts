import Phaser from 'phaser';
import {
  AIM_COLLECTOR_TEXTURE,
  AIM_SELF_TEXTURE,
  amuletTexture,
  AMULET_TRAY_TEXTURE,
  BULLET_BLANK_TEXTURE,
  BULLET_GOLD_TEXTURE,
  BULLET_LIVE_TEXTURE,
  createAmuletTextures,
  createRouletteTextures,
  MUZZLE_BORE,
  MUZZLE_FLASH_TEXTURE,
  MUZZLE_TEXTURE,
  REVOLVER_BARREL_TIP,
  REVOLVER_TEXTURE,
  ROULETTE_TABLE_TEXTURE,
} from '../decor';
import { AMULETS, type Amulet } from '../amulets';
import { CHAMBERS, type Bullet, type Side } from '../collectorGame';
import { t, type TextKey } from '../lang';
import { AIM_AT_COLLECTOR, AIM_AT_SELF, AMULET_SIZE, AMULET_TRAY, BULLETS_Y, REVOLVER, ROULETTE_TABLE } from '../layout';
import type { Sfx } from '../sound';
import { addKeyHint, keyHint, POPUP_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

/** Точка в раскладке — например, где кулак Коллектора. */
interface Point {
  x: number;
  y: number;
}

// Где что лежит.
const BULLET_STEP = 26; // патроны стоят в ряд на сукне: от патрона до патрона
const SPENT_ALPHA = 0.2; // выстреленный патрон бледнеет
const PLAY_KEY_Y = ROULETTE_TABLE.y + ROULETTE_TABLE.height / 2 + 14; // «Пробел» — под столом, над лотком
const AIM_KEY_DX = 40; // ↑ и ↓ — правее кнопок-целей
const TRAY_STEP = 54; // от амулета до амулета в лотке
const TRAY_AMULET_SCALE = 1.2;
const DIM_ALPHA = 0.35; // амулета не хватает на долг — он тусклый
const SHAKE_TIME = 50; // один рывок тряски «не хватает»
// Как револьвер целится.
const UP_ANGLE = -95; // ты стреляешь в Коллектора: ствол вверх, на его руку над столом
const UP_LIFT = 26; // и револьвер приподнимается над сукном
const HELD_ANGLE = -90; // Коллектор взял револьвер в кулак: ствол вверх
const COLLECTOR_SELF_AIM = { dx: 70, dy: -140, angle: -10 }; // Коллектор стреляет в себя: револьвер уходит в темноту, к его голове
const MUZZLE_SCALE = 2.6; // в тебя: дуло смотрит на тебя и приближается
const MUZZLE_RISE = 70; // твой выстрел в себя: револьвер ещё и поднимается со стола
const FLASH_SCALE = 1.6; // вспышка выстрела сбоку; дулом на тебя — вдвое больше
const RECOIL = 4; // холостой: револьвер дёргается на столько px
const SHAKE = 0.012; // боевой: вид трясётся
const WHITE_FLASH_ALPHA = 0.8; // боевой в тебя: белая вспышка на весь вид
const BUTTON_PULSE = 1.08; // кнопки-цели «дышат», пока твой ход
const LOAD_SCALE = 1.4; // выстрел в автомат: твой золотой патрон влетает в револьвер — сначала крупный
// Анимации, мс.
const APPEAR_TIME = 400; // стол появляется
const BULLET_DROP = 30; // патроны падают на сукно с такой высоты, px
const BULLET_DROP_TIME = 260;
const BULLET_STAGGER = 60; // друг за другом
const SPIN_TIME = 1000; // Коллектор крутит барабан: револьвер вертится на сукне
const SPIN_TURNS = 3;
const AIM_TIME = 380; // револьвер поворачивается к цели
const SUSPENSE_TIME = 700; // курок взведён — пауза перед выстрелом
const FLASH_TIME = 300; // вспышка гаснет; столько же бледнеет выстреленный патрон
const AFTER_SHOT_TIME = 500; // после выстрела — пауза, потом дальше
const RETURN_TIME = 320; // револьвер возвращается на стол
const RECOIL_TIME = 40;
const PULSE_TIME = 500;
const GIVE_TIME = 500; // отданный амулет летит в ладонь
const LOAD_TIME = 500; // твой патрон летит в револьвер
const LOAD_SPIN_TIME = 600; // барабан проворачивается — патрон в нём

/** Где стоит патрон номер place в ряду на сукне. */
function bulletX(place: number): number {
  return ROULETTE_TABLE.x + (place - (CHAMBERS - 1) / 2) * BULLET_STEP;
}

/**
 * Игра с Коллектором: стол в темноте под его рукой. На сукне — патроны (сколько боевых и холостых зарядил Коллектор)
 * и револьвер, ниже — лоток с копиями твоих амулетов. Клик по револьверу — сыграть в рулетку (Пробел и Enter ловит сцена),
 * по амулету — отдать его. Твой ход — кнопки-цели: прицел на рукаве Коллектора и дуло «на тебя» внизу (↑ и ↓ ловит сцена).
 * Выстрел в автомат: на столе только револьвер — твой золотой патрон влетает в него, ствол разворачивается к автомату.
 */
export class RevolverTable {
  private readonly scene: Phaser.Scene;
  private readonly table: Phaser.GameObjects.Image;
  private readonly tray: Phaser.GameObjects.Image;
  private readonly bullets: Phaser.GameObjects.Image[] = []; // патроны в ряд: слева боевые, справа холостые
  private readonly revolver: Phaser.GameObjects.Image;
  private readonly playKey: Phaser.GameObjects.Text; // «Пробел»: сыграть в рулетку
  private readonly flash: Phaser.GameObjects.Image; // вспышка выстрела
  private readonly aimButtons: Phaser.GameObjects.Image[]; // кнопки-цели: в Коллектора, в себя
  private readonly aimKeys: Phaser.GameObjects.Text[]; // ↑ и ↓ рядом с ними
  private kinds: Bullet[] = []; // какой патрон стоит в ряду на каком месте
  private spent: boolean[] = []; // какие патроны в ряду уже выстрелили
  private trayAmulets: Phaser.GameObjects.Image[] = []; // копии амулетов игрока в лотке
  private trayKeys: Phaser.GameObjects.Text[] = []; // номера клавиш под амулетами в лотке
  private readonly hint: Hint;
  private readonly sfx: Sfx;
  private readonly onAmulet: (index: number) => void;

  /** play — кликнули по револьверу (сыграть), shoot(target) — по кнопке-цели, onAmulet(index) — по амулету в лотке. */
  constructor(
    scene: Phaser.Scene,
    play: () => void,
    shoot: (target: Side) => void,
    onAmulet: (index: number) => void,
    hint: Hint,
    sfx: Sfx,
  ) {
    this.scene = scene;
    this.hint = hint;
    this.sfx = sfx;
    this.onAmulet = onAmulet;
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    createRouletteTextures(scene, ROULETTE_TABLE, AMULET_TRAY);
    this.table = scene.add.image(ROULETTE_TABLE.x, ROULETTE_TABLE.y, ROULETTE_TABLE_TEXTURE).setVisible(false);
    this.tray = scene.add.image(AMULET_TRAY.x, AMULET_TRAY.y, AMULET_TRAY_TEXTURE).setVisible(false);
    for (let place = 0; place < CHAMBERS; place++) {
      const bullet = scene.add.image(bulletX(place), BULLETS_Y, BULLET_BLANK_TEXTURE).setVisible(false).setInteractive();
      attachHint(bullet, hint, () => [t(this.kinds[place] === 'live' ? 'liveBullet' : 'blankBullet'), t('bulletsWhat')]);
      this.bullets.push(bullet);
    }
    this.revolver = scene.add.image(REVOLVER.x, REVOLVER.y, REVOLVER_TEXTURE).setVisible(false);
    this.revolver.setInteractive({ useHandCursor: true }).disableInteractive();
    attachHint(this.revolver, hint, () => [t('revolver'), t('revolverWhat')], play);
    this.playKey = addKeyHint(scene, REVOLVER.x, PLAY_KEY_Y, t('space')).setVisible(false);
    this.flash = scene.add.image(0, 0, MUZZLE_FLASH_TEXTURE).setDepth(POPUP_DEPTH).setVisible(false);
    this.aimButtons = [
      this.addAimButton(AIM_AT_COLLECTOR, AIM_COLLECTOR_TEXTURE, 'collector', shoot),
      this.addAimButton(AIM_AT_SELF, AIM_SELF_TEXTURE, 'player', shoot),
    ];
    this.aimKeys = [
      addKeyHint(scene, AIM_AT_COLLECTOR.x + AIM_KEY_DX, AIM_AT_COLLECTOR.y, '↑').setDepth(POPUP_DEPTH).setVisible(false),
      addKeyHint(scene, AIM_AT_SELF.x + AIM_KEY_DX, AIM_AT_SELF.y, '↓').setDepth(POPUP_DEPTH).setVisible(false),
    ];
  }

  /** Кнопка-цель: клик — выстрел в target; подсказка — что будет при боевом и холостом. */
  private addAimButton(at: Point, texture: string, target: Side, shoot: (target: Side) => void): Phaser.GameObjects.Image {
    const button = this.scene.add.image(at.x, at.y, texture).setDepth(POPUP_DEPTH).setVisible(false);
    button.setInteractive({ useHandCursor: true });
    const [title, text]: [TextKey, TextKey] = target === 'collector' ? ['shootCollector', 'shootCollectorWhat'] : ['shootSelf', 'shootSelfWhat'];
    attachHint(button, this.hint, () => [t(title), t(text)], () => shoot(target));
    return button;
  }

  /**
   * Стол появляется. live — сколько боевых зарядит Коллектор: тогда на сукне падают патроны (слева боевые, справа холостые)
   * и лежит револьвер — клик по нему сыграть; null — рулетка уже была: стола нет, только лоток.
   * В лотке — копии твоих амулетов: их можно отдать (canGive — хватит ли каждого на долг).
   */
  show(live: number | null, amulets: Amulet[], canGive: boolean[]): void {
    const hasRoulette = live !== null;
    this.table.setVisible(hasRoulette).setAlpha(0);
    this.scene.tweens.add({ targets: this.table, alpha: 1, duration: APPEAR_TIME });
    this.kinds = this.bullets.map((_, place) => (place < (live ?? 0) ? 'live' : 'blank'));
    this.spent = this.bullets.map(() => false);
    this.bullets.forEach((bullet, place) => {
      bullet.setTexture(this.kinds[place] === 'live' ? BULLET_LIVE_TEXTURE : BULLET_BLANK_TEXTURE);
      bullet.setVisible(hasRoulette).setAlpha(1).setY(BULLETS_Y - BULLET_DROP);
      const delay = APPEAR_TIME + place * BULLET_STAGGER;
      this.scene.tweens.add({ targets: bullet, y: BULLETS_Y, delay, duration: BULLET_DROP_TIME, ease: 'Bounce.easeOut' });
    });
    this.resetRevolver().setVisible(hasRoulette);
    if (hasRoulette) this.revolver.setInteractive();
    this.playKey.setVisible(hasRoulette);
    this.showTray(amulets, canGive);
  }

  /** Револьвер лежит на столе как обычно: боком, стволом вправо, на своём месте. */
  private resetRevolver(): Phaser.GameObjects.Image {
    return this.revolver.setTexture(REVOLVER_TEXTURE).setPosition(REVOLVER.x, REVOLVER.y).setAngle(0).setScale(1).setFlipX(false);
  }

  /** Сменили язык: «Пробел» под столом — на новом языке. */
  relabel(): void {
    this.playKey.setText(keyHint(t('space')));
  }

  /** Лоток с копиями амулетов: клик по амулету — отдать его Коллектору; тех, которых не хватит на долг, — тусклые. Нет амулетов — лотка нет. */
  private showTray(amulets: Amulet[], canGive: boolean[]): void {
    this.clearTray();
    this.tray.setVisible(amulets.length > 0);
    amulets.forEach((amulet, index) => {
      const x = AMULET_TRAY.x + (index - (amulets.length - 1) / 2) * TRAY_STEP;
      const image = this.scene.add.image(x, AMULET_TRAY.y, amuletTexture(amulet)).setScale(TRAY_AMULET_SCALE);
      image.setInteractive({ useHandCursor: true }).setAlpha(canGive[index] ? 1 : DIM_ALPHA);
      attachHint(image, this.hint, () => [t(amulet.name), t(canGive[index] ? 'giveAmulet' : 'notEnough')], () => this.onAmulet(index));
      this.trayAmulets.push(image);
      this.trayKeys.push(addKeyHint(this.scene, x, AMULET_TRAY.y + 36, String(index + 1), '12px'));
    });
  }

  /** Убрать копии амулетов и их номера из лотка. */
  private clearTray(): void {
    for (const object of [...this.trayAmulets, ...this.trayKeys]) object.destroy();
    this.trayAmulets = [];
    this.trayKeys = [];
  }

  /** Коллектор крутит барабан: лоток убран, револьвер вертится на сукне — порядок патронов теперь неизвестен. Потом done(). */
  spin(done: () => void): void {
    this.hideTray();
    this.playKey.setVisible(false);
    this.revolver.disableInteractive(true);
    this.sfx.play('cylinder');
    this.scene.tweens.add({
      targets: this.revolver,
      angle: 360 * SPIN_TURNS,
      duration: SPIN_TIME,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.revolver.setAngle(0);
        done();
      },
    });
  }

  /** Твой ход: кнопки-цели «дышат» — прицел на Коллекторе и дуло «на тебя»; не твой ход — их нет. */
  showAim(isOn: boolean): void {
    for (const button of this.aimButtons) {
      this.scene.tweens.killTweensOf(button);
      button.setVisible(isOn).setScale(1);
      if (isOn) this.scene.tweens.add({ targets: button, scale: BUTTON_PULSE, duration: PULSE_TIME, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    for (const key of this.aimKeys) key.setVisible(isOn);
    if (!isOn) this.hint.hide();
  }

  /**
   * Выстрел: shooter целится в target, курок взведён, пауза — и bullet: боевой — вспышка и грохот, холостой — щелчок.
   * Коллектор сначала берёт револьвер в кулак (hand — где кулак). Выстреленный патрон в ряду бледнеет.
   * Холостой — револьвер возвращается на стол, потом done(); боевой — done() после вспышки: дальше решает сцена.
   */
  shoot(shooter: Side, target: Side, bullet: Bullet, hand: Point, done: () => void): void {
    this.showAim(false);
    const fire = (): void => {
      this.sfx.play('cock');
      this.scene.time.delayedCall(SUSPENSE_TIME, () => this.fire(bullet, done));
    };
    const aim = (): void => {
      if (target === 'player') this.turnToViewer(shooter === 'player' ? MUZZLE_RISE : 0, fire);
      else if (shooter === 'player') this.moveTo(REVOLVER.x, REVOLVER.y - UP_LIFT, UP_ANGLE, 1, fire);
      else this.moveTo(hand.x + COLLECTOR_SELF_AIM.dx, hand.y + COLLECTOR_SELF_AIM.dy, COLLECTOR_SELF_AIM.angle, 1, fire);
    };
    if (shooter === 'collector') this.moveTo(hand.x, hand.y, HELD_ANGLE, 1, aim);
    else aim();
  }

  /** Револьвер плавно едет в (x, y), поворачивается на angle и меняет размер — потом done(). */
  private moveTo(x: number, y: number, angle: number, scale: number, done: () => void, duration = AIM_TIME): void {
    this.scene.tweens.add({ targets: this.revolver, x, y, angle, scaleX: scale, scaleY: scale, duration, ease: 'Quad.easeInOut', onComplete: done });
  }

  /** В тебя: револьвер разворачивается дулом к тебе (сжимается и раскрывается другой стороной, как карта Дилера), приближается и поднимается на rise. */
  private turnToViewer(rise: number, done: () => void): void {
    const { x, y } = this.revolver;
    this.scene.tweens.add({
      targets: this.revolver,
      scaleX: 0,
      duration: AIM_TIME / 2,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.revolver.setTexture(MUZZLE_TEXTURE).setAngle(0);
        this.moveTo(x, y - rise, 0, MUZZLE_SCALE, done);
      },
    });
  }

  /** Курок спущен: боевой — вспышка у дула, грохот и тряска; холостой — щелчок, револьвер дёргается и возвращается на стол. */
  private fire(bullet: Bullet, done: () => void): void {
    this.spend(bullet);
    if (bullet === 'live') {
      this.sfx.play('gunshot');
      this.showFlash();
      this.scene.time.delayedCall(AFTER_SHOT_TIME, done);
      return;
    }
    this.sfx.play('dryFire');
    this.scene.tweens.add({ targets: this.revolver, x: this.revolver.x + RECOIL, duration: RECOIL_TIME, yoyo: true, repeat: 1 });
    this.scene.time.delayedCall(AFTER_SHOT_TIME, () => this.putDown(done));
  }

  /** Выстреленный патрон бледнеет — последний ещё целый такого же вида: так видно, сколько боевых и холостых осталось. */
  private spend(bullet: Bullet): void {
    for (let place = this.kinds.length - 1; place >= 0; place--) {
      if (this.kinds[place] !== bullet || this.spent[place]) continue;
      this.spent[place] = true;
      this.scene.tweens.add({ targets: this.bullets[place], alpha: SPENT_ALPHA, duration: FLASH_TIME });
      return;
    }
  }

  /** Вспышка у дула (где дуло — по картинке, повороту и размеру револьвера) и тряска; дулом на тебя — ещё и белая вспышка на весь вид. */
  private showFlash(): void {
    const isAtViewer = this.revolver.texture.key === MUZZLE_TEXTURE;
    const tip = isAtViewer ? MUZZLE_BORE : REVOLVER_BARREL_TIP;
    const angle = Phaser.Math.DegToRad(this.revolver.angle);
    const side = this.revolver.flipX ? -1 : 1; // развёрнут влево (выстрел в автомат) — ствол слева
    const dx = side * tip.x * this.revolver.scaleX;
    const dy = tip.y * this.revolver.scaleY;
    const x = this.revolver.x + dx * Math.cos(angle) - dy * Math.sin(angle);
    const y = this.revolver.y + dx * Math.sin(angle) + dy * Math.cos(angle);
    const scale = isAtViewer ? FLASH_SCALE * 2 : FLASH_SCALE;
    this.flash.setPosition(x, y).setScale(scale).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, scale: scale * 1.4, duration: FLASH_TIME, onComplete: () => this.flash.setVisible(false) });
    const camera = this.scene.cameras.main;
    camera.shake(FLASH_TIME, SHAKE);
    if (isAtViewer) {
      camera.flashEffect.alpha = WHITE_FLASH_ALPHA;
      camera.flash(FLASH_TIME, 255, 255, 255);
    }
  }

  /** Револьвер возвращается на стол: снова боком (если смотрел дулом на тебя — разворачивается), на своё место. */
  private putDown(done: () => void): void {
    const back = (): void => this.moveTo(REVOLVER.x, REVOLVER.y, 0, 1, done, RETURN_TIME);
    if (this.revolver.texture.key !== MUZZLE_TEXTURE) {
      back();
      return;
    }
    this.scene.tweens.add({
      targets: this.revolver,
      scaleX: 0,
      duration: AIM_TIME / 2,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.revolver.setTexture(REVOLVER_TEXTURE);
        back();
      },
    });
  }

  // ---------- Выстрел в автомат ----------

  /** Выстрел в автомат: стол появляется, на нём только револьвер — без патронов, лотка и «Пробел». */
  showRevolver(): void {
    this.table.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.table, alpha: 1, duration: APPEAR_TIME });
    this.resetRevolver().setVisible(true);
  }

  /** Твой золотой патрон влетает из (fromX, fromY) в револьвер, барабан трещит и проворачивается — потом done(). */
  loadBullet(fromX: number, fromY: number, done: () => void): void {
    const bullet = this.scene.add.image(fromX, fromY, BULLET_GOLD_TEXTURE).setDepth(POPUP_DEPTH).setScale(LOAD_SCALE);
    this.scene.tweens.add({
      targets: bullet,
      x: REVOLVER.x,
      y: REVOLVER.y,
      scale: 0.6,
      duration: LOAD_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        bullet.destroy();
        this.sfx.play('cylinder');
        this.scene.tweens.add({
          targets: this.revolver,
          angle: 360,
          duration: LOAD_SPIN_TIME,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            this.revolver.setAngle(0);
            done();
          },
        });
      },
    });
  }

  /**
   * Ствол — на автомат: револьвер разворачивается стволом влево, приподнимается и целится в (x, y) — дыру в экране автомата.
   * Курок взведён, пауза — грохот и вспышка, тогда hit(): пуля попала. Что дальше, решает сцена.
   */
  shootMachine(x: number, y: number, hit: () => void): void {
    const lift = { x: REVOLVER.x, y: REVOLVER.y - UP_LIFT };
    const angle = Phaser.Math.RadToDeg(Math.atan2(lift.y - y, lift.x - x)); // ствол смотрит влево: угол от направления «влево»
    this.scene.tweens.add({
      targets: this.revolver,
      scaleX: 0,
      duration: AIM_TIME / 2,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.revolver.setFlipX(true);
        this.moveTo(lift.x, lift.y, angle, 1, () => {
          this.sfx.play('cock');
          this.scene.time.delayedCall(SUSPENSE_TIME, () => {
            this.sfx.play('gunshot');
            this.showFlash();
            hit();
          });
        });
      },
    });
  }

  /** Этого амулета не хватит на долг: он трясётся в лотке. */
  denyAmulet(index: number): void {
    const image = this.trayAmulets[index];
    if (!image) return;
    const homeX = image.x;
    this.scene.tweens.killTweensOf(image);
    this.scene.tweens.add({ targets: image, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => image.setX(homeX) });
  }

  /** Отдали амулет index: он летит из лотка в ладонь (toX, toY), стол исчезает. Долетел — done(). */
  giveAmulet(index: number, toX: number, toY: number, done: () => void): void {
    const image = this.trayAmulets[index];
    if (!image) return;
    this.hint.hide();
    image.setDepth(POPUP_DEPTH);
    this.trayAmulets.splice(index, 1); // эта копия улетает, остальные уберёт hide()
    this.scene.tweens.add({
      targets: image,
      x: toX,
      y: toY,
      scale: 0.8,
      duration: GIVE_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        image.destroy();
        this.hide();
        done();
      },
    });
  }

  /** Лоток прячется: играем, а не откупаемся. */
  private hideTray(): void {
    this.hint.hide();
    this.tray.setVisible(false);
    this.clearTray();
  }

  /** Убрать стол, патроны, револьвер, кнопки-цели и лоток. */
  hide(): void {
    this.hideTray();
    this.showAim(false);
    this.revolver.disableInteractive(true);
    for (const object of [this.table, this.revolver, this.playKey, this.flash, ...this.bullets]) object.setVisible(false);
  }
}
