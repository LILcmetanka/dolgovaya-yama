import { interestCoins, TICKETS_PER_DEBT } from '../amulets';
import { pactDebtTicketPlan, pactEffects } from '../dealerGame';
import { isDevMode } from '../devmode';
import { CHIP_RECORD } from '../gameConfig';
import {
  GOOD_LUCK_TIME,
  RESCUE_SPINS,
  rescueAllowed,
  rescueFreezeVerdict,
  rescueOutcome,
  rescueSpin,
  rescueSpinningColumns,
  rescueSpinsAfter,
  rescueToggleFrozen,
  rescueWeightOf,
  WON_RESCUE_ROUND_STEP,
} from '../lastChance';
import { t } from '../lang';
import { DISPLAY } from '../layout';
import { RESCUE_FADE_TIME } from '../parts/atmosphere';
import { MEMORY_PICKS_PACT } from '../memory';
import { grantUpgrade, setNextRunMemory } from '../progress';
import type { Grid } from '../rules';
import { GOLD_TEXT, GREEN_TEXT, LAMP_OFF, LAMP_RED } from '../theme';
import { UPGRADE_SECOND_PRICE, memoryPickCount, roundDebtTickets, upgradeOffers, type Upgrade } from '../upgrades';
import { SaveScene } from './SaveScene';

// Порядок событий, мс.
const RESTART_SPACE_DELAY = 800; // Пробел на экране KABOOM перезапускает игру не раньше, чем через столько
const KABOOM_WARN_TIME = 1800; // KABOOM мигает на экране автомата, потом взрыв
const KABOOM_AFTER_TIME = 900; // после взрыва — пауза, потом всё темнеет
const KABOOM_SHAKE_TIME = 700;
const KABOOM_SHAKE = 0.03;
const RESCUE_TENSION = 1; // в раунде спасения сердце в музыке бьётся быстрее всего
const RESCUE_WIN_PAUSE = 1200; // паттерн собран: столько видно новость, потом магазин
// Победа (набрано CHIP_GOAL).
const VICTORY_SETTLE_TIME = 400; // после прибавки фишек столько ждём: текущее действие успевает доиграть
const VICTORY_PAUSE = 1400; // лампы погасли, новое число на табло видно — пауза, потом затемнение
// Первое спасение за сессию: полная заставка «ВНИМАНИЕ! → АКТИВИРОВАН… → СОБЕРИ…». Дальше — короткое
// «ПОСЛЕДНИЙ ШАНС» (DONTLIKE п.6): автору не нужно одно и то же объяснение на каждую яму. Флаг живёт модуль —
// значит, весь сеанс страницы, и переживает «ЗАНОВО», но не перезагрузку.
let lastChanceIntroSeen = false;

/**
 * Слой Коллектора: в конце раунда к автомату приходит Коллектор. Хватает фишек — из темноты выезжает банкомат, отдаёшь долг,
 * получаешь купон (билет), дальше магазин. Не хватает — на экране банкомата GOOD LUCK, и начинается раунд спасения
 * (шаг 27): всё уходит в красный, даётся 5 прокруток, доля черепов — RESCUE_SKULL_SHARE, надо собрать хотя бы один
 * паттерн. После прокрутки можно заморозить или разморозить один столбец; крутятся только незамороженные.
 * Амулеты и предметы в спасении заморожены. Собрал паттерн — выжил: ни фишек, ни билетов за это не дают, долг
 * остаётся тем же и раунд играется заново (WON_RESCUE_ROUND_STEP). Не собрал — провал: сразу KABOOM, без
 * прощения и без магазина (решение автора 22.11.2026, шаг 34: «если я проиграл — проиграл, ВСЁ»).
 * Спасение одно за забег: второй нехватки фишек не прощают, KABOOM идёт сразу (rescueAllowed);
 * флаг rescueUsed липкий — откат его не снимает.
 */
