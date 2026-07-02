# Knockout Local Hot Fix 08 — Render URL

This hot fix updates the client connection fallback so the itch.io build connects to:

https://knockout-zvwb.onrender.com

Changed files:

- `client/src/net/Net.ts`

After applying this hot fix locally, run:

```bash
npm run build
```

Then commit and push the updated code to GitHub if desired.

For itch.io, run:

```bash
npm run client:build
```

Then upload the contents of `client/dist` as the HTML5 game.
