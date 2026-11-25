import type { TextKey } from '../lang';
import { isActionsUnlocked, isTutorialDone, markDarknessDone, markTutorialDone, setTutorialStep, tutorialStep } from '../progress';
import type { Grid } from '../rules';
import {
  ACTIONS_LINES,
  EARLY_PAY_LINES,
  introSteps,
  MONEY_LINES,
  tutorialGrid,
  TUTORIAL_LINE_HOLD,
  tutorialStepMode,
  tutorialTalkTime,
  type IntroStep,
  type TutorialLine,
  type TutorialSpin,
} from '../tutorial';
import { MachineScene } from './MachineScene';

// Номера особых битов берутся из самих данных интро (openNote, clearDark, id 'places'), а не копируются числом:
// поменяли порядок битов в tutorial.ts — сцена читает то же место, что и тест. Бита нет — безопасное поведение:
// записка не открывается никогда, тьму гасит только Коллектор, пятна тьмы над полками нет.
// Запас страховочного таймера поверх времени строк: строка гаснет и встаёт следующая не мгновенно.
const TUTORIAL_GUARD_MS = 4000;
// Пауза между репликами очереди (магазин: предмет, потом амулет): экран заставки остаётся чёрным, меняется только
// текст — иначе между репликами на миг виден автомат (замечание автора 25.11).
const TUTORIAL_SAY_GAP = 450;

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
  // Строки текущей речи — для смены языка на лету (toggleLanguage → relabelTutorialTexts). Пусто — заставки нет.
  protected talkLines: readonly TutorialLine[] = [];
  // Очередь коротких реплик Дилера (магазин, ранняя оплата): две реплики подряд не должны перекрыть друг друга.
  // Говорит всегда одна — следующая заступает после done. Чистится в resetState и tutorialOff.
  private sayQueue: { lines: readonly TutorialLine[]; depth?: number; done: () => void }[] = [];
  private sayRunning = false;
  private sayTimer: Phaser.Time.TimerEvent | null = null; // пауза между репликами очереди (экран остаётся чёрным)

  /** Новый забег: биты читаются заново, шаг — из прогресса (после перезагрузки обучение продолжается). */
  protected resetState(): void {
    super.resetState();
    this.intro = introSteps(); // биты — чистые данные; числа долга в тексте больше нет
    this.introStep = tutorialStep('intro');
    this.introDone = isTutorialDone();
    this.busy = false;
    this.armed = null;
    this.talkLines = [];
    this.tutorialPhase = 'idle';
    this.sayQueue = []; // недоигранные реплики прошлой сцены не переезжают в новый забег
    this.sayRunning = false;
    this.sayTimer = null;
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

  /**
   * Подсказки при наведении во время обучения не работают вовсе: пока идёт текст (busy) или обучение ещё активно,
   * табличка выдала бы наперёд то, о чём Дилер как раз говорит. После обучения подсказки снова работают.
   */
  protected tutorialHintsBlocked(): boolean {
    return this.busy || this.tutorialActive();
  }

  /** Сейчас идёт бит с таким id? */
  protected tutorialIsStep(id: string): boolean {
    return this.tutorialCurrent()?.id === id;
  }

  /** Номер бита «Это места под предметы»: -1 — пятна тьмы над полками нет, они видны сразу. */
  private placesStep(): number {
    return this.intro.findIndex((step) => step.id === 'places');
  }

  /**
   * Эффекты входа в бит по данным бита: записка с долгом и гашение тьмы. Повторный вызов безопасен
   * (reveal.openNote и finishDarkness сами не запускаются дважды) — поэтому ими же доводится самопочинка.
   */
  private tutorialApplyStep(step: IntroStep): void {
    if (step.clearDark) this.finishDarkness(); // тьма гаснет на входе в бит: её фейд успевает пройти в паузе
    if (step.openNote) this.reveal?.openNote(); // записка проступает на входе в бит — вместе с первой строкой его текста
  }

  /**
   * Забег пошёл: если обучение ещё не пройдено — начинаем (или продолжаем) интро. Зовёт GameScene.beginRunPlay
   * после всех выборов старта: к этому моменту прокрутки и рычаг уже на месте.
   * Интро позади — на первом забеге с открытыми действиями Диллер ещё объясняет полку действий (tutorialActionsIntro).
   */
  protected tutorialOnRunStart(): void {
    this.tutorialShelfSync(); // обучение не пройдено — над полками ещё тьма
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
    // Экран улучшений или конец забега: шесть строк действий ждут нового забега, а не ложатся поверх списка
    // улучшений или экрана смерти (иначе они всплывали бы раньше выбора улучшений).
    if (this.isEndScreenOpen || this.isGameOver || this.upgradeScreen.isOpen) return;
    // Мастер-флаг = «обучение пропущено целиком»: старые сохранения и браузерные сценарии с tutorialDone
    // новых строк не видят вовсе.
    if (isTutorialDone() || !isActionsUnlocked() || tutorialStep('actions') !== 0) return;
    // Дорожка действий ждёт дорожку смерти: после отката кассетой в спасении первого забега полка уже открыта,
    // и шесть строк действий без этой проверки встали бы раньше семи строк смерти и поставили мастер-флаг —
    // строк смерти не было бы никогда. Не пришло время — строки ждут следующего забега.
    if (tutorialStep('death') === 0) return;
    this.tutorialTalk(ACTIONS_LINES, () => {
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
    this.tutorialShelfSync(); // «Это места под предметы» — с этого бита полки выходят из тьмы
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
    // Биты, которые уже позади, доводятся сразу. Эффекты текущего бита — тоже на входе, до паузы: записка с долгом
    // проступает на бите debt одновременно с первой строкой «Это твой текущий ДОЛГ», а не после неё (DONTLIKE, 25.11).
    for (const past of this.intro.slice(0, this.introStep)) this.tutorialApplyStep(past);
    this.tutorialApplyStep(step);
    // Бит «забрать», а кон уже забран (пересёкся с перезагрузкой): ждать клика нечего — идём дальше.
    if (step.wait === 'take' && this.pot <= 0) {
      this.tutorialAdvance();
      return;
    }
    // Последний бит: прокрутка остаётся одна, лишние лампочки гаснут — иначе раунд кончился бы на обучении.
    // В обычном течении интро тратит 9 прокруток из 12, а бит «забрать» счёт не трогает. Но игрок мог накрутить
    // лишние между битами: тогда упёршийся в ноль счётчик вернёт одну, чтобы обучение не оборвалось на середине.
    if (step.lastSpin || this.spinsLeft <= 0) {
      this.spinsLeft = 1;
      this.panel.showSpinsLeft(this.spinsLeft);
    }
    // После текста бит начинает ждать: рычага или «забрать». До этого ввод закрыт (tutorialBlocks).
    // Текст уже погас сам (все биты идут цепочкой), поэтому экран в этот миг пуст — это и просил автор.
    const next = (): void => {
      // Сцену проверяем по поколению, а не по scene.isActive(): в create() статус ещё CREATING, и в режиме wait
      // заставка зовёт done синхронно — проверка isActive съела бы первый бит после перезагрузки страницы.
      if (gen !== this.generation) return;
      // Экран здесь не чистим: строки бита уже погасли по своим hold, а бит без нажатия (wait 'none') сам
      // передаёт эстафету следующему: здесь ничего не нажимают. Фаза гасится заранее, чтобы пауза перед
      // следующим текстом не оставила рычаг живым.
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
    // Пауза бита: сначала видно то, что даёт вход (записка с долгом и тьма — выше), потом идёт текст.
    const start = (): void => {
      if (gen !== this.generation) return;
      this.tutorialTalk(step.lines, next, tutorialStepMode(step));
    };
    const delay = step.pause ?? 0;
    if (delay <= 0) {
      start();
      return;
    }
    this.enterTimer = this.time.delayedCall(delay, () => {
      this.enterTimer = null;
      if (!this.scene.isActive()) return; // сцена уже погасла: таймер не наш
      start();
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
    this.talkLines = [];
    this.busy = false;
    // Речь снята — снимается и очередь реплик: иначе следующая реплика заступила бы без своего заказа.
    this.sayQueue = [];
    this.sayRunning = false;
    this.sayTimer?.remove(false);
    this.sayTimer = null;
    this.collector.clearScreenSequence();
  }

  /**
   * Полки предметов: по сценарию автора они выходят из тьмы на бите «Это места под предметы» — после прокрутки
   * на «Твоя цель», а не вместе с гашением тьмы на телевизоре. Пока обучение не дошло до этого бита, над полками
   * лежит пятно тьмы (ItemShelf.setDarkened); сами полки не прячутся — на входе в бит пятно гаснет тенью, и полки
   * проступают из темноты, а не «появляются» (DONTLIKE, 25.11). Обучение пройдено — пятна нет никогда.
   * Состояние считается из introStep, поэтому после перезагрузки посреди обучения пятно встаёт на своё место.
   */
  private tutorialShelfSync(): void {
    const places = this.placesStep();
    // Бита «места под предметы» нет — прятать полки нечем, они видны сразу.
    this.itemShelf.setDarkened(places >= 0 && this.tutorialActive() && this.introStep < places);
  }

  /** Бит пройден: шаг запоминается (пройденное не откатывается), дальше — следующий бит. */
  protected tutorialAdvance(): void {
    this.introStep += 1;
    setTutorialStep('intro', this.introStep);
    this.tutorialEnter();
  }

  /**
   * Текст бита на экране автомата: строки рисует «богатая» заставка (collector.showTutorialSequence — куски своих
   * тонов, кегль 36), ввод всё это время закрыт. Интро говорит только цепочкой ('chain'): строки гаснут сами,
   * экран остаётся пустым, и только потом бит начинает ждать рычага или «забрать» (DONTLIKE, 25.11).
   * Режим 'wait' у двери остался, но обучение им больше не говорит.
   * done придёт от заставки; защитный таймер зовёт его, если заставка почему-то не позвала (обучение не должно встать
   * намертво). Пустые строки — бит без текста, сразу дальше. Каждая речь получает своё поколение: если её сменила
   * другая (новый бит, новая дорожка), запоздавший done молчит и не переносит ввод на чужой бит.
   */
  protected tutorialTalk(
    lines: readonly TutorialLine[],
    done: () => void,
    mode: 'chain' | 'wait' = 'chain',
    depth?: number,
    keepScreen = false,
  ): void {
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
      // Поколение, а не scene.isActive(): в create() статус сцены ещё CREATING, а бит с одной строкой в режиме wait
      // зовёт done прямо из create. Перезапуск сцены двигает поколение (resetState), и это надёжный признак «не наше».
      if (gen !== this.generation) return;
      this.busy = false;
      done();
      this.pumpPopups(); // реплика кончилась — скопившиеся новости и ачивки выходят только теперь
    };
    this.talkLines = lines; // смена языка на лету вернёт эту же строку на новом языке
    if (lines.length === 0) {
      done(); // бит без строк (последний бит интро) сразу идёт дальше
      return;
    }
    this.busy = true;
    this.collector.showTutorialSequence(lines, finish, { mode, hold: TUTORIAL_LINE_HOLD, depth, keepScreen });
    // Страховка с запасом: в режиме wait последняя строка не считается (она висит, done зовётся сразу),
    // поэтому время речи считает один и тот же tutorialTalkTime, что и тест.
    this.talkTimer = this.time.delayedCall(tutorialTalkTime(lines, mode, TUTORIAL_LINE_HOLD) + TUTORIAL_GUARD_MS, finish);
  }

  /**
   * Готовая дорожка текстов (список ключей) на экране автомата — те же правила, что у строк бита: держится
   * TUTORIAL_LINE_HOLD, ввод на это время закрыт. Этой дверью говорят спасение, победа в нём, смерть, действия
   * и дорожка денег (MONEY_LINES).
   */
  protected tutorialTalkKeys(keys: readonly TextKey[], done: () => void, mode: 'chain' | 'wait' = 'chain', depth?: number): void {
    this.tutorialTalk(keys.map((key) => ({ key })), done, mode, depth);
  }

  /**
   * Смена языка на живой заставке: та же строка на новом языке, с того же места и с тем же done.
   * Только пока идёт речь обучения (tutorialTalk): заставку спасения запускает сцена напрямую, и она
   * перерисовывается своим relabelRescueTexts — чужой talkLines её трогать не должен.
   */
  protected relabelTutorialTexts(): void {
    if (!this.busy) return;
    this.collector.relabelTutorialSequence(this.talkLines);
  }

  /**
   * Дорожка денег (шаг 46б): один раз после первой оплаты долга — семь строк и только потом магазин.
   * Только обычная оплата: прощённый долг и «отсрочка» идут в магазин без текста. Повтор оплаты — тоже молча.
   */
  protected tutorialMoneyPaid(done: () => void): void {
    if (isTutorialDone() || tutorialStep('money') !== 0) {
      done();
      return;
    }
    this.tutorialTalk(MONEY_LINES, () => {
      setTutorialStep('money', 1);
      done();
    });
  }

  /**
   * Короткая реплика Дилера через очередь: если он уже говорит (реплика магазина, дорожка денег), эта встанет
   * следующей и прозвучит после done. depth — слой текста: в магазине он выше панели (SHOP_PANEL_DEPTH + 1).
   */
  protected tutorialSay(lines: readonly TutorialLine[], done: () => void = () => undefined, depth?: number): void {
    this.sayQueue.push({ lines, depth, done });
    this.tutorialSayNext();
  }

  /** Сказать первую реплику очереди: остальные ждут её done. Дальше очередь двигает finish самой реплики. */
  private tutorialSayNext(): void {
    if (this.sayRunning || this.sayTimer) return;
    const next = this.sayQueue.shift();
    if (!next) return;
    this.sayRunning = true;
    // Чёрный экран реплики не гаснет сам: его судьбу решает конец реплики (ниже), а не начало, — следующая реплика
    // может встать в очередь, пока эта уже говорит (замечание автора 25.11: между репликами мелькал автомат).
    this.tutorialTalk(
      next.lines,
      () => {
        this.sayRunning = false;
        if (this.sayQueue.length > 0) {
          // Очередь не пуста: экран остаётся чёрным, через паузу на нём же встанет следующая реплика.
          next.done();
          this.busy = true; // ввод закрыт и на паузе: очередь ещё говорит
          const gen = this.generation;
          this.sayTimer = this.time.delayedCall(TUTORIAL_SAY_GAP, () => {
            this.sayTimer = null;
            if (gen !== this.generation) return;
            this.tutorialSayNext();
          });
          return;
        }
        // Очередь пуста: экран гаснет как у одиночной реплики, и только потом done — один раз.
        this.busy = true;
        this.collector.fadeScreenSequence(() => {
          this.busy = false;
          next.done();
          this.pumpPopups(); // finish уже звал их вхолостую: busy был закрыт
        });
      },
      'chain',
      next.depth,
      true,
    );
  }

  /**
   * Ранняя оплата долга (дорожка earlyPay): один раз после того, как отдан второй долг, и ДО открытия магазина.
   * Панель магазина выезжает только после последней строки — иначе текст ложился поверх витрины с новым товаром
   * (DONTLIKE, 25.11). Раньше реплика говорила на старте третьего раунда, уже после магазина. Первый отданный долг
   * идёт без объяснения: закрытых долгов ещё нет (closedDebts() = 0).
   */
  protected tutorialEarlyPayBeforeShop(done: () => void): void {
    if (isTutorialDone() || tutorialStep('earlyPay') !== 0 || this.closedDebts() < 1) {
      done();
      return;
    }
    this.tutorialSay(EARLY_PAY_LINES, () => {
      setTutorialStep('earlyPay', 1);
      done();
    });
  }

  /** Ввод ждёт обучение: идёт текст, пауза перед ним или бит ещё не начал ждать рычага/«забрать». */
  protected tutorialBlocks(): boolean {
    if (this.busy) return true; // идёт текст дорожки: он может звучать и вне интро (спасение, смерть, действия)
    if (!this.tutorialActive()) return false;
    return this.tutorialPhase !== 'waitSpin' && this.tutorialPhase !== 'waitTake';
  }

  /**
   * Пока идёт реплика Дилера, окна и новости не показываются: они выйдут после её done (DONTLIKE, 25.11).
   * Магазин и остальное держит canShowPopups родителя.
   */
  protected override canShowPopups(): boolean {
    return super.canShowPopups() && !this.busy;
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

  /**
   * Рычаг дёрнули: висящая строка бита снимается — бит ведь ждал уже действия, а не текста. Зовёт RoundScene.roll
   * первой строкой, и прокрутка идёт по чистому экрану. Вне обучения и вне фазы waitSpin — ничего не делает.
   */
  protected tutorialSpinStarted(): void {
    if (!this.tutorialActive() || this.tutorialPhase !== 'waitSpin') return;
    this.collector.clearScreenSequence();
  }

  /** Кон забрали: бит «забрать» пройден — висящая строка снимается, подсветка кнопки гаснет. Зовёт RoundScene.take после payPot. */
  protected tutorialPotTaken(): void {
    if (!this.tutorialActive() || !this.tutorialIsStep('take')) return;
    this.collector.clearScreenSequence();
    this.payout.highlightTake(false);
    this.tutorialAdvance();
  }

  /** Обучение закрыто в этом забеге: текст больше не мешает, мастер-флаг ставится (второе и последнее место — конец дорожки действий). */
  protected tutorialOff(): void {
    this.introDone = true;
    this.tutorialCancelTalk(); // недоигранная строка не должна пережить обучение
    this.tutorialShelfSync(); // обучение кончилось — пятна тьмы над полками нет
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
