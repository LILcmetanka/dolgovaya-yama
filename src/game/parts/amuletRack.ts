import Phaser from 'phaser';
import {
  ACTIVE_SOCKET_CAP_TEXTURE,
  amuletTexture,
  createActiveSocketCapTexture,
  createAmuletTextures,
  createSocketCapTexture,
  SOCKET_CAP_TEXTURE,
} from '../decor';
import { AMULETS, countOf, isActive, MAX_SOCKETS, type Amulet, type AmuletCounts, type AmuletId } from '../amulets';
import { t } from '../lang';
import { ACTIVE_SOCKET_X, ACTIVE_SOCKET_Y, AMULET_SIZE, SOCKET_RADIUS, SOCKET_XS, SOCKET_Y } from '../layout';
import { addText, GOLD_TEXT, POPUP_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Анимации, мс.
const FLY_TIME = 550; // купленный амулет летит из витрины в гнездо
const FLY_FADE = 200; // и гаснет, пройдя к гнезду столько px: гнездо за панелью — амулет уходит за жалюзи, а не летит через витрину
const CAP_POP_TIME = 500; // заглушка слетает с купленного гнезда
const TRIGGER_TIME = 140; // амулет сработал: подпрыгивает
const TRIGGER_SCALE = 1.35;
const COPY_LABEL_DX = SOCKET_RADIUS; // метка «×N» — настолько левее центра гнезда, чтобы не столкнуться с «+N%»
const COPY_LABEL_UP = 10; // и настолько выше подписи коллекционера костей (bonesLabel)
const SPENT_ALPHA = 0.35; // заряд активного амулета кончился: значок тускнеет, пока не начнётся новый раунд

/**
 * Гнёзда для амулетов на верхушке корпуса, по три слева и справа от табло.
 * Закрытые — с заглушками. Амулет в гнезде подпрыгивает, когда срабатывает; при наведении — подсказка.
 * Отдельно справа от ряда — одно гнездо активного амулета: янтарное, с меткой зарядов (шаг 12а).
 */
export class AmuletRack {
  private readonly scene: Phaser.Scene;
  private readonly caps: Phaser.GameObjects.Image[] = []; // заглушки закрытых гнёзд
  private readonly badges: Phaser.GameObjects.Image[] = []; // амулет в гнезде; пустое гнездо — картинка скрыта
  private readonly amulets: (Amulet | null)[] = []; // какой амулет в каком гнезде
  private counts: AmuletCounts = {}; // сколько копий каждого амулета (шаг 62б: дубли не занимают гнёзда)
  private readonly copyLabels: Phaser.GameObjects.Text[] = []; // «×N» под гнездом: сколько копий (видна от двух)
  private readonly bonesLabel: Phaser.GameObjects.Text; // коллекционер костей: «+45%» под его гнездом
  private readonly activeCap: Phaser.GameObjects.Image; // заглушка пустого гнезда активного амулета
  private readonly activeBadge: Phaser.GameObjects.Image; // активный амулет в своём гнезде
  private readonly activeUsesLabel: Phaser.GameObjects.Text; // сколько зарядов осталось — мелким шрифтом у гнезда
  private active: Amulet | null = null; // какой активный амулет стоит (гнездо одно)
  private activeLeft = 0; // зарядов в этом раунде

  /** sockets — сколько гнёзд открыто в начале. */
  constructor(scene: Phaser.Scene, sockets: number, hint: Hint) {
    this.scene = scene;
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    createSocketCapTexture(scene, SOCKET_RADIUS);
    createActiveSocketCapTexture(scene, SOCKET_RADIUS);
    for (let index = 0; index < MAX_SOCKETS; index++) {
      const x = SOCKET_XS[index];
      const badge = scene.add.image(x, SOCKET_Y, amuletTexture(AMULETS[0])).setVisible(false);
      badge.setInteractive();
      attachHint(badge, hint, () => this.hintFor(index));
      this.badges.push(badge);
      this.amulets.push(null);
      const cap = scene.add.image(x, SOCKET_Y, SOCKET_CAP_TEXTURE).setVisible(index >= sockets);
      cap.setInteractive();
      attachHint(cap, hint, () => [t('closedSocket'), t('closedSocketHow')]);
      this.caps.push(cap);
      // «×N» — под гнездом, чуть выше и левее подписи костей, чтобы они не сталкивались.
      this.copyLabels.push(
        addText(scene, x - COPY_LABEL_DX, SOCKET_Y + SOCKET_RADIUS + 4 - COPY_LABEL_UP, '', {
          fontSize: '12px',
          fontStyle: 'bold',
          color: GOLD_TEXT,
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5).setVisible(false),
      );
    }
    // Гнездо активного амулета: пустое — янтарная заглушка, занятое — значок амулета и метка зарядов.
    this.activeBadge = scene.add.image(ACTIVE_SOCKET_X, ACTIVE_SOCKET_Y, amuletTexture(AMULETS[0])).setVisible(false);
    this.activeBadge.setInteractive();
    attachHint(this.activeBadge, hint, () => this.activeHint());
    this.activeCap = scene.add.image(ACTIVE_SOCKET_X, ACTIVE_SOCKET_Y, ACTIVE_SOCKET_CAP_TEXTURE);
    this.activeCap.setInteractive();
    attachHint(this.activeCap, hint, () => [t('activeSocketEmpty'), t('activeAmuletHow')]);
    // Метка зарядов — под гнездом, как «×N» у пассивных: копий у активного не бывает, поэтому по центру.
    this.activeUsesLabel = addText(scene, ACTIVE_SOCKET_X, ACTIVE_SOCKET_Y + SOCKET_RADIUS + 3, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);
    // «+N%» — под гнездом, над стеклом с паттернами (табло опустилось — стекло ближе к гнёздам).
    this.bonesLabel = addText(scene, 0, SOCKET_Y + SOCKET_RADIUS + 4, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
  }

  /** Подсказка гнезда: название амулета (с «×N» при копиях) и что он делает. */
  private hintFor(index: number): [string, string] | null {
    const amulet = this.amulets[index];
    if (!amulet) return null;
    const copies = countOf(this.counts, amulet.id);
    const name = copies > 1 ? `${t(amulet.name)} ×${copies}` : t(amulet.name);
    return [name, t(amulet.description)];
  }

  /** Подсказка активного амулета: название, что делает и сколько зарядов осталось в раунде. */
  private activeHint(): [string, string] | null {
    const amulet = this.active;
    if (!amulet) return null;
    return [t(amulet.name), `${t(amulet.description)}\n${t('activeUsesLeft', this.activeLeft)}`];
  }

  /** Обновить метки «×N» под гнёздами: одна на гнездо, по счётчику, видна со второй копии. */
  private refreshCopies(): void {
    this.amulets.forEach((amulet, index) => {
      const label = this.copyLabels[index];
      if (!amulet) {
        label.setVisible(false);
        return;
      }
      const copies = countOf(this.counts, amulet.id);
      label.setVisible(copies >= 2);
      if (copies >= 2) label.setX(SOCKET_XS[index] - COPY_LABEL_DX).setText(`×${copies}`);
    });
  }

  /** Купили гнездо: заглушка подпрыгивает и улетает. */
  openSocket(index: number): void {
    const cap = this.caps[index];
    this.scene.tweens.add({
      targets: cap,
      y: SOCKET_Y - 40,
      angle: 200,
      alpha: 0,
      duration: CAP_POP_TIME,
      ease: 'Back.easeIn',
      onComplete: () => cap.setVisible(false),
    });
  }

  /**
   * Купили новый амулет: он летит из (fromX, fromY) в свободное гнездо index и там встаёт. count — сколько копий стало.
   * Гнездо за панелью магазина: амулет гаснет, не долетая, будто уходит за жалюзи.
   */
  putAmulet(index: number, amulet: Amulet, count: number, fromX: number, fromY: number): void {
    const badge = this.badges[index];
    if (!badge) return; // гнезда с таким номером нет — ставить некуда
    this.amulets[index] = amulet;
    this.counts[amulet.id] = count;
    this.flyToBadge(badge, amuletTexture(amulet), fromX, fromY, () => {
      badge.setTexture(amuletTexture(amulet)).setVisible(true);
      this.refreshCopies();
      this.bounce(badge, SOCKET_Y);
    });
  }

  /** Купили копию: она летит из (fromX, fromY) в гнездо index уже стоящего амулета — по прилёте только метка и подскок. */
  putCopy(index: number, amulet: Amulet, count: number, fromX: number, fromY: number): void {
    const badge = this.badges[index];
    if (!badge) return; // гнезда с таким номером нет — лететь некуда
    this.counts[amulet.id] = count;
    this.flyToBadge(badge, amuletTexture(amulet), fromX, fromY, () => {
      this.refreshCopies();
      this.bounce(badge, SOCKET_Y);
    });
  }

  /**
   * Купили активный амулет: он летит из (fromX, fromY) в своё гнездо и там встаёт; зарядов — uses.
   * Без координат — встаёт сразу, без полёта.
   */
  putActive(amulet: Amulet, uses: number, fromX?: number, fromY?: number): void {
    this.active = amulet;
    this.activeLeft = uses;
    this.activeCap.setVisible(false); // заглушки больше нет — в гнезде амулет
    const landed = (): void => {
      this.activeBadge.setTexture(amuletTexture(amulet)).setVisible(true);
      this.showActiveUses();
      this.bounce(this.activeBadge, ACTIVE_SOCKET_Y);
    };
    if (fromX === undefined || fromY === undefined) {
      landed();
      return;
    }
    this.flyToBadge(this.activeBadge, amuletTexture(amulet), fromX, fromY, landed);
  }

  /** Активный амулет заново, без анимации: так кассета возвращает забег к записи. null — гнездо снова пустое. */
  setActive(amulet: Amulet | null, uses: number): void {
    this.active = amulet;
    this.activeLeft = uses;
    this.activeCap.setVisible(amulet === null);
    this.activeBadge.setVisible(amulet !== null);
    if (amulet) this.activeBadge.setTexture(amuletTexture(amulet));
    this.showActiveUses();
  }

  /** Осталось зарядов в раунде: метка у гнезда и затемнение значка, когда заряд кончился. */
  setActiveUses(uses: number): void {
    this.activeLeft = uses;
    this.showActiveUses();
  }

  /** Метка зарядов у гнезда активного амулета; заряда нет — значок тусклый. */
  private showActiveUses(): void {
    const amulet = this.active;
    this.activeUsesLabel.setVisible(amulet !== null);
    if (!amulet) return;
    this.activeUsesLabel.setText(String(this.activeLeft));
    this.activeBadge.setAlpha(this.activeLeft > 0 ? 1 : SPENT_ALPHA);
  }

  /**
   * Амулет летит из (fromX, fromY) к гнезду и гаснет, пройдя FLY_FADE px пути (или весь путь, если он короче): гнездо
   * за панелью магазина, и амулет будто уходит за жалюзи. Погас — landed(): гнездо уже занято, остаётся показать.
   */
  private flyToBadge(badge: Phaser.GameObjects.Image, texture: string, fromX: number, fromY: number, landed: () => void): void {
    const distance = badge.x - fromX;
    const fadeAtX = fromX + Math.sign(distance) * Math.min(FLY_FADE, Math.abs(distance));
    const flying = this.scene.add.image(fromX, fromY, texture).setScale(1.4).setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: flying,
      x: fadeAtX,
      y: badge.y,
      scale: 1,
      alpha: 0,
      duration: FLY_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        flying.destroy();
        landed();
      },
    });
  }

  /**
   * Амулеты по гнёздам заново, без анимации: так бывает, когда кассета вернула забег к записи. counts — счётчики копий.
   * Активные сюда не попадают: у них своё гнездо — его ставит setActive.
   */
  setAmulets(amulets: Amulet[], counts: AmuletCounts): void {
    this.counts = { ...counts };
    const passive = amulets.filter((amulet) => !isActive(amulet));
    this.badges.forEach((badge, index) => {
      const amulet = passive[index] ?? null;
      this.amulets[index] = amulet;
      badge.setVisible(amulet !== null);
      if (amulet) badge.setTexture(amuletTexture(amulet));
    });
    this.bonesLabel.setVisible(false); // сцена покажет заново, если коллекционер костей остался
    this.refreshCopies();
  }

  /** Амулет сработал: подпрыгивает его гнездо (у каждого амулета оно одно). */
  trigger(id: AmuletId): void {
    const index = this.amulets.findIndex((amulet) => amulet?.id === id);
    if (index >= 0) this.bounce(this.badges[index], SOCKET_Y);
  }

  /** Коллекционер костей: под его гнездом — сколько он уже прибавляет к выигрышам. */
  showBones(percent: number): void {
    const index = this.amulets.findIndex((amulet) => amulet?.id === 'bones');
    this.bonesLabel.setVisible(index >= 0 && percent > 0);
    if (index >= 0) this.bonesLabel.setX(SOCKET_XS[index]).setText(`+${percent}%`);
  }

  /** Подскок с увеличением; baseY — собственный базовый Y значка (пассивное гнездо и активное стоят на разной высоте). */
  private bounce(badge: Phaser.GameObjects.Image, baseY: number): void {
    this.scene.tweens.killTweensOf(badge);
    badge.setScale(1).setY(baseY);
    this.scene.tweens.add({ targets: badge, scale: TRIGGER_SCALE, y: baseY - 4, duration: TRIGGER_TIME, yoyo: true, ease: 'Quad.easeOut' });
  }
}
