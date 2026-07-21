import Phaser from 'phaser';
import { addSoundToggle, ensureBackgroundMusic, preloadBackgroundMusic } from '../audio/AudioManager';
import {
  hostGame,
  joinGame,
  type ConnectionProgress
} from '../net/Net';

export class StartScene extends Phaser.Scene {
  private panel?: Phaser.GameObjects.DOMElement;
  private connectionTimer: number | null = null;

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
    if (this.connectionTimer !== null) {
      window.clearInterval(this.connectionTimer);
      this.connectionTimer = null;
    }
    this.panel?.destroy();
  }

  private drawBackground(): void {
    this.add.image(640, 360, 'start-bg').setDisplaySize(1280, 720);

    // Small soft shadow behind the form so it remains readable without covering the artwork.
    const g = this.add.graphics();
    g.fillStyle(0x001827, 0.28);
    g.fillRoundedRect(430, 292, 420, 272, 30);
  }

  private createForm(): void {
    const html = `
      <div class="knockout-panel start-panel">
        <div class="start-fields" id="startFields">
          <div class="form-title">Choose your penguin name</div>
          <input id="playerName" maxlength="12" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" placeholder="Your name" />
          <button class="host" id="hostButton" type="button">Host Game</button>
          <input id="roomCode" maxlength="5" inputmode="numeric" pattern="[0-9]*" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="5 digit code" />
          <button class="join" id="joinButton" type="button">Join Game</button>
        </div>

        <div class="connection-panel" id="connectionPanel" hidden aria-live="polite">
          <div class="connection-title" id="connectionTitle">Connecting to Knockout</div>
          <div class="connection-message" id="connectionMessage">Contacting the classroom server...</div>
          <div class="connection-progress" id="connectionProgress" role="progressbar" aria-label="Server connection progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="4">
            <div class="connection-progress-fill" id="connectionProgressFill"></div>
          </div>
          <div class="connection-elapsed" id="connectionElapsed">Waiting 0 seconds · free servers can take 60–100 seconds</div>
        </div>

        <div class="error" id="errorText" aria-live="assertive"></div>
      </div>
    `;

    // Anchor from the top edge. Changing the status-card height can no longer
    // make the whole overlay drop down on phones, iPads or short laptop windows.
    this.panel = this.add.dom(640, 298).createFromHTML(html).setOrigin(0.5, 0);

    const root = this.panel.node as HTMLElement;
    const startFields = root.querySelector<HTMLDivElement>('#startFields')!;
    const nameInput = root.querySelector<HTMLInputElement>('#playerName')!;
    const roomCodeInput = root.querySelector<HTMLInputElement>('#roomCode')!;
    const hostButton = root.querySelector<HTMLButtonElement>('#hostButton')!;
    const joinButton = root.querySelector<HTMLButtonElement>('#joinButton')!;
    const connectionPanel = root.querySelector<HTMLDivElement>('#connectionPanel')!;
    const connectionTitle = root.querySelector<HTMLDivElement>('#connectionTitle')!;
    const connectionMessage = root.querySelector<HTMLDivElement>('#connectionMessage')!;
    const connectionProgress = root.querySelector<HTMLDivElement>('#connectionProgress')!;
    const connectionProgressFill = root.querySelector<HTMLDivElement>('#connectionProgressFill')!;
    const connectionElapsed = root.querySelector<HTMLDivElement>('#connectionElapsed')!;
    const errorText = root.querySelector<HTMLDivElement>('#errorText')!;

    let connectionStartedAt = 0;
    let hasNetworkProgressMessage = false;

    roomCodeInput.addEventListener('input', () => {
      roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '').slice(0, 5);
    });

    const clearConnectionTimer = (): void => {
      if (this.connectionTimer !== null) {
        window.clearInterval(this.connectionTimer);
        this.connectionTimer = null;
      }
    };

    const updateProgressDisplay = (elapsedMs?: number, maxMs = 100_000): void => {
      const elapsed = Math.max(
        0,
        elapsedMs ?? (connectionStartedAt > 0 ? Date.now() - connectionStartedAt : 0)
      );
      const seconds = Math.floor(elapsed / 1000);
      const percent = Math.min(96, Math.max(4, Math.round((elapsed / maxMs) * 92 + 4)));
      connectionProgressFill.style.width = `${percent}%`;
      connectionProgress.setAttribute('aria-valuenow', String(percent));
      connectionElapsed.textContent = `Waiting ${seconds} second${seconds === 1 ? '' : 's'} · free servers can take 60–100 seconds`;

      if (!hasNetworkProgressMessage) {
        if (seconds >= 70) {
          connectionMessage.textContent = 'Still working. Render can need close to 100 seconds after a long sleep.';
        } else if (seconds >= 35) {
          connectionMessage.textContent = 'The server is starting. Keep this page open and do not press the buttons again.';
        } else if (seconds >= 12) {
          connectionMessage.textContent = 'Waking the free classroom server. This delay is normal after it has been asleep.';
        }
      }
    };

    const setLoading = (loading: boolean, title = '', message = ''): void => {
      nameInput.disabled = loading;
      roomCodeInput.disabled = loading;
      hostButton.disabled = loading;
      joinButton.disabled = loading;
      root.classList.toggle('is-loading', loading);
      startFields.hidden = loading;
      connectionPanel.hidden = !loading;

      if (loading) {
        nameInput.blur();
        roomCodeInput.blur();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

        errorText.textContent = '';
        connectionTitle.textContent = title || 'Connecting to Knockout';
        connectionMessage.textContent = message || 'Contacting the classroom server...';
        hasNetworkProgressMessage = false;
        connectionStartedAt = Date.now();
        updateProgressDisplay(0);
        clearConnectionTimer();
        this.connectionTimer = window.setInterval(() => updateProgressDisplay(), 500);
      } else {
        clearConnectionTimer();
      }
    };

    const onProgress = (progress: ConnectionProgress): void => {
      hasNetworkProgressMessage = true;
      connectionTitle.textContent =
        progress.stage === 'syncing'
          ? 'Loading the Knockout lobby'
          : progress.stage === 'joining'
            ? 'Joining the classroom'
            : 'Connecting to Knockout';
      connectionMessage.textContent = progress.message;
      updateProgressDisplay(progress.elapsedMs, progress.maxMs);
    };

    const getName = (): string => {
      const trimmed = nameInput.value.trim();
      return trimmed.length > 0 ? trimmed : 'Penguin';
    };

    const showError = (error: unknown, fallback: string): void => {
      errorText.textContent = error instanceof Error ? error.message : fallback;
      root.scrollTop = root.scrollHeight;
    };

    hostButton.addEventListener('click', async () => {
      if (hostButton.disabled) return;
      try {
        setLoading(
          true,
          'Creating the Knockout classroom',
          'Contacting the classroom server. Please keep this page open.'
        );
        await hostGame(getName(), onProgress);
        connectionTitle.textContent = 'Classroom ready!';
        connectionMessage.textContent = 'Opening the Knockout lobby...';
        this.scene.start('LobbyScene');
      } catch (error) {
        setLoading(false);
        showError(error, 'Could not create the Knockout classroom.');
      }
    });

    joinButton.addEventListener('click', async () => {
      if (joinButton.disabled) return;
      try {
        const code = roomCodeInput.value.trim().replace(/\D/g, '');
        if (!/^\d{5}$/.test(code)) throw new Error('Enter the 5-digit room code.');

        setLoading(
          true,
          'Joining the Knockout classroom',
          'Contacting the classroom server. Please keep this page open.'
        );
        await joinGame(getName(), code, onProgress);
        connectionTitle.textContent = 'Classroom found!';
        connectionMessage.textContent = 'Opening the Knockout lobby...';
        this.scene.start('LobbyScene');
      } catch (error) {
        setLoading(false);
        showError(error, 'Could not join the Knockout classroom.');
      }
    });
  }
}
