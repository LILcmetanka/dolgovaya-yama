import Phaser from 'phaser';
import { createDealerFelt, DEALER_FELT_TEXTURE } from '../decor';
import { pactSymbolsAvailable, type PactId, type PactSpec } from '../dealerGame';
import { SCREEN } from '../layout';
import { t } from '../lang';
import type { SlotSymbol } from '../rules';
import { addText, GOLD_TEXT, GREEN_TEXT, POPUP_DEPTH, RED_TEXT } from '../theme';

// Три карты-сделки лежат на сукне слева направо: в каждой «получаешь» зелёным и «платишь» красным.
const CARD_W = 138;
const CARD_H = 196;
const CARD_GAP = 10;
const CARD_Y = SCREEN.y - 12;
const CARD_RADIUS = 10;
const CARD_FILL = 0x111827; // тёмная карта: на ней читаются и зелёная, и красная строки
const CARD_EDGE = 0xfbbf24; // золотой обод, как у всего в автомате
const CARD_PAD = 8; // от края карты до текста
const CARD_TEXT_W = CARD_W - 2 * CARD_PAD;
const LABEL_SIZE = 10; // «ПОЛУЧАЕШЬ» / «ПЛАТИШЬ»
const LINE_SIZE = 13; // сами строки сделки
const BONUS_LABEL_Y = -84;
const BONUS_Y = -70;
const COST_LABEL_Y = 16;
const COST_Y = 30;
const REFUSE_Y = SCREEN.y + 122; // кнопка отказа внизу сукна
const REFUSE_SIZE = 16;
const DEPTH = POPUP_DEPTH - 1; // под всплывающими надписями, но над сеткой
const APPEAR_TIME = 220;
const CARD_STAGGER = 80; // карты ложатся друг за другом
const HOVER_SCALE = 1.04;
const HOVER_TIME = 100;
// Ряд кнопок-символов сделки №11 — посередине сукна, вместо карт: иконка символа в тёмной плашке.
const PICK_Y = SCREEN.y + 20;
const PICK_HINT_Y = PICK_Y - 34; // надпись «выбери символ» над рядом
const PICK_SIGN_SIZE = 24;
const PICK_PAD = 5; // отступ значка до края плашки
const PICK_GAP = 8; // между плашками
const PICK_HOVER = 1.12;
const BACK_SIGN = '←'; // «назад» к трём картам, рядом с рядом символов
const BACK_SIZE = 22;

/** Одна карта на сукне: подложка, две подписи и две строки сделки. */
interface Card {
  container: Phaser.GameObjects.Container;
  bonus: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  id: PactId | null; // что лежит на карте сейчас; null — карта пустая и не нажимается
  needsSymbol: boolean; // карта №11: клик не берёт сделку, а открывает выбор символа
}

/**
 * Стол Дилера поверх экрана автомата: фиолетовое сукно, на нём три карты-сделки (dealerGame.PACTS), внизу «✕ ОТКАЗАТЬСЯ».
 * Клик по карте берёт сделку, клик по отказу закрывает стол: раунд идёт дальше, как без Дилера.
 * Карта №11 «выбранный символ» вместо этого кладёт на сукно ряд кнопок-символов: выбрал — сделка взята,
 * «←» рядом с рядом — назад к картам, отказ внизу — карта не берётся вовсе.
 * Угадайки «больше, меньше или равно» больше нет (решение автора 15.11.2026).
 */
export class DealerTable {
  private readonly scene: Phaser.Scene;
  private readonly accept: (id: PactId, symbol?: SlotSymbol) => void;
  private readonly onRefuse: () => void;
  private readonly felt: Phaser.GameObjects.Image;
  private readonly cards: Card[] = [];
  private readonly refuse: Phaser.GameObjects.Text;
  private readonly pickHint: Phaser.GameObjects.Text;
  private readonly back: Phaser.GameObjects.Text; // «←»: от ряда символов назад к картам, без отказа от Дилера
  private picks: Phaser.GameObjects.Text[] = []; // кнопки-символы: создаются, когда карта их попросила
  private pickSymbols: readonly SlotSymbol[] = []; // из чего выбирать (dealerGame.pactSymbols)
  private pendingId: PactId | null = null; // карта, которая ждёт выбора символа; null — выбора нет
  private isClosing = false; // стол уже уезжает: второй клик не должен взять вторую сделку

