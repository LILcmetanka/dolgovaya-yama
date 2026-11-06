import Phaser from 'phaser';
import { MAGNIFIER } from '../collectorGame';
import { createItemTextures, createShelfTextures, DOOR_CODE_WIDTH, itemTexture, SHELF_CELL_TEXTURE, SHELF_DOOR_TEXTURE } from '../decor';
import { ITEMS, MAX_SLOTS, type Item, type ItemEffects } from '../items';
import { t } from '../lang';
import { BULLET } from '../shot';
import { EFFECTS_STEP, EFFECTS_TOP_Y, EFFECTS_X, ITEM_SIZE, SHELF_CELL, shelfX, shelfY } from '../layout';
import { addText, LED_STYLE, POPUP_DEPTH, pulse } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Размеры.
const ITEM_ON_SHELF_SCALE = 0.9; // предмет в клетке чуть меньше ниши
const EFFECT_SCALE = 0.68; // включённый предмет у экрана ещё меньше
// Анимации, мс.
const FLY_TIME = 450; // предмет летит из лотка на полку или с полки к экрану
// Кодовый замок купленного отсека: колёсики крутятся, по одному встают на цифры кода, дверца уезжает в сторону.
const CODE_DIGITS = 3;
const CODE_SPIN_STEP = 60; // мс: цифры на колёсиках сменяются так часто, пока крутятся
const CODE_LOCK_TIMES = [500, 850, 1200]; // мс от начала: когда встаёт первое, второе и третье колёсико
const DOOR_OPEN_DELAY = 1500; // дверца уезжает, когда встало последнее колёсико и замок щёлкнул
const DOOR_OPEN_TIME = 350;
const DOOR_SLIDE = 66; // на сколько дверца уезжает вбок
const DIGIT_FONT = '17px';
const DIGIT_COLOR = '#fbbf24'; // как цифры табло
const DIGIT_LOCKED_COLOR = '#4ade80'; // встало на место — зелёная
const SHAKE_TIME = 50; // один рывок тряски «нельзя»
const SPEND_TIME = 400; // включённый предмет сработал: летит к месту и тает
const NEW_ITEM_SCALE = 1.15; // купленный предмет «дышит» (увеличивается во столько раз), пока его не нажмут: видно, что он нажимается
const NEW_ITEM_BREATH = 550; // один вдох, мс

/** Включённые предметы у экрана: щит, чеснок и ×3, у каждого свой ряд. Сигарета действует сразу — её там нет. */
type EffectId = 'shield' | 'garlic' | 'triple';
const EFFECT_IDS: EffectId[] = ['shield', 'garlic', 'triple'];

/** Сколько раз ещё сработает включённый предмет (у чеснока — 1, пока он действует). */
function effectCount(effects: ItemEffects, id: EffectId): number {
  if (id === 'shield') return effects.shields;
  if (id === 'triple') return effects.tripleTakes;
  return effects.isGarlicOn ? 1 : 0;
}

/** Где у экрана стоит включённый предмет. */
export function effectPosition(id: EffectId): { x: number; y: number } {
  return { x: EFFECTS_X, y: EFFECTS_TOP_Y + EFFECT_IDS.indexOf(id) * EFFECTS_STEP };
}

/**
 * Полки с предметами на стене под запиской: две полки по 4 клетки столбиком, закрытые заколочены досками.
 * Клик по предмету (или клавиша 1–8, её ловит сцена) — включить. И столбик включённых предметов справа от экрана.
 */
export class ItemShelf {
  private readonly scene: Phaser.Scene;
  private readonly items: Phaser.GameObjects.Image[] = []; // предмет в клетке; пустая клетка — картинка скрыта
  private readonly doors: Phaser.GameObjects.Container[] = []; // стальные дверцы с кодом на закрытых отсеках; открытый — скрыта
  private readonly digits: Phaser.GameObjects.Text[][] = []; // цифры кода на дверце каждого отсека
  private readonly effectIcons = new Map<EffectId, Phaser.GameObjects.Image>(); // включённые предметы у экрана
  private readonly effectCounts = new Map<EffectId, Phaser.GameObjects.Text>(); // «2», если включено больше одного
  private readonly shelfItems: (Item | null)[] = []; // какой предмет в какой клетке — для подсказки

