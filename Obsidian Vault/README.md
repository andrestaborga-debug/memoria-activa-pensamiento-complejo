# Vault de Obsidian — Memoria Activa del Pensamiento Complejo

Esta carpeta es un **vault de Obsidian** generado a partir del corpus HTML del repositorio. Es una vista paralela: los HTMLs siguen siendo el artefacto publicable; el vault es para **explorar la red de conceptos** (vista de grafo) y **editar/extender el corpus** en markdown.

## Cómo abrirlo

1. Instalá [Obsidian](https://obsidian.md) (gratis, multiplataforma).
2. Al abrir Obsidian → *Open folder as vault* → seleccioná esta carpeta `Obsidian Vault/`.
3. Empezá por la nota **`00 - Memoria Activa`** (es la portada del vault).
4. Abrí la vista de grafo con `Cmd/Ctrl+G` para ver la red de los conceptos.

## Qué hay adentro

```
Obsidian Vault/
├── 00 - Memoria Activa.md     ← portada / MOC principal
├── Conceptos/                  ← 91 fichas del Glosario
├── Obras/                      ← 19 fichas de obra del Índice
├── Tradiciones/                ← 10 MOCs (uno por tradición)
├── Ejes/                       ← 7 MOCs (uno por eje del Índice)
├── Temas/                      ← 18 MOCs (uno por tema transversal)
└── .obsidian/                  ← config mínima del vault
```

Cada ficha de concepto tiene:
- **frontmatter** YAML con metadata (autor, tradición, tema, fuente)
- **esencia, explicación, cita literal**
- **referencias cruzadas** como wikilinks `[[Otra ficha]]`

## Generación

El vault se genera con `scripts/build_vault.py` desde los HTMLs. Si editás el HTML, podés regenerar el vault corriendo el script (sobreescribe esta carpeta).

**Importante:** este es un vault paralelo, no sincronizado. Si editás aquí, los cambios **no** se reflejan en los HTMLs. Si querés que el vault sea la fuente única, hay que escribir el camino inverso (vault → HTML), que no está hecho.

## Convenciones

- Filename de ficha = el término (con tildes), sanitizado para filesystems.
- Wikilinks resuelven por filename: `[[Antropo-ética]]`.
- El `slug` original (e.g. `antropo-etica`) está en `aliases:` del frontmatter, así que también funciona como wikilink.
- Tags estructurales: `concepto`, `obra`, `MOC`, `tradicion/<id>`, `tema/<slug>`, `eje/<num>`.
