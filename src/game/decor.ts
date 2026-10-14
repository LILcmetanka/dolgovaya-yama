import Phaser from 'phaser';

/**
 * Украшения «Долговой ямы»: фон, корпус автомата, лампочки и монетка.
 * Логики игры здесь нет. Картинок в проекте тоже нет — всё рисуется фигурами Phaser.
 */

/** Цвет выключенной лампочки. */
export const LAMP_OFF = 0x431407;
/** Имя текстуры монетки. */
export const COIN_TEXTURE = 'coin';

/** Фон — тёмный «ковёр казино»: ряды маленьких ромбиков, каждый второй ряд со сдвигом. */
export function drawBackground(scene: Phaser.Scene): void {
  const step = 32;
  const size = 5;
  const g = scene.add.graphics();
  g.fillStyle(0x1e293b, 0.6);
  for (let row = 0; row * step <= 640; row++) {
    const y = row * step;
    const shift = row % 2 === 0 ? 0 : step / 2;
    for (let x = shift; x <= 960; x += step) {
      g.fillTriangle(x - size, y, x + size, y, x, y - size); // верхняя половина ромбика
      g.fillTriangle(x - size, y, x + size, y, x, y + size); // нижняя половина
    }
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
