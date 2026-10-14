import Phaser from 'phaser';

/**
 * Украшения «Долговой ямы»: фон, корпус автомата, лампочки и монетка.
 * Логики игры здесь нет. Картинок в проекте тоже нет — всё рисуется фигурами Phaser.
 */

/** Цвет выключенной лампочки. */
export const LAMP_OFF = 0x431407;
/** Имена текстур, нарисованных кодом: монетка и иконки кнопок. */
export const COIN_TEXTURE = 'coin';
export const LEVER_ICON = 'icon-lever';
export const COINS_ICON = 'icon-coins';
export const SHIELD_ICON = 'icon-shield';
export const SKULL_DOWN_ICON = 'icon-skull-down';
const BACKGROUND_TEXTURE = 'background-pattern';
const BOKEH_TEXTURE = 'bokeh';
/** Цвета панелей в стиле автомата. */
const PANEL_FILL = 0x0b1120;
const PANEL_BORDER = 0xb45309;
const PANEL_HEADER = 0x7f1d1d;

/**
 * Фон «зала казино»: градиент сверху вниз, узор-ковёр из ромбиков,
 * тёплое свечение за автоматом и медленно мерцающие размытые огоньки.
 */
export function drawBackground(scene: Phaser.Scene): void {
  // Градиент: сверху тёмно-фиолетовый, снизу почти чёрный. Это один прямоугольник — он дешёвый.
  const gradient = scene.add.graphics();
  gradient.fillGradientStyle(0x2a1158, 0x2a1158, 0x05030f, 0x05030f, 1);
  gradient.fillRect(0, 0, 960, 640);

  // Узор и свечение не меняются: рисуем их один раз в текстуру и дальше показываем одной картинкой.
  // Так не нужно перерисовывать сотни ромбиков каждый кадр — игра идёт и на слабом компьютере.
  if (!scene.textures.exists(BACKGROUND_TEXTURE)) bakeBackgroundPattern(scene);
  scene.add.image(0, 0, BACKGROUND_TEXTURE).setOrigin(0);

  drawBokehLights(scene);
}

/** Узор-ковёр и свечение за автоматом — в текстуру BACKGROUND_TEXTURE. */
function bakeBackgroundPattern(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Узор-ковёр: ряды маленьких ромбиков, каждый второй ряд со сдвигом.
  const step = 32;
  const size = 5;
  g.fillStyle(0x4c1d95, 0.35);
  for (let row = 0; row * step <= 640; row++) {
    const y = row * step;
    const shift = row % 2 === 0 ? 0 : step / 2;
    for (let x = shift; x <= 960; x += step) {
      g.fillTriangle(x - size, y, x + size, y, x, y - size); // верхняя половина ромбика
      g.fillTriangle(x - size, y, x + size, y, x, y + size); // нижняя половина
    }
  }

  // Свечение за автоматом: несколько полупрозрачных овалов друг в друге.
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0xf59e0b, 0.035);
    g.fillEllipse(480, 250, 760 - i * 90, 380 - i * 45);
  }
  g.generateTexture(BACKGROUND_TEXTURE, 960, 640);
  g.destroy();
}

