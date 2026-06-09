const app_key = "715f24c522c36b942eee";
const cluster = "sa1";
const WORKER_URL = "";

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
  fireworksInstance: null,
  fireworksTimer: null,
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
    credentials: "include",
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

  // Nova paleta de cores para as partículas de fundo
  const colors = ["#F36F21", "#00B2A9", "#FFC72C", "#E21836"];

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

function fireConfettiBurst(origin, particleCount = 80) {
  if (typeof confetti !== "function") return;

  confetti({
    particleCount,
    angle: origin.x < 0.5 ? 60 : 120,
    spread: 72,
    startVelocity: 48,
    decay: 0.91,
    scalar: 1.08,
    origin,
    // Nova paleta de cores para os confetes de level up
    colors: ["#F36F21", "#00B2A9", "#FFC72C", "#E21836", "#ffffff"],
  });
}

function fireLevelFireworks() {
  if (typeof confetti !== "function") return;

  const duration = 5600;
  const end = Date.now() + duration;

  fireConfettiBurst({ x: 0.12, y: 0.72 }, 110);
  fireConfettiBurst({ x: 0.88, y: 0.72 }, 110);

  const timer = window.setInterval(() => {
    const remaining = end - Date.now();

    if (remaining <= 0) {
      window.clearInterval(timer);
      return;
    }

    fireConfettiBurst({ x: Math.random() * 0.24 + 0.04, y: Math.random() * 0.34 + 0.28 }, 52);
    fireConfettiBurst({ x: Math.random() * 0.24 + 0.72, y: Math.random() * 0.34 + 0.28 }, 52);
  }, 360);
}

async function stopHeavyFireworks() {
  if (state.fireworksTimer) {
    window.clearTimeout(state.fireworksTimer);
    state.fireworksTimer = null;
  }

  if (state.fireworksInstance) {
    state.fireworksInstance.destroy();
    state.fireworksInstance = null;
  }
}

async function startHeavyFireworks() {
  const container = document.getElementById("fireworks-container");
  const Fireworks = window.Fireworks?.default || window.Fireworks;

  if (!container || typeof Fireworks !== "function") return;

  await stopHeavyFireworks();
  container.classList.add("is-active");

  state.fireworksInstance = new Fireworks(container, {
    autoresize: true,
    opacity: 0.55,
    acceleration: 1.04,
    friction: 0.97,
    gravity: 1.35,
    particles: 95,
    traceLength: 4,
    traceSpeed: 8,
    explosion: 7,
    intensity: 36,
    flickering: 50,
    hue: {
      min: 18,
      max: 205,
    },
    delay: {
      min: 18,
      max: 34,
    },
    rocketsPoint: {
      min: 18,
      max: 82,
    },
    lineWidth: {
      explosion: {
        min: 1,
        max: 3,
      },
      trace: {
        min: 1,
        max: 2,
      },
    },
    brightness: {
      min: 64,
      max: 92,
    },
    decay: {
      min: 0.015,
      max: 0.03,
    },
    mouse: {
      click: false,
      move: false,
      max: 0,
    },
    boundaries: {
      x: 50,
      y: 50,
      width: container.clientWidth,
      height: container.clientHeight,
    },
    sound: {
      enabled: false,
    },
  });

  state.fireworksInstance.start();

  window.setTimeout(() => {
    if (state.fireworksInstance) {
      state.fireworksInstance.waitStop();
    }
  }, 4200);

  state.fireworksTimer = window.setTimeout(async () => {
    container.classList.remove("is-active");
    await stopHeavyFireworks();
  }, 5600);
}

function boostCard(teamId) {
  const card = document.querySelector(`[data-team-id="${CSS.escape(teamId)}"]`);
  if (!card) return;

  card.classList.add("is-boosted");
  window.setTimeout(() => card.classList.remove("is-boosted"), 2400);
}

function showLevelCelebration(team) {
  const overlay = document.getElementById("level-celebration");
  const teamName = document.getElementById("celebration-team-name");
  const stageName = document.getElementById("celebration-stage-name");

  if (!overlay || !teamName || !stageName) return;

  teamName.textContent = team.name;
  stageName.textContent = stageLabel(team.stage);
  overlay.classList.remove("is-active");
  void overlay.offsetWidth;
  overlay.classList.add("is-active");
  overlay.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    overlay.classList.remove("is-active");
    overlay.setAttribute("aria-hidden", "true");
  }, 5600);
}

function celebrateLevelUp(team) {
  showLevelCelebration(team);
  startHeavyFireworks();
  fireLevelFireworks();
  boostCard(team.id);
}

function teamTokenTemplate(team) {
  return `<article class="team-token" data-team-id="${team.id}">${sanitizeText(team.name)}</article>`;
}

function stageColumnTemplate(label, index, teams) {
  const stageTeams = teams.filter((team) => team.stage === index);

  return `
    <article class="stage-column">
      <header class="stage-header">
        <span>${index + 1}</span>
        <h2>${sanitizeText(label)}</h2>
      </header>
      <div class="stage-lane">
        ${stageTeams.length ? stageTeams.map(teamTokenTemplate).join("") : '<p class="stage-empty">Aguardando equipe</p>'}
      </div>
    </article>
  `;
}

