import { freeSpinsFor, isJackpot, JACKPOT_SPINS, JACKPOT_TICKETS, luckyGrid } from '../bonus';
import { pactEffects, pactPatternWeight, pactSpinCap } from '../dealerGame';
import { cellsOf } from '../evil';
import { t } from '../lang';
import { CENTER_X, cellX, cellY, GRID_Y, SPIN_LAMPS_Y } from '../layout';
import type { SpinResult } from '../patterns';
import { MAX_SPINS_PER_ROUND, spinGrid, spinsAfterBonus, type Grid, type WeightOf } from '../rules';
import { GOLD_TEXT, GREEN_TEXT, LAMP_GOLD } from '../theme';
import { PhaseScene } from './PhaseScene';

const CROWN_BORDER = 0xfbbf24; // рамки на коронах: дали прокрутки — рамка золотая
const CLOVER_BORDER = 0x22c55e; // рамка на клевере
const CROWN_LAMPS_TIME = 1500; // короны: огни бегут золотом, мс
const POPUP_ABOVE_CELL = 30; // «👑 +5» и «🍀» всплывают над клеткой символа

/**
 * Слой удачи (числа — в bonus.ts): короны дают бесплатные прокрутки (их крутит RoundScene — spinFree),
 * клевер — паттерн наверняка в следующей прокрутке, джекпот — ещё билеты и прокрутки.
 * Между PhaseScene и RoundScene: RoundScene и так вырос за 400 строк, удача — своим слоем.
 */
export abstract class BonusScene extends PhaseScene {
  /**
   * Сетка прокрутки: после клевера — с паттерном наверняка (удача тратится), иначе обычная.
   * canUseLuck = false — спокойная прокрутка: выплат в ней нет, поэтому клевер ждёт обычной и не тратится.
   * Клеверов на сетке могло быть несколько: их число уходит в luckyGrid, и паттерн выбирается по весам.
   * Сделка №7 двигает те веса: джекпот тяжелее, «чёрные» паттерны чаще (dealerGame.pactPatternWeight).
   */
  protected rollGrid(weightOf: WeightOf, canUseLuck = true): Grid {
    if (!canUseLuck || this.luckyClovers <= 0) return spinGrid(weightOf);
    const clovers = this.luckyClovers; // запоминаем до сброса: он же гасит огни удачи
    this.luckyClovers = 0;
    return luckyGrid(weightOf, clovers, pactPatternWeight(pactEffects(this.pacts, this.round)) ?? undefined);
  }

  /** Итог прокрутки для удачи: короны — бесплатные прокрутки, клевер — удача в следующей, джекпот — билеты и прокрутки. */
  protected collectBonuses(grid: Grid, result: SpinResult): void {
    this.collectCrowns(grid);
    this.collectClover(grid);
    if (isJackpot(result)) this.collectJackpot();
  }

  /**
   * Короны на экране: хватило — бесплатные прокрутки, все, что положены за выпавшие короны (игрового потолка за раунд
   * нет). Короны в рамках, огни бегут золотом. Бесплатная прокрутка тоже может дать короны: цепочка разрешена,
   * её останавливает только технический предохранитель FREE_SPINS_GUARD — считать его выпадает на RoundScene.afterSpin.
   */
  private collectCrowns(grid: Grid): void {
    const crowns = cellsOf(grid, 'crown');
    const wanted = freeSpinsFor(crowns.length);
    if (wanted === 0) return;
    this.freeSpins += wanted;
    this.freeSpinsAwarded += wanted;
    this.sfx.play('crown');
    this.screen.highlightCells(crowns, CROWN_BORDER);
    this.screen.flashLamps(LAMP_GOLD, CROWN_LAMPS_TIME);
    const [row, col] = crowns[0];
    this.effects.popupAt(cellX(col), cellY(row) - POPUP_ABOVE_CELL, `👑 +${wanted}`, GOLD_TEXT);
  }

  /** Клевер на экране: следующая прокрутка — с паттерном. Клевер в рамке, огни в покое зелёные (calmLampColor), пока она не прошла. */
  private collectClover(grid: Grid): void {
    const cells = cellsOf(grid, 'clover'); // один проход по сетке: их число — и есть число клеверов
    if (cells.length === 0) return;
    // Перезапись, а не накопление: предыдущий заряд клевера к этому моменту уже потрачен на прокрутку.
    this.luckyClovers = cells.length;
    this.sfx.play('clover');
    this.screen.highlightCells(cells, CLOVER_BORDER);
    const [row, col] = cells[0];
    // Как метка «×N» у копий амулетов: при нескольких клеверах видно, насколько сильна следующая прокрутка.
    const sign = cells.length > 1 ? `🍀 ×${cells.length}` : '🍀';
    this.effects.popupAt(cellX(col), cellY(row) - POPUP_ABOVE_CELL, sign, GREEN_TEXT);
  }

  /** Джекпот: кроме фишек — билеты (летят с сетки на табло) и прокрутки (над лампочками — «+N», лампочки подмигивают). */
  private collectJackpot(): void {
    // №18 (28б): джекпот даёт на билет больше — только джекпот, не каждый паттерн.
    const tickets = JACKPOT_TICKETS + this.upgradeEffects.jackpotTickets;
    this.tickets += tickets;
    // У потолка прокруток добавляется меньше (или ничего) — показываем фактически добавленное, чтобы «+3» не врало.
    const cap = pactSpinCap(MAX_SPINS_PER_ROUND + this.upgradeEffects.spinCapBonus, pactEffects(this.pacts, this.round));
    const added = spinsAfterBonus(this.spinsLeft, JACKPOT_SPINS, cap) - this.spinsLeft;
    this.spinsLeft += added;
    this.sfx.play('ticket', 0.3);
    // Строка «Джекпот: билеты +N, прокрутки +N» раньше висела внизу монитора на стене; оттуда её убрал автор
    // (DONTLIKE 9.2), и теперь она выходит новостью на стекле — ровно когда джекпот выпал.
    this.screen.announceNews(t('jackpotNote', tickets, added));
    this.panel.flyTickets(tickets, CENTER_X, GRID_Y);
    if (added > 0) {
      this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, `+${added}`, GOLD_TEXT);
      this.panel.winkSpinLamps(this.spinsLeft);
    }
  }
}
