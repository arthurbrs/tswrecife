# Placar Game AWS

Versao AWS independente do placar animado. O frontend e estatico para AWS Amplify Hosting e o tempo real usa API Gateway WebSocket, Lambda Node.js e DynamoDB.

## Arquitetura

```txt
Amplify Hosting
  -> index.html / admin.html / script.js / style.css

API Gateway WebSocket
  -> Lambda Node.js
  -> DynamoDB
```

O API Gateway WebSocket e o transmissor em tempo real. A Lambda salva os `connectionId` ativos no DynamoDB e usa `ApiGatewayManagementApi` para enviar broadcast para todas as telas conectadas.

## Arquivos

```txt
index.html              Tela publica do placar
admin.html              Painel admin
style.css               Copia visual da versao original
script.js               Cliente WebSocket do navegador
lambda-websocket.js     Backend Lambda para WebSocket API
```

## DynamoDB

Crie duas tabelas em modo On-demand.

```txt
Table name: PlacarGameConnections
Partition key: connectionId
Type: String
Sort key: nenhuma
```

```txt
Table name: PlacarGameTeams
Partition key: id
Type: String
Sort key: nenhuma
```

Nao precisa criar itens manualmente. A Lambda preenche as tabelas automaticamente.

## Lambda

Crie uma Lambda em Node.js.

```txt
Runtime: Node.js 20.x ou Node.js 22.x
Handler: index.handler
Arquivo: index.js
```

Importante: o codigo de `lambda-websocket.js` usa CommonJS (`require` e `exports.handler`). Se colar no console da Lambda, use `index.js`, nao `index.mjs`.

Variaveis de ambiente:

```txt
ADMIN_PASSWORD=sua_senha_admin
CONNECTIONS_TABLE=PlacarGameConnections
TEAMS_TABLE=PlacarGameTeams
```

Dependencias para empacotar junto da Lambda:

```txt
@aws-sdk/client-apigatewaymanagementapi
@aws-sdk/client-dynamodb
@aws-sdk/lib-dynamodb
```

## IAM

A execution role da Lambda precisa de permissao para CloudWatch Logs, DynamoDB e API Gateway Management API.

Exemplo de inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:REGIAO:ID-CONTA-AWS:table/PlacarGameConnections",
        "arn:aws:dynamodb:REGIAO:ID-CONTA-AWS:table/PlacarGameTeams"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "execute-api:ManageConnections",
      "Resource": "arn:aws:execute-api:REGIAO:ID-CONTA-AWS:APP-ID-LAMBDA/prod/POST/@connections/*"
    }
  ]
}
```

Troque regiao, account id, API id e stage(prod) pelo quese forem diferentes.

## API Gateway WebSocket

Crie uma WebSocket API com:

```txt
Route selection expression: $request.body.action
```

Rotas:

```txt
$connect
$disconnect
$default
listTeams
adminPing
addTeam
setStage
upLevel
renameTeam
removeTeam
```

Todas as rotas podem apontar para a mesma Lambda.

Depois faca deploy para um stage, por exemplo:

```txt
prod
```

A URL final ficara parecida com:

```txt
wss://APP-ID.execute-api.us-east-2.amazonaws.com/(stage)
```

## Frontend

Configure a URL WebSocket em `script.js`:

```js
const WEBSOCKET_URL = "wss://APP-ID.execute-api.us-east-2.amazonaws.com/(stage)";
```

Depois publique a pasta `game-aws` no Amplify Hosting.

## Admin

O admin envia a senha digitada para a Lambda pelo WebSocket. A Lambda compara com:

```txt
process.env.ADMIN_PASSWORD
```

Nao coloque senha real no frontend ou em variaveis publicas do Amplify.

## Teste

1. Abra `index.html`.
2. Abra `admin.html`.
3. Faca login com a senha configurada em `ADMIN_PASSWORD`.
4. Cadastre uma equipe.
5. Clique em `Subir nivel`.
6. A tela do placar deve atualizar em tempo real e disparar a animacao.

## Troubleshooting

Se aparecer `Maximum call stack size exceeded`, confira se o frontend publicado esta com a versao atual de `script.js`.

Se aparecer `Falha na conexao WebSocket`, confira:

```txt
URL wss em script.js
Deploy da API Gateway no stage correto
Rotas integradas com a Lambda
Logs da Lambda no CloudWatch
```

Se a Lambda falhar no inicio com erro de runtime:

```txt
Use index.js, nao index.mjs
Handler deve ser index.handler
Empacote as dependencias @aws-sdk se necessario
```

Se o broadcast falhar:

```txt
Confira execute-api:ManageConnections na role da Lambda
Confira se o ARN usa API id, regiao, account id e stage corretos
```
