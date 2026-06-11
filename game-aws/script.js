const WEBSOCKET_URL = "wss://3ohjyw8411.execute-api.us-east-2.amazonaws.com/prod";
const ADMIN_PASSWORD_STORAGE_KEY = "placar-game-aws-admin-password";

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
  socket: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  pendingRequests: new Map(),
  lastTeams: [],
  fireworksInstance: null,
  fireworksTimer: null,
};

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

function normalizeTeam(team) {
  const stage = Number.isFinite(Number(team.stage)) ? Number(team.stage) : Number(team.level || 0);

  return {
    id: String(team.id || team.teamId),
    name: String(team.name || "Equipe sem nome"),
    stage: Math.max(0, Math.min(Math.trunc(stage), STAGES.length - 1)),
  };
}

function adminPassword() {
  return sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || "";
}

function isAwsUrlConfigured() {
  return WEBSOCKET_URL && WEBSOCKET_URL.startsWith("wss://") && !WEBSOCKET_URL.includes("URL_AQUI");
}

function nextRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function connectWebSocket({ onOpen } = {}) {
  if (!isAwsUrlConfigured()) {
    const message = "Configure WEBSOCKET_URL em script.js com a URL wss:// do API Gateway.";
    setAdminMessage(message, true);
    setAuthMessage(message, true);
    console.warn(message);
    return null;
  }

  if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) {
    if (onOpen && state.socket.readyState === WebSocket.OPEN) onOpen(state.socket);
    if (onOpen && state.socket.readyState === WebSocket.CONNECTING) {
      state.socket.addEventListener("open", () => onOpen(state.socket), { once: true });
    }
    return state.socket;
  }

  state.socket = new WebSocket(WEBSOCKET_URL);

  state.socket.addEventListener("open", () => {
    state.reconnectAttempts = 0;
    onOpen?.(state.socket);
    requestTeams().catch((error) => console.error(error));
  });

  state.socket.addEventListener("message", (event) => {
    let payload = {};

    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      console.error("Mensagem WebSocket inválida.", error);
      return;
    }

    handleSocketMessage(payload);
  });

  state.socket.addEventListener("close", () => {
    for (const [requestId, pending] of state.pendingRequests.entries()) {
      pending.reject(new Error("Conexão WebSocket encerrada."));
      state.pendingRequests.delete(requestId);
    }

    scheduleReconnect();
  });

  state.socket.addEventListener("error", () => {
    setAdminMessage("Falha na conexão WebSocket.", true);
    setAuthMessage("Falha na conexão WebSocket.", true);
  });

  return state.socket;
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;

  const delay = Math.min(12000, 1000 * 2 ** state.reconnectAttempts);
  state.reconnectAttempts += 1;

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

function sendSocket(action, payload = {}, { authenticated = false, waitForAck = true } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connectWebSocket({
      onOpen: () => {
        sendSocket(action, payload, { authenticated, waitForAck }).then(resolve).catch(reject);
      },
    });

    if (!socket) {
      reject(new Error("WebSocket não configurado."));
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) return;

    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error("WebSocket indisponível."));
      return;
    }

    const requestId = nextRequestId();
    const message = {
      action,
      requestId,
      ...payload,
    };

    if (authenticated) {
      message.adminPassword = adminPassword();
    }

    if (waitForAck) {
      const timer = window.setTimeout(() => {
        state.pendingRequests.delete(requestId);
        reject(new Error("Tempo limite aguardando resposta do WebSocket."));
      }, 9000);

      state.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    }

    socket.send(JSON.stringify(message));

    if (!waitForAck) {
      resolve({});
    }
  });
}

function resolvePending(payload) {
  if (!payload.requestId || !state.pendingRequests.has(payload.requestId)) return false;

  const pending = state.pendingRequests.get(payload.requestId);
  window.clearTimeout(pending.timer);
  state.pendingRequests.delete(payload.requestId);

  if (payload.ok === false) {
    pending.reject(new Error(payload.error || "Falha na operação."));
  } else {
    pending.resolve(payload);
  }

  return true;
}

function handleSocketMessage(payload) {
  if (resolvePending(payload)) return;

  if (payload.type === "teams" || payload.type === "scoreboard:update") {
    applyTeams(Array.isArray(payload.teams) ? payload.teams : [], payload.changedTeam);
  }
}

