# Knockout Hotfix 19 — School Network Connection Recovery

## Problems investigated

- The start scene required `GET /health` to succeed before opening Colyseus.
- Some school browser extensions block `/health` requests with `ERR_BLOCKED_BY_CLIENT` in a normal window while InPrivate/Incognito still works.
- The previous free-server wake allowance was 75 seconds and the real room creation/join did not have a complete 100-second classroom connection window.
- The start panel grew downward when status/error text appeared.

## Changes

- Added neutral `GET /api/status` and JSON `GET /` endpoints.
- Kept `/health` for Render monitoring and older clients.
- Removed `/health` as a mandatory classroom-client dependency.
- Added a full 100-second startup window with spaced wake checks and controlled Colyseus retries.
- Host create retries are capped and a timed-out create is not repeated, preventing duplicate rooms.
- Room-code lookup and secure join receive most of the same 100-second allowance.
- The first Knockout state may take up to 20 seconds after socket connection.
- The production client always falls back to `https://knockout-zvwb.onrender.com`, never the itch.io page hostname.
- Added a teacher-friendly connection card with elapsed time, progress, and 60–100 second guidance.
- Start panel is anchored from its top edge and uses a compact replacement connection card on phone, iPad and laptop screens.

## Deployment order

1. Push the complete project update so Render deploys `/api/status`.
2. Wait for Render to finish.
3. Upload the itch.io ZIP whose `index.html` is at the ZIP root.
