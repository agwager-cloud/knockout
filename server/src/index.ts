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
    app.disable('x-powered-by');
    app.use(cors());
    app.use(express.json());

    const sendStatus = (_req: express.Request, res: express.Response): void => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({
        ok: true,
        game: 'Knockout',
        status: 'ready',
        serverTime: Date.now()
      });
    };

    // Classroom clients use neutral GET endpoints to wake a sleeping Render
    // service. /health remains available for Render monitoring and older builds.
    app.get('/', sendStatus);
    app.get('/api/status', sendStatus);
    app.get('/health', sendStatus);

    app.get('/room-by-code/:code', (req, res) => {
      const roomId = getRoomIdByCode(req.params.code);
      if (!roomId) {
        res.status(404).json({ ok: false, error: 'Room code not found' });
        return;
      }
      res.json({ ok: true, roomId });
    });
  }
});

gameServer.define('knockout', KnockoutRoom);

void gameServer.listen(port, undefined, undefined, () => {
  console.log(`Knockout server listening on port ${port}`);
});
