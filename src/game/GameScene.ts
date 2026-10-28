import Phaser from 'phaser';
import { drawMachineBody, drawRoom } from './decor';
import { lang, toggleLang, type Lang } from './lang';
import { HOME_SCROLL, ZOOM } from './layout';
import { AmuletCase } from './parts/amuletCase';
import { AmuletRack } from './parts/amuletRack';
import { Atmosphere } from './parts/atmosphere';
import { BrokenScreen } from './parts/brokenScreen';
import { BulletStand } from './parts/bulletStand';
import { Cassette } from './parts/cassette';
import { Collector } from './parts/collector';
import { CornerButtons } from './parts/cornerButtons';
import { DealerTable } from './parts/dealerTable';
import { Drum } from './parts/drum';
import { Effects } from './parts/effects';
import { ItemShelf } from './parts/itemShelf';
import { MachineBadge } from './parts/machineBadge';
import { MachinePanel } from './parts/panel';
import { PauseScreen } from './parts/pauseScreen';
import { PayoutWindow } from './parts/payoutWindow';
import { RevolverTable } from './parts/revolverTable';
import { addRotateHint } from './parts/rotateHint';
import { SettingsPanel } from './parts/settingsPanel';
import { Shop } from './parts/shop';
import { SlotScreen } from './parts/slotScreen';
import { SymbolMonitor } from './parts/symbolMonitor';
import { Tooltip } from './parts/tooltip';
import { ShotScene } from './scene/ShotScene';
import { MAX_SLOTS } from './items';
import type { RunSave } from './save';
import { getVolumes, isSilent, setVolume, toggleSound, volumeShare, type VolumeKind } from './settings';

// Клавиши 1–9 и 0: в игре 1–8 — места на полках; в магазине 1–4 — ряды торгового автомата, 5–8 — места витрины амулетов,
// 9 — кассета, 0 — барабан (а «-» — патрон); у Коллектора 1–6 — амулеты в лотке. Вне магазина 9 — вставить кассету в видеомагнитофон.
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
const VENDING_KEYS = 4; // сколько клавиш у торгового автомата
const CASE_KEYS = 4; // сколько клавиш у витрины амулетов; за ними — кассета (9) и барабан (0)
const TAPE_KEY = VENDING_KEYS + CASE_KEYS; // номер клавиши кассеты в NUMBER_KEYS
const MUSIC_TICK = 100; // как часто музыка планирует удары «сердца» вперёд, мс
const MONITOR_SOUND_DELAY = 0.6; // монитор щёлкает, когда вид к нему повернулся, с

/**
 * Единственная сцена игры «Долговая яма» — верхний слой: создаёт части автомата и разбирает клавиши.
 * Сама игра — в слоях ниже (папка scene/): BaseScene → PhaseScene → BonusScene → MachineScene → RoundScene → DealerScene → ShopScene →
 * SaveScene → CollectorScene → ShotScene → GameScene. Здесь же — поворот к монитору символов и обратно.
 */
export class GameScene extends ShotScene {
  private corner!: CornerButtons; // значки в углу: настройки, «звук выключен», во весь экран
  private pauseScreen!: PauseScreen; // экран паузы
  private settingsPanel!: SettingsPanel; // настройки на экране паузы

  constructor() {
    super('GameScene');
  }

