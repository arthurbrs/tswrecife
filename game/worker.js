/*
Rotas principais:
- GET  /api/teams      busca todas as equipes e suas etapas atuais no Durable Object.
- GET  /api/session    verifica se o Admin tem uma sessao valida.
- POST /api/login      autentica o Admin com ADMIN_PASSWORD.
- POST /api/logout     encerra a sessao do Admin.
- POST /api/teams      cadastra uma equipe.
- POST /api/stage      move a equipe para uma etapa especifica.
- POST /api/team-name  edita o nome da equipe.
- POST /api/team-delete remove uma equipe.

Tempo real:
- GET /ws abre um WebSocket no Durable Object PLACAR_ROOM.
- Apos cada escrita no storage do Durable Object, ele envia broadcast para as telas conectadas.
*/

const TEAMS_KEY = "placar-game:teams";
const SESSION_COOKIE = "placar_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_STAGE = 5;
const PUBLIC_API_ROUTES = new Set([
  "GET /api/teams",
  "GET /api/session",
  "POST /api/login",
  "POST /api/logout",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

const json = (request, body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

const slug = () =>
  `team_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const normalizeStage = (value) => {
  const stage = Number(value);
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(Math.trunc(stage), MAX_STAGE));
};

const base64UrlEncode = (value) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function md5(input) {
  function add32(a, b) {
    return (a + b) & 0xffffffff;
  }

  function cmn(q, a, b, x, s, t) {
    return add32(((add32(add32(a, q), add32(x, t)) << s) | (add32(add32(a, q), add32(x, t)) >>> (32 - s))), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function md5cycle(state, block) {
    let [a, b, c, d] = state;

    a = ff(a, b, c, d, block[0], 7, -680876936);
    d = ff(d, a, b, c, block[1], 12, -389564586);
    c = ff(c, d, a, b, block[2], 17, 606105819);
    b = ff(b, c, d, a, block[3], 22, -1044525330);
    a = ff(a, b, c, d, block[4], 7, -176418897);
    d = ff(d, a, b, c, block[5], 12, 1200080426);
    c = ff(c, d, a, b, block[6], 17, -1473231341);
    b = ff(b, c, d, a, block[7], 22, -45705983);
    a = ff(a, b, c, d, block[8], 7, 1770035416);
    d = ff(d, a, b, c, block[9], 12, -1958414417);
    c = ff(c, d, a, b, block[10], 17, -42063);
    b = ff(b, c, d, a, block[11], 22, -1990404162);
    a = ff(a, b, c, d, block[12], 7, 1804603682);
    d = ff(d, a, b, c, block[13], 12, -40341101);
    c = ff(c, d, a, b, block[14], 17, -1502002290);
    b = ff(b, c, d, a, block[15], 22, 1236535329);

    a = gg(a, b, c, d, block[1], 5, -165796510);
    d = gg(d, a, b, c, block[6], 9, -1069501632);
    c = gg(c, d, a, b, block[11], 14, 643717713);
    b = gg(b, c, d, a, block[0], 20, -373897302);
    a = gg(a, b, c, d, block[5], 5, -701558691);
    d = gg(d, a, b, c, block[10], 9, 38016083);
    c = gg(c, d, a, b, block[15], 14, -660478335);
    b = gg(b, c, d, a, block[4], 20, -405537848);
    a = gg(a, b, c, d, block[9], 5, 568446438);
    d = gg(d, a, b, c, block[14], 9, -1019803690);
    c = gg(c, d, a, b, block[3], 14, -187363961);
    b = gg(b, c, d, a, block[8], 20, 1163531501);
    a = gg(a, b, c, d, block[13], 5, -1444681467);
    d = gg(d, a, b, c, block[2], 9, -51403784);
    c = gg(c, d, a, b, block[7], 14, 1735328473);
    b = gg(b, c, d, a, block[12], 20, -1926607734);

    a = hh(a, b, c, d, block[5], 4, -378558);
    d = hh(d, a, b, c, block[8], 11, -2022574463);
    c = hh(c, d, a, b, block[11], 16, 1839030562);
    b = hh(b, c, d, a, block[14], 23, -35309556);
    a = hh(a, b, c, d, block[1], 4, -1530992060);
    d = hh(d, a, b, c, block[4], 11, 1272893353);
    c = hh(c, d, a, b, block[7], 16, -155497632);
    b = hh(b, c, d, a, block[10], 23, -1094730640);
    a = hh(a, b, c, d, block[13], 4, 681279174);
    d = hh(d, a, b, c, block[0], 11, -358537222);
    c = hh(c, d, a, b, block[3], 16, -722521979);
    b = hh(b, c, d, a, block[6], 23, 76029189);
    a = hh(a, b, c, d, block[9], 4, -640364487);
    d = hh(d, a, b, c, block[12], 11, -421815835);
    c = hh(c, d, a, b, block[15], 16, 530742520);
    b = hh(b, c, d, a, block[2], 23, -995338651);

    a = ii(a, b, c, d, block[0], 6, -198630844);
    d = ii(d, a, b, c, block[7], 10, 1126891415);
    c = ii(c, d, a, b, block[14], 15, -1416354905);
    b = ii(b, c, d, a, block[5], 21, -57434055);
    a = ii(a, b, c, d, block[12], 6, 1700485571);
    d = ii(d, a, b, c, block[3], 10, -1894986606);
    c = ii(c, d, a, b, block[10], 15, -1051523);
    b = ii(b, c, d, a, block[1], 21, -2054922799);
    a = ii(a, b, c, d, block[8], 6, 1873313359);
    d = ii(d, a, b, c, block[15], 10, -30611744);
    c = ii(c, d, a, b, block[6], 15, -1560198380);
    b = ii(b, c, d, a, block[13], 21, 1309151649);
    a = ii(a, b, c, d, block[4], 6, -145523070);
    d = ii(d, a, b, c, block[11], 10, -1120210379);
    c = ii(c, d, a, b, block[2], 15, 718787259);
    b = ii(b, c, d, a, block[9], 21, -343485551);

    state[0] = add32(a, state[0]);
    state[1] = add32(b, state[1]);
    state[2] = add32(c, state[2]);
    state[3] = add32(d, state[3]);
  }

  function md5blk(bytes) {
    const block = [];
    for (let index = 0; index < 64; index += 4) {
      block[index >> 2] = bytes[index] + (bytes[index + 1] << 8) + (bytes[index + 2] << 16) + (bytes[index + 3] << 24);
    }
    return block;
  }

  const bytes = Array.from(new TextEncoder().encode(input));
  const length = bytes.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let index;

  for (index = 64; index <= length; index += 64) {
    md5cycle(state, md5blk(bytes.slice(index - 64, index)));
  }

  const tail = new Array(64).fill(0);
  bytes.slice(index - 64).forEach((byte, tailIndex) => {
    tail[tailIndex] = byte;
  });
  tail[length % 64] = 128;

  if (length % 64 > 55) {
    md5cycle(state, md5blk(tail));
    tail.fill(0);
  }

  const bitLength = length * 8;
  tail[56] = bitLength & 0xff;
  tail[57] = (bitLength >>> 8) & 0xff;
  tail[58] = (bitLength >>> 16) & 0xff;
  tail[59] = (bitLength >>> 24) & 0xff;
  md5cycle(state, md5blk(tail));

  return state.flatMap((number) => [number & 0xff, (number >>> 8) & 0xff, (number >>> 16) & 0xff, (number >>> 24) & 0xff])
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
}

async function createSessionCookie(env) {
  const payload = base64UrlEncode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  }));
  const signature = await sign(payload, env.SESSION_SECRET);
  return `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;

  const session = getCookie(request, SESSION_COOKIE);
  const [payload, signature] = session.split(".");

  if (!payload || !signature) return false;

  const expectedSignature = await sign(payload, env.SESSION_SECRET);
  if (signature !== expectedSignature) return false;

  try {
    const data = JSON.parse(base64UrlDecode(payload));
    return Number(data.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function isPublicApiRoute(path, method) {
  return PUBLIC_API_ROUTES.has(`${method} ${path}`);
}

function requiresAdminSession(path, method) {
  if (!path.startsWith("/api/")) return false;
  return !isPublicApiRoute(path, method);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }

  if (path === "/api/session" && request.method === "GET") {
    return json(request, { authenticated: await isAuthenticated(request, env) });
  }

  if (path === "/api/login" && request.method === "POST") {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      const missing = [
        !env.ADMIN_PASSWORD ? "ADMIN_PASSWORD" : "",
        !env.SESSION_SECRET ? "SESSION_SECRET" : "",
      ].filter(Boolean);

      return json(request, {
        error: `Secret ausente no Worker: ${missing.join(", ")}.`,
      }, 500);
    }

    const body = await request.json().catch(() => null);
    const password = String(body?.password || "");

    if (password !== env.ADMIN_PASSWORD) {
      return json(request, { error: "Senha invalida." }, 401);
    }

    return json(request, { success: true }, 200, { "Set-Cookie": await createSessionCookie(env) });
  }

  if (path === "/api/logout" && request.method === "POST") {
    return json(request, { success: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  if (requiresAdminSession(path, request.method) && !(await isAuthenticated(request, env))) {
    return json(request, { error: "Nao autorizado." }, 401);
  }

  if (path.startsWith("/api/")) {
    if (!env.PLACAR_ROOM) {
      return json(request, { error: "Binding PLACAR_ROOM nao configurado no Worker." }, 500);
    }

    const roomId = env.PLACAR_ROOM.idFromName("default");
    const room = env.PLACAR_ROOM.get(roomId);
    const response = await room.fetch(request);
    const data = await response.json().catch(() => ({}));
    return json(request, data, response.status);
  }

  return json(request, { error: "Rota nao encontrada." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (!env.PLACAR_ROOM) {
        return json(request, { error: "Binding PLACAR_ROOM nao configurado no Worker." }, 500);
      }

      const roomId = env.PLACAR_ROOM.idFromName("default");
      const room = env.PLACAR_ROOM.get(roomId);
      return room.fetch(request);
    }

    if (url.pathname.startsWith("/api/") || request.method === "OPTIONS") {
      return handleApi(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json(request, { ok: true, message: "Placar Game Worker ativo." });
  },
};

export class PlacarRealtimeRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.sessions = new Set();
  }

  async readTeams() {
    const stored = await this.ctx.storage.get(TEAMS_KEY);
    if (!Array.isArray(stored)) return [];

    return stored.map((team) => ({
      ...team,
      stage: normalizeStage(team.stage ?? team.level ?? 0),
      level: normalizeStage(team.stage ?? team.level ?? 0),
    }));
  }

  async writeTeams(teams) {
    await this.ctx.storage.put(TEAMS_KEY, teams);
  }

  findTeam(teams, teamId) {
    return teams.find((item) => String(item.id) === String(teamId));
  }

  response(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  async handleApi(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (path === "/api/teams" && request.method === "GET") {
      return this.response(await this.readTeams());
    }

    if (path === "/api/teams" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const name = String(body?.name || "").trim();

      if (!name) {
        return this.response({ error: "Informe o nome da equipe." }, 400);
      }

      const teams = await this.readTeams();
      const team = {
        id: body?.id ? String(body.id) : slug(),
        name,
        stage: normalizeStage(body?.stage ?? 0),
        level: normalizeStage(body?.stage ?? 0),
        createdAt: new Date().toISOString(),
      };

      teams.push(team);
      await this.writeTeams(teams);
      this.broadcastUpdate({ action: "team-created", teamId: team.id, stage: team.stage });

      return this.response({ success: true, team, teams }, 201);
    }

    if (path === "/api/stage" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const teamId = String(body?.teamId || body?.id || "").trim();

      if (!teamId) {
        return this.response({ error: "Informe o teamId." }, 400);
      }

      const teams = await this.readTeams();
      const team = this.findTeam(teams, teamId);

      if (!team) {
        return this.response({ error: "Equipe nao encontrada." }, 404);
      }

      team.stage = normalizeStage(body?.stage);
      team.level = team.stage;
      team.updatedAt = new Date().toISOString();
      await this.writeTeams(teams);
      this.broadcastUpdate({ action: "stage-updated", teamId: team.id, stage: team.stage });

      return this.response({ success: true, team, teams });
    }

    if (path === "/api/team-name" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const teamId = String(body?.teamId || body?.id || "").trim();
      const name = String(body?.name || "").trim();

      if (!teamId || !name) {
        return this.response({ error: "Informe teamId e nome." }, 400);
      }

      const teams = await this.readTeams();
      const team = this.findTeam(teams, teamId);

      if (!team) {
        return this.response({ error: "Equipe nao encontrada." }, 404);
      }

      team.name = name;
      team.updatedAt = new Date().toISOString();
      await this.writeTeams(teams);
      this.broadcastUpdate({ action: "team-renamed", teamId: team.id, stage: team.stage });

      return this.response({ success: true, team, teams });
    }

    if (path === "/api/team-delete" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const teamId = String(body?.teamId || body?.id || "").trim();

      if (!teamId) {
        return this.response({ error: "Informe o teamId." }, 400);
      }

      const teams = await this.readTeams();
      const nextTeams = teams.filter((item) => String(item.id) !== teamId);

      if (nextTeams.length === teams.length) {
        return this.response({ error: "Equipe nao encontrada." }, 404);
      }

      await this.writeTeams(nextTeams);
      this.broadcastUpdate({ action: "team-deleted", teamId });

      return this.response({ success: true, teams: nextTeams });
    }

    if ((path === "/api/level-up" || path === "/api/trigger-levelup") && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const teams = await this.readTeams();
      const team = this.findTeam(teams, body?.teamId || body?.id);

      if (!team) {
        return this.response({ error: "Equipe nao encontrada." }, 404);
      }

      team.stage = normalizeStage((team.stage || 0) + 1);
      team.level = team.stage;
      team.updatedAt = new Date().toISOString();
      await this.writeTeams(teams);
      this.broadcastUpdate({ action: "stage-updated", teamId: team.id, stage: team.stage });

      return this.response({ success: true, team, newLevel: team.stage, teams });
    }

    return this.response({ error: "Rota nao encontrada." }, 404);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return this.handleApi(request);
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.sessions.add(server);

    const cleanup = () => {
      this.sessions.delete(server);
    };

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
    server.send(JSON.stringify({ type: "connected" }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);

    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch {
        this.sessions.delete(session);
      }
    }
  }

  broadcastUpdate(data) {
    this.broadcast({
      type: "scoreboard:update",
      ...data,
    });
  }
}
