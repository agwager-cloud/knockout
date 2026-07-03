import Phaser from 'phaser';
import { addSoundToggle, ensureBackgroundMusic, preloadBackgroundMusic } from '../audio/AudioManager';
import { getMyId, sendKickPlayer, sendSetBotMode, sendStartGame, watchState } from '../net/Net';
import type { BotMode, GameSnapshot, PlayerSnapshot } from '../shared';

export class LobbyScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private state: GameSnapshot | null = null;
  private graphics!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private codeText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Text;
  private botButton!: Phaser.GameObjects.Text;
  private manageButton!: Phaser.GameObjects.Text;
  private helpText?: Phaser.GameObjects.Text;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private manageOpen = false;
  private manageObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('LobbyScene');
  }

  preload(): void {
    preloadBackgroundMusic(this);
    this.load.image('other-bg', 'assets/backgrounds/otherbg.jpg');
  }

  create(): void {
    ensureBackgroundMusic(this);
    this.add.image(640, 360, 'other-bg').setDisplaySize(1280, 720).setDepth(-20);
    addSoundToggle(this, 1200, 92);
    this.graphics = this.add.graphics();

    this.titleText = this.add.text(640, 42, 'Knockout Lobby', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '44px',
      color: '#ffffff',
      stroke: '#07314d',
      strokeThickness: 8
    }).setOrigin(0.5);

    this.codeText = this.add.text(34, 34, '', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '28px',
      color: '#fff5c6',
      stroke: '#1d425d',
      strokeThickness: 5
    }).setOrigin(0, 0.5);

    this.countText = this.add.text(1110, 36, '', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#dff7ff',
      fontStyle: 'bold'
    }).setOrigin(1, 0.5);

    this.manageButton = this.add.text(180, 650, 'MANAGE PLAYERS', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '19px',
      color: '#ffffff',
      backgroundColor: '#0f5f8b',
      padding: { x: 22, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.manageButton.on('pointerdown', () => {
      if (!this.isHost()) return;
      this.manageOpen = !this.manageOpen;
      this.renderLobby();
    });

    this.startButton = this.add.text(640, 650, 'START GAME', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '30px',
      color: '#ffffff',
      backgroundColor: '#1688c8',
      padding: { x: 34, y: 13 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.startButton.on('pointerdown', () => {
      if (this.isHost()) sendStartGame();
    });

    this.botButton = this.add.text(1095, 650, 'BOTS: OFF', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '19px',
      color: '#ffffff',
      backgroundColor: '#ef8d23',
      padding: { x: 24, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.botButton.on('pointerdown', () => {
      if (!this.isHost() || !this.state) return;
      sendSetBotMode(this.nextBotMode(this.getBotMode()));
    });

    this.unsubscribe = watchState((state) => {
      this.state = state;
      if (state.phase !== 'lobby') {
        this.clearManagePanel();
        this.scene.start('GameScene');
        return;
      }
      this.renderLobby();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.clearManagePanel();
    });
  }

  private isHost(): boolean {
    const myId = getMyId();
    return !!this.state?.players.find((p) => p.id === myId && p.host);
  }

  private renderLobby(): void {
    if (!this.state) return;

    const g = this.graphics;
    g.clear();
    g.fillStyle(0x061a2b, 0.32);
    g.fillRect(0, 0, 1280, 720);

    g.fillStyle(0x0f5480, 1);
    g.fillRoundedRect(70, 108, 1140, 458, 32);
    g.fillStyle(0xe9fbff, 0.92);
    g.fillRoundedRect(96, 132, 1088, 392, 24);
    g.lineStyle(5, 0x8edcff, 1);
    g.strokeRoundedRect(96, 132, 1088, 392, 24);

    this.codeText.setText(`Code: ${this.state.roomCode}`);
    this.countText.setText(`${this.state.players.length}/40 players`);

    for (const text of this.playerTexts) text.destroy();
    this.playerTexts = [];

    const cols = 5;
    const rows = 8;
    const cellW = 204;
    const cellH = 43;
    const slotW = 180;
    const slotH = 30;
    const startX = 141;
    const startY = 154;

    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellW;
      const y = startY + row * cellH;
      const p = this.state.players[i];

      g.fillStyle(p ? Number.parseInt(p.color.replace('#', '0x')) : 0xd2eef7, p ? 1 : 0.42);
      g.fillRoundedRect(x, y, slotW, slotH, 10);
      g.lineStyle(2, 0xffffff, 0.85);
      g.strokeRoundedRect(x, y, slotW, slotH, 10);

      const label = p ? `${p.host ? '★ ' : ''}${p.name}${p.isBot ? ' BOT' : ''}` : '';
      const t = this.add.text(x + slotW / 2, y + slotH / 2, this.trimLabel(label), {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: p ? '#ffffff' : '#5d8798',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.playerTexts.push(t);
    }

    const host = this.isHost();
    this.startButton.setAlpha(host ? 1 : 0.45);
    this.startButton.setText(host ? 'START GAME' : 'WAITING FOR HOST');

    const botCount = this.state.players.filter((p) => p.isBot).length;
    const botMode = this.getBotMode();
    this.botButton.setVisible(host);
    this.botButton.setText(
      botMode === 'off'
        ? 'BOTS: OFF'
        : botMode === 'eight'
          ? `8 BOTS (${botCount})`
          : `FILL 40 (${botCount})`
    );
    this.botButton.setBackgroundColor(
      botMode === 'off' ? '#ef8d23' : botMode === 'eight' ? '#16a34a' : '#7c3aed'
    );

    this.manageButton.setVisible(host);
    this.manageButton.setText(this.manageOpen ? 'CLOSE MANAGE' : 'MANAGE PLAYERS');

    this.addOrUpdateHelpText(host, botCount);

    if (this.manageOpen && host) this.renderManagePanel();
    else this.clearManagePanel();
  }

  private trimLabel(label: string): string {
    return label.length > 18 ? `${label.slice(0, 17)}…` : label;
  }

  private addOrUpdateHelpText(host: boolean, botCount: number): void {
    if (!this.helpText) {
      this.helpText = this.add.text(640, 596, '', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#d8f6ff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 1000 }
      }).setOrigin(0.5);
    }
    const botMode = this.getBotMode();
    this.helpText.setText(
      host
        ? botMode === 'fill'
          ? `Fill mode is on. Bots fill empty spots up to 40 and leave when real players join.`
          : botCount > 0
            ? `Start when ready. ${botCount} bots are included.`
            : 'Start when ready, or use the bot button for 8 bots or fill-to-40 testing.'
        : 'Your penguin is ready. The host will start the match.'
    );
  }

  private getBotMode(): BotMode {
    return this.state?.botMode ?? (this.state?.botsEnabled ? 'eight' : 'off');
  }

  private nextBotMode(mode: BotMode): BotMode {
    if (mode === 'off') return 'eight';
    if (mode === 'eight') return 'fill';
    return 'off';
  }

  private clearManagePanel(): void {
    for (const object of this.manageObjects) object.destroy();
    this.manageObjects = [];
  }

  private renderManagePanel(): void {
    if (!this.state) return;
    this.clearManagePanel();

    const overlay = this.add.graphics().setDepth(2000);
    overlay.fillStyle(0x001827, 0.72);
    overlay.fillRect(0, 0, 1280, 720);
    overlay.fillStyle(0xe9fbff, 0.98);
    overlay.fillRoundedRect(110, 86, 1060, 520, 28);
    overlay.lineStyle(6, 0x0f5f8b, 1);
    overlay.strokeRoundedRect(110, 86, 1060, 520, 28);
    this.manageObjects.push(overlay);

    this.manageObjects.push(this.add.text(640, 118, 'Manage Players', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '34px',
      color: '#07314d'
    }).setOrigin(0.5).setDepth(2001));

    this.manageObjects.push(this.add.text(640, 152, 'Remove only students with inappropriate names.', {
      fontFamily: 'Arial',
      fontSize: '17px',
      color: '#23536d',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(2001));

    const close = this.add.text(1128, 118, 'X', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#ef4444',
      padding: { x: 12, y: 5 }
    }).setOrigin(0.5).setDepth(2002).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.manageOpen = false;
      this.renderLobby();
    });
    this.manageObjects.push(close);

    const kickable = this.state.players.filter((p) => !p.host && !p.isBot && p.connected);
    if (kickable.length === 0) {
      this.manageObjects.push(this.add.text(640, 330, 'No student players to manage yet.', {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#07314d',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(2001));
      return;
    }

    const colW = 330;
    const rowH = 32;
    const startX = 185;
    const startY = 190;
    const rowsPerCol = 12;

    kickable.slice(0, 36).forEach((player, index) => {
      const col = Math.floor(index / rowsPerCol);
      const row = index % rowsPerCol;
      const x = startX + col * colW;
      const y = startY + row * rowH;
      this.addManageRow(player, x, y);
    });

    if (kickable.length > 36) {
      this.manageObjects.push(this.add.text(640, 585, 'Only the first 36 students are shown. Kick some players to reveal the rest.', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#23536d',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(2001));
    }
  }

  private addManageRow(player: PlayerSnapshot, x: number, y: number): void {
    const row = this.add.rectangle(x + 130, y + 13, 290, 26, 0xd2eef7, 0.92)
      .setOrigin(0.5)
      .setDepth(2001);
    this.manageObjects.push(row);

    const name = this.add.text(x, y + 13, this.trimLabel(player.name), {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#07314d',
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(2002);
    this.manageObjects.push(name);

    const kick = this.add.text(x + 210, y + 13, 'KICK', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#ef4444',
      padding: { x: 10, y: 4 }
    }).setOrigin(0, 0.5).setDepth(2002).setInteractive({ useHandCursor: true });
    kick.on('pointerdown', () => {
      kick.setText('KICKED');
      kick.disableInteractive();
      sendKickPlayer(player.id);
    });
    this.manageObjects.push(kick);
  }
}
