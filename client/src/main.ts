import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './shared';
import { StartScene } from './scenes/StartScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { ResultsScene } from './scenes/ResultsScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#061a2b',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  dom: {
    createContainer: true
  },
  scene: [StartScene, LobbyScene, GameScene, ResultsScene]
};

const game = new Phaser.Game(config);

window.setTimeout(() => {
  const bootMessage = document.getElementById('bootMessage');
  bootMessage?.remove();
}, 500);

export default game;
