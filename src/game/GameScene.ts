import Phaser from 'phaser';
import {
  ACTION_EXCHANGE_TICKETS,
  ACTION_LOTTERY_TICKETS,
  ACTION_SERVICE_ROUNDS,
  actionUsed,
  canExchange,
  debtBuyCut,
  debtBuyPrice,
  lotteryRoll,
  salePrice,
  serviceAllowed,
  servicePrice,
  symbolCells,
  theftChance,
  theftReward,
  theftSucceeds,
  useAction,
  type ActionId,
} from './actions';
import { isBloodSpill, type AchievementId } from './achievements';
import { addCopy, AMULETS, countOf, MAX_SOCKETS, symbolPayout, spinsPerRound, type AmuletId } from './amulets';
import { drawMachineBody, drawRoom } from './decor';
import { DEV_CHIPS, DEV_TICKETS, isDevMode } from './devmode';
import { amuletKey, itemKey, machineKey, see } from './codex';
import { lang, t, toggleLang, type Lang, type TextKey } from './lang';
import { BODY, LEVER_GLOW, NOTE, WALL_PANEL, ZOOM } from './layout';
import { memoryOptions } from './memory';
import { ActionBoard } from './parts/actionBoard';
import { AmuletCase, MAIN_CASE_LOOK, MINI_CASE_LOOK } from './parts/amuletCase';
import { AmuletRack } from './parts/amuletRack';
import { Atmosphere } from './parts/atmosphere';
import { BrokenScreen } from './parts/brokenScreen';
import { Cassette } from './parts/cassette';
import { Collector } from './parts/collector';
import { CornerButtons } from './parts/cornerButtons';
import { DealerTable } from './parts/dealerTable';
import { Drum } from './parts/drum';
import { Effects } from './parts/effects';
import { AchievementWindow } from './parts/achievementWindow';
import { ItemShelf } from './parts/itemShelf';
import { machineSpec, machineWinFactor, machineSymbolAllowed, MACHINES, type MachineId } from './machines';
import { MachineBadge } from './parts/machineBadge';
import { MiniShop } from './parts/miniShop';
import { MachinePanel } from './parts/panel';
import { PauseScreen } from './parts/pauseScreen';
import { PayoutWindow } from './parts/payoutWindow';
import { Reveal } from './parts/reveal';
import { addRotateHint } from './parts/rotateHint';
import { SettingsPanel } from './parts/settingsPanel';
import { Shop } from './parts/shop';
import { SlotScreen } from './parts/slotScreen';
import { ScreenList, SCREEN_LIST_OVER_DEATH_DEPTH, type ScreenRow } from './parts/screenList';
import { WallScreen, type DevActions } from './parts/wallScreen';
import { Tooltip } from './parts/tooltip';
import { CollectorScene } from './scene/CollectorScene';
import { ITEMS, MAX_SLOTS, offerRowCount, type ItemId } from './items';
import { isTutorialDone, markTutorialDone } from './progress';
import { symbolWeightOf } from './skullShare';
import { isPaying, SPINS_PER_ROUND, SYMBOLS, weightsForRound, type SlotSymbol } from './rules';
import type { RunSave } from './save';
import { getVolumes, isSilent, setVolume, toggleSound, volumeShare, type VolumeKind } from './settings';
import { ACTION_ICONS, GOLD_TEXT } from './theme';

// Клавиши 1–9 и 0: в игре 1–8 — места на полках; в магазине 1–3 — ряды торгового автомата, 4–5 — маленький автомат
// (место на полке и гнездо), 6–8 — места витрины амулетов, 9 — четвёртый ряд витрины (№37), 0 — барабан.
// Кассета — T (и в магазине, и у видеомагнитофона), ряд билетов — B (шаг 35: раньше кассета сидела на 9 и рядам
// №37 и билетов клавиш не хватало).
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
const VENDING_KEYS = 3; // сколько клавиш у торгового автомата (1–3)
const MINI_KEYS = 2; // сколько клавиш у маленького автомата: место на полке и гнездо
const CASE_KEYS = 3; // сколько клавиш у витрины амулетов; за ними — четвёртый ряд (9) и барабан (0)
const EXTRA_ROW_KEY = VENDING_KEYS + MINI_KEYS + CASE_KEYS; // «9»: четвёртый ряд витрины, когда он есть (№37)
const TAPE_KEY = 'T'; // кассета: купить в магазине, вне его — записать или откатиться
const TICKET_KEY = 'B'; // ряд билетов за фишки: раньше покупался только кликом (шаг 35)
const MUSIC_TICK = 100; // как часто музыка планирует удары «сердца» вперёд, мс
/** Надпись лотереи (шаг 29) по id приза: короткая новость на стекле. */
const LOTTERY_TEXT: Record<string, TextKey> = {
  'win-up': 'actionLotteryWinUp',
  'win-down': 'actionLotteryWinDown',
  'skull-down': 'actionLotterySkullDown',
  'skull-up': 'actionLotterySkullUp',
  'spins-up': 'actionLotterySpinsUp',
  'spins-down': 'actionLotterySpinsDown',
};

/** Строка списка действий: действие, его цена и подсказка. Всё — готовыми строками из lang.ts. */
interface ActionRow {
  id: ActionId;
  title: string;
  desc: string;
  deny?: string; // причина, почему нельзя: серой подписью у кнопки
  price: string; // готовая подпись на плашке: число цены или «риск · 18%»
  cost?: 'chips' | 'tickets'; // у цены — значок фишки или билета (шаг 41)
  enabled: boolean; // можно ли нажать (не хватает денег, уже было в раунде, нечего выбирать…)
  danger?: boolean; // красная строка и красное предупреждение (кража)
}

/** Символ в списке выбора (обмен и продажа): значок, подпись (вес, цена, клетки) и можно ли его выбрать. */
interface ActionChoice {
  symbol: SlotSymbol;
  note: string;
  enabled?: boolean;
}

/**
 * Единственная сцена игры «Долговая яма» — верхний слой: создаёт части автомата и разбирает клавиши.
 * Сама игра — в слоях ниже (папка scene/): BaseScene → PhaseScene → BonusScene → MachineScene → RoundScene → DealerScene → ShopScene →
 * SaveScene → CollectorScene → GameScene. Здесь же — открытие монитора символов и обратно.
 */
export class GameScene extends CollectorScene {
  private corner!: CornerButtons; // значки в углу: «звук выключен», на телефоне ⚙ (пауза) и во весь экран
  private pauseScreen!: PauseScreen; // экран паузы
  private settingsPanel!: SettingsPanel; // настройки на экране паузы
  private symbolPick!: ScreenList; // выбор первого символа забега (улучшение №33) — на экране автомата
  private machinePick!: ScreenList; // выбор стартового автомата (улучшение №49) — там же
  private amuletPick!: ScreenList; // выбор амулета из прошлого забега (шаг 38) — там же, бесплатно
  private actionPanel!: ScreenList; // шесть действий вне прокрутки — там же (шаг 29)
  private languageAtPause!: Lang; // язык, какой был, когда встали на паузу: после «▶» записка переворачивается, только если он другой

  constructor() {
    super('GameScene');
  }

