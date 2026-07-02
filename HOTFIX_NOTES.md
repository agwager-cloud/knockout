# Knockout Render Hot Fix 12

Adds spectator cheering and a participation award sequence.

## Changes
- Eliminated players now see: "Stick around until the end and cheer for your favourite player."
- After round 5, eliminated human players can tap/click small penguin icons below the table to cheer for remaining players.
- Added a total cheers counter on the GameScene.
- Server tracks cheer counts per player and includes them in the game state.
- ResultsScene now shows each player’s cheer count in a small circle beside their name, with the champion cheer count shown on the champion banner.
- Server chooses a random participation award winner from real human participants only; bots are excluded.
- ResultsScene automatically performs a 3–5 second participation award draw before host controls unlock.
- Play Again and Return to Lobby are disabled during the participation award draw.
- Added a confetti celebration when the participation award winner is announced.

## Build test
- `npm run build` passes for both client and server.
