import { interestCoins, TICKETS_PER_DEBT } from '../amulets';
import { amuletTexture, TICKET_TEXTURE } from '../decor';
import { shiftPacts } from '../dealerGame';
import { CHIP_RECORD } from '../gameConfig';
import {
  GOOD_LUCK_TIME,
  RESCUE_SPINS,
  rescueDebtModeOf,
  rescueDebtMul,
  rescueFreezeVerdict,
  rescueOutcome,
  rescueSpin,
  rescueSpinningColumns,
  rescueSpinsAfter,
  rescueToggleFrozen,
  rescueWeightOf,
} from '../lastChance';
import { t } from '../lang';
import { CENTER_X, DISPLAY, GRID_Y } from '../layout';
import { memoryOptions, type MemoryOption } from '../memory';
import { setRememberedAmulet } from '../progress';
import { debtForRound, FAILED_DEBT_ROUND_STEP, type Grid } from '../rules';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT, GREEN_TEXT, LAMP_OFF, LAMP_RED } from '../theme';
import { SaveScene } from './SaveScene';

// Порядок событий, мс.
const RESTART_SPACE_DELAY = 800; // Пробел на экране KABOOM перезапускает игру не раньше, чем через столько
const KABOOM_WARN_TIME = 1800; // KABOOM мигает на экране автомата, потом взрыв
const KABOOM_AFTER_TIME = 900; // после взрыва — пауза, потом всё темнеет
const KABOOM_SHAKE_TIME = 700;
const KABOOM_SHAKE = 0.03;
const RESCUE_TENSION = 1; // в раунде спасения сердце в музыке бьётся быстрее всего
const RESCUE_WIN_PAUSE = 1200; // паттерн собран: столько видно новость, потом магазин
const SECOND_WIND_PAUSE = 1200; // провал с «вторым дыханием»: столько видно, что случилось, потом магазин
const SECOND_WIND_WHY_FONT = 20; // пояснение под «ВТОРОЕ ДЫХАНИЕ»: обычный кегль попапа его растянул бы на весь вид
// Победа (набрано CHIP_GOAL).
const VICTORY_SETTLE_TIME = 400; // после прибавки фишек столько ждём: текущее действие успевает доиграть
const VICTORY_PAUSE = 1400; // лампы погасли, новое число на табло видно — пауза, потом затемнение
// Витрина памяти после смерти (шаг 26): слот внутри чёрного экрана автомата, под мигающим заголовком и над счётом.
const MEMORY_PANEL_Y = 406; // середина панели: заголовок KABOOM стоит на 314, счёт — на 500
const MEMORY_PANEL_HEIGHT = 96;
const MEMORY_PANEL_MIN_WIDTH = 260;
const MEMORY_PANEL_PAD = 16; // поле панели до крестика и края
const MEMORY_CHIP_STEP = 54; // от значка амулета до значка
const MEMORY_TITLE_DY = -36; // от середины панели до строки заголовка
const MEMORY_ICON_DY = -4; // значок амулета; под ним — цена в билетах
const MEMORY_PRICE_DY = 32;
const MEMORY_ICON_SCALE = 1.2; // значок 36 px из гнезда чуть крупнее: в витрине виднее
const MEMORY_DEPTH = GAME_OVER_DEPTH + 1; // над затемнением и заголовком экрана смерти, как кнопка «ЗАНОВО»
const MEMORY_FILL = 0x0b0b0b;
const MEMORY_BORDER = 0xfbbf24;

/**
 * Слой Коллектора: в конце раунда к автомату приходит Коллектор. Хватает фишек — из темноты выезжает банкомат, отдаёшь долг,
 * получаешь купон (билет), дальше магазин. Не хватает — на экране банкомата GOOD LUCK, и начинается раунд спасения
 * (шаг 27): всё уходит в красный, даётся 5 прокруток, доля черепов — RESCUE_SKULL_SHARE, надо собрать хотя бы один
 * паттерн. После прокрутки можно заморозить или разморозить один столбец; крутятся только незамороженные.
 * Амулеты и предметы в спасении заморожены. Собрал паттерн — выжил, долг остаётся тем же (назад пути нет),
 * магазин и новый раунд. Не собрал — провал: первый за забег даёт «второе дыхание» (счёт −1, магазин),
 * следующий — KABOOM. Счётчик secondWindLeft живёт в записи забега и в кассете:
 * откат дыхание не пополняет, а сделка №9 кладёт ещё один запас.
 */
