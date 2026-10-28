import { phaseAt } from '../phases';
import { LAMP_RED } from '../theme';
import { BaseScene } from './BaseScene';

const PHASE_LAMPS_TIME = 1500; // новая фаза: огни вокруг экрана бегут красным, мс

/**
 * Слой фаз: смена фазы по прогрессу игрока — числу закрытых долгов. Числа фаз — в phases.ts.
 * Фаза меняется только в спокойный момент — между прокрутками или в начале раунда (их зовёт RoundScene: checkPhase),
 * чтобы правила не менялись посреди прокрутки. Долг закрывается между раундами, поэтому новая фаза приходит в начале раунда.
 * Что меняет фаза: вес черепа — RoundScene.symbolWeight, рост множителя — BaseScene.multiplier.
 */
export abstract class PhaseScene extends BaseScene {
  /** Спокойный момент: если по прогрессу пора — начинается новая фаза. Условие перехода — phaseAt, поведение — announcePhase. */
  protected checkPhase(): void {
    const next = phaseAt(this.closedDebts());
    if (next === this.phase) return;
    this.phase = next;
    this.announcePhase();
  }

  /**
   * Новая фаза видна и слышна: на стекле «ФАЗА 2» и знаки, что изменилось (они улетают к окошку множителя и остаются там),
   * огни бегут красным и потом в покое оранжевые, тревожный сигнал, сердце чаще.
   */
  private announcePhase(): void {
    this.screen.announcePhase(this.phase.number);
    this.panel.flyPhaseSigns();
    this.screen.setCalmColor(this.calmLampColor()); // сначала цвет огней в покое, потом вспышка (наоборот — цвет погасит вспышку)
    this.screen.flashLamps(LAMP_RED, PHASE_LAMPS_TIME);
    this.sfx.play('warning');
    this.refreshHud();
  }
}
