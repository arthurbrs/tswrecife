/*
 * AWS DynamoDB tables expected by this Lambda:
 *
 * 1. Connections table
 *    Default name: PlacarGameConnections
 *    Environment variable override: CONNECTIONS_TABLE
 *    Partition key: connectionId (String)
 *
 * 2. Teams table
 *    Default name: PlacarGameTeams
 *    Environment variable override: TEAMS_TABLE
 *    Partition key: id (String)
 *
 * Suggested WebSocket API route selection expression:
 *    $request.body.action
 *
 * Create explicit API Gateway WebSocket routes for:
 *    $connect, $disconnect, upLevel, $default
 *
 * Required Lambda environment variables:
 *    ADMIN_PASSWORD: password used by admin.html mutation actions
 *    CONNECTIONS_TABLE: optional; defaults to PlacarGameConnections
 *    TEAMS_TABLE: optional; defaults to PlacarGameTeams
 *
 * Package dependencies for deployment:
 *    @aws-sdk/client-apigatewaymanagementapi
 *    @aws-sdk/client-dynamodb
 *    @aws-sdk/lib-dynamodb
 */

const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "PlacarGameConnections";
const TEAMS_TABLE = process.env.TEAMS_TABLE || "PlacarGameTeams";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const MAX_STAGE = 5;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const routeKey = event.requestContext.routeKey;
  const connectionId = event.requestContext.connectionId;

  try {
    if (routeKey === "$connect") {
      await saveConnection(connectionId);
      return response(200, { ok: true });
    }

    if (routeKey === "$disconnect") {
      await removeConnection(connectionId);
      return response(200, { ok: true });
    }

    const body = parseBody(event.body);
    const action = body.action || routeKey;
    const apiClient = managementClient(event);

    if (action === "listTeams") {
      await sendToConnection(apiClient, connectionId, {
        type: "teams",
        requestId: body.requestId,
        ok: true,
        teams: await listTeams(),
      });
      return response(200, { ok: true });
    }

    if (action === "adminPing") {
      requireAdmin(body);
      await sendAck(apiClient, connectionId, body.requestId, { authenticated: true });
      return response(200, { ok: true });
    }

    requireAdmin(body);

    if (action === "addTeam") {
      const team = await addTeam(body.name);
      await broadcastTeams(apiClient, { changedTeam: team, event: "teamAdded" });
      await sendAck(apiClient, connectionId, body.requestId, { team });
      return response(200, { ok: true });
    }

    if (action === "setStage") {
      const team = await setStage(body.teamId, body.stage);
      await broadcastTeams(apiClient, { changedTeam: team, event: "stageChanged" });
      await sendAck(apiClient, connectionId, body.requestId, { team });
      return response(200, { ok: true });
    }

    if (action === "upLevel") {
      const team = await upLevel(body.teamId);
      await broadcastTeams(apiClient, { changedTeam: team, event: "levelUp" });
      await sendAck(apiClient, connectionId, body.requestId, { team });
      return response(200, { ok: true });
    }

    if (action === "renameTeam") {
      const team = await renameTeam(body.teamId, body.name);
      await broadcastTeams(apiClient, { changedTeam: team, event: "teamRenamed" });
      await sendAck(apiClient, connectionId, body.requestId, { team });
      return response(200, { ok: true });
    }

    if (action === "removeTeam") {
      await removeTeam(body.teamId);
      await broadcastTeams(apiClient, { changedTeam: { id: body.teamId }, event: "teamRemoved" });
      await sendAck(apiClient, connectionId, body.requestId, {});
      return response(200, { ok: true });
    }

    throw new Error(`Ação não suportada: ${action}`);
  } catch (error) {
    console.error(error);

    if (connectionId && routeKey !== "$connect" && routeKey !== "$disconnect") {
      const body = parseBody(event.body);
      await sendError(managementClient(event), connectionId, body.requestId, error.message);
      return response(200, { ok: false });
    }

    return response(500, { ok: false, error: error.message });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body),
  };
}

function parseBody(body) {
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function requireAdmin(body) {
  if (!ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD não configurado na Lambda.");
  }

  if (body.adminPassword !== ADMIN_PASSWORD) {
    throw new Error("Senha do admin inválida.");
  }
}

function managementClient(event) {
  const { domainName, stage } = event.requestContext;
  return new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });
}

async function saveConnection(connectionId) {
  await dynamo.send(new PutCommand({
    TableName: CONNECTIONS_TABLE,
    Item: {
      connectionId,
      connectedAt: new Date().toISOString(),
    },
  }));
}