export abstract class CollectorScene extends SaveScene {
  // Раунд спасения: сетка, которую докручивает игрок, остаток прокруток и заморозки.
  private rescueGrid: Grid | null = null;
  private rescueSpinsLeft = 0;
  private rescueFreezeUsed = false; // заморозка/разморозка в этом ходу уже была: разрешена одна
  private readonly frozenColumns = new Set<number>(); // замороженные столбцы: прокрутка их не трогает
  private isRescueWinPending = false; // паттерн собран: новость показана, через мгновение магазин
  private wasShoppingAtVictory = false; // победа застала магазин на экране: «ДАЛЬШЕ» доиграет его выход
  private victoryReached = false; // цель уже взята (порог сверен и пройден): падение баланса ниже chipGoal её не отменяет
  private endScreenCleanup: (() => void) | null = null; // уборка экрана победы: её зовёт «ДАЛЬШЕ»
  // Витрина памяти (шаг 26): что предложено и что нарисовано на экране смерти. Сценарий проверки читает эти поля.
  protected memoryOptions: MemoryOption[] = [];
  private memoryPanel: Phaser.GameObjects.GameObject[] = []; // всё нарисованное в слоте: уборка по крестику
  protected memoryChips: Phaser.GameObjects.Image[] = []; // значки амулетов: клик по ним и переносит
  protected memoryBox: Phaser.GameObjects.Rectangle | null = null;
  protected memoryTitleText: Phaser.GameObjects.Text | null = null;

  /** Новый забег: спасения нет, заморозок нет. */
  protected resetState(): void {
    super.resetState();
    this.rescueGrid = null;
    this.rescueSpinsLeft = 0;
    this.rescueFreezeUsed = false;
    this.isRescueWinPending = false;
    this.frozenColumns.clear();
    this.wasShoppingAtVictory = false;
    this.victoryReached = false; // новый забег — цель снова не взята
    this.endScreenCleanup = null;
    this.memoryOptions = [];
    this.memoryPanel = [];
    this.memoryChips = [];
    this.memoryBox = null;
    this.memoryTitleText = null;
  }

  /** В раунде спасения сердце в музыке бьётся быстрее всего. */
  protected tension(): number {
    return this.isRescue ? RESCUE_TENSION : super.tension();
  }

