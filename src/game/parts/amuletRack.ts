import Phaser from 'phaser';
import { amuletTexture, createAmuletTextures, createSocketCapTexture, SOCKET_CAP_TEXTURE } from '../decor';
import { AMULETS, MAX_SOCKETS, type Amulet, type AmuletId } from '../amulets';
import { t } from '../lang';
import { AMULET_SIZE, SOCKET_RADIUS, SOCKET_XS, SOCKET_Y } from '../layout';
import { addText, GOLD_TEXT, POPUP_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Анимации, мс.
const FLY_TIME = 550; // купленный амулет летит из витрины в гнездо
const CAP_POP_TIME = 500; // заглушка слетает с купленного гнезда
const TRIGGER_TIME = 140; // амулет сработал: подпрыгивает
const TRIGGER_SCALE = 1.35;
const COPY_LABEL_DX = SOCKET_RADIUS; // метка «×N» — настолько левее центра гнезда, чтобы не столкнуться с «+N%»
const COPY_LABEL_UP = 10; // и настолько выше подписи коллекционера костей (bonesLabel)

/**
 * Гнёзда для амулетов на верхушке корпуса, по три слева и справа от табло.
 * Закрытые — с заглушками. Амулет в гнезде подпрыгивает, когда срабатывает; при наведении — подсказка.
 */
export class AmuletRack {
  private readonly scene: Phaser.Scene;
  private readonly caps: Phaser.GameObjects.Image[] = []; // заглушки закрытых гнёзд
  private readonly badges: Phaser.GameObjects.Image[] = []; // амулет в гнезде; пустое гнездо — картинка скрыта
  private readonly amulets: (Amulet | null)[] = []; // какой амулет в каком гнезде
  private readonly copyLabels: Phaser.GameObjects.Text[] = []; // «×N» под гнездом: сколько копий (видна от двух)
  private readonly bonesLabel: Phaser.GameObjects.Text; // коллекционер костей: «+45%» под его гнездом

  /** sockets — сколько гнёзд открыто в начале. */
  constructor(scene: Phaser.Scene, sockets: number, hint: Hint) {
    this.scene = scene;
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    createSocketCapTexture(scene, SOCKET_RADIUS);
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
    const copies = this.copiesInRack(amulet.id);
    const name = copies > 1 ? `${t(amulet.name)} ×${copies}` : t(amulet.name);
    return [name, t(amulet.description)];
  }

  /** Сколько копий амулета id стоит по всем гнёздам. */
  private copiesInRack(id: AmuletId): number {
    return this.amulets.filter((amulet) => amulet?.id === id).length;
  }

  /** Обновить метки «×N» под гнёздами: у каждой копии — её номер среди таких же, метка видна со второй. */
  private refreshCopies(): void {
    const ordinals = new Map<AmuletId, number>();
    this.amulets.forEach((amulet, index) => {
      const label = this.copyLabels[index];
      if (!amulet) {
        label.setVisible(false);
        return;
      }
      const ordinal = (ordinals.get(amulet.id) ?? 0) + 1;
      ordinals.set(amulet.id, ordinal);
      label.setVisible(ordinal >= 2);
      if (ordinal >= 2) label.setX(SOCKET_XS[index] - COPY_LABEL_DX).setText(`×${ordinal}`);
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

  /** Купили амулет: он летит из (fromX, fromY) в гнездо index и там встаёт. */
  putAmulet(index: number, amulet: Amulet, fromX: number, fromY: number): void {
    this.amulets[index] = amulet;
    const badge = this.badges[index];
    const flying = this.scene.add.image(fromX, fromY, amuletTexture(amulet)).setScale(1.4).setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: flying,
      x: badge.x,
      y: badge.y,
      scale: 1,
      duration: FLY_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        flying.destroy();
        badge.setTexture(amuletTexture(amulet)).setVisible(true);
        this.refreshCopies();
        this.bounce(badge);
      },
    });
  }

  /** Амулеты по гнёздам заново, без анимации: так бывает, когда один отдали Коллектору и остальные сдвинулись. */
  setAmulets(amulets: Amulet[]): void {
    this.badges.forEach((badge, index) => {
      const amulet = amulets[index] ?? null;
      this.amulets[index] = amulet;
      badge.setVisible(amulet !== null);
      if (amulet) badge.setTexture(amuletTexture(amulet));
    });
    this.bonesLabel.setVisible(false); // сцена покажет заново, если коллекционер костей остался
    this.refreshCopies();
  }

  /** Амулет сработал: подпрыгивают все гнёзда с этим амулетом. */
  trigger(id: AmuletId): void {
    this.amulets.forEach((amulet, index) => {
      if (amulet?.id === id) this.bounce(this.badges[index]);
    });
  }

  /** Коллекционер костей: под его гнездом — сколько он уже прибавляет к выигрышам. */
  showBones(percent: number): void {
    const index = this.amulets.findIndex((amulet) => amulet?.id === 'bones');
    this.bonesLabel.setVisible(index >= 0 && percent > 0);
    if (index >= 0) this.bonesLabel.setX(SOCKET_XS[index]).setText(`+${percent}%`);
  }

  /** Подскок с увеличением. */
  private bounce(badge: Phaser.GameObjects.Image): void {
    this.scene.tweens.killTweensOf(badge);
    badge.setScale(1).setY(SOCKET_Y);
    this.scene.tweens.add({ targets: badge, scale: TRIGGER_SCALE, y: SOCKET_Y - 4, duration: TRIGGER_TIME, yoyo: true, ease: 'Quad.easeOut' });
  }
}
