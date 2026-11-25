import { addCopy, countOf, MAX_SOCKETS, maxCopiesOf, randomAmuletOffer, type Amulet } from '../amulets';
import { see, WHO_DEALER } from '../codex';
import {
  CHEAP_SHOP_DEBT_MUL,
  CHIPS_START_CHIPS,
  CHIPS_START_DEBT_MUL,
  DEBT_CUT_MUL,
  DEBT_DEFER_COST_MUL,
  DEBT_NEXT_MUL,
  DEBT_TICKETS_OFF,
  EMPTY_SPIN_DEBT_MUL,
  HALF_STEP_TICKETS,
  offerPacts,
  PACT_OFFER_COUNT,
  PACT_TICKETS,
  pactAlreadyTaken,
  pactDebt,
  pactOf,
  pactSymbols,
  pactTickets,
  POT_START_DEBT_MUL,
  WIN_DEBT_MUL,
  type PactSpec,
  type PactId,
} from '../dealerGame';
import { CENTER_X, GRID_Y } from '../layout';
import { t } from '../lang';
import { MACHINES, type MachineId } from '../machines';
import type { SlotSymbol } from '../rules';
import { LAMP_PURPLE } from '../theme';
import { RoundScene } from './RoundScene';

const DEALER_LAMPS_TIME = 1500; // пока Дилер за столом, огни бегут фиолетовым, мс
const PACT_DENY_HINT_TIME = 1500; // сколько висит надпись «нет места под амулет» у курсора, мс

/**
 * Слой Дилера: выпал кубик 🎲 — поверх экрана сукно с тремя картами-сделками (dealerGame.PACTS).
 * В каждой карте «получаешь» и «платишь»: игрок берёт одну или отказывается, и раунд идёт дальше.
 * Сделка ложится в pacts (кассета её возвращает) и живёт столько раундов, сколько сказано в карте;
 * что из неё действует в раунде, решает dealerGame.pactEffects — здесь только запись и одноразовые выдачи.
 * Сделка №11 «выбранный символ» сначала просит выбрать символ: ряд кнопок на сукне (dealerTable).
 * Ставки на кон у Дилера больше нет (решение автора 15.11.2026): кон, угадывание «>»/«=»/«<» и «×1,5» ушли.
 */
export abstract class DealerScene extends RoundScene {
  private pactOffer: PactSpec[] = []; // что Дилер положил на сукно
  private dealerDone: () => void = () => {}; // что делать, когда Дилер уйдёт
  private isDealerClosing = false; // стол уже уезжает: второй клик — не вторая сделка

  /** Новый забег: Дилера за столом нет. */
  protected resetState(): void {
    super.resetState();
    this.pactOffer = [];
    this.isDealerClosing = false;
  }

  /**
   * Выпал кубик: Дилер кладёт три карты-сделки. Ушёл — done(). Взятые в этом забеге карты на сукно больше не ложатся
   * (DONTLIKE п.9): и живые, и уже кончившиеся — их помнит pacts (кассета возвращает этот список вместе с забегом).
   * Все 52 карты за забег перебраны — Дилеру нечего предложить: стол не открывается, раунд идёт дальше.
   */
  protected startDealerGame(done: () => void): void {
    see(WHO_DEALER); // Дилер появился впервые — он на экране на стене; NEW не поднимаем: он только за новые символы барабана
    this.isDealing = true;
    this.isDealerClosing = false;
    this.dealerDone = done;
    const taken = this.pacts.map((pact) => pact.id);
    this.pactOffer = offerPacts(PACT_OFFER_COUNT, taken);
    if (this.pactOffer.length === 0) {
      // Предложить нечего — не показываем пустое сукно: сделок больше, чем карт в пуле, не бывает.
      this.isDealing = false;
      done();
      return;
    }
    this.screen.flashLamps(LAMP_PURPLE, DEALER_LAMPS_TIME);
    // №11: символы для выбора — платящие и уже вошедшие в автомат (dealerGame.pactSymbols)
    this.dealerTable.open(this.pactOffer, pactSymbols(this.round));
    this.refreshHud();
  }

