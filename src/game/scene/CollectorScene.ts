import { interestCoins, TICKETS_PER_DEBT } from '../amulets';
import { diceWeight } from '../evil';
import { bestMultiplier, GOOD_LUCK_TIME, isLastChanceGoalMet, isLastChanceSymbol, LAST_CHANCE_ACTIONS } from '../lastChance';
import { t } from '../lang';
import { DISPLAY } from '../layout';
import { evaluateGrid, TOP_MULTIPLIER } from '../patterns';
import { GRID_ROWS, randomSymbol, weightsForRound, JOKER, type Grid, type SlotSymbol, type WeightOf } from '../rules';
import { GOLD_TEXT, GREEN_TEXT, LAMP_OFF, LAMP_RED } from '../theme';
import type { LastChanceAction } from '../parts/lastChanceBar';
import { SaveScene } from './SaveScene';

// Порядок событий, мс.
const RESTART_SPACE_DELAY = 800; // Пробел на экране KABOOM перезапускает игру не раньше, чем через столько
const KABOOM_WARN_TIME = 1800; // KABOOM мигает на экране автомата, потом взрыв
const KABOOM_AFTER_TIME = 900; // после взрыва — пауза, потом всё темнеет
const KABOOM_SHAKE_TIME = 700;
const KABOOM_SHAKE = 0.03;
const LAST_CHANCE_TENSION = 1; // в последнем шансе сердце в музыке бьётся быстрее всего
const SECOND_WIND_PAUSE = 1200; // провал с «вторым дыханием»: столько видно, что случилось, потом магазин

/**
 * Слой Коллектора: в конце раунда к автомату приходит Коллектор. Хватает фишек — из темноты выезжает банкомат, отдаёшь долг,
 * получаешь купон (билет), дальше магазин. Не хватает — на экране банкомата GOOD LUCK, автомат делает ОДНУ чистую прокрутку
 * (без черепов и злых символов), и у игрока два действия: перекрутить столбец или поставить джокера в клетку; заморозка
 * столбца бесплатная. Побил лучший паттерн на сетке — выезжает чемодан с фишками: долг оплачен, фишки целы, билета нет,
 * счёт на один долг назад. Не побил (или сдался) — провал: первый за забег даёт «второе дыхание» (счёт −1, магазин),
 * второй — KABOOM. Флаг secondWindUsed живёт в записи забега и в кассете: откат дыхание не пополняет.
 */
export abstract class CollectorScene extends SaveScene {
  // Последний шанс: сетка, которую игрок доделывает, и сколько действий у него осталось.
  private lastChanceGrid: Grid | null = null;
  private lastChanceGoal = 0; // какой множитель надо побить; 0 — собрать хоть какой-нибудь паттерн
  private lastChanceActions = 0;
  private readonly frozenColumns = new Set<number>(); // замороженные столбцы: перекрут их не трогает
  private isFreezeMode = false; // кнопка «лёд» включена: клик по столбцу морозит, а не перекручивает

  /** Новый забег: последний шанс не идёт, заморозки нет. */
  protected resetState(): void {
    super.resetState();
    this.lastChanceGrid = null;
    this.lastChanceGoal = 0;
    this.lastChanceActions = 0;
    this.frozenColumns.clear();
    this.isFreezeMode = false;
  }

  /** В последнем шансе сердце в музыке бьётся быстрее всего. */
  protected tension(): number {
    return this.isLastChance ? LAST_CHANCE_TENSION : super.tension();
  }

  /**
   * Прокрутки кончились (или долг отдают раньше — isPaidEarly): Коллектор идёт за долгом.
   * Фишек не хватает — сначала тревога и красные огни на GOOD_LUCK_TIME, потом последний шанс.
   */
  protected callCollector(isPaidEarly: boolean): void {
    this.finishTutorial(); // Коллектор пришёл — тьма рассеивается совсем (и обучение запоминается)
    if (!this.hasEnoughForDebt()) {
      this.sfx.play('warning');
      this.screen.flashLamps(LAMP_RED, GOOD_LUCK_TIME);
    }
    this.reachOut(isPaidEarly);
  }

