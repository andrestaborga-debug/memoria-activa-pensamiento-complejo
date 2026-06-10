// functions/api/vault.js
// ---------------------------------------------------------------------------
// Zero-knowledge vault sync endpoint for Cloudflare Pages Functions.
//
// The server only ever stores AES-GCM CIPHERTEXT, keyed by the identity that
// Cloudflare Access authenticated. The master password and the derived
// encryption key never reach this code — it cannot read anyone's passwords.
//
// Auth: every request must carry a valid Cloudflare Access JWT (header
//   `Cf-Access-Jwt-Assertion` or the `CF_Authorization` cookie). We verify the
//   signature against the team's JWKS and check `aud`/`iss`/`exp`.
//
// Required environment bindings (set in the Pages project):
//   DB                  -> D1 database binding
//   ACCESS_TEAM_DOMAIN  -> e.g. https://yourteam.cloudflareaccess.com
//   ACCESS_AUD          -> the Access application's Audience (AUD) tag
// ---------------------------------------------------------------------------

const MAX_BLOB_BYTES = 2 * 1024 * 1024; // 2 MB ceiling per vault
let jwksCache = { keys: null, exp: 0 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getJWKS(teamDomain) {
  const now = Date.now();
  if (jwksCache.keys && jwksCache.exp > now) return jwksCache.keys;
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("jwks fetch failed");
  const data = await res.json();
  jwksCache = { keys: data.keys || [], exp: now + 60 * 60 * 1000 };
  return jwksCache.keys;
}

async function verifyAccessJWT(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const teamDomain = (env.ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");

  // ---- claim checks ----
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("expired");
  if (payload.nbf && payload.nbf > now + 60) throw new Error("not yet valid");
  if (payload.iss && payload.iss.replace(/\/+$/, "") !== teamDomain)
    throw new Error("bad issuer");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!env.ACCESS_AUD || !auds.includes(env.ACCESS_AUD))
    throw new Error("bad audience");

  // ---- signature check (RS256) ----
  const keys = await getJWKS(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("no matching signing key");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) throw new Error("bad signature");
  return payload;
}

async function identify(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Response("server not configured for Access", { status: 503 });
  }
  const cookie = request.headers.get("Cookie") || "";
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    (cookie.match(/CF_Authorization=([^;]+)/) || [])[1];
  if (!token) throw new Response("unauthenticated", { status: 401 });
  let payload;
  try {
    payload = await verifyAccessJWT(token, env);
  } catch {
    throw new Response("invalid token", { status: 401 });
  }
  const id = payload.email || payload.sub;
  if (!id) throw new Response("no identity", { status: 401 });
  return id;
}

async function ensureSchema(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS vaults (" +
      "user_id TEXT PRIMARY KEY, blob TEXT NOT NULL, " +
      "version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)"
  ).run();
}

// GET /api/vault  -> { exists, version, blob? }
export async function onRequestGet({ request, env }) {
  let uid;
  try { uid = await identify(request, env); } catch (r) { return r; }
  await ensureSchema(env);
  const row = await env.DB
    .prepare("SELECT blob, version FROM vaults WHERE user_id = ?")
    .bind(uid)
    .first();
  if (!row) return json({ exists: false, version: 0 });
  return json({ exists: true, version: row.version, blob: JSON.parse(row.blob) });
}

// PUT /api/vault  body: { blob, baseVersion }
//   200 -> { version }            (stored)
//   409 -> { conflict, version, blob }  (someone else wrote first; client merges)
export async function onRequestPut({ request, env }) {
  let uid;
  try { uid = await identify(request, env); } catch (r) { return r; }
  await ensureSchema(env);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const blob = body.blob;
  if (
    !blob ||
    typeof blob.salt !== "string" ||
    typeof blob.iv !== "string" ||
    typeof blob.data !== "string"
  ) {
    return json({ error: "bad blob" }, 400);
  }
  const blobStr = JSON.stringify(blob);
  if (blobStr.length > MAX_BLOB_BYTES) return json({ error: "too large" }, 413);

  const baseVersion = Number(body.baseVersion) || 0;
  const row = await env.DB
    .prepare("SELECT blob, version FROM vaults WHERE user_id = ?")
    .bind(uid)
    .first();
  const current = row ? row.version : 0;

  // Optimistic concurrency: refuse if the client is not building on the
  // current server version, and hand back the current state so it can merge.
  if (baseVersion !== current) {
    return json(
      { conflict: true, version: current, blob: row ? JSON.parse(row.blob) : null },
      409
    );
  }

  const next = current + 1;
  await env.DB
    .prepare(
      "INSERT INTO vaults (user_id, blob, version, updated_at) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT(user_id) DO UPDATE SET blob = ?2, version = ?3, updated_at = ?4"
    )
    .bind(uid, blobStr, next, Date.now())
    .run();
  return json({ version: next });
}

// DELETE /api/vault -> wipe this user's stored vault
export async function onRequestDelete({ request, env }) {
  let uid;
  try { uid = await identify(request, env); } catch (r) { return r; }
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM vaults WHERE user_id = ?").bind(uid).run();
  return json({ deleted: true });
}
