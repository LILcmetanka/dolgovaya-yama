import Phaser from 'phaser';
import {
  createChipTextures,
  createNoteGlowTexture,
  drawNoteTexture,
  GOAL_NOTE_TEXTURE,
  NOTE_GLOW_TEXTURE,
  NOTE_TEXTURE,
} from '../decor';
import { formatChips, lang, t } from '../lang';
import { Atm } from './atm';
import { CENTER_X, CENTER_Y, GOAL_NOTE, GOAL_NOTE_ANGLE, NOTE, NOTE_ANGLE, SCREEN, VIEW_WIDTH } from '../layout';
import { CHIP_GOAL } from '../gameConfig';
import { GOOD_LUCK_TIME } from '../lastChance';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT, LED_STYLE, POPUP_DEPTH, RED_TEXT } from '../theme';
import {
  SCREEN_TONE_BLUR,
  SCREEN_TONE_COLORS,
  TUTORIAL_SCREEN_FONT,
  TUTORIAL_SCREEN_FONT_MIN,
  TUTORIAL_SCREEN_MAX_WIDTH,
  type ScreenTone,
} from '../screenText';
import { lineHoldFor, TUTORIAL_LINE_HOLD, tutorialLineHold, tutorialLineRows, type TutorialLine } from '../tutorial';

// Записка светится, когда долг можно отдать раньше: клик по ней или D.
const NOTE_GLOW_MIN = 0.3; // свечение пульсирует: гаснет до такой яркости и разгорается снова
const NOTE_GLOW_TIME = 700; // мс
// Надпись на чёрном экране автомата: KABOOM — конец забега. GOOD LUCK рисует банкомат (atm.ts), не эта часть.
const SCREEN_TITLE_STYLE = { ...LED_STYLE, fontSize: '64px', color: RED_TEXT, shadow: { color: '#ef4444', blur: 18, fill: true } };
// Заставка раунда спасения (шаг 32): короткие строки по очереди на том же чёрном экране. Кегль у всех строк один,
// а длинная строка переносится на две — ужимать по ширине нельзя (DONTLIKE п.6: текст разного размера не читается).
const SCREEN_LINE_FONT = 28;
const SCREEN_LINE_MAX_WIDTH = 340; // строка держится в экране и переносится по словам ровно на две
const SCREEN_LINE_HOLD = 1100; // строка держится, мс
const SCREEN_LINE_FADE = 220; // и столько гаснет
const SCREEN_LINE_GAP = 120; // пауза перед следующей строкой, мс
const SCREEN_ROUNDING = 16; // скругление чёрного экрана заставки — как у startSequence
const TUTORIAL_ROW_GAP = 6; // зазор между рядами строки обучения, px
const TUTORIAL_EMPTY_ROW_HEIGHT = 43; // высота пустого ряда (кегль 36 с запасом): отступ тоже занимает место
// Экран победы: «ПОБЕДА» золотом — автомат цел, забег выигран (KABOOM — красный).
const VICTORY_TITLE_STYLE = { ...LED_STYLE, fontSize: '56px', color: GOLD_TEXT, shadow: { color: '#f59e0b', blur: 18, fill: true } };
const SCREEN_TITLE_DEPTH = POPUP_DEPTH - 1; // заголовок — над сеткой, под всплывающими надписями
// Взрыв автомата (KABOOM): вспышка и огненные шары из экрана.
const EXPLOSION_BALLS = 18;
const EXPLOSION_COLORS = [0xfde047, 0xf97316, 0xdc2626, 0xffffff];
const EXPLOSION_MIN_DISTANCE = 140;
const EXPLOSION_MAX_DISTANCE = 380;
const EXPLOSION_MIN_TIME = 500;
const EXPLOSION_MAX_TIME = 950;
const EXPLOSION_FLASH_TIME = 700;
// Экран DEATH: плита на месте окон корпуса, на ней гравированная полоска с итогами, ниже — кнопка «ЗАНОВО».
// Так итоги и кнопка не лезут друг на друга и ни одна не накрывает окошки корпуса (шаг 42).
const DEATH_SCORE_Y = 502; // середина полоски с итогами
const DEATH_BUTTON_Y = 558;
const END_PLATE = { y: 540, width: 480, height: 128, radius: 12 }; // плита: 480×128, от 476 до 604 — по панели под экраном
const END_PLATE_FILL = 0x1b1410; // тёмная бронза
const END_STRIP = { y: DEATH_SCORE_Y, width: 430, height: 26, radius: 6 }; // гравированная полоска внутри плиты
const SCORE_FONT = 17;
const BUTTON_WIDTH = 170;
const BUTTON_HEIGHT = 60;
const BUTTON_STEP = 200; // расстояние между центрами кнопок «ЗАНОВО» и «ДАЛЬШЕ» на экране победы
const BUTTON_SHADOW = 6; // тень кнопки сдвинута вниз на столько px
// Кнопки конца забега выше затемнения: иначе полноэкранная тень (она ловит клики) забирает нажатие себе.
const BUTTON_DEPTH = GAME_OVER_DEPTH + 1;
const BUTTON_COLOR = 0xea580c;
const BUTTON_BORDER = 0xfbbf24;
// Анимации, мс.
const NOTE_FLIP_TIME = 140; // половина переворота записки
const BLACKOUT_TIME = 700; // экран гаснет и загорается снова
const SCREEN_LAMP_INSET = 9; // чёрный экран смерти не доходит до лампочек рамки на столько px
const TITLE_BLINK_TIME = 500; // DEATH и KABOOM мигают
const GOOD_LUCK_FADE_TIME = 400; // заголовок на экране автомата гаснет — экран снова горит

