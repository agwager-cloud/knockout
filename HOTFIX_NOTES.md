# Knockout Hot Fix 16

This hot fix rebuilds the itch.io client package with a more robust browser boot setup.

Fixes / safeguards:

- Uses stable itch.io-friendly client filenames: `assets/index.js` and `assets/style.css`.
- Keeps relative asset paths for itch.io nested iframe hosting.
- Adds a visible boot message while the Phaser bundle loads.
- Adds a visible error message if the browser fails before the StartScene can appear, so future issues are not silent.
- Rebuilt the itch.io upload zip from the latest Hot Fix 15 source.

Important:

- Upload the itch zip, not the source hot fix zip, to itch.io.
- The source hot fix zip is for `C:\Projects\Knockout` only.