  /**
   * Выезжает банкомат. Хватает фишек — ждём «отдать» (а если долг отдают раньше — isPaidEarly — банкомат сразу забирает:
   * игрок уже решил); не хватает — на его экране GOOD LUCK, банкомат уезжает, начинается последний шанс.
   */
  private reachOut(isPaidEarly: boolean): void {
    const enough = this.hasEnoughForDebt();
    this.tooltip.hide(); // подсказка плашки режима не должна висеть над выехавшим банкоматом
    this.panel.setModeVisible(false); // банкомат встаёт на место переключателя: пока он выехал, режим не выбрать
    this.sfx.play('hand'); // банкомат выезжает
    this.collector.reachOut(this.debt, enough, () => {
      if (!enough) {
        // Банкомат уехал после GOOD LUCK — переключатель снова виден.
        this.panel.setModeVisible(true);
        this.startLastChance();
        return;
      }
      this.isAwaitingPayment = true; // теперь можно кликнуть по банкомату или нажать Enter
      if (isPaidEarly) this.payDebt();
    });
  }

  /**
   * Отдать долг: фишки уходят с табло в банкомат, остаток остаётся на табло (с «Процентами» растёт),
   * за долг — билеты: они летят из купона на табло. Числа меняются по ходу анимации: фишки — когда купон напечатан,
   * билет — когда он долетел до табло, и только тогда refreshHud. Банкомат уедет — магазин.
   */
  protected payDebt(): void {
    if (!this.isAwaitingPayment) return;
    this.isAwaitingPayment = false;
    this.sfx.play('payment');
    this.collector.takePayment(
      (x, y) => {
        this.balance -= this.debt;
        const interest = interestCoins(this.balance, this.amuletIds());
        if (interest > 0) {
          this.balance += interest;
          this.amuletRack.trigger('interest');
          this.effects.popupAt(DISPLAY.x, DISPLAY.y + 50, `+${interest}`, GREEN_TEXT); // проценты капают на табло
        }
        // Билет начисляется, когда последний билет долетел до табло: до этого на нём ещё старое число.
        this.panel.flyTickets(TICKETS_PER_DEBT, x, y, () => {
          this.tickets += TICKETS_PER_DEBT;
          this.refreshHud();
        });
      },
      () => {
        this.panel.setModeVisible(true); // банкомат уехал — переключатель режима снова на месте
        this.openShop();
      },
    );
  }

  // ---------- Последний шанс ----------

  /**
   * Фишек не хватило: одна чистая прокрутка (её делает автомат), потом два действия игрока.
   * Цель — побить лучший паттерн на этой сетке; если паттернов нет — собрать хоть один.
   */
  private startLastChance(): void {
    this.isLastChance = true;
    this.pot = 0;
    this.frozenColumns.clear();
    this.isFreezeMode = false;
    this.screen.showFrozen([]);
    this.lastChanceBar.close();
    this.refreshHud();
    this.rollLastChance((grid) => {
      this.lastChanceGrid = grid;
      this.lastChanceGoal = bestMultiplier(evaluateGrid(grid));
      this.lastChanceActions = LAST_CHANCE_ACTIONS;
      this.refreshHud();
      if (this.lastChanceGoal >= TOP_MULTIPLIER) {
        // Сильнее уже не собрать (джекпот) — цель выполнена сразу, действия ни к чему.
        this.winLastChance();
        return;
      }
      this.sfx.play('news', 0.3);
      this.lastChanceBar.open(this.lastChanceGoal, this.lastChanceActions);
    });
  }

  /** Одна прокрутка последнего шанса: обычные веса раунда, но без черепов и злых символов. */
  private rollLastChance(done: (grid: Grid) => void): void {
    this.panel.pullLever();
    this.sfx.play('lever');
    this.sfx.play('roll', 0.1);
    this.isSpinning = true;
    this.screen.clearHighlights();
    const weightOf = this.cleanWeight();
    const grid = this.rollGrid(weightOf);
    this.screen.spin(grid, weightOf, () => {
      this.isSpinning = false;
      done(grid);
    });
  }

