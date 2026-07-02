import { Client, Room } from "@colyseus/core";
import { registerRoomCode, unregisterRoomCode } from "./roomCodeRegistry.js";
import type {
  AimCommand,
  EliminationEntry,
  GamePhase,
  GameSnapshot,
  PlayerSnapshot,
  PocketSnapshot,
} from "./types.js";

const MAX_PLAYERS = 40;
const TEST_BOT_COUNT = 8;
const COUNTDOWN_MS = 10_000;
const TICK_RATE_MS = 33;
const TABLE_W = 1020;
const TABLE_H = 420;
const PENGUIN_RADIUS = 18;
const POCKET_RADIUS = 44;
const EXTRA_POCKET_RADIUS = 32;
const MAX_SHOT_SPEED = 760;
const MIN_STOP_SPEED = 10;
const WALL_RESTITUTION = 0.88;
const PENGUIN_RESTITUTION = 0.96;
const ICE_FRICTION_PER_SECOND = 0.54;
const SAFETY_ROLLING_TIMEOUT_MS = 14_000;

const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_W / 2, y: 0 },
  { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H },
  { x: TABLE_W / 2, y: TABLE_H },
  { x: TABLE_W, y: TABLE_H },
];

const COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#10b981",
  "#7c3aed",
  "#db2777",
  "#2563eb",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#9333ea",
  "#c026d3",
  "#be123c",
  "#0f766e",
  "#1d4ed8",
  "#b45309",
  "#15803d",
  "#7e22ce",
  "#0e7490",
  "#9f1239",
  "#047857",
  "#4338ca",
  "#a21caf",
  "#475569",
];

const BOT_NAMES = [
  "Frosty",
  "Pebble",
  "Snowball",
  "Waddle",
  "Iggy",
  "Bubbles",
  "Flipper",
  "Nugget",
];

function generateRoomCode(): string {
  // 5 digit numeric classroom code. Avoid leading zero so it always displays as five digits.
  return String(Math.floor(10000 + Math.random() * 90000));
}

function cleanName(value: unknown): string {
  const raw = typeof value === "string" ? value : "Penguin";
  const cleaned = raw
    .replace(/[^a-zA-Z0-9 _.-]/g, "")
    .trim()
    .slice(0, 12);
  return cleaned.length > 0 ? cleaned : "Penguin";
}

