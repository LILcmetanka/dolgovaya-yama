import Phaser from 'phaser';
import type { AchievementId } from './achievements';
import { addCopy, AMULETS, countOf, MAX_SOCKETS, symbolPayout, type AmuletId } from './amulets';
import { drawMachineBody, drawRoom } from './decor';
import { DEV_CHIPS, DEV_TICKETS } from './devmode';
import { lang, toggleLang, type Lang } from './lang';
import { chargeNow, releaseCharge, type ChargeSource } from './levers';
import { BODY, LEVER_GLOW, NOTE, WALL_PANEL, ZOOM } from './layout';
import { amuletKey, itemKey, see } from './codex';
import { AmuletCase } from './parts/amuletCase';
import { AmuletRack } from './parts/amuletRack';
import { Atmosphere } from './parts/atmosphere';
import { BrokenScreen } from './parts/brokenScreen';
import { Cassette } from './parts/cassette';
import { ChipCase } from './parts/chipCase';
import { Collector } from './parts/collector';
import { CornerButtons } from './parts/cornerButtons';
import { DealerTable } from './parts/dealerTable';
import { Drum } from './parts/drum';
import { Effects } from './parts/effects';
import { AchievementWindow } from './parts/achievementWindow';
import { ItemShelf } from './parts/itemShelf';
import { machineSpec, machineWinFactor, type MachineId } from './machines';
import { MachineBadge } from './parts/machineBadge';
import { LastChanceBar, type LastChanceAction } from './parts/lastChanceBar';
import { MiniShop } from './parts/miniShop';
import { MachinePanel } from './parts/panel';
import { PauseScreen } from './parts/pauseScreen';
import { PayoutWindow } from './parts/payoutWindow';
import { RerollMenu } from './parts/rerollMenu';
import { Reveal } from './parts/reveal';
import { addRotateHint } from './parts/rotateHint';
import { SettingsPanel } from './parts/settingsPanel';
import { Shop } from './parts/shop';
import { SlotScreen } from './parts/slotScreen';
import { WallScreen, type DevActions } from './parts/wallScreen';
import { Tooltip } from './parts/tooltip';
import { CollectorScene } from './scene/CollectorScene';
import { ITEMS, MAX_SLOTS, type ItemId } from './items';
import { isTutorialDone, markTutorialDone } from './progress';
import type { RunSave } from './save';
import { getVolumes, isSilent, setVolume, toggleSound, volumeShare, type VolumeKind } from './settings';

// Клавиши 1–9 и 0: в игре 1–8 — места на полках; в магазине 1–3 — ряды торгового автомата, 4–5 — маленький автомат
// (место на полке и гнездо), 6–8 — места витрины амулетов, 9 — кассета, 0 — барабан.
// Вне магазина 9 — вставить кассету в видеомагнитофон.
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
const VENDING_KEYS = 3; // сколько клавиш у торгового автомата
const MINI_KEYS = 2; // сколько клавиш у маленького автомата: место на полке и гнездо
const CASE_KEYS = 3; // сколько клавиш у витрины амулетов; за ними — кассета (9) и барабан (0)
const TAPE_KEY = VENDING_KEYS + MINI_KEYS + CASE_KEYS; // номер клавиши кассеты в NUMBER_KEYS
const MUSIC_TICK = 100; // как часто музыка планирует удары «сердца» вперёд, мс

/**
 * Единственная сцена игры «Долговая яма» — верхний слой: создаёт части автомата и разбирает клавиши.
 * Сама игра — в слоях ниже (папка scene/): BaseScene → PhaseScene → BonusScene → MachineScene → RoundScene → DealerScene → ShopScene →
 * SaveScene → CollectorScene → GameScene. Здесь же — открытие монитора символов и обратно.
 */