export abstract class CollectorScene extends SaveScene {
  // Раунд спасения: сетка, которую докручивает игрок, остаток прокруток и заморозки.
  private rescueGrid: Grid | null = null;
  private rescueSpinsLeft = 0;
  private rescueFreezeUsed = false; // заморозка/разморозка в этом ходу уже была: разрешена одна
  private readonly frozenColumns = new Set<number>(); // замороженные столбцы: прокрутка их не трогает
  private isRescueIntro = false; // на экране автомата идёт заставка спасения: ввод закрыт, крутить нельзя (шаг 32)
  private rescueHintLive = false; // подсказка спасения сейчас на стекле: её перерисовывает смена языка (шаг 35)
  private rescueIntroFull = true; // полная заставка (первая яма сессии) или короткое «ПОСЛЕДНИЙ ШАНС» (DONTLIKE п.6)
  private isRescueWinPending = false; // паттерн собран: новость показана, через мгновение магазин
  private wasShoppingAtVictory = false; // победа застала магазин на экране: «ДАЛЬШЕ» доиграет его выход
  private victoryReached = false; // цель уже взята (порог сверен и пройден): падение баланса ниже chipGoal её не отменяет
  private endScreenCleanup: (() => void) | null = null; // уборка экрана победы: её зовёт «ДАЛЬШЕ»
  // Улучшения после смерти (шаг 28): три карточки над экраном смерти. Что предложено и в какой фазе выбор —
  // сценарий проверки читает эти поля.
  protected upgradeOfferList: Upgrade[] = [];
  protected upgradeSecondPhase = false; // бесплатное улучшение взято: теперь можно второе за билеты

  /** Новый забег: спасения нет, заморозок нет. */
  protected resetState(): void {
    super.resetState();
    this.rescueGrid = null;
    this.rescueSpinsLeft = 0;
    this.rescueFreezeUsed = false;
    this.isRescueIntro = false;
    this.isRescueWinPending = false;
    this.rescueHintLive = false;
    this.frozenColumns.clear();
    this.wasShoppingAtVictory = false;
    this.victoryReached = false; // новый забег — цель снова не взята
    this.endScreenCleanup = null;
    this.upgradeOfferList = [];
    this.upgradeSecondPhase = false;
  }

  /** В раунде спасения сердце в музыке бьётся быстрее всего. */
  protected tension(): number {
    return this.isRescue ? RESCUE_TENSION : super.tension();
  }

  /**
   * Прокрутки кончились (или долг отдают раньше — isPaidEarly): Коллектор идёт за долгом.
   * Фишек не хватает — сначала тревога и красные огни на GOOD_LUCK_TIME, потом раунд спасения.
   * Если спасение в этом забеге уже было — не прощают: GOOD LUCK не показываем, сразу KABOOM
   * (решение автора 22.11.2026; липкий флаг rescueUsed откат кассетой не снимает).
   * Улучшение №10 (шаг 28) идёт раньше спасения: раз за забег долг можно отложить на раунд.
   */
  protected callCollector(isPaidEarly: boolean): void {
    // Забег уже кончен (победа по цели или KABOOM): Коллектору за долгом идти незачем.
    // Без этой строки он приезжал бы поверх экрана победы — его вызов стоит в таймере endOfSpins.
    if (this.isGameOver) return;
    this.finishTutorial(); // Коллектор пришёл — тьма рассеивается совсем (и обучение запоминается)
    // Долга нет (прощённый первый долг, №8): платить нечего — банкомат не выезжает, анимаций и GOOD LUCK нет,
    // сразу магазин. Так нулевой долг не может дойти до раунда спасения (`DONTLIKE` п.5 и п.15, шаг 38).
    if (this.isDebtFree()) {
      this.skipFreeDebt();
      return;
    }
    if (!this.hasEnoughForDebt()) {
      // Сделка №45: половину долга можно закрыть билетами. Один билет — 10% долга, но не больше половины;
      // остаток должен покрываться фишками. Решение принимается сразу: иначе игрок просто не увидел бы выхода.
      if (pactEffects(this.pacts, this.round).debtTicketsHalf) {
        const plan = pactDebtTicketPlan(this.debt, this.tickets);
        if (plan.tickets > 0 && plan.chips <= this.balance) {
          const covered = this.debt - plan.chips;
          this.tickets -= plan.tickets;
          this.balance += covered; // билеты превратились в фишки ровно на свою долю долга
          this.sfx.play('ticket');
          this.effects.popup(`−${plan.tickets} 🎟`, GOLD_TEXT);
          this.refreshHud();
        }
      }
      if (this.canDeferDebt()) {
        this.deferDebt(); // «Отсрочка»: долг уйдёт к следующему раунду, яма и KABOOM подождут
        return;
      }
      if (!rescueAllowed(this.rescueUsedThisRun)) {
        this.kaboom(); // яма уже была: второй раз фишек на долг не хватает — конец забега
        return;
      }
      this.sfx.play('warning');
      this.screen.flashLamps(LAMP_RED, GOOD_LUCK_TIME);
    }
    this.reachOut(isPaidEarly);
  }

