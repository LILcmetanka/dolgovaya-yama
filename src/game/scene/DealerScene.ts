import { see, WHO_DEALER } from '../codex';
import { canGuessWin, dealerStake, isGuessRight, randomCard, winFactor, type Guess } from '../dealerGame';
import { PAYOUT_WINDOW } from '../layout';
import { LAMP_PURPLE } from '../theme';
import { RoundScene } from './RoundScene';

const DEALER_LAMPS_TIME = 1500; // пока Дилер за столом, огни бегут фиолетовым, мс

/**
 * Слой Дилера: выпал кубик 🎲 — поверх экрана стол «больше, равно или меньше» на кон (пустой кон — ставит Дилер).
 * Угадал «>» или «<» — кон ×1,5, «=» — ×8; можно остановиться (клик по светящейся стопке-ставке или Enter) или играть дальше;
 * не угадал — кон сгорает. Отказаться нельзя: первый раз угадывать обязательно.
 */
export abstract class DealerScene extends RoundScene {
  private dealerCard = 0; // открытая карта
  private dealerStakeNow = 0; // что сейчас на кону у Дилера
  private dealerGuesses = 0; // сколько раз уже угадывал в этой игре
  private isGuessing = false; // ждём «>», «=» или «<»
  private dealerDone: () => void = () => {}; // что делать, когда Дилер уйдёт

  /** Новый забег: Дилера за столом нет. */
  protected resetState(): void {
    super.resetState();
    this.dealerCard = 0;
    this.dealerStakeNow = 0;
    this.dealerGuesses = 0;
    this.isGuessing = false;
  }

  /** Выпал кубик: Дилер садится за стол, открывает карту. Ушёл — done(). */
  protected startDealerGame(done: () => void): void {
    if (see(WHO_DEALER)) this.monitor.notify('new'); // Дилер появился впервые — он на экране на стене
    this.isDealing = true;
    this.dealerDone = done;
    this.dealerStakeNow = dealerStake(this.pot, this.debt);
    this.dealerCard = randomCard();
    this.dealerGuesses = 0;
    this.screen.flashLamps(LAMP_PURPLE, DEALER_LAMPS_TIME);
    this.dealerTable.open(this.dealerStakeNow, this.dealerCard);
    this.isGuessing = true;
    this.refreshHud();
  }

  /**
   * «>», «=» или «<»: открывается следующая карта. Угадал — ставка ×1,5 (у «=» ×8) и светится, не угадал (и ничья при стрелках) — всё сгорает.
   * Выбор, который выиграть не может (у 1 — «<», у 10 — «>»), не нажимается.
   */
  protected guess(dir: Guess): void {
    if (!this.isGuessing || !canGuessWin(this.dealerCard, dir)) return;
    this.isGuessing = false;
    this.dealerTable.showStoppable(false); // карта открывается — остановиться нельзя
    const next = randomCard();
    this.dealerGuesses += 1;
    if (isGuessRight(this.dealerCard, next, dir)) {
      this.dealerStakeNow = Math.round(this.dealerStakeNow * winFactor(dir));
      this.dealerCard = next;
      this.dealerTable.reveal(next, true, this.dealerStakeNow, () => {
        this.isGuessing = true;
        this.dealerTable.showStoppable(true); // угадал — можно остановиться: стопка светится
      });
    } else {
      this.dealerStakeNow = 0;
      this.dealerTable.reveal(next, false, 0, () => this.endDealerGame());
    }
  }

  /**
   * Остановиться (клик по светящейся стопке или Enter): можно, только если хоть раз уже угадал.
   * Фишки стопки съезжают со стола в окошко выплаты: выигрыш остаётся на кону.
   */
  protected stopDealing(): void {
    if (!this.isGuessing || this.dealerGuesses === 0) return;
    this.isGuessing = false;
    this.sfx.play('chips');
    this.dealerTable.slideStake(PAYOUT_WINDOW.x, PAYOUT_WINDOW.y, () => this.endDealerGame());
  }

  /** Дилер уходит: на кону — то, что выиграли (или ничего: тогда фишки в окошке сгорают). */
  private endDealerGame(): void {
    const hadPot = this.pot > 0;
    this.pot = this.dealerStakeNow;
    if (this.pot > 0) this.payout.addWin(this.pot, this.debt);
    else if (hadPot) this.payout.burn();
    this.dealerTable.close();
    this.isDealing = false;
    this.refreshHud();
    this.dealerDone();
  }
}
