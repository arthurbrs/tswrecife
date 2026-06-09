/*
Como criar o namespace KV no painel da Cloudflare:
1. Acesse Cloudflare Dashboard > Workers & Pages > KV.
2. Clique em "Create namespace" e crie um namespace, por exemplo: PLACAR_GAME.
3. Abra o arquivo wrangler.json deste projeto e, em kv_namespaces, use:
   { "binding": "PLACAR_KV", "id": "ID_DO_NAMESPACE" }
4. O binding precisa se chamar PLACAR_KV, pois este Worker usa env.PLACAR_KV.

Rotas principais:
- GET  /api/teams      busca todas as equipes e suas etapas atuais no KV.
- GET  /api/session    verifica se o Admin tem uma sessao valida.
- POST /api/login      autentica o Admin com ADMIN_PASSWORD.
- POST /api/logout     encerra a sessao do Admin.
- POST /api/teams      cadastra uma equipe.
- POST /api/stage      move a equipe para uma etapa especifica.
- POST /api/team-name  edita o nome da equipe.
- POST /api/team-delete remove uma equipe.
*/

const TEAMS_KEY = "placar-game:teams";
const SESSION_COOKIE = "placar_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_STAGE = 5;

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

function isProtectedWrite(path, method) {
  if (method !== "POST") return false;
  return !["/api/login"].includes(path);
}

async function readTeams(env) {
  const stored = await env.PLACAR_KV.get(TEAMS_KEY, "json");
  if (!Array.isArray(stored)) return [];

  return stored.map((team) => ({
    ...team,
    stage: normalizeStage(team.stage ?? team.level ?? 0),
    level: normalizeStage(team.stage ?? team.level ?? 0),
  }));
}

async function writeTeams(env, teams) {
  await env.PLACAR_KV.put(TEAMS_KEY, JSON.stringify(teams));
}

function findTeam(teams, teamId) {
  return teams.find((item) => String(item.id) === String(teamId));
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
      return json(request, { error: "ADMIN_PASSWORD ou SESSION_SECRET nao configurado." }, 500);
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

  if (isProtectedWrite(path, request.method) && !(await isAuthenticated(request, env))) {
    return json(request, { error: "Nao autorizado." }, 401);
  }

  if (path === "/api/teams" && request.method === "GET") {
    return json(request, await readTeams(env));
  }

  if (path === "/api/teams" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const name = String(body?.name || "").trim();

    if (!name) {
      return json(request, { error: "Informe o nome da equipe." }, 400);
    }

    const teams = await readTeams(env);
    const team = {
      id: body?.id ? String(body.id) : slug(),
      name,
      stage: normalizeStage(body?.stage ?? 0),
      level: normalizeStage(body?.stage ?? 0),
      createdAt: new Date().toISOString(),
    };

    teams.push(team);
    await writeTeams(env, teams);

    return json(request, { success: true, team, teams }, 201);
  }

  if (path === "/api/stage" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teamId = String(body?.teamId || body?.id || "").trim();

    if (!teamId) {
      return json(request, { error: "Informe o teamId." }, 400);
    }

    const teams = await readTeams(env);
    const team = findTeam(teams, teamId);

    if (!team) {
      return json(request, { error: "Equipe nao encontrada." }, 404);
    }

    team.stage = normalizeStage(body?.stage);
    team.level = team.stage;
    team.updatedAt = new Date().toISOString();
    await writeTeams(env, teams);

    return json(request, { success: true, team, teams });
  }

  if (path === "/api/team-name" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teamId = String(body?.teamId || body?.id || "").trim();
    const name = String(body?.name || "").trim();

    if (!teamId || !name) {
      return json(request, { error: "Informe teamId e nome." }, 400);
    }

    const teams = await readTeams(env);
    const team = findTeam(teams, teamId);

    if (!team) {
      return json(request, { error: "Equipe nao encontrada." }, 404);
    }

    team.name = name;
    team.updatedAt = new Date().toISOString();
    await writeTeams(env, teams);

    return json(request, { success: true, team, teams });
  }

  if (path === "/api/team-delete" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teamId = String(body?.teamId || body?.id || "").trim();

    if (!teamId) {
      return json(request, { error: "Informe o teamId." }, 400);
    }

    const teams = await readTeams(env);
    const nextTeams = teams.filter((item) => String(item.id) !== teamId);

    if (nextTeams.length === teams.length) {
      return json(request, { error: "Equipe nao encontrada." }, 404);
    }

    await writeTeams(env, nextTeams);

    return json(request, { success: true, teams: nextTeams });
  }

  if ((path === "/api/level-up" || path === "/api/trigger-levelup") && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teams = await readTeams(env);
    const team = findTeam(teams, body?.teamId || body?.id);

    if (!team) {
      return json(request, { error: "Equipe nao encontrada." }, 404);
    }

    team.stage = normalizeStage((team.stage || 0) + 1);
    team.level = team.stage;
    team.updatedAt = new Date().toISOString();
    await writeTeams(env, teams);

    return json(request, { success: true, team, newLevel: team.stage, teams });
  }

  return json(request, { error: "Rota nao encontrada." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.PLACAR_KV) {
      return json(request, { error: "Binding PLACAR_KV nao configurado no Worker." }, 500);
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
