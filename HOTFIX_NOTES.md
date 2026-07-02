Knockout hot fix 17

Issue fixed:
- Participation Award could select a player who had already left/disconnected before the game ended.

Change made:
- The server now only includes players who are still connected at the end of the match in the Participation Award draw.
- Bots are still excluded.
- Spectators are still excluded.

Apply this over your project folder, then commit and push so Render redeploys.
