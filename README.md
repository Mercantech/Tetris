# Battle Tetris

Multiplayer **Battle Tetris** med WebSocket, PIN-lobbies og Arduino Oplà-controller-API. Designet til hosting under Games-portalen på Mercantec.

## Live

- **Prod (via Games):** [https://games.mercantec.tech/Tetris/](https://games.mercantec.tech/Tetris/)
- **Health:** `GET /api/health` → `{ "ok": true, "service": "tetris" }`

## Sådan spiller du

1. Opret en lobby via **«Opret ny lobby»** på forsiden eller **Admin**.
2. Del **PIN** med de andre spillere.
3. Alle joiner med PIN + valgfrit navn.
4. Tryk **Start spil** – sidste spiller i live vinder (eller højeste score ved samtidig game over).

### Battle-regler

- 10×20 gitter per spiller, 7-bag randomizer (I, O, T, S, Z, J, L).
- Linjer sendt som **skrald** til tilfældige levende modstandere (hul i tilfældig kolonne):
  - 1 linje → 0 rækker
  - 2 linjer → 1 række
  - 3 linjer → 2 rækker
  - 4 linjer (Tetris) → 4 rækker

## Tastatur

| Tast | Handling |
|------|----------|
| Pil / WASD | Flyt (ned = soft drop) |
| Op / X | Roter med uret |
| Mellemrum | Hard drop |
| C | Hold |

## Arduino Oplà

Sæt firmware til **`GAME_MODE_TETRIS`** og brug controller-API’et (samme mønster som Bomberman):

| Endpoint | Beskrivelse |
|----------|-------------|
| `POST /api/controller/join` | `{ "pin", "name?", "deviceId?" }` → `{ "ok", "playerId", "name" }` |
| `POST /api/controller/heartbeat` | `{ "pin", "playerId", "deviceId?" }` |
| `POST /api/controller/action` | `{ "pin", "playerId", "action", "params?" }` |

**Actions:** `move` + `params.direction` (`LEFT` \| `RIGHT` \| `DOWN`), `rotate`, `hardDrop`, `hold`.

## Lokal udvikling

```bash
cd server
npm install
npm run dev
```

Åbn [http://localhost:8080](http://localhost:8080).

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Web på [http://localhost:8090](http://localhost:8090).

## Admin

- `GET /api/admin/lobbies` – list lobbies
- `POST /api/admin/lobbies` – opret (valgfri `{ "pin" }`)
- `DELETE /api/admin/lobbies/:pin` – slet lobby

Admin-UI: `/admin.html`

## Sti-prefix

Frontend og WebSocket understøtter path-prefix **`/Tetris`** (trailing slash på index), som på `games.mercantec.tech`.
