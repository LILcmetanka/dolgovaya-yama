import { machineKey, see } from '../codex';
import { jamGrid, rustColumn } from '../characters';
import type { Grid, WeightOf } from '../rules';
import { BonusScene } from './BonusScene';

/**
 * Слой характера автомата (числа — в characters.ts). Веса символов и выплаты характера считает RoundScene, долг — ShopScene;
 * здесь — особое правило Ржавого (столбец заедает) и приход нового автомата событием на сетке (шаг 67):
 * прокрутка пустая, значок встаёт на корпус (showNewMachine).
 * Между BonusScene и RoundScene: RoundScene и так вырос за 440 строк.
 */
export abstract class MachineScene extends BonusScene {
  private rustyColumn: number | null = null; // заржавевший столбец: в следующей прокрутке он не крутится
  private lastGrid: Grid | null = null; // сетка прошлой прокрутки — её символы остаются в заржавевшем столбце

  /** Новый забег: ржавчины нет. */
  protected resetState(): void {
    super.resetState();
    this.rustyColumn = null;
    this.lastGrid = null;
  }

  /** Сетка прокрутки: заржавевший столбец не крутится — в нём остаются символы прошлой прокрутки. */
  protected rollGrid(weightOf: WeightOf): Grid {
    const grid = super.rollGrid(weightOf);
    const column = this.rustyColumn;
    if (column === null || !this.lastGrid) return grid;
    this.rustyColumn = null;
    return jamGrid(grid, this.lastGrid, column);
  }

  /**
   * После итога прокрутки grid: если следующая прокрутка обычная (не бесплатная, не после клевера и не последняя),
   * на ржавом автомате столбец может заржаветь. Ржавчину видно заранее — можно решить: крутить или сначала забрать кон.
   */
  protected rustAfterSpin(grid: Grid): void {
    this.lastGrid = grid;
    if (this.freeSpins > 0 || this.isLuckyNext || this.spinsLeft === 0) return;
    const column = rustColumn(this.machine);
    if (column === null) return;
    this.rustyColumn = column;
    this.screen.showRust(column);
    this.sfx.play('rust');
  }

  /** Раунд кончился — ржавчина сходит: новый раунд начинается без неё. */
  protected clearRust(): void {
    this.rustyColumn = null;
    this.screen.clearRust();
  }

  /** Новый автомат встал на место: корпус его цвета, значок, на стекле — значок и название. Откуда он — решает RoundScene (machineArrives). */
  protected showNewMachine(): void {
    this.machineBadge.arrive(this.machine);
    see(machineKey(this.machine.id));
    this.monitor.notify('update'); // на экране на стене — жёлтое UPDATE, в «Кто есть кто» появился автомат
    this.screen.announceMachine(this.machine);
    this.sfx.play('news', 0.3);
  }
}
