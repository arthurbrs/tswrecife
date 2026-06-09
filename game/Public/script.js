// ==========================================
// CONFIGURAÇÕES
// ==========================================
const PUSHER_APP_KEY = '715f24c522c36b942eee';
const PUSHER_CLUSTER = 'sa1';

// MUDANÇA VITAL: Usando caminho relativo. 
// O site sempre vai achar a API, não importa o domínio.
async function fetchTeamsFromAPI() {
    try {
        const response = await fetch('/api/teams');
        if (!response.ok) throw new Error('Falha na resposta da API');
        return await response.json();
    } catch (e) {
        console.error("Erro ao carregar equipes:", e);
        return [];
    }
}

// ==========================================
// TELA DE EXIBIÇÃO (INDEX.HTML)
// ==========================================
if (document.getElementById('display-page')) {
    function createParticles() {
        const container = document.getElementById('particles-container');
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            const size = Math.random() * 5 + 2;
            particle.style.width = `${size}px`;
            particle.style.height = `px`;
            particle.style.left = `${Math.random() * 100}vw`;
            particle.style.animationDuration = `${Math.random() * 10 + 5}s`;
            particle.style.animationDelay = `${Math.random() * 5}s`;
            container.appendChild(particle);
        }
    }

    async function renderScoreboard() {
        const teams = await fetchTeamsFromAPI();
        const grid = document.getElementById('teams-grid');
        grid.innerHTML = ''; 

        teams.forEach(team => {
            const card = document.createElement('div');
            card.className = 'team-card';
            card.id = `card-${team.id}`;
            card.innerHTML = `
                <h2 class="team-name" style="font-size: 2rem; margin-top: 1rem;">${team.name}</h2>
                <div class="team-level">LVL <span id="level-${team.id}">${team.level}</span></div>
            `;
            grid.appendChild(card);
        });
    }

    function initializePusher() {
        const pusher = new Pusher(PUSHER_APP_KEY, { cluster: PUSHER_CLUSTER });
        const channel = pusher.subscribe('placar-game');

        channel.bind('update-level', function(data) {
            const levelSpan = document.getElementById(`level-${data.teamId}`);
            if (levelSpan) {
                levelSpan.innerText = data.newLevel;
                confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, colors: ['#00f0ff', '#ff0055', '#ffffff'] });

                const card = document.getElementById(`card-${data.teamId}`);
                card.style.transform = "scale(1.1)";
                card.style.borderColor = "#ff0055";
                setTimeout(() => {
                    card.style.transform = "scale(1)";
                    card.style.borderColor = "#2a2d3e";
                }, 1000);
            } else {
                renderScoreboard();
            }
        });
    }

    createParticles();
    renderScoreboard();
    initializePusher();
}

// ==========================================
// TELA DE ADMIN (ADMIN.HTML)
// ==========================================
if (document.getElementById('admin-page')) {
    async function renderAdminList() {
        const teams = await fetchTeamsFromAPI();
        const list = document.getElementById('admin-teams-list');
        list.innerHTML = '';

        teams.forEach(team => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="team-info">
                    <span><strong>${team.name}</strong> - Lvl: <span id="admin-lvl-${team.id}">${team.level}</span></span>
                </div>
                <button class="btn-level-up" onclick="triggerLevelUp('${team.id}', '${team.name}')">UP LEVEL 🚀</button>
            `;
            list.appendChild(li);
        });
    }

    const addTeamForm = document.getElementById('add-team-form');
    if (addTeamForm) {
        addTeamForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('team-name').value;
            const newTeam = { id: 'team_' + Date.now(), name: name, level: 1 };

            try {
                // Requisição sem domínio fixo
                await fetch('/api/teams', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newTeam)
                });
                addTeamForm.reset();
                await renderAdminList();
            } catch (error) {
                console.error("Erro ao salvar:", error);
                alert("Erro de conexão com a API.");
            }
        });
    }

    async function triggerLevelUp(teamId, teamName) {
        const spanLvl = document.getElementById(`admin-lvl-`);
        if(spanLvl) spanLvl.innerText = parseInt(spanLvl.innerText) + 1;

        try {
            // Requisição sem domínio fixo
            const response = await fetch('/api/trigger-levelup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId, teamName })
            });

            if (!response.ok) {
                if(spanLvl) spanLvl.innerText = parseInt(spanLvl.innerText) - 1;
                alert('Erro ao processar o Level UP no servidor.');
            }
        } catch (error) {
            console.error('Erro:', error);
            if(spanLvl) spanLvl.innerText = parseInt(spanLvl.innerText) - 1;
        }
    }

    renderAdminList();
    window.triggerLevelUp = triggerLevelUp;
}
