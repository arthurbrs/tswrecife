const app_key = "COLE_SUA_PUSHER_APP_KEY_AQUI";
const cluster = "COLE_SEU_PUSHER_CLUSTER_AQUI";
const WORKER_URL = "";
const POLL_INTERVAL_MS = 1500;

const STAGES = [
  "Ideia",
  "Problema",
  "Validação do Problema",
  "Solução",
  "Validação da Solução",
  "Pitch",
];

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

const stageLabel = (stageIndex) => {
  const stage = Number(stageIndex);
  const safeStage = Number.isFinite(stage) ? stage : 0;
  return STAGES[Math.max(0, Math.min(Math.trunc(safeStage), STAGES.length - 1))];
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
  const stage = Number.isFinite(Number(team.stage)) ? Number(team.stage) : Number(team.level || 0);

  return {
    id: String(team.id),
    name: String(team.name || "Equipe sem nome"),
    stage: Math.max(0, Math.min(Math.trunc(stage), STAGES.length - 1)),
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

function progressTemplate(team) {
  return STAGES.map((label, index) => {
    const status = index < team.stage ? "is-done" : index === team.stage ? "is-current" : "";
    return `<li class="${status}"><span>${index + 1}</span>${sanitizeText(label)}</li>`;
  }).join("");
}

function teamCardTemplate(team) {
  const safeName = sanitizeText(team.name);

  return `
    <article class="team-card" data-team-id="${team.id}">
      <p class="stage-count">Etapa ${team.stage + 1} de ${STAGES.length}</p>
      <h2 class="team-name">${safeName}</h2>
      <div class="team-level">
        <span>Agora</span>
        <strong data-stage-for="${team.id}">${sanitizeText(stageLabel(team.stage))}</strong>
      </div>
      <ol class="stage-track" data-track-for="${team.id}">
        ${progressTemplate(team)}
      </ol>
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

function updateDisplayStage(team) {
  const current = state.teams.get(team.id);
  const stageNode = document.querySelector(`[data-stage-for="${CSS.escape(team.id)}"]`);
  const trackNode = document.querySelector(`[data-track-for="${CSS.escape(team.id)}"]`);

  if (!stageNode || !trackNode) {
    return false;
  }

  if (current && team.stage > current.stage) {
    fireLevelConfetti();
    boostCard(team.id);
  }

  stageNode.textContent = stageLabel(team.stage);
  trackNode.innerHTML = progressTemplate(team);
  return true;
}

async function syncDisplay() {
  const teams = (await fetchTeams()).map(normalizeTeam);
  let needsRender = teams.length !== state.teams.size;

  for (const team of teams) {
    const current = state.teams.get(team.id);
    if (!current || current.name !== team.name) {
      needsRender = true;
      break;
    }
  }

  if (needsRender) {
    renderDisplay(teams);
  }

  for (const team of teams) {
    updateDisplayStage(team);
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
    const stage = Number(payload.stage ?? payload.newLevel ?? payload.level ?? 0);
    if (!teamId) return;

    const previous = state.teams.get(teamId);
    const next = { ...(previous || { id: teamId, name: "Equipe" }), stage };
    updateDisplayStage(next);
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

function stageOptions(selectedStage) {
  return STAGES.map((label, index) => {
    const selected = Number(selectedStage) === index ? "selected" : "";
    return `<option value="${index}" ${selected}>${index + 1}. ${sanitizeText(label)}</option>`;
  }).join("");
}

function adminItemTemplate(team) {
  const safeName = sanitizeText(team.name);

  return `
    <li class="admin-item">
      <div>
        <p class="admin-team-name">${safeName}</p>
        <p class="admin-team-level">Etapa atual: <strong data-admin-stage-for="${team.id}">${sanitizeText(stageLabel(team.stage))}</strong></p>
      </div>
      <label class="stage-select-label">
        <span>Mover para</span>
        <select data-stage-select="${team.id}">
          ${stageOptions(team.stage)}
        </select>
      </label>
      <button class="ghost-button" type="button" data-edit-name="${team.id}">Editar nome</button>
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

  if (!name) return;

  button.disabled = true;
  setAdminMessage("Salvando equipe...");

  try {
    await requestJson("/api/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
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

async function updateStage(teamId, stage, select) {
  select.disabled = true;

  try {
    const data = await requestJson("/api/stage", {
      method: "POST",
      body: JSON.stringify({ teamId, stage: Number(stage) }),
    });

    const stageNode = document.querySelector(`[data-admin-stage-for="${CSS.escape(teamId)}"]`);
    if (stageNode) {
      stageNode.textContent = stageLabel(data.team?.stage ?? stage);
    }

    setAdminMessage("Etapa atualizada.");
  } catch (error) {
    setAdminMessage(error.message, true);
    await renderAdmin();
  } finally {
    select.disabled = false;
  }
}

async function editTeamName(teamId) {
  const teams = (await fetchTeams()).map(normalizeTeam);
  const team = teams.find((item) => item.id === teamId);
  const newName = window.prompt("Novo nome da equipe:", team?.name || "");

  if (!newName || !newName.trim()) return;

  try {
    await requestJson("/api/team-name", {
      method: "POST",
      body: JSON.stringify({ teamId, name: newName.trim() }),
    });

    setAdminMessage("Nome atualizado.");
    await renderAdmin();
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

async function bootAdmin() {
  const form = document.getElementById("team-form");
  const refresh = document.getElementById("refresh-admin");
  const list = document.getElementById("admin-teams-list");

  form?.addEventListener("submit", addTeam);
  refresh?.addEventListener("click", renderAdmin);
  list?.addEventListener("change", (event) => {
    const select = event.target.closest("[data-stage-select]");
    if (!select) return;
    updateStage(select.dataset.stageSelect, select.value, select);
  });
  list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-name]");
    if (!button) return;
    editTeamName(button.dataset.editName);
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
