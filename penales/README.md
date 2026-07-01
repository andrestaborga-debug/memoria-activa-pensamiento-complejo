# Penales — prototipo standalone

Mini-juego de penales online, pensado como prototipo para eventualmente integrarse
a **El Oráculo** (mismo stack: Cloudflare Workers + Durable Objects + D1).

## Reglas

- El arco tiene **5 zonas verticales** iguales (1 a 5), vista frontal.
- En cada tanda: el **pateador** elige 1 zona, el **arquero** elige 2 zonas para tapar.
  Ambas jugadas quedan ocultas hasta que los dos jugaron; recién ahí se revelan y se
  resuelve **gol** (si la zona pateada no está tapada) o **atajada** (si lo está).
- Después de cada tanda **se cambian los roles** (quien pateó pasa a atajar).
- **5 penales por jugador**, con **corte anticipado** si el resultado ya está
  matemáticamente decidido, y **muerte súbita** (tandas de 1 penal alternado) si
  sigue empatado después de los 5.
- Quién patea primero se sortea al azar quien crea/entra a la partida.

## Estructura

- `worker/` — backend en Cloudflare Workers:
  - `src/index.js` — rutas HTTP (`/api/signup`, `/api/login`, `/api/matches`) y
    enrutamiento del WebSocket (`/ws/:code`) hacia la Durable Object de la partida.
  - `src/match.js` — Durable Object `MatchRoom`: arbitra la partida (jugadas ocultas,
    resolución de cada tanda, corte anticipado, muerte súbita).
  - `src/auth.js` — registro/login mínimo (usuario + contraseña con PBKDF2), pensado
    para reemplazarse por las cuentas reales de El Oráculo más adelante.
  - `src/schema.sql` — tablas D1 (`users`, `sessions`, `matches`).
- `public/` — frontend estático (sin build, vanilla JS): `index.html` (login/lobby),
  `juego.html` + `game.js` (pantalla de juego con el arco de 5 zonas y el cliente WebSocket).

## Correr en local

Requiere Node.js (usado: v22) y `wrangler` (se instala on-demand con `npx`).

```bash
cd penales/worker
npm install
npm run db:init      # crea las tablas en la base D1 local (Miniflare)
npm run dev           # wrangler dev --local, sirve el Worker + penales/public en http://localhost:8787
```

Abrí `http://localhost:8787` en dos pestañas o navegadores distintos (o dos perfiles)
para simular a los dos jugadores: registrate con dos usuarios distintos, uno crea la
partida y comparte el código de 6 caracteres, el otro se une con ese código.

## Desplegar a Cloudflare (cuenta real)

⚠️ **Durable Objects requieren el plan Workers Paid** (desde USD 5/mes). El plan
gratuito de Cloudflare Workers no permite usar Durable Objects.

```bash
cd penales/worker
npx wrangler login
npx wrangler d1 create penales-db          # copiar el database_id que devuelve
# pegar ese database_id en wrangler.toml, reemplazando REPLACE_WITH_REAL_D1_DATABASE_ID
npx wrangler d1 execute penales-db --remote --file=./src/schema.sql
npx wrangler deploy
```

## Integración futura con El Oráculo

Lo único acoplado al backend "propio" de este prototipo es `worker/src/auth.js`
(usuario/contraseña + sesión en D1). Para integrarlo:

1. Reemplazar `getUserFromSession` en `auth.js` por una validación contra el sistema
   de cuentas de El Oráculo (o mover esa validación a `index.js` antes de llamar a
   la Durable Object).
2. `match.js` (la lógica del juego) y el frontend (`public/`) no dependen de cómo se
   autentica el usuario — solo necesitan `{ id, username }` — así que se pueden
   reusar tal cual.

## Limitación conocida del prototipo

El estado de cada partida vive en memoria dentro de la Durable Object (no se
persiste en `state.storage`). Si Cloudflare desaloja la Durable Object por
inactividad, la partida en curso se pierde. Para una definición de penales (dura
minutos) esto es aceptable; si se integra a El Oráculo conviene agregar
persistencia con `state.storage.put/get`.
