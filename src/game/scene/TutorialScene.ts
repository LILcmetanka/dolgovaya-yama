import { t, type TextKey } from '../lang';
import { isActionsUnlocked, isTutorialDone, markDarknessDone, markTutorialDone, setTutorialStep, tutorialStep } from '../progress';
import type { Grid } from '../rules';
import {
  ACTIONS_LINES,
  introSteps,
  tutorialGrid,
  TUTORIAL_LINE_HOLD,
  type IntroStep,
  type TutorialLine,
  type TutorialSpin,
} from '../tutorial';
import { MachineScene } from './MachineScene';

// Номера особых битов берутся из самих данных интро (openNote, clearDark, id 'places'), а не копируются числом:
// поменяли порядок битов в tutorial.ts — сцена читает то же место, что и тест. Бита нет — безопасное поведение:
// записка не открывается никогда, тьму гасит только Коллектор, полка предметов видна сразу.
// Запас страховочного таймера поверх времени строк: строка гаснет и встаёт следующая не мгновенно.
const TUTORIAL_GUARD_MS = 4000;

/** Чего обучение ждёт прямо сейчас: ничего (идёт текст или пауза), рычага или «забрать». */
type TutorialPhase = 'idle' | 'waitSpin' | 'waitTake';

/**
 * Слой обучения текстами (шаг «обучение текстами», партия 2). Пока идёт первый забег новичка, Диллер говорит
 * строками на экране автомата, а автомат показывает заранее собранные сетки (`tutorial.ts`): новичок видит
 * ровно то, о чём идёт речь. Биты идут по порядку, шаг каждого запоминается (progress.tutorial.intro):
 * после перезагрузки обучение продолжается с того же места.
 *
 * Слой стоит между MachineScene и RoundScene: сетку для прокрутки и итог прокрутки знает RoundScene,
 * а «что сказать и чего ждать» — только здесь. Пока идёт текст или пауза, крутить и забирать нельзя
 * (canUseActions), а на бите «забрать» рычаг закрыт ещё и отдельно (tutorialCanSpin): забрать можно, крутить нет.
 * Ранняя оплата долга тоже ждёт (canPayEarly). Таймеры — на this.time: пауза игры их морозит.
 */
export abstract class TutorialScene extends MachineScene {
  /** Биты интро: перечитываются на новый забег — от числа гнёзд зависит последний бит. */
  protected intro: readonly IntroStep[] = [];
  protected introStep = 0; // какой бит идёт сейчас: столько же лежит в progress (tutorial.intro)
  // Поле называется tutorialPhase, а не phase: phase в BaseScene — фаза забега (phases.ts), имена не совпадают.
  protected tutorialPhase: TutorialPhase = 'idle';
  protected armed: TutorialSpin | null = null; // какую сетку подложить в следующую прокрутку
  protected busy = false; // на экране идёт текст обучения: ввод ждёт
  // Поколение обучения: сброс забега его двигает, и запоздавшие таймеры старого обучения молча гаснут
  // (так же работает revealId у показа выигрыша).
  protected generation = 0;
  protected introDone = false; // обучение в этом забеге уже закрыто: текст больше не мешает
  // Поколение речи: каждая новая строка его двигает, и запоздавший done (заставка, страховка) прошлой речи молчит.
  // Без него строка прошлого бита могла лечь поверх нового и снова закрыть ввод (замечание автора 24.11).
  private talkToken = 0;
  private talkTimer: Phaser.Time.TimerEvent | null = null; // страховая задержка текущей речи
  private enterTimer: Phaser.Time.TimerEvent | null = null; // пауза перед текстом текущего бита

  /** Новый забег: биты читаются заново, шаг — из прогресса (после перезагрузки обучение продолжается). */
  protected resetState(): void {
    super.resetState();
    this.intro = introSteps(this.sockets);
    this.introStep = tutorialStep('intro');
    this.introDone = isTutorialDone();
    this.busy = false;
    this.armed = null;
    this.tutorialPhase = 'idle';
    this.generation += 1; // таймеры прошлой сцены больше не наши
    this.talkToken += 1; // и недоигранная речь тоже
    this.talkTimer = null;
    this.enterTimer = null;
  }

  /** Обучение идёт прямо сейчас: не пройдено, не закрыто в этом забеге и биты ещё есть. */
  protected tutorialActive(): boolean {
    return !isTutorialDone() && !this.introDone && this.introStep < this.intro.length;
  }

  /** Текущий бит интро: null — обучение кончилось. */
  protected tutorialCurrent(): IntroStep | null {
    return this.intro[this.introStep] ?? null;
  }

