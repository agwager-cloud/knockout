# Knockout Render / itch.io Hot Fix 09

This fixes the itch.io loading error where the browser console showed 404 errors for:

- /assets/index-*.js
- /assets/index-*.css

## Cause

The Vite production build was using absolute asset paths such as `/assets/index-...js`.
That works locally, but itch.io serves HTML5 games from a nested iframe path, so those absolute URLs point to the wrong place and return 404.

## Fix

`client/vite.config.ts` now includes:

```ts
base: './',
```

This makes the built `index.html` load assets using relative paths:

```html
<script src="./assets/index-...js"></script>
<link href="./assets/index-...css" rel="stylesheet">
```

## What to do

1. Apply this hot fix over `C:\Projects\Knockout`.
2. Run `npm run client:build` if you want to rebuild locally.
3. Upload the separate fixed itch.io client zip to itch.io.

The Render server URL remains:

https://knockout-zvwb.onrender.com