  /** accept(id, symbol?) — кликнули по карте сделки (или по символу для №11), refuse() — по «✕ ОТКАЗАТЬСЯ». */
  constructor(scene: Phaser.Scene, accept: (id: PactId, symbol?: SlotSymbol) => void, refuse: () => void) {
    this.scene = scene;
    this.accept = accept;
    this.onRefuse = refuse;
    createDealerFelt(scene, SCREEN);
    this.felt = scene.add.image(SCREEN.x, SCREEN.y, DEALER_FELT_TEXTURE).setDepth(DEPTH).setVisible(false);
    const offset = CARD_W + CARD_GAP; // центры карт: −offset, 0, +offset от середины сукна
    for (const index of [-1, 0, 1]) this.cards.push(this.makeCard(SCREEN.x + index * offset));
    this.pickHint = addText(scene, SCREEN.x, PICK_HINT_Y, t('pactPickSymbol'), {
      fontSize: `${LINE_SIZE}px`,
      fontStyle: 'bold',
      color: GOLD_TEXT,
      stroke: '#0f172a',
      strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setVisible(false);
    this.back = addText(scene, SCREEN.x, PICK_Y, BACK_SIGN, {
      fontSize: `${BACK_SIZE}px`,
      fontStyle: 'bold',
      color: GOLD_TEXT,
      stroke: '#0f172a',
      strokeThickness: 4,
      padding: { x: PICK_PAD + 4, y: PICK_PAD },
    })
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setVisible(false);
    this.back.on('pointerdown', () => this.backToCards());
    this.refuse = addText(scene, SCREEN.x, REFUSE_Y, `✕ ${t('pactRefuse')}`, {
      fontSize: `${REFUSE_SIZE}px`,
      fontStyle: 'bold',
      color: GOLD_TEXT,
      stroke: '#0f172a',
      strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setVisible(false);
    this.refuse.setInteractive({ useHandCursor: true }).disableInteractive();
    this.refuse.on('pointerdown', refuse);
  }

  /** Пустая карта на своём месте: подложка, подписи «получаешь/платишь» и две строки — их заполняет open(). */
  private makeCard(x: number): Card {
    const background = this.scene.add.graphics();
    this.drawCard(background);
    const label = (y: number, text: string, color: string): Phaser.GameObjects.Text =>
      addText(this.scene, 0, y, text, { fontSize: `${LABEL_SIZE}px`, fontStyle: 'bold', color }).setOrigin(0.5, 0);
    const line = (y: number, color: string): Phaser.GameObjects.Text =>
      addText(this.scene, 0, y, '', {
        fontSize: `${LINE_SIZE}px`,
        fontStyle: 'bold',
        color,
        align: 'center',
        wordWrap: { width: CARD_TEXT_W, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);
    const bonus = line(BONUS_Y, GREEN_TEXT);
    const cost = line(COST_Y, RED_TEXT);
    const container = this.scene.add.container(x, CARD_Y, [
      background,
      label(BONUS_LABEL_Y, t('pactBonus'), GREEN_TEXT),
      bonus,
      label(COST_LABEL_Y, t('pactCost'), RED_TEXT),
      cost,
    ]);
    const card: Card = { container, bonus, cost, id: null, needsSymbol: false };
    container.setSize(CARD_W, CARD_H).setDepth(DEPTH).setVisible(false);
    container.setInteractive({ useHandCursor: true }).disableInteractive();
    container.on('pointerdown', () => {
      if (!card.id) return;
      if (!card.needsSymbol) {
        this.accept(card.id);
        return;
      }
      // №11: сначала символ — сделку возьмёт клик по нему, а не по карте (DealerScene.acceptPact).
      // Выбирать не из чего — карта ведёт себя как отказ: клика в пустоту не бывает.
      if (pactSymbolsAvailable(this.pickSymbols)) this.showPicks(card.id);
      else this.onRefuse();
    });
    // Наведение: карта чуть подрастает — видно, что её можно взять.
    container.on('pointerover', () => this.scene.tweens.add({ targets: container, scale: HOVER_SCALE, duration: HOVER_TIME }));
    container.on('pointerout', () => this.scene.tweens.add({ targets: container, scale: 1, duration: HOVER_TIME }));
    return card;
  }

  /** Подложка карты: тёмный прямоугольник с золотым ободом и лёгкой тенью. */
  private drawCard(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    graphics.fillStyle(0x000000, 0.45);
    graphics.fillRoundedRect(-CARD_W / 2 + 3, -CARD_H / 2 + 4, CARD_W, CARD_H, CARD_RADIUS); // тень
    graphics.fillStyle(CARD_FILL, 0.94);
    graphics.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    graphics.lineStyle(3, CARD_EDGE);
    graphics.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
  }

  /**
   * Дилер положил карты: каждая появляется со сдвигом, строки — из сделки. Лишние карты (сделок меньше) гаснут.
   * symbols — из чего выбирать символ для карты №11 (dealerGame.pactSymbols): список готовит сцена.
   */
  open(offers: readonly PactSpec[], symbols: readonly SlotSymbol[] = []): void {
    this.isClosing = false;
    this.pickSymbols = symbols;
    this.hidePicks();
    this.felt.setVisible(true).setAlpha(1);
    this.refuse.setVisible(true).setAlpha(1).setInteractive({ useHandCursor: true });
    this.cards.forEach((card, index) => {
      const offer = offers[index];
      if (!offer) {
        card.id = null;
        card.needsSymbol = false;
        card.container.setVisible(false).disableInteractive();
        return;
      }
      card.id = offer.id;
      card.needsSymbol = offer.needsSymbol === true;
      card.bonus.setText(t(offer.bonus));
      card.cost.setText(t(offer.cost));
      card.container.setVisible(true).setAlpha(0).setScale(1).setY(CARD_Y + 16);
      card.container.setInteractive({ useHandCursor: true });
      this.scene.tweens.add({
        targets: card.container,
        alpha: 1,
        y: CARD_Y,
        delay: index * CARD_STAGGER,
        duration: APPEAR_TIME,
        ease: 'Quad.easeOut',
      });
    });
  }

  /**
   * Карта №11 просит символ: карты с сукна убираются, вместо них ложится ряд плашек-символов.
   * Клик по символу берёт сделку с ним, «←» слева возвращает к картам (сделку не берём),
   * «✕ ОТКАЗАТЬСЯ» внизу — отказ от Дилера целиком.
   */
  private showPicks(id: PactId): void {
    if (this.isClosing || this.pendingId !== null || this.pickSymbols.length === 0) return;
    this.pendingId = id;
    for (const card of this.cards) card.container.disableInteractive().setVisible(false);
    const step = PICK_SIGN_SIZE + 2 * PICK_PAD + PICK_GAP;
    const start = SCREEN.x - ((this.pickSymbols.length - 1) * step) / 2; // ряд по центру сукна
    this.picks = this.pickSymbols.map((symbol, index) => {
      const button = addText(this.scene, start + index * step, PICK_Y, symbol.sign, {
        fontSize: `${PICK_SIGN_SIZE}px`,
        color: GOLD_TEXT,
        backgroundColor: `#${CARD_FILL.toString(16)}`,
        padding: { x: PICK_PAD, y: PICK_PAD },
      }).setOrigin(0.5).setDepth(DEPTH);
      button.setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => {
        if (this.pendingId === null || this.isClosing) return;
        this.pendingId = null;
        this.accept(id, symbol);
      });
      button.on('pointerover', () => button.setScale(PICK_HOVER));
      button.on('pointerout', () => button.setScale(1));
      return button;
    });
    this.back.setPosition(start - step, PICK_Y).setVisible(true).setInteractive({ useHandCursor: true });
    this.pickHint.setVisible(true);
  }

  /**
   * Назад к трём картам: выбор символа отменён, но от Дилера не отказываемся — карта №11 снова нажимается
   * и снова показывает ряд символов.
   */
  private backToCards(): void {
    if (this.isClosing || this.pendingId === null) return;
    this.hidePicks();
    for (const card of this.cards) {
      if (card.id) card.container.setVisible(true).setInteractive({ useHandCursor: true });
    }
  }

  /** Убрать ряд кнопок-символов: выбор отменён (сделка не взята) или стол закрылся. */
  private hidePicks(): void {
    this.pendingId = null;
    for (const button of this.picks) button.destroy();
    this.picks = [];
    this.pickHint.setVisible(false);
    this.back.setVisible(false).disableInteractive();
  }

  /** Стол уходит: карты, выбор символа и отказ тают, карты больше не нажимаются. Доехало — done(). */
  close(done?: () => void): void {
    if (this.isClosing) return;
    this.isClosing = true;
    this.hidePicks();
    for (const card of this.cards) card.container.disableInteractive();
    this.refuse.disableInteractive();
    this.scene.tweens.add({
      targets: [this.felt, this.refuse, ...this.cards.map((card) => card.container)],
      alpha: 0,
      duration: APPEAR_TIME,
      onComplete: () => {
        this.felt.setVisible(false);
        this.refuse.setVisible(false);
        for (const card of this.cards) card.container.setVisible(false);
        done?.();
      },
    });
  }
}
