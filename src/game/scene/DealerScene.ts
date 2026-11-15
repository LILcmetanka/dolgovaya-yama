import { see, WHO_DEALER } from '../codex';
import { offerPacts, PACT_TICKETS, pactLive, pactOf, type PactId, type PactSpec } from '../dealerGame';
import { CENTER_X, GRID_Y } from '../layout';
import { t } from '../lang';
import { LAMP_PURPLE } from '../theme';
import { RoundScene } from './RoundScene';

const DEALER_LAMPS_TIME = 1500; // пока Дилер за столом, огни бегут фиолетовым, мс

/**
 * Слой Дилера: выпал кубик 🎲 — поверх экрана сукно с тремя картами-сделками (dealerGame.PACTS).
 * В каждой карте «получаешь» и «платишь»: игрок берёт одну или отказывается, и раунд идёт дальше.
 * Сделка ложится в pacts (кассета её возвращает) и живёт столько раундов, сколько сказано в карте;
 * что из неё действует в раунде, решает dealerGame.pactEffects — здесь только запись и одноразовые выдачи.
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
    this.dealerTable.open(this.pactOffer);
    this.refreshHud();
  }

  /**
   * Взяли сделку: она ложится в pacts до своего последнего раунда (dealerGame.pactOf) и сразу выдаёт то,
   * что выдаётся один раз — билеты. Строки карты — новостью на стекле, чтобы игрок помнил, на что согласился.
   * Такую сделку, которая ещё действует, взять нельзя (dealerGame.pactLive, как отказ бота в симуляторе):
   * дубликат не выдал бы ни бафа второй раз, ни билетов, но продлил бы срок — это был бы обман карты.
   */
  protected acceptPact(id: PactId): void {
    if (!this.isDealing || this.isDealerClosing) return;
    const spec = this.pactOffer.find((pact) => pact.id === id);
    if (!spec) return;
    if (pactLive(this.pacts, spec.id, this.round)) {
      this.sfx.play('deny'); // стол не закрываем: игрок видит, что карта не берётся, и выбирает другую
      return;
    }
    this.isDealerClosing = true;
    this.dealerTable.close(() => this.endDealerGame());
    this.pacts.push(pactOf(spec.id, this.round));
    if (spec.id === 'tickets-shop') this.gainPactTickets();
    this.sfx.play('item');
    this.screen.announceNews(t('pactNews', t(spec.bonus), t(spec.cost)));
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
