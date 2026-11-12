import Phaser from 'phaser';
import { characterTexture, createCharacterTextures, createTicketTexture, TICKET_TEXTURE } from '../decor';
import { t } from '../lang';
import {
  MACHINE_BADGE_SIZE,
  MACHINE_BRANCH_LEFT,
  MACHINE_BRANCH_RIGHT,
  MACHINE_PICKER,
  MACHINE_ROW_H,
  MACHINE_ROW_W,
  MACHINE_ROW_X,
  MACHINE_ROW_Y,
} from '../layout';
import { BRANCH_NAMES, MACHINES, machineSpec, type MachineBranch, type MachineId, type MachineLevel } from '../machines';
import { addText, GOLD_TEXT, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Что где в строке: значок автомата, название с уровнем и паспорт слева, цена следующего уровня справа.
const ICON_X = -MACHINE_ROW_W / 2 + 20;
const TEXT_X = -MACHINE_ROW_W / 2 + 38;
// Ценник прижат вправо: имя и паспорт кончаются на +53, билет — с +63, «× 3» — до +108 из 120.
const PRICE_ICON_X = MACHINE_ROW_W / 2 - 48; // 72
const PRICE_TEXT_X = MACHINE_ROW_W / 2 - 36; // 84
const PRICE_ZONE_X = MACHINE_ROW_W / 2 - 30; // 90: зона 60…120
const PRICE_ZONE_W = 60;
const NAME_Y = -11;
const PLUS_Y = 0;
const MINUS_Y = 11;
const ICON_SCALE = 0.8;
const PRICE_ICON_SCALE = 0.5;
const FACE_FONT = '13px';
const PASSPORT_FONT = '9px';
const PLAIN_COLOR = '#a8a29e'; // уровень и невыбранная ветка — серым
// Цвета.
const PLATE_COLOR = 0x0b0f19;
const PLATE_ALPHA = 0.9;
const RIM_COLOR = 0x5b3a1e;
const SELECTED_RIM = 0xfbbf24;
const IDLE_RIM = 0x3f3f46;
const PLUS_COLOR = '#4ade80';
const MINUS_COLOR = '#f87171';
// Анимации, мс.
const SHAKE_TIME = 50; // один рывок тряски «не хватает билетов»
const SHAKE_STEP = 6;

/** Строка выбора: автомат, его уровень, цена следующего уровня и выбран ли он сейчас. */
export interface MachineRow {
  id: MachineId;
  level: MachineLevel;
  branch: MachineBranch | null;
  price: number | null; // цена следующего уровня в билетах; null — последний уровень
  selected: boolean;
}

/** Что нарисовано в одной строке: плашка, значок, подписи, ценник и зоны нажатия. */
interface RowView {
  plate: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image | null; // у классического автомата знака нет — вместо медальона эмодзи
  sign: Phaser.GameObjects.Text | null;
  name: Phaser.GameObjects.Text;
  plus: Phaser.GameObjects.Text;
  minus: Phaser.GameObjects.Text;
  priceChip: Phaser.GameObjects.Image;
  priceText: Phaser.GameObjects.Text;
  rowZone: Phaser.GameObjects.Zone;
  priceZone: Phaser.GameObjects.Zone;
}

/** Кнопка ветки третьего уровня: плашка, подпись и зона нажатия. */
interface BranchView {
  branch: MachineBranch;
  plate: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

/**
 * Выбор автомата в магазине: три строки с паспортами и ценой следующего уровня, внизу — две кнопки веток
 * третьего уровня. Клик по строке выбирает автомат (это бесплатно), клик по ценнику — прокачивает его за билеты;
 * что именно купить и хватает ли билетов, решает ShopScene, здесь — показ и тряска «не хватает билетов».
 * Выбор встаёт на место со следующего раунда (ShopScene.leaveShop).
 */
export class MachinePicker {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container; // слой магазина: панель выбора лежит на ней
  private readonly rows: RowView[] = [];
  private readonly branches: BranchView[] = [];
  private lastRows: MachineRow[] = []; // что показано сейчас: по этому ценник понимает, что покупать

  /** pick(id) — выбрали автомат; upgrade(id) — нажали ценник; branch(b) — выбрали ветку третьего уровня. */
  constructor(
    scene: Phaser.Scene,
    pick: (id: MachineId) => void,
    upgrade: (id: MachineId) => void,
    branch: (branch: MachineBranch) => void,
    hint: Hint,
    layer: Phaser.GameObjects.Container,
  ) {
    this.scene = scene;
    this.layer = layer;
    createCharacterTextures(scene, MACHINES, MACHINE_BADGE_SIZE);
    createTicketTexture(scene);

    const plate = scene.add.rectangle(MACHINE_PICKER.x, MACHINE_PICKER.y, MACHINE_PICKER.width, MACHINE_PICKER.height, PLATE_COLOR, PLATE_ALPHA);
    plate.setStrokeStyle(2, RIM_COLOR).setRounded(10);
    this.layer.add(plate);

    for (const [index, machine] of MACHINES.entries()) this.rows.push(this.buildRow(index, machine.id, pick, upgrade, hint));
    this.branches.push(this.buildBranch('skull', MACHINE_BRANCH_LEFT, branch, hint));
    this.branches.push(this.buildBranch('spin', MACHINE_BRANCH_RIGHT, branch, hint));
  }

  /** Одна строка выбора: плашка, значок, название с уровнем, паспорт и ценник. */
  private buildRow(index: number, id: MachineId, pick: (id: MachineId) => void, upgrade: (id: MachineId) => void, hint: Hint): RowView {
    const scene = this.scene;
    const spec = machineSpec({ id, level: 1, branch: null });
    const x = MACHINE_ROW_X;
    const y = MACHINE_ROW_Y[index];
    const plate = scene.add.rectangle(x, y, MACHINE_ROW_W, MACHINE_ROW_H, PLATE_COLOR, 0.6).setStrokeStyle(1.5, IDLE_RIM).setRounded(8);
    this.layer.add(plate);
    // Значок — медальон, как на корпусе; у классического автомата знака нет, поэтому то же, что в «Кто есть кто».
    const hasSign = spec.sign !== '';
    const icon = hasSign ? scene.add.image(x + ICON_X, y, characterTexture(spec)).setScale(ICON_SCALE) : null;
    const sign = hasSign ? null : addText(scene, x + ICON_X, y, '🎰', { fontSize: '17px' }).setOrigin(0.5);
    const name = addText(scene, x + TEXT_X, y + NAME_Y, '', { ...LED_STYLE, fontSize: FACE_FONT }).setOrigin(0, 0.5);
    const plus = addText(scene, x + TEXT_X, y + PLUS_Y, '', { fontSize: PASSPORT_FONT, color: PLUS_COLOR }).setOrigin(0, 0.5);
    const minus = addText(scene, x + TEXT_X, y + MINUS_Y, '', { fontSize: PASSPORT_FONT, color: MINUS_COLOR }).setOrigin(0, 0.5);
    const priceChip = scene.add.image(x + PRICE_ICON_X, y, TICKET_TEXTURE).setScale(PRICE_ICON_SCALE);
    const priceText = addText(scene, x + PRICE_TEXT_X, y, '', { ...LED_STYLE, fontSize: FACE_FONT }).setOrigin(0, 0.5);
    for (const part of [icon, sign, name, plus, minus, priceChip, priceText]) if (part) this.layer.add(part);

    const rowZone = scene.add.zone(x, y, MACHINE_ROW_W, MACHINE_ROW_H).setInteractive({ useHandCursor: true });
    attachHint(rowZone, hint, () => [t(spec.name), `${t(spec.plus)}\n${t(spec.minus)}\n${t('machinePickWhat')}`], () => pick(id));
    this.layer.add(rowZone);

    // Ценник — своя зона поверх строки: клик по нему покупает уровень, а не просто выбирает автомат.
    const priceZone = scene.add.zone(x + PRICE_ZONE_X, y, PRICE_ZONE_W, MACHINE_ROW_H).setInteractive({ useHandCursor: true });
    attachHint(priceZone, hint, () => this.priceHint(id), () => upgrade(id));
    this.layer.add(priceZone);

    return { plate, icon, sign, name, plus, minus, priceChip, priceText, rowZone, priceZone };
  }

  /** Кнопка ветки третьего уровня: плашка с подписью; видна, только когда у выбранного автомата третий уровень. */
  private buildBranch(branch: MachineBranch, box: { x: number; y: number; width: number; height: number }, choose: (branch: MachineBranch) => void, hint: Hint): BranchView {
    const scene = this.scene;
    const plate = scene.add.rectangle(box.x, box.y, box.width, box.height, PLATE_COLOR, 0.85).setStrokeStyle(1.5, IDLE_RIM).setRounded(7);
    const label = addText(scene, box.x, box.y, '', { ...LED_STYLE, fontSize: '11px' }).setOrigin(0.5);
    const zone = scene.add.zone(box.x, box.y, box.width, box.height);
    attachHint(zone, hint, () => [t(BRANCH_NAMES[branch]), t('machineBranchWhat')], () => choose(branch));
    this.layer.add([plate, label, zone]);
    return { branch, plate: plate.setVisible(false), label: label.setVisible(false), zone };
  }

  /** Подсказка ценника: сколько билетов, что даст следующий уровень и что на 3-м ветку можно сменить. */
  private priceHint(id: MachineId): [string, string] {
    const row = this.rowOf(id);
    if (!row || row.price === null) return [t('machineMaxLevel'), t(machineSpec({ id, level: 3, branch: null }).name)];
    const next = row.level + 1;
    const text = next === 3 ? `${t('machineUpgradeWhat', row.price)}\n${t('machineUpgradeBranch')}` : t('machineUpgradeWhat', row.price);
    return [t('machineUpgrade', next), text];
  }

  private rowOf(id: MachineId): MachineRow | null {
    return this.lastRows.find((row) => row.id === id) ?? null;
  }

  /** Показать выбор: строки автоматов и их ценники по числу билетов на табло. */
  show(rows: MachineRow[], tickets: number): void {
    this.lastRows = rows;
    rows.forEach((row, index) => this.showRow(index, row, tickets));
    const selected = rows.find((row) => row.selected) ?? null;
    const isThirdLevel = selected?.level === 3;
    for (const view of this.branches) {
      const isChosen = isThirdLevel && selected?.branch === view.branch;
      view.plate.setVisible(isThirdLevel).setStrokeStyle(isChosen ? 2 : 1.5, isChosen ? SELECTED_RIM : IDLE_RIM);
      view.label.setVisible(isThirdLevel).setColor(isChosen ? LED_COLOR : PLAIN_COLOR).setText(t(BRANCH_NAMES[view.branch]));
      if (isThirdLevel) view.zone.setInteractive({ useHandCursor: true });
      else view.zone.disableInteractive();
    }
  }

  /** Одна строка как есть: уровень, паспорт, цена следующего уровня и подсветка выбранного. */
  private showRow(index: number, row: MachineRow, tickets: number): void {
    const view = this.rows[index];
    const spec = machineSpec({ id: row.id, level: row.level, branch: row.branch });
    view.name.setText(`${t(spec.name)} · ${row.level}`); // уровень — числом: «Классический · 1», без «ур.» — влезает
    view.plus.setText(t(spec.plus));
    view.minus.setText(t(spec.minus));
    view.plate.setAlpha(row.selected ? 1 : 0.55).setStrokeStyle(row.selected ? 2 : 1.5, row.selected ? SELECTED_RIM : IDLE_RIM);

    const price = row.price;
    view.priceChip.setVisible(price !== null);
    view.priceText.setText(price === null ? '✓' : `× ${price}`);
    view.priceText.setColor(price === null ? GOLD_TEXT : price <= tickets ? LED_COLOR : RED_TEXT);
    // Ценник покупает только у выбранного автомата: клик по чужой строке — это выбор, а не покупка.
    if (row.selected && price !== null) view.priceZone.setInteractive({ useHandCursor: true });
    else view.priceZone.disableInteractive();
  }

  /** Не хватает билетов: строка автомата id трясётся. */
  deny(id: MachineId): void {
    const index = this.lastRows.findIndex((row) => row.id === id);
    const view = this.rows[index];
    if (!view) return;
    const targets = [view.plate, view.name, view.plus, view.minus, view.priceText];
    const homes = [MACHINE_ROW_X, MACHINE_ROW_X + TEXT_X, MACHINE_ROW_X + TEXT_X, MACHINE_ROW_X + TEXT_X, MACHINE_ROW_X + PRICE_TEXT_X];
    this.scene.tweens.killTweensOf(targets);
    targets.forEach((target, part) => target.setX(homes[part]));
    this.scene.tweens.add({
      targets,
      x: `+=${SHAKE_STEP}`,
      duration: SHAKE_TIME,
      yoyo: true,
      repeat: 2,
      onComplete: () => targets.forEach((target, part) => target.setX(homes[part])),
    });
  }
}
