import { interestCoins, TICKETS_PER_DEBT, winFactor } from '../amulets';
import { diceWeight } from '../evil';
import { CHIP_RECORD } from '../gameConfig';
import {
  bestMultiplier,
  chancePrice,
  GOOD_LUCK_TIME,
  isLastChanceGoalMet,
  isLastChanceSymbol,
  LAST_CHANCE_ACTIONS,
  lastChanceGoal,
} from '../lastChance';
import { t } from '../lang';
import { DISPLAY } from '../layout';
import { machineWinFactor } from '../machines';
import { evaluateGrid } from '../patterns';
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
// Победа (набрано CHIP_GOAL).
const VICTORY_SETTLE_TIME = 400; // после прибавки фишек столько ждём: текущее действие успевает доиграть
const VICTORY_PAUSE = 1400; // лампы погасли, новое число на табло видно — пауза, потом затемнение

/**
 * Слой Коллектора: в конце раунда к автомату приходит Коллектор. Хватает фишек — из темноты выезжает банкомат, отдаёшь долг,
 * получаешь купон (билет), дальше магазин. Не хватает — на экране банкомата GOOD LUCK, автомат делает ОДНУ чистую прокрутку
 * (без черепов и злых символов), и у игрока два действия: перекрутить столбец или поставить джокера в клетку; заморозка
 * столбца бесплатная. Собрал паттерн, который оплачивает долю нехватки фишек (lastChanceGoal), — выезжает чемодан с фишками:
 * долг оплачен, фишки целы, билета нет, счёт на один долг назад. Не собрал (или сдался) — провал: первый за забег даёт
 * «второе дыхание» (счёт −1, магазин), второй — KABOOM. Флаг secondWindUsed живёт в записи забега и в кассете: откат
 * дыхание не пополняет.
 */
export abstract class CollectorScene extends SaveScene {
  // Последний шанс: сетка, которую игрок доделывает, и сколько действий у него осталось.
  private lastChanceGrid: Grid | null = null;
  private lastChanceGoal = 0; // какой множитель паттерна надо перекрыть; 0 — нехватки нет, годится любой паттерн
  private lastChanceActions = 0;
  private readonly frozenColumns = new Set<number>(); // замороженные столбцы: перекрут их не трогает
  private isFreezeMode = false; // кнопка «лёд» включена: клик по столбцу морозит, а не перекручивает
  private wasShoppingAtVictory = false; // победа застала магазин на экране: «ДАЛЬШЕ» доиграет его выход
  private endScreenCleanup: (() => void) | null = null; // уборка экрана победы: её зовёт «ДАЛЬШЕ»