  /** Сейчас идёт бит с таким id? */
  protected tutorialIsStep(id: string): boolean {
    return this.tutorialCurrent()?.id === id;
  }

  /** Номер бита, который открывает записку с долгом: -1 — такого бита нет (записка не проступает никогда). */
  private noteStep(): number {
    return this.intro.findIndex((step) => step.openNote === true);
  }

  /** Номер бита, на котором гаснет тьма первого забега: -1 — в интро она не гаснет (погасит Коллектор). */
  private darkOffStep(): number {
    return this.intro.findIndex((step) => step.clearDark === true);
  }

  /** Номер бита «Это места под предметы»: -1 — полка предметов видна сразу. */
  private placesStep(): number {
    return this.intro.findIndex((step) => step.id === 'places');
  }

  /**
   * Забег пошёл: если обучение ещё не пройдено — начинаем (или продолжаем) интро. Зовёт GameScene.beginRunPlay
   * после всех выборов старта: к этому моменту прокрутки и рычаг уже на месте.
   * Интро позади — на первом забеге с открытыми действиями Диллер ещё объясняет полку действий (tutorialActionsIntro).
   */
  protected tutorialOnRunStart(): void {
    this.tutorialShelfSync(); // обучение не пройдено — полки на стене ещё нет
    if (this.tutorialActive()) {
      this.introStep = tutorialStep('intro'); // другая вкладка могла уйти вперёд
      this.tutorialEnter();
      return;
    }
    this.tutorialActionsIntro();
  }

  /**
   * Действия между прокрутками: строки дорожки actions идут в начале первого забега, где полка уже открыта
   * (первая смерть позади). Ввод на время текста закрыт (busy): иначе рычаг начал бы прокрутку, а её итог
   * (новая новость, спасение) снял бы недоигранные строки. После текста обучение кончено — мастер-флаг ставится
   * здесь: больше надписей не будет. Это одно из двух мест, где он вообще ставится (второе — finishTutorial).
   */
  private tutorialActionsIntro(): void {
    // Мастер-флаг = «обучение пропущено целиком»: старые сохранения и браузерные сценарии с tutorialDone
    // новых строк не видят вовсе.
    if (isTutorialDone() || !isActionsUnlocked() || tutorialStep('actions') !== 0) return;
    // Дорожка действий ждёт дорожку смерти: после отката кассетой в спасении первого забега полка уже открыта,
    // и шесть строк действий без этой проверки встали бы раньше семи строк смерти и поставили мастер-флаг —
    // строк смерти не было бы никогда. Не пришло время — строки ждут следующего забега.
    if (tutorialStep('death') === 0) return;
    this.tutorialTalkKeys(ACTIONS_LINES, () => {
      setTutorialStep('actions', 1);
      markTutorialDone();
    });
    this.refreshHud(); // кнопки гаснут сразу: ввод закрыт на всё время текста
  }

