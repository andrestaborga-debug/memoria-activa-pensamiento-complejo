// Durable Object: una instancia por partida (id = código de sala).
// Mantiene el estado del duelo de penales y arbitra las jugadas ocultas
// entre los dos jugadores conectados por WebSocket.
//
// Nota para el prototipo: el estado vive en memoria de la Durable Object
// (no se persiste en `state.storage`). Cloudflare puede desalojar una DO
// inactiva, lo que perdería la partida en curso. Para el prototipo esto es
// aceptable (una definición de penales dura minutos); si se integra a
// El Oráculo conviene agregar `state.storage.put/get` para sobrevivir
// reinicios.

const KICKS_PER_PLAYER = 5;
const ZONES = 5;

function createInitialGame() {
  return {
    status: "waiting", // waiting -> in_progress -> finished
    players: { 1: null, 2: null },
    currentKicker: null, // 1 | 2
    kickNumber: 0,
    kicksTaken: { 1: 0, 2: 0 },
    scores: { 1: 0, 2: 0 },
    history: [],
    pending: {}, // { kickerMove: zone|null, keeperMove: [z,z]|null }
    winner: null,
    endReason: null, // 'regular' | 'corte_anticipado' | 'muerte_subita'
  };
}

export class MatchRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    this.game = createInitialGame();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const username = url.searchParams.get("username");
    if (!userId || !username) {
      return new Response("Falta usuario", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.handleSession(server, userId, username);

    return new Response(null, { status: 101, webSocket: client });
  }

  assignSlot(userId, username) {
    const g = this.game;
    if (g.players[1] && g.players[1].userId === userId) return 1;
    if (g.players[2] && g.players[2].userId === userId) return 2;
    if (!g.players[1]) {
      g.players[1] = { userId, username };
      this.maybeStart();
      return 1;
    }
    if (!g.players[2]) {
      g.players[2] = { userId, username };
      this.maybeStart();
      return 2;
    }
    return null;
  }

  maybeStart() {
    const g = this.game;
    if (g.players[1] && g.players[2] && g.status === "waiting") {
      g.status = "in_progress";
      g.currentKicker = Math.random() < 0.5 ? 1 : 2;
      g.kickNumber = 1;
    }
  }

  handleSession(ws, userId, username) {
    const slot = this.assignSlot(userId, username);
    if (slot === null) {
      ws.send(JSON.stringify({ type: "error", message: "La partida ya tiene dos jugadores." }));
      ws.close(1008, "full");
      return;
    }

    const session = { ws, userId, username, slot };
    this.sessions.push(session);

    ws.addEventListener("message", (event) => {
      try {
        this.handleMessage(session, event.data);
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: "Error interno." }));
      }
    });
    ws.addEventListener("close", () => {
      this.sessions = this.sessions.filter((s) => s !== session);
    });

    this.broadcastState();
  }

  handleMessage(session, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== "move") return;

    const g = this.game;
    if (g.status !== "in_progress") return;

    const isKicker = session.slot === g.currentKicker;

    if (isKicker) {
      if (g.pending.kickerMove != null) return; // ya jugó
      const zone = Number(msg.zone);
      if (!Number.isInteger(zone) || zone < 1 || zone > ZONES) {
        session.ws.send(JSON.stringify({ type: "error", message: "Zona inválida." }));
        return;
      }
      g.pending.kickerMove = zone;
    } else {
      if (g.pending.keeperMove != null) return; // ya jugó
      const zones = Array.isArray(msg.zones) ? [...new Set(msg.zones.map(Number))] : [];
      const valid = zones.length === 2 && zones.every((z) => Number.isInteger(z) && z >= 1 && z <= ZONES);
      if (!valid) {
        session.ws.send(JSON.stringify({ type: "error", message: "Elegí 2 zonas distintas (1 a 5)." }));
        return;
      }
      g.pending.keeperMove = zones;
    }

    if (g.pending.kickerMove != null && g.pending.keeperMove != null) {
      this.resolveKick();
    } else {
      this.broadcastState();
    }
  }

  resolveKick() {
    const g = this.game;
    const kickerSlot = g.currentKicker;
    const keeperSlot = kickerSlot === 1 ? 2 : 1;
    const zone = g.pending.kickerMove;
    const blocked = g.pending.keeperMove;
    const isGoal = !blocked.includes(zone);

    g.kicksTaken[kickerSlot] += 1;
    if (isGoal) g.scores[kickerSlot] += 1;

    g.history.push({
      kickNumber: g.kickNumber,
      kickerSlot,
      zone,
      blocked,
      result: isGoal ? "gol" : "atajada",
    });

    g.pending = {};

    const decision = this.checkWinner();
    if (decision) {
      g.status = "finished";
      g.winner = decision.winner;
      g.endReason = decision.reason;
    } else {
      g.currentKicker = keeperSlot; // se cambian posiciones
      g.kickNumber += 1;
    }

    this.broadcastState();
  }

  checkWinner() {
    const g = this.game;
    const { scores, kicksTaken } = g;

    // Corte anticipado (regla FIFA): si el resultado ya está matemáticamente
    // decidido antes de completar los 5 penales por jugador.
    if (kicksTaken[1] <= KICKS_PER_PLAYER && kicksTaken[2] <= KICKS_PER_PLAYER) {
      const remaining1 = KICKS_PER_PLAYER - kicksTaken[1];
      const remaining2 = KICKS_PER_PLAYER - kicksTaken[2];
      if (scores[1] > scores[2] + remaining2) return { winner: 1, reason: "corte_anticipado" };
      if (scores[2] > scores[1] + remaining1) return { winner: 2, reason: "corte_anticipado" };
    }

    // Solo se define un ganador por marcador cuando ambos patearon la misma
    // cantidad de veces: al cierre de los 5 penales, o al cierre de cada
    // ronda de muerte súbita.
    if (kicksTaken[1] === kicksTaken[2] && kicksTaken[1] >= KICKS_PER_PLAYER) {
      if (scores[1] !== scores[2]) {
        return {
          winner: scores[1] > scores[2] ? 1 : 2,
          reason: kicksTaken[1] === KICKS_PER_PLAYER ? "regular" : "muerte_subita",
        };
      }
    }

    return null;
  }

  publicState(forSlot) {
    const g = this.game;
    const youAreKicker = forSlot === g.currentKicker;
    return {
      type: "state",
      status: g.status,
      players: {
        1: g.players[1] ? { username: g.players[1].username } : null,
        2: g.players[2] ? { username: g.players[2].username } : null,
      },
      you: forSlot,
      currentKicker: g.currentKicker,
      kickNumber: g.kickNumber,
      scores: g.scores,
      kicksTaken: g.kicksTaken,
      history: g.history,
      winner: g.winner,
      endReason: g.endReason,
      youMoved: youAreKicker ? g.pending.kickerMove != null : g.pending.keeperMove != null,
      opponentMoved: youAreKicker ? g.pending.keeperMove != null : g.pending.kickerMove != null,
    };
  }

  broadcastState() {
    for (const s of this.sessions) {
      s.ws.send(JSON.stringify(this.publicState(s.slot)));
    }
  }
}
