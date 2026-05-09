# Nebula Defense — Godot 4 (Android)

Versión Godot del juego, pensada para empaquetar como APK. Mismas mecánicas
que la versión web (`/tower-defense/`), pero con motor de juego, shaders,
luces 2D, soporte de sprites animados y export nativo a Android.

## Requisitos

- **Godot 4.2** o superior (gratuito, open source) — https://godotengine.org/download
- Para exportar APK:
  - **Android Studio** (solo para tener el SDK + JDK; no hace falta usar el IDE)
  - O bien: **Command-line tools** del Android SDK + **JDK 17**
  - **Templates de export de Android** desde el Godot Editor (Editor → Manage Export Templates)

## Abrir el proyecto

```bash
godot --path godot
# o desde el editor: Project Manager → Import → seleccionar godot/project.godot
```

Escena principal: `scenes/MainMenu.tscn`. Apretá *Play* (F5) y arrancás.

## Estructura

```
godot/
├── project.godot              ← config del proyecto (orientación landscape, mobile renderer)
├── icon.svg                   ← ícono de la app
├── scenes/                    ← .tscn (escenas/prefabs)
│   ├── MainMenu.tscn
│   ├── Game.tscn              ← escena principal del juego
│   ├── Tower.tscn / Enemy.tscn / Projectile.tscn / BeamFX.tscn
├── scripts/
│   ├── globals/
│   │   ├── GameData.gd        ← AUTOLOAD: torres/enemigos/mapas/oleadas
│   │   └── SaveManager.gd     ← AUTOLOAD: persistencia (user://save.cfg)
│   ├── data/
│   │   ├── TowerData.gd       ← Resource — define una torre + su ladder de mejoras
│   │   ├── EnemyData.gd       ← Resource — define un enemigo
│   │   └── MapData.gd         ← Resource — define un mapa con sus paths
│   ├── Game.gd                ← controlador top-level
│   ├── HUD.gd                 ← UI mobile (top bar / bottom sheets / overlays)
│   ├── MainMenu.gd            ← selector de mapa
│   ├── Tower.gd / Enemy.gd / Projectile.gd / BeamFX.gd
│   ├── PathStrokes.gd         ← dibuja los caminos de las oleadas
│   ├── PlacementPreview.gd    ← preview "fantasma" mientras colocás torre
│   └── ExplosionFX.gd
└── assets/
    ├── sprites/towers/        ← sprites generados con SD van acá
    ├── sprites/enemies/
    ├── sprites/ui/
    ├── audio/
    └── shaders/
```

## Reemplazar placeholders por sprites de Stable Diffusion

Por default, las torres y enemigos se dibujan **proceduralmente** (formas
con código + glow via `PointLight2D`). Para reemplazarlos por sprites:

### Para una torre (ejemplo: pulse cannon)

1. Generá en SD dos PNGs (256×256 sugerido, fondo transparente):
   - `pulse_base.png` — la base/torreta (estática, top-down)
   - `pulse_turret.png` — el cañón (apunta hacia la **derecha** en la imagen)
2. Copialos a `godot/assets/sprites/towers/`
3. Abrí `scripts/globals/GameData.gd` y editá la entrada `pulse`:
   ```gdscript
   "sprite_path": "res://assets/sprites/towers/pulse_base.png",
   "turret_sprite_path": "res://assets/sprites/towers/pulse_turret.png",
   ```
4. Listo. El script detecta el sprite y desactiva el render procedural.

### Para un enemigo animado (ejemplo: drone)

1. Generá un sprite-sheet en SD (4–8 frames, mismo tamaño cada uno).
2. En Godot: `assets/sprites/enemies/drone_walk.png` → click derecho → New
   `SpriteFrames`. Configurá la animación llamada **`walk`** con esos frames
   y guardala como `assets/sprites/enemies/drone.tres`.
3. Editá `GameData.gd`, entrada `drone`:
   ```gdscript
   "animated": true,
   "frames_path": "res://assets/sprites/enemies/drone.tres",
   ```

### Para un sprite estático (sin animación)

```gdscript
"sprite_path": "res://assets/sprites/enemies/striker.png",
```

### Convenciones de tamaño (sugerencia)

| Tipo            | Tamaño base | Notas                               |
|-----------------|-------------|-------------------------------------|
| Torre (base)    | 256×256     | top-down, hueco para girar el cañón |
| Torre (cañón)   | 256×256     | apunta a la derecha                 |
| Drone / Striker | 128×128     | top-down                            |
| Carrier         | 192×192     |                                     |
| Juggernaut      | 256×256     | armor visible                       |
| Behemoth        | 384×384     | jefe final                          |

Sugerencia de prompt SD para coherencia visual:
> *top-down sci-fi tower defense {tower/enemy} sprite, neon glow, dark
> background, transparent PNG, isolated, 90° aerial view, 256x256*

## Exportar a Android

### Una sola vez

1. **Templates**: Editor → *Project* → *Manage Export Templates* → *Download
   and Install* la versión que coincida con tu Godot.
2. **Android SDK**:
   - *Android Studio* → SDK Manager → Platform-Tools, Build-Tools, NDK,
     Cmdline Tools.
   - O bien `cmdline-tools` standalone + `sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34"`.
3. **JDK 17** instalado. Apuntá `JAVA_HOME` si hace falta.
4. **Editor → Editor Settings → Export → Android**: seteá las rutas de
   `Android SDK Path`, `Android Debug Keystore` (Godot puede generarlo),
   `Java SDK Path`.

### Cada export

1. *Project → Export → Add → Android*.
2. Apretá **Export Project** → guarda como `nebula-defense.apk`.
3. Con el cable USB y *USB debugging* activo:
   ```bash
   adb install -r nebula-defense.apk
   ```
4. O bien usá *One-click deploy* desde Godot (botón con un Android icon
   en la barra superior).

Para **release** (Play Store), generá un keystore y configuralo en el
preset (sección Keystore / Release). Después exportá como `.aab`.

## Iterar rápido en desktop

```bash
cd godot
godot               # abre el editor
# o
godot --path . scenes/MainMenu.tscn   # corre la escena directo
```

Touch funciona con el mouse (config en `project.godot`:
`pointing/emulate_touch_from_mouse=true`).

## Estado actual / TODOs

- ✅ 3 mapas, 6 torres con 3 mejoras cada una, 7 enemigos, 20 oleadas
- ✅ Touch input, HUD bottom-sheet, save de progreso
- ✅ Glow lights, beam/chain/rail FX, partículas de explosión
- ✅ Render procedural con fallback automático a sprite si está provisto
- ⏳ Sprites reales (los reemplazás cuando los generes)
- ⏳ Audio (SFX de disparo / explosión / música) — carpeta `assets/audio/`
- ⏳ Shaders avanzados (bloom, distortion) — bases listas en `assets/shaders/`
- ⏳ Tutorial / onboarding

## Licencia

Mismo CC BY-SA 4.0 que el resto del repo.