  /**
   * Вход в текущий бит: эффекты (тьма, записка, полка, последняя прокрутка), пауза перед текстом, сам текст
   * и только потом — подсветка «забрать» и то, чего бит ждёт. Всё, что могло случиться до перезагрузки,
   * доводится до нужного вида.
   */
  protected tutorialEnter(): void {
    this.tutorialShelfSync(); // «Это места под предметы» — с этого бита полки видно
    const step = this.tutorialCurrent();
    if (!step) return;
    const gen = this.generation;
    // Бит входит в работу чистым листом: речь прошлого бита (если её не дождались) снимается вместе с таймерами,
    // на экране автомата ничего не остаётся, и ввод снова закрыт. Бит начнёт ждать рычага или «забрать» только
    // после своего текста (next), а не с первого мгновения — пауза перед текстом тоже держит ввод.
    this.tutorialCancelTalk();
    this.tutorialPhase = 'idle';
    this.refreshHud();
    // Самопочинка: сцена могла перезапуститься посреди обучения — тьма и записка должны быть на своём месте.
    const darkOff = this.darkOffStep();
    const noteStep = this.noteStep();
    if (darkOff >= 0 && this.introStep >= darkOff) this.finishDarkness();
    else if (noteStep >= 0 && this.introStep >= noteStep) this.reveal?.openNote();
    // Бит «забрать», а кон уже забран (пересёкся с перезагрузкой): ждать клика нечего — идём дальше.
    if (step.wait === 'take' && this.pot <= 0) {
      this.tutorialAdvance();
      return;
    }
    // Последний бит: прокрутка остаётся одна, лишние лампочки гаснут — иначе раунд кончился бы на обучении.
    // В обычном течении интро тратит 9 прокруток из 12, а остальные биты («забрать» и три без нажатия) счёт не
    // трогают. Но игрок мог накрутить лишние между битами: тогда упёршийся в ноль счётчик вернёт одну, чтобы
    // обучение не оборвалось на середине.
    if (step.lastSpin || this.spinsLeft <= 0) {
      this.spinsLeft = 1;
      this.panel.showSpinsLeft(this.spinsLeft);
    }
    // После текста бит начинает ждать: рычага или «забрать». До этого ввод закрыт (tutorialBlocks).
    const next = (): void => {
      if (gen !== this.generation || !this.scene.isActive()) return;
      // К этому мгновению на экране автомата не остаётся ничего: ни строки, ни чёрной плашки. Снимаем заставку
      // явно, а не «как получится»: бит ждёт рычага уже на чистом экране (замечание автора 24.11).
      this.collector.clearScreenSequence();
      // Бит без нажатия («Телевизор», «не 1.000.000», места под предметы) сам передаёт эстафету следующему:
      // по сценарию автора игрок здесь ничего не крутит. Фаза гасится заранее, чтобы пауза перед следующим
      // текстом не оставила рычаг живым.
      if (step.wait === 'none') {
        this.armed = null;
        this.tutorialPhase = 'idle';
        this.refreshHud();
        this.tutorialAdvance();
        return;
      }
      this.armed = step.spin ?? null;
      this.tutorialPhase = step.wait === 'take' ? 'waitTake' : 'waitSpin';
      this.refreshHud(); // ввод открылся: кнопка «забрать» снова живая, а не полупрозрачная
      // Подсветка «забрать» включается здесь, а не раньше: refreshHud → payout.setEnabled(false) гасит её,
      // пока ввод закрыт, и включённая на входе в бит она бы не дожила до конца текста.
      if (step.pulseTake) this.payout.highlightTake(true);
    };
    const delay = step.pause ?? 0;
    if (delay <= 0) {
      this.tutorialTalk(step.lines, next);
      return;
    }
    this.enterTimer = this.time.delayedCall(delay, () => {
      this.enterTimer = null;
      if (gen !== this.generation || !this.scene.isActive()) return;
      this.tutorialTalk(step.lines, next);
    });
  }

  /**
   * Снять речь обучения: строка и чёрная плашка (если ещё идут), их твины и таймеры гаснут, ввод снова свободен.
   * Запоздавшая речь прошлой сцены или прошлого бита зовёт свой done впустую — поколение речи уже другое.
   */
  private tutorialCancelTalk(): void {
    this.talkToken += 1;
    this.talkTimer?.remove(false);
    this.talkTimer = null;
    this.enterTimer?.remove(false);
    this.enterTimer = null;
    this.busy = false;
    this.collector.clearScreenSequence();
  }

  /**
   * Полка предметов: по сценарию автора ячейки на стене открываются на бите «Это места под предметы» — после
   * прокрутки на «Твоя цель», а не вместе с гашением тьмы на телевизоре. Пока обучение не дошло до этого бита,
   * полки нет совсем (и клики сквозь неё не проходят — ItemShelf.setHidden); обучение пройдено — видна всегда.
   * Состояние считается из introStep, поэтому после перезагрузки посреди обучения полка встаёт на своё место.
   */
  private tutorialShelfSync(): void {
    const places = this.placesStep();
    // Бита «места под предметы» нет — прятать полку нечем, она видна сразу.
    this.itemShelf.setHidden(places >= 0 && this.tutorialActive() && this.introStep < places);
  }

  /** Бит пройден: шаг запоминается (пройденное не откатывается), дальше — следующий бит. */
  protected tutorialAdvance(): void {
    this.introStep += 1;
    setTutorialStep('intro', this.introStep);
    this.tutorialEnter();
  }

  /**
   * Текст бита на экране автомата: строки идут по очереди (collector.showScreenSequence), ввод всё это время закрыт.
   * done придёт от заставки; защитный таймер зовёт его, если заставка почему-то не позвала (обучение не должно встать
   * намертво). Пустые строки — бит без текста, сразу дальше. Каждая речь получает своё поколение: если её сменила
   * другая (новый бит, новая дорожка), запоздавший done молчит и не переносит ввод на чужой бит.
   */
  protected tutorialTalk(lines: readonly TutorialLine[], done: () => void): void {
    const gen = this.generation;
    this.talkToken += 1;
    const token = this.talkToken;
    this.talkTimer?.remove(false); // страховая задержка прошлой речи больше не нужна
    this.talkTimer = null;
    let finished = false;
    const finish = (): void => {
      if (finished || token !== this.talkToken) return; // заставка и страховка зовут одно и то же; чужая речь — мимо
      finished = true;
      this.talkTimer?.remove(false);
      this.talkTimer = null;
      if (gen !== this.generation || !this.scene.isActive()) return; // сцена перезапустилась: это уже не наше обучение
      this.busy = false;
      done();
    };
    const texts = lines.map((line) => t(line.key, ...(line.args ?? [])));
    if (texts.length === 0) {
      done(); // бит без строк (строки кончились) сразу идёт дальше
      return;
    }
    this.busy = true;
    this.collector.showScreenSequence(texts, finish, { hold: TUTORIAL_LINE_HOLD });
    this.talkTimer = this.time.delayedCall(texts.length * TUTORIAL_LINE_HOLD + TUTORIAL_GUARD_MS, finish);
  }

