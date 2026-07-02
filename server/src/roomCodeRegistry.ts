const roomCodes = new Map<string, string>();

export function registerRoomCode(roomCode: string, roomId: string): void {
  roomCodes.set(roomCode, roomId);
}

export function unregisterRoomCode(roomCode: string): void {
  roomCodes.delete(roomCode);
}

export function getRoomIdByCode(roomCode: string): string | undefined {
  return roomCodes.get(roomCode.trim());
}
