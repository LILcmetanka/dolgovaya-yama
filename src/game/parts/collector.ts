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

// Записка светится, когда долг можно отдать раньше: клик по ней или D.
const NOTE_GLOW_MIN = 0.3; // свечение пульсирует: гаснет до такой яркости и разгорается снова
const NOTE_GLOW_TIME = 700; // мс
// Надпись на чёрном экране автомата: KABOOM — конец забега. GOOD LUCK рисует банкомат (atm.ts), не эта часть.
const SCREEN_TITLE_STYLE = { ...LED_STYLE, fontSize: '64px', color: RED_TEXT, shadow: { color: '#ef4444', blur: 18, fill: true } };
// Заставка раунда спасения (шаг 32): короткие строки по очереди на том же чёрном экране. Длинная строка ужимается
// по ширине экрана: «СОБЕРИ ЛЮБОЙ ПАТТЕРН ЧТОБЫ ВЫЖИТЬ» в 64 px не влезла бы.
const SCREEN_LINE_FONT = 64;
const SCREEN_LINE_MIN_FONT = 18;
const SCREEN_LINE_MAX_WIDTH = 420; // SCREEN.width (460) минус поле по бокам
const SCREEN_LINE_HOLD = 900; // строка держится, мс
const SCREEN_LINE_FADE = 220; // и столько гаснет
const SCREEN_LINE_GAP = 120; // пауза перед следующей строкой, мс
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
// Экран DEATH: счёт и кнопка «ЗАНОВО» под экраном автомата.
const DEATH_SCORE_Y = 500;
const DEATH_BUTTON_Y = 566;
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

  /** Нарисовать записку заново по запомненным числам. */
  private redrawNote(): void {
    const paid = Math.min(1, this.noteBalance / this.noteDebt);
    const pending = Math.min(1 - paid, this.notePot / this.noteDebt);
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
   */
  showScreenSequence(lines: readonly string[], done?: () => void): void {
    this.clearScreenSequence(); // прошлая заставка (если была) убирается целиком
    const token = this.sequenceToken;
    const screen = this.scene.add
      .rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000)
      .setRounded(16)
      .setDepth(SCREEN_TITLE_DEPTH);
    this.screenSequence = [screen];
    let index = 0;
    const next = (): void => {
      if (token !== this.sequenceToken) return; // заставку сняли — дальше не идём
      if (index >= lines.length) {
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
      const text = lines[index++];
      const title = addText(this.scene, SCREEN.x, SCREEN.y, text, SCREEN_TITLE_STYLE).setOrigin(0.5).setDepth(SCREEN_TITLE_DEPTH);
      fitTextWidth(title, text, SCREEN_LINE_MAX_WIDTH, SCREEN_LINE_FONT, SCREEN_LINE_MIN_FONT); // всей строкой, без переносов
      this.screenSequence = [screen, title];
      const blink = this.scene.tweens.add({ targets: title, alpha: 0.3, duration: TITLE_BLINK_TIME, yoyo: true, repeat: -1 });
      this.scene.time.delayedCall(SCREEN_LINE_HOLD, () => {
        if (token !== this.sequenceToken) return;
        blink.remove();
        this.scene.tweens.add({
          targets: title,
          alpha: 0,
          duration: SCREEN_LINE_FADE,
          onComplete: () => {
            title.destroy();
            this.scene.time.delayedCall(SCREEN_LINE_GAP, next);
          },
        });
      });
    };
    next();
  }

  /** Заставку снять сразу: её твины и картинки уничтожаются, done не зовётся. */
  clearScreenSequence(): void {
    this.sequenceToken += 1;
    this.scene.tweens.killTweensOf(this.screenSequence);
    for (const part of this.screenSequence) part.destroy();
    this.screenSequence = [];
  }

  /** Чёрный экран автомата с мигающей надписью text на слое depth. look — цвет и размер надписи (KABOOM красный, ПОБЕДА золотая). */
  private screenTitle(
    text: string,
    depth: number,
    look: Phaser.Types.GameObjects.Text.TextStyle = SCREEN_TITLE_STYLE,
  ): (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] {
    const screen = this.scene.add.rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000).setRounded(16);
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

  /** Конец забега: всё темнеет, экран автомата чёрный, на нём мигает title (KABOOM). Ниже — счёт, рекорд и «ЗАНОВО». */
  showDeath(closedDebts: number, record: number, restart: () => void, title: string): void {
    const shade = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0x000000, 0.6); // на весь вид у автомата
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const scoreText = `${t('debtsPaid')}: ${closedDebts} · ${t('best')}: ${record}`;
    const score = addText(this.scene, CENTER_X, DEATH_SCORE_Y, scoreText, { fontSize: '20px', color: GOLD_TEXT }).setOrigin(0.5);
    const button = this.makeButton(CENTER_X, DEATH_BUTTON_Y, t('again'), restart);
    for (const part of [shade, score]) part.setDepth(GAME_OVER_DEPTH);
    for (const part of [button.shadow, button.face]) part.setDepth(BUTTON_DEPTH); // кнопка выше тени — она нажимается
    this.screenTitle(title, GAME_OVER_DEPTH);
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

  /** Общий вид экрана конца забега: затемнение, заголовок на экране автомата, набранное с рекордом и кнопки. Вернёт уборку. */
  private finishScreen(
    title: string,
    look: Phaser.Types.GameObjects.Text.TextStyle,
    earned: number,
    record: number,
    buttons: Button[],
  ): () => void {
    const shade = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0x000000, 0.6); // на весь вид у автомата
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const scoreText = t('victoryScore', formatChips(earned), formatChips(record));
    const score = addText(this.scene, CENTER_X, DEATH_SCORE_Y, scoreText, { fontSize: '20px', color: GOLD_TEXT }).setOrigin(0.5);
    const parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Container)[] = [shade, score];
    for (const button of buttons) parts.push(button.shadow, button.face);
    for (const part of parts) part.setDepth(GAME_OVER_DEPTH);
    // Кнопки — выше затемнения: оно ловит клики, но не должно забирать их у кнопок.
    for (const button of buttons) button.face.setDepth(BUTTON_DEPTH);
    const titleParts = this.screenTitle(title, GAME_OVER_DEPTH, look);
    // «ДАЛЬШЕ» убирает экран: твин мигания останавливаем, иначе он остался бы висеть на уничтоженной надписи.
    return () => {
      this.scene.tweens.killTweensOf(titleParts);
      for (const part of [...parts, ...titleParts]) part.destroy();
    };
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
