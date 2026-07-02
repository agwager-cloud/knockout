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

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const TABLE_X = 130;
export const TABLE_Y = 148;
export const TABLE_W = 1020;
export const TABLE_H = 420;

export const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_W / 2, y: 0 },
  { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H },
  { x: TABLE_W / 2, y: TABLE_H },
  { x: TABLE_W, y: TABLE_H },
];

export const PENGUIN_RADIUS = 18;
export const POCKET_RADIUS = 44;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatCountdown(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}`;
}
