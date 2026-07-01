// Autenticación mínima (usuario + contraseña) para el prototipo standalone.
// Pensada para ser reemplazada por el sistema de cuentas de "El Oráculo" más
// adelante: lo único que otros módulos necesitan de acá es `getUserFromSession`,
// que devuelve { id, username }.

const PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function hashPassword(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derived));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleSignup(request, env) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password || password.length < 4) {
    return jsonResponse(
      { error: "Usuario y contraseña (mínimo 4 caracteres) son requeridos." },
      400
    );
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  )
    .bind(username)
    .first();
  if (existing) {
    return jsonResponse({ error: "Ese usuario ya existe." }, 409);
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToHex(saltBytes);
  const passwordHash = await hashPassword(password, saltBytes);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, username, passwordHash, salt, Date.now())
    .run();

  return createSession(env, id, username);
}

export async function handleLogin(request, env) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) {
    return jsonResponse({ error: "Usuario y contraseña son requeridos." }, 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt FROM users WHERE username = ?"
  )
    .bind(username)
    .first();
  if (!user) {
    return jsonResponse({ error: "Usuario o contraseña incorrectos." }, 401);
  }

  const computedHash = await hashPassword(password, hexToBytes(user.password_salt));
  if (computedHash !== user.password_hash) {
    return jsonResponse({ error: "Usuario o contraseña incorrectos." }, 401);
  }

  return createSession(env, user.id, user.username);
}

async function createSession(env, userId, username) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)"
  )
    .bind(token, userId, Date.now())
    .run();

  return jsonResponse({ token, user: { id: userId, username } });
}

export async function getUserFromSession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const urlToken = new URL(request.url).searchParams.get("token");
  const finalToken = token || urlToken;
  if (!finalToken) return null;

  const row = await env.DB.prepare(
    `SELECT u.id as id, u.username as username
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  )
    .bind(finalToken)
    .first();

  return row || null;
}

export { jsonResponse };
