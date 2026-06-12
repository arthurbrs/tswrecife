# Placar Game Cloudflare

Versao Cloudflare do placar animado. O app usa Worker para servir frontend/API e Durable Object para persistir equipes, etapas e transmitir atualizacoes em tempo real.

## Arquitetura

```txt
Browser
  -> HTML/CSS/JS servidos pelo Worker assets
  -> REST API /api/* no Worker
  -> WebSocket /ws no Durable Object

Worker
  -> PLACAR_ROOM Durable Object para dados e broadcast realtime
```

## Responsabilidade de cada recurso

```txt
Durable Object
  Fonte de verdade do placar. Guarda equipes/etapas no storage persistente e mantem conexoes WebSocket vivas para enviar broadcast.

Worker
  Serve arquivos estaticos, autentica admin e encaminha as rotas do placar para o Durable Object.
```

Neste desenho, o Durable Object substitui o KV. O storage persistente dele guarda a lista de equipes; as conexoes WebSocket continuam em memoria e sao recriadas quando as telas abrem novamente.

## Configuracao do Wrangler

O `wrangler.json` precisa ter:

```json
{
  "durable_objects": {
    "bindings": [
      {
        "name": "PLACAR_ROOM",
        "class_name": "PlacarRealtimeRoom"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["PlacarRealtimeRoom"]
    }
  ]
}
```

No Workers Free plan, use `new_sqlite_classes`. Nao precisa KV nem D1 para este placar.

## Secrets

Configure os secrets no Worker:

```txt
ADMIN_PASSWORD
SESSION_SECRET
```

`ADMIN_PASSWORD` e a senha do painel admin.  
`SESSION_SECRET` assina o cookie de sessao.

Os secrets antigos do Pusher nao sao mais necessarios:

```txt
PUSHER_APP_ID
PUSHER_KEY
PUSHER_SECRET
PUSHER_CLUSTER
```

## Rotas

API REST:

```txt
GET  /api/teams
GET  /api/session
POST /api/login
POST /api/logout
POST /api/teams
POST /api/stage
POST /api/team-name
POST /api/team-delete
POST /api/level-up
```

Realtime:

```txt
GET /ws
```

`/ws` abre uma conexao WebSocket no Durable Object. Quando o admin altera algo, o Worker valida a sessao e encaminha a escrita para o Durable Object. O Durable Object grava no proprio storage persistente e envia:

```json
{
  "type": "scoreboard:update",
  "action": "stage-updated",
  "teamId": "...",
  "stage": 1
}
```

A tela do placar recebe essa mensagem e busca o estado atualizado em `/api/teams`.

## Logs e metricas

O Durable Object guarda:

```txt
equipes e etapas no storage persistente
conexoes WebSocket abertas
broadcasts em tempo real
cleanup ao desconectar
```

Ele ainda nao grava:

```txt
historico de conexoes
contador persistente
logs de broadcast
auditoria de admin
```

Para observar o funcionamento:

```txt
Browser DevTools > Network > WS > /ws
Cloudflare Dashboard > Workers & Pages > Worker > Logs
wrangler tail
```

## Teste manual

1. Abra a tela publica `index.html`.
2. Abra o DevTools e filtre Network por `WS`.
3. Confirme que existe conexao com `/ws`.
4. Abra `admin.html`.
5. Faca login.
6. Cadastre ou mova uma equipe.
7. A tela publica deve receber mensagem WebSocket e atualizar sem Pusher.

## Segurança atual

O app usa:

```txt
senha admin no Worker secret
cookie HttpOnly, Secure e SameSite=Strict
rotas POST protegidas por sessao
WebSocket publico apenas para receber updates
```

Para producao mais forte, considere:

```txt
rate limit em POST /api/login
validacao de Origin em rotas de escrita
auditoria de acoes admin no storage do Durable Object
Cloudflare Access para proteger o admin
```

## Deploy

Publique com Wrangler a partir da pasta `game` ou usando o comando equivalente do projeto:

```bash
wrangler deploy
```

Depois do deploy, abra a tela publica e o admin em abas separadas para validar o realtime.