  /**
   * Долг этого раунда прощён (№8): платить нечего. Банкомат не выезжает вовсе (DONTLIKE п.5: «нечего брать —
   * не надо банкомат и анимации»), купона и билета за долг нет — долг ведь не платили. Дальше магазин: раунд
   * закрыт, как обычная оплата, но без клика и без «Процентов» (проценты капают на остаток после платежа).
   */
  private skipFreeDebt(): void {
    this.refreshHud();
    this.openShop();
  }

  /**
   * Запомнить амулеты закончившегося забега: на старте следующего игрок выберет из них память (шаг 38).
   * Сколько взять — upgrades.memoryPickCount (№30 даёт второй) плюс сделка №34, если она живёт в этом раунде.
   */
  protected bankRunAmulets(): void {
    const pactExtra = pactEffects(this.pacts, this.round).amuletDeathSave ? MEMORY_PICKS_PACT : 0;
    setNextRunMemory(this.amulets.map((amulet) => amulet.id), memoryPickCount(this.upgradeEffects) + pactExtra);
  }

  /** Улучшение №10: отсрочка куплена и в этом забеге ещё не тратилась. */
  private canDeferDebt(): boolean {
    // Улучшение №10 или сделка №43 «отсрочка на раунд»: и та и другая — раз за забег.
    return (this.upgradeEffects.deferOnce || pactEffects(this.pacts, this.round).debtDefer) && !this.deferredThisRun;
  }

