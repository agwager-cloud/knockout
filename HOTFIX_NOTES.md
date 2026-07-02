# Knockout Hot Fix 13 — Participation Award Overlay Timing

## Changes

- ResultsScene participation award now always performs a suspense draw for roughly 4 seconds before revealing the winner.
- Single-human-player games now still show an animated draw sequence instead of instantly revealing the award winner.
- After the winner is revealed, the award pop-up and confetti stay visible for 3 seconds.
- The award overlay then hides automatically so the elimination order and cheer stats underneath are visible.
- Host controls remain locked while the draw is running and while the winner pop-up is visible.
- PLAY AGAIN and RETURN TO LOBBY unlock after the pop-up closes.

## Files changed

- client/src/scenes/ResultsScene.ts

## Testing

- `npm run build` passes for both client and server.
