import Phaser from 'phaser';
import { ACHIEVEMENT_FADE, ACHIEVEMENT_TIME, type Achievement } from '../achievements';
import { t } from '../lang';
import { CENTER_X, GRID_Y } from '../layout';
import { addText, GOLD_TEXT, POPUP_DEPTH } from '../theme';

// Окно ачивки: тёмная панель с золотой рамкой, как у прочих окон игры. Числа — в единицах раскладки.
const PANEL_WIDTH = 580;
const PANEL_HEIGHT = 182; // хватает на название в две строки и описание в две
const PANEL_COLOR = 0x0b0f19; // как у подсказки и панели магазина
const PANEL_BORDER = 0xb45309; // медно-золотая рамка
const PANEL_FILL_ALPHA = 0.94; // почти непрозрачная: символы сетки сквозь окно не читаются
const SCRIM_PAD = 22; // тёмный ореол под панелью: отбивает окно от яркой сетки
const SCRIM_COLOR = 0x000000;
const SCRIM_ALPHA = 0.45;
const ICON_X = -PANEL_WIDTH / 2 + 88; // центр иконки — у левого края
const ICON_FONT = '64px'; // иконка крупно: это эмодзи, поэтому кегль, а не картинка
const TEXT_LEFT = -PANEL_WIDTH / 2 + 166; // левый край текстовой колонки
const TEXT_WIDTH = PANEL_WIDTH - 166 - 28; // тексты переносятся по словам и не вылезают за панель
const CAPTION_Y = -PANEL_HEIGHT / 2 + 26;
const ICON_Y = 6;
const TITLE_Y = -PANEL_HEIGHT / 2 + 56; // верх названия: дальше описание встаёт под ним по фактической высоте
const TITLE_FONT = '24px'; // кегль подобран так, чтобы длинные EN-названия влезали в две строки
const TITLE_GAP = 6; // между названием и описанием
const APPEAR_TIME = 180; // окно проявляется и подрастает, мс
const APPEAR_SCALE = 0.88; // с какого масштаба растёт

/**
 * Окно полученной ачивки на экране автомата: по центру сетки, иконка крупно, название, под ним описание.
 * Живёт ACHIEVEMENT_TIME и тает. Кликов не ловит: интерактивных зон у него нет, поэтому игра под ним работает.
 * Длинные названия («A pack of skeletons in the pocket») переносятся по словам и сжимаются до двух строк,
 * описание — тоже две строки: за панель ничего не вылезает. Окно показывает одну ачивку за раз и зовёт onDone,
 * когда освободилось; очередь — в BaseScene.pumpAchievements.
 */
export class AchievementWindow {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly icon: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly what: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent; // сколько ещё окно висит

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Затемнение под окном: сетка под панелью притушена, окно читается как отдельное окно, а не как надпись на символах.
    const scrim = scene.add.rectangle(0, 0, PANEL_WIDTH + 2 * SCRIM_PAD, PANEL_HEIGHT + 2 * SCRIM_PAD, SCRIM_COLOR, SCRIM_ALPHA);
    const panel = scene.add.rectangle(0, 0, PANEL_WIDTH, PANEL_HEIGHT, PANEL_COLOR, PANEL_FILL_ALPHA).setStrokeStyle(3, PANEL_BORDER);
    const caption = addText(scene, TEXT_LEFT, CAPTION_Y, t('achievementUnlocked'), { fontSize: '13px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0, 0.5);
    this.icon = addText(scene, ICON_X, ICON_Y, '', { fontSize: ICON_FONT }).setOrigin(0.5);
    // Название: сверху колонки, по словам, не больше двух строк — иначе длинное EN-название уезжало за панель.
    this.title = addText(scene, TEXT_LEFT, TITLE_Y, '', {
      fontSize: TITLE_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
      wordWrap: { width: TEXT_WIDTH },
      maxLines: 2,
    }).setOrigin(0, 0);
    this.what = addText(scene, TEXT_LEFT, 0, '', { fontSize: '18px', color: '#e2e8f0', wordWrap: { width: TEXT_WIDTH }, maxLines: 2 }).setOrigin(0, 0);
    // Один контейнер: его двигаем и гасим целиком. Слой — над сеткой и панелью магазина, под подсказкой и экраном конца забега.
    this.container = scene.add.container(CENTER_X, GRID_Y, [scrim, panel, caption, this.icon, this.title, this.what]);
    this.container.setDepth(POPUP_DEPTH + 1).setVisible(false);
  }

  /**
   * Показать ачивку: окно проявляется, висит ACHIEVEMENT_TIME, тает и зовёт onDone.
   * Описание ставится под названием по его фактической высоте: одна строка названия или две — низ окна не рвётся.
   */
  show(achievement: Achievement, onDone: () => void): void {
    this.icon.setText(achievement.icon);
    this.title.setText(t(achievement.name)); // формулировку автора не переписываем: как в названии, так и на экране
    this.what.setText(t(achievement.what));
    this.what.setY(this.title.y + this.title.height + TITLE_GAP);
    this.timer?.remove(); // предыдущий таймер (если окно почему-то ещё висело) больше не нужен
    this.container.setVisible(true).setAlpha(0).setScale(APPEAR_SCALE);
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scale: 1,
      duration: APPEAR_TIME,
      ease: 'Back.easeOut',
    });
    this.timer = this.scene.time.delayedCall(ACHIEVEMENT_TIME, () => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: ACHIEVEMENT_FADE,
        onComplete: () => {
          this.container.setVisible(false);
          onDone();
        },
      });
    });
  }
}