  /**
   * Улучшение №10 «Отсрочка»: раз за забег долг платится на раунд позже. Фишки не платятся, спасения нет —
   * неуплаченный долг запоминается в debtCarry, и магазин прибавит его к долгу следующего раунда
   * (ShopScene.applyShopDebt). Сообщение — на экране автомата, как заставка спасения; потом магазин.
   * Идёт до спасения: это не прощение, а перенос, и второй раз за забег не выдаётся.
   */
  private deferDebt(): void {
    this.deferredThisRun = true; // флаг липкий: откат кассетой его не снимает (SaveScene)
    this.debtCarry = this.debt;
    this.sfx.play('warning');
    this.collector.showScreenSequence([t('debtDeferred')], () => {
      if (this.isGameOver) return;
      this.openShop(); // новый раунд: долг = следующий по кривой + отложенный
    });
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
        // Улучшение №13 (шаг 28): +5 п.п. к «Процентам» — доля приходит из upgradeEffects, не из сцены.
        // Сделка №19: свои проценты работают и без амулета «Проценты» — это её собственный процент на остаток.
        const pactInterest = Math.floor(this.balance * pactEffects(this.pacts, this.round).interestBonus);
        const interest = interestCoins(this.balance, this.amuletIds(), this.upgradeEffects.interestBonus) + pactInterest;
        if (interest > 0) {
          this.earn(interest); // проценты — доход забега (не штраф): они тоже идут в цель 1 000 000
          this.amuletRack.trigger('interest');
          this.effects.popupAt(DISPLAY.x, DISPLAY.y + 50, `+${interest}`, GREEN_TEXT); // проценты капают на табло
        }
        // Билет за долг: обычный плюс №17 (28б) — прибавка только за долг, закрытый ровно в третьем раунде.
        const earned = TICKETS_PER_DEBT + roundDebtTickets(this.round, this.upgradeEffects.debtTicketBonus);
        // Билет начисляется, когда последний билет долетел до табло: до этого на нём ещё старое число.
        this.panel.flyTickets(earned, x, y, () => {
          this.tickets += earned;
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
   * Сначала на экране автомата короткая заставка тремя сообщениями (шаг 32); пока она идёт, ввод закрыт.
   * Первую прокрутку делает игрок рычагом: так он сам решает, когда начать. Дальше после каждой прокрутки —
   * один клик по столбцу (заморозить или разморозить), крутятся только незамороженные.
   */
  private startRescue(): void {
    this.isRescue = true;
    this.rescueUsedThisRun = true; // спасение одно за забег: вторую яму не прощают (флаг липкий, откат его не снимает)
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
    this.enterRescueMood();
    this.refreshHud();
    this.sfx.play('warning', 0.5);
    // Заставка на экране автомата: в первую яму сессии — «ВНИМАНИЕ!» → «АКТИВИРОВАН ПОСЛЕДНИЙ ШАНС» →
    // «СОБЕРИ ЛЮБОЙ ПАТТЕРН ЧТОБЫ ВЫЖИТЬ», дальше — только «ПОСЛЕДНИЙ ШАНС» (DONTLIKE п.6).
    this.rescueIntroFull = !lastChanceIntroSeen;
    lastChanceIntroSeen = true;
    this.isRescueIntro = true;
    this.rescueHintLive = false;
    this.collector.showScreenSequence(this.rescueIntroLines(), () => {
      this.isRescueIntro = false; // заставка погасла: рычаг снова слушается
    });
  }

  /** Строки заставки спасения на текущем языке: их же заново показывает смена языка (шаг 35). */
  private rescueIntroLines(): string[] {
    if (!this.rescueIntroFull) return [t('rescueLastChanceShort')];
    return [t('rescueAlert1'), t('rescueAlert2'), t('rescueAlert3')];
  }

  /**
   * Сменили язык (L или RU/EN), пока на экране автомата идёт заставка спасения или на стекле висит подсказка:
   * перерисовываем их на новом языке с того же места (шаг 35). Ничего не висит — ничего не трогаем.
   */
  protected relabelRescueTexts(): void {
    if (this.isRescueIntro) this.collector.relabelScreenSequence(this.rescueIntroLines());
    if (this.rescueHintLive) this.showRescueHint();
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
      if (this.isRescueIntro) return; // на экране автомата идёт заставка: ввод закрыт
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
    this.screen.endPick();
    this.screen.clearHighlights();
    this.isSpinning = true;
    this.rescueHintLive = false; // прошлая подсказка снята прокруткой
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
   * один клик по столбцу морозит или размораживает его. Подсказка на стекле — со счётчиком оставшихся прокруток.
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
    this.showRescueHint(); // «ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ N» (или «ПОСЛЕДНЯЯ ПРОКРУТКА»)
    this.screen.beginPick('column', (_row, col) => this.onRescuePick(col));
  }

  /**
   * Подсказка на стекле паттернов — вместо старой полосы (шаг 32). Счётчик оставшихся прокруток живёт только внутри
   * сообщения: можно морозить — «ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ N», заморозка в этом ходу уже была — «КРУТИ РЫЧАГ ·
   * ОСТАЛОСЬ N», а когда останется одна прокрутка — «ПОСЛЕДНЯЯ ПРОКРУТКА». Паттерн уже собран — молчим: победа
   * показывает своё «ПАТТЕРН СОБРАН».
   */
  private showRescueHint(): void {
    if (!this.isRescue || this.isRescueWinPending) return;
    const text = this.rescueHintText();
    this.screen.announceSequence([{ text }]);
    this.rescueHintLive = true; // висит на стекле: смена языка перерисует его этим же методом (шаг 35)
  }

  /** Текст подсказки спасения по остатку прокруток и заморозке этого хода. */
  private rescueHintText(): string {
    if (this.rescueSpinsLeft <= 1) return t('rescueLastSpin'); // осталась одна — это и есть последняя прокрутка
    return t(this.rescueFreezeUsed ? 'rescuePullHint' : 'rescueFreezeHint', this.rescueSpinsLeft);
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
    this.showRescueHint(); // заморозка потрачена — «КРУТИ РЫЧАГ · ОСТАЛОСЬ N»
    this.sfx.play('rust');
    this.refreshHud();
  }

  /**
   * Паттерн собран: выжил. За выживание не дают ни фишек, ни билетов (чемодана и ящика в спасении нет вовсе),
   * баланс не трогается. Долг остаётся РОВНО тем же числом, что был до ямы: счёт отступает на WON_RESCUE_ROUND_STEP,
   * а магазин возвращает тот же номер раунда и не пересчитывает долг (openShop(true, replayRound)) — иначе разовые
   * сделки потекли бы («−10%» сейчас, «+8%» сейчас). Сроки сделок не сдвигаются: номер раунда в итоге тот же, и
   * сделка на 1 раунд должна действовать в переигранном раунде, а не исчезнуть. Поэтому магазину отдаём исходный
   * номер: по нему он проверяет «магазин закрыт», иначе искал бы сделку на раунд раньше. Назад пути нет.
   */
  private winRescue(): void {
    this.isRescueWinPending = true;
    this.rescueHintLive = false;
    this.screen.endPick();
    this.screen.announceSequence([{ text: t('rescueSurvived') }]); // «ПАТТЕРН СОБРАН» на стекле
    this.sfx.play('bigWin');
    this.time.delayedCall(RESCUE_WIN_PAUSE, () => {
      if (!this.isRescue || !this.isRescueWinPending) return;
      this.isRescueWinPending = false;
      // Сообщение на стекле оставляем: пусть висит, пока гаснет красное и встаёт магазин (closeRescue(true)).
      this.closeRescue(true);
      this.sfx.play('payment');
      // Откат счёта на один, а магазин встанет перед исходным раундом: номер и долг — как были.
      const replayRound = this.round;
      this.round = Math.max(0, this.round - WON_RESCUE_ROUND_STEP);
      // Магазин открывается только после того, как красное свечение погасло (RESCUE_FADE_TIME, шаг 32).
      this.time.delayedCall(RESCUE_FADE_TIME, () => {
        if (this.isGameOver || this.isShopOpen) return;
        this.openShop(true, replayRound);
      });
    });
  }

  /**
   * Провал: паттерна нет. Прощения нет — сразу KABOOM (решение автора 22.11.2026, шаг 34: «если я проиграл —
   * проиграл, ВСЁ»): счёт раунда не двигается, магазин не открывается.
   */
  private failRescue(): void {
    this.closeRescue();
    this.kaboom();
  }

  /**
   * Спасение кончилось любой дорогой: убрать сетку выбора, мороз и красный режим, снять isRescue.
   * keepNews — сообщение на стекле («ПАТТЕРН СОБРАН») остаётся: магазин встанет, пока оно ещё видно.
   */
  private closeRescue(keepNews = false): void {
    this.screen.endPick();
    this.screen.showFrozen([]);
    this.collector.clearScreenSequence(); // недоигранная заставка спасения гаснет вместе с раундом
    this.collector.clearGoodLuck(); // GOOD LUCK с экрана уходит и после провала
    this.frozenColumns.clear();
    this.rescueGrid = null;
    this.rescueSpinsLeft = 0;
    this.rescueFreezeUsed = false;
    this.isRescueIntro = false;
    this.isRescueWinPending = false;
    this.rescueHintLive = false;
    this.isRescue = false;
    this.isSpinning = false;
    this.pot = 0;
    this.exitRescueMood();
    if (!keepNews) this.screen.clearNews();
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
    this.bankRunAmulets(); // победа тоже конец забега: его амулеты — в выбор памяти на старте следующего (шаг 38)
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

  // ---------- Улучшения после смерти (шаг 28) ----------

  /**
   * После смерти (и только после неё — ни после победы, ни после «ДАЛЬШЕ»): три улучшения из пула, одно бесплатно.
   * Что можно взять, считает upgrades.upgradeOffers по купленному в прогрессe. Куплено всё — списка нет.
   * Список идёт на экране автомата (шаг 37): строки названия и описания, справа «ВЗЯТЬ»;
   * он лежит выше экрана смерти, поэтому «ЗАНОВО» под ним не нажать. Режим разработчика — как у ачивок
   * (BaseScene.unlockAchievement): улучшения не выдаются и не пишутся, и списка нет вовсе. devUsedThisRun — липкий
   * след «забег трогали в ТЕСТ»: он тоже закрывает список, даже если режим к моменту смерти уже выключили,
   * иначе улучшения фармились бы тестовыми фишками.
   */
  private showUpgradeChoice(): void {
    if (isDevMode() || this.devUsedThisRun) return; // в «ТЕСТ» улучшений не даём: ни бесплатного, ни второго за билеты
    const offers = upgradeOffers(this.upgrades);
    if (offers.length === 0) return; // предлагать нечего: список улучшений просто не показывается
    this.upgradeOfferList = offers;
    this.upgradeSecondPhase = false;
    this.upgradeScreen.show(offers.map((upgrade) => this.upgradeRow(upgrade)), {
      title: t('upgTitle'),
      caption: t('upgFreeHint'),
      onPick: (index) => this.pickUpgrade(index),
    });
  }

  /** Строка улучшения на экране автомата: название, описание и текстовая кнопка справа. */
  private upgradeRow(upgrade: Upgrade, right = t('upgTake')): { title: string; desc: string; right: string } {
    return { title: t(upgrade.name), desc: t(upgrade.desc), right };
  }

  /**
   * Выбор карточки. Первая — бесплатная (пишется в прогресс сразу и действует со следующего забега).
   * Осталось что брать и билетов хватает — экран остаётся во второй фазе: второе улучшение за UPGRADE_SECOND_PRICE
   * билетов из остатка погибшего забега. Билетов нет — экран закрывается, дальше обычное «ЗАНОВО».
   * В «ТЕСТ» и после тестового забега не выдаётся ничего — ни бесплатное, ни второе за 6 билетов (ни билеты не списываются).
   */
  private pickUpgrade(index: number): void {
    const upgrade = this.upgradeOfferList[index];
    if (!upgrade) return;
    if (isDevMode() || this.devUsedThisRun) {
      this.closeUpgrades(); // заслон на случай, если экран уже открыт: без выдачи и без списания билетов
      return;
    }
    if (!this.upgradeSecondPhase) {
      grantUpgrade(upgrade.id);
      this.sfx.play('buy');
      const rest = this.upgradeOfferList.filter((_, place) => place !== index);
      this.upgradeOfferList = rest;
      this.upgradeSecondPhase = true;
      if (rest.length === 0 || this.tickets < UPGRADE_SECOND_PRICE) {
        this.closeUpgrades(); // второе брать не из чего или не на что — сразу к «ЗАНОВО»
        return;
      }
      this.upgradeScreen.show(rest.map((upgrade) => this.upgradeRow(upgrade, t('actionTickets', UPGRADE_SECOND_PRICE))), {
        title: t('upgTitle'),
        caption: t('upgSecondHint', UPGRADE_SECOND_PRICE, this.tickets),
        onPick: (place) => this.pickUpgrade(place),
        onClose: () => this.closeUpgrades(), // второе — по желанию: список закрывают ✕ или «0»
      });
      this.refreshHud();
      return;
    }
    // Вторая фаза: билеты списываются здесь же — из остатка погибшего забега (отдельного кошелька нет).
    if (this.tickets < UPGRADE_SECOND_PRICE) {
      this.sfx.play('deny');
      return;
    }
    this.tickets -= UPGRADE_SECOND_PRICE;
    grantUpgrade(upgrade.id);
    this.sfx.play('payment');
    this.refreshHud();
    this.closeUpgrades();
  }

  /**
   * Экран улучшений закрыт: дальше — обычное «ЗАНОВО» экрана смерти. Память амулетов больше не витрина после
   * смерти (шаг 38, DONTLIKE п.2): она выбирается на старте следующего забега, бесплатно.
   */
  private closeUpgrades(): void {
    this.upgradeScreen.close();
    this.upgradeOfferList = [];
    this.upgradeSecondPhase = false;
  }

  /** Конец забега: на экране автомата KABOOM, потом автомат взрывается, всё темнеет, и на нём — KABOOM, счёт, «ЗАНОВО». */
  protected kaboom(): void {
    this.isGameOver = true;
    this.bankRunAmulets(); // забег кончился: его амулеты ждут выбора памяти на старте следующего (шаг 38)
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
          // После смерти — три улучшения (шаг 28). Память амулетов сюда больше не входит (шаг 38): она ждёт старта забега.
          this.showUpgradeChoice();
          this.time.delayedCall(RESTART_SPACE_DELAY, () => {
            this.canRestartWithSpace = true;
          });
        });
      });
    });
  }
}
