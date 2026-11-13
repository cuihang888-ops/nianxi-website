# Anheli courtyard protocol v1

This is an independent Node ESM presence service. It keeps all visitor state in memory and does not use the historical mall databases. A restart clears rooms, sessions, wishes, and tea invitations. There is no chat, free text, fortune prediction, payment, or account endpoint.

## Connection

The default address is `http://127.0.0.1:4107`; WebSocket address `ws://127.0.0.1:4107/ws`. Only six server-defined rooms exist: `bamboo`, `lotus`, `moon`, `cedar`, `stillwater`, and `cloud`. Each holds at most 24 connected people. Counts represent actual connected sessions.

1. Browser sends `POST /session`, `Content-Type: application/json`, body `{}` or `{"resumeToken":"previous secret"}`. It must include an allowlisted browser Origin.
2. Success returns `{token,tokenExpiresAt,resumeToken,visitor:{id,nickname},rooms,serverTime}`. Store the resume token locally; never put either token in URLs, analytics, or logs. `token` is a single-use connection ticket valid for 60 seconds. The resume token retains the anonymous identity, nickname, last room and position for 30 minutes after disconnect, and is valid only for the Origin that created it.
3. Open `/ws` from the same Origin; within five seconds send `{"type":"auth","token":"ticket","roomId":"bamboo"}`. Omit `roomId` to resume the previous courtyard.
4. The server sends `joined` below. A new connection for the same session closes its old connection with code `4001`. A browser should not automatically reconnect an old tab after this close code.
5. For a broken connection, request a fresh `/session` ticket using the stored resume token, then repeat the handshake. A rejected resume token requires a fresh anonymous session. A full room returns `room_full` and an updated room list. Choose another room and request another ticket.

The server generates IDs and nicknames. The client never supplies its own ID, nickname, room count, timestamps, lantern position, or accepted tea state. An unknown or wrong-Origin resume token returns HTTP 401. Requesting another ticket invalidates an outstanding ticket for that same session.

```json
{
  "type": "joined",
  "protocolVersion": 1,
  "selfId": "v_example",
  "resumeToken": "secret",
  "roomId": "bamboo",
  "rooms": [
    {"id":"bamboo","name":"竹影庭","englishName":"Bamboo court","count":1,"capacity":24}
  ],
  "snapshot": {
    "type":"state",
    "roomId":"bamboo",
    "serverTime":1794528000000,
    "players":[{"id":"v_example","nickname":"竹听客12345","x":0,"z":6,"yaw":0,"action":"idle"}],
    "lanterns":[],
    "teas":[]
  }
}
```

## Client messages

| Message | Fields and rules |
| --- | --- |
| `move` | `{type:"move",x,z,yaw,action}`. All coordinates must be finite JSON numbers; x is clamped to `[-50,50]`, z to `[-32,68]`, covering the courtyard, valley farm and forest. Yaw is normalized to radians `[-pi,pi]`. Allowed actions: `idle`, `walk`, `bow`, `sit`, `woodfish`, `beads`. Send at most 20 times per second. |
| `room.join` | `{type:"room.join",roomId}`. Uses an existing room ID. Success sends `joined` again. A full room keeps the current room. Changing rooms has a one-second cooldown, cancels pending tea, and places the visitor at x=0,z=6. |
| `lantern` | `{type:"lantern",wish}`. Allowed wishes: `peace`, `family`, `health`, `study`, `prosperity`, `gratitude`. No text. One per visitor every five seconds, at most 24 active per room, two-minute lifetime. Position is taken from the authoritative visitor state. |
| `tea.invite` | `{type:"tea.invite",targetId}`. Recipient must be another connected person in the same room within 12 world units. Both people must be free of any pending tea invitation. Inviter has a five-second cooldown. |
| `tea.reply` | `{type:"tea.reply",invitationId,accept:true}` or `accept:false`. Only the invited person may answer, within 20 seconds. An invitation never moves anyone or changes their action. |
| `ping` | `{type:"ping"}`. Optional application keepalive; server replies `pong` with `serverTime`. The WebSocket ping/pong heartbeat also operates automatically. |

All message objects are strict: unexpected keys, binary messages, invalid values, and unknown message types are rejected. Do not send a self ID in `move`.

## Server messages

Each occupied room receives `state` approximately every 100 ms. Render actual players from its `players` array and interpolate positions between snapshots. `joined.snapshot` supplies the initial state immediately. Every state also includes the current six-entry `rooms` list so the courtyard selector uses live occupancy. Do not create synthetic online people.