  /** slots — сколько клеток открыто; use — что делать, когда кликнули по предмету в клетке. */
  constructor(scene: Phaser.Scene, slots: number, use: (slot: number) => void, hint: Hint) {
    this.scene = scene;
    createItemTextures(scene, [...ITEMS, BULLET, MAGNIFIER], ITEM_SIZE); // и патрон, и лупа: они тоже лежат на полке
    createShelfTextures(scene, SHELF_CELL);

    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const x = shelfX(slot);
      const y = shelfY(slot);
      scene.add.image(x + 2, y + 2, SHELF_CELL_TEXTURE); // текстура с тенью — чуть больше клетки
      const item = scene.add.image(x, y, itemTexture(ITEMS[0])).setScale(ITEM_ON_SHELF_SCALE).setVisible(false);
      item.setInteractive({ useHandCursor: true });
      attachHint(item, hint, () => this.hintFor(slot), () => use(slot));
      this.items.push(item);
      this.shelfItems.push(null);
      const door = this.buildDoor(x, y, slot);
      door.setVisible(slot >= slots);
      attachHint(door, hint, () => [t('closedSlot'), t('closedSlotHow')]);
      this.doors.push(door);
    }

    for (const id of EFFECT_IDS) {
      const { x, y } = effectPosition(id);
      const item = ITEMS.find((candidate) => candidate.id === id) ?? ITEMS[0];
      const icon = scene.add.image(x, y, itemTexture(item)).setScale(EFFECT_SCALE).setVisible(false);
      icon.setInteractive();
      attachHint(icon, hint, () => [t(item.name), t(item.description)]);
      this.effectIcons.set(id, icon);
      const count = addText(scene, x + 14, y + 12, '', { fontSize: '13px', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 });
      this.effectCounts.set(id, count.setOrigin(0.5));
    }
  }

  /** Дверца отсека slot: стальная плита, на ней три цифры кода (пока закрыто — нули). По ней наводят подсказку. */
  private buildDoor(x: number, y: number, slot: number): Phaser.GameObjects.Container {
    const plate = this.scene.add.image(0, 0, SHELF_DOOR_TEXTURE);
    const step = DOOR_CODE_WIDTH / CODE_DIGITS;
    const texts = Array.from({ length: CODE_DIGITS }, (_, index) =>
      addText(this.scene, (index - (CODE_DIGITS - 1) / 2) * step, 0, '0', { ...LED_STYLE, fontSize: DIGIT_FONT, color: DIGIT_COLOR }).setOrigin(0.5),
    );
    this.digits[slot] = texts;
    const door = this.scene.add.container(x, y, [plate, ...texts]);
    door.setSize(SHELF_CELL, SHELF_CELL).setInteractive();
    return door;
  }

  /** Код отсека slot — три цифры, у каждого отсека свой и всегда один и тот же (не случайность: колёсики просто крутятся к нему). */
  private codeOf(slot: number): number[] {
    const number = 100 + ((slot * 7919 + 13) % 900);
    return String(number).split('').map(Number);
  }

  /**
   * Купили место: на дверце отсека slot колёсики кода крутятся, по одному встают на цифры (зелёные), замок щёлкает,
   * и дверца уезжает в сторону.
   */
  openSlot(slot: number): void {
    const door = this.doors[slot];
    const texts = this.digits[slot];
    const code = this.codeOf(slot);
    const locked = [false, false, false];
    const spin = this.scene.time.addEvent({
      delay: CODE_SPIN_STEP,
      loop: true,
      callback: () => texts.forEach((text, index) => text.setText(String(locked[index] ? code[index] : Phaser.Math.RND.between(0, 9)))),
    });
    CODE_LOCK_TIMES.forEach((time, index) => {
      this.scene.time.delayedCall(time, () => {
        locked[index] = true;
        texts[index].setText(String(code[index])).setColor(DIGIT_LOCKED_COLOR);
        pulse(this.scene, texts[index], 1.4);
      });
    });
    this.scene.time.delayedCall(DOOR_OPEN_DELAY, () => {
      spin.remove();
      this.scene.tweens.add({
        targets: door,
        x: door.x + DOOR_SLIDE,
        alpha: 0,
        duration: DOOR_OPEN_TIME,
        ease: 'Quad.easeIn',
        onComplete: () => door.setVisible(false),
      });
    });
  }

  /** Подсказка клетки: что за предмет и что он делает. */
  private hintFor(slot: number): [string, string] | null {
    const item = this.shelfItems[slot];
    return item ? [t(item.name), t(item.description)] : null;
  }

  /** Полка с кассеты (сохранённый забег): предметы сразу в клетках, без полёта. */
  setItems(shelf: (Item | null)[]): void {
    shelf.forEach((item, slot) => {
      this.shelfItems[slot] = item;
      if (item) this.items[slot].setTexture(itemTexture(item)).setVisible(true);
    });
  }

  /** Купили предмет: он летит из (fromX, fromY) — лотка торгового автомата — в клетку slot. */
  putItem(slot: number, item: Item, fromX: number, fromY: number): void {
    this.shelfItems[slot] = item;
    const target = this.items[slot];
    const flying = this.scene.add.image(fromX, fromY, itemTexture(item)).setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: flying,
      x: target.x,
      y: target.y,
      scale: ITEM_ON_SHELF_SCALE,
      duration: FLY_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        flying.destroy();
        target.setTexture(itemTexture(item)).setVisible(true);
        this.breathe(target);
      },
    });
  }

  /** Купленный предмет «дышит» в клетке, пока его не нажмут (включить или «нельзя» — тряска это останавливает). */
  private breathe(target: Phaser.GameObjects.Image): void {
    this.scene.tweens.killTweensOf(target);
    target.setScale(ITEM_ON_SHELF_SCALE);
    this.scene.tweens.add({
      targets: target,
      scale: ITEM_ON_SHELF_SCALE * NEW_ITEM_SCALE,
      duration: NEW_ITEM_BREATH,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Включили предмет: он улетает из клетки slot к (toX, toY) и там тает. Долетел — landed(). */
  takeItem(slot: number, toX: number, toY: number, landed: () => void): void {
    this.shelfItems[slot] = null;
    const item = this.items[slot];
    this.scene.tweens.killTweensOf(item); // перестал «дышать»
    item.setScale(ITEM_ON_SHELF_SCALE).setVisible(false);
    const flying = this.scene.add.image(item.x, item.y, item.texture.key).setScale(ITEM_ON_SHELF_SCALE).setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: flying,
      x: toX,
      y: toY,
      scale: EFFECT_SCALE,
      duration: FLY_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        flying.destroy();
        landed();
      },
    });
  }

  /** Нельзя: предмет в клетке slot коротко трясётся. */
  deny(slot: number): void {
    this.shake(this.items[slot], shelfX(slot));
  }

  /** На полке нет свободного места: трясутся все предметы. */
  shakeFull(): void {
    this.items.forEach((item, slot) => this.shake(item, shelfX(slot)));
  }

  /** Тряска «нельзя»: влево-вправо и на место. */
  private shake(target: Phaser.GameObjects.Image, homeX: number): void {
    this.scene.tweens.killTweensOf(target); // и «дышать» перестаёт: на предмет уже нажимали
    target.setX(homeX).setScale(ITEM_ON_SHELF_SCALE);
    this.scene.tweens.add({ targets: target, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => target.setX(homeX) });
  }

  /** Столбик у экрана: виден каждый включённый предмет; если включено несколько одинаковых — рядом число. */
  showEffects(effects: ItemEffects): void {
    for (const id of EFFECT_IDS) {
      const count = effectCount(effects, id);
      const icon = this.effectIcons.get(id);
      const label = this.effectCounts.get(id);
      if (!icon || !label) continue;
      if (count > 0 && !icon.visible) pulse(this.scene, icon.setVisible(true), 1.25, EFFECT_SCALE);
      icon.setVisible(count > 0);
      label.setText(count > 1 ? String(count) : '');
    }
  }

  /** Включённый предмет сработал: его копия летит от столбика к (toX, toY), раздувается и тает. */
  spend(id: EffectId, toX: number, toY: number): void {
    const icon = this.effectIcons.get(id);
    if (!icon) return;
    const flying = this.scene.add.image(icon.x, icon.y, icon.texture.key).setScale(EFFECT_SCALE).setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: flying,
      x: toX,
      y: toY,
      scale: 1.6,
      alpha: { value: 0, delay: SPEND_TIME / 2, duration: SPEND_TIME / 2 },
      duration: SPEND_TIME,
      ease: 'Quad.easeOut',
      onComplete: () => flying.destroy(),
    });
  }
}
