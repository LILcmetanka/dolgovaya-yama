import { addCopy, randomAmuletOffer } from '../amulets';
import { see, WHO_DEALER } from '../codex';
import {
  CHEAP_SHOP_DEBT_MUL,
  DEBT_CUT_MUL,
  DEBT_NEXT_MUL,
  EXTRA_BREATH_COUNT,
  EXTRA_BREATH_STREAK_COST,
  offerPacts,
  PACT_TICKETS,
  pactDebt,
  pactLive,
  pactOf,
  pactSymbols,
  SECOND_WIND_MAX,
  type PactSpec,
  type PactId,
} from '../dealerGame';
import { CENTER_X, GRID_Y } from '../layout';
import { t } from '../lang';
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

  /** Выпал кубик: Дилер кладёт три карты-сделки. Ушёл — done(). */
  protected startDealerGame(done: () => void): void {
    if (see(WHO_DEALER)) this.monitor.notify('new'); // Дилер появился впервые — он на экране на стене
    this.isDealing = true;
    this.isDealerClosing = false;
    this.dealerDone = done;
    this.pactOffer = offerPacts(); // три карты: сколько именно — dealerGame.PACT_OFFER_COUNT
    this.screen.flashLamps(LAMP_PURPLE, DEALER_LAMPS_TIME);
    // №11: символы для выбора — платящие и уже вошедшие в автомат (dealerGame.pactSymbols)
    this.dealerTable.open(this.pactOffer, pactSymbols(this.round));
    this.refreshHud();
  }

  /**
   * Взяли сделку: она ложится в pacts до своего последнего раунда (dealerGame.pactOf) и сразу выдаёт то,
   * что выдаётся один раз — билеты, сдвиг долга или выбранный символ. Строки карты — новостью на стекле,
   * чтобы игрок помнил, на что согласился.
   * Такую сделку, которая ещё действует, взять нельзя (dealerGame.pactLive, как отказ бота в симуляторе):
   * дубликат не выдал бы ни бафа второй раз, ни билетов, но продлил бы срок — это был бы обман карты.
   */
  protected acceptPact(id: PactId, symbol?: SlotSymbol): void {
    if (!this.isDealing || this.isDealerClosing) return;
    const spec = this.pactOffer.find((pact) => pact.id === id);
    if (!spec) return;
    if (pactLive(this.pacts, spec.id, this.round)) {
      this.sfx.play('deny'); // стол не закрываем: игрок видит, что карта не берётся, и выбирает другую
      return;
    }
    // №11: без платящего символа из списка сделку не берут — строка «выбранный символ» была бы обманом.
    const lucky = spec.needsSymbol && symbol && pactSymbols(this.round).includes(symbol) ? symbol : undefined;
    if (spec.needsSymbol && !lucky) {
      this.sfx.play('deny');
      return;
    }
    // №9: запас дыхания даётся один раз за забег. Пока сделка на кассете, её отсекает pactLive; после отката кассетой
    // записи уже нет, и второй раз карту не взять только по флагу breathTaken (он откат переживает).
    if (spec.id === 'extra-breath' && this.breathTaken) {
      this.sfx.play('deny');
      this.tooltip.show(t('pactAlreadyTaken'), '');
      this.time.delayedCall(PACT_DENY_HINT_TIME, () => this.tooltip.hide());
      return;
    }
    // №13: бесплатный амулет некуда поставить (нет свободного сосуда или брать уже нечего) — карта не берётся,
    // стол остаётся, а игроку у курсора всплывает короткая надпись: стекло под сукном не видно.
    if (spec.id === 'free-amulet' && !this.freeAmuletCandidate()) {
      this.sfx.play('deny');
      this.tooltip.show(t('pactNoRoom'), '');
      this.time.delayedCall(PACT_DENY_HINT_TIME, () => this.tooltip.hide());
      return;
    }
    this.isDealerClosing = true;
    this.dealerTable.close(() => this.endDealerGame());
    this.pacts.push(pactOf(spec.id, this.round, lucky));
    this.applyPactOnce(spec.id);
    this.sfx.play('item');
    this.screen.announceNews(t('pactNews', t(spec.bonus), t(spec.cost)));
  }

  /**
   * Что сделка делает один раз, в момент взятия (в PactEffects этого нет — там только то, что живёт раундами):
   * №6 — билет, №2 — долг +8%, №12 — текущий долг −10% и следующий +20%, №9 — ещё один запас «второго дыхания»
   * и −1 ступень серии, №13 — бесплатный случайный амулет.
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
      case 'extra-breath':
        // Запас дыхания — навсегда, но не выше SECOND_WIND_MAX; ступень серии — сразу: панель множителя обновит refreshHud.
        this.secondWindLeft = Math.min(SECOND_WIND_MAX, this.secondWindLeft + EXTRA_BREATH_COUNT);
        this.streak = Math.max(0, this.streak - EXTRA_BREATH_STREAK_COST);
        this.breathTaken = true; // карта одна на забег: откат кассетой этой памяти не снимает
        break;
      case 'free-amulet':
        this.gainFreeAmulet();
        break;
    }
    this.collector.markNote(this.debt); // долг на записке — уже с поправкой сделки
    this.refreshHud();
  }

  /**
   * №13: можно ли взять карту «бесплатный случайный амулет» — нужен свободный сосуд и хоть один кандидат
   * (randomAmuletOffer уважает maxCopies). Нет — карта не берётся, как отказ Дилера.
   */
  private freeAmuletCandidate(): boolean {
    if (this.amulets.length >= this.sockets) return false;
    return randomAmuletOffer(this.amuletIds()).length > 0;
  }

  /** №13: случайный амулет из пула (maxCopies) — сразу в свободное гнездо, без билетов. Копия — в гнездо своего амулета. */
  private gainFreeAmulet(): void {
    const [amulet] = randomAmuletOffer(this.amuletIds());
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