async function requestTeams() {
  const response = await sendSocket("listTeams", {}, { waitForAck: true });
  applyTeams(Array.isArray(response.teams) ? response.teams : []);
  return state.lastTeams;
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
    colors: ["#00e5ff", "#ff2d7a", "#4dff88", "#ffd166", "#ffffff"],
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
    hue: { min: 18, max: 205 },
    delay: { min: 18, max: 34 },
    rocketsPoint: { min: 18, max: 82 },
    lineWidth: {
      explosion: { min: 1, max: 3 },
      trace: { min: 1, max: 2 },
    },
    brightness: { min: 64, max: 92 },
    decay: { min: 0.015, max: 0.03 },
    mouse: { click: false, move: false, max: 0 },
    boundaries: {
      x: 50,
      y: 50,
      width: container.clientWidth,
      height: container.clientHeight,
    },
    sound: { enabled: false },
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

function applyTeams(rawTeams, changedTeam) {
  const teams = rawTeams.map(normalizeTeam).filter((team) => team.id);
  let needsRender = teams.length !== state.teams.size;
  const boostedTeams = [];

  for (const team of teams) {
    const current = state.teams.get(team.id);
    if (!current || current.name !== team.name || current.stage !== team.stage) {
      needsRender = true;
    }

    if ((current && team.stage > current.stage) || String(changedTeam?.id || changedTeam?.teamId || "") === team.id) {
      boostedTeams.push(team);
    }
  }

  state.lastTeams = teams;

  if (needsRender) {
    renderDisplay(teams);
    renderAdminFromTeams(teams);
  }

  state.teams.clear();
  for (const team of teams) {
    state.teams.set(team.id, team);
  }

  if (document.body.id === "display-page" && boostedTeams.length) {
    boostedTeams.forEach((team, index) => {
      window.setTimeout(() => celebrateLevelUp(team), index * 900);
    });
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
      <button class="ghost-button" type="button" data-up-level="${team.id}">Subir nível</button>
      <button class="danger-button" type="button" data-remove-team="${team.id}">Remover</button>
    </li>
  `;
}

function renderAdminFromTeams(teams = state.lastTeams) {
  const list = document.getElementById("admin-teams-list");
  if (!list) return;

  list.innerHTML = teams.length
    ? teams.map(adminItemTemplate).join("")
    : '<li class="admin-message">Nenhuma equipe cadastrada.</li>';
}

async function renderAdmin() {
  const teams = await requestTeams();
  renderAdminFromTeams(teams);
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

async function loginAdmin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button");
  const password = document.getElementById("admin-password").value;

  button.disabled = true;
  setAuthMessage("Validando acesso...");

  try {
    sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
    await sendSocket("adminPing", {}, { authenticated: true });

    form.reset();
    setAuthMessage("");
    showAdminContent(true);
    await renderAdmin();
  } catch (error) {
    sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
  showAdminContent(false);
  setAuthMessage("Sessão encerrada.");
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
    await sendSocket("addTeam", { name }, { authenticated: true });
    form.reset();
    setAdminMessage("Equipe cadastrada.");
  } catch (error) {
    setAdminMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function updateStage(teamId, stage, select) {
  select.disabled = true;

  try {
    const response = await sendSocket("setStage", { teamId, stage: Number(stage) }, { authenticated: true });
    const stageNode = document.querySelector(`[data-admin-stage-for="${CSS.escape(teamId)}"]`);
    if (stageNode) {
      stageNode.textContent = stageLabel(response.team?.stage ?? stage);
    }

    setAdminMessage("Etapa atualizada.");
  } catch (error) {
    setAdminMessage(error.message, true);
    await renderAdmin();
  } finally {
    select.disabled = false;
  }
}

async function upLevel(teamId, button) {
  button.disabled = true;

  try {
    await sendSocket("upLevel", { teamId }, { authenticated: true });
    setAdminMessage("Nível aumentado.");
  } catch (error) {
    setAdminMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function editTeamName(teamId) {
  const team = state.lastTeams.find((item) => item.id === teamId);
  const newName = window.prompt("Novo nome da equipe:", team?.name || "");

  if (!newName || !newName.trim()) return;

  try {
    await sendSocket("renameTeam", { teamId, name: newName.trim() }, { authenticated: true });
    setAdminMessage("Nome atualizado.");
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

async function removeTeam(teamId) {
  const team = state.lastTeams.find((item) => item.id === teamId);
  const confirmed = window.confirm(`Remover a equipe "${team?.name || "selecionada"}"?`);

  if (!confirmed) return;

  try {
    await sendSocket("removeTeam", { teamId }, { authenticated: true });
    setAdminMessage("Equipe removida.");
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

function bootDisplay() {
  createParticles();
  renderDisplay([]);
  connectWebSocket();
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
    const upButton = event.target.closest("[data-up-level]");
    const removeButton = event.target.closest("[data-remove-team]");

    if (upButton) {
      upLevel(upButton.dataset.upLevel, upButton);
    }

    if (removeButton) {
      removeTeam(removeButton.dataset.removeTeam);
    }
  });

  if (adminPassword()) {
    showAdminContent(true);
    connectWebSocket({ onOpen: renderAdmin });
  } else {
    showAdminContent(false);
  }
}

if (document.body.id === "display-page") {
  bootDisplay();
}

if (document.body.id === "admin-page") {
  bootAdmin();
}
