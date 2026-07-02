import { Client, Room } from '@colyseus/sdk';
import type { GameSnapshot } from '../shared';

// Later, when deploying to Render, replace this with your real Render URL.
// For local testing, the code below automatically uses localhost or your LAN IP.
const RENDER_SERVER_URL = 'https://knockout-server.onrender.com';

function normaliseHttpUrl(url: string): string {
  return url.replace(/\/$/, '').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

function toWsUrl(url: string): string {
  return normaliseHttpUrl(url).replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

function isLocalOrLanHost(hostname: string): boolean {
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) return true;
  if (hostname.endsWith('.local')) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

function defaultServerUrl(): string {
  const host = window.location.hostname;
  if (isLocalOrLanHost(host)) {
    return `http://${host === '0.0.0.0' ? 'localhost' : host}:2567`;
  }
  return RENDER_SERVER_URL;
}

function getOrCreateDeviceId(): string {
  const key = 'knockout-device-id';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export const HTTP_SERVER_URL = normaliseHttpUrl(import.meta.env.VITE_SERVER_URL || defaultServerUrl());
export const WS_SERVER_URL = toWsUrl(HTTP_SERVER_URL);

let client: Client | null = null;
let room: Room | null = null;
let latestState: GameSnapshot | null = null;
let stateListeners = new Set<(state: GameSnapshot) => void>();
let connectionError = '';

function getClient(): Client {
  if (!client) client = new Client(WS_SERVER_URL);
  return client;
}

function attachRoom(nextRoom: Room): Room {
  room = nextRoom;
  latestState = null;
  connectionError = '';

  room.onMessage('state', (state: GameSnapshot) => {
    latestState = state;
    stateListeners.forEach((listener) => listener(state));
  });

  room.onLeave((code) => {
    connectionError = `Disconnected from server (${code}).`;
  });

  return room;
}

export function getRoom(): Room | null {
  return room;
}

export function getMyId(): string {
  return room?.sessionId ?? '';
}

export function getLatestState(): GameSnapshot | null {
  return latestState;
}

export function getConnectionError(): string {
  return connectionError;
}

export function watchState(listener: (state: GameSnapshot) => void): () => void {
  stateListeners.add(listener);
  if (latestState) listener(latestState);
  return () => stateListeners.delete(listener);
}

export async function hostGame(name: string): Promise<Room> {
  const created = await getClient().create('knockout', { name, deviceId: getOrCreateDeviceId() });
  return attachRoom(created);
}

export async function joinGame(name: string, roomCode: string): Promise<Room> {
  const code = roomCode.trim();
  const response = await fetch(`${HTTP_SERVER_URL}/room-by-code/${encodeURIComponent(code)}`);
  if (!response.ok) {
    throw new Error('Room code not found. Check the code and try again.');
  }
  const data = (await response.json()) as { roomId: string };
  const joined = await getClient().joinById(data.roomId, { name, deviceId: getOrCreateDeviceId() });
  return attachRoom(joined);
}

export function sendStartGame(): void {
  room?.send('startGame');
}

export function sendToggleBots(enabled: boolean): void {
  room?.send('toggleBots', { enabled });
}

export function sendKickPlayer(playerId: string): void {
  room?.send('kickPlayer', { playerId });
}

export function sendPlayAgain(): void {
  room?.send('playAgain');
}

export function sendReturnLobby(): void {
  room?.send('returnLobby');
}

export function sendAim(angle: number, power: number): void {
  room?.send('aim', { angle, power });
}
