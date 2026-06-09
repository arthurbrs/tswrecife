const PUSHER_APP_ID = "2164463";
const PUSHER_KEY = "715f24c522c36b942eee";
const PUSHER_SECRET = "baa039ebd06abdfc0587";
const PUSHER_CLUSTER = "sa1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getMD5(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getHMAC(secret, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);

    if (url.pathname === "/api/teams" && request.method === "GET") {
      const teamsData = await env.KV.get("placar_teams");
      return new Response(teamsData || "[]", { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/teams" && request.method === "POST") {
      try {
        const newTeam = await request.json();
        const currentData = await env.KV.get("placar_teams");
        const teams = currentData ? JSON.parse(currentData) : [];
        teams.push(newTeam);
        await env.KV.put("placar_teams", JSON.stringify(teams));
        return new Response(JSON.stringify({ success: true, teams }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/api/trigger-levelup" && request.method === "POST") {
      try {
        const bodyData = await request.json();
        const { teamId, teamName } = bodyData;
        const currentData = await env.KV.get("placar_teams");
        let teams = currentData ? JSON.parse(currentData) : [];
        let updatedLevel = 1;
        const teamIndex = teams.findIndex(t => t.id === teamId);
        
        if (teamIndex !== -1) {
          teams[teamIndex].level += 1;
          updatedLevel = teams[teamIndex].level;
          await env.KV.put("placar_teams", JSON.stringify(teams));
        } else {
          return new Response(JSON.stringify({ error: "Equipe não encontrada." }), { status: 404, headers: corsHeaders });
        }

        const pusherData = JSON.stringify({ teamId, teamName, newLevel: updatedLevel });
        const pusherPayload = JSON.stringify({ name: "update-level", channels: ["placar-game"], data: pusherData });
        const path = `/apps/${PUSHER_APP_ID}/events`;
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyMd5 = await getMD5(pusherPayload);
        const queryString = `auth_key=&auth_timestamp=&auth_version=1.0&body_md5=`;
        const stringToSign = `POST\n\n`;
        const authSignature = await getHMAC(PUSHER_SECRET, stringToSign);
        const pusherEndpoint = `<https://api-.pusher.com?&auth_signature=>`;
        
        const pusherResponse = await fetch(pusherEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: pusherPayload });
        if (!pusherResponse.ok) throw new Error(`Pusher API error: ${await pusherResponse.text()}`);

        return new Response(JSON.stringify({ success: true, newLevel: updatedLevel }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