  /** Новый забег: последний шанс не идёт, заморозки нет. */
  protected resetState(): void {
    super.resetState();
    this.lastChanceGrid = null;
    this.lastChanceGoal = 0;
    this.lastChanceActions = 0;
    this.frozenColumns.clear();
    this.isFreezeMode = false;
    this.wasShoppingAtVictory = false;
    this.endScreenCleanup = null;
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
    // Забег уже кончен (победа по цели или KABOOM): Коллектору за долгом идти незачем.
    // Без этой строки он приезжал бы поверх экрана победы — его вызов стоит в таймере endOfSpins.
    if (this.isGameOver) return;
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
          this.earn(interest); // проценты — доход забега (не штраф): они тоже идут в цель 1 000 000
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
   * Цель — не побить свою же сетку, а закрыть долю нехватки фишек (lastChanceGoal): она считается от
   * debt − balance, цены символа раунда, множителя серии и множителей выигрыша — тех же чисел, что в addToPot,
   * и падает на полосу уже множителем паттерна: суммы фишек там нет, победа проверяет только множитель.
   * Входная сетка уже бьёт цель — действия ни к чему.
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
      const need = this.debt - this.balance;
      const goal = lastChanceGoal(need, chancePrice(this.round), this.multiplier(), this.chanceWinFactor());
      this.lastChanceGoal = goal;
      this.lastChanceActions = LAST_CHANCE_ACTIONS;
      this.refreshHud();
      if (isLastChanceGoalMet(bestMultiplier(evaluateGrid(grid)), goal)) {
        // Чистая сетка уже перекрыла цель — полоса действий не нужна.
        this.winLastChance();
        return;
      }
      this.sfx.play('news', 0.3);
      this.lastChanceBar.open(goal, this.lastChanceActions);
    });
  }

  /**
   * Множители выигрыша амулетов и автомата — как в addToPot (RoundScene): во сколько раз паттерн на кону
   * больше своей цены. Кровавая прокрутка и предмет риска сюда не входят: их флаги к приходу Коллектора сняты.
   * Режим прокрутки (spinModeNow и winModeFactor в levers.ts) в формулу не входит тоже — но по другой причине:
   * последний шанс не кладёт выигрыш в кон, поэтому множитель режима там нечему умножать. Симулятор считает так же.
   */
  private chanceWinFactor(): number {
    return winFactor(this.amuletIds(), this.bones) * machineWinFactor(this.machineState);
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

  /** Действия кончились: паттерн оплатил долю нехватки — долг оплачен, нет — провал. */
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

  /**
   * Цель забега взята — набрано chipGoal: 1 000 000, а после «ДАЛЬШЕ» — 10 000 000 (CHIP_RECORD). Зовётся из earn(),
   * то есть посреди действия: забрали кон, страховка вернула часть сгоревшего, капнули проценты, выпали фишки барабана.
   * Поэтому победа начинается не сразу: ждём VICTORY_SETTLE_TIME, чтобы анимация доиграла (вращение, оплата в банкомат,
   * колесо), и пробуем снова, пока сцена занята. Иначе isGameOver встал бы посреди прокрутки, и её итог пришёл бы уже
   * на экран победы. Отложенность ничего не теряет: earned только растёт, проверка повторится через тот же шаг.
   * Пока победа ждёт (isVictoryPending), ввод закрыт (BaseScene.canAct): кассета не откатит забег, новая прокрутка
   * не начнётся.
   */
  protected override checkChipGoal(): void {
    if (this.earned < this.chipGoal || this.isGameOver || this.isVictoryPending) return;
    this.isVictoryPending = true;
    this.time.delayedCall(VICTORY_SETTLE_TIME, () => {
      this.isVictoryPending = false;
      if (this.isGameOver || this.earned < this.chipGoal) return;
      if (this.isBusyForVictory()) {
        this.checkChipGoal(); // действие ещё идёт — следующий заход через тот же шаг
        return;
      }
      this.startVictory();
    });
  }

  /** Сцена занята действием — победа подождёт его конца: спин, окно перемешки, Дилер, банкомат, последний шанс. */
  private isBusyForVictory(): boolean {
    return (
      this.isSpinning ||
      this.isRerolling ||
      this.isDealing ||
      this.isAwaitingPayment ||
      this.isLastChance ||
      this.isRewinding ||
      this.isPaused ||
      this.isAtMonitor ||
      this.collector.isAtmOut
    );
  }

  /**
   * Победа: забег кончен, рекорд — по факту, лампы гаснут, короткая пауза — и камера гаснет. На экране автомата
   * «ПОБЕДА» с «ЗАНОВО» и «ДАЛЬШЕ» (тот же забег с целью 10 000 000), а на 10 000 000 — «РЕКОРД» с «ЗАНОВО».
   * KABOOM тут не при чём: автомат цел.
   * Покупки после победы закрыты: панель магазина уезжает сразу (победа могла прийти от барабана), бесплатные
   * прокрутки обнуляются (иначе крутились бы за экраном победы), а его колбэк готовности уже не включит магазин.
   */
  private startVictory(): void {
    this.isGameOver = true;
    this.freeSpins = 0; // победа забег кончает: бесплатные прокрутки за экраном не крутятся
    this.wasShoppingAtVictory = this.suspendShop(); // панель магазина уезжает без нового раунда
    this.updateChipRecord(); // рекорд фиксируется по концу забега (тут, на «РЕКОРДЕ» и на KABOOM), не в каждом earn
    this.refreshHud();
    this.sfx.play('bigWin');
    this.screen.setCalmColor(LAMP_OFF); // огни вокруг экрана гаснут: забег кончен
    this.time.delayedCall(VICTORY_PAUSE, () => {
      this.collector.blackout(() => {
        if (this.chipGoal >= CHIP_RECORD) {
          this.collector.showRecord(this.earned, this.chipRecord, () => this.restartGame()); // 10 000 000 — дальше цели нет
        } else {
          this.endScreenCleanup = this.collector.showVictory(this.earned, this.chipRecord, () => this.restartGame(), () => this.continueRun());
        }
        this.time.delayedCall(RESTART_SPACE_DELAY, () => {
          this.canRestartWithSpace = true; // Пробел — как на экране KABOOM, не сразу
        });
      });
    });
  }

  /**
   * «ДАЛЬШЕ» с экрана победы: тот же забег идёт дальше — счёт, баланс, раунд и предметы те же, цель теперь
   * 10 000 000 (CHIP_RECORD). Экран убираем, ввод открываем. Если победа прервала магазин — доигрываем его выход
   * (автомат на место, новый раунд); если раунд уже был закрыт — расплата, которую заслон isGameOver пропустил.
   */
  private continueRun(): void {
    const cleanup = this.endScreenCleanup;
    this.endScreenCleanup = null;
    cleanup?.();
    this.canRestartWithSpace = false; // Пробел снова крутит, а не начинает забег
    this.chipGoal = CHIP_RECORD;
    this.isGameOver = false;
    this.screen.setCalmColor(this.calmLampColor());
    this.sfx.play('roundStart');
    this.refreshHud();
    if (this.wasShoppingAtVictory) {
      this.wasShoppingAtVictory = false;
      this.resumeAfterShop(); // магазин доигрывается: автомат на место и новый раунд
    } else if (this.isRoundOver) {
      this.callCollector(this.isPaidEarly); // Коллектор по таймеру endOfSpins не приехал из-за победы
    }
    // Приход мог перескочить сразу обе ступени: 10 000 000 набрано ещё до «ДАЛЬШЕ» — «РЕКОРД» без нового дохода.
    this.checkChipGoal();
  }

  /** Конец забега: на экране автомата KABOOM, потом автомат взрывается, всё темнеет, и на нём — KABOOM, счёт, «ЗАНОВО». */
  private kaboom(): void {
    this.isGameOver = true;
    this.updateChipRecord(); // рекорд фиксируется по концу забега: KABOOM — тоже конец
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
