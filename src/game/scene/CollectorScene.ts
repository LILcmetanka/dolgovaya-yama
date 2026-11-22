import { interestCoins, TICKETS_PER_DEBT, winFactor } from '../amulets';
import { amuletTexture, TICKET_TEXTURE } from '../decor';
import { pactEffects, shiftPacts } from '../dealerGame';
import { diceWeight } from '../evil';
import { CHIP_RECORD } from '../gameConfig';
import {
  bestMultiplier,
  chancePrice,
  GOOD_LUCK_TIME,
  isLastChanceGoalMet,
  isLastChanceSymbol,
  LAST_CHANCE_ACTIONS,
  lastChanceBuyPrice,
  lastChanceBuyShare,
  lastChanceBuyVerdict,
  lastChanceGoal,
} from '../lastChance';
import { t } from '../lang';
import { CENTER_X, DISPLAY, GRID_Y } from '../layout';
import { machineWinFactor } from '../machines';
import { memoryOptions, type MemoryOption } from '../memory';
import { evaluateGrid } from '../patterns';
import { setRememberedAmulet } from '../progress';
import { FAILED_DEBT_ROUND_STEP, GRID_ROWS, JOKER, randomSymbol, weightsForRound, WON_DEBT_ROUND_STEP, type Grid, type SlotSymbol, type WeightOf } from '../rules';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT, GREEN_TEXT, LAMP_OFF, LAMP_RED } from '../theme';
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
const SECOND_WIND_WHY_FONT = 20; // пояснение под «ВТОРОЕ ДЫХАНИЕ»: обычный кегль попапа его растянул бы на весь вид
const INSTANT_WIN_PAUSE = 1200; // входная сетка уже бьёт цель: столько видно полосу и новость, потом долг закрывается
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
 * получаешь купон (билет), дальше магазин. Не хватает — на экране банкомата GOOD LUCK, автомат делает ОДНУ чистую прокрутку
 * (без черепов и злых символов), и у игрока два действия: перекрутить столбец или поставить джокера в клетку; заморозка
 * столбца бесплатная. Действия кончились, цель не взята — можно докупить ещё одно за долю фишек на руках (шаг 14).
 * Собрал паттерн, который оплачивает долю нехватки фишек (lastChanceGoal), — выезжает чемодан с фишками:
 * долг оплачен, фишки целы, билета нет, счёт на один долг назад. Не собрал (или сдался) — провал: первый за забег даёт
 * «второе дыхание» (счёт −1, магазин), следующий — KABOOM. Счётчик secondWindLeft живёт в записи забега и в кассете:
 * откат дыхание не пополняет, а сделка №9 кладёт ещё один запас.
 */
export abstract class CollectorScene extends SaveScene {
  // Последний шанс: сетка, которую игрок доделывает, и сколько действий у него осталось.
  private lastChanceGrid: Grid | null = null;
  private lastChanceGoal = 0; // какой множитель паттерна надо перекрыть; 0 — нехватки нет, годится любой паттерн
  private lastChanceActions = 0;
  private lastChanceBought = 0; // сколько докупок прокрутки сделано за этот последний шанс (шаг 14)
  private isLastChanceAwaitingBuy = false; // действия кончились, цель не взята, но докупка ещё возможна — ждём решения
  private readonly frozenColumns = new Set<number>(); // замороженные столбцы: перекрут их не трогает
  private isFreezeMode = false; // кнопка «лёд» включена: клик по столбцу морозит, а не перекручивает
  private isLastChanceWinPending = false; // входная сетка уже бьёт цель: полоса показана, через мгновение долг закроется
  private wasShoppingAtVictory = false; // победа застала магазин на экране: «ДАЛЬШЕ» доиграет его выход
  private victoryReached = false; // цель уже взята (порог сверен и пройден): падение баланса ниже chipGoal её не отменяет
  private endScreenCleanup: (() => void) | null = null; // уборка экрана победы: её зовёт «ДАЛЬШЕ»
  // Витрина памяти (шаг 26): что предложено и что нарисовано на экране смерти. Сценарий проверки читает эти поля.
  protected memoryOptions: MemoryOption[] = [];
  private memoryPanel: Phaser.GameObjects.GameObject[] = []; // всё нарисованное в слоте: уборка по крестику
  protected memoryChips: Phaser.GameObjects.Image[] = []; // значки амулетов: клик по ним и переносит
  protected memoryBox: Phaser.GameObjects.Rectangle | null = null;
  protected memoryTitleText: Phaser.GameObjects.Text | null = null;

