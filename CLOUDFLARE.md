# Desplegar la Bóveda en Cloudflare (Pages + Functions + D1 + Access)

App de gestor de contraseñas **zero-knowledge** con sincronización entre
dispositivos. El cifrado (AES-GCM 256, llave derivada con PBKDF2 310k) ocurre
**en el navegador**; el servidor solo almacena texto cifrado. El login lo
gestiona **Cloudflare Access**.

```
Navegador ──(AES-GCM en cliente)──► Pages Functions ──► D1 (solo ciphertext)
   ▲ master password (nunca sale)          ▲ identidad verificada por Access
```

## Estructura del repo
- `password-manager.html` — la app (frontend). Funciona en **solo-local** si la
  API no existe, y activa **sync** automáticamente cuando `/api/vault` responde.
- `functions/api/vault.js` — API (GET/PUT/DELETE), verifica el JWT de Access.
- `schema.sql` — tabla `vaults` de D1.
- `wrangler.toml` — bindings y variables (rellena los valores `REPLACE_…`).

---

## 1. Requisitos
- Cuenta de Cloudflare con **Zero Trust** habilitado (gratis para uso personal).
- `npx wrangler` (ya disponible vía npm; o `npm i -g wrangler`).
- Autenticar la CLI: `npx wrangler login` (en tu máquina local).

## 2. Crear la base de datos D1
```bash
npx wrangler d1 create boveda
```
Copia el `database_id` que imprime y pégalo en `wrangler.toml`
(`[[d1_databases]] … database_id = "…"`).

Aplica el esquema (a la BD remota):
```bash
npx wrangler d1 execute boveda --remote --file=./schema.sql
```

## 3. Crear el proyecto de Pages conectado a Git
En el dashboard: **Workers & Pages → Create → Pages → Connect to Git**, elige el
repo. Configuración de build:
- **Production branch:** `main` (o la rama que prefieras).
- **Framework preset:** `None`
- **Build command:** *(vacío)* — es estático.
- **Build output directory:** `/`

Guarda y despliega. Cloudflare detectará la carpeta `functions/` y publicará la
API en `/api/vault` automáticamente.

## 4. Vincular D1 al proyecto de Pages
En el proyecto de Pages: **Settings → Functions → D1 database bindings → Add**:
- **Variable name:** `DB`
- **D1 database:** `boveda`

(Hazlo para Production y, si usas previews, también para Preview.)

## 5. Variables de entorno
En **Settings → Environment variables** del proyecto de Pages, añade:
- `ACCESS_TEAM_DOMAIN` = `https://TUEQUIPO.cloudflareaccess.com`
- `ACCESS_AUD` = *(el AUD de la app de Access; se obtiene en el paso 6)*

## 6. Proteger el sitio con Cloudflare Access
En **Zero Trust → Access → Applications → Add an application → Self-hosted**:
- **Application domain:** el dominio de tu Pages (p. ej.
  `boveda.pages.dev`, o tu dominio propio). Cubre la ruta `/` (todo el sitio,
  incluida `/api/*`).
- **Identity providers:** elige los que quieras (Google, GitHub, One-time PIN
  por email, etc.).
- **Policies:** crea una política *Allow* que limite quién entra (p. ej. tu
  email, o un dominio de correo).
- Tras crearla, abre la app en Access y copia el **Application Audience (AUD)
  Tag** → pégalo en la variable `ACCESS_AUD` (paso 5).

> La identidad de Access (tu email) es la **clave de cuenta**: tu bóveda se
> guarda bajo ese identificador. La **contraseña maestra** es independiente y es
> la que descifra el contenido — Access nunca la ve.

## 7. Redesplegar
Tras fijar las variables y el binding, lanza un nuevo deploy
(**Deployments → Retry deployment**, o haz un push). Listo:
```
https://TU-PROYECTO.pages.dev/password-manager.html
```

---

## Verificación rápida
- Abre la app: Access te pedirá login. Tras entrar, verás la pantalla de
  contraseña maestra y el indicador **“sincronizado”** (punto verde).
- Crea una entrada. En otro dispositivo/navegador, entra (mismo login de Access
  + misma contraseña maestra) → debe aparecer la misma bóveda.
- El botón **“sincronizar ahora”** fuerza un pull+merge.

## Modelo de seguridad (resumen honesto)
- El servidor y D1 **solo ven ciphertext**. Sin la contraseña maestra, el blob
  es inútil. No hay forma de recuperar la contraseña maestra si la pierdes.
- Access controla **quién puede llegar** a la app y a la API (autenticación),
  pero no descifra nada.
- Conflictos: se resuelve por **fusión a nivel de entrada** (last-write-wins por
  `updatedAt`) con *tombstones* para borrados, usando control de versión
  optimista en D1 (reintenta en 409).
- Límite por bóveda: 2 MB de ciphertext.
- No protege frente a un dispositivo comprometido (keyloggers, extensiones
  maliciosas). Para uso personal es sólido; no sustituye a un gestor auditado.

## Desarrollo local
```bash
npx wrangler pages dev . --d1 DB=boveda
```
Nota: en local no hay Access, así que `identify()` devolverá 401 salvo que
ajustes las variables/cabeceras. Para probar solo el frontend en modo
solo-local, abre el HTML por cualquier servidor estático.