  /** Веса чистой сетки: обычные веса раунда, но у черепов, кубика, паука, замка и крови вес 0. */
  private cleanWeight(): WeightOf {
    const base = weightsForRound(this.round, diceWeight(this.diceDrought));
    return (symbol: SlotSymbol): number => (isLastChanceSymbol(symbol) ? base(symbol) : 0);
  }

  /**
   * Нажали кнопку в полосе: «сдаться» — сразу провал, «лёд» — режим заморозки (бесплатно и без действий),
   * «перекрут» и «джокер» ждут клика по сетке.
   */
  protected onLastChanceButton(action: LastChanceAction): void {
    if (!this.isLastChance || !this.lastChanceGrid || this.isSpinning) return; // пока столбец крутится, кнопки ждут
    if (action === 'surrender') {
      this.failLastChance();
      return;
    }
    if (action === 'freeze') {
      this.isFreezeMode = !this.isFreezeMode; // повторное нажатие выключает режим
      this.lastChanceBar.setFreezeMode(this.isFreezeMode);
      if (this.isFreezeMode) this.screen.beginPick('column', (row, col) => this.onLastChancePick('freeze', row, col));
      else this.screen.endPick();
      return;
    }
    this.isFreezeMode = false;
    this.lastChanceBar.setFreezeMode(false);
    this.screen.beginPick(action === 'reroll' ? 'column' : 'cell', (row, col) => this.onLastChancePick(action, row, col));
  }

  /** Клик по сетке в последнем шансе: морозим столбец, перекручиваем столбец или ставим джокера. */
  private onLastChancePick(action: 'freeze' | 'reroll' | 'joker', row: number, col: number): void {
    if (!this.isLastChance || !this.lastChanceGrid) return;
    if (action === 'freeze') {
      this.toggleFreeze(col);
      return;
    }
    if (action === 'reroll') this.rerollColumn(col);
    else this.placeJoker(row, col);
  }

  /** Заморозка столбца: бесплатно, действий не тратит. Замороженный столбец перекрут не трогает. */
  private toggleFreeze(col: number): void {
    if (this.frozenColumns.has(col)) this.frozenColumns.delete(col);
    else this.frozenColumns.add(col);
    this.screen.showFrozen([...this.frozenColumns]);
    this.sfx.play('rust'); // лёд хрустит, как ржавый столбец
  }

  /** Перекрут столбца: он выпадает заново чистыми символами. Одно действие. */
  private rerollColumn(col: number): void {
    const grid = this.lastChanceGrid;
    if (!grid) return;
    if (this.frozenColumns.has(col)) {
      this.sfx.play('deny'); // столбец заморожен: сначала разморозь, действий не тратим
      return;
    }
    const weightOf = this.cleanWeight();
    for (let row = 0; row < GRID_ROWS; row++) grid[row][col] = randomSymbol(weightOf);
    this.spendAction();
    this.sfx.play('item');
    this.isSpinning = true;
    this.screen.endPick(); // пока столбец крутится, выбирать нечего
    this.screen.rerollColumn(col, weightOf, (row) => grid[row][col], () => {
      this.isSpinning = false;
      this.afterLastChanceAction();
    });
  }

  /** Джокер в клетку: там встаёт 🃏, клетка подпрыгивает. Одно действие. В занятую джокером клетку не ставим. */
  private placeJoker(row: number, col: number): void {
    const grid = this.lastChanceGrid;
    if (!grid) return;
    if (grid[row][col].id === 'joker') {
      this.sfx.play('deny'); // тут уже джокер: действие не тратим
      return;
    }
    grid[row][col] = JOKER;
    this.spendAction();
    this.sfx.play('item');
    this.isSpinning = true;
    this.screen.endPick();
    this.screen.revealCell(row, col, JOKER, () => {
      this.isSpinning = false;
      this.afterLastChanceAction();
    });
  }

