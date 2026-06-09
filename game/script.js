// ==========================================
// CONFIGURAÇÕES
// ==========================================
const PUSHER_APP_KEY = '715f24c522c36b942eee';
const PUSHER_CLUSTER = 'sa1';
const WORKER_URL = 'https://tswrecife.arthursec.workers.dev';

// Função utilitária para buscar equipes da API (Worker)
async function fetchTeamsFromAPI() {
    try {
        const response = await fetch(`${WORKER_URL}/api/teams`);
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
            particle.style.width = `px`;
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
                <div class="logo-container">
                    <img src="${team.logo}" alt="Logo ${team.name}">
                </div>
                <h2 class="team-name">${team.name}</h2>
                <div class="team-level">LVL <span id="level-${team.id}">${team.level}</span></div>
            `;
            grid.appendChild(card);
        });
    }

    function initializePusher() {
        const pusher = new Pusher(PUSHER_APP_KEY, { cluster: PUSHER_CLUSTER });
        const channel = pusher.subscribe('placar-game'); // Corrigido para o mesmo canal do Worker

        channel.bind('update-level', function(data) {
            const levelSpan = document.getElementById(`level-${data.teamId}`);
            if (levelSpan) {
                levelSpan.innerText = data.newLevel;
                triggerConfetti();

                const card = document.getElementById(`card-${data.teamId}`);
                card.style.transform = "scale(1.1)";
                card.style.borderColor = "#ff0055";
                setTimeout(() => {
                    card.style.transform = "scale(1)";
                    card.style.borderColor = "#2a2d3e";
                }, 1000);
            } else {
                // Se o time for novo e não estava renderizado, atualiza o placar inteiro
                renderScoreboard();
            }
        });
    }

    function triggerConfetti() {
        confetti({
            particleCount: 150,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#00f0ff', '#ff0055', '#ffffff']
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
                    <img src="${team.logo}" alt="Logo">
                    <span><strong>${team.name}</strong> - Lvl: <span id="admin-lvl-${team.id}">${team.level}</span></span>
                </div>
                <button class="btn-level-up" onclick="triggerLevelUp('${team.id}', '${team.name}')">UP LEVEL 🚀</button>
            `;
            list.appendChild(li);
        });
    }

    const addTeamForm = document.getElementById('add-team-form');
    addTeamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('team-name').value;
        const logo = document.getElementById('team-logo').value;
        
        const newTeam = {
            id: 'team_' + Date.now(),
            name: name,
            logo: logo,
            level: 1
        };

        // Envia o novo time para ser salvo no KV do Worker
        await fetch(`/api/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTeam)
        });
        
        addTeamForm.reset();
        await renderAdminList();
    });

    async function triggerLevelUp(teamId, teamName) {
        // UI Otimista: Atualiza o nível no Admin na mesma hora
        const spanLvl = document.getElementById(`admin-lvl-`);
        if(spanLvl) spanLvl.innerText = parseInt(spanLvl.innerText) + 1;

        try {
            const response = await fetch(`/api/trigger-levelup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId, teamName })
            });

            if (!response.ok) {
                console.error('Falha na API:', await response.text());
                // Reverte se houver erro
                if(spanLvl) spanLvl.innerText = parseInt(spanLvl.innerText) - 1;
                alert('Erro ao processar o Level UP no banco de dados.');
            }
        } catch (error) {
            console.error('Erro de conexão:', error);
        }
    }

    renderAdminList();
    window.triggerLevelUp = triggerLevelUp;
}
