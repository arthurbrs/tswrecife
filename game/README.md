# Placar Game Cloudflare

Versao Cloudflare do placar animado. O app usa Worker para servir frontend/API, KV para persistir equipes e Durable Objects com WebSocket para transmitir atualizacoes em tempo real.

## Arquitetura

```txt
Browser
  -> HTML/CSS/JS servidos pelo Worker assets
  -> REST API /api/* no Worker
  -> WebSocket /ws no Durable Object

Worker
  -> PLACAR_KV para salvar equipes
  -> PLACAR_ROOM Durable Object para broadcast realtime
```

## Responsabilidade de cada recurso

```txt
KV
  Banco de dados simples das equipes e etapas.

Durable Object
  Transmissor em tempo real. Mantem conexoes WebSocket vivas em memoria e envia broadcast para as telas abertas.

Worker
  Serve arquivos estaticos, autentica admin, escreve no KV e avisa o Durable Object apos cada alteracao.
```

O Durable Object nao substitui o KV neste desenho. Ele nao grava registros persistentes por padrao; por isso e normal nao ver itens ou historico dentro dele no painel.

## Configuracao do Wrangler

O `wrangler.json` precisa ter:

```json
{
  "kv_namespaces": [
    {
      "binding": "PLACAR_KV",
      "id": "ID_DO_NAMESPACE"
    }
  ],
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

No Workers Free plan, use `new_sqlite_classes`. Nao precisa D1 e nao precisa do backend key-value antigo do Durable Objects.

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

`/ws` abre uma conexao WebSocket no Durable Object. Quando o admin altera algo, o Worker grava no KV e chama o Durable Object para enviar:

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

E normal o Durable Object nao mostrar registros persistentes.

Hoje ele guarda apenas sockets em memoria:

```txt
conexoes WebSocket abertas
broadcasts em tempo real
cleanup ao desconectar
```

Ele nao grava:

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
KV > chave placar-game:teams
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
auditoria de acoes admin no KV
Cloudflare Access para proteger o admin
```

## Deploy

Publique com Wrangler a partir da pasta `game` ou usando o comando equivalente do projeto:

```bash
wrangler deploy
```

Depois do deploy, abra a tela publica e o admin em abas separadas para validar o realtime.