async function removeConnection(connectionId) {
  await dynamo.send(new DeleteCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));
}

async function listConnections() {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: CONNECTIONS_TABLE,
      ProjectionExpression: "connectionId",
      ExclusiveStartKey,
    }));

    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

async function listTeams() {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TEAMS_TABLE,
      ExclusiveStartKey,
    }));

    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items
    .map(normalizeTeam)
    .sort((a, b) => a.stage - b.stage || a.name.localeCompare(b.name, "pt-BR"));
}

function normalizeTeam(team) {
  const stage = Number.isFinite(Number(team.stage)) ? Number(team.stage) : 0;

  return {
    id: String(team.id),
    name: String(team.name || "Equipe sem nome"),
    stage: clampStage(stage),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

async function addTeam(name) {
  const safeName = cleanName(name);
  const now = new Date().toISOString();
  const team = {
    id: crypto.randomUUID(),
    name: safeName,
    stage: 0,
    createdAt: now,
    updatedAt: now,
  };

  await dynamo.send(new PutCommand({
    TableName: TEAMS_TABLE,
    Item: team,
  }));

  return team;
}

async function getTeam(teamId) {
  if (!teamId) throw new Error("teamId é obrigatório.");

  const result = await dynamo.send(new GetCommand({
    TableName: TEAMS_TABLE,
    Key: { id: String(teamId) },
  }));

  if (!result.Item) {
    throw new Error("Equipe não encontrada.");
  }

  return normalizeTeam(result.Item);
}

async function setStage(teamId, stage) {
  const safeStage = clampStage(stage);

  const result = await dynamo.send(new UpdateCommand({
    TableName: TEAMS_TABLE,
    Key: { id: String(teamId) },
    UpdateExpression: "SET stage = :stage, updatedAt = :updatedAt",
    ConditionExpression: "attribute_exists(id)",
    ExpressionAttributeValues: {
      ":stage": safeStage,
      ":updatedAt": new Date().toISOString(),
    },
    ReturnValues: "ALL_NEW",
  }));

  return normalizeTeam(result.Attributes);
}

async function upLevel(teamId) {
  const current = await getTeam(teamId);
  return setStage(current.id, Math.min(current.stage + 1, MAX_STAGE));
}

async function renameTeam(teamId, name) {
  const safeName = cleanName(name);

  const result = await dynamo.send(new UpdateCommand({
    TableName: TEAMS_TABLE,
    Key: { id: String(teamId) },
    UpdateExpression: "SET #name = :name, updatedAt = :updatedAt",
    ConditionExpression: "attribute_exists(id)",
    ExpressionAttributeNames: {
      "#name": "name",
    },
    ExpressionAttributeValues: {
      ":name": safeName,
      ":updatedAt": new Date().toISOString(),
    },
    ReturnValues: "ALL_NEW",
  }));

  return normalizeTeam(result.Attributes);
}

async function removeTeam(teamId) {
  if (!teamId) throw new Error("teamId é obrigatório.");

  await dynamo.send(new DeleteCommand({
    TableName: TEAMS_TABLE,
    Key: { id: String(teamId) },
  }));
}

function cleanName(name) {
  const safeName = String(name || "").trim();

  if (!safeName) {
    throw new Error("Nome da equipe é obrigatório.");
  }

  if (safeName.length > 36) {
    throw new Error("Nome da equipe deve ter até 36 caracteres.");
  }

  return safeName;
}

function clampStage(stage) {
  const value = Number(stage);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), MAX_STAGE));
}

async function sendAck(apiClient, connectionId, requestId, extra = {}) {
  await sendToConnection(apiClient, connectionId, {
    type: "ack",
    requestId,
    ok: true,
    ...extra,
  });
}

async function sendError(apiClient, connectionId, requestId, error) {
  await sendToConnection(apiClient, connectionId, {
    type: "error",
    requestId,
    ok: false,
    error,
  });
}

async function broadcastTeams(apiClient, meta = {}) {
  const teams = await listTeams();
  const connections = await listConnections();
  const payload = {
    type: "scoreboard:update",
    teams,
    ...meta,
  };

  await Promise.all(connections.map(async ({ connectionId }) => {
    try {
      await sendToConnection(apiClient, connectionId, payload);
    } catch (error) {
      if (error.name === "GoneException" || error.$metadata?.httpStatusCode === 410) {
        await removeConnection(connectionId);
        return;
      }

      throw error;
    }
  }));
}

async function sendToConnection(apiClient, connectionId, payload) {
  await apiClient.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(payload)),
  }));
}
