import Phaser from 'phaser';
import { addSoundToggle, ensureBackgroundMusic, preloadBackgroundMusic } from '../audio/AudioManager';
import { getMyId, sendPlayAgain, sendReturnLobby, watchState } from '../net/Net';
import type { GameSnapshot } from '../shared';

export class ResultsScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private state: GameSnapshot | null = null;
  private graphics!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private playAgainButton!: Phaser.GameObjects.Text;
  private lobbyButton!: Phaser.GameObjects.Text;
  private playAgainHitZone!: Phaser.GameObjects.Zone;
  private lobbyHitZone!: Phaser.GameObjects.Zone;

  constructor() {
    super('ResultsScene');
  }

  preload(): void {
    preloadBackgroundMusic(this);
    this.load.image('other-bg', 'assets/backgrounds/otherbg.jpg');
  }

  create(): void {
    ensureBackgroundMusic(this);
    this.add.image(640, 360, 'other-bg').setDisplaySize(1280, 720).setDepth(-20);
    addSoundToggle(this);
    this.texts = [];
    this.unsubscribe = undefined;
    this.graphics = this.add.graphics();

    this.playAgainButton = this.add.text(470, 668, 'PLAY AGAIN', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#1688c8',
      padding: { x: 24, y: 11 }
    }).setOrigin(0.5).setDepth(20);

    this.lobbyButton = this.add.text(790, 668, 'RETURN TO LOBBY', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#ef8d23',
      padding: { x: 24, y: 11 }
    }).setOrigin(0.5).setDepth(20);

    // Large invisible hit zones make the buttons reliable on touch screens and desktop browsers.
    this.playAgainHitZone = this.add.zone(470, 668, 250, 68).setInteractive({ useHandCursor: true }).setDepth(30);
    this.lobbyHitZone = this.add.zone(790, 668, 335, 68).setInteractive({ useHandCursor: true }).setDepth(30);

    this.playAgainHitZone.on('pointerdown', this.handlePlayAgain, this);
    this.lobbyHitZone.on('pointerdown', this.handleReturnLobby, this);

    this.unsubscribe = watchState((state) => {
      this.state = state;
      if (state.phase === 'aiming' || state.phase === 'rolling') {
        this.scene.start('GameScene');
        return;
      }
      if (state.phase === 'lobby') {
        this.scene.start('LobbyScene');
        return;
      }
      this.renderResults();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.playAgainHitZone.off('pointerdown', this.handlePlayAgain, this);
      this.lobbyHitZone.off('pointerdown', this.handleReturnLobby, this);
      this.clearTexts();
    });
  }

  private handlePlayAgain(): void {
    if (!this.isHost() || !this.state?.championId) return;
    this.playAgainButton.setText('STARTING...');
    this.playAgainHitZone.disableInteractive();
    sendPlayAgain();
  }

  private handleReturnLobby(): void {
    if (!this.isHost()) return;
    this.lobbyButton.setText('RETURNING...');
    this.lobbyHitZone.disableInteractive();
    sendReturnLobby();
  }

  private isHost(): boolean {
    const myId = getMyId();
    return !!this.state?.players.find((p) => p.id === myId && p.host && !p.isBot);
  }

  private clearTexts(): void {
    for (const text of this.texts) {
      if (text.scene) text.destroy();
    }
    this.texts = [];
  }

  private addText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    const created = this.add.text(x, y, text, style).setDepth(10);
    this.texts.push(created);
    return created;
  }

  private renderResults(): void {
    if (!this.state) return;
    this.clearTexts();

    const g = this.graphics;
    g.clear();
    g.setDepth(0);
    g.fillStyle(0x061a2b, 0.42);
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle(0x0b547d, 1);
    g.fillRoundedRect(70, 78, 1140, 548, 34);
    g.fillStyle(0xedfbff, 0.94);
    g.fillRoundedRect(100, 108, 1080, 470, 26);
    g.lineStyle(6, 0x96e6ff, 1);
    g.strokeRoundedRect(100, 108, 1080, 470, 26);

    this.addText(640, 40, 'Knockout Results', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '50px',
      color: '#ffffff',
      stroke: '#07314d',
      strokeThickness: 8
    }).setOrigin(0.5);

    const champion = this.state.players.find((p) => p.id === this.state?.championId);
    const championName = champion?.name ?? this.state.championName ?? 'Champion';
    const championColor = champion?.color ?? '#1688c8';

    g.fillStyle(Number.parseInt(championColor.replace('#', '0x')), 1);
    g.fillRoundedRect(230, 126, 820, 88, 24);
    g.lineStyle(4, 0xffffff, 0.85);
    g.strokeRoundedRect(230, 126, 820, 88, 24);

    this.addText(640, 144, 'CHAMPION', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '25px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.addText(640, 181, `🏆 ${championName} 🏆`, {
      fontFamily: 'Arial Black, Arial',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#07314d',
      strokeThickness: 5
    }).setOrigin(0.5);

    this.addText(190, 246, 'Elimination order', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '27px',
      color: '#07314d'
    });

    const entries = [...this.state.eliminationOrder].reverse();
    if (entries.length === 0) {
      this.addText(190, 300, 'No penguins were eliminated.', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#123047',
        fontStyle: 'bold'
      });
    } else {
      const startY = 294;
      const maxRows = entries.length > 20 ? Math.ceil(entries.length / 2) : entries.length;
      const lineH = maxRows > 13 ? 20 : 28;
      const fontSize = maxRows > 13 ? 17 : 21;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const col = i < maxRows ? 0 : 1;
        const row = col === 0 ? i : i - maxRows;
        const x = col === 0 ? 190 : 680;
        const y = startY + row * lineH;
        const originalOrder = entries.length - i;
        this.addText(x, y, `${originalOrder}. ${entry.name} — round ${entry.round}`, {
          fontFamily: 'Arial',
          fontSize: `${fontSize}px`,
          color: '#123047',
          fontStyle: 'bold'
        });
      }
    }

    const host = this.isHost();
    const playAgainEnabled = host && !!this.state.championId;
    this.playAgainButton.setAlpha(playAgainEnabled ? 1 : 0.45);
    this.playAgainButton.setText(playAgainEnabled ? 'PLAY AGAIN' : host ? 'WAITING...' : 'HOST ONLY');
    if (playAgainEnabled) this.playAgainHitZone.setInteractive({ useHandCursor: true });
    else this.playAgainHitZone.disableInteractive();

    this.lobbyButton.setAlpha(host ? 1 : 0.45);
    this.lobbyButton.setText(host ? 'RETURN TO LOBBY' : 'HOST ONLY');
    if (host) this.lobbyHitZone.setInteractive({ useHandCursor: true });
    else this.lobbyHitZone.disableInteractive();

    this.addText(640, 613, host ? 'Host can replay immediately or return everyone to the lobby.' : 'Waiting for the host to start the next game.', {
      fontFamily: 'Arial',
      fontSize: '19px',
      color: '#d8f6ff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }
}