  /**
   * Готовая дорожка текстов (список ключей) на экране автомата — те же правила, что у строк бита: держится
   * TUTORIAL_LINE_HOLD, ввод на это время закрыт. Этой дверью говорят спасение, победа в нём, смерть и действия.
   */
  protected tutorialTalkKeys(keys: readonly TextKey[], done: () => void): void {
    this.tutorialTalk(keys.map((key) => ({ key })), done);
  }

  /** Ввод ждёт обучение: идёт текст, пауза перед ним или бит ещё не начал ждать рычага/«забрать». */
  protected tutorialBlocks(): boolean {
    if (this.busy) return true; // идёт текст дорожки: он может звучать и вне интро (спасение, смерть, действия)
    if (!this.tutorialActive()) return false;
    return this.tutorialPhase !== 'waitSpin' && this.tutorialPhase !== 'waitTake';
  }

  /**
   * Сетка, которую обучение подкладывает в прокрутку: только на битах, которые ждут рычага, и только в платной
   * прокрутке (бесплатная за короны своя — черепов в ней нет). Сетка отдаётся одна: следующая прокрутка обычная.
   */
  protected tutorialTakeGrid(isFree: boolean): Grid | null {
    if (!this.tutorialActive() || this.tutorialPhase !== 'waitSpin' || isFree) return null;
    const kind = this.armed;
    // Игрок успел крутить между битами: обучение активно, но своей сетки не осталось. Пустая, а не случайная:
    // обычная сетка во время обучения может дать 🎲 или черепа и увела бы сценарий не туда.
    if (!kind) return tutorialGrid('empty');
    this.armed = null;
    return tutorialGrid(kind);
  }

  /**
   * Разрешена ли прокрутка в обучении. Нужен отдельный гейт, а не canUseActions: на бите «Забери кон» ввод
   * открыт для take(), и одна только canUseActions пропустила бы рычаг в обход обучения.
   */
  protected tutorialCanSpin(): boolean {
    return !this.tutorialActive() || this.tutorialPhase === 'waitSpin';
  }

  /** Прокрутка кончилась: бит, который её ждал, пройден. Зовёт RoundScene.finishSpinOutcome первой строкой. */
  protected tutorialSpinEnded(): void {
    if (!this.tutorialActive() || this.busy) return;
    // Двигает интро только прокрутка того бита, который её ждал: итог на бите «забрать» ничего не значит,
    // иначе бит проскакивал бы без нажатия и кон оставался бы незабранным.
    if (this.tutorialCurrent()?.wait !== 'spin') return;
    this.tutorialAdvance();
  }

  /** Кон забрали: бит «забрать» пройден — подсветка кнопки гаснет. Зовёт RoundScene.take после payPot. */
  protected tutorialPotTaken(): void {
    if (!this.tutorialActive() || !this.tutorialIsStep('take')) return;
    this.payout.highlightTake(false);
    this.tutorialAdvance();
  }

  /** Обучение закрыто в этом забеге: текст больше не мешает, мастер-флаг ставится (второе и последнее место — конец дорожки действий). */
  protected tutorialOff(): void {
    this.introDone = true;
    this.tutorialCancelTalk(); // недоигранная строка не должна пережить обучение
    this.tutorialShelfSync(); // обучение кончилось — полка предметов на месте
    this.payout.highlightTake(false); // подсветка «забрать» не должна пережить обучение
    markDarknessDone();
    markTutorialDone();
  }

  /** Коллектор пришёл за долгом, а обучение ещё шло: обучение закрывается совсем (тьма гаснет, мастер-флаг ставится). */
  protected override finishTutorial(): void {
    this.tutorialOff();
    super.finishTutorial();
  }

  /** Пока идёт текст или пауза, лишние прокрутки и действия не проходят. */
  protected override canUseActions(): boolean {
    return super.canUseActions() && !this.tutorialBlocks();
  }

  /** И ранняя оплата долга тоже ждёт: обучение ещё не дошло до неё. */
  protected override canPayEarly(): boolean {
    return super.canPayEarly() && !this.tutorialBlocks();
  }
}