  /**
   * Взяли сделку: она ложится в pacts до своего последнего раунда (dealerGame.pactOf) и сразу выдаёт то,
   * что выдаётся один раз — билеты, сдвиг долга или выбранный символ. Строки карты — новостью на стекле,
   * чтобы игрок помнил, на что согласился.
   * Взятую в этом забеге карту не берут второй раз (dealerGame.pactAlreadyTaken, DONTLIKE п.9): дубликат не дал бы
   * ни бафа, ни билетов, но продлил срок — это был бы обман карты. Дилер её и не предлагает.
   */
  protected acceptPact(id: PactId, symbol?: SlotSymbol, machine?: MachineId): void {
    if (!this.isDealing || this.isDealerClosing) return;
    const spec = this.pactOffer.find((pact) => pact.id === id);
    if (!spec) return;
    if (pactAlreadyTaken(this.pacts, spec.id)) {
      // Такая карта уже была в этом забеге (даже если срок вышел): стол не закрываем, игрок берёт другую.
      this.sfx.play('deny');
      return;
    }
    // №11: без платящего символа из списка сделку не берут — строка «выбранный символ» была бы обманом.
    const lucky = spec.needsSymbol && symbol && pactSymbols(this.round).includes(symbol) ? symbol : undefined;
    if (spec.needsSymbol && !lucky) {
      this.sfx.play('deny');
      return;
    }
    // №38: автомат выбирается только из трёх существующих; без выбора карта не берётся.
    if (spec.needsMachine && (!machine || !MACHINES.some((specMachine) => specMachine.id === machine))) {
      this.sfx.play('deny');
      return;
    }
    // №13: бесплатный амулет некуда поставить (нет свободного сосуда или брать уже нечего) — карта не берётся,
    // стол остаётся, а игроку у курсора всплывает короткая надпись: стекло под сукном не видно.
    if (spec.id === 'free-amulet' && !this.freeAmuletCandidate()) {
      this.denyPact();
      return;
    }
    // Шаг 30: копия амулета тоже требует кандидата, а гнездо — свободного места.
    if (spec.id === 'amulet-copy' && this.amuletCopyCandidate() === null) {
      this.denyPact();
      return;
    }
    if (spec.id === 'socket-gift' && this.sockets >= MAX_SOCKETS) {
      this.denyPact();
      return;
    }
    this.isDealerClosing = true;
    this.dealerTable.close(() => this.endDealerGame());
    this.pacts.push(pactOf(spec.id, this.round, lucky));
    // №38: выбранный автомат встаёт сразу — корпус и монитор обновляются тем же путём, что при смене в начале раунда.
    if (spec.needsMachine && machine) {
      this.machineId = machine;
      this.showNewMachine();
    }
    this.itemShelf.refreshPulses(); // сделка могла укоротить столбик — пульс полки пересчитать
    this.applyPactOnce(spec.id);
    this.trackEvent('pact_taken', { card: spec.id, round: this.round, balance: this.balance }); // метрика: какую карту взяли
    this.sfx.play('item');
    this.screen.announceNews(t('pactNews', t(spec.bonus), t(spec.cost)));
  }

  /** Карту взять нельзя, но стол оставляем: короткая надпись у курсора — стекло под сукном не видно. */
  private denyPact(): void {
    this.sfx.play('deny');
    this.tooltip.show(t('pactNoRoom'), '');
    this.time.delayedCall(PACT_DENY_HINT_TIME, () => this.tooltip.hide());
  }

