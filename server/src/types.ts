export type GamePhase = "lobby" | "aiming" | "rolling" | "finished";

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  host: boolean;
  connected: boolean;
  eliminatedRound: number | null;
  isBot: boolean;
  spectator: boolean;
  cheerCount: number;
}

export interface EliminationEntry {
  id: string;
  name: string;
  round: number;
}

export interface PocketSnapshot {
  id: string;
  x: number;
  y: number;
}

export interface GameSnapshot {
  roomCode: string;
  phase: GamePhase;
  players: PlayerSnapshot[];
  eliminationOrder: EliminationEntry[];
  extraPockets: PocketSnapshot[];
  championId: string | null;
  championName: string | null;
  botsEnabled: boolean;
  totalCheers: number;
  participationAwardWinnerId: string | null;
  participationAwardWinnerName: string | null;
  countdownMs: number;
  round: number;
  table: {
    width: number;
    height: number;
    pocketRadius: number;
    extraPocketRadius: number;
    penguinRadius: number;
  };
  message: string;
}

export interface AimCommand {
  angle: number;
  power: number;
}
