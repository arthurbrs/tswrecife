/*
Como criar o namespace KV no painel da Cloudflare:
1. Acesse Cloudflare Dashboard > Workers & Pages > KV.
2. Clique em "Create namespace" e crie um namespace, por exemplo: PLACAR_GAME.
3. Abra o arquivo wrangler.json deste projeto e, em kv_namespaces, use:
   { "binding": "PLACAR_KV", "id": "ID_DO_NAMESPACE" }
4. O binding precisa se chamar PLACAR_KV, pois este Worker usa env.PLACAR_KV.

Rotas principais:
- GET  /api/teams      busca todas as equipes e suas etapas atuais no KV.
- POST /api/teams      cadastra uma equipe.
- POST /api/stage      move a equipe para uma etapa especifica.
- POST /api/team-name  edita o nome da equipe.
- POST /api/team-delete remove uma equipe.
*/

const TEAMS_KEY = "placar-game:teams";
const MAX_STAGE = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const slug = () =>
  `team_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const normalizeStage = (value) => {
  const stage = Number(value);
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(Math.trunc(stage), MAX_STAGE));
};

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
    return new Response(null, { headers: corsHeaders });
  }

  if (path === "/api/teams" && request.method === "GET") {
    return json(await readTeams(env));
  }

  if (path === "/api/teams" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const name = String(body?.name || "").trim();

    if (!name) {
      return json({ error: "Informe o nome da equipe." }, 400);
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

    return json({ success: true, team, teams }, 201);
  }

  if (path === "/api/stage" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teamId = String(body?.teamId || body?.id || "").trim();

    if (!teamId) {
      return json({ error: "Informe o teamId." }, 400);
    }

    const teams = await readTeams(env);
    const team = findTeam(teams, teamId);

    if (!team) {
      return json({ error: "Equipe nao encontrada." }, 404);
    }

    team.stage = normalizeStage(body?.stage);
    team.level = team.stage;
    team.updatedAt = new Date().toISOString();
    await writeTeams(env, teams);

    return json({ success: true, team, teams });
  }

  if (path === "/api/team-name" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teamId = String(body?.teamId || body?.id || "").trim();
    const name = String(body?.name || "").trim();

    if (!teamId || !name) {
      return json({ error: "Informe teamId e nome." }, 400);
    }

    const teams = await readTeams(env);
    const team = findTeam(teams, teamId);

    if (!team) {
      return json({ error: "Equipe nao encontrada." }, 404);
    }

    team.name = name;
    team.updatedAt = new Date().toISOString();
    await writeTeams(env, teams);

    return json({ success: true, team, teams });
  }

  if (path === "/api/team-delete" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teamId = String(body?.teamId || body?.id || "").trim();

    if (!teamId) {
      return json({ error: "Informe o teamId." }, 400);
    }

    const teams = await readTeams(env);
    const nextTeams = teams.filter((item) => String(item.id) !== teamId);

    if (nextTeams.length === teams.length) {
      return json({ error: "Equipe nao encontrada." }, 404);
    }

    await writeTeams(env, nextTeams);

    return json({ success: true, teams: nextTeams });
  }

  if ((path === "/api/level-up" || path === "/api/trigger-levelup") && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const teams = await readTeams(env);
    const team = findTeam(teams, body?.teamId || body?.id);

    if (!team) {
      return json({ error: "Equipe nao encontrada." }, 404);
    }

    team.stage = normalizeStage((team.stage || 0) + 1);
    team.level = team.stage;
    team.updatedAt = new Date().toISOString();
    await writeTeams(env, teams);

    return json({ success: true, team, newLevel: team.stage, teams });
  }

  return json({ error: "Rota nao encontrada." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.PLACAR_KV) {
      return json({ error: "Binding PLACAR_KV nao configurado no Worker." }, 500);
    }

    if (url.pathname.startsWith("/api/") || request.method === "OPTIONS") {
      return handleApi(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: true, message: "Placar Game Worker ativo." });
  },
};