  /** data.tape — запись кассеты: сцену перезапустили после отката (SaveScene.insertTape). */
  create(data: { tape?: RunSave } = {}): void {
    this.resetState();
    if (data.tape) this.loadTape(data.tape); // откат — забег с кассеты (до частей: они строятся по состоянию)
    this.setupCamera();
    drawRoom(this);
    const machineBody = drawMachineBody(this); // тело корпуса — его красит MachineBadge в цвет автомата
    this.monitor = new SymbolMonitor(this, this.round, () => this.toggleMonitor()); // мебель комнаты: под рычагом и рукой Коллектора
    this.tooltip = new Tooltip(this);
    this.screen = new SlotScreen(this, this.sfx);
    this.brokenScreen = new BrokenScreen(this); // поверх сетки: дыра и трещины после выстрела в автомат
    this.machineBadge = new MachineBadge(this, machineBody, this.machine, this.tooltip);
    this.panel = new MachinePanel(this, () => this.spin());
    this.payout = new PayoutWindow(this, () => this.take());
    this.collector = new Collector(this, this.debt, () => this.payDebt(), () => this.payEarly());
    this.itemShelf = new ItemShelf(this, this.slots, (slot) => this.useItem(slot), this.tooltip);
    this.amuletRack = new AmuletRack(this, this.sockets, this.tooltip);
    this.shop = new Shop(this, (row) => this.buy(row), () => this.leaveShop(), this.tooltip);
    this.amuletCase = new AmuletCase(this, (place) => this.buyFromCase(place), this.tooltip);
    this.cassette = new Cassette(this, this.tapeState === 'forSale', () => this.buyTape(), () => this.insertTape(), this.tooltip);
    this.drum = new Drum(this, () => this.spinDrum(), this.tooltip, this.sfx);
    this.bulletStand = new BulletStand(this, () => this.buyBullet(), this.tooltip);
    this.revolverTable = new RevolverTable(
      this,
      () => this.playRoulette(),
      (target) => this.shoot(target),
      (index) => this.giveAmulet(index),
      this.tooltip,
      this.sfx,
    );
    this.dealerTable = new DealerTable(this, (dir) => this.guess(dir), () => this.stopDealing(), this.sfx);
    this.effects = new Effects(this);
    this.atmosphere = new Atmosphere(this);
    this.corner = new CornerButtons(this, () => this.togglePause(), () => this.toggleMute());
    this.pauseScreen = new PauseScreen(this, () => this.resumeGame());
    this.settingsPanel = new SettingsPanel(this, (kind, level) => this.changeVolume(kind, level), (language) => this.chooseLanguage(language));
    addRotateHint(this);
    this.setupKeyboard();
    this.setupSound();
    this.setupPause();
    this.refreshHud();
    if (data.tape) this.playTape();
  }

  /**
   * Камера: игра рисуется в Full HD, раскладка (layout.ts) увеличена в ZOOM раз, вид — прямо на автомат.
   * Увеличение — от левого верхнего угла: тогда scrollX — левый край вида, а вещи, приклеенные к экрану
   * (setScrollFactor(0)), стоят в координатах вида, от 0 до VIEW_WIDTH.
   */
  private setupCamera(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(ZOOM).setScroll(HOME_SCROLL, 0);
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

  /** Esc, P или значок ⚙: пауза с настройками или продолжить. */
  private togglePause(): void {
    if (this.isPaused) this.resumeGame();
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

  /**
   * L или RU/EN на панели: сменить язык. Подсказки, новости и экран DEATH берут язык, когда появляются,
   * а постоянные надписи меняем сразу: «Пробел» у рычага, в магазине и у стола Коллектора, «ДОЛГ» на записке (она переворачивается).
   */
  private toggleLanguage(): void {
    toggleLang();
    this.settingsPanel.showLanguage(lang());
    this.tooltip.hide();
    this.panel.relabel();
    this.shop.relabel();
    this.revolverTable.relabel();
    this.pauseScreen.relabel();
    this.monitor.relabel();
    this.collector.flipNote(this.debt, this.hasEnoughForDebt());
  }

  // ---------- Монитор символов ----------

  /** → или клик по монитору: повернуться к монитору или обратно к автомату. */
  private toggleMonitor(): void {
    if (this.isAtMonitor) this.lookBack();
    else this.lookAtMonitor();
  }

  /** Повернуться к монитору справа — там цены символов и что делает каждый. Только между прокрутками: пока смотришь, крутить нельзя. */
  private lookAtMonitor(): void {
    if (!this.canAct()) return;
    this.isAtMonitor = true;
    this.tooltip.hide();
    this.sfx.play('turn');
    this.sfx.play('monitor', MONITOR_SOUND_DELAY);
    this.monitor.open();
    this.refreshHud();
  }

  /** Назад к автомату (Пробел, ←, → или клик по монитору); повернулся — снова можно крутить. */
  private lookBack(): void {
    if (!this.isAtMonitor) return;
    this.sfx.play('turn');
    this.monitor.close(() => {
      this.isAtMonitor = false;
      this.refreshHud();
    });
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
    this.onKey('D', () => this.payEarly()); // отдать долг раньше: фишек на табло хватает — записка светится
    this.onKey('MINUS', () => this.buyBullet()); // в магазине — купить патрон
    this.onKey('UP', () => this.onUp());
    this.onKey('DOWN', () => this.onDown());
    this.onKey('RIGHT', () => this.toggleMonitor()); // монитор — справа
    this.onKey('LEFT', () => this.lookBack());
  }

  /**
   * Подписка на клавишу. Автоповтор (клавишу держат) пропускаем: одно нажатие — одно действие.
   * На паузе работают только клавиши с worksInPause: продолжить, звук и язык.
   */
  private onKey(key: string, action: () => void, worksInPause = false): void {
    this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
      if (event.repeat || (this.isPaused && !worksInPause)) return;
      action();
    });
  }