  /**
   * data.tape — запись кассеты: сцену перезапустили после отката (SaveScene.insertTape); data.tapesBought — сколько
   * кассет куплено; data.devUsed — трогали ли забег в «ТЕСТ» до отката; data.achievements — ачивки, которых игрок
   * ещё не увидел (прогресс записан, а окно и новость ждут показа в новой сцене).
   */
  create(data: { tape?: RunSave; tapesBought?: number; devUsed?: boolean; achievements?: AchievementId[] } = {}): void {
    // Откат кассетой — тот же забег с того же места: resetState по этому флагу не двигает номер забега (улучшение №8).
    this.isTapeRestart = Boolean(data.tape);
    this.resetState();
    // resetState() обнуляет след «ТЕСТ», а откат его не снимает: он приходит отдельным полем, помимо записи кассеты.
    if (data.devUsed) this.devUsedThisRun = true;
    if (data.achievements) this.restoreAchievements(data.achievements); // очередь показа пережила рестарт
    if (data.tape) this.loadTape(data.tape, data.tapesBought ?? 0); // откат — забег с кассеты (до частей: они строятся по состоянию)
    this.setupCamera();
    drawRoom(this);
    const machineBody = drawMachineBody(this); // тело корпуса — его красит MachineBadge в цвет автомата
    this.monitor = new WallScreen(this, this.round, () => this.toggleMonitor(), () => this.openSettings(), this.devActions());
    // «Символы» на планшете: фактическая цена — амулеты, кости и автомат; буст предмета — зелёной пометкой (хоч. 9.1).
    this.monitor.setSymbolReward((symbol) => ({
      payout: Math.round(symbolPayout(symbol, this.amuletIds(), this.bones) * machineWinFactor(this.machineId)),
      boost: this.itemEffects.symbolBoost[symbol.id] ?? 1,
    })); // мебель комнаты: под рычагом и рукой Коллектора
    this.tooltip = new Tooltip(this);
    this.screen = new SlotScreen(this, this.sfx);
    // Паттерн выпал — сцена решает, открывать ли его (BaseScene.openPattern); на стекле сразу набор этого забега.
    this.screen.onPatternLanded = (pattern) => this.openPattern(pattern);
    if (!data.tape) this.setPatternsOnGlass(); // после кассеты набор ставит playTape — второй раз не трогаем
    this.brokenScreen = new BrokenScreen(this); // поверх сетки: дыра и трещины после взрыва (KABOOM)
    this.machineBadge = new MachineBadge(this, machineBody, machineSpec(this.machineId), this.tooltip);
    this.panel = new MachinePanel(this, () => this.spin(), this.tooltip);
    this.payout = new PayoutWindow(this, () => this.take());
    this.itemShelf = new ItemShelf(
      this,
      this.slots,
      (slot) => this.useItem(slot),
      (id) => this.discardEffect(id),
      () => this.canAct(),
      (item) => this.canUseItem(item),
      this.tooltip,
    );
    this.amuletRack = new AmuletRack(this, this.sockets, this.tooltip);
    // Полка с включёнными предметами и гнёзда амулетов — до Коллектора: его банкомат, GOOD LUCK и экран KABOOM ложатся поверх всего, что нарисовано раньше.
    this.collector = new Collector(this, this.debt, () => this.payDebt(), () => this.payEarly());
    this.shop = new Shop(this, (row) => this.buy(row), () => this.leaveShop(), this.tooltip, offerRowCount(this.upgradeEffects.offerRows));
    // Что из магазина открыто — по закрытым долгам: после отката кассетой раунд уже загружен (loadTape), и части строятся сразу видимыми.
    this.miniShop = new MiniShop(this, (row) => this.buyMini(row), this.tooltip, this.shop.layer);
    this.amuletCase = new AmuletCase(this, MAIN_CASE_LOOK, (place) => this.buyFromCase(place), this.tooltip, this.amuletsUnlocked(), this.shop.layer);
    // Мини-чемодан за фишки (DONTLIKE п.7) — слева от основного: тот же чемодан, но на два амулета и мельче.
    this.miniCase = new AmuletCase(this, MINI_CASE_LOOK, (place) => this.buyFromMiniCase(place), this.tooltip, this.amuletsUnlocked(), this.shop.layer);
    // Кассета «продаётся» — это состояние забега (после отката её съел автомат, и она снова продаётся);
    // видно её на панели только вместе с открытой механикой (первый аргумент).
    this.cassette = new Cassette(this, this.cassetteUnlocked(), this.tapeState === 'forSale', () => this.buyTape(), () => this.useTape(), this.tooltip, this.shop.layer);
    this.drum = new Drum(this, () => this.spinDrum(), this.tooltip, this.sfx, this.drumUnlocked(), this.shop.layer);
    this.dealerTable = new DealerTable(this, (id, symbol) => this.acceptPact(id, symbol), () => this.refusePacts());
    this.effects = new Effects(this);
    this.achievements = new AchievementWindow(this); // окно ачивки — после эффектов: оно ложится поверх сетки
    this.upgradeScreen = new ScreenList(this, SCREEN_LIST_OVER_DEATH_DEPTH); // улучшения после смерти — на экране автомата, поверх затемнения
    this.symbolPick = new ScreenList(this); // выбор первого символа (№33) — список на экране автомата
    this.machinePick = new ScreenList(this); // выбор стартового автомата (№49) — та же манера
    this.amuletPick = new ScreenList(this); // память амулетов (шаг 38): выбор на старте забега, бесплатно
    this.actionPanel = new ScreenList(this); // шесть действий вне прокрутки (шаг 29) — тоже список на экране
    this.actionBoard = new ActionBoard(this, () => this.toggleActions(), this.tooltip); // табличка на стене — вход
    this.pumpAchievements(); // то, что выдано до постройки окна (или до рестарта), показываем теперь
    this.atmosphere = new Atmosphere(this);
    this.corner = new CornerButtons(this, () => this.togglePause(), () => this.toggleMute());
    this.pauseScreen = new PauseScreen(this, () => this.resumeGame());
    this.settingsPanel = new SettingsPanel(this, (kind, level) => this.changeVolume(kind, level), (language) => this.chooseLanguage(language));
    addRotateHint(this);
    // Первый забег — в кромешной тьме: видны только автомат и рычаг в пятнах света (после обучения тьмы нет).
    this.reveal = isTutorialDone() ? null : new Reveal(this, BODY, NOTE, LEVER_GLOW);
    // Пока тьма не погасла, подсказок нет: они выдали бы то, что в ней спрятано.
    this.tooltip.setBlockedCheck(() => this.reveal?.isActive ?? false);
    // Canvas не создался — тьмы нет: обучение считаем пройденным, иначе оно зациклится (каждый забег снова «первый»).
    if (this.reveal && !this.reveal.isActive) {
      markTutorialDone();
      this.reveal = null;
    }
    // Тьма первого забега: подсказок над ней не показывать (BaseScene.finishTutorial), а рычаг в пятне света — дёргать можно.
    this.setupKeyboard();
    this.setupSound();
    this.setupPause();
    this.refreshHud();
    if (data.tape) this.playTape();
    else {
      this.loadStartAmulets(); // память амулетов (шаг 38): что предлагать на старте — амулеты прошлого забега
      this.startRunPicks(); // новый забег: №49 — автомат, за ним память амулетов, за ней №33 — символ
    }
  }