  /**
   * Что сделка делает один раз, в момент взятия (в PactEffects этого нет — там только то, что живёт раундами):
   * №6 — билет, №2 — долг +8%, №12 — текущий долг −10% и следующий +20%, №13 — бесплатный случайный амулет.
   * (№9 «ещё один запас прощения» удалена 22.11.2026 шагом 33; сам запас прощения убран шагом 34.)
   */
  private applyPactOnce(id: PactId): void {
    switch (id) {
      case 'tickets-shop':
        this.gainPactTickets();
        break;
      case 'cheap-shop':
        this.debt = pactDebt(this.debt, CHEAP_SHOP_DEBT_MUL);
        break;
      case 'debt-cut':
        this.debt = pactDebt(this.debt, DEBT_CUT_MUL);
        this.debtNextMul = DEBT_NEXT_MUL; // следующий долг дороже: применит и сбросит ShopScene.takeDebtForRound
        break;
      case 'free-amulet':
        this.gainFreeAmulet();
        break;
      // ---------- Шаг 30 ----------
      case 'empty-spin':
        this.debtNextMul = EMPTY_SPIN_DEBT_MUL; // долг следующего раунда дороже
        break;
      case 'half-step':
        this.tickets = pactTickets(this.tickets, -HALF_STEP_TICKETS); // плата — билет сразу, в минус не уходит
        break;
      case 'win-debt':
        this.debt = pactDebt(this.debt, WIN_DEBT_MUL); // долг +8% разово
        break;
      case 'ticket-gift':
        this.gainPactTickets();
        break;
      case 'pot-start':
        this.debtNextMul = POT_START_DEBT_MUL;
        break;
      case 'chips-start':
        this.earn(CHIPS_START_CHIPS); // фишки идут в доход забега, как все приходы на табло
        this.debt = pactDebt(this.debt, CHIPS_START_DEBT_MUL);
        break;
      case 'amulet-copy':
        this.gainAmuletCopy();
        break;
      case 'socket-gift':
        if (this.sockets < MAX_SOCKETS) {
          this.amuletRack.openSocket(this.sockets); // гнездо открывается с той же анимацией, что при покупке
          this.sockets += 1;
        }
        break;
      case 'amulet-save':
        this.pactAmuletBurns = true; // следующий купленный амулет сгорит сразу (ShopScene.buyAmulet)
        break;
      case 'debt-defer':
        this.debtNextMul = DEBT_DEFER_COST_MUL; // отсрочка дороже: +25% к следующему долгу
        break;
      case 'debt-tickets':
        this.tickets = pactTickets(this.tickets, -DEBT_TICKETS_OFF);
        break;
    }
    this.collector.markNote(this.debt); // долг на записке — уже с поправкой сделки
    this.refreshHud();
  }

  /** Кандидат на бесплатную копию амулета: уже купленный амулет, у которого не выбран потолок копий. */
  private amuletCopyCandidate(): Amulet | null {
    return this.amulets.find((amulet) => countOf(this.amuletCounts, amulet.id) < maxCopiesOf(amulet, this.upgradeEffects.amuletMaxCopies)) ?? null;
  }

  /** Сделка №32: копия случайного уже купленного амулета — без билетов и без нового гнезда. */
  private gainAmuletCopy(): void {
    const candidate = this.amuletCopyCandidate();
    if (!candidate) return;
    addCopy(this.amuletCounts, candidate.id);
    this.amuletRack.setAmulets(this.amulets, this.amuletCounts);
  }

  /**
   * №13: можно ли взять карту «бесплатный случайный амулет» — нужен свободный сосуд и хоть один кандидат
   * (randomAmuletOffer уважает maxCopies, поднятый улучшением №27). Нет — карта не берётся, как отказ Дилера.
   */
  private freeAmuletCandidate(): boolean {
    if (this.amulets.length >= this.sockets) return false;
    return randomAmuletOffer(this.amuletIds(), this.upgradeEffects.amuletMaxCopies).length > 0;
  }

  /** №13: случайный амулет из пула (maxCopies) — сразу в свободное гнездо, без билетов. Копия — в гнездо своего амулета. */
  private gainFreeAmulet(): void {
    const [amulet] = randomAmuletOffer(this.amuletIds(), this.upgradeEffects.amuletMaxCopies);
    if (!amulet) return;
    if (!this.amulets.some((owned) => owned.id === amulet.id)) this.amulets.push(amulet); // гнездо занято сразу
    addCopy(this.amuletCounts, amulet.id);
    this.amuletRack.setAmulets(this.amulets, this.amuletCounts); // звук и новость сделки — в acceptPact
  }

  /** Отказались: стол закрывается, раунд идёт дальше как без Дилера. */
  protected refusePacts(): void {
    if (!this.isDealing || this.isDealerClosing) return;
    this.isDealerClosing = true;
    this.sfx.play('deny');
    this.dealerTable.close(() => this.endDealerGame());
  }

  /** Билет за сделку (PACT_TICKETS) летит на табло, число меняется, когда он долетел (как билет за долг). */
  private gainPactTickets(): void {
    this.sfx.play('ticket');
    this.panel.flyTickets(PACT_TICKETS, CENTER_X, GRID_Y, () => {
      this.tickets += PACT_TICKETS;
      this.refreshHud();
    });
  }

  /** Дилер уходит: стол уехал, раунд продолжается с того же места. */
  private endDealerGame(): void {
    this.isDealing = false;
    this.isDealerClosing = false;
    this.pactOffer = [];
    this.refreshHud();
    this.dealerDone();
  }
}
