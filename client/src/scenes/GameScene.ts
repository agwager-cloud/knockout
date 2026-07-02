import Phaser from 'phaser';
import {
  addSoundToggle,
  ensureBackgroundMusic,
  playKnockoutSound,
  playOpponentKnockoutSound,
  preloadBackgroundMusic
} from '../audio/AudioManager';
import { getLatestState, getMyId, sendAim, watchState } from '../net/Net';
import {
  clamp,
  formatCountdown,
  PENGUIN_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  TABLE_H,
  TABLE_W,
  TABLE_X,
  TABLE_Y,
  type GameSnapshot,
  type PlayerSnapshot
} from '../shared';

interface PenguinLabel {
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GameScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private state: GameSnapshot | null = null;
  private tableGraphics!: Phaser.GameObjects.Graphics;
  private penguinGraphics!: Phaser.GameObjects.Graphics;
  private uiGraphics!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, PenguinLabel>();
  private roomCodeText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private aliveText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private powerText?: Phaser.GameObjects.Text;
  private aimAngle = 0;
  private aimPower = 0;
  private dragging = false;
  private aimVisible = false;
  private lastAimSend = 0;
  private seenEliminationIds = new Set<string>();
  private hasProcessedFirstSnapshot = false;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    preloadBackgroundMusic(this);
    this.load.image('other-bg', 'assets/backgrounds/otherbg.jpg');
  }

  create(): void {
    ensureBackgroundMusic(this);
    this.add.image(640, 360, 'other-bg').setDisplaySize(1280, 720).setDepth(-20);
    addSoundToggle(this);
    // Phaser reuses scene instances. Clear references from a previous game so Play Again
    // never tries to update text objects that were destroyed when the scene shut down.
    this.labels.clear();
    this.powerText = undefined;
    this.unsubscribe = undefined;
    this.dragging = false;
    this.aimVisible = false;
    this.seenEliminationIds.clear();
    this.hasProcessedFirstSnapshot = false;

    this.tableGraphics = this.add.graphics();
    this.penguinGraphics = this.add.graphics();
    this.uiGraphics = this.add.graphics();

    this.roomCodeText = this.add.text(24, 18, '', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '24px',
      color: '#fff5bc',
      stroke: '#07314d',
      strokeThickness: 4
    });

    this.phaseText = this.add.text(640, 16, '', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '30px',
      color: '#ffffff',
      stroke: '#07314d',
      strokeThickness: 5
    }).setOrigin(0.5, 0);

    this.timerText = this.add.text(640, 52, '', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '38px',
      color: '#fff5bc',
      stroke: '#07314d',
      strokeThickness: 6
    }).setOrigin(0.5, 0);

    this.aliveText = this.add.text(1252, 20, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#dff7ff',
      fontStyle: 'bold'
    }).setOrigin(1, 0);

    this.helpText = this.add.text(640, 688, '', {
      fontFamily: 'Arial',
      fontSize: '19px',
      color: '#e9fbff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 1120 }
    }).setOrigin(0.5);

    this.input.on('pointerdown', this.handlePointer, this);
    this.input.on('pointermove', this.handlePointer, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);

    this.unsubscribe = watchState((state) => {
      const previousState = this.state;
      if (state.phase !== 'aiming' || previousState?.phase !== 'aiming' || previousState?.round !== state.round) {
        this.dragging = false;
        this.aimVisible = false;
      }
      this.handleEliminationSounds(state);
      this.state = state;
      if (state.phase === 'finished') {
        this.scene.start('ResultsScene');
        return;
      }
      this.render();
    });

    const current = getLatestState();
    if (current) {
      this.state = current;
      this.render();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.input.off('pointerdown', this.handlePointer, this);
      this.input.off('pointermove', this.handlePointer, this);
      this.input.off('pointerup', this.handlePointerUp, this);
      this.input.off('pointerupoutside', this.handlePointerUp, this);
      this.labels.clear();
      this.powerText = undefined;
      this.dragging = false;
      this.aimVisible = false;
      this.seenEliminationIds.clear();
      this.hasProcessedFirstSnapshot = false;
    });
  }

  update(time: number): void {
    if (this.dragging && time - this.lastAimSend > 75) {
      this.sendAimNow(time);
    }
    if (this.state) this.render();
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (!this.state || this.state.phase !== 'aiming') return;
    const me = this.getMe();
    if (!me || !me.alive) return;

    const x = pointer.x;
    const y = pointer.y;
    const insideTable = x >= TABLE_X && x <= TABLE_X + TABLE_W && y >= TABLE_Y && y <= TABLE_Y + TABLE_H;
    if (!insideTable && !this.dragging) return;

    this.dragging = pointer.isDown;
    this.aimVisible = pointer.isDown;
    const dx = x - (TABLE_X + me.x);
    const dy = y - (TABLE_Y + me.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 6) return;

    this.aimAngle = Math.atan2(dy, dx);
    this.aimPower = clamp(distance / 230, 0, 1);
  }

  private handlePointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.aimVisible = false;
    this.sendAimNow();
  }

  private sendAimNow(time = this.time.now): void {
    this.lastAimSend = time;
    sendAim(this.aimAngle, this.aimPower);
  }

  private handleEliminationSounds(state: GameSnapshot): void {
    if (state.phase === 'lobby') {
      this.seenEliminationIds.clear();
      this.hasProcessedFirstSnapshot = false;
      return;
    }

    const nextIds = new Set(state.eliminationOrder.map((entry) => entry.id));
    if (!this.hasProcessedFirstSnapshot) {
      this.seenEliminationIds = nextIds;
      this.hasProcessedFirstSnapshot = true;
      return;
    }

    const newEliminations = state.eliminationOrder.filter((entry) => !this.seenEliminationIds.has(entry.id));
    this.seenEliminationIds = nextIds;
    if (newEliminations.length === 0) return;

    const myId = getMyId();
    if (newEliminations.some((entry) => entry.id === myId)) {
      playKnockoutSound(this);
      return;
    }

    playOpponentKnockoutSound(this);
  }

  private getMe(): PlayerSnapshot | undefined {
    const id = getMyId();
    return this.state?.players.find((p) => p.id === id);
  }

  private render(): void {
    if (!this.state) return;
    this.drawTable();
    this.drawPenguins();
    this.drawUi();
  }

  private drawTable(): void {
    const g = this.tableGraphics;
    g.clear();
    g.fillStyle(0x061a2b, 0.36);
    g.fillRect(0, 0, 1280, 720);

    // Top information strip separates the code/timer/alive counter from the table pockets.
    g.fillStyle(0x082338, 0.92);
    g.fillRoundedRect(16, 10, 1248, 92, 22);
    g.lineStyle(3, 0x9de9ff, 0.28);
    g.strokeRoundedRect(16, 10, 1248, 92, 22);

    g.fillStyle(0x153a52, 1);
    g.fillRoundedRect(TABLE_X - 36, TABLE_Y - 36, TABLE_W + 72, TABLE_H + 72, 42);
    g.lineStyle(8, 0x9de9ff, 0.7);
    g.strokeRoundedRect(TABLE_X - 36, TABLE_Y - 36, TABLE_W + 72, TABLE_H + 72, 42);

    g.fillStyle(0xcaf6ff, 1);
    g.fillRoundedRect(TABLE_X, TABLE_Y, TABLE_W, TABLE_H, 24);
    g.fillStyle(0x9fe4f6, 0.9);
    g.fillRoundedRect(TABLE_X + 18, TABLE_Y + 18, TABLE_W - 36, TABLE_H - 36, 20);

    g.lineStyle(4, 0xffffff, 0.26);
    for (let y = TABLE_Y + 45; y < TABLE_Y + TABLE_H - 20; y += 58) {
      g.beginPath();
      g.moveTo(TABLE_X + 24, y);
      for (let x = TABLE_X + 24; x < TABLE_X + TABLE_W - 20; x += 70) {
        g.lineTo(x, y + Math.sin((x + y) / 80) * 8);
      }
      g.strokePath();
    }

    const extraPocketRadius = this.state?.table.extraPocketRadius ?? 32;
    for (const hole of this.state?.extraPockets ?? []) {
      const hx = TABLE_X + hole.x;
      const hy = TABLE_Y + hole.y;
      g.fillStyle(0x082338, 0.45);
      g.fillCircle(hx, hy, extraPocketRadius + 12);
      g.fillStyle(0x000000, 1);
      g.fillCircle(hx, hy, extraPocketRadius);
      g.lineStyle(4, 0xffffff, 0.75);
      g.strokeCircle(hx, hy, extraPocketRadius + 2);
      g.lineStyle(2, 0x9de9ff, 0.55);
      g.strokeCircle(hx, hy, extraPocketRadius + 10);
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 + (hole.x + hole.y) * 0.003;
        g.beginPath();
        g.moveTo(
          hx + Math.cos(angle) * (extraPocketRadius + 12),
          hy + Math.sin(angle) * (extraPocketRadius + 12)
        );
        g.lineTo(
          hx + Math.cos(angle) * (extraPocketRadius + 31),
          hy + Math.sin(angle) * (extraPocketRadius + 31)
        );
        g.strokePath();
      }
    }

    for (const pocket of POCKETS) {
      const px = TABLE_X + pocket.x;
      const py = TABLE_Y + pocket.y;
      g.fillStyle(0x05131d, 1);
      g.fillCircle(px, py, POCKET_RADIUS + 7);
      g.fillStyle(0x000000, 1);
      g.fillCircle(px, py, POCKET_RADIUS);
      g.lineStyle(4, 0xe7fbff, 0.85);
      g.strokeCircle(px, py, POCKET_RADIUS + 2);
    }
  }

  private drawPenguins(): void {
    if (!this.state) return;
    const g = this.penguinGraphics;
    g.clear();

    const alivePlayers = this.state.players.filter((p) => p.alive);
    const myId = getMyId();
    const me = alivePlayers.find((p) => p.id === myId);

    if (this.state.phase === 'aiming' && me && this.aimVisible) {
      const startX = TABLE_X + me.x;
      const startY = TABLE_Y + me.y;
      const length = 42 + this.aimPower * 185;
      const endX = startX + Math.cos(this.aimAngle) * length;
      const endY = startY + Math.sin(this.aimAngle) * length;
      g.lineStyle(8, 0xfff6ad, 0.9);
      g.beginPath();
      g.moveTo(startX, startY);
      g.lineTo(endX, endY);
      g.strokePath();
      g.fillStyle(0xfff6ad, 1);
      g.fillCircle(endX, endY, 8);
    }

    for (const p of alivePlayers) {
      this.drawPenguin(g, TABLE_X + p.x, TABLE_Y + p.y, p.color, p.id === myId);
    }

    this.updateLabels(alivePlayers);
  }

  private drawPenguin(g: Phaser.GameObjects.Graphics, x: number, y: number, color: string, isMe: boolean): void {
    const tint = Number.parseInt(color.replace('#', '0x'));
    if (isMe) {
      g.lineStyle(5, 0xfff09a, 1);
      g.strokeCircle(x, y, PENGUIN_RADIUS + 8);
    }

    g.fillStyle(tint, 1);
    g.fillCircle(x, y, PENGUIN_RADIUS + 5);
    g.fillStyle(0xffffff, 0.95);
    g.fillEllipse(x, y + 5, 24, 26);
    g.fillStyle(0x111827, 1);
    g.fillCircle(x - 7, y - 7, 3);
    g.fillCircle(x + 7, y - 7, 3);
    g.fillStyle(0xffb031, 1);
    g.fillTriangle(x - 5, y - 1, x + 5, y - 1, x, y + 6);
    g.fillStyle(0xf2a23c, 1);
    g.fillEllipse(x - 15, y + 20, 15, 7);
    g.fillEllipse(x + 15, y + 20, 15, 7);
  }

  private updateLabels(alivePlayers: PlayerSnapshot[]): void {
    const liveIds = new Set(alivePlayers.map((p) => p.id));
    for (const [id, label] of this.labels) {
      if (!liveIds.has(id)) {
        label.name.setVisible(false);
        label.status.setVisible(false);
      }
    }

    const occupied: LabelBox[] = [];
    const myId = getMyId();
    const ordered = [...alivePlayers].sort((a, b) => {
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      return a.y - b.y;
    });

    for (const p of ordered) {
      const label = this.getOrCreateLabel(p.id);
      const displayName = p.isBot ? `${p.name} B` : p.name;
      label.name.setText(displayName.length > 14 ? `${displayName.slice(0, 13)}…` : displayName);
      label.name.setVisible(true);
      label.name.setAlpha(p.id === myId ? 1 : 0.82);
      label.name.setDepth(12);

      const baseX = TABLE_X + p.x;
      const baseY = TABLE_Y + p.y;
      const w = Math.max(46, label.name.displayWidth || displayName.length * 7);
      const h = Math.max(17, label.name.displayHeight || 17);
      const offsets = [
        { x: 0, y: -30 },
        { x: 0, y: 31 },
        { x: -46, y: -20 },
        { x: 46, y: -20 },
        { x: -54, y: 22 },
        { x: 54, y: 22 },
        { x: 0, y: -47 },
        { x: 0, y: 48 }
      ];

      let chosen = this.clampLabelBox(baseX, baseY - 30, w, h);
      for (const offset of offsets) {
        const candidate = this.clampLabelBox(baseX + offset.x, baseY + offset.y, w, h);
        if (!occupied.some((box) => this.boxesOverlap(box, candidate))) {
          chosen = candidate;
          break;
        }
      }

      label.name.setPosition(chosen.x, chosen.y);
      occupied.push(chosen);

      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      label.status.setText(speed > 40 ? 'whoosh!' : '');
      label.status.setVisible(speed > 40);
      label.status.setPosition(baseX, baseY + 33);
    }
  }

  private getOrCreateLabel(id: string): PenguinLabel {
    let label = this.labels.get(id);
    if (!label) {
      label = {
        name: this.add.text(0, 0, '', {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: '#063146',
          fontStyle: 'bold',
          backgroundColor: 'rgba(255,255,255,0.62)',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5),
        status: this.add.text(0, 0, '', {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#07314d',
          strokeThickness: 2
        }).setOrigin(0.5)
      };
      this.labels.set(id, label);
    }
    return label;
  }

  private clampLabelBox(x: number, y: number, w: number, h: number): LabelBox {
    const margin = 10;
    const halfW = w / 2;
    const halfH = h / 2;
    return {
      x: clamp(x, TABLE_X + margin + halfW, TABLE_X + TABLE_W - margin - halfW),
      y: clamp(y, TABLE_Y + margin + halfH, TABLE_Y + TABLE_H - margin - halfH),
      w,
      h
    };
  }

  private boxesOverlap(a: LabelBox, b: LabelBox): boolean {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 3;
  }

  private drawUi(): void {
    if (!this.state) return;
    const g = this.uiGraphics;
    g.clear();

    const participants = this.state.players.filter((p) => !p.spectator);
    const alive = participants.filter((p) => p.alive).length;
    const me = this.getMe();
    this.roomCodeText.setText(`Code: ${this.state.roomCode}`);
    this.aliveText.setText(`Alive: ${alive}/${participants.length}`);

    if (this.state.phase === 'aiming') {
      this.phaseText.setText(`ROUND ${this.state.round}`);
      this.timerText.setText(formatCountdown(this.state.countdownMs));
      const holes = this.state.extraPockets.length;
      if (me?.spectator) {
        this.helpText.setText('You are spectating this match and will join the next game.');
      } else {
        this.helpText.setText(
          holes > 0
            ? `Aim your penguin in the direction you want to go. Avoid the ${holes} extra ice hole${holes === 1 ? '' : 's'}!`
            : 'Aim your penguin in the direction you want to go.'
        );
      }
    } else if (this.state.phase === 'rolling') {
      this.phaseText.setText(`ROUND ${this.state.round}`);
      this.timerText.setText('');
      const holes = this.state.extraPockets.length;
      this.helpText.setText(
        me?.spectator
          ? 'You are spectating this match and will join the next game.'
          : holes > 0
            ? `Penguins are sliding. Extra ice holes are active from round 11 onwards.`
            : 'Penguins are sliding. Next 10 second shot starts when everything stops.'
      );
    } else {
      this.phaseText.setText('');
      this.timerText.setText('');
      this.helpText.setText('');
    }

    if (this.state.phase === 'aiming' && me?.alive && this.aimVisible) {
      const meterX = 484;
      const meterY = 618;
      const meterW = 312;
      g.fillStyle(0x061a2b, 0.56);
      g.fillRoundedRect(meterX - 14, meterY - 30, meterW + 28, 62, 18);
      g.fillStyle(0xffffff, 0.82);
      g.fillRoundedRect(meterX, meterY, meterW, 22, 11);
      g.fillStyle(0xf6b83b, 1);
      g.fillRoundedRect(meterX, meterY, meterW * this.aimPower, 22, 11);
      g.lineStyle(3, 0x07314d, 0.85);
      g.strokeRoundedRect(meterX, meterY, meterW, 22, 11);
      this.addOrUpdatePowerText(`Power ${Math.round(this.aimPower * 100)}%`, meterX + meterW / 2, meterY - 13);
    } else {
      this.addOrUpdatePowerText('', 0, 0);
    }
  }

  private addOrUpdatePowerText(text: string, x: number, y: number): void {
    if (!this.powerText) {
      this.powerText = this.add.text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '15px',
        color: '#e9fbff',
        fontStyle: 'bold'
      }).setOrigin(0.5);
    }
    this.powerText.setText(text);
    this.powerText.setPosition(x, y);
  }
}
