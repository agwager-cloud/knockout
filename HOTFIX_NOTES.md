# Knockout Local Hot Fix 07

Apply this zip over your existing Knockout project folder.

Changes:
- GameScene round heading now only shows `ROUND #` instead of `ROUND # — AIM` / `ROUND # — CHAOS`.
- Power meter moved away from the top-right UI and now appears centered below the table while aiming.
- Aim line and power meter now hide after mouse release / finger release.
- Bottom game instruction changed to: `Aim your penguin in the direction you want to go.`
- Lobby bots are now host-controlled with a `BOTS: ON/OFF` toggle near the bottom-right.
- Bots are OFF by default; no bots join unless the host turns them on.
- Added a host-only `MANAGE PLAYERS` button at bottom-left with kick controls for inappropriate names.
- Added device ID checks so one device cannot join the same room multiple times at the same time.
- Players who join during an active game now spectate only and join properly from the next game.

Tested:
- `npm run build` passed for both client and server.
- Local server smoke test confirmed: host creates room with no bots, bot toggle adds 8 bots, game starts, late joiner becomes spectator, duplicate same-device join is rejected.
