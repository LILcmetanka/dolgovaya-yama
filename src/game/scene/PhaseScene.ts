import { phaseAt } from '../phases';
import { LAMP_RED } from '../theme';
import { BaseScene } from './BaseScene';

const PHASE_LAMPS_TIME = 1500; // новая фаза: огни вокруг экрана бегут красным, мс

/**
 * Слой фаз: смена фазы по прогрессу игрока — числу закрытых долгов. Числа фаз — в phases.ts.
 * Фаза меняется только в спокойный момент — между прокрутками или в начале раунда (их зовёт RoundScene: checkPhase),
 * чтобы правила не менялись посреди прокрутки. Долг закрывается между раундами, поэтому новая фаза приходит в начале раунда.
 * Что меняет фаза: +1 прокрутка в раунде (RoundScene.startRound) и, если настроено, рост множителя (BaseScene.multiplier).
 */
export abstract class PhaseScene extends BaseScene {
  /** Спокойный момент: если по прогрессу пора — начинается новая фаза. Условие перехода — phaseAt, поведение — announcePhase. */
  protected checkPhase(): void {
    const next = phaseAt(this.closedDebts());
    if (next === this.phase) return;
    const back = next.number < this.phase.number; // счёт вернулся назад: последний шанс отыграл долг
    this.phase = next;
    // Откат фазы не объявляют: «ФАЗА 1» с красными огнями и знаками читалась бы как новая напасть.
    // Знаки фазы 2 при этом убираем — они висят до конца забега только пока фаза 2 идёт.
    if (back) {
      this.panel.clearPhaseSigns();
      this.screen.setCalmColor(this.calmLampColor()); // огни снова спокойные: фаза 2 кончилась
      this.refreshHud();
      return;
    }
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
    this.monitor.notify('update'); // на экране на стене — жёлтое UPDATE
    this.refreshHud();
  }
}