  /**
   * Начало нового забега: сначала выбор автомата (№49), потом память амулетов (шаг 38), потом первый символ (№33).
   * Порядок именно такой: автомат решает, какие символы вообще есть в игре и какие амулеты полезны; амулет
   * меняет веса — его берут до выбора символа, где эти веса и показаны. Без улучшений всё как раньше — рычаг зовёт крутить.
   */
  private startRunPicks(): void {
    if (this.upgradeEffects.startMachinePick) {
      this.chooseStartMachine();
      return;
    }
    this.startRunAmuletPick();
  }

  /**
   * Память амулетов (шаг 38, DONTLIKE п.2): на старте каждого забега — список амулетов прошлого забега, бесплатно.
   * Отказаться можно (✕): гнёзда остаются пусты. С №30 «Амулет в памяти» берут на один больше — тогда список
   * открывается второй раз с остатком (сделка №34 даёт свою прибавку так же — её число уже в picks).
   */
  private startRunAmuletPick(): void {
    if (this.startAmuletPicks <= 0 || memoryOptions(this.startAmulets).length === 0) {
      this.finishStartAmuletPick();
      return;
    }
    this.chooseStartAmulet();
  }

  /** Список памяти на экране автомата: значок и название, описание и текстовая кнопка справа (шаг 37). */
  private chooseStartAmulet(): void {
    const options = memoryOptions(this.startAmulets);
    if (options.length === 0 || this.startAmuletPicks <= 0 || this.amulets.length >= this.sockets) {
      this.finishStartAmuletPick();
      return;
    }
    this.isChoosingAmulet = true;
    this.amuletPick.show(
      options.map((option) => ({
        icon: option.amulet.sign,
        title: t(option.amulet.name),
        desc: t(option.amulet.description),
        right: t('screenPick'),
      })),
      {
        title: t('memoryPickTitle'),
        caption: this.startAmuletPicks > 1 ? t('memoryPickMore', this.startAmuletPicks) : t('memoryPickWhat'),
        onPick: (index) => this.takeStartAmulet(options[index]?.amulet.id ?? null),
        onClose: () => this.finishStartAmuletPick(), // отказ: памяти в этом забеге нет
      },
    );
    this.refreshHud();
  }

  /** Взяли амулет из памяти: он встаёт в гнездо бесплатно; можно взять ещё один — если улучшение/сделка разрешают. */
  private takeStartAmulet(id: AmuletId | null): void {
    if (id === null || !this.grantStartAmulet(id)) {
      this.sfx.play('deny');
      return;
    }
    this.sfx.play('buy');
    this.startAmulets = this.startAmulets.filter((owned) => owned !== id);
    this.startAmuletPicks = Math.max(0, this.startAmuletPicks - 1);
    this.amuletPick.close();
    this.isChoosingAmulet = false;
    this.refreshHud();
    if (this.startAmuletPicks > 0 && this.amulets.length < this.sockets && memoryOptions(this.startAmulets).length > 0) {
      this.chooseStartAmulet(); // №30/сделка №34: второй амулет — снова список
      return;
    }
    this.finishStartAmuletPick();
  }

  /** Память закончилась (взяли или отказались): список закрыт, дальше выбор символа или рычаг. */
  private finishStartAmuletPick(): void {
    this.amuletPick.close();
    this.isChoosingAmulet = false;
    this.startAmulets = [];
    this.startAmuletPicks = 0;
    this.refreshHud();
    this.startRunAfterPicks();
  }

  /** Выборы закончились (или их нет): №33 — символ, иначе рычаг зовёт крутить. */
  private startRunAfterPicks(): void {
    if (this.upgradeEffects.startSymbolPick) {
      this.chooseStartSymbol();
      return;
    }
    this.beginRunPlay();
  }

  /**
   * Всё выбрано — забег пошёл. №8: если первый долг прощён, на стекле новость «ДОЛГ ПРОЩЁН» — иначе игрок
   * не видит, что улучшение сработало (DONTLIKE п.15: «не сработало» — его просто не было видно).
   */
  private beginRunPlay(): void {
    // Память амулетов (шаг 38) взята: жадность забирает по 3 прокрутки с копии, и первый раунд обязан это учесть.
    // resetState считает прокрутки до выбора амулетов, поэтому пересчитываем здесь — иначе «на 3 меньше в раунде»
    // не работало бы в первом раунде забега (DONTLIKE п.12: смотрим, сколько прокруток реально выдано на старте).
    this.spinsLeft = spinsPerRound(SPINS_PER_ROUND, this.amuletIds()) + this.upgradeEffects.firstRoundSpins;
    this.refreshHud();
    if (isBloodSpill(this.spinsLeft, this.amuletIds())) this.unlockAchievement('bloodSpill');
    if (this.isDebtForgiven) {
      this.screen.announceNews(t('debtForgiven'));
      this.sfx.play('news', 0.3);
    }
    this.panel.callLever(); // новый забег: пока ни разу не крутил — рычаг зовёт (после отката кассетой он не нужен)
  }

  /**
   * Улучшение №49 (шаг 28г): перед первым раундом игрок выбирает стартовый автомат из трёх. Список живёт
   * на экране автомата (шаг 37): три строки со значком, названием и описанием, справа — «ВЫБРАТЬ».
   * Отмены и таймаута нет — пока автомат не выбран, isChoosingMachine держит игру (canAct).
   * Дальше — выбор символа (№33), если он куплен.
   */
  private chooseStartMachine(): void {
    this.isChoosingMachine = true;
    this.machinePick.show(
      MACHINES.map((machine) => ({
        icon: machine.sign === '' ? '◈' : machine.sign,
        title: t(machine.name),
        desc: t(machine.description),
        right: t('screenPick'),
      })),
      {
        title: t('machinePickTitle'),
        caption: t('machinePickWhat'),
        onPick: (index) => {
          const machine = MACHINES[index];
          if (!machine) return;
          this.machineId = machine.id;
          this.isChoosingMachine = false;
          this.machinePick.close();
          this.machineBadge.arrive(machine); // корпус его цвета и значок встают на место
          see(machineKey(machine.id)); // выбранный автомат уже встречен: в «Кто есть кто» не «???»
          this.sfx.play('news', 0.3);
          this.refreshHud();
          this.startRunAmuletPick(); // автомат выбран — дальше память амулетов (шаг 38), потом символ
        },
      },
    );
    this.refreshHud();
  }

