import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GAME_HEIGHT, GAME_WIDTH } from './layout';
import { initMetrics } from './metrics';
import { ROOM_COLOR } from './theme';

/** Цвет тона комнаты строкой для CSS/Phaser: '#241a0b'. */
export const ROOM_BACKGROUND = '#' + ROOM_COLOR.toString(16).padStart(6, '0');

export function createGame(parent: string): Phaser.Game {
  initMetrics(); // один раз на старте: номер счётчика и флаги init живут в metrics.ts

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH, // Full HD: камера увеличивает раскладку (layout.ts, ZOOM)
    height: GAME_HEIGHT,
    // Поля вокруг картинки — тон комнаты, а не чёрные полосы: на телефоне боком их видно по краям.
    backgroundColor: ROOM_BACKGROUND,
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT, // на всё окно, 16:9; лишнее по краям окна — поля комнаты
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Звуки Phaser не нужны: весь звук синтезирует sound.ts. Без этого Phaser сам создаёт ещё один AudioContext при запуске.
    audio: { noAudio: true },
  };

  return new Phaser.Game(config);
}
