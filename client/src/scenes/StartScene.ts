import Phaser from 'phaser';
import { addSoundToggle, ensureBackgroundMusic, preloadBackgroundMusic } from '../audio/AudioManager';
import { hostGame, joinGame, HTTP_SERVER_URL } from '../net/Net';

export class StartScene extends Phaser.Scene {
  private panel?: Phaser.GameObjects.DOMElement;

  constructor() {
    super('StartScene');
  }

  preload(): void {
    preloadBackgroundMusic(this);
    this.load.image('start-bg', 'assets/backgrounds/startscenebg.jpg');
  }

  create(): void {
    ensureBackgroundMusic(this);
    addSoundToggle(this);
    this.drawBackground();
    this.createForm();
  }

  shutdown(): void {
    this.panel?.destroy();
  }

  private drawBackground(): void {
    this.add.image(640, 360, 'start-bg').setDisplaySize(1280, 720);

    // Small soft shadow behind the form so it remains readable without covering the artwork.
    const g = this.add.graphics();
    g.fillStyle(0x001827, 0.28);
    g.fillRoundedRect(430, 292, 420, 266, 30);
  }

  private createForm(): void {
    const html = `
      <div class="knockout-panel start-panel">
        <div class="form-title">Choose your penguin name</div>
        <input id="playerName" maxlength="12" autocomplete="off" placeholder="Your name" />
        <button class="host" id="hostButton">Host Game</button>
        <input id="roomCode" maxlength="5" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="5 digit code" />
        <button class="join" id="joinButton">Join Game</button>
        <div class="error" id="errorText"></div>
        <div class="server-line">Server: ${HTTP_SERVER_URL}</div>
      </div>
    `;

    this.panel = this.add.dom(640, 428).createFromHTML(html).setOrigin(0.5);

    const root = this.panel.node as HTMLElement;
    const nameInput = root.querySelector<HTMLInputElement>('#playerName')!;
    const roomCodeInput = root.querySelector<HTMLInputElement>('#roomCode')!;
    const hostButton = root.querySelector<HTMLButtonElement>('#hostButton')!;
    const joinButton = root.querySelector<HTMLButtonElement>('#joinButton')!;
    const errorText = root.querySelector<HTMLDivElement>('#errorText')!;

    roomCodeInput.addEventListener('input', () => {
      roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '').slice(0, 5);
    });

    const setLoading = (loading: boolean): void => {
      hostButton.disabled = loading;
      joinButton.disabled = loading;
      hostButton.textContent = loading ? 'Connecting...' : 'Host Game';
      joinButton.textContent = loading ? 'Connecting...' : 'Join Game';
    };

    const getName = (): string => {
      const trimmed = nameInput.value.trim();
      return trimmed.length > 0 ? trimmed : 'Penguin';
    };

    hostButton.addEventListener('click', async () => {
      try {
        errorText.textContent = '';
        setLoading(true);
        await hostGame(getName());
        this.scene.start('LobbyScene');
      } catch (error) {
        errorText.textContent = error instanceof Error ? error.message : 'Could not create game.';
      } finally {
        setLoading(false);
      }
    });

    joinButton.addEventListener('click', async () => {
      try {
        const code = roomCodeInput.value.trim().replace(/\D/g, '');
        if (!/^\d{5}$/.test(code)) throw new Error('Enter the 5 digit room code.');
        errorText.textContent = '';
        setLoading(true);
        await joinGame(getName(), code);
        this.scene.start('LobbyScene');
      } catch (error) {
        errorText.textContent = error instanceof Error ? error.message : 'Could not join game.';
      } finally {
        setLoading(false);
      }
    });
  }
}
