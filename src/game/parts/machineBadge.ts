import Phaser from 'phaser';
import { CHARACTERS, type MachineCharacter } from '../characters';
import { characterTexture, createCharacterTextures } from '../decor';
import { t } from '../lang';
import { MACHINE_BADGE, MACHINE_BADGE_SIZE } from '../layout';
import { attachHint, type Hint } from './tooltip';

// Пришёл новый автомат: корпус проступает из темноты своим цветом, значок выскакивает.
const ARRIVE_TIME = 600; // корпус загорается, мс
const ARRIVE_FROM = 0.2; // с такой яркости (0 — чёрный, 1 — свой цвет)
const BADGE_POP_TIME = 450; // значок выскакивает, мс
const BADGE_POP_DELAY = 250;

/** Цвет color, притушенный до доли share: 0 — чёрный, 1 — как есть. */
function dim(color: number, share: number): number {
  const { r, g, b } = Phaser.Display.Color.IntegerToRGB(color);
  return Phaser.Display.Color.GetColor(Math.round(r * share), Math.round(g * share), Math.round(b * share));
}

/**
 * Характер автомата на корпусе: цвет тела корпуса (decor.ts рисует его белым, а красит эта часть — setTint)
 * и значок слева от экрана; навёл на значок — подсказка: название и что автомат делает. У обычного автомата значка нет.
 */
export class MachineBadge {
  private readonly scene: Phaser.Scene;
  private readonly body: Phaser.GameObjects.Image; // тело корпуса
  private readonly badge: Phaser.GameObjects.Image; // значок характера
  private character: MachineCharacter;

  /** body — тело корпуса (его вернул drawMachineBody), character — какой автомат стоит. */
  constructor(scene: Phaser.Scene, body: Phaser.GameObjects.Image, character: MachineCharacter, hint: Hint) {
    this.scene = scene;
    this.body = body;
    this.character = character;
    createCharacterTextures(scene, CHARACTERS, MACHINE_BADGE_SIZE);
    this.badge = scene.add.image(MACHINE_BADGE.x, MACHINE_BADGE.y, characterTexture(CHARACTERS[0]));
    this.badge.setInteractive();
    attachHint(this.badge, hint, () => [t(this.character.name), t(this.character.description)]);
    this.show(character);
  }

  /** Автомат как есть, без анимации: корпус его цвета и значок (у обычного автомата знака нет — и значка нет). */
  show(character: MachineCharacter): void {
    this.character = character;
    this.body.setTint(character.color);
    const hasBadge = character.sign !== '';
    this.badge.setVisible(hasBadge);
    if (hasBadge) this.badge.setTexture(characterTexture(character));
  }

  /** Пришёл новый автомат: корпус проступает из темноты своим цветом, значок выскакивает. */
  arrive(character: MachineCharacter): void {
    this.show(character);
    const light = { share: ARRIVE_FROM };
    this.body.setTint(dim(character.color, light.share));
    this.scene.tweens.add({
      targets: light,
      share: 1,
      duration: ARRIVE_TIME,
      ease: 'Sine.easeOut',
      onUpdate: () => this.body.setTint(dim(character.color, light.share)),
    });
    this.scene.tweens.killTweensOf(this.badge);
    this.badge.setScale(0);
    this.scene.tweens.add({ targets: this.badge, scale: 1, duration: BADGE_POP_TIME, delay: BADGE_POP_DELAY, ease: 'Back.easeOut' });
  }
}