```json
{
  "type":"state",
  "roomId":"bamboo",
  "serverTime":1794528000000,
  "players":[{"id":"v_example","nickname":"竹听客12345","x":0,"z":6,"yaw":0,"action":"sit"}],
  "lanterns":[{"id":"l_example","ownerId":"v_example","wish":"peace","x":0,"z":6,"createdAt":1794528000000,"expiresAt":1794528120000}],
  "teas":[{"id":"t_example","fromId":"v_example","toId":"v_friend","createdAt":1794528000000,"expiresAt":1794528008000}]
}
```

Events can trigger immediate animations. State snapshots remain the source of truth:

- `lantern.created`: `{type,lantern,serverTime}`. `lantern` has the shape above.
- `tea.pending`: `{type,invitation}` to the inviter.
- `tea.invitation`: `{type,invitation}` to the recipient. Show accept and decline controls; do not auto-accept.
- `invitation`: `{id,fromId,fromNickname,toId,toNickname,roomId,createdAt,expiresAt}`.
- `tea.result`: `{type,invitationId,fromId,toId,status,serverTime}` to both people. Status is `accepted`, `declined`, `expired`, or `cancelled`. Room changes, disconnects, and session replacement cancel pending invitations.
- `tea.shared`: `{type,tea,serverTime}` to the whole room, only after the recipient explicitly accepts. The `tea` object remains in snapshots for eight seconds so nearby people see the same event. Do not automatically move either avatar.
- `error`: `{type:"error",code,message,rooms?}`. The `rooms` field appears for a full room; use code for localization. Eight malformed messages close a connection with 1008.
- `pong`: `{type:"pong",serverTime}`.

Disconnection removes the person from room presence immediately. The resume session remains private in memory for reconnection. Lanterns and accepted tea are ephemeral shared events and can outlive a visitor's connection until their normal expiration.

## HTTP and deployment

- `GET /health`: `{ok,service,protocolVersion,rooms,visitors,serverTime}`. No secret or session information.
- `GET /rooms`: `{rooms,serverTime}`. The room list uses the shape shown above.
- `POST /session`: session issuance; 12 requests/minute per source IP by default. The service caps outstanding anonymous sessions at 4,000 and WebSocket connections at 256. There is no cookie authentication.
- All HTTP results are `Cache-Control: no-store`. JSON bodies are limited to 1 KiB, WebSocket messages to 2 KiB. Per connection the overall rate is 40 messages/second, burst 60; movement has a separate rate of 20/second, burst 24.
- WebSocket transport heartbeats run every 15 seconds. A peer that misses pong by the next heartbeat is terminated and detached. Unauthenticated sockets close after five seconds.
- Defaults allow the exact localhost / 127.0.0.1 origins on ports 5173, 4173, and 3002. Set `ANHELI_ALLOWED_ORIGINS` to a comma-separated exact list for any other frontend. Wildcards and `null` origins are unsupported.
- Use `ANHELI_PORT` to change port; `ANHELI_HOST` changes host. Keep the default loopback binding behind the frontend/reverse proxy for production. Serve production traffic over HTTPS/WSS.
- If a trusted local reverse proxy forwards requests, optionally set `ANHELI_TRUST_PROXY=1` so session limits use the first `X-Forwarded-For` address. Only loopback proxy connections are eligible. The proxy must overwrite, not append untrusted visitor-supplied forwarding headers.
- A path prefix such as `/courtyard-api` must be removed by the proxy before requests reach this service. WebSocket upgrade headers must be preserved. `/ws` must have no query string; tickets belong in the first auth message.

Run from the workspace root after installing the root `ws` dependency:

```powershell
$env:ANHELI_ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173'
node service/server.mjs
node --test service/service.test.mjs
```

The exported async `createCourtyardServer(options)` starts a server and returns `{httpServer,host,port,close}`. Tests use port 0 to obtain an available loopback port and can shorten invitation / heartbeat / expiry intervals without changing production defaults.

The browser connector `src/presence.js` clears an expired resume token on HTTP 401 and immediately requests a new anonymous session. It retries authentication in an available courtyard when the preferred one fills before the handshake completes, and changes its remembered courtyard only after `joined`. Close code 4001 sets terminal status `replaced` and stops automatic reconnecting so two tabs do not repeatedly take the same session from each other. Its error callbacks preserve the service `code` and `message`, and add `messageKey`, `messageZh`, and `messageEn` for UI localization. The optional second connector argument supplies browser APIs for tests; the production default is `globalThis`.