  /**
   * Улучшение №33 (шаг 28в): перед первым раундом игрок выбирает символ. Список — платящие символы, которые уже
   * есть в автомате, с текущими весами (амулет-память и автомат учтены) — на экране автомата, справа «ВЫБРАТЬ».
   * Отмены и таймаута нет: пока символ не выбран, isChoosingSymbol держит игру (canAct).
   * Выбранный символ подставит startGridOf.
   */
  private chooseStartSymbol(): void {
    const base = weightsForRound(1);
    const options = SYMBOLS
      .filter((symbol) => isPaying(symbol) && machineSymbolAllowed(this.machineId, symbol))
      .map((symbol) => ({ symbol, weight: symbolWeightOf(symbol, base, this.weightContext(), false) }));
    if (options.length === 0) return; // выбирать не из чего — игра идёт как обычно
    this.isChoosingSymbol = true;
    this.symbolPick.show(
      options.map((option) => ({
        icon: option.symbol.sign,
        title: t('symbolPickWeight', Math.round(option.weight)),
        desc: t('symbolPickPrice', option.symbol.price),
        right: t('screenPick'),
      })),
      {
        title: t('symbolPickTitle'),
        caption: t('symbolPickWhat'),
        onPick: (index) => {
          const option = options[index];
          if (!option) return;
          this.startSymbolId = option.symbol.id;
          this.isChoosingSymbol = false;
          this.symbolPick.close();
          this.sfx.play('news', 0.3);
          this.refreshHud();
          this.beginRunPlay(); // выбран символ — забег пошёл
        },
      },
    );
    this.refreshHud();
  }

  /**
   * Камера: игра рисуется в Full HD, раскладка (layout.ts) увеличена в ZOOM раз, вид — прямо на автомат и комнату.
   * Увеличение — от левого верхнего угла: тогда весь вид — это комната от (0, 0) до (VIEW_WIDTH, VIEW_HEIGHT),
   * а вещи, приклеенные к экрану (setScrollFactor(0)), стоят в координатах вида.
   */
  private setupCamera(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(ZOOM).setScroll(0, 0);
  }

