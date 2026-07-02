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
    g.fillRoundedRect(430, 292, 420, 252, 30);
  }

  private async waitForServer(statusText: HTMLDivElement): Promise<void> {
    // Render free services can sleep. A lightweight health check wakes the server before
    // opening the Colyseus websocket, and the status message stops students spamming buttons.
    const deadline = Date.now() + 75_000;
    let attempt = 1;

    while (Date.now() < deadline) {
      const secondsWaited = Math.max(0, Math.round((Date.now() - (deadline - 75_000)) / 1000));
      statusText.textContent = secondsWaited < 4
        ? 'Creating classroom...'
        : `Creating classroom... waking the free server (${secondsWaited}s)`;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8_000);

      try {
        const response = await fetch(`${HTTP_SERVER_URL}/health`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (response.ok) {
          statusText.textContent = attempt > 1 ? 'Server is awake. Creating classroom...' : 'Creating classroom...';
          return;
        }
      } catch {
        // The server may still be waking. Try again until the deadline.
      } finally {
        window.clearTimeout(timeout);
      }

      attempt += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
    }

    throw new Error('The free server is still waking up. Please wait a moment and try again.');
  }

  private createForm(): void {
    const html = `
      <div class="knockout-panel start-panel">
        <div class="form-title">Choose your penguin name</div>
        <input id="playerName" maxlength="12" autocomplete="off" placeholder="Your name" />
        <button class="host" id="hostButton">Host Game</button>
        <input id="roomCode" maxlength="5" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="5 digit code" />
        <button class="join" id="joinButton">Join Game</button>
        <div class="loading" id="loadingText"></div>
        <div class="error" id="errorText"></div>
      </div>
    `;

    this.panel = this.add.dom(640, 420).createFromHTML(html).setOrigin(0.5);

    const root = this.panel.node as HTMLElement;
    const nameInput = root.querySelector<HTMLInputElement>('#playerName')!;
    const roomCodeInput = root.querySelector<HTMLInputElement>('#roomCode')!;
    const hostButton = root.querySelector<HTMLButtonElement>('#hostButton')!;
    const joinButton = root.querySelector<HTMLButtonElement>('#joinButton')!;
    const loadingText = root.querySelector<HTMLDivElement>('#loadingText')!;
    const errorText = root.querySelector<HTMLDivElement>('#errorText')!;

    roomCodeInput.addEventListener('input', () => {
      roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '').slice(0, 5);
    });

    const setLoading = (loading: boolean, message = ''): void => {
      nameInput.disabled = loading;
      roomCodeInput.disabled = loading;
      hostButton.disabled = loading;
      joinButton.disabled = loading;
      hostButton.textContent = loading ? 'Please wait...' : 'Host Game';
      joinButton.textContent = loading ? 'Please wait...' : 'Join Game';
      loadingText.textContent = message;
      root.classList.toggle('is-loading', loading);
    };

    const getName = (): string => {
      const trimmed = nameInput.value.trim();
      return trimmed.length > 0 ? trimmed : 'Penguin';
    };

    hostButton.addEventListener('click', async () => {
      try {
        errorText.textContent = '';
        setLoading(true, 'Creating classroom...');
        await this.waitForServer(loadingText);
        loadingText.textContent = 'Creating classroom...';
        await hostGame(getName());
        loadingText.textContent = 'Classroom created!';
        this.scene.start('LobbyScene');
      } catch (error) {
        errorText.textContent = error instanceof Error ? error.message : 'Could not create game.';
      } finally {
        if (this.scene.isActive('StartScene')) setLoading(false);
      }
    });

    joinButton.addEventListener('click', async () => {
      try {
        const code = roomCodeInput.value.trim().replace(/\D/g, '');
        if (!/^\d{5}$/.test(code)) throw new Error('Enter the 5 digit room code.');
        errorText.textContent = '';
        setLoading(true, 'Joining classroom...');
        await this.waitForServer(loadingText);
        loadingText.textContent = 'Joining classroom...';
        await joinGame(getName(), code);
        this.scene.start('LobbyScene');
      } catch (error) {
        errorText.textContent = error instanceof Error ? error.message : 'Could not join game.';
      } finally {
        if (this.scene.isActive('StartScene')) setLoading(false);
      }
    });
  }
}
