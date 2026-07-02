# Knockout Hot Fix 15

Fixes:

- ResultsScene elimination order now splits into extra columns once there are more than 10 eliminated players, so names no longer fall off the bottom of the panel.
- ResultsScene also filters the champion out of the elimination list as an extra client-side safety check.
- Server champion logic now handles rare all-penguins-pocketed-at-once endings by crowning the last processed penguin and removing them from the elimination list, so the champion cannot also appear as eliminated.
- Updated eliminated-player cheer instruction after Round 5 to say the cheer penguins are above the instruction text.

Build checked with `npm run build`.