  /**
   * Прокрутки кончились (или долг отдают раньше — isPaidEarly): Коллектор идёт за долгом.
   * Фишек не хватает — сначала тревога и красные огни на GOOD_LUCK_TIME, потом раунд спасения.
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
   * игрок уже решил); не хватает — на его экране GOOD LUCK, банкомат уезжает, начинается раунд спасения.
   */
  private reachOut(isPaidEarly: boolean): void {
    const enough = this.hasEnoughForDebt();
    this.tooltip.hide(); // подсказки не должны висеть над выехавшим банкоматом
    this.sfx.play('hand'); // банкомат выезжает
    this.collector.reachOut(this.debt, enough, () => {
      if (!enough) {
        // Банкомат уехал после GOOD LUCK — начинается раунд спасения.
        this.startRescue();
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
        this.openShop();
      },
    );
  }

  // ---------- Раунд спасения ----------

  /**
   * Фишек не хватило: банкомат уехал с GOOD LUCK — всё уходит в красный, игра даёт 5 прокруток.
   * Первую прокрутку делает игрок рычагом: так он сам решает, когда начать. Дальше после каждой прокрутки —
   * один клик по столбцу (заморозить или разморозить), крутятся только незамороженные.
   */
  private startRescue(): void {
    this.isRescue = true;
    this.pot = 0;
    this.rescueGrid = null;
    this.rescueSpinsLeft = RESCUE_SPINS;
    this.rescueFreezeUsed = false;
    this.isRescueWinPending = false;
    this.frozenColumns.clear();
    this.screen.endPick();
    this.screen.showFrozen([]);
    this.screen.clearHighlights(); // рамки прошлой прокрутки в спасении не нужны
    this.clearRust(); // ржавый столбец не должен молча не крутиться в спасении
    this.screen.clearNews();
    this.rescueBar.open(RESCUE_SPINS);
    this.enterRescueMood();
    this.refreshHud();
    this.sfx.play('warning', 0.5);
  }

  /** Красный режим: огни автомата красные, по краям вида красное свечение, амулеты и предметы притушены. */
  private enterRescueMood(): void {
    this.screen.setCalmColor(LAMP_RED);
    this.screen.flashLamps(LAMP_RED, GOOD_LUCK_TIME);
    this.atmosphere.setRescueAlert(true);
    this.itemShelf.setDimmed(true);
    this.amuletRack.setDimmed(true);
  }

  /** Красный режим снят: огни снова обычные, свечение гаснет, амулеты и предметы снова видны. */
  private exitRescueMood(): void {
    this.atmosphere.setRescueAlert(false);
    this.screen.setCalmColor(this.calmLampColor());
    this.itemShelf.setDimmed(false);
    this.amuletRack.setDimmed(false);
  }

  /** Рычаг и Пробел в спасении крутят спасение, а не обычный раунд (там прокруток уже нет). */
  protected override spin(): void {
    if (this.isRescue) {
      this.rescueSpinNow();
      return;
    }
    super.spin();
  }

  /**
   * Одна прокрутка спасения: незамороженные столбцы выпадают заново, замороженные стоят.
   * Остаток уменьшается здесь же; итог — после остановки последнего столбца (afterRescueSpin).
   */
  private rescueSpinNow(): void {
    if (!this.isRescue || this.isSpinning || this.isRescueWinPending) return;
    if (this.rescueSpinsLeft <= 0) return;
    const columns = rescueSpinningColumns([...this.frozenColumns]);
    if (columns.length === 0) {
      this.sfx.play('deny'); // всё заморожено — крутить нечего (правило не даёт заморозить последний столбец)
      return;
    }
    const weightOf = rescueWeightOf(this.round);
    this.rescueGrid = rescueSpin(this.rescueGrid, [...this.frozenColumns], weightOf);
    this.rescueSpinsLeft = rescueSpinsAfter(this.rescueSpinsLeft);
    this.rescueFreezeUsed = false; // новый ход: снова можно заморозить или разморозить один столбец
    this.rescueBar.setSpins(this.rescueSpinsLeft);
    this.rescueBar.setFreezeUsed(false);
    this.screen.endPick();
    this.screen.clearHighlights();
    this.isSpinning = true;
    this.panel.pullLever();
    this.sfx.play('lever');
    this.sfx.play('roll', 0.1);
    this.refreshHud();
    this.screen.spinColumns(this.rescueGrid, weightOf, columns, () => {
      this.isSpinning = false;
      this.afterRescueSpin();
    });
  }

  /**
   * Столбцы встали: собрали платящий паттерн — выжили; прокрутки кончились — умерли; иначе — ход заморозки:
   * один клик по столбцу морозит или размораживает его.
   */
  private afterRescueSpin(): void {
    if (!this.isRescue || this.isRescueWinPending) return;
    const grid = this.rescueGrid;
    const outcome = grid ? rescueOutcome(grid, this.rescueSpinsLeft) : 'dead';
    if (outcome === 'won') {
      this.winRescue();
      return;
    }
    if (outcome === 'dead') {
      this.failRescue();
      return;
    }
    this.refreshHud();
    this.screen.beginPick('column', (_row, col) => this.onRescuePick(col));
  }

  /**
   * Клик по столбцу в спасении: заморозить или разморозить. Разрешено одно действие за прокрутку,
   * последний незамороженный столбец морозить нельзя — иначе крутить нечего. Решает rescueToggleFrozen.
   */
  private onRescuePick(col: number): void {
    if (!this.isRescue || this.isSpinning || this.isRescueWinPending) return;
    const next = rescueToggleFrozen([...this.frozenColumns], col, this.rescueFreezeUsed);
    if (!next) {
      const verdict = rescueFreezeVerdict([...this.frozenColumns], col, this.rescueFreezeUsed);
      if (verdict === 'used' || verdict === 'last') this.sfx.play('deny');
      return;
    }
    this.frozenColumns.clear();
    for (const value of next.frozen) this.frozenColumns.add(value);
    this.rescueFreezeUsed = next.used;
    this.screen.showFrozen([...this.frozenColumns]);
    this.screen.endPick(); // одно действие за ход: дальше — рычаг
    this.rescueBar.setFreezeUsed(true);
    this.sfx.play('rust');
    this.refreshHud();
  }

  /**
   * Паттерн собран: выжил. Долг не откатывается и не прощается; как он растёт дальше — решает RESCUE_DEBT_MODE:
   *  • 'frozen' — следующий долг равен текущему (debtNextMul = rescueDebtMul);
   *  • 'curve'  — следующий долг считается от номера раунда, как в обычном раунде (openShop сам возьмёт
   *               debtForRound(round + 1)), а debtNextMul остаётся 1.
   * Назад пути нет.
   */
  private winRescue(): void {
    this.isRescueWinPending = true;
    this.screen.endPick();
    this.rescueBar.showResult();
    this.screen.announceNews(t('rescueSurvived'));
    this.sfx.play('bigWin');
    this.time.delayedCall(RESCUE_WIN_PAUSE, () => {
      if (!this.isRescue || !this.isRescueWinPending) return;
      this.isRescueWinPending = false;
      this.closeRescue();
      this.sfx.play('payment');
      // Умножаем на действующий множитель: сделка №12 (+20% к следующему долгу) не должна потеряться от спасения.
      if (rescueDebtModeOf() === 'frozen') this.debtNextMul = rescueDebtMul(this.debt, debtForRound(this.round + 1)) * this.debtNextMul;
      this.openShop();
    });
  }

  /**
   * Провал: паттерна нет. Пока счётчик «второго дыхания» не пуст — запас тратится, счёт −1 и магазин, забег живёт дальше.
   * Пуст (обычный забег — после первого провала, со сделкой №9 — после второго) — KABOOM.
   */
  private failRescue(): void {
    this.closeRescue();
    if (this.secondWindLeft <= 0) {
      this.kaboom();
      return;
    }
    this.secondWindLeft -= 1;
    this.sfx.play('warning');
    // Попап — не только название: игрок должен понять, почему выжил и что будет дальше (DONTLIKE б.12).
    this.effects.popup(t('rescueSecondWind'), GOLD_TEXT);
    this.effects.popupAt(CENTER_X, GRID_Y + 24, t('rescueSecondWindWhat'), GOLD_TEXT, SECOND_WIND_WHY_FONT);
    this.time.delayedCall(SECOND_WIND_PAUSE, () => {
      // За 1,2 с забег мог кончиться или магазин уже встать (ввод в это время закрыт isRoundOver):
      // второй раз счёт не двигаем и второй магазин не открываем.
      if (this.isGameOver || this.isShopOpen) return;
      // Долг не закрыт — счёт не двигаем (FAILED_DEBT_ROUND_STEP = 1): магазин прибавит единицу, и следующий
      // долг будет тем же, без роста. Раньше счёт шёл на один долг назад — проигрыш выходил бафом.
      const before = this.round;
      this.round = Math.max(0, this.round - FAILED_DEBT_ROUND_STEP);
      this.pacts = shiftPacts(this.pacts, this.round - before); // сроки сделок едут вместе со счётом раундов
      this.openShop();
    });
  }

  /** Спасение кончилось любой дорогой: убрать полосу, сетку выбора, мороз и красный режим, снять isRescue. */
  private closeRescue(): void {
    this.screen.endPick();
    this.screen.showFrozen([]);
    this.rescueBar.close();
    this.collector.clearGoodLuck(); // GOOD LUCK с экрана уходит и после провала
    this.frozenColumns.clear();
    this.rescueGrid = null;
    this.rescueSpinsLeft = 0;
    this.rescueFreezeUsed = false;
    this.isRescueWinPending = false;
    this.isRescue = false;
    this.isSpinning = false;
    this.pot = 0;
    this.exitRescueMood();
    this.screen.clearNews();
    this.refreshHud();
  }

  // ---------- Конец забега ----------

  /**
   * Цель забега взята — на руках chipGoal: 1 000 000, а после «ДАЛЬШЕ» — 10 000 000 (CHIP_RECORD). Решение автора
   * (19.11): цель считается по фишкам НА РУКАХ (balance), а не по обороту (earned). Зовётся из earn(), то есть
   * посреди действия: забрали кон, страховка вернула часть сгоревшего, капнули проценты, выпали фишки барабана.
   * Поэтому победа начинается не сразу: ждём VICTORY_SETTLE_TIME, чтобы анимация доиграла (вращение, оплата в банкомат,
   * колесо), и пробуем снова, пока сцена занята. Иначе isGameOver встал бы посреди прокрутки, и её итог пришёл бы уже
   * на экран победы. Порог сверяется ОДИН раз: прошли его — victoryReached, и дальше ни отложенный колбэк, ни ветка
   * «сцена занята» баланс не проверяют. Иначе оплата долга или магазин успели бы списать фишки за время ожидания,
   * и заработанная победа тихо отменилась бы.
   * Пока победа ждёт (isVictoryPending), ввод закрыт (BaseScene.canAct): кассета не откатит забег, новая прокрутка
   * не начнётся.
   */
  protected override checkChipGoal(): void {
    if (!this.victoryReached) {
      if (this.balance < this.chipGoal) return;
      this.victoryReached = true; // цель взята: ниже chipGoal баланс уже не опустит победу
    }
    if (this.isGameOver || this.isVictoryPending) return;
    this.isVictoryPending = true;
    this.time.delayedCall(VICTORY_SETTLE_TIME, () => {
      this.isVictoryPending = false;
      if (this.isGameOver) return;
      if (this.isBusyForVictory()) {
        this.checkChipGoal(); // действие ещё идёт — ждём дальше; порог не сверяем, победа уже заработана
        return;
      }
      this.startVictory();
    });
  }

  /** Сцена занята действием — победа подождёт его конца: спин, решение по перемешке, Дилер, банкомат, спасение. */
  private isBusyForVictory(): boolean {
    return (
      this.isSpinning ||
      this.isRerolling ||
      this.isDealing ||
      this.isAwaitingPayment ||
      this.isRescue ||
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
    // Экран конца забега ложится выше окна ачивки: пока он открыт, «Конец?» и «Это не конец...» ждут в очереди,
    // а не тают под экраном. Довезёт их continueRun («ДАЛЬШЕ») или новая сцена после «Заново».
    this.isEndScreenOpen = true;
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
    this.victoryReached = false; // новая ступень — своя проверка: иначе взятый миллион сразу закрыл бы и 10 000 000
    this.isGameOver = false;
    this.isEndScreenOpen = false; // экран победы убран: очередь ачивок снова может идти к игроку
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
    this.pumpAchievements(); // «ДАЛЬШЕ»: очередь, что ждала под экраном победы, доезжает до игрока
  }

  /**
   * Витрина памяти (DONTLIKE §2, вариант А): после смерти — один амулет погибшего забега за билеты.
   * Список и цены считает memory.ts: только уникальные амулеты забега и только те, на которые хватает билетов,
   * поэтому при нехватке билетов слота нет совсем. Копии не переносятся. Выбор кликом уходит в progress
   * (setRememberedAmulet) и сработает в начале следующего забега (BaseScene.grantMemoryAmulet).
   */
  private showMemorySlot(): void {
    const options = memoryOptions(this.amulets.map((amulet) => amulet.id), this.tickets);
    if (options.length === 0) return; // амулетов не было или билетов не хватает — слот не показываем
    this.memoryOptions = options;
    const width = Math.max(MEMORY_PANEL_MIN_WIDTH, options.length * MEMORY_CHIP_STEP + MEMORY_PANEL_PAD * 2);
    const box = this.createMemoryBox(width);
    this.memoryBox = box;
    const title = t('memoryTitle');
    const titleText = this.memoryTitle(title, GOLD_TEXT);
    fitTextWidth(titleText, title, width - MEMORY_PANEL_PAD * 4, 15, 10);
    // Крестик — отказ: слот просто убирается, память не пишется.
    const close = addText(this, CENTER_X + width / 2 - MEMORY_PANEL_PAD, MEMORY_PANEL_Y + MEMORY_TITLE_DY, '✕', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5).setDepth(MEMORY_DEPTH);
    close.setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.clearMemoryPanel());
    this.memoryPanel = [box, titleText, close];
    this.memoryTitleText = titleText;
    this.memoryChips = [];
    const start = CENTER_X - ((options.length - 1) * MEMORY_CHIP_STEP) / 2;
    options.forEach((option, index) => {
      const x = start + index * MEMORY_CHIP_STEP;
      const icon = this.add.image(x, MEMORY_PANEL_Y + MEMORY_ICON_DY, amuletTexture(option.amulet)).setScale(MEMORY_ICON_SCALE).setDepth(MEMORY_DEPTH);
      icon.setInteractive({ useHandCursor: true });
      icon.on('pointerover', () => icon.setScale(MEMORY_ICON_SCALE * 1.15));
      icon.on('pointerout', () => icon.setScale(MEMORY_ICON_SCALE));
      icon.on('pointerdown', () => this.rememberAmulet(option));
      // Цена в билетах под значком: красный билет и число — так же, как ценники в магазине.
      const ticket = this.add.image(x - 7, MEMORY_PANEL_Y + MEMORY_PRICE_DY, TICKET_TEXTURE).setScale(0.5).setDepth(MEMORY_DEPTH);
      const price = addText(this, x + 3, MEMORY_PANEL_Y + MEMORY_PRICE_DY, String(option.price), {
        fontSize: '13px',
        fontStyle: 'bold',
        color: GOLD_TEXT,
      }).setOrigin(0, 0.5).setDepth(MEMORY_DEPTH);
      this.memoryPanel.push(icon, ticket, price);
      this.memoryChips.push(icon);
    });
  }

  /** Тёмная панель витрины с золотой рамкой — над экраном автомата и затемнением смерти. */
  private createMemoryBox(width: number): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(CENTER_X, MEMORY_PANEL_Y, width, MEMORY_PANEL_HEIGHT, MEMORY_FILL, 0.94)
      .setRounded(10)
      .setStrokeStyle(2, MEMORY_BORDER)
      .setDepth(MEMORY_DEPTH);
  }

