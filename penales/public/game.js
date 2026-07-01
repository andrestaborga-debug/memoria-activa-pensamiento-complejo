const token = localStorage.getItem("penales_token");
const username = localStorage.getItem("penales_username");
const code = new URLSearchParams(window.location.search).get("code");

if (!token || !username || !code) {
  window.location.href = "index.html";
}

document.getElementById("codigo-partida").textContent = code;

const el = {
  estado: document.getElementById("estado-partida"),
  error: document.getElementById("error-juego"),
  arco: document.getElementById("arco"),
  pelota: document.getElementById("pelota"),
  resultado: document.getElementById("resultado-tanda"),
  btnConfirmar: document.getElementById("btn-confirmar"),
  btnVolver: document.getElementById("btn-volver"),
  finalBanner: document.getElementById("final-banner"),
  nombre1: document.getElementById("nombre-1"),
  nombre2: document.getElementById("nombre-2"),
  marcador1: document.getElementById("marcador-1"),
  marcador2: document.getElementById("marcador-2"),
  puntos1: document.getElementById("puntos-1"),
  puntos2: document.getElementById("puntos-2"),
};

const zonas = Array.from(document.querySelectorAll(".zona"));

let seleccionKicker = null;
let seleccionKeeper = [];
let ultimoHistorialLength = 0;
let ultimaRondaInicializada = -1;
let estadoActual = null;

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${code}?token=${encodeURIComponent(token)}`);

ws.addEventListener("open", () => {
  el.estado.textContent = "Conectado. Esperando al rival…";
});

ws.addEventListener("close", () => {
  el.estado.textContent = "Se perdió la conexión con la partida.";
});

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "error") {
    el.error.textContent = msg.message;
    return;
  }
  if (msg.type === "state") {
    el.error.textContent = "";
    render(msg);
  }
});

function pintarPuntos(contenedor, historial, slot) {
  contenedor.innerHTML = "";
  const propios = historial.filter((h) => h.kickerSlot === slot);
  for (let i = 0; i < 5; i++) {
    const span = document.createElement("span");
    span.className = "punto";
    if (propios[i]) span.classList.add(propios[i].result === "gol" ? "gol" : "atajada");
    contenedor.appendChild(span);
  }
}

function limpiarSeleccionVisual() {
  zonas.forEach((z) => z.classList.remove("elegida-propia", "tapada", "gol-en-zona"));
}

function render(state) {
  estadoActual = state;
  window.__estado = state; // hook de solo lectura para pruebas automatizadas

  el.nombre1.textContent = state.players[1] ? state.players[1].username : "Esperando…";
  el.nombre2.textContent = state.players[2] ? state.players[2].username : "Esperando…";
  pintarPuntos(el.puntos1, state.history, 1);
  pintarPuntos(el.puntos2, state.history, 2);

  el.marcador1.classList.toggle("rol-pateando", state.currentKicker === 1 && state.status === "in_progress");
  el.marcador1.classList.toggle("rol-atajando", state.currentKicker === 2 && state.status === "in_progress");
  el.marcador2.classList.toggle("rol-pateando", state.currentKicker === 2 && state.status === "in_progress");
  el.marcador2.classList.toggle("rol-atajando", state.currentKicker === 1 && state.status === "in_progress");

  if (state.history.length > ultimoHistorialLength) {
    const ultima = state.history[state.history.length - 1];
    animarTanda(ultima);
  }
  ultimoHistorialLength = state.history.length;

  if (state.status === "waiting") {
    el.estado.textContent = "Esperando al rival para arrancar…";
    el.arco.classList.remove("jugable");
    el.btnConfirmar.style.display = "none";
    return;
  }

  if (state.status === "finished") {
    el.estado.textContent = "";
    el.arco.classList.remove("jugable");
    el.btnConfirmar.style.display = "none";
    el.btnVolver.style.display = "block";
    const ganador = state.players[state.winner]?.username || `Jugador ${state.winner}`;
    const motivos = {
      regular: "definición a 5 penales",
      corte_anticipado: "definición anticipada",
      muerte_subita: "muerte súbita",
    };
    el.finalBanner.style.display = "block";
    el.finalBanner.innerHTML = `🏆 ¡Ganó ${ganador}! <span class="motivo">${motivos[state.endReason] || ""}</span>`;
    return;
  }

  // in_progress
  const soyPateador = state.you === state.currentKicker;
  const suenaMuerteSubita = state.kickNumber > 10;
  const prefijoRonda = suenaMuerteSubita ? "Muerte súbita" : `Tanda ${state.kickNumber}`;

  if (state.youMoved) {
    el.estado.textContent = soyPateador
      ? `${prefijoRonda}: ya elegiste dónde patear. Esperando al arquero…`
      : `${prefijoRonda}: ya elegiste dónde tapar. Esperando al pateador…`;
    el.arco.classList.remove("jugable");
    el.btnConfirmar.style.display = "none";
  } else {
    el.estado.textContent = soyPateador
      ? `${prefijoRonda}: elegí una zona para patear.`
      : `${prefijoRonda}: elegí 2 zonas para tapar.`;
    el.arco.classList.add("jugable");
    // Solo reseteamos la selección al empezar una tanda nueva. Si esto se
    // ejecutara en cada mensaje 'state' (por ejemplo cuando el rival confirma
    // su jugada) se borraría lo que este jugador ya venía eligiendo sin
    // haber confirmado todavía.
    if (state.kickNumber !== ultimaRondaInicializada) {
      limpiarSeleccionVisual();
      seleccionKicker = null;
      seleccionKeeper = [];
      ultimaRondaInicializada = state.kickNumber;
    }
    actualizarBotonConfirmar();
    el.btnConfirmar.style.display = "block";
  }

  if (state.opponentMoved && !state.youMoved) {
    el.estado.textContent += " (tu rival ya jugó)";
  }
}

function actualizarBotonConfirmar() {
  const soyPateador = estadoActual.you === estadoActual.currentKicker;
  const listo = soyPateador ? seleccionKicker !== null : seleccionKeeper.length === 2;
  el.btnConfirmar.disabled = !listo;
}

zonas.forEach((zonaEl) => {
  zonaEl.addEventListener("click", () => {
    if (!estadoActual || estadoActual.status !== "in_progress" || estadoActual.youMoved) return;
    const zona = Number(zonaEl.dataset.zona);
    const soyPateador = estadoActual.you === estadoActual.currentKicker;

    if (soyPateador) {
      seleccionKicker = zona;
      zonas.forEach((z) => z.classList.remove("elegida-propia"));
      zonaEl.classList.add("elegida-propia");
    } else {
      if (seleccionKeeper.includes(zona)) {
        seleccionKeeper = seleccionKeeper.filter((z) => z !== zona);
        zonaEl.classList.remove("tapada");
      } else if (seleccionKeeper.length < 2) {
        seleccionKeeper.push(zona);
        zonaEl.classList.add("tapada");
      }
    }
    actualizarBotonConfirmar();
  });
});

el.btnConfirmar.addEventListener("click", () => {
  if (!estadoActual) return;
  const soyPateador = estadoActual.you === estadoActual.currentKicker;
  if (soyPateador) {
    ws.send(JSON.stringify({ type: "move", zone: seleccionKicker }));
  } else {
    ws.send(JSON.stringify({ type: "move", zones: seleccionKeeper }));
  }
  el.btnConfirmar.disabled = true;
});

el.btnVolver.addEventListener("click", () => {
  window.location.href = "index.html";
});

function animarTanda(tanda) {
  const zonaDestino = zonas.find((z) => Number(z.dataset.zona) === tanda.zone);
  if (zonaDestino) {
    const rectArco = el.arco.getBoundingClientRect();
    const rectZona = zonaDestino.getBoundingClientRect();
    el.pelota.style.display = "block";
    el.pelota.style.left = "48%";
    el.pelota.style.bottom = "8px";
    requestAnimationFrame(() => {
      const destinoLeft = rectZona.left - rectArco.left + rectZona.width / 2 - 14;
      el.pelota.style.left = `${destinoLeft}px`;
      el.pelota.style.bottom = tanda.result === "gol" ? "70%" : "40%";
    });
  }

  zonas.forEach((z) => {
    const num = Number(z.dataset.zona);
    z.classList.toggle("tapada", tanda.blocked.includes(num));
    z.classList.toggle("gol-en-zona", num === tanda.zone && tanda.result === "gol");
  });

  el.resultado.textContent = tanda.result === "gol" ? "¡GOL! ⚽" : "¡ATAJADA! 🧤";
  el.resultado.className = `resultado-tanda ${tanda.result === "gol" ? "gol" : "atajada"}`;

  setTimeout(() => {
    el.resultado.textContent = "";
    el.resultado.className = "resultado-tanda";
    el.pelota.style.display = "none";
  }, 1800);
}
