import { dealerStake, DEALER_WIN_FACTOR, isGuessRight, randomCard, type Guess } from '../dealerGame';
import { PAYOUT_WINDOW } from '../layout';
import { LAMP_PURPLE } from '../theme';
import { RoundScene } from './RoundScene';

const DEALER_LAMPS_TIME = 1500; // пока Дилер за столом, огни бегут фиолетовым, мс

/**
 * Слой Дилера: выпал кубик 🎲 — поверх экрана стол «больше или меньше» на кон (пустой кон — ставит Дилер).
 * Угадал — кон ×1,5, можно остановиться (клик по светящейся стопке-ставке или Enter) или играть дальше;
 * не угадал — кон сгорает. Отказаться нельзя: первый раз угадывать обязательно.
 */
export abstract class DealerScene extends RoundScene {
  private dealerCard = 0; // открытая карта
  private dealerStakeNow = 0; // что сейчас на кону у Дилера
  private dealerGuesses = 0; // сколько раз уже угадывал в этой игре
  private isGuessing = false; // ждём «больше» или «меньше»
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

  /** «Больше» или «меньше»: открывается следующая карта. Угадал — ставка ×1,5 и светится, не угадал (и ничья) — всё сгорает. */
  protected guess(dir: Guess): void {
    if (!this.isGuessing) return;
    this.isGuessing = false;
    this.dealerTable.showStoppable(false); // карта открывается — остановиться нельзя
    const next = randomCard();
    this.dealerGuesses += 1;
    if (isGuessRight(this.dealerCard, next, dir)) {
      this.dealerStakeNow = Math.round(this.dealerStakeNow * DEALER_WIN_FACTOR);
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