function cleanDeviceId(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const cleaned = raw.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80);
  return cleaned.length > 0 ? cleaned : `unknown-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceSquared(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function isNearPocketList(
  x: number,
  y: number,
  pockets: Array<{ x: number; y: number }>,
  radius: number,
  extra = 0,
): boolean {
  const r = radius + extra;
  for (const pocket of pockets) {
    if (distanceSquared(x, y, pocket.x, pocket.y) <= r * r) return true;
  }
  return false;
}

export class KnockoutRoom extends Room {
  maxClients = MAX_PLAYERS;

  private roomCode = generateRoomCode();
  private phase: GamePhase = "lobby";
  private players = new Map<string, PlayerSnapshot>();
  private aimCommands = new Map<string, AimCommand>();
  private eliminationOrder: EliminationEntry[] = [];
  private extraPockets: PocketSnapshot[] = [];
  private championId: string | null = null;
  private championName: string | null = null;
  private participationAwardWinnerId: string | null = null;
  private participationAwardWinnerName: string | null = null;
  private countdownMs = COUNTDOWN_MS;
  private round = 0;
  private lastTickTime = Date.now();
  private rollingStartedAt = 0;
  private message = "Waiting for host to start.";
  private botCounter = 0;
  private botsEnabled = false;
  private deviceIds = new Map<string, string>();
  private cheerThrottle = new Map<string, number>();

  onAuth(client: Client, options: { deviceId?: unknown }): boolean {
    const deviceId = cleanDeviceId(options.deviceId);
    const duplicate = Array.from(this.players.values()).find(
      (p) =>
        p.connected &&
        !p.isBot &&
        this.deviceIds.get(p.id) === deviceId,
    );

    if (duplicate) {
      throw new Error(
        "This device is already connected to this room. Use the existing tab or device.",
      );
    }

    return true;
  }

  onCreate(): void {
    registerRoomCode(this.roomCode, this.roomId);
    this.setMetadata({ roomCode: this.roomCode });

    this.onMessage("startGame", (client) => {
      if (!this.isHost(client.sessionId)) return;
      if (this.phase !== "lobby" && this.phase !== "finished") return;
      this.startGame();
    });

    this.onMessage("playAgain", (client) => {
      if (!this.isHost(client.sessionId)) return;
      if (this.phase !== "finished") return;
      this.startGame();
    });

    this.onMessage("returnLobby", (client) => {
      if (!this.isHost(client.sessionId)) return;
      this.returnToLobby();
    });

    this.onMessage("toggleBots", (client, data: { enabled?: unknown }) => {
      if (!this.isHost(client.sessionId)) return;
      if (this.phase !== "lobby") return;
      this.botsEnabled = data.enabled === true;
      if (this.botsEnabled) {
        this.ensureTestBots();
        this.message = "8 test bots are ready for local testing.";
      } else {
        this.removeTestBots();
        this.message = "Test bots removed. Only real players will join the match.";
      }
      this.broadcastSnapshot();
    });

    this.onMessage("kickPlayer", (client, data: { playerId?: unknown }) => {
      if (!this.isHost(client.sessionId)) return;
      if (this.phase !== "lobby") return;
      const targetId = typeof data.playerId === "string" ? data.playerId : "";
      this.kickPlayer(targetId);
    });

    this.onMessage("aim", (client, data: Partial<AimCommand>) => {
      if (this.phase !== "aiming") return;
      const player = this.players.get(client.sessionId);
      if (!player?.alive || player.isBot) return;
      const angle =
        typeof data.angle === "number" && Number.isFinite(data.angle)
          ? data.angle
          : 0;
      const power =
        typeof data.power === "number" && Number.isFinite(data.power)
          ? clamp(data.power, 0, 1)
          : 0;
      this.aimCommands.set(client.sessionId, { angle, power });
    });

    this.onMessage("cheer", (client, data: { targetId?: unknown }) => {
      this.handleCheer(client.sessionId, data?.targetId);
    });

    this.clock.setInterval(() => this.tick(), TICK_RATE_MS);
    this.clock.setInterval(() => this.broadcastSnapshot(), 100);
  }

  onJoin(client: Client, options: { name?: string; deviceId?: unknown }): void {
    const firstHumanPlayer = this.getConnectedHumans().length === 0;
    const joinedDuringActiveGame = this.phase !== "lobby";
    const player: PlayerSnapshot = {
      id: client.sessionId,
      name: cleanName(options.name),
      color: COLORS[this.players.size % COLORS.length],
      x: TABLE_W / 2,
      y: TABLE_H / 2,
      vx: 0,
      vy: 0,
      alive: !joinedDuringActiveGame,
      host: firstHumanPlayer,
      connected: true,
      eliminatedRound: null,
      isBot: false,
      spectator: joinedDuringActiveGame,
      cheerCount: 0,
    };

    this.players.set(client.sessionId, player);
    this.deviceIds.set(client.sessionId, cleanDeviceId(options.deviceId));
    this.ensureHost();

    this.message = joinedDuringActiveGame
      ? `${player.name} joined as a spectator and can play next game.`
      : firstHumanPlayer
        ? `${player.name} is the host.`
        : `${player.name} joined.`;

    this.broadcastSnapshot();
  }

  onLeave(client: Client): void {
    const player = this.players.get(client.sessionId);
    if (!player) return;

    if (this.phase === "lobby") {
      this.players.delete(client.sessionId);
      this.deviceIds.delete(client.sessionId);
      this.ensureHost();
    } else {
      player.connected = false;
      if (player.alive && !player.spectator) this.eliminatePlayer(player, "disconnected");
      this.ensureHost();
      this.checkForChampion();
    }

    this.broadcastSnapshot();
  }

  onDispose(): void {
    unregisterRoomCode(this.roomCode);
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(
      0.08,
      Math.max(0.001, (now - this.lastTickTime) / 1000),
    );
    this.lastTickTime = now;

    if (this.phase === "aiming") {
      this.countdownMs -= dt * 1000;
      if (this.countdownMs <= 0) this.fireAllPenguins();
      return;
    }

    if (this.phase === "rolling") {
      this.updatePhysics(dt);
      this.checkForChampion();
      if (this.phase !== "rolling") return;

      const allStopped = this.getAlivePlayers().every(
        (p) => Math.hypot(p.vx, p.vy) < MIN_STOP_SPEED,
      );
      const timedOut = now - this.rollingStartedAt > SAFETY_ROLLING_TIMEOUT_MS;
      if (allStopped || timedOut) {
        for (const p of this.getAlivePlayers()) {
          p.vx = 0;
          p.vy = 0;
        }
        this.checkForChampion();
        if (this.phase === "rolling") this.beginAimingRound();
      }
    }
  }

  private startGame(): void {
    if (this.botsEnabled) this.ensureTestBots();
    else this.removeTestBots();
    this.phase = "rolling";
    this.round = 0;
    this.eliminationOrder = [];
    this.extraPockets = [];
    this.championId = null;
    this.championName = null;
    this.participationAwardWinnerId = null;
    this.participationAwardWinnerName = null;
    this.aimCommands.clear();
    this.cheerThrottle.clear();
    this.message = "Game started.";

    const activePlayers = Array.from(this.players.values()).filter(
      (p) => p.connected,
    );
    for (const p of activePlayers) {
      p.spectator = false;
      p.alive = true;
      p.eliminatedRound = null;
      p.cheerCount = 0;
      p.vx = 0;
      p.vy = 0;
    }

    this.spawnPlayers(activePlayers);
    this.beginAimingRound();
  }

  private returnToLobby(): void {
    this.phase = "lobby";
    this.round = 0;
    this.countdownMs = COUNTDOWN_MS;
    this.eliminationOrder = [];
    this.extraPockets = [];
    this.championId = null;
    this.championName = null;
    this.participationAwardWinnerId = null;
    this.participationAwardWinnerName = null;
    this.aimCommands.clear();
    this.cheerThrottle.clear();
    this.message = "Back in the lobby.";

    for (const p of Array.from(this.players.values())) {
      if (!p.connected && !p.isBot) {
        this.players.delete(p.id);
        continue;
      }
      p.spectator = false;
      p.alive = true;
      p.eliminatedRound = null;
      p.cheerCount = 0;
      p.vx = 0;
      p.vy = 0;
    }

    if (this.botsEnabled) this.ensureTestBots();
    else this.removeTestBots();
    this.ensureHost();
    this.broadcastSnapshot();
  }

  private beginAimingRound(): void {
    this.phase = "aiming";
    this.round += 1;
    const holeCountBefore = this.extraPockets.length;
    this.syncExtraPocketsForRound();
    this.countdownMs = COUNTDOWN_MS;
    this.aimCommands.clear();
    this.queueBotAims();
    this.message =
      this.extraPockets.length > holeCountBefore
        ? `A new ice hole opened! ${this.extraPockets.length} extra hole${this.extraPockets.length === 1 ? "" : "s"} now.`
        : "Aim now. Everyone fires together when the countdown ends.";
    this.broadcastSnapshot();
  }

  private fireAllPenguins(): void {
    this.phase = "rolling";
    this.rollingStartedAt = Date.now();
    this.message = "Penguins launched.";

    for (const player of this.getAlivePlayers()) {
      const command = this.aimCommands.get(player.id) ?? {
        angle: Math.random() * Math.PI * 2,
        power: 0.28,
      };
      const speed = clamp(command.power, 0, 1) * MAX_SHOT_SPEED;
      player.vx += Math.cos(command.angle) * speed;
      player.vy += Math.sin(command.angle) * speed;
    }

    this.aimCommands.clear();
    this.broadcastSnapshot();
  }

  private updatePhysics(dt: number): void {
    const alive = this.getAlivePlayers();

    for (const p of alive) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (this.isInAnyPocket(p.x, p.y, -6)) {
        this.eliminatePlayer(p, "pocket");
        continue;
      }

      if (p.x < PENGUIN_RADIUS) {
        p.x = PENGUIN_RADIUS;
        p.vx = Math.abs(p.vx) * WALL_RESTITUTION;
      } else if (p.x > TABLE_W - PENGUIN_RADIUS) {
        p.x = TABLE_W - PENGUIN_RADIUS;
        p.vx = -Math.abs(p.vx) * WALL_RESTITUTION;
      }

      if (p.y < PENGUIN_RADIUS) {
        p.y = PENGUIN_RADIUS;
        p.vy = Math.abs(p.vy) * WALL_RESTITUTION;
      } else if (p.y > TABLE_H - PENGUIN_RADIUS) {
        p.y = TABLE_H - PENGUIN_RADIUS;
        p.vy = -Math.abs(p.vy) * WALL_RESTITUTION;
      }
    }

    this.resolvePenguinCollisions();

    const friction = Math.pow(ICE_FRICTION_PER_SECOND, dt);
    for (const p of this.getAlivePlayers()) {
      p.vx *= friction;
      p.vy *= friction;
      if (Math.hypot(p.vx, p.vy) < 4) {
        p.vx = 0;
        p.vy = 0;
      }
    }
  }

  private resolvePenguinCollisions(): void {
    const alive = this.getAlivePlayers();
    const minDist = PENGUIN_RADIUS * 2;

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velocityAlongNormal = rvx * nx + rvy * ny;
        if (velocityAlongNormal > 0) continue;

        const impulse = (-(1 + PENGUIN_RESTITUTION) * velocityAlongNormal) / 2;
        const ix = impulse * nx;
        const iy = impulse * ny;

        a.vx -= ix;
        a.vy -= iy;
        b.vx += ix;
        b.vy += iy;
      }
    }
  }

  private eliminatePlayer(
    player: PlayerSnapshot,
    reason: "pocket" | "disconnected",
  ): void {
    if (!player.alive) return;
    player.alive = false;
    player.vx = 0;
    player.vy = 0;
    player.eliminatedRound = this.round;

    if (!this.eliminationOrder.some((entry) => entry.id === player.id)) {
      this.eliminationOrder.push({
        id: player.id,
        name: player.name,
        round: this.round,
      });
    }

    this.message =
      reason === "pocket"
        ? `${player.name} fell into a pocket!`
        : `${player.name} disconnected and is out.`;
  }

  private handleCheer(sourceId: string, targetIdValue: unknown): void {
    if (this.round <= 5) return;
    if (this.phase !== "aiming" && this.phase !== "rolling") return;

    const source = this.players.get(sourceId);
    if (!source || source.isBot || source.spectator || source.alive) return;

    const targetId = typeof targetIdValue === "string" ? targetIdValue : "";
    const target = this.players.get(targetId);
    if (!target || !target.connected || target.spectator || !target.alive) return;

    const now = Date.now();
    const lastCheer = this.cheerThrottle.get(sourceId) ?? 0;
    if (now - lastCheer < 80) return;

    this.cheerThrottle.set(sourceId, now);
    target.cheerCount += 1;
    this.broadcastSnapshot();
  }

  private checkForChampion(): void {
    if (this.phase === "finished" || this.phase === "lobby") return;
    const alive = this.getAlivePlayers();
    const connectedPlayers = Array.from(this.players.values()).filter(
      (p) => p.connected && !p.spectator,
    );

    if (connectedPlayers.length === 0) {
      this.phase = "lobby";
      return;
    }

    if (alive.length <= 1) {
      const lastEliminated =
        this.eliminationOrder[this.eliminationOrder.length - 1];
      const champion =
        alive[0] ??
        connectedPlayers.find((p) => p.id === lastEliminated?.id) ??
        connectedPlayers[0] ??
        null;
      this.championId = champion?.id ?? null;
      this.championName = champion?.name ?? null;
      this.chooseParticipationAwardWinner();
      this.phase = "finished";
      this.countdownMs = 0;
      this.message = champion
        ? `${champion.name} is the Knockout champion!`
        : "No champion this round.";
      this.broadcastSnapshot();
    }
  }

  private spawnPlayers(players: PlayerSnapshot[]): void {
    const placed: PlayerSnapshot[] = [];
    for (const p of players) {
      let attempts = 0;
      let x = TABLE_W / 2;
      let y = TABLE_H / 2;
      do {
        x =
          PENGUIN_RADIUS +
          45 +
          Math.random() * (TABLE_W - (PENGUIN_RADIUS + 45) * 2);
        y =
          PENGUIN_RADIUS +
          45 +
          Math.random() * (TABLE_H - (PENGUIN_RADIUS + 45) * 2);
        attempts++;
      } while (
        attempts < 300 &&
        (this.isInAnyPocket(x, y, 58) ||
          placed.some(
            (other) =>
              distanceSquared(x, y, other.x, other.y) <
              (PENGUIN_RADIUS * 3.1) ** 2,
          ))
      );

      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
      placed.push(p);
    }
  }

  private ensureTestBots(): void {
    const existingBots = Array.from(this.players.values()).filter(
      (p) => p.isBot,
    );
    const botSlotsAvailable = Math.max(0, MAX_PLAYERS - this.players.size);
    const needed = Math.min(
      TEST_BOT_COUNT - existingBots.length,
      botSlotsAvailable,
    );

    for (let i = 0; i < needed; i++) {
      const botIndex = existingBots.length + i;
      const id = `bot-${++this.botCounter}`;
      const bot: PlayerSnapshot = {
        id,
        name: BOT_NAMES[botIndex % BOT_NAMES.length],
        color: COLORS[this.players.size % COLORS.length],
        x: TABLE_W / 2,
        y: TABLE_H / 2,
        vx: 0,
        vy: 0,
        alive: this.phase === "lobby",
        host: false,
        connected: true,
        eliminatedRound: null,
        isBot: true,
        spectator: false,
        cheerCount: 0,
      };
      this.players.set(id, bot);
    }
  }

  private chooseParticipationAwardWinner(): void {
    const eligible = Array.from(this.players.values()).filter(
      (p) => !p.isBot && !p.spectator,
    );

    if (eligible.length === 0) {
      this.participationAwardWinnerId = null;
      this.participationAwardWinnerName = null;
      return;
    }

    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    this.participationAwardWinnerId = winner.id;
    this.participationAwardWinnerName = winner.name;
  }

  private removeTestBots(): void {
    for (const [id, player] of Array.from(this.players.entries())) {
      if (!player.isBot) continue;
      this.players.delete(id);
      this.aimCommands.delete(id);
      this.deviceIds.delete(id);
    }
  }

  private kickPlayer(targetId: string): void {
    const target = this.players.get(targetId);
    if (!target || target.host || target.isBot) return;

    this.message = `${target.name} was removed by the host.`;
    const targetClient = this.clients.find((c) => c.sessionId === targetId);
    if (targetClient) {
      targetClient.leave(4001);
    } else {
      this.players.delete(targetId);
      this.deviceIds.delete(targetId);
      this.ensureHost();
      this.broadcastSnapshot();
    }
  }

  private queueBotAims(): void {
    const alive = this.getAlivePlayers();
    const bots = alive.filter((p) => p.isBot);

    for (const bot of bots) {
      const targets = alive.filter((p) => p.id !== bot.id);
      const target = this.pickBotTarget(bot, targets);

      if (!target || Math.random() < 0.16) {
        this.aimCommands.set(bot.id, {
          angle: Math.random() * Math.PI * 2,
          power: 0.35 + Math.random() * 0.55,
        });
        continue;
      }

      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const spread = (Math.random() - 0.5) * 0.45;
      this.aimCommands.set(bot.id, {
        angle: Math.atan2(dy, dx) + spread,
        power: clamp(distance / 620 + 0.22 + Math.random() * 0.22, 0.38, 0.96),
      });
    }
  }

  private pickBotTarget(
    bot: PlayerSnapshot,
    targets: PlayerSnapshot[],
  ): PlayerSnapshot | null {
    if (targets.length === 0) return null;

    const humans = targets.filter((p) => !p.isBot);
    const targetPool =
      humans.length > 0 && Math.random() < 0.72 ? humans : targets;

    return targetPool.sort((a, b) => {
      const da = distanceSquared(bot.x, bot.y, a.x, a.y);
      const db = distanceSquared(bot.x, bot.y, b.x, b.y);
      return da - db;
    })[0];
  }

  private syncExtraPocketsForRound(): void {
    const targetCount = Math.max(0, this.round - 10);

    while (this.extraPockets.length < targetCount) {
      this.extraPockets.push(this.createExtraPocket());
      this.message = "A new ice hole cracked open on the table!";
    }
  }

  private createExtraPocket(): PocketSnapshot {
    const margin = EXTRA_POCKET_RADIUS + PENGUIN_RADIUS + 42;
    const alive = this.getAlivePlayers();

    for (let attempt = 0; attempt < 700; attempt++) {
      const x = margin + Math.random() * (TABLE_W - margin * 2);
      const y = margin + Math.random() * (TABLE_H - margin * 2);

      const tooCloseToPocket = isNearPocketList(
        x,
        y,
        POCKETS,
        POCKET_RADIUS,
        EXTRA_POCKET_RADIUS + 54,
      );
      const tooCloseToHole = this.extraPockets.some((hole) => {
        const safeDistance = EXTRA_POCKET_RADIUS * 2 + 100;
        return (
          distanceSquared(x, y, hole.x, hole.y) < safeDistance * safeDistance
        );
      });
      const tooCloseToPlayer = alive.some((player) => {
        const safeDistance = EXTRA_POCKET_RADIUS + PENGUIN_RADIUS + 72;
        return (
          distanceSquared(x, y, player.x, player.y) <
          safeDistance * safeDistance
        );
      });

      if (!tooCloseToPocket && !tooCloseToHole && !tooCloseToPlayer) {
        return {
          id: `hole-${this.round}-${this.extraPockets.length + 1}`,
          x,
          y,
        };
      }
    }

    // Fallback for very crowded late rounds. It still stays away from the table edge.
    const x = margin + Math.random() * (TABLE_W - margin * 2);
    const y = margin + Math.random() * (TABLE_H - margin * 2);
    return { id: `hole-${this.round}-${this.extraPockets.length + 1}`, x, y };
  }

  private isInAnyPocket(x: number, y: number, extra = 0): boolean {
    return (
      isNearPocketList(x, y, POCKETS, POCKET_RADIUS, extra) ||
      isNearPocketList(x, y, this.extraPockets, EXTRA_POCKET_RADIUS, extra)
    );
  }

  private getAlivePlayers(): PlayerSnapshot[] {
    return Array.from(this.players.values()).filter(
      (p) => p.alive && p.connected && !p.spectator,
    );
  }

  private getConnectedHumans(): PlayerSnapshot[] {
    return Array.from(this.players.values()).filter(
      (p) => p.connected && !p.isBot,
    );
  }

  private isHost(sessionId: string): boolean {
    const player = this.players.get(sessionId);
    return player?.host === true && !player.isBot;
  }

  private ensureHost(): void {
    const connectedHumans = this.getConnectedHumans();
    if (connectedHumans.length === 0) return;

    const existingHost = connectedHumans.find((p) => p.host);
    for (const p of this.players.values()) {
      p.host = p.id === (existingHost?.id ?? connectedHumans[0].id);
    }
  }

  private buildSnapshot(): GameSnapshot {
    const totalCheers = Array.from(this.players.values()).reduce(
      (sum, player) => sum + (player.cheerCount ?? 0),
      0,
    );

    return {
      roomCode: this.roomCode,
      phase: this.phase,
      players: Array.from(this.players.values()),
      eliminationOrder: this.eliminationOrder,
      extraPockets: this.extraPockets,
      championId: this.championId,
      championName: this.championName,
      botsEnabled: this.botsEnabled,
      totalCheers,
      participationAwardWinnerId: this.participationAwardWinnerId,
      participationAwardWinnerName: this.participationAwardWinnerName,
      countdownMs: Math.max(0, Math.round(this.countdownMs)),
      round: this.round,
      table: {
        width: TABLE_W,
        height: TABLE_H,
        pocketRadius: POCKET_RADIUS,
        extraPocketRadius: EXTRA_POCKET_RADIUS,
        penguinRadius: PENGUIN_RADIUS,
      },
      message: this.message,
    };
  }

  private broadcastSnapshot(): void {
    this.broadcast("state", this.buildSnapshot());
  }
}
