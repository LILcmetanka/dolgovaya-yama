import Phaser from 'phaser';
import { createItemTextures, createShelfTextures, itemTexture, SHELF_CELL_TEXTURE, SHELF_PLANKS_TEXTURE } from '../decor';
import { ITEMS, MAX_SLOTS, type Item, type ItemEffects } from '../items';
import { t } from '../lang';
import { BULLET } from '../shot';
import { EFFECTS_STEP, EFFECTS_TOP_Y, EFFECTS_X, ITEM_SIZE, SHELF_CELL, SHELF_COLUMN, shelfX, shelfY } from '../layout';
import { addKeyHint, addText, POPUP_DEPTH, pulse } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Размеры.
const ITEM_ON_SHELF_SCALE = 0.9; // предмет в клетке чуть меньше ниши
const KEY_HINT_GAP = 12; // номер клавиши — на столько от клетки: у первой полки справа, у второй слева
const EFFECT_SCALE = 0.68; // включённый предмет у экрана ещё меньше
// Анимации, мс.
const FLY_TIME = 450; // предмет летит из лотка на полку или с полки к экрану
const PLANKS_FALL_TIME = 600; // доски слетают с купленной клетки
const SHAKE_TIME = 50; // один рывок тряски «нельзя»
const SPEND_TIME = 400; // включённый предмет сработал: летит к месту и тает

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
  private readonly planks: Phaser.GameObjects.Image[] = []; // доски на клетке; открытая — скрыты
  private readonly effectIcons = new Map<EffectId, Phaser.GameObjects.Image>(); // включённые предметы у экрана
  private readonly effectCounts = new Map<EffectId, Phaser.GameObjects.Text>(); // «2», если включено больше одного
  private readonly shelfItems: (Item | null)[] = []; // какой предмет в какой клетке — для подсказки

  /** slots — сколько клеток открыто; use — что делать, когда кликнули по предмету в клетке. */
  constructor(scene: Phaser.Scene, slots: number, use: (slot: number) => void, hint: Hint) {
    this.scene = scene;
    createItemTextures(scene, [...ITEMS, BULLET], ITEM_SIZE); // и патрон: он тоже лежит на полке
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
      const planks = scene.add.image(x, y, SHELF_PLANKS_TEXTURE).setVisible(slot >= slots);
      planks.setInteractive();
      attachHint(planks, hint, () => [t('closedSlot'), t('closedSlotHow')]);
      this.planks.push(planks);
      const side = slot < SHELF_COLUMN ? 1 : -1; // первая полка — номер справа, вторая — слева, снаружи от полок
      addKeyHint(scene, x + side * (SHELF_CELL / 2 + KEY_HINT_GAP), y, String(slot + 1));
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

  /** Купили место: доски слетают с клетки slot. */
  openSlot(slot: number): void {
    const planks = this.planks[slot];
    this.scene.tweens.add({
      targets: planks,
      y: planks.y + 70,
      angle: 35,
      alpha: 0,
      duration: PLANKS_FALL_TIME,
      ease: 'Quad.easeIn',
      onComplete: () => planks.setVisible(false),
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
        pulse(this.scene, target, 1.15, ITEM_ON_SHELF_SCALE);
      },
    });
  }

  /** Включили предмет: он улетает из клетки slot к (toX, toY) и там тает. Долетел — landed(). */
  takeItem(slot: number, toX: number, toY: number, landed: () => void): void {
    this.shelfItems[slot] = null;
    const item = this.items[slot];
    item.setVisible(false);
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
    this.scene.tweens.killTweensOf(target);
    target.setX(homeX);
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
