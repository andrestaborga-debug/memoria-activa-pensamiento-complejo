# Memoria Activa del Pensamiento Complejo

Cartografía navegable de la obra de **Edgar Morin** y de trece autores afines en diálogo con *El Método*. Reúne en un mismo lugar la tradición de la complejidad y sus líneas vivas: cibernética de segundo orden, autopoiesis, cognición encarnada, mente predictiva, teorías de la consciencia, panpsiquismo, termodinámica del no-equilibrio, metafísica del proceso y complejidad social latinoamericana.

Material de referencia desarrollado en el marco del taller **TRAMA** (Andrés Taborga). Construido iterativamente con asistencia de Claude (Anthropic).

## Contenido

### 📍 Punto de entrada — `Indice_Memoria_Activa.html`

Mapa del corpus: **19 fichas** de obra agrupadas en **7 ejes temáticos**, cada una con tesis central, conceptos clave y puentes con otras tradiciones. Cierra con una **Constelación de puentes** que cruza transversalmente el corpus.

### 📖 Glosario unificado — `Glosario - Pensamiento Complejo.html`

**91 entradas** del corpus completo en un solo documento navegable, con interfaz de acordeón:

| Tradición | Autores | Entradas |
|---|---|---|
| Morin · *El Método* | Edgar Morin (6 tomos) | 40 |
| Cibernética de 2° orden | Heinz von Foerster | 5 |
| Autopoiesis | Maturana & Varela | 5 |
| Cognición encarnada | Varela/Thompson/Rosch + Merleau-Ponty | 10 |
| Mente predictiva | Andy Clark + Karl Friston | 5 |
| Información integrada | Giulio Tononi | 2 |
| Panpsiquismo & identidad | Arnold Zuboff + William Seager (ed.) | 4 |
| Termodinámica del orden | Stuart Kauffman + Prigogine & Stengers | 10 |
| Metafísica del proceso | Alfred North Whitehead | 5 |
| Complejidad social | Sotolongo & Delgado | 5 |

Cada entrada incluye:
- **Esencia** en una oración
- **Explicación** de tres párrafos
- **Cita literal verificada** del libro fuente (con link a la página exacta del PDF cuando hay copia local disponible)
- **Referencias cruzadas** a otros conceptos del corpus

Vistas disponibles: alfabética · por tradición · por autor · por tema. Búsqueda en vivo sobre todo el contenido.

### Materiales adicionales

- `Morin_MetodoI_Diagrams_EN.html` — Diagramas conceptuales del Tomo I de *El Método*
- `Weaving Teams/` — Materiales del taller homónimo (autonomía, dialógico, ecología, emergencia)
- `composicion-compleja-12.html` y variantes — Taller universitario lúdico de 12 sesiones
- `ciencia-compleja.html` — Recorrido jugable por la ciencia compleja

### 🕸️ Vault de Obsidian — `Obsidian Vault/`

Versión paralela del corpus en formato [Obsidian](https://obsidian.md): las 91 fichas del Glosario + 19 fichas de obra del Índice, cada una en su archivo markdown con frontmatter, referencias cruzadas resueltas como `[[wikilinks]]`, y MOCs por tradición / eje / tema. Pensado para **explorar la red de conceptos** (vista de grafo) y **editar/extender el corpus** cómodamente.

Para abrirlo: instalá Obsidian → *Open folder as vault* → seleccioná `Obsidian Vault/`. Empezá por la nota `00 - Memoria Activa`.

Es un **derivado** del HTML, no la fuente: si editás el vault, los cambios no se reflejan en los HTMLs. Para regenerar el vault desde los HTMLs:

```bash
python3 scripts/build_vault.py
```

Ver `Obsidian Vault/README.md` para más detalles.

## Uso

Abrir cualquier `.html` directamente en un navegador (doble click). Todo es estático, sin dependencias externas. Funciona offline.

### Para activar los chapter-links del Glosario

El Glosario incluye links que abren los libros fuente en la página exacta de cada cita (`Cap. II — La organización de lo vivo ↗`). **Esos links no están incluidos en el repositorio por razones de copyright.** Para activarlos en tu copia local, creá una carpeta `Biblioteca/` junto a los HTMLs y colocá ahí tus copias propias de los libros con los nombres exactos esperados:

```
Memoria Activa del Pensamiento Complejo/
├── Glosario - Pensamiento Complejo.html
├── Indice_Memoria_Activa.html
└── Biblioteca/
    ├── Maturana, Varela - El Arbol del Conocimiento (1984).pdf
    ├── Varela, Thompson, Rosch - The Embodied Mind (1991).pdf
    ├── Heinz von Foerster, On Constructing a Reality.pdf
    ├── ... etc.
```

Los nombres exactos están codificados en cada entrada del glosario (ver `source` field). Sin la `Biblioteca/`, todo el resto del glosario funciona normal: los textos, citas, referencias cruzadas y búsqueda no requieren los PDFs.

## Construcción

Las 91 entradas se construyeron extrayendo citas literales de los textos fuente:

- **EPUBs y PDFs con OCR**: `pdftotext` extrae el texto, búsqueda de pasajes canónicos, transcripción verificada
- **PDFs sin OCR**: pipeline `pdftoppm` (300 DPI) → Tesseract OCR (eng/spa) → texto extraído por página, después misma transcripción

Cada entrada cita su capítulo y página. Para los libros con OCR válido, el link del campo *source* abre el PDF en la página exacta.

## Licencia

El **material derivado original** (HTMLs, glosario, índice, README, materiales del taller) se publica bajo **[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)**. Sos libre de copiar, modificar y redistribuir, incluso comercialmente, siempre que: (a) atribuyas la obra a Andrés Taborga + colaboración con Claude, y (b) compartas tus derivados bajo la misma licencia. Ver `LICENSE` para el texto completo.

Las **citas textuales** de cada autor pertenecen a sus respectivos editores y se reproducen aquí como uso citativo académico bajo derecho de cita. La licencia CC BY-SA 4.0 cubre el material de este repositorio, no las obras citadas.

---

*"Reality = Community. Act always so as to increase the number of choices."* — Heinz von Foerster
