import Phaser from 'phaser';
import { createEffectSlotTexture, createItemTextures, createShelfTextures, DOOR_CODE_WIDTH, EFFECT_SLOT_TEXTURE, itemTexture, SHELF_CELL_TEXTURE, SHELF_DOOR_TEXTURE } from '../decor';
import {
  activeSlotEffects,
  EFFECT_SLOTS,
  effectCount,
  ITEMS,
  MAX_SLOTS,
  SLOT_EFFECT_IDS,
  type Item,
  type ItemEffects,
  type SlotEffectId,
} from '../items';
import { t } from '../lang';
import { EFFECTS_STEP, EFFECTS_TOP_Y, EFFECT_SLOT, EFFECTS_X, ITEM_SIZE, SHELF_CELL, shelfX, shelfY } from '../layout';
import { addText, LED_STYLE, POPUP_DEPTH, pulse } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Размеры.
const ITEM_ON_SHELF_SCALE = 0.9; // предмет в клетке чуть меньше ниши
const EFFECT_SCALE = 0.55; // включённый предмет у экрана: ниша гнезда 34 px, значок 31 px — не заходит на бронзовую рамку
// Анимации, мс.
const FLY_TIME = 450; // предмет летит из лотка на полку или с полки к экрану
const FADE_TIME = 220; // снятый предмет гаснет у экрана
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

/**
 * Включённые предметы у экрана: только активные, сверху вниз, на четырёх местах (EFFECT_SLOTS в items.ts).
 * Места неподвижны: пятый предмет включается, только когда игрок кликом освободил одно из четырёх.
 * Чеснока в столбике нет: он красит огни вокруг экрана (BaseScene.calmLampColor), сигарета срабатывает сразу.
 */
function effectSpot(index: number): { x: number; y: number } {
  return { x: EFFECTS_X, y: EFFECTS_TOP_Y + index * EFFECTS_STEP };
}

