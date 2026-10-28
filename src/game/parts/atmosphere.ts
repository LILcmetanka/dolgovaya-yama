import Phaser from 'phaser';
import { createAtmosphereTextures, DUST_TEXTURE, SCANLINES_TEXTURE, VIGNETTE_TEXTURE } from '../decor';
import { ROOM_SIDE, SCREEN, VIEW_CENTER_X, VIEW_WIDTH } from '../layout';

// Пыль в свете лампы.
const DUST_COUNT = 18;
const DUST_AREA = { left: -360 - ROOM_SIDE, right: 960 + ROOM_SIDE, top: 80, bottom: 600 }; // по всей комнате, и слева у магазина
const DUST_RISE = { min: 40, max: 90 }; // на столько px пылинка поднимается за свой полёт
const DUST_TIME = { min: 6000, max: 11000 }; // столько летит, мс
// Мигание света: свет на миг гаснет.
const FLICKER_PAUSE = { min: 9000, max: 22000 }; // между миганиями, мс
const FLICKER_ALPHA = 0.3;
const FLICKER_TIME = 70;
// Тёмные края от тревоги.
const VIGNETTE_MAX_ALPHA = 0.7;
const ATMOSPHERE_DEPTH = 20; // над игрой, но под подсказкой и экраном DEATH

/**
 * Атмосфера комнаты: пыль в воздухе, полосы развёртки на экране автомата, иногда мигает свет,
 * края вида темнеют, когда близка беда. Всё лёгкое: несколько картинок и твинов.
 * Случайность — Phaser.Math.RND, а не Math.random: эффекты идут всё время и не должны сбивать проверочные сценарии.
 */
export class Atmosphere {
  private readonly scene: Phaser.Scene;
  private readonly flash: Phaser.GameObjects.Rectangle; // чёрный слой: свет мигает
  private readonly vignette: Phaser.GameObjects.Image; // тёмные края

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    createAtmosphereTextures(scene, SCREEN);
    scene.add.image(SCREEN.x, SCREEN.y, SCANLINES_TEXTURE); // полосы развёртки поверх сетки
    for (let index = 0; index < DUST_COUNT; index++) this.floatDust(scene.add.image(0, 0, DUST_TEXTURE), true);
    this.vignette = scene.add.image(0, 0, VIGNETTE_TEXTURE).setOrigin(0).setScrollFactor(0).setAlpha(0).setDepth(ATMOSPHERE_DEPTH);
    this.flash = scene.add.rectangle(VIEW_CENTER_X, 320, VIEW_WIDTH, 640, 0x000000, 1).setScrollFactor(0).setAlpha(0).setDepth(ATMOSPHERE_DEPTH);
    this.scheduleFlicker();
  }

  /** Пылинка медленно поднимается и тает, потом появляется в новом месте. first — первый полёт начинается с середины. */
  private floatDust(dust: Phaser.GameObjects.Image, first = false): void {
    const rnd = Phaser.Math.RND;
    const x = rnd.between(DUST_AREA.left, DUST_AREA.right);
    const y = rnd.between(DUST_AREA.top, DUST_AREA.bottom);
    const time = rnd.between(DUST_TIME.min, DUST_TIME.max);
    dust.setPosition(x, y).setAlpha(0).setScale(rnd.realInRange(0.6, 1.4));
    this.scene.tweens.add({
      targets: dust,
      y: y - rnd.between(DUST_RISE.min, DUST_RISE.max),
      x: x + rnd.between(-20, 20),
      alpha: { from: 0, to: rnd.realInRange(0.3, 0.8) },
      duration: time,
      delay: first ? rnd.between(0, time) : 0,
      yoyo: false,
      ease: 'Sine.easeInOut',
      onComplete: () => this.floatDust(dust),
    });
  }

  /** Свет мигает через случайную паузу: на миг темнеет дважды. */
  private scheduleFlicker(): void {
    const pause = Phaser.Math.RND.between(FLICKER_PAUSE.min, FLICKER_PAUSE.max);
    this.scene.time.delayedCall(pause, () => {
      this.scene.tweens.add({ targets: this.flash, alpha: FLICKER_ALPHA, duration: FLICKER_TIME, yoyo: true, repeat: 1 });
      this.scheduleFlicker();
    });
  }

  /** Тревога 0…1: чем она выше, тем темнее края вида. */
  setTension(tension: number): void {
    this.scene.tweens.killTweensOf(this.vignette);
    this.scene.tweens.add({ targets: this.vignette, alpha: tension * VIGNETTE_MAX_ALPHA, duration: 600 });
  }
}
