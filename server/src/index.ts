import cors from 'cors';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { KnockoutRoom } from './KnockoutRoom.js';
import { getRoomIdByCode } from './roomCodeRegistry.js';

const port = Number(process.env.PORT || 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(cors());
    app.use(express.json());

    app.get('/', (_req, res) => {
      res.send('Knockout server is running.');
    });

    app.get('/health', (_req, res) => {
      res.json({ ok: true, game: 'Knockout' });
    });

    app.get('/room-by-code/:code', (req, res) => {
      const roomId = getRoomIdByCode(req.params.code);
      if (!roomId) {
        res.status(404).json({ error: 'Room code not found' });
        return;
      }
      res.json({ roomId });
    });
  }
});

gameServer.define('knockout', KnockoutRoom);

void gameServer.listen(port, undefined, undefined, () => {
  console.log(`Knockout server listening on port ${port}`);
});