/** Размытые огоньки на фоне: белый круг, перекрашенный в разные цвета; яркость медленно «дышит». */
function drawBokehLights(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BOKEH_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff);
    g.fillCircle(32, 32, 32);
    g.generateTexture(BOKEH_TEXTURE, 64, 64);
    g.destroy();
  }
  const colors = [0xfbbf24, 0xf472b6, 0xa78bfa, 0x60a5fa];
  for (let i = 0; i < 14; i++) {
    const radius = Phaser.Math.Between(18, 50);
    const light = scene.add
      .image(Phaser.Math.Between(0, 960), Phaser.Math.Between(0, 640), BOKEH_TEXTURE)
      .setScale(radius / 32)
      .setTint(colors[i % colors.length])
      .setAlpha(0.03);
    scene.tweens.add({
      targets: light,
      alpha: 0.1,
      duration: Phaser.Math.Between(1500, 3500),
      delay: Phaser.Math.Between(0, 2000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

/** Корпус автомата вокруг барабанов: тень, красный корпус с золотой рамкой, тёмное окно и стрелки линии выплат. */
export function drawCabinet(scene: Phaser.Scene, x: number, y: number, width: number, height: number): void {
  scene.add.rectangle(x + 6, y + 8, width, height, 0x000000, 0.4).setRounded(26); // тень
  scene.add.rectangle(x, y, width, height, 0x7f1d1d).setRounded(26).setStrokeStyle(6, 0xf59e0b); // корпус
  scene.add.rectangle(x, y, width - 20, height - 20, 0x020617).setRounded(18); // окно для барабанов

  // Золотые стрелки слева и справа показывают линию, по которой считается выигрыш.
  const left = x - width / 2 + 2;
  const right = x + width / 2 - 2;
  const g = scene.add.graphics();
  g.fillStyle(0xfbbf24);
  g.fillTriangle(left, y - 9, left, y + 9, left + 9, y);
  g.fillTriangle(right, y - 9, right, y + 9, right - 9, y);
}

/** Лампочки по верхнему и нижнему краю корпуса. Порядок — по кругу: верх слева направо, низ справа налево. */
export function createLamps(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Arc[] {
  const xs: number[] = [];
  for (let lampX = x - width / 2 + 24; lampX <= x + width / 2 - 24; lampX += 26) xs.push(lampX);
  const top = xs.map((lampX) => scene.add.circle(lampX, y - height / 2, 5, LAMP_OFF));
  const bottom = [...xs].reverse().map((lampX) => scene.add.circle(lampX, y + height / 2, 5, LAMP_OFF));
  return [...top, ...bottom];
}

/** Панель в стиле автомата: тёмный фон, золотая рамка и красная плашка под заголовок сверху. Возвращает обе части. */
export function drawPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Rectangle[] {
  const body = scene.add.rectangle(x, y, width, height, PANEL_FILL, 0.92).setRounded(14).setStrokeStyle(3, PANEL_BORDER);
  const header = scene.add.rectangle(x, y - height / 2 + 18, width - 10, 26, PANEL_HEADER).setRounded(8);
  return [body, header];
}

/** Табличка под надписью (например, «НА КОНУ»): тёмная, с золотой рамкой. */
export function drawPlaque(scene: Phaser.Scene, x: number, y: number, width: number, height: number): void {
  scene.add.rectangle(x, y, width, height, PANEL_FILL, 0.92).setRounded(12).setStrokeStyle(2, PANEL_BORDER);
}

/** Иконки кнопок: рычаг автомата («крутить») и стопка монет («забрать»). Рисуются один раз. */
export function createIconTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(LEVER_ICON)) {
    const g = scene.add.graphics();
    g.fillStyle(0x94a3b8);
    g.fillRoundedRect(8, 31, 24, 8, 3); // основание
    g.fillStyle(0xe2e8f0);
    g.fillRect(17, 12, 6, 21); // ручка
    g.fillStyle(0x1f2937);
    g.fillCircle(20, 10, 9); // тёмный ободок шарика
    g.fillStyle(0xef4444);
    g.fillCircle(20, 10, 7); // красный шарик
    g.fillStyle(0xfecaca);
    g.fillCircle(17, 7, 2.5); // блик
    g.generateTexture(LEVER_ICON, 40, 40);
    g.destroy();
  }
  if (!scene.textures.exists(COINS_ICON)) {
    const g = scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      const y = 29 - i * 8;
      g.fillStyle(0x92400e);
      g.fillEllipse(20, y + 3, 30, 12); // ребро монеты
      g.fillStyle(0xfbbf24);
      g.fillEllipse(20, y, 30, 12); // монета
    }
    g.generateTexture(COINS_ICON, 40, 40);
    g.destroy();
  }
  if (!scene.textures.exists(SHIELD_ICON)) {
    const g = scene.add.graphics();
    g.fillStyle(0x1e3a8a);
    fillShield(g, 20, 3, 32, 35); // тёмный ободок
    g.fillStyle(0x3b82f6);
    fillShield(g, 20, 6, 26, 29); // синий щит
    g.fillStyle(0x93c5fd);
    g.fillRect(18, 10, 4, 20); // светлая полоса посередине
    g.generateTexture(SHIELD_ICON, 40, 40);
    g.destroy();
  }
  if (!scene.textures.exists(SKULL_DOWN_ICON)) {
    const g = scene.add.graphics();
    g.fillStyle(0xe5e7eb);
    g.fillCircle(16, 15, 11); // голова
    g.fillRect(10, 21, 12, 10); // челюсть
    g.fillStyle(0x111827);
    g.fillCircle(12, 15, 3); // глаза
    g.fillCircle(20, 15, 3);
    g.fillRect(13, 26, 2, 5); // щели между зубами
    g.fillRect(17, 26, 2, 5);
    g.fillStyle(0x22c55e);
    g.fillRect(31, 12, 5, 13); // зелёная стрелка вниз: «черепов меньше»
    g.fillTriangle(27, 24, 40, 24, 33.5, 34);
    g.generateTexture(SKULL_DOWN_ICON, 40, 40);
    g.destroy();
  }
}

/** Щит: сверху ровный, по бокам прямой, снизу острый. cx — середина, top — верх. */
function fillShield(g: Phaser.GameObjects.Graphics, cx: number, top: number, width: number, height: number): void {
  g.beginPath();
  g.moveTo(cx - width / 2, top);
  g.lineTo(cx + width / 2, top);
  g.lineTo(cx + width / 2, top + height * 0.5);
  g.lineTo(cx, top + height);
  g.lineTo(cx - width / 2, top + height * 0.5);
  g.closePath();
  g.fillPath();
}

/** Текстура монетки: рисуем кругами и сохраняем как картинку в памяти. После рестарта сцены она уже есть. */
export function createCoinTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(COIN_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xb45309);
  g.fillCircle(10, 10, 10); // тёмный ободок
  g.fillStyle(0xfbbf24);
  g.fillCircle(10, 10, 8); // золото
  g.fillStyle(0xfef3c7);
  g.fillCircle(7, 7, 2.5); // блик
  g.generateTexture(COIN_TEXTURE, 20, 20);
  g.destroy();
}
