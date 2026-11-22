import Phaser from 'phaser';
import { t } from '../lang';
import { PAYOUT_WINDOW } from '../layout';
import { addText, fitTextWidth, GOLD_TEXT, LED_STYLE, POPUP_DEPTH, RED_TEXT } from '../theme';
import { TAKE_BEZEL_LEFT } from './payoutWindow';

// Полоса раунда спасения встаёт на место окошка выплаты (числа — от PAYOUT_WINDOW).
const BAND_LEFT = PAYOUT_WINDOW.x - PAYOUT_WINDOW.width / 2; // 509
const BAND_RIGHT = TAKE_BEZEL_LEFT; // 731 — кнопку «забрать» не накрываем
const BAND_TOP = PAYOUT_WINDOW.y - PAYOUT_WINDOW.height / 2 - 12; // 505
const BAND_BOTTOM = PAYOUT_WINDOW.y + PAYOUT_WINDOW.height / 2; // 587
const BAND_X = (BAND_LEFT + BAND_RIGHT) / 2; // 620
const BAND_Y = (BAND_TOP + BAND_BOTTOM) / 2; // 546
const BAND_WIDTH = BAND_RIGHT - BAND_LEFT; // 222
const BAND_HEIGHT = BAND_BOTTOM - BAND_TOP; // 82
const BAND_ALPHA = 0.96;
// Пять строк: название, остаток прокруток, цель, долг, подсказка про заморозку. Кнопок нет — решения принимает сетка.
const TITLE_Y = BAND_TOP + 4; // 509
const SPINS_Y = BAND_TOP + 20; // 525
const GOAL_Y = BAND_TOP + 36; // 541
const DEBT_Y = BAND_TOP + 50; // 555
const HINT_Y = BAND_TOP + 62; // 567
const HINT_WIDTH = BAND_WIDTH - 12; // 210: подсказка не выходит за полосу
const HINT_FONT = 9;
const OPEN_TIME = 160; // полоса проявляется, мс

/**
 * Полоса раунда спасения на месте окошка выплаты: название режима, сколько прокруток осталось, что нужно собрать,
 * что долг останется, и подсказка про заморозку столбца. Кнопок на полосе нет: столбец морозят кликом по сетке,
 * а прокрутку даёт рычаг (или Пробел). Клики по столбцам ловит сцена (SlotScreen.beginPick).
 */
export class RescueBar {
  private readonly scene: Phaser.Scene;
  private readonly band: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly spinsText: Phaser.GameObjects.Text;
  private readonly goalText: Phaser.GameObjects.Text;
  private readonly debtText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [];
  private isOpen = false; // полоса на экране: relabel трогает только открытую
  private spinsShown = 0;
  private freezeUsed = false;
  private isResultShown = false; // в строке цели уже «ПАТТЕРН СОБРАН», а не «СОБЕРИ ПАТТЕРН»

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.band = scene.add
      .rectangle(BAND_X, BAND_Y, BAND_WIDTH, BAND_HEIGHT, 0x2a0a0a, BAND_ALPHA)
      .setStrokeStyle(2, 0xb91c1c)
      .setRounded(10)
      .setDepth(POPUP_DEPTH);
    this.titleText = addText(scene, BAND_X, TITLE_Y, t('rescueTitle'), { ...LED_STYLE, fontSize: '13px' }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.spinsText = addText(scene, BAND_X, SPINS_Y, '', { fontSize: '12px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.goalText = addText(scene, BAND_X, GOAL_Y, t('rescueGoal'), { fontSize: '11px', fontStyle: 'bold', color: RED_TEXT }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.debtText = addText(scene, BAND_X, DEBT_Y, t('rescueDebtStays'), { fontSize: '10px', color: GOLD_TEXT }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.hintText = addText(scene, BAND_X, HINT_Y, t('rescueFreezeHint'), {
      fontSize: `${HINT_FONT}px`,
      color: '#fecaca',
      align: 'center',
      wordWrap: { width: HINT_WIDTH },
    }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.parts.push(this.band, this.titleText, this.spinsText, this.goalText, this.debtText, this.hintText);
    this.close();
  }

  /** Показать полосу: сколько прокруток даётся на входе. */
  open(spins: number): void {
    this.isOpen = true;
    this.isResultShown = false;
    this.titleText.setText(t('rescueTitle'));
    this.debtText.setText(t('rescueDebtStays'));
    this.setSpins(spins);
    this.setGoal(t('rescueGoal'));
    this.setFreezeUsed(false);
    for (const part of this.parts) part.setVisible(true);
    this.band.setAlpha(0);
    this.scene.tweens.add({ targets: this.band, alpha: BAND_ALPHA, duration: OPEN_TIME });
  }

  /** «ОСТАЛОСЬ ПРОКРУТОК: N». */
  setSpins(spins: number): void {
    const safe = Number.isFinite(spins) ? Math.max(0, Math.floor(spins)) : 0;
    this.spinsShown = safe;
    this.spinsText.setText(t('rescueSpins', safe));
  }

  /** Строка цели: «СОБЕРИ ПАТТЕРН», а после победы — «ПАТТЕРН СОБРАН». */
  setGoal(text: string): void {
    fitTextWidth(this.goalText, text, HINT_WIDTH, 11, 9);
  }

  /** Заморозка/разморозка в этом ходу уже была: подсказка меняется, клик по сетке больше не ждут. */
  setFreezeUsed(used: boolean): void {
    this.freezeUsed = used;
    fitTextWidth(this.hintText, used ? t('rescueFreezeUsed') : t('rescueFreezeHint'), HINT_WIDTH, HINT_FONT, 8);
  }

  /** В строке цели — «ПАТТЕРН СОБРАН»: спасение выиграно, ждём магазин. */
  showResult(): void {
    this.isResultShown = true;
    this.setGoal(t('rescueSurvived'));
  }

  /** Сменили язык на открытой полосе: все надписи — заново на новом языке. */
  relabel(): void {
    if (!this.isOpen) return;
    this.titleText.setText(t('rescueTitle'));
    this.debtText.setText(t('rescueDebtStays'));
    this.setSpins(this.spinsShown);
    this.setGoal(this.isResultShown ? t('rescueSurvived') : t('rescueGoal'));
    this.setFreezeUsed(this.freezeUsed);
  }

  /** Полосу убрать: спасение кончилось (выжил или умер). */
  close(): void {
    this.isOpen = false;
    for (const part of this.parts) part.setVisible(false);
  }
}
