import { handleSignup, handleLogin, getUserFromSession, jsonResponse } from "./auth.js";

export { MatchRoom } from "./match.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos

function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/signup" && request.method === "POST") {
      return handleSignup(request, env);
    }
    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    if (url.pathname === "/api/matches" && request.method === "POST") {
      const user = await getUserFromSession(request, env);
      if (!user) return jsonResponse({ error: "No autenticado." }, 401);

      const code = generateCode();
      await env.DB.prepare(
        "INSERT INTO matches (code, player1_id, status, created_at) VALUES (?, ?, 'waiting', ?)"
      )
        .bind(code, user.id, Date.now())
        .run();

      return jsonResponse({ code });
    }

    const wsMatch = url.pathname.match(/^\/ws\/([A-Z0-9]{6})$/);
    if (wsMatch) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }
      const user = await getUserFromSession(request, env);
      if (!user) return new Response("No autenticado.", { status: 401 });

      const code = wsMatch[1];
      const id = env.MATCH_ROOM.idFromName(code);
      const stub = env.MATCH_ROOM.get(id);

      const forwardUrl = new URL(request.url);
      forwardUrl.searchParams.set("userId", user.id);
      forwardUrl.searchParams.set("username", user.username);
      const forwardRequest = new Request(forwardUrl.toString(), request);
      return stub.fetch(forwardRequest);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
