import { countCrowns, freeSpinsFor, hasClover, isJackpot, JACKPOT_SPINS, JACKPOT_TICKETS, luckyGrid } from '../bonus';
import { cellsOf } from '../evil';
import { CENTER_X, cellX, cellY, GRID_Y, SPIN_LAMPS_Y } from '../layout';
import type { SpinResult } from '../patterns';
import { spinGrid, type Grid, type WeightOf } from '../rules';
import { GOLD_TEXT, GREEN_TEXT, LAMP_GOLD } from '../theme';
import { PhaseScene } from './PhaseScene';

const CROWN_BORDER = 0xfbbf24; // рамки на коронах, которые дали бесплатные прокрутки
const CLOVER_BORDER = 0x22c55e; // рамка на клевере
const CROWN_LAMPS_TIME = 1500; // короны: огни бегут золотом, мс
const POPUP_ABOVE_CELL = 30; // «👑 +5» и «🍀» всплывают над клеткой символа

/**
 * Слой удачи (числа — в bonus.ts): короны дают бесплатные прокрутки (их крутит RoundScene — spinFree),
 * клевер — паттерн наверняка в следующей прокрутке, джекпот — ещё билеты и прокрутки.
 * Между PhaseScene и RoundScene: RoundScene и так вырос за 400 строк, удача — своим слоем.
 */
export abstract class BonusScene extends PhaseScene {
  /** Сетка прокрутки: после клевера — с паттерном наверняка (удача тратится), иначе обычная. */
  protected rollGrid(weightOf: WeightOf): Grid {
    if (!this.isLuckyNext) return spinGrid(weightOf);
    this.isLuckyNext = false;
    return luckyGrid(weightOf);
  }

  /** Итог прокрутки для удачи: короны — бесплатные прокрутки, клевер — удача в следующей, джекпот — билеты и прокрутки. */
  protected collectBonuses(grid: Grid, result: SpinResult): void {
    this.collectCrowns(grid);
    this.collectClover(grid);
    if (isJackpot(result)) this.collectJackpot();
  }

  /** Короны на экране: хватило — бесплатные прокрутки. Короны в рамках, огни бегут золотом, в ряду лампочек — новые короны. */
  private collectCrowns(grid: Grid): void {
    const free = freeSpinsFor(countCrowns(grid));
    if (free === 0) return;
    this.freeSpins += free;
    this.sfx.play('crown');
    const crowns = cellsOf(grid, 'crown');
    this.screen.highlightCells(crowns, CROWN_BORDER);
    this.screen.flashLamps(LAMP_GOLD, CROWN_LAMPS_TIME);
    const [row, col] = crowns[0];
    this.effects.popupAt(cellX(col), cellY(row) - POPUP_ABOVE_CELL, `👑 +${free}`, GOLD_TEXT);
  }

  /** Клевер на экране: следующая прокрутка — с паттерном. Клевер в рамке, огни в покое зелёные (calmLampColor), пока она не прошла. */
  private collectClover(grid: Grid): void {
    if (!hasClover(grid)) return;
    this.isLuckyNext = true;
    this.sfx.play('clover');
    const clovers = cellsOf(grid, 'clover');
    this.screen.highlightCells(clovers, CLOVER_BORDER);
    const [row, col] = clovers[0];
    this.effects.popupAt(cellX(col), cellY(row) - POPUP_ABOVE_CELL, '🍀', GREEN_TEXT);
  }

  /** Джекпот: кроме фишек — билеты (летят с сетки на табло) и прокрутки (над лампочками — «+N», лампочки подмигивают). */
  private collectJackpot(): void {
    this.tickets += JACKPOT_TICKETS;
    this.spinsLeft += JACKPOT_SPINS;
    this.sfx.play('ticket', 0.3);
    this.panel.flyTickets(JACKPOT_TICKETS, CENTER_X, GRID_Y);
    this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, `+${JACKPOT_SPINS}`, GOLD_TEXT);
    this.panel.winkSpinLamps(this.spinsLeft);
  }
}
