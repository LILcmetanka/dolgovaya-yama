import Phaser from 'phaser';
import type { Lang } from '../lang';
import { VIEW_CENTER_X } from '../layout';
import { VOLUME_STEPS, type VolumeKind, type Volumes } from '../settings';
import { addText, GAME_OVER_DEPTH, GOLD_TEXT, LAMP_GOLD, LAMP_OFF } from '../theme';

// Три ряда настроек по центру экрана паузы: звуки, музыка, язык. x — от середины вида.
const ROW_Y: Record<VolumeKind | 'language', number> = { sfx: 290, music: 360, language: 430 };
const ICON_X = VIEW_CENTER_X - 130; // значок ряда
const MINUS_X = VIEW_CENTER_X - 70; // «−»
const LAMP_X = VIEW_CENTER_X - 25; // первая лампочка громкости
const LAMP_STEP = 34;
const PLUS_X = LAMP_X + VOLUME_STEPS * LAMP_STEP + 11; // «+» — за последней лампочкой
const LANGUAGE_XS: Record<Lang, number> = { ru: VIEW_CENTER_X - 25, en: VIEW_CENTER_X + 55 };
// Вид.
const BUTTON_RADIUS = 20; // «−» и «+»: крупные, чтобы попасть и пальцем
const LAMP_RADIUS = 11;
const LANGUAGE_BUTTON = { width: 64, height: 38 };
const FRAME_GOLD = 0xfbbf24;
const FRAME_GRAY = 0x6b7280;
const BUTTON_FILL = 0x1c1917;
const MUTED_ALPHA = 0.35; // громкость 0 — значок ряда бледный
const SETTINGS_DEPTH = GAME_OVER_DEPTH + 0.5; // над экраном паузы, под значками в углу
const ICONS: Record<VolumeKind, string> = { sfx: '🔊', music: '🎵' };

type PanelObject = Phaser.GameObjects.Text | Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;

/**
 * Настройки на экране паузы — три параметра без слов: 🔊 громкость звуков и 🎵 громкость музыки
 * («−», лампочки, «+»; клик по лампочке — сразу эта громкость) и язык (RU или EN, выбранный — в золотой рамке).
 * Что поменять, решает сцена (колбэки); панель только показывает, что выбрано.
 */
export class SettingsPanel {
  private readonly objects: PanelObject[] = [];
  private readonly icons = new Map<VolumeKind, Phaser.GameObjects.Text>();
  private readonly lamps = new Map<VolumeKind, Phaser.GameObjects.Arc[]>();
  private readonly languageFrames = new Map<Lang, Phaser.GameObjects.Rectangle>();
  private volumes: Volumes = { sfx: 0, music: 0 };

  /** changeVolume(kind, level) — нажали «−», «+» или лампочку; chooseLanguage(lang) — нажали RU или EN. */
  constructor(
    scene: Phaser.Scene,
    changeVolume: (kind: VolumeKind, level: number) => void,
    chooseLanguage: (language: Lang) => void,
  ) {
    for (const kind of ['sfx', 'music'] as const) this.addVolumeRow(scene, kind, changeVolume);
    this.addLanguageRow(scene, chooseLanguage);
    for (const object of this.objects) object.setDepth(SETTINGS_DEPTH).setScrollFactor(0).setVisible(false);
  }

  /** Ряд громкости: значок, «−», лампочки, «+». */
  private addVolumeRow(scene: Phaser.Scene, kind: VolumeKind, changeVolume: (kind: VolumeKind, level: number) => void): void {
    const y = ROW_Y[kind];
    const icon = addText(scene, ICON_X, y, ICONS[kind], { fontSize: '28px' }).setOrigin(0.5);
    this.icons.set(kind, icon);
    this.objects.push(icon);
    this.addRoundButton(scene, MINUS_X, y, '−', () => changeVolume(kind, this.volumes[kind] - 1));
    const lamps: Phaser.GameObjects.Arc[] = [];
    for (let index = 0; index < VOLUME_STEPS; index++) {
      const lamp = scene.add.circle(LAMP_X + index * LAMP_STEP, y, LAMP_RADIUS, LAMP_OFF).setStrokeStyle(2, 0x000000);
      lamp.setInteractive({ useHandCursor: true });
      lamp.on('pointerdown', () => changeVolume(kind, index + 1)); // лампочка — сразу эта ступень
      lamps.push(lamp);
    }
    this.lamps.set(kind, lamps);
    this.objects.push(...lamps);
    this.addRoundButton(scene, PLUS_X, y, '+', () => changeVolume(kind, this.volumes[kind] + 1));
  }

  /** Круглая кнопка со знаком («−» или «+»). */
  private addRoundButton(scene: Phaser.Scene, x: number, y: number, sign: string, press: () => void): void {
    const button = scene.add.circle(x, y, BUTTON_RADIUS, BUTTON_FILL).setStrokeStyle(2, FRAME_GOLD);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', press);
    const label = addText(scene, x, y - 2, sign, { fontSize: '26px', fontStyle: 'bold' }).setOrigin(0.5);
    this.objects.push(button, label);
  }

  /** Ряд языка: значок 🌐 и кнопки RU и EN. */
  private addLanguageRow(scene: Phaser.Scene, chooseLanguage: (language: Lang) => void): void {
    const y = ROW_Y.language;
    this.objects.push(addText(scene, ICON_X, y, '🌐', { fontSize: '28px' }).setOrigin(0.5));
    for (const language of ['ru', 'en'] as const) {
      const x = LANGUAGE_XS[language];
      const frame = scene.add.rectangle(x, y, LANGUAGE_BUTTON.width, LANGUAGE_BUTTON.height, BUTTON_FILL).setRounded(8);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerdown', () => chooseLanguage(language));
      const label = addText(scene, x, y, language.toUpperCase(), { fontSize: '18px', fontStyle: 'bold', color: GOLD_TEXT });
      this.languageFrames.set(language, frame);
      this.objects.push(frame, label.setOrigin(0.5));
    }
  }

  /** Показать панель с нынешними громкостями и языком. */
  show(volumes: Volumes, language: Lang): void {
    for (const object of this.objects) object.setVisible(true);
    this.showVolumes(volumes);
    this.showLanguage(language);
  }

  hide(): void {
    for (const object of this.objects) object.setVisible(false);
  }

  /** Громкости: горит столько лампочек, какая ступень; на 0 значок ряда бледный (у звуков — 🔇). */
  showVolumes(volumes: Volumes): void {
    this.volumes = { ...volumes };
    for (const kind of ['sfx', 'music'] as const) {
      this.lamps.get(kind)?.forEach((lamp, index) => lamp.setFillStyle(index < volumes[kind] ? LAMP_GOLD : LAMP_OFF));
      const icon = this.icons.get(kind);
      icon?.setAlpha(volumes[kind] > 0 ? 1 : MUTED_ALPHA);
      if (kind === 'sfx') icon?.setText(volumes.sfx > 0 ? '🔊' : '🔇');
    }
  }

  /** Выбранный язык — в золотой рамке, другой — в серой. */
  showLanguage(language: Lang): void {
    this.languageFrames.forEach((frame, key) => {
      const isChosen = key === language;
      frame.setStrokeStyle(isChosen ? 3 : 2, isChosen ? FRAME_GOLD : FRAME_GRAY).setAlpha(isChosen ? 1 : 0.6);
    });
  }
}