/** Где у экрана встанет включённый предмет: место по активному списку (для летящего — то, что он займёт). */
export function effectPosition(id: SlotEffectId, effects: ItemEffects): { x: number; y: number } {
  return effectSpot(Math.max(0, activeSlotEffects(effects).indexOf(id)));
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
  private readonly effectIcons = new Map<SlotEffectId, Phaser.GameObjects.Image>(); // включённые предметы у экрана
  private readonly effectSpots: Phaser.GameObjects.Image[] = []; // пустые гнёзда столбика: сделка №13 их прячет
  private readonly effectCounts = new Map<SlotEffectId, Phaser.GameObjects.Text>(); // «2», если включено больше одного
  private readonly shelfItems: (Item | null)[] = []; // какой предмет в какой клетке — для подсказки
  private readonly canDiscard: () => boolean; // сейчас можно снимать предмет у экрана (не во время прокрутки и прочего)
  private readonly usable: (item: Item) => boolean; // можно ли предмет сейчас включить (правила — в RoundScene.canUseItem)
  private readonly breathing = new Set<number>(); // слоты, где предмет уже «дышит» — чтобы не плодить твины

  /**
   * slots — сколько клеток открыто; use — что делать, когда кликнули по предмету в клетке;
   * discard — когда кликнули по включённому предмету у экрана (игрок освобождает его место);
   * canDiscard — можно ли снимать сейчас: во время прокрутки, Дилера или последнего шанса случайный клик ничего не портит;
   * usable — можно ли предмет сейчас включить: дышит только то, что реально нажать, а то пульс врёт (DONTLIKE, стр. 3).
   */
  constructor(
    scene: Phaser.Scene,
    slots: number,
    use: (slot: number) => void,
    discard: (id: SlotEffectId) => void,
    canDiscard: () => boolean,
    usable: (item: Item) => boolean,
    hint: Hint,
  ) {
    this.scene = scene;
    this.canDiscard = canDiscard;
    this.usable = usable;
    createItemTextures(scene, ITEMS, ITEM_SIZE);
    createShelfTextures(scene, SHELF_CELL);
    createEffectSlotTexture(scene, EFFECT_SLOT);

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

    // Пустые гнёзда столбика у экрана: места видно всегда, даже когда ни один предмет не включён (DONTLIKE хоч. 11).
    for (let index = 0; index < EFFECT_SLOTS; index++) {
      const { x, y } = effectSpot(index);
      this.effectSpots.push(scene.add.image(x, y, EFFECT_SLOT_TEXTURE));
    }

    // Иконки — на каждый предмет столбика: showEffects расставит первые EFFECT_SLOTS активных, остальные спрятаны.
    for (const [index, id] of SLOT_EFFECT_IDS.entries()) {
      const { x, y } = effectSpot(Math.min(index, EFFECT_SLOTS - 1));
      const item = ITEMS.find((candidate) => candidate.id === id) ?? ITEMS[0];
      const icon = scene.add.image(x, y, itemTexture(item)).setScale(EFFECT_SCALE).setVisible(false);
      icon.setInteractive({ useHandCursor: true });
      attachHint(icon, hint, () => [t(item.name), `${t(item.description)}\n${t('effectRemove')}`], () => this.tryFadeOut(id, discard));
      this.effectIcons.set(id, icon);
      const count = addText(scene, x + 14, y + 12, '', { fontSize: '13px', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 });
      this.effectCounts.set(id, count.setOrigin(0.5));
    }
  }

  /** Клик по значку: снимаем, только если сцена разрешает сейчас, — иначе значок не трогаем. */
  private tryFadeOut(id: SlotEffectId, discard: (id: SlotEffectId) => void): void {
    if (!this.canDiscard()) return; // прокрутка, Дилер, решение по перемешке, последний шанс — клик ничего не портит
    this.fadeOut(id, discard);
  }

  /** Игрок снял предмет у экрана: значок гаснет, потом сцена убирает сам эффект (discard). */
  private fadeOut(id: SlotEffectId, discard: (id: SlotEffectId) => void): void {
    const icon = this.effectIcons.get(id);
    if (!icon || !icon.visible) return; // нечего снимать: предмета у экрана нет
    const label = this.effectCounts.get(id);
    this.scene.tweens.killTweensOf(icon);
    this.scene.tweens.add({
      targets: icon,
      alpha: 0,
      scale: EFFECT_SCALE * 0.6,
      duration: FADE_TIME,
      ease: 'Quad.easeIn',
      onComplete: () => {
        icon.setAlpha(1).setScale(EFFECT_SCALE).setVisible(false);
        label?.setAlpha(1).setText('');
        discard(id);
      },
    });
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
        this.refreshPulses(); // дышит, только если его сейчас можно включить
      },
    });
  }

  /** Купленный предмет «дышит» в клетке, пока его не нажмут (включить или «нельзя» — тряска это останавливает). */
  private breathe(slot: number): void {
    const target = this.items[slot];
    this.scene.tweens.killTweensOf(target);
    target.setX(shelfX(slot)).setAlpha(1); // ровно в клетке: пульс не должен стартовать со сдвига после оборванной тряски
    target.setScale(ITEM_ON_SHELF_SCALE);
    this.breathing.add(slot);
    this.scene.tweens.add({
      targets: target,
      scale: ITEM_ON_SHELF_SCALE * NEW_ITEM_SCALE,
      duration: NEW_ITEM_BREATH,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Пересчитать пульс всех предметов на полке: дышит только то, что сейчас можно включить (usable).
   * Уже дышащие не трогаем (breathing — чтобы не плодить твины); не годящиеся стоят ровно: scale и alpha обычные.
   * Сцена зовёт после включения предмета и после того, как игрок освободил место у экрана, а putItem — когда
   * купленный предмет долетел в клетку: правила изменились, пульс пересчитываем.
   */
  refreshPulses(): void {
    this.shelfItems.forEach((item, slot) => {
      const canUse = item !== null && this.usable(item);
      if (canUse && !this.breathing.has(slot)) this.breathe(slot);
      else if (!canUse) this.stopBreathing(slot);
    });
  }

  /** Пульс выключен: твины убиты, предмет стоит ровно в клетке (обычные scale и alpha). */
  private stopBreathing(slot: number): void {
    this.breathing.delete(slot);
    const target = this.items[slot];
    this.scene.tweens.killTweensOf(target);
    target.setX(shelfX(slot)).setScale(ITEM_ON_SHELF_SCALE).setAlpha(1);
  }

  /** Включили предмет: он улетает из клетки slot к (toX, toY) и там тает. Долетел — landed(). */
  takeItem(slot: number, toX: number, toY: number, landed: () => void): void {
    this.shelfItems[slot] = null;
    const item = this.items[slot];
    this.breathing.delete(slot); // перестал «дышать»
    this.scene.tweens.killTweensOf(item);
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
    this.shake(slot);
  }

  /** На полке нет свободного места: трясутся все предметы. */
  shakeFull(): void {
    this.items.forEach((_, slot) => this.shake(slot));
  }

  /** Тряска «нельзя»: влево-вправо и на место. */
  private shake(slot: number): void {
    const target = this.items[slot];
    const homeX = shelfX(slot);
    this.breathing.delete(slot); // и «дышать» перестаёт: на предмет уже нажимали
    this.scene.tweens.killTweensOf(target);
    target.setX(homeX).setScale(ITEM_ON_SHELF_SCALE);
    this.scene.tweens.add({ targets: target, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => target.setX(homeX) });
  }

  /**
   * Столбик у экрана: первые EFFECT_SLOTS включённых предметов сверху вниз (страховка от старой записи кассеты,
   * где эффектов могло быть больше); если включено несколько одинаковых — рядом число.
   * limit — сколько мест показывает сделка №13: лишние пустые гнёзда прячутся, но уже включённые предметы
   * остаются на своих местах (они и раньше жили до clearEffect).
   */
  showEffects(effects: ItemEffects, limit = EFFECT_SLOTS): void {
    // Не число, NaN или ∞ из чужой сделки — обычный столбик, иначе Math.trunc(NaN) погасил бы все гнёзда.
    const places = Number.isFinite(limit) ? Math.max(0, Math.min(EFFECT_SLOTS, Math.trunc(limit))) : EFFECT_SLOTS;
    for (const [index, spot] of this.effectSpots.entries()) spot.setVisible(index < places);
    const active = activeSlotEffects(effects).slice(0, EFFECT_SLOTS);
    for (const [index, id] of active.entries()) {
      const count = effectCount(effects, id);
      const icon = this.effectIcons.get(id);
      const label = this.effectCounts.get(id);
      if (!icon || !label) continue;
      const { x, y } = effectSpot(index);
      icon.setPosition(x, y);
      label.setPosition(x + 14, y + 12);
      if (!icon.visible) pulse(this.scene, icon.setVisible(true), 1.25, EFFECT_SCALE);
      label.setText(count > 1 ? String(count) : '');
    }
    for (const [id, icon] of this.effectIcons) {
      if (active.includes(id)) continue;
      icon.setVisible(false);
      this.effectCounts.get(id)?.setText('');
    }
  }

  /** Включённый предмет сработал: его копия летит от столбика к (toX, toY), раздувается и тает. */
  spend(id: SlotEffectId, toX: number, toY: number): void {
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