/** Кнопка: тень стоит на месте, а «лицо» — контейнер с корпусом, бликом и надписями. */
interface Button {
  shadow: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Container;
}

/**
 * Всё про долг: записка на стене (фишек хватает — она светится, и по ней можно отдать долг раньше),
 * банкомат, в который платят долг (фишки в щель, на выходе купон), KABOOM на экране автомата,
 * затемнение и экран DEATH. Он же показывает экран ПОБЕДЫ — вид тот же, заголовок золотой.
 */
export class Collector {
  private readonly scene: Phaser.Scene;
  private readonly note: Phaser.GameObjects.Image; // записка с долгом: бумажка с надписями одной картинкой
  private readonly noteGlow: Phaser.GameObjects.Image; // свечение вокруг записки: долг можно отдать раньше
  private goalEarned = 0; // сколько набрано за забег — что нарисовано на записке цели
  private goalTarget = CHIP_GOAL; // ступень цели: 1 000 000, после «ДАЛЬШЕ» — 10 000 000
  private readonly atm: Atm; // банкомат: долг платят в него, GOOD LUCK перед спасением горит на его экране
  private noteDebt = 0; // что нарисовано на записке: долг, фишки на табло и на кону — для полоски долга
  private noteBalance = 0;
  private notePot = 0;
  private isPayable = false; // записка светится: по ней можно кликнуть и отдать долг раньше
  private goodLuck: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = []; // KABOOM на экране автомата, пока идёт взрыв
  // Заставка на экране автомата (раунд спасения): что нарисовано сейчас; token отменяет недоигранную заставку.
  private screenSequence: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [];
  private sequenceToken = 0;
  // Отложенные шаги заставки: снимаются в clearScreenSequence, чтобы не висели после неё (шаг 35).
  private sequenceTimers: Phaser.Time.TimerEvent[] = [];
  // Строки заставки, номер показываемой и что сделать после последней: по ним заставка перерисовывается
  // с того же места при смене языка (шаг 35).
  private sequenceLines: readonly string[] = [];
  private sequenceIndex = 0;
  private sequenceDone: (() => void) | null = null;
  // Настройки заставки: сколько строка держится и на каком слое её рисовать. Их задаёт showScreenSequence,
  // смена языка (relabelScreenSequence) их сохраняет.
  private sequenceHold = SCREEN_LINE_HOLD;
  private sequenceDepth = SCREEN_TITLE_DEPTH;
  // Режим заставки: простая (строка целиком) или обучение (куски своих тонов). Сброс — в clearScreenSequence,
  // поэтому relabel одной заставки не трогает другую.
  private sequenceMode: 'plain' | 'tutorial' = 'plain';
  private tutorialLines: readonly TutorialLine[] = [];
  private tutorialMode: 'chain' | 'wait' = 'chain';
  // Чёрный экран заставки обучения, который пережил конец реплики: очередь реплик говорит на нём же, и автомат
  // между ними не мелькает. keep — экран в конце реплики не гасить (снимет следующая реплика или clearScreenSequence).
  private sequenceScreen: Phaser.GameObjects.Rectangle | null = null;
  private sequenceKeepScreen = false;
  // Что делать по «ЗАНОВО» на экране смерти: кнопка показывается, только когда улучшать нечего (DONTLIKE п.7).
  private deathRestart: (() => void) | null = null;

  /**
   * pay — что делать, когда кликнули по банкомату (Enter сцена ловит сама);
   * payEarly — когда кликнули по светящейся записке (D сцена ловит сама).
   */
  constructor(scene: Phaser.Scene, debt: number, pay: () => void, payEarly: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createNoteGlowTexture(scene, NOTE.width, NOTE.height);

    // Записка: бумажка, «ДОЛГ» и сумма — одна картинка из decor.ts.
    // Надписи нарисованы прямо на бумажке: Phaser 4 обрезает текст в повёрнутом контейнере, а картинку — нет.
    // Под запиской — свечение: его видно, когда долг можно отдать раньше; тогда по записке можно кликнуть.
    this.noteGlow = scene.add.image(NOTE.x, NOTE.y, NOTE_GLOW_TEXTURE).setAngle(NOTE_ANGLE).setVisible(false);
    this.noteDebt = debt;
    this.redrawNote();
    this.note = scene.add.image(NOTE.x, NOTE.y, NOTE_TEXTURE).setAngle(NOTE_ANGLE);
    this.note.setInteractive({ useHandCursor: true }).disableInteractive();
    this.note.on('pointerdown', payEarly);

    // Вторая записка — цель забега: на стене над экраном, чуть в другую сторону. Сумма ступени и процент до десятых.
    this.redrawGoalNote();
    scene.add.image(GOAL_NOTE.x, GOAL_NOTE.y, GOAL_NOTE_TEXTURE).setAngle(GOAL_NOTE_ANGLE);

    this.atm = new Atm(scene, pay);
  }

