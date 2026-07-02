# Knockout hot fix 14

## Changes

- Moved the eliminated-player cheer overlay lower so it sits more neatly between the pool table and the bottom instruction text.
- Added a clear label above the cheer icons: `Tap a penguin to cheer!`
- Updated the eliminated-player instruction after round 5 to: `Click or tap a penguin below to cheer for your favourite player!`
- Keeps the original eliminated-player message before cheering unlocks.

## Testing

- `npm run build` passes for the client and server.
- The updated itch.io client build keeps the existing Render server URL and itch-safe asset/audio paths.