export class GameScene extends CollectorScene {
  private corner!: CornerButtons; // значки в углу: «звук выключен», на телефоне ⚙ (пауза) и во весь экран
  private pauseScreen!: PauseScreen; // экран паузы
  private settingsPanel!: SettingsPanel; // настройки на экране паузы
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
    this.panel = new MachinePanel(this, () => this.beginCharge('lever'), this.tooltip);
    this.payout = new PayoutWindow(this, () => this.take());
    this.itemShelf = new ItemShelf(
      this,
      this.slots,
      (slot) => this.useItem(slot),
      (id) => this.discardEffect(id),
      () => this.canAct(),
      this.tooltip,
    );
    // Окно перемешки и подмены — после полки: текстуры предметов уже созданы (createItemTextures в ItemShelf).
    this.rerollMenu = new RerollMenu(this, (id) => this.chooseReroll(id), () => this.skipReroll(), this.tooltip);
    // Полоса последнего шанса — после полки: иконки перемешки и подмены уже нарисованы (createItemTextures).
    this.lastChanceBar = new LastChanceBar(this, (action) => this.onLastChanceButton(action), this.tooltip);
    this.amuletRack = new AmuletRack(this, this.sockets, this.tooltip);
    // Полка с включёнными предметами и гнёзда амулетов — до Коллектора: его банкомат, GOOD LUCK и экран KABOOM ложатся поверх всего, что нарисовано раньше.
    this.collector = new Collector(this, this.debt, () => this.payDebt(), () => this.payEarly());
    this.chipCase = new ChipCase(this);
    this.shop = new Shop(this, (row) => this.buy(row), () => this.leaveShop(), this.tooltip);
    // Что из магазина открыто — по закрытым долгам: после отката кассетой раунд уже загружен (loadTape), и части строятся сразу видимыми.
    this.miniShop = new MiniShop(this, (row) => this.buyMini(row), this.tooltip, this.shop.layer);
    this.amuletCase = new AmuletCase(this, (place) => this.buyFromCase(place), this.tooltip, this.amuletsUnlocked(), this.shop.layer);
    // Кассета «продаётся» — это состояние забега (после отката её съел автомат, и она снова продаётся);
    // видно её на панели только вместе с открытой механикой (первый аргумент).
    this.cassette = new Cassette(this, this.cassetteUnlocked(), this.tapeState === 'forSale', () => this.buyTape(), () => this.useTape(), this.tooltip, this.shop.layer);
    this.drum = new Drum(this, () => this.spinDrum(), this.tooltip, this.sfx, this.drumUnlocked(), this.shop.layer);
    this.dealerTable = new DealerTable(this, (id, symbol) => this.acceptPact(id, symbol), () => this.refusePacts());
    this.effects = new Effects(this);
    this.achievements = new AchievementWindow(this); // окно ачивки — после эффектов: оно ложится поверх сетки
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
    // Тьма первого забега: шкала замаха стоит вне пятна света — её не видно, значит и не нажимать,
    // и подсказку над тьмой не показывать. Покажется, когда тьма погаснет (BaseScene.finishTutorial).
    if (this.reveal) this.panel.setChargeVisible(false);
    this.setupKeyboard();
    this.setupSound();
    this.setupPause();
    this.refreshHud();
    if (data.tape) this.playTape();
    else this.panel.callLever(); // новый забег: пока ни разу не крутил — рычаг зовёт (после отката кассетой он не нужен)
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