  /** Сменился долг — перерисовываем записку. Галочки «фишек хватает» больше нет (просьба автора, хоч. 4). */
  markNote(debt: number): void {
    if (debt === this.noteDebt) return;
    this.noteDebt = debt;
    this.redrawNote();
  }

  /**
   * Полоска долга на записке: сколько долга уже на табло и сколько лежит на кону.
   * Зовёт refreshHud при любом изменении, поэтому перерисовываем, только если числа сменились.
   */
  showProgress(debt: number, balance: number, pot: number): void {
    if (balance === this.noteBalance && pot === this.notePot) return;
    this.noteBalance = balance;
    this.notePot = pot;
    // Долг на записке меняет только переворот (flipNote): до него число не трогаем, переворот сам нарисует полоску.
    if (debt === this.noteDebt) this.redrawNote();
  }

  /** Нарисовать записку заново по запомненным числам. Долга нет (прощение) — полоска полная, деления на 0 нет. */
  private redrawNote(): void {
    const owed = this.noteDebt > 0 ? this.noteDebt : 0;
    const paid = owed > 0 ? Math.min(1, this.noteBalance / owed) : 1;
    const pending = owed > 0 ? Math.min(1 - paid, this.notePot / owed) : 0;
    drawNoteTexture(
      this.scene,
      NOTE.width,
      NOTE.height,
      { texture: NOTE_TEXTURE, title: t('debt'), amount: String(this.noteDebt) },
      paid,
      pending,
    );
  }

  /**
   * Цель забега на записке: сумма текущей ступени (1 000 000, после «ДАЛЬШЕ» — 10 000 000) и процент
   * заполнения до десятых. Зовёт refreshHud при любом изменении — перерисовываем, только если числа сменились.
   */
  showGoal(earned: number, goal: number): void {
    if (earned === this.goalEarned && goal === this.goalTarget) return;
    this.goalEarned = earned;
    this.goalTarget = goal;
    this.redrawGoalNote();
  }

  /** Нарисовать записку цели заново: сумма ступени, процент к ней и зелёная полоска заполнения (DONTLIKE з.2). */
  private redrawGoalNote(): void {
    const share = this.goalTarget > 0 ? Math.min(1, this.goalEarned / this.goalTarget) : 0;
    drawNoteTexture(
      this.scene,
      GOAL_NOTE.width,
      GOAL_NOTE.height,
      {
        texture: GOAL_NOTE_TEXTURE,
        title: t('goal'),
        amount: formatChips(this.goalTarget, '.'),
        caption: `${formatShare(share)}%`,
      },
      0,
      0,
      share, // зелёная полоска — тот же процент, что подписью
    );
  }

  /**
   * Можно ли отдать долг раньше: да — записка светится (свечение пульсирует), курсор над ней — рука;
   * нет — свечение гаснет и кликнуть нельзя.
   */
  showPayable(isPayable: boolean): void {
    if (isPayable === this.isPayable) return;
    this.isPayable = isPayable;
    this.scene.tweens.killTweensOf(this.noteGlow);
    this.noteGlow.setVisible(isPayable).setAlpha(1);
    if (!isPayable) {
      this.note.disableInteractive(true); // и курсор-рука пропадает, даже если мышь над запиской
      return;
    }
    this.note.setInteractive();
    this.scene.tweens.add({
      targets: this.noteGlow,
      alpha: NOTE_GLOW_MIN,
      duration: NOTE_GLOW_TIME,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Новый долг: записка переворачивается, и на обороте — новая сумма. */
  flipNote(debt: number): void {
    this.scene.tweens.killTweensOf(this.note);
    this.note.setScale(1);
    this.scene.tweens.add({
      targets: this.note,
      scaleX: 0,
      duration: NOTE_FLIP_TIME,
      yoyo: true,
      ease: 'Quad.easeIn',
      onYoyo: () => {
        this.noteDebt = debt;
        this.redrawNote();
        this.redrawGoalNote(); // язык мог смениться — на записке цели другие «ДОЛГ»/«ЦЕЛЬ» и разделитель процента
      },
    });
  }

  /**
   * Справа от автомата выезжает банкомат (камера стоит на месте). Фишек хватает — на его экране долг, ждёт оплаты — ready().
   * Не хватает — на экране красное GOOD LUCK: через GOOD_LUCK_TIME оно гаснет, банкомат уезжает —
   * и только когда он уехал, ready(): спасение не начинается поверх уезжающего банкомата.
   */
  reachOut(debt: number, isEnough: boolean, ready: () => void): void {
    this.atm.slideIn(debt, isEnough, () => {
      if (isEnough) {
        ready();
        return;
      }
      // GOOD LUCK погорел — банкомат уезжает: он больше не нужен, автомат крутит сам.
      this.scene.time.delayedCall(GOOD_LUCK_TIME, () => {
        this.atm.slideOut(ready);
      });
    });
  }

  /** Долг отдан: фишки летят с табло в щель, банкомат печатает купон — paid(x, y) с места купона, уезжает — done(). */
  takePayment(paid: (x: number, y: number) => void, done: () => void): void {
    this.atm.swallowAndPrint(paid, () => this.leave(done));
  }

  /** Банкомат выехал к игроку или ещё едет: победа ждёт, пока он уедет. */
  get isAtmOut(): boolean {
    return this.atm.isOut;
  }

  /** Банкомат уезжает вбок — потом done(). */
  private leave(done: () => void): void {
    this.atm.slideOut(done);
  }

  /** Конец забега: экран автомата гаснет, на нём мигает красное KABOOM. */
  warnGoodLuck(text: string): void {
    this.goodLuck = this.screenTitle(text, SCREEN_TITLE_DEPTH);
  }

  /** Автомат взрывается: белая вспышка на весь вид и огненные шары из экрана в разные стороны. */
  explode(): void {
    const flash = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0xffffff, 0.9).setDepth(POPUP_DEPTH + 1);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: EXPLOSION_FLASH_TIME, onComplete: () => flash.destroy() });
    for (let index = 0; index < EXPLOSION_BALLS; index++) {
      const radius = Phaser.Math.RND.between(14, 30);
      const color = Phaser.Math.RND.pick(EXPLOSION_COLORS);
      const ball = this.scene.add.circle(SCREEN.x, SCREEN.y, radius, color, 0.95).setDepth(POPUP_DEPTH);
      const angle = Phaser.Math.RND.realInRange(0, Math.PI * 2);
      const distance = Phaser.Math.RND.between(EXPLOSION_MIN_DISTANCE, EXPLOSION_MAX_DISTANCE);
      this.scene.tweens.add({
        targets: ball,
        x: SCREEN.x + distance * Math.cos(angle),
        y: SCREEN.y + distance * Math.sin(angle) * 0.8,
        scale: { from: 0.6, to: 2.6 },
        alpha: 0,
        duration: Phaser.Math.RND.between(EXPLOSION_MIN_TIME, EXPLOSION_MAX_TIME),
        ease: 'Cubic.easeOut',
        onComplete: () => ball.destroy(),
      });
    }
  }

