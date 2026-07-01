const tarjetaAuth = document.getElementById("tarjeta-auth");
const tarjetaLobby = document.getElementById("tarjeta-lobby");
const errorAuth = document.getElementById("error-auth");
const errorLobby = document.getElementById("error-lobby");
const nombreUsuario = document.getElementById("nombre-usuario");
const bloqueCodigo = document.getElementById("bloque-codigo");
const codigoCreado = document.getElementById("codigo-creado");

function getSession() {
  const token = localStorage.getItem("penales_token");
  const username = localStorage.getItem("penales_username");
  return token && username ? { token, username } : null;
}

function setSession(token, username) {
  localStorage.setItem("penales_token", token);
  localStorage.setItem("penales_username", username);
}

function clearSession() {
  localStorage.removeItem("penales_token");
  localStorage.removeItem("penales_username");
}

function mostrarLobby() {
  const session = getSession();
  if (!session) return;
  tarjetaAuth.style.display = "none";
  tarjetaLobby.style.display = "block";
  nombreUsuario.textContent = session.username;
}

async function llamarAuth(path) {
  errorAuth.textContent = "";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) {
    errorAuth.textContent = "Completá usuario y contraseña.";
    return;
  }
  try {
    const res = await fetch(`/api/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorAuth.textContent = data.error || "Error inesperado.";
      return;
    }
    setSession(data.token, data.user.username);
    mostrarLobby();
  } catch (err) {
    errorAuth.textContent = "No se pudo conectar con el servidor.";
  }
}

document.getElementById("btn-login").addEventListener("click", () => llamarAuth("login"));
document.getElementById("btn-signup").addEventListener("click", () => llamarAuth("signup"));

document.getElementById("btn-logout").addEventListener("click", () => {
  clearSession();
  tarjetaLobby.style.display = "none";
  tarjetaAuth.style.display = "block";
});

document.getElementById("btn-crear").addEventListener("click", async () => {
  errorLobby.textContent = "";
  const session = getSession();
  try {
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      errorLobby.textContent = data.error || "No se pudo crear la partida.";
      return;
    }
    codigoCreado.textContent = data.code;
    bloqueCodigo.style.display = "block";
    document.getElementById("btn-ir-a-partida").onclick = () => {
      window.location.href = `juego.html?code=${data.code}`;
    };
  } catch (err) {
    errorLobby.textContent = "No se pudo conectar con el servidor.";
  }
});

document.getElementById("btn-unirse").addEventListener("click", () => {
  const code = document.getElementById("input-codigo").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    errorLobby.textContent = "El código tiene 6 caracteres (letras y números).";
    return;
  }
  window.location.href = `juego.html?code=${code}`;
});

if (getSession()) mostrarLobby();
