import { jamGrid, rustColumn } from '../characters';
import { machineKey, see } from '../codex';
import { machineSpec } from '../machines';
import type { Grid, WeightOf } from '../rules';
import { BonusScene } from './BonusScene';

/**
 * Слой автомата (спеки и числа — в machines.ts). Веса и выплаты автомата считает RoundScene;
 * здесь — ржавчина столбца (шанс берётся из спеки; у всех трёх автоматов он 0) и смена автомата:
 * выбранный в магазине встаёт на место перед новым раундом (showNewMachine).
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

  /**
   * Сетка прокрутки: заржавевший столбец не крутится — в нём остаются символы прошлой прокрутки.
   * canJam = false — спокойная прокрутка: в ней не может быть черепов и кубика, а в заевшем столбце они как раз
   * и остались бы. Ржавчина в этот ход не заедает — столбец крутится вместе со всеми.
   */
  protected rollGrid(weightOf: WeightOf, canUseLuck = true, canJam = true): Grid {
    const grid = super.rollGrid(weightOf, canUseLuck);
    const column = this.rustyColumn;
    if (column === null || !this.lastGrid) return grid;
    if (!canJam) {
      this.clearRust(); // символы прошлой сетки в спокойную прокрутку не пускаем (черепа сожгли бы кон)
      return grid;
    }
    this.rustyColumn = null;
    return jamGrid(grid, this.lastGrid, column);
  }

  /**
   * После итога прокрутки grid: если следующая прокрутка обычная (не бесплатная, не после клевера и не последняя),
   * на ржавом автомате столбец может заржаветь. Ржавчину видно заранее — можно решить: крутить или сначала забрать кон.
   */
  protected rustAfterSpin(grid: Grid): void {
    this.lastGrid = grid;
    if (this.freeSpins > 0 || this.luckyClovers > 0 || this.spinsLeft === 0) return;
    const column = rustColumn(machineSpec(this.machineState).rustChance);
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

  /**
   * На место встал выбранный в магазине автомат (или тот же, но прокачанный): корпус его цвета, значок,
   * на стекле — значок и название. Зовёт ShopScene.leaveShop перед startRound.
   */
  protected showNewMachine(): void {
    const machine = machineSpec(this.machineState);
    this.machineBadge.arrive(machine);
    see(machineKey(this.machineState.id));
    this.monitor.notify('update'); // на экране на стене — жёлтое UPDATE, в «Кто есть кто» появился автомат
    this.screen.announceMachine(machine);
    this.sfx.play('news', 0.3);
  }
}
