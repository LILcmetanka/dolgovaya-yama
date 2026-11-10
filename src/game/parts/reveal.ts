import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH, type Box } from '../layout';
import { REVEAL_DEPTH } from '../theme';

// Тьма первого забега: почти чёрная картинка на весь вид, в которой «проткнуты» пятна света.
const REVEAL_TEXTURE = 'reveal-dark';
const DARK_COLOR = '#050403'; // цвет тьмы — не чёрный: комната в нём угадывается
const MACHINE_GLOW_PAD = 12; // пятно автомата шире его краёв на столько (полуразмер)
const NOTE_GLOW_EXTRA = 40; // пятно записки шире и выше её на столько
const GLOW_CORE = 0.8; // до этой доли радиуса пятно светлое целиком, дальше — мягкий край; при 0.55 темнели табло, табло прокруток и окошко выплаты
const NOTE_OPEN_FROM = 0.6; // пятно записки в начале открытия: сразу видно, что там что-то есть
const NOTE_OPEN_TIME = 350; // столько растёт пятно записки, мс
const FADE_TIME = 500; // столько тьма гаснет, мс

/** Пятно света в координатах вида (сцена приклеена к экрану): середина и полуразмеры. */
interface Hole {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * Тьма первого забега: виден только автомат в пятне света. После третьей прокрутки из тьмы проступает записка с долгом,
 * а когда приходит Коллектор — тьма гаснет совсем. Рисуется на canvas: пятна — мягкие дыры в почти чёрной заливке.
 * Перерисовка — только при открытии записки, в остальное время текстура статична.
 */
export class Reveal {
  private readonly scene: Phaser.Scene;
  private readonly texture: Phaser.Textures.CanvasTexture | null;
  private image: Phaser.GameObjects.Image | null; // сама тьма на экране; null — её уже нет
  private readonly machine: Hole;
  private readonly note: Hole;
  private isNoteOpen = false; // пятно записки проступает
  private noteOpen = 0; // 0…1 — насколько оно открылось
  private isFading = false; // тьма уже гаснет: второй раз твин не запускаем

  constructor(scene: Phaser.Scene, homeScroll: number, machine: Box, note: Box) {
    this.scene = scene;
    this.machine = {
      x: machine.x - homeScroll,
      y: machine.y,
      rx: machine.width / 2 + MACHINE_GLOW_PAD,
      ry: machine.height / 2 + MACHINE_GLOW_PAD,
    };
    this.note = {
      x: note.x - homeScroll,
      y: note.y,
      rx: note.width / 2 + NOTE_GLOW_EXTRA,
      ry: note.height / 2 + NOTE_GLOW_EXTRA,
    };
    // После перезапуска сцены текстура осталась — старую убираем, рисуем заново.
    if (scene.textures.exists(REVEAL_TEXTURE)) scene.textures.remove(REVEAL_TEXTURE);
    this.texture = scene.textures.createCanvas(REVEAL_TEXTURE, VIEW_WIDTH, VIEW_HEIGHT);
    this.redraw();
    this.image = this.texture
      ? scene.add.image(0, 0, REVEAL_TEXTURE).setOrigin(0).setScrollFactor(0).setDepth(REVEAL_DEPTH)
      : null;
  }

  /** Тьма ещё на экране (не погасла). */
  get isActive(): boolean {
    return this.image !== null;
  }

  /** Из тьмы проступает записка с долгом: пятно света растёт, звук играет сцена. */
  openNote(): void {
    if (!this.image || this.isNoteOpen) return;
    this.isNoteOpen = true;
    this.redraw(); // пятно сразу появляется маленьким — видно, что там что-то новое
    this.scene.tweens.add({
      targets: this,
      noteOpen: 1,
      duration: NOTE_OPEN_TIME,
      onUpdate: () => this.redraw(),
    });
  }

  /** Тьма гаснет совсем; onDone — когда её уже нет (обучение пройдено). */
  finish(onDone?: () => void): void {
    if (!this.image) return;
    if (this.isFading) return;
    this.isFading = true;
    const image = this.image;
    this.scene.tweens.add({
      targets: image,
      alpha: 0,
      duration: FADE_TIME,
      onComplete: () => {
        image.destroy();
        this.image = null;
        onDone?.();
      },
    });
  }

  /** Залить тьму заново и проткнуть в ней пятна: автомата — всегда, записки — если открыта. */
  private redraw(): void {
    if (!this.texture) return;
    const ctx = this.texture.context;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = DARK_COLOR;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.globalCompositeOperation = 'destination-out'; // дальше рисуем «дыры» — тьма из них вырезается
    this.punchMachine(this.machine);
    if (this.isNoteOpen) this.punchSpot(this.note, NOTE_OPEN_FROM + (1 - NOTE_OPEN_FROM) * this.noteOpen);
    ctx.globalCompositeOperation = 'source-over';
    this.texture.refresh(); // передать нарисованное в видеокарту
  }

  /** Мягкая дыра в тьме для записки: эллипс hole, выросший в scale раз от своего полного размера. */
  private punchSpot(hole: Hole, scale: number): void {
    if (!this.texture) return;
    const ctx = this.texture.context;
    ctx.save();
    ctx.translate(hole.x, hole.y);
    ctx.scale(hole.rx * scale, hole.ry * scale);
    const glow = ctx.createRadialGradient(0, 0, GLOW_CORE, 0, 0, 1);
    glow.addColorStop(0, 'rgba(0,0,0,1)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Дыра в тьме для автомата: прямоугольник по размеру корпуса со скруглёнными углами и мягкой кромкой. */
  private punchMachine(hole: Hole): void {
    if (!this.texture) return;
    const ctx = this.texture.context;
    ctx.save();
    ctx.translate(hole.x, hole.y);
    if ('filter' in ctx) ctx.filter = 'blur(22px)'; // мягкая кромка; где нет фильтра — останется жёсткий край
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(-hole.rx, -hole.ry, hole.rx * 2, hole.ry * 2, 28);
    ctx.fill();
    ctx.restore();
  }
}
