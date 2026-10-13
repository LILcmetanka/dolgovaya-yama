import Phaser from 'phaser';
import {
  debtForRound,
  evaluateLine,
  isSkull,
  multiplierForStreak,
  randomSymbol,
  spinLine,
  SPINS_PER_ROUND,
  SYMBOLS,
  winWithMultiplier,
  type Line,
  type LineResult,
  type SlotSymbol,
} from './rules';

// Раскладка экрана 960×640.
const CENTER_X = 480;
const CENTER_Y = 320;
const PANEL_X = 30; // левый край левой панели
const PAYTABLE_X = 760; // левый край таблицы выплат
const PAIR_COLUMN_X = 850;
const THREE_COLUMN_X = 905;
const DEBT_BAR_Y = 108;
const DEBT_BAR_WIDTH = 480;
const DEBT_BAR_HEIGHT = 30;
const REEL_XS = [310, 480, 650]; // центры трёх барабанов
const REEL_Y = 250;
const REEL_SIZE = 150;
const MESSAGE_Y = 362;
const POT_Y = 404;
const BUTTON_Y = 545;
const BUTTON_WIDTH = 300;
const BUTTON_HEIGHT = 84;
const SPIN_BUTTON_X = 318;
const TAKE_BUTTON_X = 642;

// Анимация прокрутки: время в мс, расстояние в px.
const FLICKER_DELAY = 60; // как часто меняется символ, пока барабан крутится
const REEL_STOP_TIMES = [400, 650, 900]; // когда останавливается каждый барабан
const RESULT_PAUSE = 150; // пауза между остановкой последнего барабана и итогом
const BOUNCE_HEIGHT = 14; // высота подскока при остановке

// Обратная связь: время в мс.
const BANNER_DELAY = 400; // пауза, чтобы «+36» долетело до полосы долга, перед «ДОЛГ ЗАКРЫТ!»
const DEBT_CLOSED_TIME = 1000; // сколько держится «ДОЛГ ЗАКРЫТ!»
const GAME_OVER_DELAY = 700; // пауза перед экраном проигрыша, чтобы увидеть последнюю прокрутку
const RESTART_SPACE_DELAY = 800; // Пробел перезапускает игру не раньше, чем через столько

const LOW_SPINS = 3; // столько прокруток или меньше — счётчик красный
const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage

// Слои: чем больше число, тем выше лежит объект.
const POPUP_DEPTH = 10;
const BANNER_DEPTH = 20;
const GAME_OVER_DEPTH = 30;

// Внешний вид.
const FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const REEL_BORDER = 0xe2e8f0;
const SKULL_BORDER = 0xef4444;
const WIN_BORDER = 0xfde047;
const SPIN_COLOR = 0x2563eb;
const TAKE_COLOR = 0x16a34a;
const DEBT_BAR_COLOR = 0x22c55e;
const GOLD_TEXT = '#fde047';
const GREEN_TEXT = '#4ade80';
const RED_TEXT = '#f87171';
const MUTED_TEXT = '#94a3b8';
// Всплывающие надписи жирные и с тёмной обводкой, чтобы читались поверх барабанов.
const POPUP_STYLE = { fontSize: '36px', fontStyle: 'bold', stroke: '#0f172a', strokeThickness: 6 };

