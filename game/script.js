import Pusher from "pusher";

// Configuração do Pusher com as chaves fornecidas
const pusher = new Pusher({
  appId: "2164463",
  key: "715f24c522c36b942eee",
  secret: "baa039ebd06abdfc0587",
  cluster: "sa1",
  useTLS: true
});

export default {
  async fetch(request, env, ctx) {
    // Lidar com requisições CORS (Preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);

    // Rota que definimos no fetch do admin.html
    if (url.pathname === "/api/trigger-levelup" && request.method === "POST") {
      try {
        // Extrai os dados enviados pelo Front-end
        const body = await request.json();
        const { teamId, teamName, newLevel } = body;

        // Dispara o evento 'level-up' no canal 'placar-channel' via Pusher
        await pusher.trigger("placar-channel", "level-up", {
          teamId: teamId,
          teamName: teamName,
          newLevel: newLevel
        });

        return new Response(JSON.stringify({ success: true, message: "Evento enviado com sucesso!" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
