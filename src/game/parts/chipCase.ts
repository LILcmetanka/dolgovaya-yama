import Phaser from 'phaser';
import { CHIP_TEXTURE, createChipTextures } from '../decor';
import { CENTER_X, NOTE } from '../layout';
import { POPUP_DEPTH } from '../theme';

// Чемодан с фишками Коллектора: выезжает сверху, крышка откидывается, фишки летят на записку с долгом — долг оплачен.
const CASE_Y = 320; // где чемодан стоит, пока открыт
const CASE_START_Y = -150; // откуда выезжает
const BODY_WIDTH = 240;
const BODY_HEIGHT = 120;
const BODY_COLOR = 0x7c3a17;
const BODY_BORDER = 0x3b1d0a;
const LINING_COLOR = 0x7f1d1d;
const LID_HEIGHT = 40;
const CHIP_COLUMNS = 4; // фишки в чемодане стоят сеткой
const CHIP_ROWS = 2;
const CHIP_STEP_X = 46;
const CHIP_STEP_Y = 36;
const CHIP_SCALE = 1.2;
const FLY_SCALE = 0.6; // долетая до записки фишка уменьшается
// Анимации, мс.
const SLIDE_TIME = 500;
const LID_TIME = 260;
const CHIP_FLY_TIME = 550;
const CHIP_STAGGER = 80;
const LEAVE_TIME = 420;

/** Чемодан с фишками: выехал, открылся, фишки улетели на записку, уехал. */
export class ChipCase {
  private readonly scene: Phaser.Scene;
  private readonly box: Phaser.GameObjects.Container;
  private readonly lid: Phaser.GameObjects.Rectangle;
  private readonly chips: Phaser.GameObjects.Image[] = []; // фишки в чемодане: со своих мест полетят на записку

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    createChipTextures(scene);
    const body = scene.add.rectangle(0, 0, BODY_WIDTH, BODY_HEIGHT, BODY_COLOR).setStrokeStyle(4, BODY_BORDER).setRounded(10);
    const lining = scene.add.rectangle(0, -4, BODY_WIDTH - 24, BODY_HEIGHT - 28, LINING_COLOR).setRounded(6);
    const clasps = [-70, 70].map((x) => scene.add.rectangle(x, BODY_HEIGHT / 2 - 8, 26, 10, 0xfbbf24).setRounded(3));
    for (let row = 0; row < CHIP_ROWS; row++) {
      for (let column = 0; column < CHIP_COLUMNS; column++) {
        const x = (column - (CHIP_COLUMNS - 1) / 2) * CHIP_STEP_X;
        const y = (row - (CHIP_ROWS - 1) / 2) * CHIP_STEP_Y - 4;
        this.chips.push(scene.add.image(x, y, CHIP_TEXTURE).setScale(CHIP_SCALE));
      }
    }
    this.lid = scene.add.rectangle(0, -BODY_HEIGHT / 2, BODY_WIDTH, LID_HEIGHT, BODY_COLOR).setStrokeStyle(4, BODY_BORDER).setOrigin(0.5, 1).setRounded(8);
    this.box = scene.add.container(CENTER_X, CASE_START_Y, [body, lining, ...clasps, ...this.chips, this.lid]);
    this.box.setDepth(POPUP_DEPTH).setVisible(false);
    this.chips.forEach((chip) => chip.setVisible(false));
  }

  /**
   * Чемодан выезжает, крышка откидывается (в нём фишки), они летят на записку — тогда paid() (долг оплачен),
   * чемодан уезжает — тогда done().
   */
  open(paid: () => void, done: () => void = () => {}): void {
    this.lid.setScale(1);
    this.chips.forEach((chip) => chip.setVisible(false));
    this.box.setPosition(CENTER_X, CASE_START_Y).setVisible(true);
    this.scene.tweens.add({
      targets: this.box,
      y: CASE_Y,
      duration: SLIDE_TIME,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: this.lid, scaleY: 0.12, duration: LID_TIME, onComplete: () => this.fly(paid, done) });
        this.chips.forEach((chip) => chip.setVisible(true));
      },
    });
  }

  /** Фишки по одной летят из чемодана на записку; последняя долетела — paid(), чемодан уезжает. */
  private fly(paid: () => void, done: () => void): void {
    const flying = this.chips.map((chip) => {
      const copy = this.scene.add.image(this.box.x + chip.x, this.box.y + chip.y, CHIP_TEXTURE).setScale(CHIP_SCALE).setDepth(POPUP_DEPTH);
      chip.setVisible(false);
      return copy;
    });
    flying.forEach((chip, index) => {
      this.scene.tweens.add({
        targets: chip,
        x: NOTE.x,
        y: NOTE.y,
        scale: FLY_SCALE,
        delay: index * CHIP_STAGGER,
        duration: CHIP_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => chip.destroy(),
      });
    });
    this.scene.time.delayedCall((flying.length - 1) * CHIP_STAGGER + CHIP_FLY_TIME, () => {
      paid();
      this.scene.tweens.add({
        targets: this.box,
        y: CASE_START_Y,
        duration: LEAVE_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.box.setVisible(false);
          done();
        },
      });
    });
  }
}