  /** Заголовок на экране автомата (KABOOM) тает, экран снова горит. Пусто — ничего не делает. */
  clearGoodLuck(): void {
    const parts = this.goodLuck;
    if (parts.length === 0) return;
    this.goodLuck = [];
    this.scene.tweens.killTweensOf(parts);
    this.scene.tweens.add({ targets: parts, alpha: 0, duration: GOOD_LUCK_FADE_TIME, onComplete: () => parts.forEach((part) => part.destroy()) });
  }

  /**
   * Короткая заставка на экране автомата: строки идут по очереди — чёрный экран, мигающая LED-надпись (тот же вид,
   * что у KABOOM), строка держится и гаснет, встаёт следующая. После последней гаснет и экран, потом done().
   * Длинная строка ужимается по ширине экрана. Пока заставка идёт, ввод держит закрытым сцена (раунд спасения, шаг 32).
   * options: hold — сколько строка держится (по умолчанию SCREEN_LINE_HOLD), depth — слой всей заставки.
   */
  showScreenSequence(lines: readonly string[], done?: () => void, options?: { hold?: number; depth?: number }): void {
    this.sequenceHold = options?.hold ?? SCREEN_LINE_HOLD;
    this.sequenceDepth = options?.depth ?? SCREEN_TITLE_DEPTH;
    this.startSequence(lines, done ?? null, 0);
  }

  /**
   * Сменить язык прямо во время заставки (шаг 35): те же строки на новом языке, с той же строки и с тем же done.
   * Заставки нет — ничего не делает. Номер строки берём текущий: показ перезапускается с начала этой строки.
   */
  relabelScreenSequence(lines: readonly string[]): void {
    if (this.sequenceMode !== 'plain' || this.sequenceLines.length === 0) return;
    this.startSequence(lines, this.sequenceDone, this.sequenceIndex);
  }

  /**
   * «Богатая» заставка обучения (шаг 46а): строка рисуется из кусков своего тона, кегль крупнее, авторские '\n' —
   * единственный перенос, wordWrap не нужен. mode 'chain' — как showScreenSequence: строка держится, гаснет,
   * встаёт следующая, после последней гаснет экран и зовётся done. mode 'wait' — последняя строка остаётся висеть,
   * done зовётся сразу после её появления и снимает её только clearScreenSequence.
   * options: hold — сколько строка держится (по умолчанию TUTORIAL_LINE_HOLD), depth — слой всей заставки,
   * keepScreen — экран в конце реплики не гасить: следующая реплика очереди встанет на него же, автомат не мелькнёт.
   */
  showTutorialSequence(
    lines: readonly TutorialLine[],
    done?: () => void,
    options?: { hold?: number; depth?: number; mode?: 'chain' | 'wait'; keepScreen?: boolean },
  ): void {
    this.sequenceHold = options?.hold ?? TUTORIAL_LINE_HOLD;
    this.sequenceDepth = options?.depth ?? SCREEN_TITLE_DEPTH;
    this.startTutorialSequence(lines, done ?? null, 0, options?.mode ?? 'chain', options?.keepScreen ?? false);
  }

