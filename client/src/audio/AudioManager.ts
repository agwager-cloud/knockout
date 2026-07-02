import Phaser from 'phaser';

const MUSIC_KEY = 'knockout-background-music';
const MUSIC_URL = '/assets/audio/background.mp3';
const KNOCKOUT_KEY = 'knockout-own-ko';
const KNOCKOUT_URL = '/assets/audio/knockout.mp3';
const OPPONENT_KO_KEY = 'knockout-opponent-ko';
const OPPONENT_KO_URL = '/assets/audio/opponentko.mp3';
const STORAGE_KEY = 'knockout-music-muted';

let music: Phaser.Sound.BaseSound | null = null;
let muted = readMutedPreference();

function readMutedPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveMutedPreference(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore private browsing / storage errors. The toggle still works for this session.
  }
}

export function preloadBackgroundMusic(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(MUSIC_KEY)) {
    scene.load.audio(MUSIC_KEY, MUSIC_URL);
  }
  if (!scene.cache.audio.exists(KNOCKOUT_KEY)) {
    scene.load.audio(KNOCKOUT_KEY, KNOCKOUT_URL);
  }
  if (!scene.cache.audio.exists(OPPONENT_KO_KEY)) {
    scene.load.audio(OPPONENT_KO_KEY, OPPONENT_KO_URL);
  }
}

export function ensureBackgroundMusic(scene: Phaser.Scene): void {
  scene.sound.mute = muted;
  if (!scene.cache.audio.exists(MUSIC_KEY)) return;

  if (!music) {
    music = scene.sound.add(MUSIC_KEY, {
      loop: true,
      volume: 0.3
    });
  }

  const playMusic = (): void => {
    if (music && !music.isPlaying) {
      music.play();
    }
  };

  const soundManager = scene.sound as Phaser.Sound.BaseSoundManager & { locked?: boolean };
  if (soundManager.locked) {
    soundManager.once(Phaser.Sound.Events.UNLOCKED, playMusic);
  } else {
    playMusic();
  }
}

export function isMusicMuted(): boolean {
  return muted;
}

export function setMusicMuted(scene: Phaser.Scene, value: boolean): void {
  muted = value;
  saveMutedPreference(muted);
  scene.sound.mute = muted;
  ensureBackgroundMusic(scene);
}

export function playKnockoutSound(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(KNOCKOUT_KEY)) return;
  scene.sound.play(KNOCKOUT_KEY, { volume: 0.95 });
}

export function playOpponentKnockoutSound(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(OPPONENT_KO_KEY)) return;
  scene.sound.play(OPPONENT_KO_KEY, { volume: 0.82 });
}

export function addSoundToggle(scene: Phaser.Scene, x = 1202, y = 72): Phaser.GameObjects.Text {
  ensureBackgroundMusic(scene);

  const button = scene.add.text(x, y, '', {
    fontFamily: 'Arial Black, Arial',
    fontSize: '14px',
    color: '#ffffff',
    backgroundColor: '#0f5f8b',
    padding: { x: 11, y: 7 },
    stroke: '#07314d',
    strokeThickness: 2
  }).setOrigin(0.5).setDepth(1000).setInteractive({ useHandCursor: true });

  const refresh = (): void => {
    button.setText(isMusicMuted() ? 'SOUND OFF' : 'SOUND ON');
    button.setAlpha(isMusicMuted() ? 0.72 : 1);
  };

  button.on('pointerdown', () => {
    setMusicMuted(scene, !isMusicMuted());
    refresh();
  });

  refresh();
  return button;
}
