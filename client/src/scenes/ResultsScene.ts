import Phaser from "phaser";
import {
  addSoundToggle,
  ensureBackgroundMusic,
  preloadBackgroundMusic,
} from "../audio/AudioManager";
import {
  getMyId,
  sendPlayAgain,
  sendReturnLobby,
  watchState,
} from "../net/Net";
import type { GameSnapshot, PlayerSnapshot } from "../shared";

export class ResultsScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private state: GameSnapshot | null = null;
  private graphics!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private playAgainButton!: Phaser.GameObjects.Text;
  private lobbyButton!: Phaser.GameObjects.Text;
  private playAgainHitZone!: Phaser.GameObjects.Zone;
  private lobbyHitZone!: Phaser.GameObjects.Zone;
  private awardObjects: Phaser.GameObjects.GameObject[] = [];
  private awardTimers: Phaser.Time.TimerEvent[] = [];
  private awardStarted = false;
  private awardAnimating = false;
  private awardComplete = false;
  private awardNameText?: Phaser.GameObjects.Text;
  private awardSubText?: Phaser.GameObjects.Text;
  private awardTitleText?: Phaser.GameObjects.Text;
  private awardHighlightRect?: Phaser.GameObjects.Rectangle;
  private awardFinalVisible = false;
  private awardHideTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("ResultsScene");
  }

  preload(): void {
    preloadBackgroundMusic(this);
    this.load.image("other-bg", "assets/backgrounds/otherbg.jpg");
  }

  create(): void {
    ensureBackgroundMusic(this);
    this.add
      .image(640, 360, "other-bg")
      .setDisplaySize(1280, 720)
      .setDepth(-20);
    addSoundToggle(this);
    this.texts = [];
    this.awardObjects = [];
    this.awardTimers = [];
    this.awardStarted = false;
    this.awardAnimating = false;
    this.awardComplete = false;
    this.awardFinalVisible = false;
    this.awardHideTimer = undefined;
    this.unsubscribe = undefined;
    this.graphics = this.add.graphics();

    this.playAgainButton = this.add
      .text(470, 668, "PLAY AGAIN", {
        fontFamily: "Arial Black, Arial",
        fontSize: "24px",
        color: "#ffffff",
        backgroundColor: "#1688c8",
        padding: { x: 24, y: 11 },
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.lobbyButton = this.add
      .text(790, 668, "RETURN TO LOBBY", {
        fontFamily: "Arial Black, Arial",
        fontSize: "24px",
        color: "#ffffff",
        backgroundColor: "#ef8d23",
        padding: { x: 24, y: 11 },
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.playAgainHitZone = this.add
      .zone(470, 668, 250, 68)
      .setInteractive({ useHandCursor: true })
      .setDepth(30);
    this.lobbyHitZone = this.add
      .zone(790, 668, 335, 68)
      .setInteractive({ useHandCursor: true })
      .setDepth(30);

    this.playAgainHitZone.on("pointerdown", this.handlePlayAgain, this);
    this.lobbyHitZone.on("pointerdown", this.handleReturnLobby, this);

    this.unsubscribe = watchState((state) => {
      this.state = state;
      if (state.phase === "aiming" || state.phase === "rolling") {
        this.scene.start("GameScene");
        return;
      }
      if (state.phase === "lobby") {
        this.scene.start("LobbyScene");
        return;
      }
      this.renderResults();
      this.ensureAwardAnimation();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.playAgainHitZone.off("pointerdown", this.handlePlayAgain, this);
      this.lobbyHitZone.off("pointerdown", this.handleReturnLobby, this);
      this.clearTexts();
      this.clearAwardObjects();
    });
  }

  private handlePlayAgain(): void {
    if (!this.controlsUnlocked() || !this.state?.championId) return;
    this.playAgainButton.setText("STARTING...");
    this.playAgainHitZone.disableInteractive();
    this.lobbyHitZone.disableInteractive();
    sendPlayAgain();
  }

  private handleReturnLobby(): void {
    if (!this.controlsUnlocked()) return;
    this.lobbyButton.setText("RETURNING...");
    this.playAgainHitZone.disableInteractive();
    this.lobbyHitZone.disableInteractive();
    sendReturnLobby();
  }

  private isHost(): boolean {
    const myId = getMyId();
    return !!this.state?.players.find(
      (p) => p.id === myId && p.host && !p.isBot,
    );
  }

  private controlsUnlocked(): boolean {
    return (
      this.isHost() &&
      this.awardComplete &&
      !this.awardAnimating &&
      !this.awardFinalVisible
    );
  }

  private clearTexts(): void {
    for (const text of this.texts) {
      if (text.scene) text.destroy();
    }
    this.texts = [];
  }

  private clearAwardObjects(): void {
    for (const timer of this.awardTimers) timer.remove(false);
    this.awardTimers = [];
    this.awardHideTimer?.remove(false);
    this.awardHideTimer = undefined;
    for (const object of this.awardObjects) object.destroy();
    this.awardObjects = [];
    this.awardNameText = undefined;
    this.awardSubText = undefined;
    this.awardTitleText = undefined;
    this.awardHighlightRect = undefined;
  }

  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const created = this.add.text(x, y, text, style).setDepth(10);
    this.texts.push(created);
    return created;
  }

  private getCheerCount(playerId: string): number {
    return this.state?.players.find((p) => p.id === playerId)?.cheerCount ?? 0;
  }

  private drawCheerBadge(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    count: number,
  ): void {
    g.fillStyle(0xfff4a3, 1);
    g.fillCircle(x, y, 13);
    g.lineStyle(3, 0x07314d, 0.75);
    g.strokeCircle(x, y, 13);
    this.addText(x, y - 8, String(count), {
      fontFamily: "Arial Black, Arial",
      fontSize: count > 99 ? "9px" : "11px",
      color: "#07314d",
    }).setOrigin(0.5, 0);
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

    this.addText(640, 40, "Knockout Results", {
      fontFamily: "Arial Black, Arial",
      fontSize: "50px",
      color: "#ffffff",
      stroke: "#07314d",
      strokeThickness: 8,
    }).setOrigin(0.5);

    const champion = this.state.players.find(
      (p) => p.id === this.state?.championId,
    );
    const championName =
      champion?.name ?? this.state.championName ?? "Champion";
    const championColor = champion?.color ?? "#1688c8";

    g.fillStyle(Number.parseInt(championColor.replace("#", "0x")), 1);
    g.fillRoundedRect(230, 126, 820, 88, 24);
    g.lineStyle(4, 0xffffff, 0.85);
    g.strokeRoundedRect(230, 126, 820, 88, 24);

    this.addText(640, 144, "CHAMPION", {
      fontFamily: "Arial Black, Arial",
      fontSize: "25px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.addText(640, 181, `🏆 ${championName} 🏆`, {
      fontFamily: "Arial Black, Arial",
      fontSize: "34px",
      color: "#ffffff",
      stroke: "#07314d",
      strokeThickness: 5,
    }).setOrigin(0.5);

    if (champion?.id)
      this.drawCheerBadge(g, 935, 181, this.getCheerCount(champion.id));

    this.addText(190, 246, "Elimination order", {
      fontFamily: "Arial Black, Arial",
      fontSize: "27px",
      color: "#07314d",
    });

    this.addText(910, 252, `Total cheers: ${this.state.totalCheers ?? 0}`, {
      fontFamily: "Arial Black, Arial",
      fontSize: "20px",
      color: "#07314d",
    }).setOrigin(0.5);

    const entries = [...this.state.eliminationOrder]
      .filter((entry) => entry.id !== this.state?.championId)
      .reverse();
    if (entries.length === 0) {
      this.addText(190, 300, "No penguins were eliminated.", {
        fontFamily: "Arial",
        fontSize: "22px",
        color: "#123047",
        fontStyle: "bold",
      });
    } else {
      const startY = 292;
      const columns = entries.length <= 10 ? 1 : entries.length <= 20 ? 2 : 3;
      const rowsPerColumn = Math.ceil(entries.length / columns);
      const lineH = rowsPerColumn > 12 ? 20 : rowsPerColumn > 10 ? 22 : 28;
      const fontSize = columns === 3 ? 16 : rowsPerColumn > 10 ? 18 : 21;
      const columnXs =
        columns === 1 ? [190] : columns === 2 ? [190, 680] : [150, 500, 850];
      const badgeOffset = columns === 3 ? 295 : 420;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const col = Math.floor(i / rowsPerColumn);
        const row = i % rowsPerColumn;
        const x = columnXs[col] ?? columnXs[columnXs.length - 1];
        const y = startY + row * lineH;
        const originalOrder = entries.length - i;
        const maxNameLength = columns === 3 ? 9 : 13;
        const shortName =
          entry.name.length > maxNameLength
            ? `${entry.name.slice(0, maxNameLength - 1)}…`
            : entry.name;
        const line = this.addText(
          x,
          y,
          `${originalOrder}. ${shortName} — r${entry.round}`,
          {
            fontFamily: "Arial",
            fontSize: `${fontSize}px`,
            color: "#123047",
            fontStyle: "bold",
          },
        );
        const badgeX = Math.min(x + badgeOffset, x + line.displayWidth + 21);
        this.drawCheerBadge(
          g,
          badgeX,
          y + fontSize / 2,
          this.getCheerCount(entry.id),
        );
      }
    }

    const host = this.isHost();
    const unlocked = this.controlsUnlocked();
    const playAgainEnabled = unlocked && !!this.state.championId;
    this.playAgainButton.setAlpha(playAgainEnabled ? 1 : 0.42);
    this.playAgainButton.setText(
      playAgainEnabled ? "PLAY AGAIN" : host ? "LOCKED" : "HOST ONLY",
    );
    if (playAgainEnabled)
      this.playAgainHitZone.setInteractive({ useHandCursor: true });
    else this.playAgainHitZone.disableInteractive();

    this.lobbyButton.setAlpha(unlocked ? 1 : 0.42);
    this.lobbyButton.setText(
      unlocked ? "RETURN TO LOBBY" : host ? "LOCKED" : "HOST ONLY",
    );
    if (unlocked) this.lobbyHitZone.setInteractive({ useHandCursor: true });
    else this.lobbyHitZone.disableInteractive();

    const instruction = this.awardAnimating
      ? "Drawing the participation award. Host buttons unlock after the award pop-up closes."
      : this.awardFinalVisible
        ? "Participation award winner announced. Buttons unlock in a moment."
        : this.awardComplete
          ? host
            ? "Host can replay or return everyone to the lobby."
            : "Waiting for the host to start the next game."
          : "Preparing the participation award draw.";

    this.addText(640, 613, instruction, {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#d8f6ff",
      fontStyle: "bold",
    }).setOrigin(0.5);
  }

  private getAwardParticipants(): PlayerSnapshot[] {
    if (!this.state) return [];
    return this.state.players.filter((p) => !p.isBot && !p.spectator);
  }

  private ensureAwardAnimation(): void {
    if (this.awardStarted || !this.state || this.state.phase !== "finished")
      return;

    const participants = this.getAwardParticipants();
    const winnerId = this.state.participationAwardWinnerId;
    const winnerIndex = participants.findIndex((p) => p.id === winnerId);

    if (participants.length === 0 || !winnerId || winnerIndex < 0) {
      this.awardStarted = true;
      this.awardAnimating = false;
      this.awardComplete = true;
      this.renderResults();
      return;
    }

    this.awardStarted = true;
    this.awardAnimating = true;
    this.awardComplete = false;
    this.createAwardOverlay();

    const totalSteps = this.pickAwardStepCount(
      participants.length,
      winnerIndex,
    );
    const rawDelays = Array.from({ length: totalSteps }, (_, i) => {
      const progress = i / Math.max(1, totalSteps - 1);
      if (participants.length === 1) return 45 + Math.pow(progress, 2.2) * 180;
      return 35 + Math.pow(progress, 2.2) * 230;
    });
    const totalRaw = rawDelays.reduce((sum, delay) => sum + delay, 0);
    const scale = 3900 / totalRaw;
    let elapsed = 0;

    for (let step = 0; step < totalSteps; step++) {
      elapsed += rawDelays[step] * scale;
      const index = this.awardIndexForStep(step, participants.length);
      const finalStep = step === totalSteps - 1;
      const timer = this.time.delayedCall(elapsed, () => {
        this.updateAwardHighlight(participants[index], finalStep);
      });
      this.awardTimers.push(timer);
    }
  }

  private createAwardOverlay(): void {
    const panel = this.add
      .rectangle(640, 452, 650, 166, 0x061a2b, 0.9)
      .setStrokeStyle(5, 0x9de9ff, 0.95)
      .setDepth(100);
    this.awardObjects.push(panel);

    this.awardTitleText = this.add
      .text(640, 386, "Participation Award Draw", {
        fontFamily: "Arial Black, Arial",
        fontSize: "25px",
        color: "#ffffff",
        stroke: "#07314d",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.awardObjects.push(this.awardTitleText);

    this.awardHighlightRect = this.add
      .rectangle(640, 452, 500, 54, 0xfff4a3, 1)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setDepth(101);
    this.awardObjects.push(this.awardHighlightRect);

    this.awardNameText = this.add
      .text(640, 452, "", {
        fontFamily: "Arial Black, Arial",
        fontSize: "28px",
        color: "#07314d",
      })
      .setOrigin(0.5)
      .setDepth(102);
    this.awardObjects.push(this.awardNameText);

    this.awardSubText = this.add
      .text(640, 510, "Spinning through all real players...", {
        fontFamily: "Arial",
        fontSize: "17px",
        color: "#d8f6ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(102);
    this.awardObjects.push(this.awardSubText);
  }

  private updateAwardHighlight(
    player: PlayerSnapshot,
    finalStep: boolean,
  ): void {
    if (!this.awardNameText || !this.awardHighlightRect || !this.awardSubText)
      return;

    const singlePlayerSpin =
      this.getAwardParticipants().length === 1 && !finalStep;
    if (singlePlayerSpin) {
      const suspenseFrames = [
        "Drawing...",
        "Spinning...",
        "Choosing...",
        "Almost there...",
      ];
      const currentText = this.awardNameText.text;
      const nextIndex = Math.max(
        0,
        (suspenseFrames.indexOf(currentText) + 1) % suspenseFrames.length,
      );
      this.awardNameText.setText(suspenseFrames[nextIndex]);
      this.awardHighlightRect.setFillStyle(0xfff4a3, 1);
      this.awardNameText.setColor("#07314d");
      this.awardNameText.setStroke("#ffffff", 3);
      return;
    }

    this.awardNameText.setText(player.name);
    this.awardHighlightRect.setFillStyle(
      Number.parseInt(player.color.replace("#", "0x")),
      1,
    );
    this.awardNameText.setColor("#ffffff");
    this.awardNameText.setStroke("#07314d", 5);

    if (finalStep) {
      const winnerName =
        this.state?.participationAwardWinnerName ?? player.name;
      this.awardTitleText?.setText("Participation Award Winner!");
      this.awardNameText.setText(`🎉 ${winnerName} 🎉`);
      this.awardSubText.setText("Great cheering and participation!");
      this.awardAnimating = false;
      this.awardFinalVisible = true;
      this.awardComplete = false;
      this.spawnConfetti();
      this.renderResults();
      this.awardHideTimer?.remove(false);
      this.awardHideTimer = this.time.delayedCall(3000, () => {
        this.awardFinalVisible = false;
        this.awardComplete = true;
        this.clearAwardObjects();
        this.renderResults();
      });
    }
  }

  private pickAwardStepCount(count: number, winnerIndex: number): number {
    for (
      let steps = count <= 1 ? 42 : 34;
      steps <= (count <= 1 ? 52 : 58);
      steps++
    ) {
      if (this.awardIndexForStep(steps - 1, count) === winnerIndex)
        return steps;
    }
    return Math.max(1, winnerIndex + 1);
  }

  private awardIndexForStep(step: number, count: number): number {
    if (count <= 1) return 0;
    const period = count * 2 - 2;
    const value = step % period;
    return value < count ? value : period - value;
  }

  private spawnConfetti(): void {
    const colors = [
      0xfff4a3, 0x9de9ff, 0xf97316, 0x22c55e, 0xec4899, 0x8b5cf6, 0xffffff,
    ];
    for (let i = 0; i < 80; i++) {
      const confetti = this.add
        .rectangle(
          320 + Math.random() * 640,
          300 + Math.random() * 80,
          5 + Math.random() * 7,
          8 + Math.random() * 10,
          colors[Math.floor(Math.random() * colors.length)],
          1,
        )
        .setDepth(150)
        .setAngle(Math.random() * 360);
      this.awardObjects.push(confetti);
      this.tweens.add({
        targets: confetti,
        y: 620 + Math.random() * 60,
        x: confetti.x + (Math.random() - 0.5) * 260,
        angle: confetti.angle + 180 + Math.random() * 360,
        alpha: 0,
        duration: 1700 + Math.random() * 900,
        ease: "Sine.easeOut",
      });
    }
  }
}