  /**
   * Сменить язык прямо во время заставки обучения: те же строки на новом языке, с той же строки, с тем же done
   * и тем же режимом. Заставки обучения нет — ничего не делает.
   */
  relabelTutorialSequence(lines: readonly TutorialLine[]): void {
    if (this.sequenceMode !== 'tutorial' || this.tutorialLines.length === 0) return;
    this.startTutorialSequence(lines, this.sequenceDone, this.sequenceIndex, this.tutorialMode, this.sequenceKeepScreen);
  }

  /** Пуск заставки с строки from. Вызывают showScreenSequence (с нуля) и relabelScreenSequence (с текущей). */
  private startSequence(lines: readonly string[], done: (() => void) | null, from: number): void {
    this.clearScreenSequence(); // прошлая заставка (если была) убирается целиком, вместе с её таймерами
    const token = this.sequenceToken;
    this.sequenceLines = lines;
    this.sequenceIndex = Math.min(Math.max(0, from), lines.length);
    this.sequenceDone = done;
    const screen = this.scene.add
      .rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000)
      .setRounded(16)
      .setDepth(this.sequenceDepth);
    this.screenSequence = [screen];
    let index = this.sequenceIndex;
    const next = (): void => {
      if (token !== this.sequenceToken) return; // заставку сняли — дальше не идём
      if (index >= lines.length) {
        this.sequenceLines = [];
        this.sequenceDone = null;
        this.scene.tweens.add({
          targets: screen,
          alpha: 0,
          duration: SCREEN_LINE_FADE,
          onComplete: () => {
            screen.destroy();
            if (token === this.sequenceToken) this.screenSequence = [];
            done?.();
          },
        });
        return;
      }
      const text = lines[index];
      this.sequenceIndex = index; // эта строка на экране: смена языка вернётся к ней же
      index += 1;
      // Кегль один у всех строк, длинная переносится по словам и читается целиком на экране 460×288.
      const title = addText(this.scene, SCREEN.x, SCREEN.y, text, {
        ...SCREEN_TITLE_STYLE,
        fontSize: `${SCREEN_LINE_FONT}px`,
        align: 'center',
        wordWrap: { width: SCREEN_LINE_MAX_WIDTH },
      })
        .setOrigin(0.5)
        .setDepth(this.sequenceDepth);
      this.screenSequence = [screen, title];
      const blink = this.scene.tweens.add({ targets: title, alpha: 0.3, duration: TITLE_BLINK_TIME, yoyo: true, repeat: -1 });
      this.sequenceTimers.push(this.scene.time.delayedCall(lineHoldFor(text, this.sequenceHold), () => {
        if (token !== this.sequenceToken) return;
        blink.remove();
        this.scene.tweens.add({
          targets: title,
          alpha: 0,
          duration: SCREEN_LINE_FADE,
          onComplete: () => {
            title.destroy();
            this.sequenceTimers.push(this.scene.time.delayedCall(SCREEN_LINE_GAP, next));
          },
        });
      }));
    };
    next();
  }

  /** Пуск заставки обучения с строки from. Вызывают showTutorialSequence (с нуля) и relabelTutorialSequence (с текущей). */
  private startTutorialSequence(
    lines: readonly TutorialLine[],
    done: (() => void) | null,
    from: number,
    mode: 'chain' | 'wait',
    keepScreen: boolean,
  ): void {
    // Экран прошлой реплики очереди не гаснет: следующая реплика говорит на нём же, и автомат между ними
    // не мелькает. Его держим в стороне от clearScreenSequence, которая снимает заставку целиком.
    const kept = this.sequenceKeepScreen ? this.sequenceScreen : null;
    if (kept) this.screenSequence = this.screenSequence.filter((part) => part !== kept);
    this.clearScreenSequence();
    const token = this.sequenceToken;
    this.sequenceMode = 'tutorial';
    this.tutorialMode = mode;
    this.sequenceKeepScreen = keepScreen;
    this.tutorialLines = lines;
    this.sequenceIndex = Math.min(Math.max(0, from), lines.length);
    this.sequenceDone = done;
    const screen =
      kept ??
      this.scene.add
        .rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000)
        .setRounded(SCREEN_ROUNDING)
        .setDepth(this.sequenceDepth);
    screen.setDepth(this.sequenceDepth);
    this.sequenceScreen = screen;
    this.screenSequence = [screen];
    let index = this.sequenceIndex;
    const next = (): void => {
      if (token !== this.sequenceToken) return; // заставку сняли — дальше не идём
      if (index >= lines.length) {
        this.tutorialLines = [];
        this.sequenceDone = null;
        // keepScreen: экран остаётся чёрным до следующей реплики очереди (её пуск возьмёт его же),
        // последняя реплика гасит его как обычно.
        if (keepScreen) {
          done?.();
          return;
        }
        this.scene.tweens.add({
          targets: screen,
          alpha: 0,
          duration: SCREEN_LINE_FADE,
          onComplete: () => {
            screen.destroy();
            if (token === this.sequenceToken) {
              this.screenSequence = [];
              this.sequenceScreen = null;
            }
            done?.();
          },
        });
        return;
      }
      const line = lines[index];
      this.sequenceIndex = index; // эта строка на экране: смена языка вернётся к ней же
      index += 1;
      const texts = this.drawTutorialLine(line);
      this.screenSequence = [screen, ...texts];
      // Последняя строка в режиме wait остаётся висеть: done зовём сразу после её появления,
      // снимает её потом clearScreenSequence.
      if (mode === 'wait' && index >= lines.length) {
        this.sequenceDone = null;
        done?.();
        return;
      }
      this.sequenceTimers.push(
        this.scene.time.delayedCall(tutorialLineHold(line, this.sequenceHold), () => {
          if (token !== this.sequenceToken) return;
          if (texts.length === 0) {
            // Пустая строка (одни отступы) — гасить нечего, держим паузу и идём дальше.
            this.sequenceTimers.push(this.scene.time.delayedCall(SCREEN_LINE_GAP, next));
            return;
          }
          this.scene.tweens.add({
            targets: texts,
            alpha: 0,
            duration: SCREEN_LINE_FADE,
            onComplete: () => {
              for (const text of texts) text.destroy();
              this.sequenceTimers.push(this.scene.time.delayedCall(SCREEN_LINE_GAP, next));
            },
          });
        }),
      );
    };
    next();
  }

  /**
   * Нарисовать строку обучения: куски — свои Text со своим тоном, ряды — авторские '\n'. Блок центрируется
   * по SCREEN.y, каждый ряд — по SCREEN.x, куски идут слева-направо. Если самый широкий ряд шире экрана,
   * кегль уменьшается до TUTORIAL_SCREEN_FONT_MIN, затем ряд ужимается по X масштабом.
   */
  private drawTutorialLine(line: TutorialLine): Phaser.GameObjects.Text[] {
    const rows = tutorialLineRows(line);
    const rowTexts: Phaser.GameObjects.Text[][] = rows.map((row) =>
      row
        .filter((segment) => segment.text.length > 0)
        .map((segment) => this.tutorialText(segment.text, segment.tone)),
    );
    const texts = rowTexts.flat();
    const widthOf = (row: readonly Phaser.GameObjects.Text[]): number => row.reduce((sum, text) => sum + text.width, 0);
    const widest = (): number => rowTexts.reduce((wide, row) => Math.max(wide, widthOf(row)), 0);
    let fontSize = TUTORIAL_SCREEN_FONT;
    for (const text of texts) text.setFontSize(fontSize);
    const refresh = (): void => {
      for (const text of texts) text.updateText();
    };
    refresh();
    while (widest() > TUTORIAL_SCREEN_MAX_WIDTH && fontSize > TUTORIAL_SCREEN_FONT_MIN) {
      fontSize -= 1;
      for (const text of texts) text.setFontSize(fontSize);
      refresh();
    }
    const scaleX = widest() > TUTORIAL_SCREEN_MAX_WIDTH ? TUTORIAL_SCREEN_MAX_WIDTH / widest() : 1;
    const rowHeight = texts.length > 0 ? Math.max(...texts.map((text) => text.height)) : TUTORIAL_EMPTY_ROW_HEIGHT;
    const step = rowHeight + TUTORIAL_ROW_GAP;
    const blockHeight = (rows.length - 1) * step + rowHeight;
    let y = SCREEN.y - blockHeight / 2 + rowHeight / 2;
    for (const row of rowTexts) {
      let x = SCREEN.x - (widthOf(row) * scaleX) / 2;
      for (const text of row) {
        text.setScale(scaleX, 1).setPosition(x, y);
        x += text.width * scaleX;
      }
      y += step;
    }
    return texts;
  }

  /** Одна надпись «богатой» строки: кегль обучения, цвет и свечение своего тона. */
  private tutorialText(text: string, tone: ScreenTone): Phaser.GameObjects.Text {
    const color = SCREEN_TONE_COLORS[tone];
    return addText(this.scene, SCREEN.x, SCREEN.y, text, {
      ...LED_STYLE,
      fontSize: `${TUTORIAL_SCREEN_FONT}px`,
      color,
      shadow: { color, blur: SCREEN_TONE_BLUR[tone], fill: true },
    })
      .setOrigin(0, 0.5)
      .setDepth(this.sequenceDepth);
  }

  /**
   * Погасить чёрный экран, оставшийся между репликами очереди (keepScreen), обычным фейдом — так кончается последняя
   * реплика. Пуск следующей реплики экран не гасит: она забирает его себе, и автомат между ними не мелькает.
   */
  fadeScreenSequence(done?: () => void): void {
    const screen = this.sequenceScreen;
    this.sequenceKeepScreen = false;
    if (!screen) {
      done?.();
      return;
    }
    this.sequenceScreen = null;
    this.screenSequence = this.screenSequence.filter((part) => part !== screen);
    this.scene.tweens.add({
      targets: screen,
      alpha: 0,
      duration: SCREEN_LINE_FADE,
      onComplete: () => {
        screen.destroy();
        done?.();
      },
    });
  }

  /**
   * Заставку снять сразу: её твины, картинки и отложенные шаги уничтожаются, done не зовётся. В режиме обучения
   * снимаются все куски строки и чёрный экран — так же, как простая заставка.
   * Таймеры снимаем по-настоящему: иначе они доживают до срока и зовут next по снятой заставке (шаг 35).
   */
  clearScreenSequence(): void {
    this.sequenceToken += 1;
    for (const timer of this.sequenceTimers) timer.remove(false);
    this.sequenceTimers = [];
    this.scene.tweens.killTweensOf(this.screenSequence);
    for (const part of this.screenSequence) part.destroy();
    this.screenSequence = [];
    this.sequenceLines = [];
    this.sequenceIndex = 0;
    this.sequenceDone = null;
    this.sequenceMode = 'plain';
    this.tutorialLines = [];
    this.tutorialMode = 'chain';
    this.sequenceScreen = null;
    this.sequenceKeepScreen = false;
  }

  /** Чёрный экран автомата с мигающей надписью text на слое depth. look — цвет и размер надписи (KABOOM красный, ПОБЕДА золотая). */
  private screenTitle(
    text: string,
    depth: number,
    look: Phaser.Types.GameObjects.Text.TextStyle = SCREEN_TITLE_STYLE,
  ): (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] {
    // Чуть меньше окна экрана: лампочки по его краю остаются видны — чёрный экран не выглядит накладкой поверх них (DONTLIKE п.6).
    const screen = this.scene.add.rectangle(SCREEN.x, SCREEN.y, SCREEN.width - SCREEN_LAMP_INSET * 2, SCREEN.height - SCREEN_LAMP_INSET * 2, 0x000000).setRounded(12);
    const title = addText(this.scene, SCREEN.x, SCREEN.y, text, look).setOrigin(0.5);
    for (const part of [screen, title]) part.setDepth(depth);
    this.scene.tweens.add({ targets: title, alpha: 0.3, duration: TITLE_BLINK_TIME, yoyo: true, repeat: -1 }); // мигает
    return [screen, title];
  }

  /** Конец забега: камера трясётся и гаснет. В темноте — dark() (экран DEATH), потом экран загорается. */
  blackout(dark: () => void): void {
    const camera = this.scene.cameras.main;
    camera.shake(300, 0.01);
    camera.fadeOut(BLACKOUT_TIME, 0, 0, 0);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.atm.hide();
      dark();
      camera.fadeIn(BLACKOUT_TIME);
    });
  }

  /** Конец забега: всё темнеет, на экране автомата мигает KABOOM. Больше на экране ничего: ни плиты с итогами,
   *  ни «ЗАНОВО» — дальше ведёт выбор улучшения (DONTLIKE п.1). Кнопка появляется только если улучшать нечего.
   *  title = null — экран смерти без KABOOM: так идёт обучение первой смерти, строки учат без мигающей надписи. */
  showDeath(restart: () => void, title: string | null): void {
    this.deathRestart = restart;
    const shade = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0x000000, 0.6); // на весь вид у автомата
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    for (const part of [shade]) part.setDepth(GAME_OVER_DEPTH);
    if (title) this.screenTitle(title, GAME_OVER_DEPTH);
  }

  /**
   * KABOOM на уже показанном экране смерти: нужен после строк обучения, если улучшать оказалось нечего.
   * Первый раз экран смерти показывают без заголовка (showDeath(..., null)) — тогда надпись появляется здесь.
   */
  showDeathTitle(title: string): void {
    this.screenTitle(title, GAME_OVER_DEPTH);
  }

  /** Показать «ЗАНОВО» на экране смерти: улучшать больше нечего, иначе новый забег начать нечем. */
  showRestartButton(): void {
    const restart = this.deathRestart;
    if (!restart) return;
    this.deathRestart = null;
    const button = this.makeButton(CENTER_X, DEATH_BUTTON_Y, t('again'), restart);
    for (const part of [button.shadow, button.face]) part.setDepth(BUTTON_DEPTH); // кнопка выше тени — она нажимается
  }

  /**
   * Победа: за забег набрано 1 000 000 (CHIP_GOAL). Тот же вид, что у экрана DEATH, только экран автомата цел: на нём золотая
   * «ПОБЕДА», ниже набранное и рекорд забегов, внизу «ЗАНОВО» и «ДАЛЬШЕ» — второй продолжает тот же забег уже
   * с целью 10 000 000. Вернёт уборку экрана: её зовёт «ДАЛЬШЕ», чтобы вернуться в игру.
   */
  showVictory(earned: number, record: number, again: () => void, next: () => void): () => void {
    const left = CENTER_X - BUTTON_STEP / 2;
    const right = CENTER_X + BUTTON_STEP / 2;
    return this.finishScreen(t('victory'), VICTORY_TITLE_STYLE, earned, record, [
      this.makeButton(left, DEATH_BUTTON_Y, t('again'), again),
      this.makeButton(right, DEATH_BUTTON_Y, t('continueRun'), next),
    ]);
  }

  /**
   * Рекорд: за забег набрано 10 000 000 (CHIP_RECORD) — вторая и последняя ступень. Вид тот же, что у победы,
   * только заголовок «РЕКОРД» и одна кнопка «ЗАНОВО»: дальше цели нет.
   */
  showRecord(earned: number, record: number, again: () => void): void {
    this.finishScreen(t('record'), VICTORY_TITLE_STYLE, earned, record, [this.makeButton(CENTER_X, DEATH_BUTTON_Y, t('again'), again)]);
  }

  /** Общий вид экрана конца забега: затемнение, заголовок на экране автомата, итоги на плите и кнопки. Вернёт уборку. */
  private finishScreen(
    title: string,
    look: Phaser.Types.GameObjects.Text.TextStyle,
    earned: number,
    record: number,
    buttons: Button[],
  ): () => void {
    const shade = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0x000000, 0.6); // на весь вид у автомата
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const plate = this.endPlate(); // та же плита: итоги на полоске, кнопки ниже
    const scoreText = t('victoryScore', formatChips(earned), formatChips(record));
    const score = this.scoreLine(scoreText);
    const parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | Phaser.GameObjects.Container)[] = [
      shade,
      plate,
      score,
    ];
    for (const button of buttons) parts.push(button.shadow, button.face);
    for (const part of parts) part.setDepth(GAME_OVER_DEPTH);
    // Кнопки — выше затемнения: оно ловит клики, но не должно забирать их у кнопок. Итоги — поверх плиты (созданы после неё).
    for (const button of buttons) button.face.setDepth(BUTTON_DEPTH);
    const titleParts = this.screenTitle(title, GAME_OVER_DEPTH, look);
    // «ДАЛЬШЕ» убирает экран: твин мигания останавливаем, иначе он остался бы висеть на уничтоженной надписи.
    return () => {
      this.scene.tweens.killTweensOf(titleParts);
      for (const part of [...parts, ...titleParts]) part.destroy();
    };
  }

  /**
   * Плита конца забега: тёмная бронза вместо окон корпуса (множитель, окошко выплаты) и гравированная полоска
   * с итогами. Плита лежит на панели под экраном — ничего не перекрывает и не «висит» на «×1».
   */
  private endPlate(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    const left = CENTER_X - END_PLATE.width / 2;
    const top = END_PLATE.y - END_PLATE.height / 2;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(left + 3, top + 4, END_PLATE.width, END_PLATE.height, END_PLATE.radius); // тень на корпусе
    g.fillStyle(END_PLATE_FILL, 0.97);
    g.fillRoundedRect(left, top, END_PLATE.width, END_PLATE.height, END_PLATE.radius);
    g.lineStyle(1.5, BUTTON_BORDER, 0.5); // бронзовая кромка, как у окантовки автомата
    g.strokeRoundedRect(left + 0.75, top + 0.75, END_PLATE.width - 1.5, END_PLATE.height - 1.5, END_PLATE.radius);
    g.fillStyle(0xffffff, 0.05); // светлая верхняя кромка плиты
    g.fillRect(left + END_PLATE.radius, top + 1, END_PLATE.width - END_PLATE.radius * 2, 1);
    const stripLeft = CENTER_X - END_STRIP.width / 2;
    const stripTop = END_STRIP.y - END_STRIP.height / 2;
    g.fillStyle(0x000000, 0.4); // утопленная полоска под итоги
    g.fillRoundedRect(stripLeft, stripTop, END_STRIP.width, END_STRIP.height, END_STRIP.radius);
    g.lineStyle(1, 0x000000, 0.55);
    g.strokeRoundedRect(stripLeft + 0.5, stripTop + 0.5, END_STRIP.width - 1, END_STRIP.height - 1, END_STRIP.radius);
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(stripLeft + END_STRIP.radius, stripTop + 1, END_STRIP.width - END_STRIP.radius * 2, 1);
    return g;
  }

  /** Итоги забега на гравированной полоске: одна строка золотом, по ширине полоски. */
  private scoreLine(text: string): Phaser.GameObjects.Text {
    const score = addText(this.scene, CENTER_X, END_STRIP.y, text, {
      fontSize: `${SCORE_FONT}px`,
      color: GOLD_TEXT,
      shadow: { color: '#000000', blur: 3, fill: true },
    }).setOrigin(0.5);
    fitTextWidth(score, text, END_STRIP.width - 24, SCORE_FONT, 11);
    return score;
  }

  /** Кнопка: тень, корпус с золотой рамкой, блик сверху и крупная надпись. Нажимается и мышью, и пальцем. */
  private makeButton(x: number, y: number, text: string, onPress: () => void): Button {
    const shadow = this.scene.add.rectangle(x, y + BUTTON_SHADOW, BUTTON_WIDTH, BUTTON_HEIGHT, 0x000000, 0.45).setRounded(18);
    // Всё остальное рисуем относительно центра кнопки и кладём в контейнер.
    const box = this.scene.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_COLOR)
      .setRounded(18)
      .setStrokeStyle(3, BUTTON_BORDER);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', onPress);
    const gloss = this.scene.add
      .rectangle(0, -BUTTON_HEIGHT / 4, BUTTON_WIDTH - 16, BUTTON_HEIGHT / 2 - 8, 0xffffff, 0.16)
      .setRounded(12);
    const label = addText(this.scene, 0, 0, text, {
      fontSize: '22px',
      fontStyle: 'bold',
      stroke: 'rgba(0, 0, 0, 0.35)',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const face = this.scene.add.container(x, y, [box, gloss, label]);
    return { shadow, face };
  }
}

/** Процент цели до десятых: «18,4%» по-русски и «18.4%» по-английски — так число на записке не выглядит опечаткой. */
function formatShare(share: number): string {
  const value = (share * 100).toFixed(1);
  return lang() === 'ru' ? value.replace('.', ',') : value;
}