function renderDisplay(teams) {
  const grid = document.getElementById("teams-grid");
  const empty = document.getElementById("empty-display");
  if (!grid) return;

  grid.innerHTML = STAGES.map((label, index) => stageColumnTemplate(label, index, teams)).join("");
  empty?.classList.toggle("is-visible", teams.length === 0);
}

async function syncDisplay() {
  const teams = (await fetchTeams()).map(normalizeTeam);
  let needsRender = teams.length !== state.teams.size;
  const boostedTeams = [];

  for (const team of teams) {
    const current = state.teams.get(team.id);
    if (!current || current.name !== team.name || current.stage !== team.stage) {
      needsRender = true;
    }

    if (current && team.stage > current.stage) {
      boostedTeams.push(team);
    }
  }

  if (needsRender) {
    renderDisplay(teams);
  }

  for (const team of teams) {
    state.teams.set(team.id, team);
  }

  for (const knownTeamId of Array.from(state.teams.keys())) {
    if (!teams.some((team) => team.id === knownTeamId)) {
      state.teams.delete(knownTeamId);
    }
  }

  if (boostedTeams.length) {
    boostedTeams.forEach((team, index) => {
      window.setTimeout(() => celebrateLevelUp(team), index * 900);
    });
  }
}

function initializePusher() {
  const hasConfig = app_key && cluster && !app_key.includes("COLE_") && !cluster.includes("COLE_");

  if (!hasConfig || typeof Pusher !== "function") {
    return;
  }

  const pusher = new Pusher(app_key, { cluster });
  const channel = pusher.subscribe("placar-game");

  pusher.connection.bind("connected", syncDisplay);

  channel.bind("update-level", (payload) => {
    const teamId = String(payload.teamId || payload.id || "");
    if (!teamId) return;

    syncDisplay();
  });
}

async function bootDisplay() {
  createParticles();

  try {
    await syncDisplay();
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
      <button class="danger-button" type="button" data-remove-team="${team.id}">Remover</button>
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

function setAuthMessage(message, isError = false) {
  const node = document.getElementById("auth-message");
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "var(--pink)" : "var(--green)";
}

function showAdminContent(isAuthenticated) {
  document.getElementById("login-form")?.classList.toggle("is-hidden", isAuthenticated);
  document.getElementById("admin-content")?.classList.toggle("is-hidden", !isAuthenticated);
}

async function checkAdminSession() {
  const data = await requestJson("/api/session");
  showAdminContent(Boolean(data.authenticated));
  return Boolean(data.authenticated);
}

async function loginAdmin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button");
  const password = document.getElementById("admin-password").value;

  button.disabled = true;
  setAuthMessage("Validando acesso...");

  try {
    await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    form.reset();
    setAuthMessage("");
    showAdminContent(true);
    await renderAdmin();
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function logoutAdmin() {
  try {
    await requestJson("/api/logout", { method: "POST", body: JSON.stringify({}) });
  } finally {
    showAdminContent(false);
    setAuthMessage("Sessão encerrada.");
  }
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

async function removeTeam(teamId) {
  const teams = (await fetchTeams()).map(normalizeTeam);
  const team = teams.find((item) => item.id === teamId);
  const confirmed = window.confirm(`Remover a equipe "${team?.name || "selecionada"}"?`);

  if (!confirmed) return;

  try {
    await requestJson("/api/team-delete", {
      method: "POST",
      body: JSON.stringify({ teamId }),
    });

    setAdminMessage("Equipe removida.");
    await renderAdmin();
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

async function bootAdmin() {
  const loginForm = document.getElementById("login-form");
  const form = document.getElementById("team-form");
  const refresh = document.getElementById("refresh-admin");
  const logout = document.getElementById("logout-admin");
  const list = document.getElementById("admin-teams-list");

  loginForm?.addEventListener("submit", loginAdmin);
  form?.addEventListener("submit", addTeam);
  refresh?.addEventListener("click", renderAdmin);
  logout?.addEventListener("click", logoutAdmin);
  list?.addEventListener("change", (event) => {
    const select = event.target.closest("[data-stage-select]");
    if (!select) return;
    updateStage(select.dataset.stageSelect, select.value, select);
  });
  list?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-name]");
    const removeButton = event.target.closest("[data-remove-team]");

    if (editButton) {
      editTeamName(editButton.dataset.editName);
    }

    if (removeButton) {
      removeTeam(removeButton.dataset.removeTeam);
    }
  });

  try {
    const isAuthenticated = await checkAdminSession();
    if (isAuthenticated) {
      await renderAdmin();
    }
  } catch (error) {
    showAdminContent(false);
    setAuthMessage(error.message, true);
  }
}

if (document.body.id === "display-page") {
  bootDisplay();
}

if (document.body.id === "admin-page") {
  bootAdmin();
}
