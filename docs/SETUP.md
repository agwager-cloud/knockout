# Knockout setup

## 1. Install dependencies

Open PowerShell or Terminal in the project folder:

```bash
npm install
```

## 2. Run locally on your computer

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

The local server runs on:

```text
http://localhost:2567
```

## 3. Test locally with two players

1. Start local server/client with `npm run dev`.
2. Open two browser tabs at `http://localhost:5173`.
3. In tab 1, enter a name and press **Host Game**.
4. In tab 2, enter another name and the room code, then press **Join Game**.
5. Host presses **Start Game** in the lobby.
6. During each 10 second aiming phase, drag away from your penguin to set direction and power.
7. When the timer ends, all penguins shoot at once.

## 4. Test locally on an iPad or phone

Keep the computer and device on the same Wi‑Fi network.

On Windows, find your computer's local IP address:

```bash
ipconfig
```

Look for the IPv4 address, for example:

```text
192.168.1.25
```

Then open this on the iPad or phone browser:

```text
http://YOUR-COMPUTER-IP:5173
```

Example:

```text
http://192.168.1.25:5173
```

The Start screen should show the server as:

```text
http://YOUR-COMPUTER-IP:2567
```

That means the device is connecting to your local server correctly.

## 5. Build the itch.io client later

Do not worry about this until the local version is working.

When ready:

```bash
npm run client:build
```

Upload the contents of:

```text
client/dist
```

to itch.io as an HTML5 game.

Before building for itch.io, either update the Render server URL in:

```text
client/src/net/Net.ts
```

or create:

```text
client/.env.production
```

with:

```text
VITE_SERVER_URL=https://YOUR-RENDER-URL.onrender.com
```

## 6. Render server setup later

Create a new Render Web Service connected to your GitHub repo.

Recommended Render settings:

```text
Root Directory: .
Build Command: npm install
Start Command: npm run server:start
Environment: Node
```

Add this environment variable if Render asks for it:

```text
NODE_VERSION=22
```

The health check URL will be:

```text
https://YOUR-RENDER-URL.onrender.com/health
```