  private spendAction(): void {
    this.lastChanceActions = Math.max(0, this.lastChanceActions - 1);
    this.lastChanceBar.setActions(this.lastChanceActions);
  }

  /** Действие отработало: есть ещё — ждём следующей кнопки, кончились — проверяем цель. */
  private afterLastChanceAction(): void {
    if (!this.isLastChance) return;
    this.refreshHud();
    if (this.lastChanceActions > 0) return;
    this.finishLastChance();
  }

  /** Действия кончились: собрал паттерн сильнее лучшего — долг оплачен, нет — провал. */
  private finishLastChance(): void {
    const grid = this.lastChanceGrid;
    const best = grid ? bestMultiplier(evaluateGrid(grid)) : 0;
    if (isLastChanceGoalMet(best, this.lastChanceGoal)) this.winLastChance();
    else this.failLastChance();
  }

  /** Победил: чемодан закрывает долг, фишки целы, билета нет, счёт на один долг назад — и магазин. */
  private winLastChance(): void {
    this.closeLastChance();
    this.sfx.play('payment');
    this.collector.clearGoodLuck();
    this.chipCase.open(() => {
      this.round = Math.max(0, this.round - 2); // магазин прибавит единицу: раунд N − 1, а не N + 1
      this.openShop();
    });
  }

  /**
   * Провал: первый за забег — «второе дыхание»: счёт −1 и магазин, забег живёт дальше.
   * Второй (флаг secondWindUsed уже стоит) — KABOOM.
   */
  private failLastChance(): void {
    this.closeLastChance();
    if (this.secondWindUsed) {
      this.kaboom();
      return;
    }
    this.secondWindUsed = true;
    this.sfx.play('warning');
    this.effects.popup(t('lcSecondWind'), GOLD_TEXT);
    this.time.delayedCall(SECOND_WIND_PAUSE, () => {
      this.round = Math.max(0, this.round - 2); // счёт на один долг назад, как после выигранного шанса
      this.openShop();
    });
  }

  /** Последний шанс кончился любой дорогой: убрать полосу, сетку выбора и мороз, снять isLastChance. */
  private closeLastChance(): void {
    this.screen.endPick();
    this.screen.showFrozen([]);
    this.lastChanceBar.close();
    this.collector.clearGoodLuck(); // GOOD LUCK с экрана уходит и после провала
    this.frozenColumns.clear();
    this.isFreezeMode = false;
    this.lastChanceGrid = null;
    this.isLastChance = false;
    this.isSpinning = false;
    this.pot = 0;
    this.refreshHud();
  }

  // ---------- Конец забега ----------

  /** Конец забега: на экране автомата KABOOM, потом автомат взрывается, всё темнеет, и на нём — KABOOM, счёт, «ЗАНОВО». */
  private kaboom(): void {
    this.isGameOver = true;
    this.refreshHud();
    this.sfx.play('warning');
    this.screen.flashLamps(LAMP_RED, KABOOM_WARN_TIME);
    this.collector.warnGoodLuck('KABOOM');
    this.time.delayedCall(KABOOM_WARN_TIME, () => {
      this.sfx.play('shatter');
      this.sfx.play('death');
      this.collector.explode();
      this.cameras.main.shake(KABOOM_SHAKE_TIME, KABOOM_SHAKE);
      this.brokenScreen.shatter();
      this.screen.setCalmColor(LAMP_OFF);
      this.time.delayedCall(KABOOM_AFTER_TIME, () => {
        this.collector.clearGoodLuck(); // KABOOM погас: под экраном DEATH не должно остаться старого мигающего заголовка
        this.collector.blackout(() => {
          this.collector.showDeath(this.closedDebts(), this.record, () => this.restartGame(), 'KABOOM');
          this.time.delayedCall(RESTART_SPACE_DELAY, () => {
            this.canRestartWithSpace = true;
          });
        });
      });
    });
  }
}