  /**
   * Пробел: на паузе — продолжить, у монитора — назад к автомату, у Коллектора — играть в рулетку,
   * в магазине — назад к автомату, в игре — дёрнуть рычаг, после проигрыша — «заново» (через 0,8 с).
   */
  private onSpace(): void {
    if (this.isPaused) this.resumeGame();
    else if (this.isAtMonitor) this.lookBack();
    else if (this.isChoosingDeal) this.playRoulette();
    else if (this.isShopping) this.leaveShop();
    else if (!this.isGameOver) this.spin();
    else if (this.canRestartWithSpace) this.restartGame();
  }

  /**
   * Enter: на паузе — продолжить, рука протянута — отдать долг,
   * у Коллектора — играть в рулетку, у Дилера — остановиться, иначе — забрать кон.
   */
  private onEnter(): void {
    if (this.isPaused) this.resumeGame();
    else if (this.isAwaitingPayment) this.payDebt();
    else if (this.isChoosingDeal) this.playRoulette();
    else if (this.isDealing) this.stopDealing();
    else this.take();
  }

  /**
   * Клавиша 1–9 или 0: в магазине — купить; вне магазина 9 — вставить кассету (можно, когда Коллектор пришёл, а фишек не хватает);
   * у Коллектора 1–6 — амулет, в игре 1–8 — включить предмет с полки.
   */
  private onNumber(index: number): void {
    if (this.isShopping) this.onShopNumber(index);
    else if (index === TAPE_KEY) this.insertTape();
    else if (this.isChoosingDeal) this.giveAmulet(index);
    else if (index < MAX_SLOTS) this.useItem(index);
  }

  /** ↑: в рулетке — выстрел в Коллектора, у Дилера — «больше». */
  private onUp(): void {
    if (this.isAiming) this.shoot('collector');
    else this.guess('higher');
  }

  /** ↓: в рулетке — выстрел в себя, у Дилера — «меньше». */
  private onDown(): void {
    if (this.isAiming) this.shoot('player');
    else this.guess('lower');
  }

  /** Клавиша в магазине: 1–4 — ряды торгового автомата, 5–8 — витрина амулетов, 9 — кассета, 0 — барабан. */
  private onShopNumber(index: number): void {
    if (index < VENDING_KEYS) this.buy(index);
    else if (index < TAPE_KEY) this.buyFromCase(index - VENDING_KEYS);
    else if (index === TAPE_KEY) this.buyTape();
    else this.spinDrum();
  }
}
