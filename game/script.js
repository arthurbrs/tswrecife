const WORKER_URL = "";
const COUNTDOWN_TARGET = new Date("2026-11-29T16:00:00-03:00").getTime();

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
  realtimeSocket: null,
  realtimeReconnectTimer: null,
  realtimeReconnectAttempts: 0,
};

const apiUrl = (path) => `${WORKER_URL}${path}`;
const wsUrl = (path) => {
  const base = WORKER_URL || window.location.origin;
  const url = new URL(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
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

function formatCountdownPart(value) {
  return String(value).padStart(2, "0");
}

function updateCountdown() {
  const hoursNode = document.querySelector("[data-countdown-hours]");
  const minutesNode = document.querySelector("[data-countdown-minutes]");
  const secondsNode = document.querySelector("[data-countdown-seconds]");
  const timer = document.getElementById("countdown-timer");

  if (!hoursNode || !minutesNode || !secondsNode || !timer) return;

  const remaining = Math.max(0, COUNTDOWN_TARGET - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  hoursNode.textContent = formatCountdownPart(hours);
  minutesNode.textContent = formatCountdownPart(minutes);
  secondsNode.textContent = formatCountdownPart(seconds);
  timer.classList.toggle("is-finished", remaining === 0);
}

function startCountdown() {
  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

async function requestJson(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) },
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

function sponsorName(key) {
  const filename = String(key).split("/").pop() || "Patrocinador";
  return decodeURIComponent(filename).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

async function renderSponsors() {
  const container = document.getElementById("sponsors-logos");
  if (!container) return;

  try {
    const data = await requestJson("/api/sponsors");
    const logos = Array.isArray(data.logos) ? data.logos : [];

    container.innerHTML = logos.length
      ? logos.map(({ key, url }) => `
          <div class="sponsor-logo">
            <img src="${sanitizeText(url)}" alt="${sanitizeText(sponsorName(key))}" loading="lazy" decoding="async">
          </div>
        `).join("")
      : '<div class="sponsor-placeholder">Logos em breve</div>';
  } catch (error) {
    console.error("Nao foi possivel carregar os patrocinadores.", error);
    container.innerHTML = '<div class="sponsor-placeholder">Logos em breve</div>';
  }
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
        ${stageTeams.map(teamTokenTemplate).join("")}
      </div>
    </article>
  `;
}

function renderDisplay(teams) {
  const grid = document.getElementById("teams-grid");
  const empty = document.getElementById("empty-display");
  if (!grid) return;

  grid.innerHTML = STAGES
    .map((label, index) => ({ label, index }))
    .reverse()
    .map(({ label, index }) => stageColumnTemplate(label, index, teams))
    .join("");
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

function connectRealtime() {
  if (state.realtimeSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.realtimeSocket.readyState)) {
    return;
  }

  state.realtimeSocket = new WebSocket(wsUrl("/ws"));

  state.realtimeSocket.addEventListener("open", () => {
    state.realtimeReconnectAttempts = 0;
    syncDisplay().catch((error) => console.error(error));
  });

  state.realtimeSocket.addEventListener("message", (event) => {
    let payload = {};

    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      console.error("Mensagem realtime invalida.", error);
      return;
    }

    if (payload.type === "scoreboard:update") {
      syncDisplay().catch((error) => console.error(error));
    }
  });

  state.realtimeSocket.addEventListener("close", () => {
    scheduleRealtimeReconnect();
  });
  state.realtimeSocket.addEventListener("error", () => {
    state.realtimeSocket?.close();
  });
}

function scheduleRealtimeReconnect() {
  if (state.realtimeReconnectTimer) return;

  const delay = Math.min(12000, 1000 * 2 ** state.realtimeReconnectAttempts);
  state.realtimeReconnectAttempts += 1;

  state.realtimeReconnectTimer = window.setTimeout(() => {
    state.realtimeReconnectTimer = null;
    connectRealtime();
  }, delay);
}

async function bootDisplay() {
  createParticles();
  startCountdown();

  try {
    await Promise.all([syncDisplay(), renderSponsors()]);
    connectRealtime();
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
      <div class="admin-item-actions">
        <button class="ghost-button" type="button" data-level-up="${team.id}">Subir nível</button>
        <button class="ghost-button" type="button" data-edit-name="${team.id}">Editar nome</button>
        <button class="danger-button" type="button" data-remove-team="${team.id}">Remover</button>
      </div>
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
    if (document.body.id === "files-page") {
      await renderStorageFiles();
    } else {
      await renderAdmin();
    }
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

async function levelUpTeam(teamId, button) {
  button.disabled = true;

  try {
    const data = await requestJson("/api/level-up", {
      method: "POST",
      body: JSON.stringify({ teamId }),
    });

    setAdminMessage("Equipe subiu de nível.");
    await renderAdmin();

    if (data.team) {
      const stageNode = document.querySelector(`[data-admin-stage-for="${CSS.escape(teamId)}"]`);
      if (stageNode) {
        stageNode.textContent = stageLabel(data.team.stage);
      }
    }
  } catch (error) {
    setAdminMessage(error.message, true);
  } finally {
    button.disabled = false;
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

function setStorageMessage(message, isError = false) {
  const node = document.getElementById("storage-message");
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "var(--pink)" : "var(--green)";
}

function storagePrefix() {
  return document.getElementById("storage-prefix")?.value.trim() || "";
}

function storagePublicUrl(prefix) {
  const path = prefix ? `${prefix.replace(/\/$/, "")}/` : "";
  return `https://r2.tswrecife.com.br/${path}`;
}

function setStoragePrefix(prefix) {
  const input = document.getElementById("storage-prefix");
  if (!input) return;
  input.value = String(prefix || "").replace(/^\/+|\/+$/g, "");
}

function renderStorageLocation() {
  const prefix = storagePrefix();
  const breadcrumbs = document.getElementById("storage-breadcrumbs");
  const url = document.getElementById("storage-url");
  const target = document.getElementById("storage-upload-target");
  const uploadButton = document.querySelector("#upload-form button[type='submit']");

  const segments = prefix ? prefix.split("/") : [];
  if (breadcrumbs) {
    let accumulated = "";
    breadcrumbs.innerHTML = ["Início", ...segments].map((segment, index) => {
      const isRoot = index === 0;
      if (!isRoot) accumulated = `${accumulated}${accumulated ? "/" : ""}${segment}`;
      const targetPrefix = isRoot ? "" : accumulated;
      return `<button type="button" data-storage-folder="${sanitizeText(targetPrefix)}">${sanitizeText(segment)}</button>`;
    }).join('<span>/</span>');
  }

  if (target) target.textContent = prefix ? `/${prefix}/` : "Selecione ou crie uma pasta";
  if (url) {
    url.href = storagePublicUrl(prefix);
    url.textContent = storagePublicUrl(prefix);
  }
  if (uploadButton) uploadButton.disabled = !prefix;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(bytes);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

async function renderStorageFiles() {
  const list = document.getElementById("storage-files-list");
  const foldersList = document.getElementById("storage-folders-list");
  const prefix = storagePrefix();
  if (!list || !foldersList) return;

  renderStorageLocation();
  setStorageMessage("Carregando arquivos...");
  try {
    const data = await requestJson(`/api/storage?prefix=${encodeURIComponent(prefix || "/")}`);
    const files = Array.isArray(data.files) ? data.files : [];
    const folders = Array.isArray(data.folders) ? data.folders : [];
    document.getElementById("storage-folder-count").textContent = `${folders.length} pasta(s)`;
    document.getElementById("storage-file-count").textContent = `${files.length} arquivo(s)`;

    foldersList.innerHTML = folders.length
      ? folders.map((folder) => `
          <button class="storage-folder" type="button" data-storage-folder="${sanitizeText(folder.prefix)}">
            <span aria-hidden="true">⌁</span>${sanitizeText(folder.name)}
          </button>
        `).join("")
      : '<p class="storage-empty">Nenhuma subpasta aqui.</p>';

    list.innerHTML = files.length
      ? files.map((file) => `
          <li class="storage-item">
            <div class="storage-file-meta">
              <a class="storage-file-name" href="${sanitizeText(file.url)}" target="_blank" rel="noopener noreferrer">${sanitizeText(file.key.split("/").pop())}</a>
              <a class="storage-file-url" href="${sanitizeText(file.url)}" target="_blank" rel="noopener noreferrer">${sanitizeText(file.url)}</a>
            </div>
            <span>${formatFileSize(file.size)}</span>
            <div class="storage-file-actions">
              <button class="ghost-button" type="button" data-storage-copy="${sanitizeText(file.url)}">Copiar link</button>
              <button class="danger-button" type="button" data-storage-delete="${sanitizeText(file.key)}">Remover</button>
            </div>
          </li>
        `).join("")
      : '<li class="admin-message">Nenhum arquivo nessa pasta.</li>';
    setStorageMessage(files.length ? `${files.length} arquivo(s) encontrado(s).` : "Pasta vazia.");
  } catch (error) {
    list.innerHTML = "";
    setStorageMessage(error.message, true);
  }
}

function openStorageFolder(prefix) {
  setStoragePrefix(prefix);
  renderStorageFiles();
}

function openParentStorageFolder() {
  const parts = storagePrefix().split("/").filter(Boolean);
  parts.pop();
  openStorageFolder(parts.join("/"));
}

function createStorageFolder() {
  const name = window.prompt("Nome da nova pasta:");
  if (!name?.trim()) return;
  const cleanName = name.trim().replace(/^\/+|\/+$/g, "");
  if (!cleanName || cleanName.includes("/") || cleanName === "." || cleanName === "..") {
    setStorageMessage("Use um nome de pasta simples, sem barras.", true);
    return;
  }
  openStorageFolder([storagePrefix(), cleanName].filter(Boolean).join("/"));
  setStorageMessage("Pasta selecionada. Envie um arquivo para criá-la no storage.");
}

async function uploadStorageFiles(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const prefix = storagePrefix();
  const files = document.getElementById("storage-files")?.files;
  if (!prefix) {
    setStorageMessage("Escolha ou crie uma pasta antes de enviar arquivos.", true);
    return;
  }
  if (!files?.length) return;

  const data = new FormData();
  data.set("prefix", prefix);
  Array.from(files).forEach((file) => data.append("files", file));

  button.disabled = true;
  setStorageMessage("Enviando arquivos...");
  try {
    await requestJson("/api/storage/upload", { method: "POST", body: data });
    form.reset();
    await renderStorageFiles();
  } catch (error) {
    setStorageMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function deleteStorageFile(key) {
  if (!window.confirm(`Remover o arquivo "${key}"?`)) return;
  try {
    await requestJson("/api/storage/delete", { method: "POST", body: JSON.stringify({ key }) });
    await renderStorageFiles();
  } catch (error) {
    setStorageMessage(error.message, true);
  }
}

async function copyStorageUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    setStorageMessage("Link copiado.");
  } catch {
    window.prompt("Copie este link:", url);
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
    const levelUpButton = event.target.closest("[data-level-up]");
    const editButton = event.target.closest("[data-edit-name]");
    const removeButton = event.target.closest("[data-remove-team]");

    if (levelUpButton) {
      levelUpTeam(levelUpButton.dataset.levelUp, levelUpButton);
    }

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

async function bootFiles() {
  const loginForm = document.getElementById("login-form");
  const logout = document.getElementById("logout-admin");
  const up = document.getElementById("storage-up");
  const newFolder = document.getElementById("storage-new-folder");
  const uploadForm = document.getElementById("upload-form");
  const list = document.getElementById("storage-files-list");
  const folders = document.getElementById("storage-folders-list");
  const breadcrumbs = document.getElementById("storage-breadcrumbs");
  const fileInput = document.getElementById("storage-files");

  loginForm?.addEventListener("submit", loginAdmin);
  logout?.addEventListener("click", logoutAdmin);
  up?.addEventListener("click", openParentStorageFolder);
  newFolder?.addEventListener("click", createStorageFolder);
  uploadForm?.addEventListener("submit", uploadStorageFiles);
  fileInput?.addEventListener("change", () => {
    const label = document.querySelector(".storage-file-picker span");
    if (label) label.textContent = fileInput.files.length ? `${fileInput.files.length} arquivo(s) selecionado(s)` : "Selecionar arquivos";
  });
  list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-storage-delete]");
    if (button) deleteStorageFile(button.dataset.storageDelete);
    const copyButton = event.target.closest("[data-storage-copy]");
    if (copyButton) copyStorageUrl(copyButton.dataset.storageCopy);
  });
  [folders, breadcrumbs].forEach((container) => container?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-storage-folder]");
    if (button) openStorageFolder(button.dataset.storageFolder);
  }));

  try {
    if (await checkAdminSession()) await renderStorageFiles();
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

if (document.body.id === "files-page") {
  bootFiles();
}