  /** Esc или P: пауза с настройками или продолжить. */
  private togglePause(): void {
    if (this.isAtMonitor) this.lookBack(); // Esc сначала закрывает большой экран на стене
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
    this.cancelChargeNow(); // замах не переживает паузу: отпускание после неё не крутит
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

  // ---------- Замах рычага (DONTLIKE п. 8) ----------

  /**
   * Нажали рычаг (пробел, Enter или мышь): начинаем замах. Шкала растёт, пока держат, — её обновляет update().
   * Вне игры (пауза, магазин, окно перемешки, у монитора) замах не начинается: там у этих клавиш своё дело.
   * Источник — клавиша или рычаг: отпускание чужого источника замах не завершает (см. BaseScene.endCharge).
   */
  private beginCharge(source: ChargeSource): void {
    if (this.isCharging || !this.canAct()) return;
    if (this.reveal?.isActive) return; // тьма первого забега: рычаг ещё не показан
    this.startCharging(source);
  }

  /**
   * Отпустили рычаг или клавишу: прокрутка с накопленным зарядом. Завершает только тот источник, которым начали:
   * клик по «забрать» при взведённом заряде с клавиши автомат не крутит. Короткое нажатие — заряд 0.
   */
  private endCharge(source: ChargeSource): void {
    if (!this.isCharging || this.chargeSource !== source) return;
    this.isCharging = false;
    this.chargeSource = null;
    const charge = releaseCharge();
    this.panel.showCharge(charge, true); // шкала фиксируется и коротко вспыхивает
    this.spin(charge);
  }

  /** Кадр: пока рычаг держат, шкала ползёт от 0 к 100%. */
  override update(): void {
    if (!this.isCharging) return;
    this.panel.showCharge(chargeNow());
  }

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
    this.rerollMenu.relabel(); // окно перемешки: заголовок по текущему режиму
    if (!this.isPaused) this.collector.flipNote(this.debt);
  }

  // ---------- Экран на стене ----------

  /** → или клик по экрану на стене: открыть большой экран или закрыть. */
  private toggleMonitor(): void {
    if (this.isAtMonitor) this.lookBack();
    else this.lookAtMonitor();
  }