  /** Новый забег: последний шанс не идёт, заморозки нет. */
  protected resetState(): void {
    super.resetState();
    this.lastChanceGrid = null;
    this.lastChanceGoal = 0;
    this.lastChanceActions = 0;
    this.lastChanceBought = 0;
    this.isLastChanceAwaitingBuy = false;
    this.frozenColumns.clear();
    this.isFreezeMode = false;
    this.isLastChanceWinPending = false;
    this.wasShoppingAtVictory = false;
    this.victoryReached = false; // новый забег — цель снова не взята
    this.endScreenCleanup = null;
    this.memoryOptions = [];
    this.memoryPanel = [];
    this.memoryChips = [];
    this.memoryBox = null;
    this.memoryTitleText = null;
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
    this.tooltip.hide(); // подсказки не должны висеть над выехавшим банкоматом
    this.sfx.play('hand'); // банкомат выезжает
    this.collector.reachOut(this.debt, enough, () => {
      if (!enough) {
        // Банкомат уехал после GOOD LUCK — начинается последний шанс.
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
   * Входная сетка уже бьёт цель — полоса и новость на 1,2 с, потом долг закрывается сам (DONTLIKE б.13).
   */
  private startLastChance(): void {
    this.isLastChance = true;
    this.pot = 0;
    this.lastChanceBought = 0; // докупки считаются заново: это новый последний шанс
    this.isLastChanceAwaitingBuy = false;
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
        // Чистая сетка уже перекрыла цель — действий не нужно. Но и молча закрывать долг нельзя: игрок не видел
        // ни цели, ни причины, почему выжил (DONTLIKE б.13). Показываем полосу с целью и новость, ждём и закрываем.
        this.isLastChanceWinPending = true;
        this.screen.announceNews(t('lcAlreadyWin'));
        this.lastChanceBar.open(goal, this.lastChanceActions);
        this.refreshLastChanceBuyLine(); // цель уже взята: плашка докупки гаснет, но строка цены на месте
        // Страховка от «победы без причины»: за эти 1,2 с шанс могли закрыть (перезапуск сцены, откат),
        // и тогда таймер не должен ни платить долг, ни открывать магазин со счётом −2.
        this.time.delayedCall(INSTANT_WIN_PAUSE, () => {
          if (this.isLastChanceWinPending) this.winLastChance();
        });
        return;
      }
      this.sfx.play('news', 0.3);
      this.lastChanceBar.open(goal, this.lastChanceActions);
      this.refreshLastChanceBuyLine();
    });
  }

  /**
   * Множители выигрыша амулетов, автомата и сделки «выигрыш паттернов +N%» — как в addToPot (RoundScene):
   * во сколько раз паттерн на кону больше своей цены. Кровавая прокрутка и предмет риска сюда не входят:
   * их флаги к приходу Коллектора сняты. Симулятор считает так же (full-run.mjs, collector).
   */
  private chanceWinFactor(): number {
    return winFactor(this.amuletIds(), this.bones) * machineWinFactor(this.machineId) * pactEffects(this.pacts, this.round).winMul;
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
   * «перекрут» и «джокер» ждут клика по сетке. Действия кончились — остаются только «докупить» и «сдаться»:
   * бесплатно перекручивать и ставить джокера нельзя (иначе цель не растёт, а шанс не кончается).
   */
  protected onLastChanceButton(action: LastChanceAction): void {
    if (!this.isLastChance || !this.lastChanceGrid || this.isSpinning) return; // пока столбец крутится, кнопки ждут
    if (this.isLastChanceWinPending) return; // сетка уже бьёт цель: долг закроется сам, кнопки не нужны
    if (action === 'surrender') {
      this.failLastChance();
      return;
    }
    if (action === 'buy') {
      this.buyLastChanceSpin(); // докупка действия за долю фишек на руках (шаг 14)
      return;
    }
    // Вход в выбор (заморозка, перекрут, джокер) без действия запрещён: в ожидании докупки — только «докупить» и «сдаться».
    if (this.lastChanceActions <= 0) {
      this.sfx.play('deny');
      this.refreshLastChanceBuyLine();
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
    if (!this.isLastChance || !this.lastChanceGrid || this.isLastChanceWinPending) return;
    // Действий нет — выбор снят и ничего не делаем: бесплатных перекрутов и джокеров не бывает.
    if (this.lastChanceActions <= 0) {
      this.screen.endPick();
      this.isFreezeMode = false;
      this.lastChanceBar.setFreezeMode(false);
      this.sfx.play('deny');
      return;
    }
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

  /** Трата одного действия. Пол нуля — только страховка: без остатка кнопки и выбор не работают (см. выше). */
  private spendAction(): void {
    this.lastChanceActions = Math.max(0, this.lastChanceActions - 1);
    this.lastChanceBar.setActions(this.lastChanceActions);
    this.refreshLastChanceBuyLine(); // остаток изменился: плашка докупки гаснет/загорается по правилу
  }

  /**
   * Докупка прокрутки (шаг 14): докупать можно только когда бесплатные действия кончились и цель не взята —
   * решает lastChanceBuyVerdict, одна дверь для сцены и симулятора. Цена — lastChanceBuyPrice, цель после покупки
   * пересчитывается тем же lastChanceGoal: нехватка выросла ровно на заплаченное.
   * Нельзя (действия ещё есть, лимит, не хватает фишек, цель у потолка) — только звук отказа и обновлённая подпись,
   * фишки целы. Покупка снимает открытый выбор, как обычные ветки кнопок.
   */
  private buyLastChanceSpin(): void {
    const verdict = lastChanceBuyVerdict(this.lastChanceActions, this.lastChanceBought, this.balance, this.lastChanceGoal);
    if (verdict !== 'ok') {
      this.sfx.play('deny');
      this.refreshLastChanceBuyLine();
      return;
    }
    this.screen.endPick(); // выбор сетки снят: действие уже куплено, ждать клика нечего
    this.isFreezeMode = false;
    this.lastChanceBar.setFreezeMode(false);
    const price = lastChanceBuyPrice(this.balance, this.lastChanceBought);
    this.balance -= price;
    this.lastChanceBought += 1;
    this.lastChanceActions += 1;
    const need = this.debt - this.balance;
    this.lastChanceGoal = lastChanceGoal(need, chancePrice(this.round), this.multiplier(), this.chanceWinFactor());
    this.lastChanceBar.setGoal(this.lastChanceGoal);
    this.lastChanceBar.setActions(this.lastChanceActions);
    this.isLastChanceAwaitingBuy = false;
    this.refreshLastChanceBuyLine();
    this.refreshHud();
    this.sfx.play('payment');
    this.effects.popup(`+1 · −${price}`, GOLD_TEXT);
  }

  /**
   * Строка цены докупки — одним хелпером по lastChanceBuyVerdict: цена с процентом, лимит, нехватка фишек
   * или цель у потолка. Пока действия ещё есть (early) — обычная цена и погашенная плашка: игрок видит, сколько
   * докупка будет стоить, когда действия кончатся. Ждём решения после последнего действия — «цель не взята ·
   * докупить ещё?».
   */
  private refreshLastChanceBuyLine(): void {
    if (this.isLastChanceAwaitingBuy) {
      this.lastChanceBar.setBuy(t('lcBuyMissed'), true);
      return;
    }
    const verdict = lastChanceBuyVerdict(this.lastChanceActions, this.lastChanceBought, this.balance, this.lastChanceGoal);
    if (verdict === 'limit') {
      this.lastChanceBar.setBuy(t('lcBuyLimit'), false);
      return;
    }
    if (verdict === 'poor') {
      this.lastChanceBar.setBuy(t('lcBuyPoor', lastChanceBuyPrice(this.balance, this.lastChanceBought)), false);
      return;
    }
    if (verdict === 'hopeless') {
      this.lastChanceBar.setBuy(t('lcBuyHopeless'), false);
      return;
    }
    // Процент — целое: доля 0,25 читается как «25», а не как «0.25».
    const share = Math.round(lastChanceBuyShare(this.lastChanceBought) * 100);
    const price = lastChanceBuyPrice(this.balance, this.lastChanceBought);
    // early — действия ещё есть: подпись обычная, но купить нельзя; ok — покупка доступна (кроме мгновенной победы).
    this.lastChanceBar.setBuy(t('lcBuyPrice', share, price), verdict === 'ok' && !this.isLastChanceWinPending);
  }

  /**
   * Действие отработало: есть ещё — ждём следующей кнопки, кончились — проверяем цель.
   * Цель не взята, но докупка ещё возможна — не проваливаем сразу: игрок может купить ещё действие (шаг 14).
   */
  private afterLastChanceAction(): void {
    if (!this.isLastChance) return;
    this.refreshHud();
    if (this.lastChanceActions > 0) {
      this.refreshLastChanceBuyLine(); // действия ещё есть: плашка докупки снова погашена (early)
      return;
    }
    const grid = this.lastChanceGrid;
    const best = grid ? bestMultiplier(evaluateGrid(grid)) : 0;
    const canBuy = lastChanceBuyVerdict(this.lastChanceActions, this.lastChanceBought, this.balance, this.lastChanceGoal) === 'ok';
    if (!isLastChanceGoalMet(best, this.lastChanceGoal) && canBuy) {
      this.isLastChanceAwaitingBuy = true;
      this.refreshLastChanceBuyLine();
      return;
    }
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
    this.isLastChanceWinPending = false;
    this.closeLastChance();
    this.sfx.play('payment');
    this.collector.clearGoodLuck();
    this.chipCase.open(() => {
      const before = this.round;
      this.round = Math.max(0, this.round - WON_DEBT_ROUND_STEP); // магазин прибавит единицу: раунд N − 1, а не N + 1
      this.pacts = shiftPacts(this.pacts, this.round - before); // сделка живёт сыгранные раунды, а не номер раунда
      this.openShop();
    });
  }

  /**
   * Провал: пока счётчик «второго дыхания» не пуст — запас тратится, счёт −1 и магазин, забег живёт дальше.
   * Пуст (обычный забег — после первого провала, со сделкой №9 — после второго) — KABOOM.
   */
  private failLastChance(): void {
    this.closeLastChance();
    if (this.secondWindLeft <= 0) {
      this.kaboom();
      return;
    }
    this.secondWindLeft -= 1;
    this.sfx.play('warning');
    // Попап — не только название: игрок должен понять, почему выжил и что будет дальше (DONTLIKE б.12).
    this.effects.popup(t('lcSecondWind'), GOLD_TEXT);
    this.effects.popupAt(CENTER_X, GRID_Y + 24, t('lcSecondWindWhat'), GOLD_TEXT, SECOND_WIND_WHY_FONT);
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

  /** Последний шанс кончился любой дорогой: убрать полосу, сетку выбора и мороз, снять isLastChance. */
  private closeLastChance(): void {
    this.screen.endPick();
    this.screen.showFrozen([]);
    this.lastChanceBar.close();
    this.collector.clearGoodLuck(); // GOOD LUCK с экрана уходит и после провала
    this.frozenColumns.clear();
    this.isFreezeMode = false;
    this.isLastChanceWinPending = false;
    this.lastChanceGrid = null;
    this.lastChanceBought = 0;
    this.isLastChanceAwaitingBuy = false;
    this.isLastChance = false;
    this.isSpinning = false;
    this.pot = 0;
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

  /** Сцена занята действием — победа подождёт его конца: спин, решение по перемешке, Дилер, банкомат, последний шанс. */
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
