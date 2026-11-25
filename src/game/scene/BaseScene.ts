import Phaser from 'phaser';
import { achievementById, earnedAchievements, type AchievementId, type AchievementState } from '../achievements';
import { amuletIdsFrom, AMULETS, addCopy, multiplierStep, START_SOCKETS, type Amulet, type AmuletCounts, type AmuletId } from '../amulets';
import { resetCodex } from '../codex';
import { isDevMode } from '../devmode';
import type { Pact } from '../dealerGame';
import { CHIP_GOAL } from '../gameConfig';
import { garlicOn, noEffects, START_SLOTS, type Item, type ItemEffects, type ShopItem } from '../items';
import { formatChips, t } from '../lang';
import { newAttemptId, track } from '../metrics';
import { PHASES, type Phase } from '../phases';
import type { MachineId } from '../machines';
import type { Pattern } from '../patterns';
import { beginRun, grantAchievement, hasPattern, isActionsUnlocked, markDarknessDone, markPatternOpen, markTutorialDone, nextRunMemory, openedPatterns, purchasedUpgrades, runNumber } from '../progress';
import { debtShortfall, multiplierForStreak, SPINS_PER_ROUND, startDebt } from '../rules';
import { skullShareOf, type WeightContext } from '../skullShare';
import type { RunSave, TapeState } from '../save';
import { Sound } from '../sound';
import { LAMP_ANGRY, LAMP_BLOOD, LAMP_GARLIC, LAMP_GOLD, LAMP_LUCK } from '../theme';
import { forgivesDebt, neutralUpgrades, symbolWeightBonus, upgradeEffects, type PurchasedUpgrades, type UpgradeEffects } from '../upgrades';
import type { AmuletCase } from '../parts/amuletCase';
import type { AmuletRack } from '../parts/amuletRack';
import type { Atmosphere } from '../parts/atmosphere';
import type { BrokenScreen } from '../parts/brokenScreen';
import type { Cassette } from '../parts/cassette';
import type { Collector } from '../parts/collector';
import type { DealerTable } from '../parts/dealerTable';
import type { Drum } from '../parts/drum';
import type { Effects } from '../parts/effects';
import type { AchievementWindow } from '../parts/achievementWindow';
import type { ActionBoard } from '../parts/actionBoard';
import type { ItemShelf } from '../parts/itemShelf';
import type { MachineBadge } from '../parts/machineBadge';
import type { MiniShop } from '../parts/miniShop';
import type { MachinePanel } from '../parts/panel';
import type { PayoutWindow } from '../parts/payoutWindow';
import type { Reveal } from '../parts/reveal';
import type { Shop } from '../parts/shop';
import type { SlotScreen } from '../parts/slotScreen';
import type { WallScreen } from '../parts/wallScreen';
import type { Tooltip } from '../parts/tooltip';
import type { ScreenList } from '../parts/screenList';

const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage
const CHIP_RECORD_KEY = 'dolgovaya-yama-chip-record'; // ключ рекорда набранных за забег фишек (отметка CHIP_RECORD)
const ANGRY_TENSION = 0.25; // фаза 2: столько тревоги добавляется — сердце в музыке бьётся чаще
// Записка светится (долг можно отдать раньше) только на последних прокрутках: если она горит сразу, её нажимают
// и не докручивают раунд себе в плюс (практика 3). Отдать раньше (D или клик) можно и до этого.
const PAY_EARLY_GLOW_SPINS = 3;
// Пороги по пути к цели: на них на стекле новость «НАБРАНО N» (1 000 000 — уже победа, не новость).
const CHIP_MILESTONES = [100_000, 500_000];
// Сколько ждать очередь новостей, прежде чем считать её снятой: строка держится GLASS_NEWS_TIME (2,6 с) и тает 0,4 с.
const NEWS_QUEUE_GUARD_MS = 3400;