  /**
   * Звук: включается на первый клик, касание или клавишу — так требуют браузеры. Пальцем звук разрешён только
   * на отпускание (касание началось — ещё нельзя), мышью — уже на нажатие.
   * Музыка тикает. Громкость — из настроек (они живут дольше сцены и помнят выбор и после «заново», и после перезагрузки).
   */
  private setupSound(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch) this.sfx.unlock();
    });
    this.input.on('pointerup', () => this.sfx.unlock());
    this.input.keyboard?.on('keydown', () => this.sfx.unlock());
    this.time.addEvent({ delay: MUSIC_TICK, loop: true, callback: () => this.sfx.tickMusic() });
    this.applyVolumes();
  }

  // ---------- Пауза ----------

  /** Ушёл с вкладки или свернул браузер — игра сама встаёт на паузу: вернёшься — ничего не пропустил. */
  private setupPause(): void {
    const pauseWhenHidden = (): void => this.pauseGame();
    this.game.events.on(Phaser.Core.Events.HIDDEN, pauseWhenHidden);
    // Слушатель — у всей игры, она живёт дольше сцены: при «заново» его надо снять.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.HIDDEN, pauseWhenHidden));
  }

  /** Esc или P: пауза с настройками или продолжить. Открытая панель действий закрывается первой. */
  private togglePause(): void {
    if (this.isActionsOpen) this.closeActions(); // Esc по панели действий — просто закрыть её
    else if (this.isAtMonitor) this.lookBack(); // Esc сначала закрывает большой экран на стене
    else if (this.isPaused) this.resumeGame();
    else this.pauseGame();
  }

  /**
   * Пауза: анимации (твины), таймеры и звук замирают, поверх — экран паузы с настройками.
   * После проигрыша паузы нет — там и так ничего не идёт (звук и язык и там меняются клавишами M и L).
   * Пока плёнка перематывается, тоже нет: вид гаснет эффектом камеры, а его пауза не останавливает — сцена перезапустилась бы на паузе.
   */
  private pauseGame(): void {
    if (this.isPaused || this.isRewinding || this.isGameOver) return;
    this.isPaused = true;
    this.languageAtPause = lang();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.sfx.setPaused(true);
    this.tooltip.hide();
    this.pauseScreen.show();
    this.settingsPanel.show(getVolumes(), lang());
  }

  /** Продолжить: всё идёт дальше с того же места. */
  private resumeGame(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pauseScreen.hide();
    this.settingsPanel.hide();
    this.sfx.setPaused(false);
    this.time.paused = false;
    this.tweens.resumeAll();
    if (lang() !== this.languageAtPause) this.collector.flipNote(this.debt);
    this.refreshHud(); // на паузе приборы могли выключиться (телевизор закрыли, кнопки не нажимались) — снова включить
    this.pumpAchievements(); // пауза снята: очередь ачивок, что ждала под экраном паузы, доезжает до игрока
  }

  // ---------- Настройки: громкость звуков, громкость музыки, язык ----------

  /** Громкость из настроек — звуку, лампочкам на панели и значку 🔇 в углу. */
  private applyVolumes(): void {
    this.sfx.setVolumes(volumeShare('sfx'), volumeShare('music'));
    this.corner.showSilent(isSilent());
    this.settingsPanel.showVolumes(getVolumes());
  }

  /** На панели нажали «−», «+» или лампочку: громкость kind — ступень level. */
  private changeVolume(kind: VolumeKind, level: number): void {
    setVolume(kind, level);
    this.applyVolumes();
  }

  /** M или 🔇 в углу: выключить весь звук или вернуть как было. */
  private toggleMute(): void {
    toggleSound();
    this.applyVolumes();
  }

  /** На панели нажали RU или EN. */
  private chooseLanguage(language: Lang): void {
    if (language !== lang()) this.toggleLanguage();
  }

  // ---------- Язык ----------

  /**
   * L или RU/EN на панели: сменить язык. Подсказки, новости и экран DEATH берут язык, когда появляются,
   * а постоянные надписи меняем сразу: «ПАУЗА», экран монитора, «ДОЛГ» на записке (она переворачивается).
   * На паузе твины стоят, и каждое нажатие копило бы переворот записки: RU → EN → RU — и после «▶» она переворачивалась
   * без смены языка. Поэтому на паузе записку не трогаем — её переворачивает resumeGame, если язык и правда другой.
   */
  private toggleLanguage(): void {
    toggleLang();
    this.settingsPanel.showLanguage(lang());
    this.tooltip.hide();
    this.pauseScreen.relabel();
    this.monitor.relabel();
    this.shop.relabel(); // кнопка выхода из магазина: надпись на новом языке
    this.actionBoard.relabel(); // табличка действий (шаг 29) — тоже
    this.relabelReroll(); // висит решение по перемешке — новость на стекле заново на новом языке
    this.relabelRescueTexts(); // заставка спасения и подсказка на стекле — тоже (шаг 35)
    if (!this.isPaused) this.collector.flipNote(this.debt);
  }

  // ---------- Экран на стене ----------

  /** → или клик по экрану на стене: открыть большой экран или закрыть. */
  private toggleMonitor(): void {
    if (this.isActionsOpen) return; // сначала закрывают панель действий
    if (this.isAtMonitor) this.lookBack();
    else this.lookAtMonitor();
  }

  /** Открыть большой экран со вкладками (символы, паттерны, как играть). Только между прокрутками: пока он открыт, крутить нельзя. */
  private lookAtMonitor(): void {
    if (!this.canAct() && !this.isRerolling) return; // во время обязательного выбора планшет открыть можно: он игру не двигает
    if (this.reveal?.isActive) return; // тьма первого забега закрывает экран — телевизор не открываем
    this.isAtMonitor = true;
    this.seeOwned();
    this.tooltip.hide();
    this.sfx.play('monitor');
    this.monitor.open();
    this.refreshHud();
  }

  /** Что лежит на полке и в гнёздах, то уже встречено (барабан, откат кассетой) — для вкладки «Предметы». */
  private seeOwned(): void {
    for (const item of this.shelf) if (item) see(itemKey(item.id));
    for (const amulet of this.amulets) see(amuletKey(amulet.id));
  }

  /**
   * Закрыть большой экран (клик мимо, ✕, Esc, Пробел, ← или →); снова можно крутить.
   * При открытой панели подробностей ачивки первое нажатие закрывает только её: планшет остаётся открытым,
   * крутить по-прежнему нельзя — второй клик/Esc закрывает уже сам планшет.
   */
  private lookBack(): void {
    if (!this.isAtMonitor) return;
    if (this.monitor.closeDetail()) return; // открыта панель подробностей ачивки: закрываем только её, планшет остаётся
    this.sfx.play('monitor');
    this.monitor.close(() => {
      this.isAtMonitor = false;
      this.refreshHud();
      this.pumpAchievements(); // планшет закрыт: очередь ачивок, что ждала под ним, доезжает до игрока
    });
  }

  /**
   * ⚙ в шапке планшета: экран закрывается, и открывается пауза с настройками (громкость и язык).
   * При открытой панели ачивки ⚙ под затемнением не нажимается — если нажатие всё же дошло, закрываем только панель:
   * пауза поверх открытого планшета не встаёт (иначе после неё планшет остался бы, а игра уже стояла на паузе).
   */
  private openSettings(): void {
    if (this.monitor.closeDetail()) return;
    this.lookBack();
    this.pauseGame();
  }

  // ---------- Режим разработчика (devmode.ts) ----------

  /** Действия вкладки «ТЕСТ» на планшете: выдача идёт тем же путём, что из магазина, — полка, гнёзда, earn(). */
  private devActions(): DevActions {
    return {
      giveItem: (id) => {
        this.devTouch();
        return this.devGiveItem(id);
      },
      giveAmulet: (id) => {
        this.devTouch();
        return this.devGiveAmulet(id);
      },
      addChips: () => {
        this.devTouch();
        this.earn(DEV_CHIPS); // доход забега: табло и цель считают его как обычный
        this.sfx.play('chips');
        this.refreshHud();
      },
      addTickets: () => {
        this.devTouch();
        this.tickets += DEV_TICKETS;
        this.sfx.play('ticket');
        this.refreshHud();
      },
      setMachine: (id) => {
        this.devTouch();
        this.devSetMachine(id);
      },
      currentMachine: () => this.machineId,
    };
  }

  /**
   * Любое действие вкладки «ТЕСТ» помечает забег: его рекорд в localStorage не пойдёт (BaseScene.updateChipRecord).
   * Одного isDevMode() не хватает: накрутить фишек, нажать «ВЫЙТИ» и доиграть забег — режим уже выключен,
   * а накрученное на табло. Поэтому след остаётся на весь забег, а resetState его снимает.
   */
  private devTouch(): void {
    this.devUsedThisRun = true;
  }

  /**
   * Разработка: предмет на полку, как купленный в магазине. Мест не хватает — открывается следующее (до MAX_SLOTS),
   * все заняты — false (кнопка «+1» на планшете трясётся). Дальше предмет включается обычным путём, правила не обходятся.
   */
  private devGiveItem(id: ItemId): boolean {
    const item = ITEMS.find((candidate) => candidate.id === id);
    if (!item) return false;
    let slot = this.shelf.indexOf(null);
    if (slot < 0) {
      if (this.slots >= MAX_SLOTS) {
        this.sfx.play('deny');
        return false;
      }
      this.slots += 1;
      this.shelf.push(null);
      slot = this.slots - 1;
      this.itemShelf.openSlot(slot); // дверца нового отсека открывается, как за фишки в магазине
    }
    this.shelf[slot] = item;
    // Полёт начинается с планшета: пока он открыт, его всё равно не видно, а на полке предмет появляется сразу.
    this.itemShelf.putItem(slot, item, WALL_PANEL.x, WALL_PANEL.y);
    see(itemKey(item.id));
    this.sfx.play('item');
    return true;
  }

  /**
   * Разработка: амулет в гнездо, как купленный в витрине, — включая копии сверх maxCopies (потолок копий проверяет только
   * магазин). Новому амулету при нехватке гнёзд открывается следующее; гнёзд уже шесть (MAX_SOCKETS) — ставить некуда:
   * false, кнопка «+1» трясётся со звуком отказа, как у предмета при полной полке, и счётчик копий не меняется вовсе
   * (иначе невидимые копии копились бы и считались в amuletIds(), пока кнопка отказывает). Копия уже стоящего амулета
   * работает всегда и maxCopies игнорирует — это задумано.
   */
  private devGiveAmulet(id: AmuletId): boolean {
    const amulet = AMULETS.find((candidate) => candidate.id === id);
    if (!amulet) return false;
    const socket = this.amulets.findIndex((owned) => owned.id === amulet.id);
    // Вместимость проверяем до addCopy: отказ не должен оставлять след в amuletCounts.
    if (socket < 0 && this.amulets.length >= MAX_SOCKETS) {
      this.sfx.play('deny');
      return false;
    }
    addCopy(this.amuletCounts, amulet.id);
    const count = countOf(this.amuletCounts, amulet.id);
    if (socket >= 0) {
      this.amuletRack.putCopy(socket, amulet, count, WALL_PANEL.x, WALL_PANEL.y);
    } else {
      const index = this.amulets.length;
      if (index >= this.sockets) {
        this.sockets = index + 1;
        this.amuletRack.openSocket(index); // новое гнездо — без покупки, как в витрине
      }
      this.amulets.push(amulet);
      this.amuletRack.putAmulet(index, amulet, count, WALL_PANEL.x, WALL_PANEL.y);
    }
    see(amuletKey(amulet.id));
    this.showBones();
    this.sfx.play('item');
    return true;
  }

  /** Разработка: поставить любой из трёх автоматов — тем же путём, что смена в начале раунда (showNewMachine). */
  private devSetMachine(id: MachineId): void {
    if (id === this.machineId) return;
    this.machineId = id;
    this.showNewMachine();
    this.refreshHud();
    this.sfx.play('roundStart');
  }

  // ---------- Действия вне прокрутки (шаг 29) ----------

  /** Табличка на стене или клавиша A: открыть панель шести действий или закрыть её. */
  private toggleActions(): void {
    if (this.isActionsOpen) {
      this.closeActions();
      return;
    }
    if (this.isGameOver || this.isPaused) return;
    if (!this.canUseActions()) {
      this.sfx.play('deny'); // крутится, магазин, спасение, чужой выбор — действовать не между прокрутками
      return;
    }
    this.isActionsOpen = true;
    this.tooltip.hide();
    this.sfx.play('monitor');
    this.showActionRows();
    this.refreshHud();
  }

  /** Панель закрыта: ввод снова у автомата. Закрывают ✕, Esc, «0», Пробел, Enter и клик мимо панели. */
  private closeActions(): void {
    if (!this.isActionsOpen) return;
    this.actionPanel.close();
    this.isActionsOpen = false;
    this.refreshHud();
  }

  /**
   * Список действий на экране автомата: цена, подсказка и причина, если сейчас нельзя.
   * В ТЕСТ все шесть закрыты (ни выгоды, ни траты). Подсказок про клавиши нет — только строки.
   */
  private showActionRows(): void {
    const rows = this.actionRows();
    const list: ScreenRow[] = rows.map((row) => ({
      icon: ACTION_ICONS[row.id],
      title: row.title,
      desc: row.desc,
      deny: row.deny,
      right: row.price,
      cost: row.cost,
      enabled: row.enabled,
      danger: row.danger,
    }));
    this.actionPanel.show(list, {
      title: t('actionsTitle'),
      caption: t('actionsCaption'),
      dimPayout: this.pot === 0, // на кону пусто — окошко выплаты прикрыто, пока список открыт
      onPick: (index) => {
        const row = rows[index];
        if (row) this.pickAction(row.id);
      },
      onDeny: () => this.sfx.play('deny'),
      onClose: () => this.closeActions(),
    });
  }

  /** Строки панели: у каждого действия — цена, подсказка и доступность на сейчас. */
  private actionRows(): ActionRow[] {
    const dev = this.devBlocked();
    const used = (id: ActionId): boolean => actionUsed(this.actionState, id);
    const grid = this.gridSymbols();
    const service = servicePrice(this.debt);
    const nextDebt = this.nextDebtValue();
    const buy = debtBuyPrice(nextDebt);
    const cut = debtBuyCut(nextDebt);
    const chance = Math.round(theftChance(this.round) * 100);
    const reason = (id: ActionId, ok: boolean, text: TextKey | null): string => {
      if (dev) return t('actionDev');
      if (used(id)) return t('actionUsed');
      return ok || !text ? '' : t(text);
    };
    const row = (
      id: ActionId,
      title: string,
      base: string,
      price: string,
      ok: boolean,
      text: TextKey | null,
      danger = false,
      cost?: 'chips' | 'tickets',
    ): ActionRow => {
      const why = reason(id, ok, text);
      return { id, title, desc: base, deny: why || undefined, price, cost, enabled: !dev && !used(id) && ok, danger };
    };
    return [
      row(
        'exchange',
        t('actionExchange'),
        t('actionExchangeWhat'),
        String(ACTION_EXCHANGE_TICKETS),
        this.tickets >= ACTION_EXCHANGE_TICKETS && grid.length > 0 && this.machineSymbols().length > 1,
        this.tickets < ACTION_EXCHANGE_TICKETS ? 'actionNoTickets' : 'actionNoGrid',
        false,
        'tickets',
      ),
      row(
        'lottery',
        t('actionLottery'),
        t('actionLotteryWhat'),
        String(ACTION_LOTTERY_TICKETS),
        this.tickets >= ACTION_LOTTERY_TICKETS,
        'actionNoTickets',
        false,
        'tickets',
      ),
      row(
        'service',
        t('actionService'),
        t('actionServiceWhat'),
        String(service),
        serviceAllowed(this.actionState) && this.balance >= service,
        serviceAllowed(this.actionState) ? 'actionNoChips' : 'actionServiceActive',
        false,
        'chips',
      ),
      row('theft', t('actionTheft'), t('actionTheftWhat'), `${t('actionRisk')} · ${chance}%`, true, null, true),
      row(
        'sale',
        t('actionSale'),
        t('actionSaleWhat'),
        t('actionPick'),
        grid.length > 0,
        'actionNoGrid',
      ),
      row(
        'debt',
        t('actionDebt'),
        t('actionDebtWhat', buy, cut),
        String(buy),
        this.actionState.debtCut === 0 && this.balance >= buy,
        this.actionState.debtCut > 0 ? 'actionDebtUsed' : 'actionNoChips',
        false,
        'chips',
      ),
    ];
  }

  /** Нажали строку: у обмена и продажи сначала выбор символа, остальные решаются сразу. */
  private pickAction(id: ActionId): void {
    if (this.devBlocked()) {
      this.sfx.play('deny'); // ТЕСТ: ни выгоды, ни траты — как улучшения после смерти
      return;
    }
    switch (id) {
      case 'exchange':
        this.showExchangeFrom();
        break;
      case 'lottery':
        this.applyLottery();
        break;
      case 'service':
        this.applyService();
        break;
      case 'theft':
        this.applyTheft();
        break;
      case 'sale':
        this.showSalePick();
        break;
      case 'debt':
        this.applyDebtBuy();
        break;
    }
  }

  /**
   * Список символов на экране автомата (обмен и продажа): значок, подпись под ним и текстовая кнопка справа.
   * «0» и «←» — назад к списку действий, ✕ — закрыть; на экране подсказок про клавиши нет.
   */
  private showSymbolChoices(
    choices: readonly ActionChoice[],
    caption: string,
    right: string,
    onPickSymbol: (symbol: SlotSymbol) => void,
    onBack: () => void,
  ): void {
    this.actionPanel.show(
      choices.map((choice) => ({
        icon: choice.symbol.sign,
        title: choice.note,
        right,
        enabled: choice.enabled !== false,
      })),
      {
        title: t('actionsTitle'),
        caption,
        dimPayout: this.pot === 0,
        onPick: (index) => {
          const choice = choices[index];
          if (choice && choice.enabled !== false) onPickSymbol(choice.symbol);
          else this.sfx.play('deny');
        },
        onDeny: () => this.sfx.play('deny'),
        onBack,
        onClose: () => this.closeActions(),
      },
    );
  }

  /** №2, шаг 1: что убрать — платящий символ с последней сетки. «←» — назад к списку. */
  private showExchangeFrom(): void {
    if (!this.canUseActions() || actionUsed(this.actionState, 'exchange') || this.tickets < ACTION_EXCHANGE_TICKETS) {
      this.sfx.play('deny');
      return;
    }
    const choices: ActionChoice[] = this.gridSymbols().map((symbol) => ({
      symbol,
      note: `${t('symbolPickWeight', Math.round(this.currentSymbolWeight(symbol)))} · ${t('symbolPickPrice', symbol.price)}`,
    }));
    this.showSymbolChoices(choices, t('actionExchangeFrom', choices.length), t('screenPick'), (symbol) => this.showExchangeTo(symbol), () => this.showActionRows());
  }

  /** №2, шаг 2: на что менять — платящий символ этого автомата, кроме выбранного. */
  private showExchangeTo(from: SlotSymbol): void {
    const choices: ActionChoice[] = this.machineSymbols()
      .filter((symbol) => symbol.id !== from.id)
      .map((symbol) => ({
        symbol,
        note: `${t('symbolPickWeight', Math.round(this.currentSymbolWeight(symbol)))} · ${t('symbolPickPrice', symbol.price)}`,
      }));
    this.showSymbolChoices(choices, t('actionExchangeTo', choices.length), t('screenPick'), (to) => this.applyExchange(from, to), () => this.showExchangeFrom());
  }

  /**
   * №2: билеты уплачены, веса двух символов меняются местами до конца раунда, сетка перерисовывается:
   * клетки убранного символа на экране становятся символом-заменой (итог уже посчитан, это только вид).
   */
  private applyExchange(from: SlotSymbol, to: SlotSymbol): void {
    const inMachine = (symbol: SlotSymbol): boolean => this.machineSymbols().some((own) => own.id === symbol.id);
    if (!this.canUseActions() || actionUsed(this.actionState, 'exchange') || this.tickets < ACTION_EXCHANGE_TICKETS || !canExchange(from, to, inMachine)) {
      this.sfx.play('deny');
      return;
    }
    this.spendRunTickets(ACTION_EXCHANGE_TICKETS);
    this.actionState = useAction({ ...this.actionState, exchange: { from: from.id, to: to.id } }, 'exchange');
    this.repaintGrid(from, to);
    this.closeActions();
    this.dropPendingMachineNews();
    this.screen.announceNews(t('actionExchangeDone'));
    this.sfx.play('news', 0.3);
    this.refreshHud();
  }

  /** Перерисовать клетки символа from на сетке символом to: вид догоняет новый состав автомата. */
  private repaintGrid(from: SlotSymbol, to: SlotSymbol): void {
    const grid = this.lastGrid;
    if (!grid) return;
    grid.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.id !== from.id) return;
        row[c] = to;
        this.screen.revealCell(r, c, to, () => undefined);
      });
    });
  }

  /** №4: билет — и случайный баф или дебаф до конца раунда. Прокрутки из жребия применяются сразу. */
  private applyLottery(): void {
    if (!this.canUseActions() || actionUsed(this.actionState, 'lottery') || this.tickets < ACTION_LOTTERY_TICKETS) {
      this.sfx.play('deny');
      return;
    }
    this.spendRunTickets(ACTION_LOTTERY_TICKETS);
    const prize = lotteryRoll(() => this.lotteryRandom());
    this.actionState = useAction({ ...this.actionState, lottery: prize }, 'lottery');
    this.actionSpins(prize.spins ?? 0);
    this.closeActions();
    this.dropPendingMachineNews();
    this.screen.announceNews(t(LOTTERY_TEXT[prize.id] ?? 'actionLottery'));
    this.sfx.play(prize.buff ? 'ticket' : 'warning', 0.3);
    this.refreshHud();
  }

  /** №5: фишки — и черепа реже на ACTION_SERVICE_SKULL_DELTA два раунда. Второй раз не берут, пока идёт чистка. */
  private applyService(): void {
    const price = servicePrice(this.debt);
    if (!this.canUseActions() || actionUsed(this.actionState, 'service') || !serviceAllowed(this.actionState) || this.balance < price) {
      this.sfx.play('deny');
      return;
    }
    this.balance -= price;
    this.actionState = useAction({ ...this.actionState, serviceRounds: ACTION_SERVICE_ROUNDS }, 'service');
    this.closeActions();
    this.dropPendingMachineNews();
    this.screen.announceNews(t('actionServiceDone'));
    this.sfx.play('payment');
    this.refreshHud();
  }

  /** №6: попытка кражи. Успех — фишки на табло; провал — сразу KABOOM, без очков и без магазина. */
  private applyTheft(): void {
    if (!this.canUseActions() || actionUsed(this.actionState, 'theft')) {
      this.sfx.play('deny');
      return;
    }
    this.actionState = useAction(this.actionState, 'theft');
    this.closeActions();
    this.sfx.play('warning', 0.3);
    if (theftSucceeds(this.round, () => this.theftRandom())) {
      const reward = theftReward(this.debt);
      this.earn(reward);
      this.effects.popup(`+${reward}`, GOLD_TEXT);
      this.panel.pulseBoard();
      this.dropPendingMachineNews();
      this.screen.announceNews(t('actionTheftDone'));
      this.sfx.play('chips');
      this.refreshHud();
      return;
    }
    this.kaboom(); // провал — смерть сразу: второй попытки и магазина нет
  }

  /** №8, шаг 1: что продать — платящий символ с сетки; в подписи цена за клетку и итог. */
  private showSalePick(): void {
    if (!this.canUseActions() || actionUsed(this.actionState, 'sale')) {
      this.sfx.play('deny');
      return;
    }
    const multiplier = this.multiplier(); // текущий разгон серии: продажа соразмерна ему (шаг 38, DONTLIKE п.4)
    const choices: ActionChoice[] = this.gridSymbols().map((symbol) => {
      const cells = symbolCells(this.lastGrid, symbol.id);
      return { symbol, note: t('actionSaleNote', symbol.price, cells, multiplier, salePrice(symbol, cells, multiplier)) };
    });
    this.showSymbolChoices(choices, t('actionSalePick', choices.length), t('screenSell'), (symbol) => this.applySale(symbol), () => this.showActionRows());
  }

  /** №8: символ уходит из автомата до конца раунда, фишки — по его цене за каждую клетку на сетке. */
  private applySale(symbol: SlotSymbol): void {
    const cells = symbolCells(this.lastGrid, symbol.id);
    const price = salePrice(symbol, cells, this.multiplier()); // цена × клетки × множитель серии (с потолком)
    if (!this.canUseActions() || actionUsed(this.actionState, 'sale') || price <= 0) {
      this.sfx.play('deny');
      return;
    }
    this.actionState = useAction({ ...this.actionState, sold: [...this.actionState.sold, symbol.id] }, 'sale');
    this.earn(price);
    this.closeActions();
    this.effects.popup(`+${price}`, GOLD_TEXT);
    this.dropPendingMachineNews();
    this.screen.announceNews(t('actionSaleDone'));
    this.sfx.play('chips');
    this.refreshHud();
  }

  /** №10: платишь сейчас — следующий долг станет меньше на выкупленную долю (применит магазин). */
  private applyDebtBuy(): void {
    const next = this.nextDebtValue();
    const price = debtBuyPrice(next);
    const cut = debtBuyCut(next);
    if (!this.canUseActions() || actionUsed(this.actionState, 'debt') || this.actionState.debtCut > 0 || this.balance < price) {
      this.sfx.play('deny');
      return;
    }
    this.balance -= price;
    this.actionState = useAction({ ...this.actionState, debtCut: cut }, 'debt');
    this.closeActions();
    this.dropPendingMachineNews();
    this.screen.announceNews(t('actionDebtDone'));
    this.sfx.play('payment');
    this.refreshHud();
  }

  /** ТЕСТ или забег, который трогали в ТЕСТ: действия не дают выгоды и не тратят (как улучшения после смерти). */
  private devBlocked(): boolean {
    return isDevMode() || this.devUsedThisRun;
  }

  /** Случай лотереи: отдельным методом, чтобы проверка сценария могла подставить число. */
  protected lotteryRandom(): number {
    return Math.random();
  }

  /** Случай кражи: так же подменяется в проверке; в игре — Math.random. */
  protected theftRandom(): number {
    return Math.random();
  }

  // ---------- Ввод ----------

  /** ↑/↓: листают открытый список на экране автомата (закрытые списки стрелки не трогают). */
  private scrollOpenList(delta: number): void {
    for (const list of [this.actionPanel, this.upgradeScreen, this.symbolPick, this.machinePick, this.amuletPick]) {
      if (list?.isOpen) {
        list.scroll(delta);
        return;
      }
    }
  }

  private setupKeyboard(): void {
    this.onKey('SPACE', () => this.onSpace(), true);
    this.onKey('ENTER', () => this.onEnter(), true);
    this.onKey('ESC', () => this.togglePause(), true);
    this.onKey('P', () => this.togglePause(), true);
    this.onKey('M', () => this.toggleMute(), true);
    this.onKey('L', () => this.toggleLanguage(), true);
    this.onKey('R', () => {
      if (this.upgradeScreen.isOpen || this.symbolPick.isOpen || this.machinePick.isOpen || this.amuletPick.isOpen) return; // сначала обязательный выбор, потом «заново»
      if (this.isGameOver) this.restartGame();
    });
    NUMBER_KEYS.forEach((key, index) => this.onKey(key, () => this.onNumber(index)));
    this.onKey(TAPE_KEY, () => {
      if (this.isShopping) this.buyTape(); // в магазине — купить
      else this.useTape(); // у автомата — записать или откатиться
    });
    this.onKey(TICKET_KEY, () => {
      if (this.isShopping) this.buy(this.shop.ticketRow); // ряд билетов за фишки (шаг 35)
    });
    this.onKey('A', () => this.toggleActions()); // шаг 29: панель действий вне прокрутки
    this.onKey('C', () => this.cancelSkullByKey()); // шаг 35: отменить висящий череп (№50) с клавиатуры
    this.onKey('UP', () => this.scrollOpenList(-1)); // шаг 37: список на экране листается стрелками
    this.onKey('DOWN', () => this.scrollOpenList(1));
    this.onKey('D', () => this.payEarly()); // отдать долг раньше: фишек на табло хватает — записка светится
    this.onKey('RIGHT', () => this.toggleMonitor()); // экран на стене — справа
    this.onKey('LEFT', () => this.lookBack());
  }

  /**
   * Подписка на клавишу. Автоповтор (клавишу держат) пропускаем: одно нажатие — одно действие.
   * На паузе работают только клавиши с worksInPause: продолжить, звук и язык.
   */
  private onKey(key: string, action: () => void, worksInPause = false): void {
    this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
      if (event.repeat || (this.isPaused && !worksInPause)) return;
      // В строке кода на планшете клавиша — буква, а не действие игры. Esc — исключение: им планшет закрывается.
      if (key !== 'ESC' && this.monitor.isTyping()) return;
      action();
    });
  }

  /**
   * Пробел: на паузе — продолжить, у монитора — назад к автомату, в магазине — назад к автомату, в игре — прокрутить,
   * после проигрыша — «заново» (через 0,8 с). Если висит обязательное решение по перемешке, spin() не крутит,
   * а напоминает надписью на стекле. В раунде спасения Пробел — тоже прокрутка: spin() уводит в rescueSpinNow.
   */
  private onSpace(): void {
    if (this.isPaused) this.resumeGame();
    else if (this.isActionsOpen) this.closeActions(); // панель действий: Пробел её закрывает
    else if (this.machinePick.isOpen) return; // №49: сначала автомат — Пробел игру не двигает
    else if (this.amuletPick.isOpen) return; // шаг 38: сначала память амулетов — Пробел игру не двигает
    else if (this.symbolPick.isOpen) return; // №33: сначала символ — Пробел игру не двигает
    else if (this.upgradeScreen.isOpen) return; // экран улучшений открыт: Пробел его не закрывает и забег не начинает
    else if (this.isAtMonitor) this.lookBack();
    else if (this.isShopping) this.leaveShop();
    // Сделка №15: кон уже забран, но второе забирание ещё доступно — Пробел берёт его, а не крутит.
    else if (!this.isGameOver && this.canTakeAgain()) this.take();
    else if (!this.isGameOver) this.spin();
    else if (this.canRestartWithSpace) this.restartGame();
  }

  /**
   * Enter: на паузе — продолжить, банкомат выехал — отдать долг, у Дилера — отказаться от сделки, иначе — забрать кон.
   * В раунде спасения кона нет: Enter ничего не делает, крутит рычаг или Пробел.
   */
  private onEnter(): void {
    if (this.isPaused) this.resumeGame();
    else if (this.isActionsOpen) this.closeActions(); // панель действий: Enter её закрывает
    else if (this.machinePick.isOpen) return; // №49: сначала автомат
    else if (this.amuletPick.isOpen) return; // шаг 38: сначала память амулетов
    else if (this.symbolPick.isOpen) return; // №33: сначала символ
    else if (this.upgradeScreen.isOpen) return; // экран улучшений открыт: выбор — только карточкой или 1–3
    else if (this.isAwaitingPayment) this.payDebt();
    else if (this.isDealing) this.refusePacts();
    // Кон на кону — Enter забирает; пусто — крутит, как пробел. Сделка №15: второе «забрать» тоже по Enter.
    else if (this.pot === 0 && this.canAct() && !this.canTakeAgain()) this.spin();
    else this.take();
  }

  /**
   * Клавиша 1–9 или 0: в магазине — купить (9 — четвёртый ряд витрины №37, 0 — барабан); в игре 1–8 — включить
   * предмет с полки. Кассета — отдельная клавиша T (и в магазине, и у видеомагнитофона), билеты — B (шаг 35).
   */
  private onNumber(index: number): void {
    // Выбор стартового автомата (№49): 1–3 — строки списка; остальные клавиши игры молчат.
    if (this.machinePick.isOpen) {
      this.machinePick.press(index);
      return;
    }
    // Память амулетов (шаг 38): 1–N — строки списка; остальные клавиши игры молчат.
    if (this.amuletPick.isOpen) {
      this.amuletPick.press(index);
      return;
    }
    // Выбор первого символа (№33): 1–5 — строки списка; остальные клавиши игры молчат.
    if (this.symbolPick.isOpen) {
      this.symbolPick.press(index);
      return;
    }
    // Экран улучшений после смерти: 1–3 — карточки; остальные клавиши игры молчат, пока он открыт.
    if (this.upgradeScreen.isOpen) {
      this.upgradeScreen.press(index);
      return;
    }
    // Панель действий (шаг 29): 1–6 — строки, «0» — закрыть (в выборе символа — назад). Клавиши игры молчат.
    if (this.isActionsOpen) {
      this.actionPanel.press(index);
      return;
    }
    if (this.isRescue) return; // в спасении клавиш нет: столбец морозят кликом, прокрутку даёт рычаг
    if (this.isShopping) this.onShopNumber(index);
    else if (index < MAX_SLOTS) this.useItem(index);
  }

  /**
   * Клавиша в магазине: 1–3 — торговый автомат, 4–5 — маленький, 6–8 — витрина амулетов, 9 — четвёртый ряд
   * витрины (только с улучшением №37), 0 — барабан. Кассета и билеты — отдельными клавишами T и B (шаг 35).
   */
  private onShopNumber(index: number): void {
    if (index < VENDING_KEYS) this.buy(index);
    else if (index === EXTRA_ROW_KEY) {
      if (this.shop.offerRows > VENDING_KEYS) this.buy(VENDING_KEYS); // ряд есть только с №37
      else this.sfx.play('deny'); // четвёртого ряда нет — «9» отвечает отказом, а не тишиной
    } else if (index < VENDING_KEYS + MINI_KEYS) this.buyMini(index - VENDING_KEYS);
    else if (index < EXTRA_ROW_KEY) this.buyFromCase(index - VENDING_KEYS - MINI_KEYS);
    else this.spinDrum();
  }
}
