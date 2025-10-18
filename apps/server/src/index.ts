import { Server, Room } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Op, type ClientInput, type JoinPayload } from "@inner-mainframe/net-protocol";
import { TILE } from "@inner-mainframe/game-logic";

class PingRoom extends Room {
  onCreate() {
    this.onMessage(Op.JOIN, (client, msg: JoinPayload) => {
      console.log("join", msg.name);
      this.send(client, { op: Op.STATE_ACK, tick: 0 });
    });
    this.onMessage(Op.INPUT, (_client, _msg: ClientInput) => {
      // no-op; just proving wiring works
    });
  }
}

const app = express();
app.use(cors());
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, note: `TILE=${TILE}` })
);

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define("tetris", PingRoom);

const PORT = Number(process.env.PORT ?? 2567);
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`WS on ws://0.0.0.0:${PORT}  |  HTTP on http://0.0.0.0:${PORT}/api/health`);
});