/** Рекорд из localStorage. Если хранилище недоступно — 0, игра работает и так. */
function loadRecord(): number {
  try {
    const saved = Number(localStorage.getItem(RECORD_KEY));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

/**
 * Сохранить рекорд в localStorage. Не получилось — не страшно.
 * Пишем большее из двух: рекорд, уже записанный другой вкладкой, этим забегом не понижается.
 */
function saveRecord(record: number): void {
  try {
    const stored = Number(localStorage.getItem(RECORD_KEY));
    localStorage.setItem(RECORD_KEY, String(Number.isFinite(stored) ? Math.max(stored, record) : record));
  } catch {
    // хранилище недоступно (например, запрещено настройками браузера) — играем без сохранения
  }
}

/** Рекорд набранных фишек из localStorage. Если хранилище недоступно — 0, игра работает и так. */
function loadChipRecord(): number {
  try {
    const saved = Number(localStorage.getItem(CHIP_RECORD_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

/**
 * Сохранить рекорд набранных фишек. Не получилось — не страшно: экран победы покажет рекорд этого забега.
 * Большее из двух, как у рекорда долгов: вкладка со старым снимком не понижает чужой рекорд.
 */
function saveChipRecord(record: number): void {
  try {
    const stored = Number(localStorage.getItem(CHIP_RECORD_KEY));
    localStorage.setItem(CHIP_RECORD_KEY, String(Number.isFinite(stored) ? Math.max(stored, record) : record));
  } catch {
    // хранилище недоступно — играем без сохранения
  }
}

/**
 * Сцена игры собрана слоями — каждый слой в своём файле добавляет свою часть игры:
 * BaseScene (состояние забега и табло) → PhaseScene (фазы) → BonusScene (короны, клевер, джекпот) →
 * MachineScene (автомат: ржавчина, смена в начале раунда) → TutorialScene (обучение текстами первого забега) →
 * RoundScene (прокрутка, кон, предметы) → DealerScene (сделки Дилера) →
 * ShopScene (магазин) → SaveScene (кассета: записать забег и откатиться) → CollectorScene (расплата и спасение) →
 * GameScene (создаёт части и разбирает клавиши).
 *
 * Этот слой — состояние забега в простых полях и части автомата (их создаёт GameScene).
 * Правила — в rules.ts, patterns.ts, items.ts, amulets.ts, lastChance.ts и characters.ts,
 * картинки и анимации — в частях из parts/: сцена говорит им, что показать.
 */
export abstract class BaseScene extends Phaser.Scene {
  // Состояние игры. Начальные значения ставит resetState(), потому что
  // при scene.restart() поля класса сами не сбрасываются.
  protected round = 0; // номер раунда: какой по счёту долг закрываем
  protected debt = 0; // долг этого раунда
  protected debtNextMul = 1; // сделка №12: следующий долг дороже во столько раз (сразу сбрасывается в 1)
  protected balance = 0; // фишки на табло — твои; из них в конце раунда отдаётся долг
  protected earned = 0; // сколько игра отдала за забег (все приходы на табло): оборот и рекорд; цель же — по balance
  protected chipGoal = CHIP_GOAL; // порог, к которому идёт забег: 1 000 000, а после «ДАЛЬШЕ» — 10 000 000 (CHIP_RECORD)
  protected chipRecord = 0; // лучший earned на конец забега (localStorage): экран победы и рекорда
  protected tickets = 0; // билеты 🎟 на табло — на амулеты и гнёзда
  protected spinsLeft = 0; // сколько прокруток осталось в раунде
  protected pot = 0; // кон: выиграно, но ещё не забрано — паттерн из черепов сжигает его
  protected streak = 0; // серия: +1 за прокрутку без паттерна из черепов; черепа оставляют от неё треть (streakAfterSkull), «забрать» уменьшает
  protected record = 0; // рекорд: больше всего закрытых долгов за одну игру
  protected slots = 0; // сколько мест на полке открыто (старт — START_SLOTS, остальные покупаются за фишки)
  protected shelf: (Item | null)[] = []; // что лежит на полке, по месту на клетку; null — пусто
  protected itemEffects: ItemEffects = noEffects(); // какие предметы сейчас включены
  protected offer: (ShopItem | null)[] = []; // что лежит в торговом автомате; купленное — null
  protected sockets = 0; // сколько гнёзд для амулетов открыто
  protected amulets: Amulet[] = []; // амулеты в гнёздах, по порядку гнёзд (каждый — уникальный, дубли — счётчиком ниже)
  protected amuletCounts: AmuletCounts = {}; // сколько копий каждого амулета (шаг 62б: копии не занимают гнёзда)
  protected amuletOffer: (Amulet | null)[] = []; // что лежит в витрине амулетов; купленное — null
  protected miniCaseOffer: (Amulet | null)[] = []; // что лежит в мини-чемодане за фишки (DONTLIKE п.7); купленное — null
  protected drumSpins = 0; // сколько раз крутил барабан в этом магазине — каждая следующая прокрутка дороже
  protected ticketsBought = 0; // сколько билетов куплено за фишки за забег — с каждым следующий билет дороже (шаг 13)
  protected bones = 0; // сколько паттернов из черепов выпало за забег — для коллекционера костей
  protected roundShields = 0; // сколько ещё черепов в этом раунде отобьёт бронежилет
  // Какой из трёх автоматов стоит сейчас: игрок его не выбирает — в начале раунда он может смениться сам.
  // Сбрасывается только новым забегом (resetState — KABOOM и «заново»).
  protected machineId: MachineId = 'classic';

  protected newsRound = 0; // в каком раунде уже показали новость о новом символе — второй раз не показываем
  protected isDebtNewsShown = false; // в этом раунде уже показали «НА ДОЛГ ХВАТАЕТ» — второй раз не показываем
  protected diceDrought = 0; // сколько прокруток подряд не было кубика — его шанс растёт («подстраховка»)
  protected isBloodNext = false; // на экране была кровь: следующая прокрутка кровавая
  protected luckyClovers = 0; // сколько клеверов висит на сетке: следующая прокрутка — с паттерном, и чем их больше, тем сильнее
  protected freeSpins = 0; // сколько бесплатных прокруток за короны ещё впереди — они крутятся сами
  protected freeSpinsAwarded = 0; // сколько бесплатных прокруток выдали за раунд — технический предохранитель FREE_SPINS_GUARD, игроку не виден
  protected devUsedThisRun = false; // забег трогали во вкладке «ТЕСТ» (devmode): рекорд фишек и ачивки из него не пишем
  protected rescueUsedThisRun = false; // спасение уже было в этом забеге: второе не прощают (липкий, откат не снимает)
  // Улучшения после смерти (шаг 28): что куплено и что из этого получается. Читаются один раз в resetState —
  // купленное на экране смерти действует со СЛЕДУЮЩЕГО забега. Все правила улучшений — только через upgradeEffects.
  protected upgrades: PurchasedUpgrades = {};
  protected upgradeEffects: UpgradeEffects = neutralUpgrades();
  protected runsPlayed = 0; // номер этого забега: улучшение №8 прощает первый долг каждый пятый
  /** Сцена перезапущена откатом кассетой (data.tape): тот же забег, номер не растёт. Ставит GameScene.create до resetState. */
  protected isTapeRestart = false;
  protected deferredThisRun = false; // улучшение №10: отсрочка в этом забеге уже была (липкая, как rescueUsed)
  protected pactAmuletBurns = false; // сделка №34: следующий купленный амулет сгорит сразу
  protected miniCaseBought = 0; // мини-чемодан за фишки: сколько амулетов уже взято за забег (до MINI_CASE_PURCHASES)
  protected miniCaseShopRound = 0; // номер магазина (раунда), где взяли последний амулет за фишки; 0 — не брали
  protected freeGiftGiven = false; // улучшение №40 (28в): подарок первого магазина уже выдан
  protected startSymbolId: string | null = null; // улучшение №33 (28в): выбранный первый символ забега
  protected startGridGiven = false; // первая сетка забега уже получила джокера (№32) и выбранный символ (№33)
  protected isChoosingSymbol = false; // висит выбор первого символа (№33): игра ждёт, крутить нельзя
  protected isChoosingMachine = false; // висит выбор стартового автомата (№49, 28г): игра ждёт, крутить нельзя
  protected isChoosingAmulet = false; // висит выбор амулета из прошлого забега (шаг 38): игра ждёт, крутить нельзя
  protected startAmulets: AmuletId[] = []; // амулеты прошлого забега, из которых выбирают память (шаг 38)
  protected startAmuletPicks = 0; // сколько из них ещё можно взять: закончилось — список закрывается
  protected isDebtForgiven = false; // №8: первый долг этого забега прощён — на стекле новость, платить нечего
  protected skullCancelUsedThisRun = false; // №50 (28г): отмена черепа в этом забеге уже была (липкая, как rescueUsed)
  protected ticketsSpentOnTape = 0; // №45 (28г): сколько билетов потрачено после записи на кассету — их вернёт откат
  protected debtCarry = 0; // улучшение №10: неуплаченный долг, который прибавится к следующему (ShopScene.applyShopDebt)
  protected cigarettesThisRound = 0; // сколько сигарет включили в этом раунде — для «Курильщика»
  private achievementQueue: AchievementId[] = []; // ачивки, которые ещё не показали: выпало несколько — идут по очереди
  private achievementShown: AchievementId | null = null; // какая ачивка сейчас на экране (её тоже нельзя потерять при рестарте)
  private isAchievementShown = false; // окно ачивки занято: следующая ждёт своей очереди
  // Новости, которым сейчас нельзя появиться на стекле (магазин открыт, идёт реплика Дилера, концовка):
  // копятся здесь и выходят по одной после pumpPopups (DONTLIKE, 25.11 — ничего поверх панели магазина).
  private pendingNews: string[] = [];
  private isNewsPlaying = false; // очередь новостей уже идёт: следующая встанет после её конца
  private newsGuard: Phaser.Time.TimerEvent | null = null; // страховка: новость сняли извне — очередь всё равно поедет дальше
  protected isEndScreenOpen = false; // экран конца забега (победа, рекорд, смерть) на экране: окно ачивки ждёт, пока его закроют
  private isDevNoticeShown = false; // новость «ТЕСТ: ачивки не пишутся» уже была в этом забеге: второй раз не спамим
  private isDevNoticePending = false; // её отложили (магазин, планшет, пауза, концовка): на стекле сейчас не видно
  protected isFreeSpinNow = false; // идёт бесплатная прокрутка за короны: черепов в ней нет, «50 на 50» за неё не даём
  protected phase: Phase = PHASES[0]; // какая фаза сейчас (phases.ts) — по числу закрытых долгов
  protected tapeState: TapeState = 'forSale'; // кассета: продаётся, чистая (в REC) или записана (в PLAY)
  protected tapesBought = 0; // сколько кассет куплено за забег — от этого цена; откат этого числа не откатывает
  protected tapeRecord: RunSave | null = null; // что записано на кассету: забег в начале раунда
  protected patternSet: string[] = []; // какие паттерны открыты в этом забеге: только их схемы видно на стекле
  protected isSpinning = false; // сетка крутится — ввод игнорируется
  protected isRerolling = false; // обязательное решение по перемешке и подмене висит: сетку не посчитали, ввод заперт
  protected isRoundOver = false; // прокрутки кончились — расплата и магазин, крутить и забирать нельзя
  protected isShopping = false; // панель магазина опущена — можно покупать (пока крутится барабан — нельзя)
  protected isShopOpen = false; // панель магазина вообще на экране (и когда покупки закрыты: крутится барабан)
  protected isVictoryPending = false; // цель взята, но победа ждёт конца текущего действия (CollectorScene.checkChipGoal)
  protected isAwaitingPayment = false; // банкомат выехал и фишек хватает — ждём «отдать» (клик по банкомату или Enter)
  protected isDealing = false; // идёт стол Дилера со сделками — крутить и забирать нельзя
  protected isRescue = false; // фишек не хватило: красный раунд спасения, 5 прокруток и заморозка столбцов (CollectorScene)
  protected insuranceSaves = 0; // сколько раз страховка уже спасла кон в этом раунде: копий две — сработок две
  protected pacts: Pact[] = []; // сделки Дилера (dealerGame.Pact): что из них действует в раунде, решает pactEffects
  protected isGameOver = false; // долг не отдан — DEATH, конец забега
  protected isRewinding = false; // кассету вставили — плёнка перематывается, потом сцена перезапустится с записью
  protected isPaused = false; // пауза (Esc, P, ⏸): анимации, таймеры и звук стоят
  protected isAtMonitor = false; // большой экран на стене открыт — крутить и забирать нельзя
  protected isActionsOpen = false; // панель действий вне прокрутки (шаг 29) открыта — крутить и забирать нельзя
  protected canRestartWithSpace = false; // Пробел на экране DEATH срабатывает не сразу

  // ---------- Метрики (metrics.ts) ----------
  // Поля класса при scene.restart не сбрасываются, поэтому id попытки и время старта переживают откат кассетой
  // (тот же забег). Новый забег ставит их заново — GameScene.create зовёт startMetricsRun.
  protected attemptId = ''; // id текущей попытки: по нему связываются события одного забега
  protected runStartedAt = 0; // когда начался забег (Date.now): от него считается seconds в событиях
  protected runSource: 'new' | 'after_death' = 'new'; // первый забег игрока или уже после смерти
  private isFirstSpinTracked = false; // game_start уже отправлен в этом забеге
  private isPhase2Tracked = false; // phase_2_reached уже отправлен в этом забеге

  // Звук создаётся один раз вместе со сценой и живёт весь сеанс: при scene.restart() он тот же (аудиоконтекстов в браузере мало).
  protected readonly sfx = new Sound();

  // Части автомата и комнаты. GameScene создаёт их заново в каждом create(), поэтому картинки и анимации всегда свежие.
  protected screen!: SlotScreen; // экран 5×3, стекло с паттернами, бегущие огни
  protected panel!: MachinePanel; // табло, окошко множителя, лампочки прокруток, рычаг
  protected payout!: PayoutWindow; // окошко выплаты: электронное табло с коном и кнопкой «забрать»
  protected collector!: Collector; // записка с долгом, банкомат и экран DEATH
  protected itemShelf!: ItemShelf; // полка с предметами и включённые предметы у экрана
  protected amuletRack!: AmuletRack; // гнёзда с амулетами на верхушке корпуса
  protected shop!: Shop; // панель магазина: жалюзи с торговым автоматом, витриной амулетов, барабаном и кассетой
  protected miniShop!: MiniShop; // маленький автомат на панели: место на полке за фишки и гнездо за билеты
  protected cassette!: Cassette; // кассета в магазине и видеомагнитофон у монитора
  protected amuletCase!: AmuletCase; // чемодан с амулетами над торговым автоматом
  protected miniCase!: AmuletCase; // мини-чемодан за фишки слева от него (DONTLIKE п.7): два амулета
  protected drum!: Drum; // «барабан» в магазине: колесо с призами за фишки
  protected brokenScreen!: BrokenScreen; // дыра и трещины на экране автомата после взрыва (KABOOM)
  protected machineBadge!: MachineBadge; // автомат: цвет корпуса и значок
  protected dealerTable!: DealerTable; // стол Дилера поверх экрана
  protected atmosphere!: Atmosphere; // пыль, полосы на экране, мигание света, тёмные края от тревоги
  protected tooltip!: Tooltip; // подсказка при наведении мыши
  protected monitor!: WallScreen; // экран на стене справа: символы, паттерны, как играть
  protected effects!: Effects; // брызги фишек, всплывающие надписи, вспышка с тряской
  protected achievements!: AchievementWindow; // окно полученной ачивки по центру сетки
  protected upgradeScreen!: ScreenList; // улучшения после смерти (шаг 28): список на экране автомата (шаг 37)
  protected actionBoard!: ActionBoard; // табличка «ДЕЙСТВИЯ» на стене: вход в панель действий (шаг 29)
  protected reveal: Reveal | null = null; // тьма первого забега; null — обучение пройдено или его нет

  /** Начало забега: первый долг, пустое табло, START_SLOTS мест на полке, ничего не включено, автомат обычный. */
  protected resetState(): void {
    // Улучшения (шаг 28): что куплено в прошлых забегах, читаем здесь — раньше долга и всего остального.
    this.upgrades = purchasedUpgrades();
    this.upgradeEffects = upgradeEffects(this.upgrades);
    this.runsPlayed = this.isTapeRestart ? runNumber() : beginRun(); // откат кассетой — тот же забег, номер не двигаем (№8)
    this.deferredThisRun = false; // №10: отсрочка снова доступна
    this.pactAmuletBurns = false; // сделка №34: в новом забеге «следующий амулет сгорит» ещё не назначен
    this.miniCaseBought = 0; // мини-чемодан: в новом забеге снова два амулета за фишки
    this.miniCaseShopRound = 0; // и покупок за фишки ещё не было ни в каком магазине
    this.freeGiftGiven = false; // №40: подарок первого магазина ещё не выдан
    this.startSymbolId = null; // №33: выбираем символ заново в каждом новом забеге
    this.startGridGiven = false; // первая сетка ещё не получила джокера и выбранный символ
    this.isChoosingSymbol = false;
    this.isChoosingMachine = false; // №49: выбор автомата в новом забеге ещё впереди
    this.isChoosingAmulet = false; // шаг 38: выбор амулета из прошлого забега в новом забеге ещё впереди
    this.startAmulets = [];
    this.startAmuletPicks = 0;
    this.skullCancelUsedThisRun = false; // №50: отмена черепа в новом забеге снова доступна
    this.ticketsSpentOnTape = 0; // №45: на плёнке пока ничего не потрачено
    this.debtCarry = 0; // неплатежа с прошлого забега нет
    this.round = 1;
    // №8: каждый пятый забег — первый долг 0. Флаг isDebtForgiven нужен стеклу: новость «ДОЛГ ПРОЩЁН» (шаг 38).
    this.isDebtForgiven = forgivesDebt(this.upgradeEffects.debtForgiveEveryRuns, this.runsPlayed);
    this.debt = this.isDebtForgiven ? 0 : startDebt(this.upgradeEffects.startDebtMul);
    this.debtNextMul = 1; // «следующий долг +20%» — только из сделки, в новом забеге его нет
    this.balance = 0;
    this.earned = 0;
    this.chipGoal = CHIP_GOAL; // новый забег снова идёт к миллиону; 10 000 000 — только после «ДАЛЬШЕ»
    this.chipRecord = loadChipRecord();
    this.devUsedThisRun = false; // новый забег чистый: что было накручено в прошлом, к рекорду не относится
    this.rescueUsedThisRun = false; // и спасение в новом забеге ещё не тратили
    this.cigarettesThisRound = 0;
    // Очередь показа очищается вместе со сценой, но не теряется: недопоказанное create забирает из данных restart.
    this.achievementQueue = [];
    this.achievementShown = null;
    this.isAchievementShown = false;
    this.pendingNews = [];
    this.isNewsPlaying = false;
    this.newsGuard?.remove(false);
    this.newsGuard = null;
    this.isEndScreenOpen = false;
    this.isDevNoticeShown = false; // новый забег: про запрет ачивок в ТЕСТ скажем снова, если он всё ещё включён
    this.isDevNoticePending = false;
    this.tickets = this.upgradeEffects.startTickets; // №16 (28б): старт с билетом
    // Первый раунд забега разыгрывается сразу, без startRound (он зовётся только к следующему раунду), поэтому
    // улучшение №1 «+1 прокрутка в первом раунде» прибавляется здесь — иначе оно не работало бы никогда.
    this.spinsLeft = SPINS_PER_ROUND + this.upgradeEffects.firstRoundSpins;
    this.pot = 0;
    this.streak = 0;
    this.record = loadRecord();
    // Полка начинается с двух мест (START_SLOTS); третье–восьмое открываются покупкой в магазине за фишки.
    this.slots = START_SLOTS;
    this.shelf = new Array<Item | null>(this.slots).fill(null);
    this.itemEffects = noEffects();
    this.offer = [];
    this.sockets = START_SOCKETS; // гнёзда есть с первого раунда: открываются долгами, а не забегами
    this.amulets = [];
    this.amuletCounts = {};
    this.amuletOffer = [];
    this.miniCaseOffer = [];
    this.drumSpins = 0;
    this.ticketsBought = 0; // новый забег — билеты снова по 40% банка
    this.bones = 0;
    this.roundShields = 0;
    this.machineId = 'classic'; // новый забег — всегда с классического
    this.newsRound = 1;
    this.isDebtNewsShown = false;
    this.diceDrought = 0;
    this.isBloodNext = false;
    this.luckyClovers = 0;
    this.freeSpins = 0;
    this.freeSpinsAwarded = 0;
    this.phase = PHASES[0];
    this.tapeState = 'forSale';
    this.tapesBought = 0;
    this.tapeRecord = null;
    this.patternSet = [...openedPatterns()]; // открытое копится навсегда: «заново» и конец забега схемы не гасят
    this.isDealing = false;
    this.isRescue = false;
    this.insuranceSaves = 0;
    this.pacts = []; // новый забег — Дилер ещё ничего не предлагал
    this.isSpinning = false;
    this.isRerolling = false;
    this.isRoundOver = false;
    this.isShopping = false;
    this.isShopOpen = false;
    this.isAwaitingPayment = false;
    this.isGameOver = false;
    this.isVictoryPending = false;
    this.isRewinding = false;
    this.isPaused = false;
    this.isAtMonitor = false;
    this.isActionsOpen = false; // шаг 29: панель действий в новом забеге закрыта
    this.canRestartWithSpace = false;
  }

  // ---------- Метрики (metrics.ts) ----------

  /**
   * Новый забег в метриках: новый id попытки, время старта, откуда забег (первый или после смерти) и флаги событий.
   * Зовёт GameScene.create — только для нового забега: откат кассетой поле attemptId не трогает (тот же забег).
   */
  protected startMetricsRun(): void {
    this.attemptId = newAttemptId();
    this.runStartedAt = Date.now();
    this.runSource = this.runsPlayed > 1 ? 'after_death' : 'new';
    this.isFirstSpinTracked = false;
    this.isPhase2Tracked = false;
  }

  /** Событие Метрики с общим контекстом забега: id попытки (version добавляет metrics.track). */
  protected trackEvent(event: string, params: Record<string, string | number | boolean> = {}): void {
    track(event, { attempt: this.attemptId, ...params });
  }

  /** Сколько секунд идёт забег — для параметра seconds в событиях. */
  protected runSeconds(): number {
    return Math.max(0, Math.round((Date.now() - this.runStartedAt) / 1000));
  }

  /** Первая прокрутка забега: один раз за забег — game_start. Зовёт RoundScene.spin. */
  protected trackRunStart(): void {
    if (this.isFirstSpinTracked) return;
    this.isFirstSpinTracked = true;
    const upgrades = Object.values(this.upgrades).reduce<number>((sum, count) => sum + (count ?? 0), 0);
    this.trackEvent('game_start', { round: 1, upgrades, source: this.runSource });
  }

  /** Впервые в забеге началась фаза 2: один раз за забег — phase_2_reached. Зовёт PhaseScene.checkPhase. */
  protected trackPhase2(): void {
    if (this.isPhase2Tracked) return;
    this.isPhase2Tracked = true;
    this.trackEvent('phase_2_reached', { round: this.round, balance: this.balance, seconds: this.runSeconds() });
  }

  /**
   * Память амулетов (шаг 38): выбранный на старте забега амулет из прошлого забега встаёт в свободное гнездо.
   * Бесплатно и без продажи: амулет просто сохраняется. Вызывающий (GameScene.chooseStartAmulet) уже проверил,
   * что амулет есть в списке прошлого забега; здесь — только место в гнезде и отрисовка.
   */
  protected grantStartAmulet(id: AmuletId): boolean {
    const amulet = AMULETS.find((item) => item.id === id);
    if (!amulet || this.amulets.length >= this.sockets) return false; // чужое id или гнёзд нет — брать некуда
    if (this.amulets.some((owned) => owned.id === id)) return false; // такой амулет уже стоит
    this.amulets.push(amulet);
    addCopy(this.amuletCounts, id);
    this.amuletRack.setAmulets(this.amulets, this.amuletCounts);
    return true;
  }

  /** Что предлагать на старте забега: амулеты прошлого забега и сколько из них можно взять (шаг 38). */
  protected loadStartAmulets(): void {
    const memory = nextRunMemory();
    this.startAmulets = memory.amulets;
    this.startAmuletPicks = memory.picks;
  }

  /** Обновить табло, окошко множителя, лампочки прокруток, окошко выплаты и записку (светится ли) по текущему состоянию. */
  protected refreshHud(): void {
    this.panel.showBalance(this.balance);
    this.panel.showTickets(this.tickets);
    this.shop.showMoney(this.balance, this.tickets); // та же пара чисел — на табло панели магазина
    this.panel.showMultiplier(this.multiplier());
    this.panel.showSpinsLeft(this.spinsLeft);
    this.panel.showFreeSpins(this.freeSpins);
    this.collector.showGoal(this.balance, this.chipGoal); // цель забега — от фишек НА РУКАХ, не от оборота (решение автора 19.11)
    // В спасении цели в окошке нет: её показывает полоса спасения, а «забрать» там нечего.
    this.payout.showPot(this.pot, this.debt);
    this.payout.setEnabled(this.canAct());
    this.collector.showPayable(this.canPayEarly());
    this.collector.showProgress(this.debt, this.balance, this.pot);
    this.cassette.showUsable(this.canRecord() || this.canRewind());
    this.monitor.setEnabled(this.canAct() || this.isAtMonitor || this.isRerolling); // планшет — и во время обязательного выбора: он игру не двигает
    // До первой смерти на кнопке действий пустое стекло, после — надпись; гаснет она, когда действовать нельзя.
    // Пока открыт экран конца забега (смерть, улучшения, победа), надписи нет вовсе: «ДЕЙСТВИЯ» появляется после
    // выбора улучшения или в новом забеге (DONTLIKE: надпись не должна вставать раньше списка улучшений).
    const unlocked = isActionsUnlocked() && !this.isEndScreenOpen;
    this.actionBoard.setState(this.canUseActions(), unlocked); // пустой экран до смерти, надпись — после и вне концовки
    // Отложенная новость про ТЕСТ: как только стекло снова на виду (магазин уехал, планшет закрыт, пауза снята), её показываем.
    this.flushDevNotice();
    // Заодно выходят новости и ачивки, что ждали закрытого магазина или конца реплики Дилера.
    this.pumpPopups();
    const tension = this.tension();
    this.sfx.setTension(tension);
    this.atmosphere.setTension(tension);
    // Табло, серия и билеты — части условий ачивок («Я скорость», «Ваш билетик!», «Я пролью много крови»):
    // проверяем здесь, чтобы ловить их в любой момент, а не только после прокрутки.
    this.checkAchievements();
  }

  /**
   * Доход на табло. Через эту дверь идут ВСЕ приходы фишек за забег: забранный кон (payPot), возврат страховки
   * (burnPot), «Проценты» (payDebt) и барабан (winDrum). earned меряет, сколько игра отдала за забег: долг его
   * не уменьшает, а штрафы (кровавая прокрутка) сюда не идут — это не доход.
   * После прибавки — новость порога и проверка цели забега (её делает CollectorScene: там же смерть).
   * Рекорд здесь не пишется: chipRecord фиксируется по концу забега (победа, рекорд или KABOOM).
   */
  protected earn(amount: number): void {
    if (amount <= 0) return;
    const before = this.earned;
    this.balance += amount;
    this.earned += amount;
    this.announceChipMilestone(before);
    this.checkChipGoal();
  }

  /**
   * Потратить билеты внутри забега (амулет, гнездо, кассета). Одна дверь нужна улучшению №45 (28г): откат
   * возвращает то, что ушло ПОСЛЕ записи на кассету, поэтому трата сама себя считает. После смерти (витрина
   * памяти, второе улучшение) эта дверь не нужна: там откатывать уже нечего.
   */
  protected spendRunTickets(count: number): void {
    if (!(count > 0)) return;
    this.tickets -= count;
    if (this.tapeState === 'recorded') this.ticketsSpentOnTape += count; // №45: эту трату откат вернёт
  }

  /** Лучший earned на конец забега: больше прежнего — запоминаем в localStorage. Зовут концовки забега. */
  protected updateChipRecord(): void {    // Фишки, накрученные вкладкой «ТЕСТ», рекордом не считаются. Одной проверки isDevMode() мало: режим можно
    // выключить кнопкой «ВЫЙТИ» и доиграть забег, а накрученное останется на табло — поэтому помним, что забег трогали.
    if (isDevMode() || this.devUsedThisRun) return;
    if (this.earned <= this.chipRecord) return;
    this.chipRecord = this.earned;
    saveChipRecord(this.chipRecord);
  }

  /** Набранное перевалило порог (100 000, 500 000) — новость на стекле. Порогов сразу два не бывает: показываем старший. */
  private announceChipMilestone(before: number): void {
    const crossed = CHIP_MILESTONES.filter((milestone) => before < milestone && this.earned >= milestone);
    const milestone = crossed.at(-1);
    if (milestone === undefined) return;
    // Без процента от цели: число про оборот (earned), а цель и процент считаются от баланса — мешать их нельзя.
    this.news(t('chipsMilestone', formatChips(milestone)));
    this.sfx.play('news', 0.3);
  }

  /**
   * Дошли до цели забега — chipGoal (1 000 000, после «ДАЛЬШЕ» — 10 000 000). Здесь пусто: победу делает CollectorScene
   * (в нём же KABOOM и экран DEATH) — только он знает, можно ли гасить лампы сейчас или надо дождаться конца анимации.
   */
  protected checkChipGoal(): void {}

  // ---------- Ачивки (achievements.ts) ----------

  /**
   * Выдать ачивку и показать её. Решение автора: награды нет — только новость на стекле (где паттерны) и окно
   * по центру экрана автомата. Прогресс пишется навсегда и переживает «Заново».
   * Режим разработчика выдачу гасит: и сам grantAchievement, и флаг devUsedThisRun — иначе можно накрутить
   * амулетов и фишек с включённым ТЕСТ, нажать «ВЫЙТИ» и получить пачку ачивок на следующем refreshHud.
   * Но молча — нельзя: автор жаловался, что «выполнял, а ничего не показывалось», поэтому один раз за забег
   * на стекле выходит новость «ТЕСТ: ачивки не пишутся» (showDevNotice).
   */
  protected unlockAchievement(id: AchievementId): void {
    if (isDevMode() || this.devUsedThisRun) {
      this.showDevNotice(); // ТЕСТ: не пишем и не показываем, но игрок должен знать почему
      return;
    }
    if (!grantAchievement(id)) return; // ачивка уже была
    this.showAchievement(id);
  }

  /**
   * Новость «ТЕСТ: ачивки не пишутся» — одна на забег. Если сейчас стекла не видно (магазин, планшет, пауза,
   * экран конца забега), новость не пропадает: её держит isDevNoticePending, а flushDevNotice покажет, когда
   * стекло снова на виду (его зовёт каждый refreshHud).
   */
  private showDevNotice(): void {
    if (this.isDevNoticeShown) return; // в этом забеге уже говорили — не спамим на каждую проверку ачивок
    this.isDevNoticePending = true;
    this.flushDevNotice();
  }

  /** Показать отложенную новость про ТЕСТ, если её ещё не показывали и стекло сейчас на виду. */
  private flushDevNotice(): void {
    if (!this.isDevNoticePending || this.isDevNoticeShown) return;
    // Магазин закрывает стекло панелью, планшет ложится поверх (OVERLAY_DEPTH), пауза и концовка — ещё выше:
    // новость там не прочитать. Ждём следующего refreshHud — он придёт, когда экран уберут.
    if (!this.canShowPopups()) return;
    this.isDevNoticePending = false;
    this.isDevNoticeShown = true;
    this.news(t('achievementDevNotice'));
    this.sfx.play('news', 0.3);
  }

  /**
   * Можно ли сейчас показывать новости и окна: магазин закрывает стекло панелью, планшет, пауза и концовка
   * лежат ещё выше. Текст Дилера (busy) добавляет TutorialScene, уезжающую панель — ShopScene.
   */
  protected canShowPopups(): boolean {
    return !this.isShopOpen && !this.isAtMonitor && !this.isPaused && !this.isEndScreenOpen;
  }

  /**
   * Новость на стекле. Если сейчас её не видно (магазин, реплика Дилера, концовка), она не пропадает:
   * копится в pendingNews и выходит после pumpPopups — по одной, в порядке появления (DONTLIKE, 25.11).
   */
  protected news(text: string): void {
    this.pendingNews.push(text);
    this.pumpPopups();
  }

  /** Показать одну новость из очереди; следующая встанет после её конца — так снятая извне новость не уносит остальные. */
  private flushNews(): void {
    if (this.isNewsPlaying || !this.canShowPopups() || this.pendingNews.length === 0) return;
    this.isNewsPlaying = true;
    const text = this.pendingNews.shift();
    if (text === undefined) {
      this.isNewsPlaying = false; // очередь опустела между проверкой и shift — показывать нечего
      return;
    }
    let fired = false;
    const done = (): void => {
      if (fired) return; // страховка и настоящий конец зовут одно и то же — считаем один раз
      fired = true;
      this.newsGuard?.remove(false);
      this.newsGuard = null;
      this.isNewsPlaying = false;
      this.pumpPopups(); // новость кончилась — следующая или ачивки
    };
    this.screen.announceSequence([{ text }], done);
    // Новость могут снять извне (clearNews в спасении или у обязательного решения) — done тогда не позовут.
    // Страховка по времени не даёт очереди застрять: ачивки за ней ждать не должны.
    this.newsGuard = this.time.delayedCall(NEWS_QUEUE_GUARD_MS, done);
  }

  /** Всё скопившееся на показ: сначала новости, за ними ачивки. Зовётся после магазина и после текста Дилера. */
  protected pumpPopups(): void {
    this.flushNews();
    this.pumpAchievements();
  }

  /**
   * Показать ачивку, ничего не записывая в прогресс: этим же путём её показывает unlockAchievement,
   * а харнесс снимков зовёт его напрямую. Всегда в очередь: если окно ещё не создано (самое начало create),
   * ачивка не теряется — очередь дренирует pumpAchievements, когда окно готово.
   */
  showAchievement(id: AchievementId): void {
    this.achievementQueue.push(id);
    this.pumpAchievements();
  }

  /**
   * Очередь показа: одну за раз, ничего не теряя. Зовётся после создания окна, из showAchievement и по концу показа.
   * Пока окно занято, следующая ждёт; пока окна нет — ждут все. Пока открыт экран конца забега (победа, рекорд,
   * смерть) — тоже ждут: он на GAME_OVER_DEPTH выше окна, и ачивка под ним была бы не видна (автор жаловался,
   * что «Конец?» и «Это не конец...» терялись). Так же ждут планшет (isAtMonitor, глубина 20) и пауза (isPaused,
   * 30): окно на 13 лежало бы под ними, а таймер 2.5 с шёл бы зря. Очередь довозит continueRun («ДАЛЬШЕ»),
   * lookBack (закрытие планшета), resumeGame (снятие паузы) или новая сцена после «Заново».
   * Магазин и текст Дилера — тоже ждут: окно во время покупок или реплики автору не нужно (DONTLIKE, 25.11).
   */
  protected pumpAchievements(): void {
    if (this.isAchievementShown || !this.achievements || !this.canShowPopups()) return;
    if (this.isNewsPlaying || this.pendingNews.length > 0) return; // сначала новости, что ждали дольше
    const id = this.achievementQueue.shift();
    if (id === undefined) return;
    this.isAchievementShown = true;
    this.achievementShown = id;
    const achievement = achievementById(id);
    this.news(t('achievementNews', t(achievement.name))); // на стекле — только название (как просил автор)
    this.sfx.play('news', 0.4);
    this.achievements.show(achievement, () => {
      this.isAchievementShown = false;
      this.achievementShown = null;
      this.pumpAchievements(); // окно освободилось — показывает следующую
    });
  }

  /**
   * Ачивки, которые ещё не показали: та, что висит на экране, и вся очередь. Нужны при scene.restart
   * (кассета, «Заново», KABOOM посреди показа): прогресс уже записан, значит новость и окно должны дойти до игрока.
   */
  protected pendingAchievements(): AchievementId[] {
    return this.achievementShown === null ? [...this.achievementQueue] : [this.achievementShown, ...this.achievementQueue];
  }

  /** Сцена перезапустилась — вернуть недопоказанные ачивки в очередь (зовётся из create после resetState). */
  protected restoreAchievements(ids: readonly AchievementId[]): void {
    this.achievementQueue.push(...ids);
  }

  /**
   * Проверить ачивки по текущему состоянию забега. Так ловятся ВСЕ простые (первый амулет, все гнёзда, дубликат)
   * и сложные: зовётся после прокрутки (isWin — паттерн выиграл), на каждом refreshHud (покупки, табло, серия)
   * и после включения предмета. Отдельные вызовы unlockAchievement есть только у предметов (activateItem),
   * у «Курильщика» (третья сигарета) и у «Я пролью много крови» (переход счётчика прокруток вниз, spin).
   */
  protected checkAchievements(isWin = false): void {
    for (const id of earnedAchievements(this.achievementState(isWin))) this.unlockAchievement(id);
  }

  /** Что видит проверка ачивок: поля забега. Режим — с ручки (он липкий), а не с текущей прокрутки. */
  private achievementState(isWin: boolean): AchievementState {
    return {
      effects: this.itemEffects,
      // Уникальные гнёзда, а не amuletIds(): тот разворачивает копии, и «ЗАНЯТО!» срабатывало бы на трёх амулетах
      // с двумя копиями каждого. Копии отдельно — в amuletCounts (для «Дубликата»).
      amulets: this.amulets.map((amulet) => amulet.id),
      amuletCounts: this.amuletCounts,
      shelf: this.shelf,
      tickets: this.tickets,
      earned: this.earned,
      multiplier: this.multiplier(),
      skullShare: this.currentSkullShare(),
      isFree: this.isFreeSpinNow,
      isWin,
    };
  }

  /** Всё, от чего зависит вес символа в прокрутке: автомат, амулеты, предметы и улучшения №23/24 (28б). */
  protected weightContext(): WeightContext {
    return {
      machineId: this.machineId,
      amulets: this.amuletIds(),
      effects: this.itemEffects,
      symbolBonus: symbolWeightBonus(this.upgradeEffects),
    };
  }

  /**
   * Доля клеток-черепов в следующей платной прокрутке — то же число, что игрок видит на плашке «💀 N%»
   * (RoundScene.skullShareNext рисует его). Считает общий модуль skullShare.ts: в долю входят амулеты на черепа,
   * автомат и предметы. По этой же доле выдаётся ачивка «50 на 50».
   */
  protected currentSkullShare(): number {
    return skullShareOf(this.round, this.diceDrought, this.weightContext());
  }

  /** Насколько близко беда — от неё бьётся «сердце» в музыке: не хватает на долг, а прокрутки кончаются. */
  protected tension(): number {
    if (this.isRoundOver || this.isGameOver) return 0.6;
    // Долга нет (прощённый первый долг, шаг 38): не хватает ничего — делить на ноль нельзя, иначе тревога NaN.
    const missing = this.debt > 0 ? 1 - Math.min(1, this.balance / this.debt) : 0; // какой доли долга не хватает
    const spent = 1 - Math.min(1, this.spinsLeft / SPINS_PER_ROUND); // сколько раунда прошло
    const angry = this.phase === PHASES[0] ? 0 : ANGRY_TENSION; // в фазе 2 сердце бьётся чаще
    return Math.min(1, missing * (0.3 + 0.7 * spent) + angry);
  }

  /**
   * Множитель следующей прокрутки: серия × шаг (с «Разгоном» шаг больше, в фазе 2 — ещё больше), но не выше потолка.
   */
  protected multiplier(): number {
    return Math.min(multiplierForStreak(this.streak, this.streakStep()), this.multiplierCap());
  }

  /**
   * Шаг множителя серии: амулет «Разгон» его увеличивает, фаза 2 прибавляет ещё один (замечание 19).
   * Сделка Дилера «шаг вдвое» шаг удваивает — RoundScene.streakStep.
   */
  protected streakStep(): number {
    return multiplierStep(this.amuletIds()) + this.phase.multiplierBonus;
  }

  /**
   * Потолок множителя серии: без сделок его нет. Сделка «серия не выше ×N» ставит его — RoundScene.multiplierCap.
   * Потолок режется здесь же, где считается множитель: другого места с этой формулой нет.
   */
  protected multiplierCap(): number {
    return Number.POSITIVE_INFINITY;
  }

  /**
   * Огни вокруг экрана в покое: после клевера (следующая прокрутка с паттерном) — ярко-зелёные, следующая прокрутка кровавая —
   * тёмно-красные, действует чеснок — бледно-зелёные, фаза 2 — оранжевые, иначе золото.
   */
  protected calmLampColor(): number {
    if (this.luckyClovers > 0) return LAMP_LUCK;
    if (this.isBloodNext) return LAMP_BLOOD;
    if (garlicOn(this.itemEffects)) return LAMP_GARLIC;
    return this.phase === PHASES[0] ? LAMP_GOLD : LAMP_ANGRY;
  }

  /** Какие амулеты стоят в гнёздах (с учётом копий) — их правила действуют. */
  protected amuletIds(): AmuletId[] {
    return amuletIdsFrom(this.amuletCounts);
  }

  /**
   * Можно ли сейчас крутить, забирать и включать предметы. Пока впереди бесплатные прокрутки — нельзя: они крутятся сами.
   * Пока висит обязательное решение по перемешке или подмене (isRerolling) — тоже нельзя: сначала столбец или клетка.
   * Пока цель взята, но победа ждёт конца действия (isVictoryPending) — нельзя: иначе кассета успела бы
   * откатить забег, а новая прокрутка начаться за экраном победы. Панель действий (шаг 29) тоже держит игру:
   * пока она открыта, автомат ждёт.
   */
  protected canAct(): boolean {
    return !this.isActionsOpen && this.canUseActions();
  }

  /** Можно ли действовать у автомата, не считая открытой панели действий: по этому же правилу она и открывается. */
  protected canUseActions(): boolean {
    return (
      !this.isSpinning &&
      !this.isRerolling &&
      !this.isRoundOver &&
      !this.isDealing &&
      !this.isGameOver &&
      !this.isVictoryPending &&
      !this.isRewinding &&
      !this.isPaused &&
      !this.isAtMonitor &&
      !this.isRescue &&
      !this.isChoosingSymbol &&
      !this.isChoosingMachine &&
      !this.isChoosingAmulet &&
      !this.isShopping &&
      this.freeSpins === 0
    );
  }

  /** Хватает ли фишек на табло, чтобы отдать долг этого раунда. Долга нет (прощение) — платить нечего, хватает. */
  protected hasEnoughForDebt(): boolean {
    return !debtShortfall(this.debt, this.balance);
  }

  /** Есть ли что платить вообще: долг больше нуля. С прощённым первым долгом платить нечего (шаг 38). */
  protected isDebtFree(): boolean {
    return !(this.debt > 0);
  }

  /**
   * Светится ли записка (долг можно отдать раньше конца раунда): фишек на табло хватает, раунд идёт (не расплата и не магазин,
   * не Дилер, не перемотка, не конец забега) и прокруток осталось мало — PAY_EARLY_GLOW_SPINS. Пока крутится, записка светится, но клик подождёт.
   * Открытое решение по перемешке и подмене записку гасит: пока сетку не посчитали, долг отдавать нечем (canAct() тут
   * не годится — он гасит записку и на бесплатных прокрутках).
   */
  protected canPayEarly(): boolean {
    const isRoundGoing = !this.isRoundOver && !this.isDealing && !this.isGameOver && !this.isRewinding && !this.isRerolling;
    return this.debt > 0 && this.hasEnoughForDebt() && isRoundGoing && this.spinsLeft <= PAY_EARLY_GLOW_SPINS;
  }

  /** Можно ли записать на чистую кассету: между прокрутками у автомата (canAct). */
  protected canRecord(): boolean {
    return this.tapeState === 'blank' && this.canAct();
  }

  /** Можно ли откатиться: есть запись и сейчас между прокрутками (в спасении — по отдельному правилу сцены). */
  protected canRewind(): boolean {
    const canActNow = this.canAct() || this.canRewindDuringRescue();
    return this.tapeState === 'recorded' && !this.isRewinding && !this.isGameOver && !this.isVictoryPending && canActNow;
  }

  /**
   * Можно ли откатиться в раунде спасения. База — нельзя (canUseActions в спасении закрыт); раунд спасения
   * разрешает это отдельно: кассета должна работать и в последнем шансе (DONTLIKE п.14).
   */
  protected canRewindDuringRescue(): boolean {
    return false;
  }

  /**
   * Новый забег. Пустые данные — нарочно: без них Phaser отдал бы новой сцене прошлые (после отката это запись кассеты),
   * и «заново» снова откатило бы забег.
   */
  protected restartGame(): void {
    resetCodex(); // новый забег: встреченное забыто
    // Недопоказанные ачивки едут в новую сцену: прогресс уже записан, окно и новость должны дойти до игрока.
    this.scene.restart({ achievements: this.pendingAchievements() });
  }

  /**
   * Паттерн выпал на сетке: впервые — открываем его навсегда (в браузере) и сразу в этом забеге: схема проступает
   * на стекле, на стекле же новость «НОВЫЙ ПАТТЕРН ×N». Уже открытый — ничего не делаем: слава о нём уже есть.
   * После отката кассетой схема может пропасть с плёнки, но открытой навсегда она осталась (hasPattern) — тогда новость
   * пишет «ПАТТЕРН ×N» без слова «новый»: игрок его уже видел.
   */
  protected openPattern(pattern: Pattern): void {
    if (this.patternSet.includes(pattern.id)) return;
    const isKnown = hasPattern(pattern.id); // открыт в прошлом забеге (или до отката): «новый» уже неправда
    markPatternOpen(pattern.id);
    this.patternSet.push(pattern.id);
    this.screen.revealPattern(pattern);
    this.screen.announcePattern(pattern, isKnown);
    this.sfx.play('news', 0.3);
  }

  /** Показать на стекле набор этого забега: при создании сцены и после отката кассетой (с набором с записи). */
  protected setPatternsOnGlass(): void {
    this.screen.setPatterns(this.patternSet);
  }

  /**
   * Тьма первого забега гаснет совсем: обучение текстами идёт дальше уже поверх обычного забега
   * (подсказки, планшет и цель под ней открываются).
   */
  protected finishDarkness(): void {
    markDarknessDone(); // сразу: сцена может перезапуститься посреди фейда
    const reveal = this.reveal;
    if (!reveal) return;
    // Пока тьма не погасла, она ещё на экране: ссылку не отпускаем (подсказки под ней запрещены).
    reveal.finish(() => {
      this.reveal = null;
    });
  }

  /** Коллектор пришёл за долгом — обучение пройдено: тьма гаснет и больше не вернётся. */
  protected finishTutorial(): void {
    markTutorialDone(); // сразу: сцена может перезапуститься посреди фейда
    this.finishDarkness();
  }

  /** Счёт — сколько долгов закрыто. */
  protected closedDebts(): number {
    return this.round - 1;
  }

  // Что открыто в магазине: не по числу законченных забегов, а по закрытым долгам (closedDebts() = round − 1).
  // В openShop раунд уже увеличен, поэтому первый отданный долг (closedDebts() = 1) — это уже амулеты в магазине,
  // второй — барабан, третий — кассета. Там эти предикаты и ставят частям setAvailable.

  /** Амулеты (чемодан) открыты: первый долг закрыт. */
  protected amuletsUnlocked(): boolean {
    return this.closedDebts() >= 1;
  }

  /** Барабан открыт: закрыто два долга. */
  protected drumUnlocked(): boolean {
    return this.closedDebts() >= 2;
  }

  /** Кассета и видеомагнитофон открыты: закрыто три долга. */
  protected cassetteUnlocked(): boolean {
    return this.closedDebts() >= 3;
  }

  /** Новый рекорд сохраняем сразу, как только закрыто больше долгов, чем в лучшей игре. */
  protected updateRecord(): void {
    if (this.closedDebts() <= this.record) return;
    this.record = this.closedDebts();
    saveRecord(this.record);
  }
}
