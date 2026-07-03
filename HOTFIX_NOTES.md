Knockout hot fix 18

Fixes and improvements:
- Fixed reconnection duplicates: if a player disconnects and rejoins from the same device, the stale disconnected copy is removed from the server state and elimination order.
- Participation Award now only uses connected, non-bot, non-spectator human players.
- ResultsScene has extra safety filtering so stale disconnected duplicate names do not appear in the award spin or elimination list.
- Added host bot modes in the lobby:
  - BOTS: OFF
  - 8 BOTS
  - FILL 40
- Fill mode fills empty spots with bots up to 40 total players for load testing.
- If the room is full but bots are present, a bot is removed automatically so a real human player can join.
- If the room is full with no bots, the join is rejected as capacity reached.

Apply over C:\Projects\Knockout, then commit and push so Render redeploys.