/** Кнопка: прямоугольник и надпись поверх него. */
interface Button {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** «+12» или, если множитель больше 1, «+4 ×3 = +12». */
function formatWin(win: number, multiplier: number, gain: number): string {
  return multiplier > 1 ? `+${win} ×${multiplier} = +${gain}` : `+${gain}`;
}

/** Цвет рамки символа: у черепа красная, у остальных светлая. */
function borderColor(symbol: SlotSymbol): number {
  return isSkull(symbol) ? SKULL_BORDER : REEL_BORDER;
}

/** Рекорд из localStorage. Если хранилище недоступно — 0, игра работает и так. */
function loadRecord(): number {
  try {
    const saved = Number(localStorage.getItem(RECORD_KEY));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

/** Сохранить рекорд в localStorage. Не получилось — не страшно. */
function saveRecord(record: number): void {
  try {
    localStorage.setItem(RECORD_KEY, String(record));
  } catch {
    // хранилище недоступно (например, запрещено настройками браузера) — играем без сохранения
  }
}

/**
 * Единственная сцена игры «Долговая яма»: состояние, отрисовка, ввод и анимации.
 * Сами правила (символы, выплаты, долг, множитель) лежат в rules.ts.
 */
export class GameScene extends Phaser.Scene {
  // Состояние игры. Начальные значения ставит resetState(), потому что
  // при scene.restart() поля класса сами не сбрасываются.
  private round = 0; // номер раунда: какой по счёту долг закрываем
  private debt = 0; // долг этого раунда
  private paid = 0; // сколько уже внесено в этот долг
  private spinsLeft = 0; // сколько прокруток осталось в раунде
  private pot = 0; // кон: выиграно, но ещё не внесено — череп сжигает его
  private streak = 0; // серия: сколько прокруток подряд без черепа и без «забрать»
  private record = 0; // рекорд: больше всего закрытых долгов за одну игру
  private isSpinning = false; // барабаны крутятся — ввод игнорируется
  private isRoundOver = false; // долг закрыт, висит «ДОЛГ ЗАКРЫТ!» — ждём следующий раунд
  private isGameOver = false; // прокрутки кончились, а долг не закрыт
  private canRestartWithSpace = false; // Пробел на экране проигрыша срабатывает не сразу

  // Объекты на экране.
  private reelBoxes: Phaser.GameObjects.Rectangle[] = [];
  private reelSigns: Phaser.GameObjects.Text[] = [];
  private debtBarFill!: Phaser.GameObjects.Rectangle;
  private debtText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private spinsText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private potText!: Phaser.GameObjects.Text;
  private spinButton!: Button;
  private takeButton!: Button;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();
    this.drawHeader();
    this.drawDebtBar();
    this.drawLeftPanel();
    this.drawReels();
    this.drawPaytable();
    this.drawMessageAndPot();
    this.drawButtons();
    this.setupKeyboard();
    this.refreshHud();
  }

  private resetState(): void {
    this.round = 1;
    this.debt = debtForRound(1);
    this.paid = 0;
    this.spinsLeft = SPINS_PER_ROUND;
    this.pot = 0;
    this.streak = 0;
    this.record = loadRecord();
    this.isSpinning = false;
    this.isRoundOver = false;
    this.isGameOver = false;
    this.canRestartWithSpace = false;
  }

  // ---------- Отрисовка ----------

  private drawHeader(): void {
    this.addText(CENTER_X, 18, 'ДОЛГОВАЯ ЯМА', { fontSize: '30px', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.addText(CENTER_X, 58, 'Закрой долг, пока не кончились прокрутки. 💀 сжигает всё, что на кону.', {
      fontSize: '17px',
      color: '#cbd5e1',
    }).setOrigin(0.5, 0);
  }

  private drawDebtBar(): void {
    const left = CENTER_X - DEBT_BAR_WIDTH / 2;
    this.add
      .rectangle(CENTER_X, DEBT_BAR_Y, DEBT_BAR_WIDTH, DEBT_BAR_HEIGHT, 0x1e293b)
      .setStrokeStyle(2, 0x475569);
    // Заполненная часть растёт от левого края: scaleX — доля внесённого (от 0 до 1).
    this.debtBarFill = this.add
      .rectangle(left, DEBT_BAR_Y, DEBT_BAR_WIDTH, DEBT_BAR_HEIGHT, DEBT_BAR_COLOR)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.debtText = this.addText(CENTER_X, DEBT_BAR_Y, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      stroke: '#0f172a',
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  private drawLeftPanel(): void {
    this.roundText = this.addText(PANEL_X, 190, '', { fontSize: '26px', fontStyle: 'bold' });
    this.spinsText = this.addText(PANEL_X, 230, '', { fontSize: '22px' });
    this.recordText = this.addText(PANEL_X, 266, '', { fontSize: '20px', color: MUTED_TEXT });
  }

  private drawReels(): void {
    this.reelBoxes = [];
    this.reelSigns = [];
    for (const x of REEL_XS) {
      this.reelBoxes.push(this.add.rectangle(x, REEL_Y, REEL_SIZE, REEL_SIZE).setRounded(18));
      this.reelSigns.push(
        this.addText(x, REEL_Y, '', {
          fontSize: '84px',
          fontStyle: 'bold',
          padding: { y: 12 }, // запас, чтобы эмодзи не обрезались сверху и снизу
          shadow: { offsetY: 4, blur: 8, color: 'rgba(0, 0, 0, 0.45)', fill: true }, // символ не сливается с фоном
        }).setOrigin(0.5),
      );
    }
    // Пока не крутили — на барабанах первые три символа.
    for (let reel = 0; reel < REEL_XS.length; reel++) this.showSymbol(reel, SYMBOLS[reel]);
  }

  /** Таблица выплат справа: для каждого символа пара и три, для черепа — «кон сгорает». */
  private drawPaytable(): void {
    this.addText(PAYTABLE_X, 132, 'ВЫПЛАТЫ', { fontSize: '18px', fontStyle: 'bold' });
    this.addText(PAIR_COLUMN_X, 160, 'пара', { fontSize: '15px', color: MUTED_TEXT }).setOrigin(0.5, 0);
    this.addText(THREE_COLUMN_X, 160, 'три', { fontSize: '15px', color: MUTED_TEXT }).setOrigin(0.5, 0);
    SYMBOLS.forEach((symbol, row) => {
      const y = 196 + row * 30;
      this.drawSwatch(PAYTABLE_X + 14, y, symbol);
      if (isSkull(symbol)) {
        this.addText(PAYTABLE_X + 36, y, '— кон сгорает', {
          fontSize: '17px',
          color: RED_TEXT,
        }).setOrigin(0, 0.5);
      } else {
        this.addText(PAIR_COLUMN_X, y, String(symbol.pair), { fontSize: '18px' }).setOrigin(0.5);
        this.addText(THREE_COLUMN_X, y, String(symbol.three), { fontSize: '18px' }).setOrigin(0.5);
      }
    });
  }

  /** Маленький «барабан» для таблицы выплат: цвет фона, рамка и знак символа. */
  private drawSwatch(x: number, y: number, symbol: SlotSymbol): void {
    this.add.rectangle(x, y, 28, 28, symbol.color).setRounded(6).setStrokeStyle(2, borderColor(symbol));
    this.addText(x, y, symbol.sign, { fontSize: '17px', fontStyle: 'bold', padding: { y: 3 } }).setOrigin(0.5);
  }

  private drawMessageAndPot(): void {
    this.messageText = this.addText(CENTER_X, MESSAGE_Y, 'Крути! Выигрыши копятся на кону', {
      fontSize: '22px',
      color: '#e2e8f0',
    }).setOrigin(0.5);
    this.potText = this.addText(CENTER_X, POT_Y, '', {
      fontSize: '32px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
  }

  private drawButtons(): void {
    this.spinButton = this.makeButton(SPIN_BUTTON_X, BUTTON_Y, SPIN_COLOR, () => this.spin());
    this.takeButton = this.makeButton(TAKE_BUTTON_X, BUTTON_Y, TAKE_COLOR, () => this.take());
  }

  /** Большая кнопка: нажимается и мышью, и пальцем. */
  private makeButton(x: number, y: number, color: number, onPress: () => void): Button {
    const box = this.add.rectangle(x, y, BUTTON_WIDTH, BUTTON_HEIGHT, color).setRounded(16);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', onPress);
    const label = this.addText(x, y, '', { fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5);
    return { box, label };
  }

  /** this.add.text с нашим шрифтом (в нём есть шрифты эмодзи). */
  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, ...style });
  }

  /** Показать символ на барабане: цвет фона, рамка (у черепа красная) и знак. */
  private showSymbol(reel: number, symbol: SlotSymbol): void {
    this.reelBoxes[reel].setFillStyle(symbol.color).setStrokeStyle(4, borderColor(symbol));
    this.reelSigns[reel].setText(symbol.sign);
  }

  /** Обновить надписи и кнопки по текущему состоянию. */
  private refreshHud(): void {
    this.debtText.setText(`ДОЛГ ${this.paid} / ${this.debt}`);
    this.fillDebtBar(Math.min(this.paid / this.debt, 1));
    this.roundText.setText(`Раунд ${this.round}`);
    this.spinsText.setText(`Прокрутки: ${this.spinsLeft}`);
    this.spinsText.setColor(this.spinsLeft <= LOW_SPINS ? RED_TEXT : '#ffffff');
    this.recordText.setText(`Рекорд: ${this.record}`);
    this.potText.setText(`НА КОНУ: ${this.pot}`);
    this.spinButton.label.setText(`КРУТИТЬ ×${multiplierForStreak(this.streak)} · Пробел`);
    this.takeButton.label.setText(`ЗАБРАТЬ ${this.pot} · Enter`);
    this.setButtonEnabled(this.spinButton, this.canAct());
    this.setButtonEnabled(this.takeButton, this.canAct() && this.pot > 0);
  }

  /** Полоса долга плавно доезжает до нужной доли (от 0 до 1). */
  private fillDebtBar(progress: number): void {
    if (this.debtBarFill.scaleX === progress) return;
    this.tweens.killTweensOf(this.debtBarFill);
    this.tweens.add({ targets: this.debtBarFill, scaleX: progress, duration: 400, ease: 'Cubic.easeOut' });
  }

  /** Недоступная кнопка затемнена. Сами действия всё равно проверяют, можно ли их сделать. */
  private setButtonEnabled(button: Button, enabled: boolean): void {
    const alpha = enabled ? 1 : 0.35;
    button.box.setAlpha(alpha);
    button.label.setAlpha(alpha);
  }

  // ---------- Обратная связь ----------

  /** Выигрыш всплывает над барабанами: поднимается и тает. */
  private showWinPopup(text: string): void {
    const y = REEL_Y - 30;
    const label = this.addText(CENTER_X, y, text, { ...POPUP_STYLE, color: GOLD_TEXT })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.tweens.add({
      targets: label,
      y: y - 60,
      alpha: { value: 0, delay: 600, duration: 500 },
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** «+36» летит с кона в полосу долга. */
  private flyToDebtBar(amount: number): void {
    const label = this.addText(CENTER_X, POT_Y, `+${amount}`, { ...POPUP_STYLE, color: GREEN_TEXT })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.tweens.add({
      targets: label,
      y: DEBT_BAR_Y,
      alpha: { value: 0, delay: 350, duration: 150 },
      duration: 500,
      ease: 'Cubic.easeIn',
      onComplete: () => label.destroy(),
    });
  }

  /** «НА КОНУ» коротко пульсирует. */
  private pulsePot(): void {
    this.tweens.killTweensOf(this.potText);
    this.potText.setScale(1);
    this.tweens.add({ targets: this.potText, scale: 1.25, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Подсветить барабаны толстой рамкой: золотой при выигрыше, красной при черепе. */
  private highlightReels(reels: number[], color: number): void {
    for (const reel of reels) this.reelBoxes[reel].setStrokeStyle(8, color);
  }

  /** Удар черепа: красная вспышка и лёгкая тряска экрана. */
  private flashAndShake(): void {
    const camera = this.cameras.main;
    camera.flashEffect.alpha = 0.5; // полупрозрачная вспышка, а не сплошной красный экран
    camera.flash(300, 239, 68, 68);
    camera.shake(250, 0.008);
  }

  /** Крупное «ДОЛГ ЗАКРЫТ!» поверх барабанов: выскакивает и через DEBT_CLOSED_TIME тает. */
  private showDebtClosedBanner(): void {
    const strip = this.add.rectangle(CENTER_X, REEL_Y, 960, 150, 0x052e16, 0.92).setDepth(BANNER_DEPTH);
    const label = this.addText(CENTER_X, REEL_Y, 'ДОЛГ ЗАКРЫТ!', {
      fontSize: '72px',
      fontStyle: 'bold',
      color: GREEN_TEXT,
      stroke: '#052e16',
      strokeThickness: 8,
    })
      .setOrigin(0.5)
      .setDepth(BANNER_DEPTH)
      .setScale(0.5);
    this.tweens.add({ targets: label, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: [strip, label],
      alpha: 0,
      delay: DEBT_CLOSED_TIME,
      duration: 250,
      onComplete: () => {
        strip.destroy();
        label.destroy();
      },
    });
  }

  /** Экран проигрыша: затемнение, итог, рекорд и кнопка «ЗАНОВО». */
  private showGameOverScreen(): void {
    const shade = this.add.rectangle(CENTER_X, CENTER_Y, 960, 640, 0x000000, 0.9);
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const title = this.addText(CENTER_X, 200, 'ДОЛГ НЕ ЗАКРЫТ — ты в яме', {
      fontSize: '42px',
      fontStyle: 'bold',
      color: RED_TEXT,
    }).setOrigin(0.5);
    const score = this.addText(CENTER_X, 272, `Закрыто долгов: ${this.closedDebts()}`, {
      fontSize: '30px',
    }).setOrigin(0.5);
    const record = this.addText(CENTER_X, 318, `Рекорд: ${this.record}`, {
      fontSize: '24px',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
    const restart = this.makeButton(CENTER_X, 430, SPIN_COLOR, () => this.restartGame());
    restart.label.setText('ЗАНОВО · R / Пробел');

    const parts = [shade, title, score, record, restart.box, restart.label];
    for (const part of parts) part.setDepth(GAME_OVER_DEPTH).setAlpha(0);
    this.tweens.add({ targets: parts, alpha: 1, duration: 400 });

    this.time.delayedCall(RESTART_SPACE_DELAY, () => {
      this.canRestartWithSpace = true;
    });
  }

  // ---------- Ввод ----------

  private setupKeyboard(): void {
    this.onKey('SPACE', () => this.onSpace());
    this.onKey('ENTER', () => this.take());
    this.onKey('R', () => {
      if (this.isGameOver) this.restartGame();
    });
  }

  /** Подписка на клавишу. Автоповтор (клавишу держат) пропускаем: одно нажатие — одно действие. */
  private onKey(key: string, action: () => void): void {
    this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
      if (!event.repeat) action();
    });
  }

  /** Пробел: в игре — прокрутка, после проигрыша — «заново», но не раньше чем через 0,8 с. */
  private onSpace(): void {
    if (!this.isGameOver) this.spin();
    else if (this.canRestartWithSpace) this.restartGame();
  }

  /** Можно ли сейчас крутить или забирать. */
  private canAct(): boolean {
    return !this.isSpinning && !this.isRoundOver && !this.isGameOver;
  }

  private restartGame(): void {
    this.scene.restart();
  }

  // ---------- Прокрутка ----------

  /** Прокрутка: тратит одну прокрутку, барабаны мелькают и останавливаются по очереди. */
  private spin(): void {
    if (!this.canAct()) return;
    this.isSpinning = true;
    this.spinsLeft -= 1;
    const multiplier = multiplierForStreak(this.streak); // множитель запоминаем до прокрутки
    this.messageText.setText(`Крутим… ×${multiplier}`);
    this.refreshHud();

    const line = spinLine(); // результат известен сразу, анимация только показывает его
    REEL_STOP_TIMES.forEach((stopTime, reel) => this.spinReel(reel, line[reel], stopTime));

    const lastStopTime = Math.max(...REEL_STOP_TIMES);
    this.time.delayedCall(lastStopTime + RESULT_PAUSE, () => this.finishSpin(line, multiplier));
  }

  /** Один барабан: мелькает случайными символами, в stopTime встаёт на итоговый символ. */
  private spinReel(reel: number, finalSymbol: SlotSymbol, stopTime: number): void {
    const flicker = this.time.addEvent({
      delay: FLICKER_DELAY,
      loop: true,
      callback: () => this.showSymbol(reel, randomSymbol()),
    });
    this.time.delayedCall(stopTime, () => {
      flicker.remove();
      this.showSymbol(reel, finalSymbol);
      this.bounceReel(reel);
    });
  }

  /** Короткий подскок барабана при остановке. */
  private bounceReel(reel: number): void {
    this.tweens.add({
      targets: [this.reelBoxes[reel], this.reelSigns[reel]],
      y: REEL_Y - BOUNCE_HEIGHT,
      duration: 90,
      ease: 'Quad.easeOut',
      yoyo: true,
    });
  }

  /** Итог прокрутки: череп сжигает кон, иначе выигрыш × множитель идёт на кон. */
  private finishSpin(line: Line, multiplier: number): void {
    this.isSpinning = false;
    const result = evaluateLine(line);
    if (result.kind === 'skull') {
      this.burnPot(result);
    } else {
      this.streak += 1; // серия растёт с каждой прокруткой без черепа, даже без выигрыша
      this.addToPot(line, result, multiplier);
    }
    if (this.spinsLeft === 0) this.endOfSpins();
    this.refreshHud();
  }

  /** Череп: кон сгорает, серия обрывается — следующая прокрутка снова ×1. */
  private burnPot(result: LineResult): void {
    const lost = this.pot;
    this.pot = 0;
    this.streak = 0;
    this.highlightReels(result.reels, SKULL_BORDER);
    this.flashAndShake();
    this.messageText.setText(lost > 0 ? `💀 Кон сгорел: −${lost}` : '💀 Череп! Множитель снова ×1');
  }

  /** Выигрыш × множитель идёт на кон. */
  private addToPot(line: Line, result: LineResult, multiplier: number): void {
    if (result.kind === 'nothing') {
      this.messageText.setText(`Пусто. Следующая прокрутка ×${multiplierForStreak(this.streak)}`);
      return;
    }
    const gain = winWithMultiplier(result.win, multiplier);
    this.pot += gain;
    const winText = formatWin(result.win, multiplier, gain);
    const combo = result.kind === 'three' ? 'Три' : 'Пара';
    const sign = line[result.reels[0]].sign;
    this.messageText.setText(`${combo} ${sign}: ${winText} на кон`);
    this.highlightReels(result.reels, WIN_BORDER);
    this.showWinPopup(winText);
    this.pulsePot();
  }

  // ---------- Забрать, долг и раунды ----------

  /** «Забрать»: кон уходит в долг. Бесплатно, но множитель снова ×1. */
  private take(): void {
    if (!this.canAct() || this.pot === 0) return;
    this.payPot();
    if (this.isDebtPaid()) this.closeDebt();
    this.refreshHud();
  }

  /** Кон переходит во «внесено», серия обрывается. */
  private payPot(): void {
    const amount = this.pot;
    this.paid += amount;
    this.pot = 0;
    this.streak = 0;
    this.messageText.setText(`+${amount} внесено`);
    this.flyToDebtBar(amount);
  }

  /** Долг закрыт, как только внесено не меньше долга. */
  private isDebtPaid(): boolean {
    return this.paid >= this.debt;
  }

  /** Долг закрыт: «+36» долетает до полосы, на секунду крупно «ДОЛГ ЗАКРЫТ!», потом следующий раунд. */
  private closeDebt(): void {
    this.isRoundOver = true;
    this.time.delayedCall(BANNER_DELAY, () => this.showDebtClosedBanner());
    this.time.delayedCall(BANNER_DELAY + DEBT_CLOSED_TIME, () => this.startNextRound());
  }

  /** Следующий раунд: новый долг, снова 12 прокруток, множитель ×1. Излишек идёт в новый долг. */
  private startNextRound(): void {
    this.isRoundOver = false;
    this.paid -= this.debt; // остаётся излишек
    this.round += 1;
    this.debt = debtForRound(this.round);
    this.spinsLeft = SPINS_PER_ROUND; // оставшиеся прокрутки сгорают
    this.streak = 0;
    this.updateRecord();
    this.messageText.setText(`Раунд ${this.round} · новый долг ${this.debt}`);
    if (this.isDebtPaid()) this.closeDebt(); // излишка хватило и на новый долг
    this.refreshHud();
  }

  /** Прокрутки кончились: кон забирается сам. Хватило на долг — следующий раунд, иначе конец игры. */
  private endOfSpins(): void {
    if (this.pot > 0) this.payPot();
    if (this.isDebtPaid()) this.closeDebt();
    else this.gameOver();
  }

  /** Конец игры: ввод закрыт, через короткую паузу — экран проигрыша. */
  private gameOver(): void {
    this.isGameOver = true;
    this.time.delayedCall(GAME_OVER_DELAY, () => this.showGameOverScreen());
  }

  /** Счёт — сколько долгов закрыто. */
  private closedDebts(): number {
    return this.round - 1;
  }

  /** Новый рекорд сохраняем сразу, как только закрыто больше долгов, чем в лучшей игре. */
  private updateRecord(): void {
    if (this.closedDebts() <= this.record) return;
    this.record = this.closedDebts();
    saveRecord(this.record);
  }
}