  /** Строка заголовка панели: по центру, тем же золотом, что у кнопок конца забега. */
  private memoryTitle(text: string, color: string): Phaser.GameObjects.Text {
    return addText(this, CENTER_X, MEMORY_PANEL_Y + MEMORY_TITLE_DY, text, { fontSize: '15px', fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(MEMORY_DEPTH);
  }

  /**
   * Клик по амулету: билеты списываются здесь же (цена — за редкость), выбор пишется в прогресс, витрина
   * превращается в строку «В ПАМЯТИ: …» с выбранным амулетом. Забег начинается только по «ЗАНОВО».
   */
  private rememberAmulet(option: MemoryOption): void {
    // Двойной клик: слот уже сработал (витрины нет) — второй раз билеты не списываем.
    if (this.memoryOptions.length === 0) return;
    if (this.tickets < option.price) return; // не хватает билетов — вариант и не предлагался
    this.tickets -= option.price; // билеты забега на момент смерти: с этой минуты их меньше на цену
    setRememberedAmulet(option.amulet.id);
    this.refreshHud();
    this.sfx.play('payment');
    this.clearMemoryPanel();
    const width = MEMORY_PANEL_MIN_WIDTH;
    const box = this.createMemoryBox(width);
    const kept = t('memoryKept', t(option.amulet.name));
    const titleText = this.memoryTitle(kept, GREEN_TEXT);
    fitTextWidth(titleText, kept, width - MEMORY_PANEL_PAD * 2, 15, 10);
    const icon = this.add.image(CENTER_X, MEMORY_PANEL_Y + MEMORY_ICON_DY, amuletTexture(option.amulet)).setScale(MEMORY_ICON_SCALE).setDepth(MEMORY_DEPTH);
    this.memoryPanel = [box, titleText, icon];
    this.memoryBox = box;
    this.memoryTitleText = titleText;
  }

  /** Убрать слот с экрана смерти: всё нарисованное уничтожается, память не пишется. */
  private clearMemoryPanel(): void {
    for (const part of this.memoryPanel) part.destroy();
    this.memoryPanel = [];
    this.memoryChips = [];
    this.memoryOptions = [];
    this.memoryBox = null;
    this.memoryTitleText = null;
  }

  /** Конец забега: на экране автомата KABOOM, потом автомат взрывается, всё темнеет, и на нём — KABOOM, счёт, «ЗАНОВО». */
  private kaboom(): void {
    this.isGameOver = true;
    // Экран DEATH тоже ляжет выше окна ачивки: выданное перед смертью ждёт в очереди и доедет в новом забеге
    // (restartGame передаёт pendingAchievements), а не тает под экраном.
    this.isEndScreenOpen = true;
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
          this.showMemorySlot(); // после смерти — один амулет из забега за билеты (шаг 26); после победы его нет
          this.time.delayedCall(RESTART_SPACE_DELAY, () => {
            this.canRestartWithSpace = true;
          });
        });
      });
    });
  }
}
