const app_key = "COLE_SUA_PUSHER_APP_KEY_AQUI";
const cluster = "COLE_SEU_PUSHER_CLUSTER_AQUI";
const WORKER_URL = "";
const POLL_INTERVAL_MS = 1500;

const state = {
  teams: new Map(),
  pollingId: null,
};

const apiUrl = (path) => `${WORKER_URL}${path}`;

const sanitizeText = (value) => {
  const node = document.createElement("span");
  node.textContent = value || "";
  return node.innerHTML;
};

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Falha na requisicao.");
  }

  return data;
}

async function fetchTeams() {
  const data = await requestJson("/api/teams");
  return Array.isArray(data) ? data : data.teams || [];
}

function normalizeTeam(team) {
  return {
    id: String(team.id),
    name: String(team.name || "Equipe sem nome"),
    logoUrl: String(team.logoUrl || team.logo || ""),
    level: Number(team.level || 0),
  };
}

function createParticles() {
  const container = document.getElementById("particles-container");
  if (!container) return;

  const colors = ["#00e5ff", "#ff2d7a", "#4dff88", "#ffd166"];

  for (let index = 0; index < 46; index += 1) {
    const particle = document.createElement("span");
    const size = Math.random() * 5 + 2;

    particle.className = "particle";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.setProperty("--size", `${size}px`);
    particle.style.setProperty("--drift", `${Math.random() * 120 - 60}px`);
    particle.style.setProperty("--duration", `${Math.random() * 12 + 10}s`);
    particle.style.setProperty("--delay", `${Math.random() * 10}s`);
    particle.style.setProperty("--color", colors[index % colors.length]);
    container.appendChild(particle);
  }
}

function fireLevelConfetti() {
  if (typeof confetti !== "function") return;

  confetti({
    particleCount: 140,
    spread: 88,
    startVelocity: 42,
    origin: { y: 0.62 },
    colors: ["#00e5ff", "#ff2d7a", "#4dff88", "#ffd166", "#ffffff"],
  });
}

function boostCard(teamId) {
  const card = document.querySelector(`[data-team-id="${CSS.escape(teamId)}"]`);
  if (!card) return;

  card.classList.add("is-boosted");
  window.setTimeout(() => card.classList.remove("is-boosted"), 900);
}

function teamCardTemplate(team) {
  const safeName = sanitizeText(team.name);
  const safeLogo = sanitizeText(team.logoUrl);

  return `
    <article class="team-card" data-team-id="${team.id}">
      <div class="logo-frame">
        <img src="${safeLogo}" alt="Logo ${safeName}" loading="lazy">
      </div>
      <h2 class="team-name">${safeName}</h2>
      <div class="team-level">
        <span>Level</span>
        <strong data-level-for="${team.id}">${team.level}</strong>
      </div>
    </article>
  `;
}

function renderDisplay(teams) {
  const grid = document.getElementById("teams-grid");
  const empty = document.getElementById("empty-display");
  if (!grid) return;

  grid.innerHTML = teams.map(teamCardTemplate).join("");
  empty?.classList.toggle("is-visible", teams.length === 0);
}

function updateDisplayLevel(team) {
  const current = state.teams.get(team.id);
  const levelNode = document.querySelector(`[data-level-for="${CSS.escape(team.id)}"]`);

  if (!levelNode) {
    return false;
  }

  if (current && team.level > current.level) {
    levelNode.textContent = String(team.level);
    fireLevelConfetti();
    boostCard(team.id);
  } else {
    levelNode.textContent = String(team.level);
  }

  return true;
}

async function syncDisplay() {
  const teams = (await fetchTeams()).map(normalizeTeam);
  let needsRender = teams.length !== state.teams.size;

  for (const team of teams) {
    if (!state.teams.has(team.id)) {
      needsRender = true;
      break;
    }
  }

  if (needsRender) {
    renderDisplay(teams);
  }

  for (const team of teams) {
    updateDisplayLevel(team);
    state.teams.set(team.id, team);
  }
}

function initializePusher() {
  const hasConfig = app_key && cluster && !app_key.includes("COLE_") && !cluster.includes("COLE_");

  if (!hasConfig || typeof Pusher !== "function") {
    return;
  }

  const pusher = new Pusher(app_key, { cluster });
  const channel = pusher.subscribe("placar-game");

  channel.bind("update-level", (payload) => {
    const teamId = String(payload.teamId || payload.id || "");
    const newLevel = Number(payload.newLevel || payload.level || 0);
    if (!teamId || !newLevel) return;

    const previous = state.teams.get(teamId);
    const next = { ...(previous || { id: teamId, name: "Equipe", logoUrl: "" }), level: newLevel };
    updateDisplayLevel(next);
    state.teams.set(teamId, next);
  });
}

async function bootDisplay() {
  createParticles();

  try {
    await syncDisplay();
    state.pollingId = window.setInterval(syncDisplay, POLL_INTERVAL_MS);
    initializePusher();
  } catch (error) {
    console.error(error);
  }
}

function adminItemTemplate(team) {
  const safeName = sanitizeText(team.name);
  const safeLogo = sanitizeText(team.logoUrl);

  return `
    <li class="admin-item">
      <div class="admin-logo">
        <img src="${safeLogo}" alt="Logo ${safeName}" loading="lazy">
      </div>
      <div>
        <p class="admin-team-name">${safeName}</p>
        <p class="admin-team-level">Level <strong data-admin-level-for="${team.id}">${team.level}</strong></p>
      </div>
      <button class="level-button" type="button" data-level-up="${team.id}">UP LEVEL</button>
    </li>
  `;
}

async function renderAdmin() {
  const list = document.getElementById("admin-teams-list");
  if (!list) return;

  const teams = (await fetchTeams()).map(normalizeTeam);
  list.innerHTML = teams.length
    ? teams.map(adminItemTemplate).join("")
    : '<li class="admin-message">Nenhuma equipe cadastrada.</li>';
}

function setAdminMessage(message, isError = false) {
  const node = document.getElementById("admin-message");
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "var(--pink)" : "var(--green)";
}

async function addTeam(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button");
  const name = document.getElementById("team-name").value.trim();
  const logoUrl = document.getElementById("team-logo").value.trim();

  if (!name || !logoUrl) return;

  button.disabled = true;
  setAdminMessage("Salvando equipe...");

  try {
    await requestJson("/api/teams", {
      method: "POST",
      body: JSON.stringify({ name, logoUrl }),
    });

    form.reset();
    setAdminMessage("Equipe cadastrada.");
    await renderAdmin();
  } catch (error) {
    setAdminMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function levelUp(teamId, button) {
  button.disabled = true;

  try {
    const data = await requestJson("/api/level-up", {
      method: "POST",
      body: JSON.stringify({ teamId }),
    });

    const levelNode = document.querySelector(`[data-admin-level-for="${CSS.escape(teamId)}"]`);
    if (levelNode) {
      levelNode.textContent = String(data.team?.level || data.newLevel || Number(levelNode.textContent) + 1);
    }

    setAdminMessage("Level atualizado.");
  } catch (error) {
    setAdminMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function bootAdmin() {
  const form = document.getElementById("team-form");
  const refresh = document.getElementById("refresh-admin");
  const list = document.getElementById("admin-teams-list");

  form?.addEventListener("submit", addTeam);
  refresh?.addEventListener("click", renderAdmin);
  list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-level-up]");
    if (!button) return;
    levelUp(button.dataset.levelUp, button);
  });

  try {
    await renderAdmin();
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

if (document.body.id === "display-page") {
  bootDisplay();
}

if (document.body.id === "admin-page") {
  bootAdmin();
}
