import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GAME_HEIGHT, GAME_WIDTH } from './layout';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH, // Full HD: камера увеличивает раскладку (layout.ts, ZOOM)
    height: GAME_HEIGHT,
    backgroundColor: '#000000',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT, // на всё окно, 16:9; лишнее по краям окна — чёрное, как комната
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Звуки Phaser не нужны: весь звук синтезирует sound.ts. Без этого Phaser сам создаёт ещё один AudioContext при запуске.
    audio: { noAudio: true },
  };

  return new Phaser.Game(config);
}