  /** Открыть большой экран со вкладками (символы, паттерны, как играть). Только между прокрутками: пока он открыт, крутить нельзя. */
  private lookAtMonitor(): void {
    if (!this.canAct()) return;
    if (this.reveal?.isActive) return; // тьма первого забега закрывает экран — телевизор не открываем
    this.cancelChargeNow(); // ушли к планшету — замах снят
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

  /** Закрыть большой экран (клик мимо, ✕, Esc, Пробел, ← или →); снова можно крутить. */
  private lookBack(): void {
    if (!this.isAtMonitor) return;
    this.sfx.play('monitor');
    this.monitor.close(() => {
      this.isAtMonitor = false;
      this.refreshHud();
    });
  }

  /** ⚙ в шапке планшета: экран закрывается, и открывается пауза с настройками (громкость и язык). */
  private openSettings(): void {
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

  // ---------- Ввод ----------

  private setupKeyboard(): void {
    this.onKey('SPACE', () => this.onSpace(), true);
    this.onKey('ENTER', () => this.onEnter(), true);
    this.onKey('ESC', () => this.togglePause(), true);
    this.onKey('P', () => this.togglePause(), true);
    this.onKey('M', () => this.toggleMute(), true);
    this.onKey('L', () => this.toggleLanguage(), true);
    this.onKey('R', () => {
      if (this.isGameOver) this.restartGame();
    });
    NUMBER_KEYS.forEach((key, index) => this.onKey(key, () => this.onNumber(index)));
    this.onKey('D', () => {
      // Пока держат замах, D не отдаёт долг: сначала снимаем замах, клавишу не применяем.
      if (this.isCharging) {
        this.cancelChargeNow();
        return;
      }
      this.payEarly(); // отдать долг раньше: фишек на табло хватает — записка светится
    });
    this.onKey('RIGHT', () => this.toggleMonitor()); // экран на стене — справа
    this.onKey('LEFT', () => this.lookBack());
    // Отпускание клавиши и мыши — конец замаха: заряд уходит в прокрутку (DONTLIKE п. 8).
    // Мышь засчитывается, только если замах начат ею: иначе клик по «забрать» при взведённом заряде крутил бы автомат.
    this.input.keyboard?.on('keyup-SPACE', () => this.endCharge('key'));
    this.input.keyboard?.on('keyup-ENTER', () => this.endCharge('key'));
    this.input.on('pointerup', () => this.endCharge('lever'));
    // Отпустили вне окна или вкладка потеряла фокус — замах отменяется, а не висит взведённым.
    this.input.on('pointerupoutside', () => this.cancelChargeNow());
    // Слушатель окна живёт дольше сцены — снимаем его на перезапуске, иначе они копятся.
    const onBlur = (): void => this.cancelChargeNow();
    window.addEventListener('blur', onBlur);
    this.events.once('shutdown', () => window.removeEventListener('blur', onBlur));
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
   * Пробел: на паузе — продолжить, в окне перемешки — пропустить его, у монитора — назад к автомату,
   * в магазине — назад к автомату, в игре — дёрнуть рычаг, после проигрыша — «заново» (через 0,8 с).
   * В последнем шансе пробел ничего не делает: там действуют клавиши 1–4 и мышь (onLastChanceKey).
   */
  private onSpace(): void {
    if (this.isPaused) this.resumeGame();
    else if (this.isRerolling) this.skipReroll(); // окно открыто: ни прокрутки, ни «забрать» — только пропуск
    else if (this.isAtMonitor) this.lookBack();
    else if (this.isShopping) this.leaveShop();
    // Сделка №15: кон уже забран, но второе забирание ещё доступно — Пробел берёт его, а не машет рычагом.
    else if (!this.isGameOver && this.canTakeAgain()) this.take();
    else if (!this.isGameOver) this.beginCharge('key');
    else if (this.canRestartWithSpace) this.restartGame();
  }

  /**
   * Enter: на паузе — продолжить, в окне перемешки — пропустить его, банкомат выехал — отдать долг,
   * у Дилера — отказаться от сделки, иначе — забрать кон. В последнем шансе кона нет: сцена его не берёт (canAct()).
   */
  private onEnter(): void {
    if (this.isPaused) this.resumeGame();
    else if (this.isRerolling) this.skipReroll();
    else if (this.isAwaitingPayment) this.payDebt();
    else if (this.isDealing) this.refusePacts();
    // Кон на кону — Enter забирает; пусто — замахивается, как пробел. Сделка №15: второе «забрать» тоже по Enter.
    else if (this.pot === 0 && this.canAct() && !this.canTakeAgain()) this.beginCharge('key');
    else this.take();
  }

  /**
   * Клавиша 1–9 или 0: в магазине — купить; вне магазина 9 — кассета (записать или откатиться);
   * в игре 1–8 — включить предмет с полки.
   */
  private onNumber(index: number): void {
    // Пока держат замах, цифры не трогают игру: замах снимаем, клавишу не применяем.
    if (this.isCharging) {
      this.cancelChargeNow();
      return;
    }
    if (this.isLastChance) this.onLastChanceKey(index); // в последнем шансе клавиши 1–4 — кнопки полосы
    else if (this.isShopping) this.onShopNumber(index);
    else if (index === TAPE_KEY) this.useTape();
    else if (index < MAX_SLOTS) this.useItem(index);
  }

  /**
   * Клавиша 1–4 в последнем шансе: 1 — заморозка, 2 — перекрут, 3 — джокер, 4 — сдаться.
   * Столбец и клетку выбирают мышью: на сетке кликают, это не клавиатура.
   */
  private onLastChanceKey(index: number): void {
    const actions: LastChanceAction[] = ['freeze', 'reroll', 'joker', 'surrender'];
    const action = actions[index];
    if (action) this.onLastChanceButton(action);
  }

  /** Клавиша в магазине: 1–3 — торговый автомат, 4–5 — маленький, 6–8 — витрина амулетов, 9 — кассета, 0 — барабан. */
  private onShopNumber(index: number): void {
    if (index < VENDING_KEYS) this.buy(index);
    else if (index < VENDING_KEYS + MINI_KEYS) this.buyMini(index - VENDING_KEYS);
    else if (index < TAPE_KEY) this.buyFromCase(index - VENDING_KEYS - MINI_KEYS);
    else if (index === TAPE_KEY) this.buyTape();
    else this.spinDrum();
  }
}
