import { Client, Room } from '@colyseus/sdk';
import type { BotMode, GameSnapshot } from '../shared';

// Safe production fallback for itch.io builds. Localhost and private LAN hosts
// still connect to the matching computer on port 2567 for classroom testing.
const RENDER_SERVER_URL = 'https://knockout-zvwb.onrender.com';
const STARTUP_WINDOW_MS = 100_000;
const WARMUP_WINDOW_MS = 76_000;
const ROOM_CONNECTION_RESERVE_MS = 20_000;
const MATCHMAKING_ATTEMPT_MS = 35_000;
const INITIAL_STATE_TIMEOUT_MS = 20_000;
const MAX_MATCHMAKING_ATTEMPTS = 4;

export type ConnectionProgress = {
  stage: 'waking' | 'connecting' | 'joining' | 'syncing';
  message: string;
  elapsedMs: number;
  maxMs: number;
};

export type ConnectionProgressHandler = (progress: ConnectionProgress) => void;

function normaliseHttpUrl(url: string): string {
  return url.trim().replace(/\/$/, '').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
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

  // Never fall back to the itch.io page hostname (html-classic.itch.zone).
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error(message);
      error.name = 'ConnectionTimeoutError';
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export const HTTP_SERVER_URL = normaliseHttpUrl(import.meta.env.VITE_SERVER_URL || defaultServerUrl());
export const WS_SERVER_URL = toWsUrl(HTTP_SERVER_URL);

let client: Client | null = null;
let room: Room | null = null;
let latestState: GameSnapshot | null = null;
const stateListeners = new Set<(state: GameSnapshot) => void>();
let connectionError = '';

function getClient(): Client {
  if (!client) client = new Client(WS_SERVER_URL);
  return client;
}

function resetClient(): Client {
  client = new Client(WS_SERVER_URL);
  return client;
}

function reportProgress(
  handler: ConnectionProgressHandler | undefined,
  stage: ConnectionProgress['stage'],
  message: string,
  startedAt: number
): void {
  handler?.({
    stage,
    message,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    maxMs: STARTUP_WINDOW_MS
  });
}

async function tryWakeEndpoint(path: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${HTTP_SERVER_URL}${path}`, timeoutMs);
    if (!response.ok) return false;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      return payload?.ok !== false;
    }

    // Older stable builds returned plain text from the root route.
    return path === '/';
  } catch (error) {
    console.warn(`[knockout] Wake request ${path} did not complete`, error);
    return false;
  }
}

async function warmServer(
  deadline: number,
  startedAt: number,
  onProgress?: ConnectionProgressHandler
): Promise<boolean> {
  const warmupDeadline = Math.min(
    deadline - ROOM_CONNECTION_RESERVE_MS,
    startedAt + WARMUP_WINDOW_MS
  );
  const endpoints = ['/api/status', '/'];
  let attempt = 0;
  let fastFailures = 0;

  while (Date.now() < warmupDeadline) {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    reportProgress(
      onProgress,
      'waking',
      elapsedSeconds < 8
        ? 'Contacting the Knockout classroom server...'
        : elapsedSeconds < 55
          ? 'Waking the free classroom server. This can take 60–100 seconds after it has been asleep.'
          : 'The server is still starting. Keep this page open; Knockout will continue automatically.',
      startedAt
    );

    const remaining = warmupDeadline - Date.now();
    const path = endpoints[attempt % endpoints.length];
    const checkStartedAt = Date.now();
    const ready = await tryWakeEndpoint(path, Math.max(1200, Math.min(8000, remaining)));
    const checkDuration = Date.now() - checkStartedAt;

    if (ready) {
      reportProgress(
        onProgress,
        'connecting',
        'Server is awake. Opening the secure classroom connection...',
        startedAt
      );
      return true;
    }

    // Browser extensions often reject blocked background requests immediately.
    // Stop relying on fetch after two fast failures and try the real Colyseus
    // connection instead of waiting the full warm-up period.
    fastFailures = checkDuration < 700 ? fastFailures + 1 : 0;
    if (fastFailures >= 2 && Date.now() - startedAt >= 2500) break;

    attempt += 1;
    if (Date.now() < warmupDeadline) {
      await delay(Math.min(2200, warmupDeadline - Date.now()));
    }
  }

  reportProgress(
    onProgress,
    'connecting',
    'Trying the secure Knockout classroom connection now...',
    startedAt
  );
  return false;
}

function attachRoom(nextRoom: Room): Room {
  room = nextRoom;
  latestState = null;
  connectionError = '';

  nextRoom.onMessage('state', (state: GameSnapshot) => {
    if (room !== nextRoom) return;
    latestState = state;
    stateListeners.forEach((listener) => listener(state));
  });

  nextRoom.onLeave((code) => {
    if (room === nextRoom) connectionError = `Disconnected from server (${code}).`;
  });

  return nextRoom;
}

function safelyLeaveRoom(target: Room | null): void {
  if (!target) return;
  try {
    target.leave(true);
  } catch {
    // Ignore cleanup errors from a connection that is already closing.
  }
  if (room === target) {
    room = null;
    latestState = null;
  }
}

function hasInitialPlayerState(targetRoom: Room): boolean {
  return Boolean(
    latestState &&
      room === targetRoom &&
      latestState.players.some((player) => player.id === targetRoom.sessionId)
  );
}

async function waitForInitialState(
  targetRoom: Room,
  startedAt: number,
  onProgress?: ConnectionProgressHandler
): Promise<void> {
  reportProgress(
    onProgress,
    'syncing',
    'Connected. Loading the Knockout classroom lobby...',
    startedAt
  );

  const deadline = Date.now() + INITIAL_STATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (hasInitialPlayerState(targetRoom)) return;
    await delay(50);
  }

  throw new Error(
    'The server connected, but the classroom lobby did not finish loading within 20 seconds. Please press Host or Join once more.'
  );
}

function classroomConnectionError(action: 'host' | 'join', error: unknown): Error {
  const serverHost = (() => {
    try {
      return new URL(HTTP_SERVER_URL).host;
    } catch {
      return HTTP_SERVER_URL;
    }
  })();
  const detail = error instanceof Error ? error.message : String(error || 'Unknown connection error');
  console.error(`[knockout] Final ${action} connection error: ${detail}`);

  const actionText = action === 'host' ? 'create the Knockout classroom' : 'join the Knockout classroom';
  return new Error(
    `Could not ${actionText} after waiting up to 100 seconds. ` +
      `If Knockout works in InPrivate/Incognito but not in a normal window, a browser extension or school filter is blocking the connection. ` +
      `Use an InPrivate window for class, or ask IT to allow ${serverHost} and secure WebSocket connections.`
  );
}

async function createWithRetries(
  name: string,
  deadline: number,
  startedAt: number,
  serverConfirmedReady: boolean,
  onProgress?: ConnectionProgressHandler
): Promise<Room> {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= MAX_MATCHMAKING_ATTEMPTS && Date.now() < deadline;
    attempt += 1
  ) {
    const remaining = deadline - Date.now();
    reportProgress(
      onProgress,
      'connecting',
      attempt === 1
        ? 'Opening the Knockout host room. Keep this page open...'
        : `The room did not open yet. Retrying safely (${attempt}/${MAX_MATCHMAKING_ATTEMPTS})...`,
      startedAt
    );

    try {
      const currentClient = resetClient();
      const attemptTimeout = serverConfirmedReady
        ? Math.max(5000, Math.min(MATCHMAKING_ATTEMPT_MS, remaining))
        : Math.max(5000, remaining);

      return await withTimeout(
        currentClient.create('knockout', { name, deviceId: getOrCreateDeviceId() }),
        attemptTimeout,
        'The host connection did not finish within the classroom connection window.'
      );
    } catch (error) {
      lastError = error;
      console.warn(`[knockout] Create attempt ${attempt} failed`, error);

      // A timed-out create may still be completing in the browser. Do not send a
      // second create request that could accidentally create a duplicate room.
      if (error instanceof Error && error.name === 'ConnectionTimeoutError') break;
    }

    if (Date.now() >= deadline || attempt >= MAX_MATCHMAKING_ATTEMPTS) break;
    await delay(Math.min(2500, deadline - Date.now()));
  }

  throw classroomConnectionError('host', lastError);
}

async function lookupRoomId(
  code: string,
  deadline: number,
  startedAt: number,
  onProgress?: ConnectionProgressHandler
): Promise<string> {
  const lookupDeadline = Math.max(Date.now() + 1000, deadline - ROOM_CONNECTION_RESERVE_MS);
  let attempt = 0;
  let lastError: unknown = null;

  while (Date.now() < lookupDeadline) {
    attempt += 1;
    reportProgress(
      onProgress,
      'joining',
      attempt === 1
        ? 'Checking the 5-digit room code with the server...'
        : 'The free server is still waking. Checking the room code again...',
      startedAt
    );

    try {
      const remaining = lookupDeadline - Date.now();
      const response = await fetchWithTimeout(
        `${HTTP_SERVER_URL}/room-by-code/${encodeURIComponent(code)}`,
        Math.max(1200, Math.min(9000, remaining))
      );

      if (response.status === 404) {
        throw new Error('ROOM_CODE_NOT_FOUND');
      }
      if (!response.ok) {
        throw new Error(`Room lookup returned HTTP ${response.status}.`);
      }

      const data = (await response.json()) as { roomId?: string };
      const roomId = String(data.roomId || '').trim();
      if (!roomId) throw new Error('The server did not return a room ID.');
      return roomId;
    } catch (error) {
      if (error instanceof Error && error.message === 'ROOM_CODE_NOT_FOUND') {
        throw new Error('Room code not found. Check the 5-digit code and try again.');
      }
      lastError = error;
      console.warn(`[knockout] Room lookup attempt ${attempt} failed`, error);
    }

    if (Date.now() >= lookupDeadline) break;
    await delay(Math.min(1800, lookupDeadline - Date.now()));
  }

  throw classroomConnectionError('join', lastError);
}

async function joinByIdWithRetries(
  roomId: string,
  name: string,
  deadline: number,
  startedAt: number,
  serverConfirmedReady: boolean,
  onProgress?: ConnectionProgressHandler
): Promise<Room> {
  let attempt = 0;
  let lastError: unknown = null;

  while (Date.now() < deadline && attempt < MAX_MATCHMAKING_ATTEMPTS) {
    attempt += 1;
    const remaining = deadline - Date.now();
    reportProgress(
      onProgress,
      'joining',
      attempt === 1
        ? 'Room found. Opening the secure Knockout connection...'
        : `The room is still connecting. Retrying (${attempt}/${MAX_MATCHMAKING_ATTEMPTS})...`,
      startedAt
    );

    try {
      const currentClient = resetClient();
      return await withTimeout(
        currentClient.joinById(roomId, { name, deviceId: getOrCreateDeviceId() }),
        serverConfirmedReady
          ? Math.max(5000, Math.min(MATCHMAKING_ATTEMPT_MS, remaining))
          : Math.max(5000, remaining),
        'The join connection did not finish within the classroom connection window.'
      );
    } catch (error) {
      lastError = error;
      console.warn(`[knockout] Join attempt ${attempt} failed`, error);
      if (error instanceof Error && error.name === 'ConnectionTimeoutError') break;
    }

    if (Date.now() >= deadline || attempt >= MAX_MATCHMAKING_ATTEMPTS) break;
    await delay(Math.min(2500, deadline - Date.now()));
  }

  throw classroomConnectionError('join', lastError);
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

export async function hostGame(
  name: string,
  onProgress?: ConnectionProgressHandler
): Promise<Room> {
  if (room) safelyLeaveRoom(room);
  const startedAt = Date.now();
  const deadline = startedAt + STARTUP_WINDOW_MS;
  const serverConfirmedReady = await warmServer(deadline, startedAt, onProgress);
  const created = await createWithRetries(
    name,
    deadline,
    startedAt,
    serverConfirmedReady,
    onProgress
  );

  attachRoom(created);
  try {
    await waitForInitialState(created, startedAt, onProgress);
    return created;
  } catch (error) {
    safelyLeaveRoom(created);
    throw error;
  }
}

export async function joinGame(
  name: string,
  roomCode: string,
  onProgress?: ConnectionProgressHandler
): Promise<Room> {
  if (room) safelyLeaveRoom(room);
  const code = roomCode.trim().replace(/\D/g, '').slice(0, 5);
  const startedAt = Date.now();
  const deadline = startedAt + STARTUP_WINDOW_MS;
  const serverConfirmedReady = await warmServer(deadline, startedAt, onProgress);
  const roomId = await lookupRoomId(code, deadline, startedAt, onProgress);
  const joined = await joinByIdWithRetries(
    roomId,
    name,
    deadline,
    startedAt,
    serverConfirmedReady,
    onProgress
  );

  attachRoom(joined);
  try {
    await waitForInitialState(joined, startedAt, onProgress);
    return joined;
  } catch (error) {
    safelyLeaveRoom(joined);
    throw error;
  }
}

export function sendStartGame(): void {
  room?.send('startGame');
}

export function sendToggleBots(enabled: boolean): void {
  room?.send('toggleBots', { enabled });
}

export function sendSetBotMode(mode: BotMode): void {
  room?.send('setBotMode', { mode });
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

export function sendCheer(targetId: string): void {
  room?.send('cheer', { targetId });
}
