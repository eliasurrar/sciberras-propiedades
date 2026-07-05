# real-estate — Log de Sesiones

## [2026-05-10] Session — Bootstrap wiki operacional
- Wiki inicializada con contexto de MEMORY.md
- Sin cambios al código

## [2026-06-02] Session - Modernizacion v2 + Lightbox + QA completo

### CSS styles.css v23
- Paleta: primary slash-deep #1a2744 (antes azul electrico)
- Brand gradient nuevo en .brand-mark
- Cards border-radius 20px, hover scale(1.005)
- Bento border-radius 22-24px
- Touch targets: currency min-height 36px, operation min-height 40px
- Detail dialog fullscreen mobile: position fixed inset 0 height 100dvh
- Sticky header is-scrolled shadow via JS
- Nav mobile glassmorphism backdrop-filter
- Hero mobile clamp(44px, 8vw, 80px)
- Footer surface-alt mas rico
- gallery-stage img cursor zoom-in (hint lightbox)

### JS app.js v17
- Sticky header scroll shadow (rAF passive)
- Photo Lightbox: overlay fullscreen al click en foto del stage
  - Swipe horizontal swipe-left/right navega, no interfiere scroll
  - ESC cierra, ArrowLeft/Right navega
  - Safe areas iPhone 15 Pro
  - Counter pill "1 / 15"
  - Fade opacity en carga
  - Solo fotos (no videos)
  - window._lightbox expuesto para debug

### index.html
- Fix: apple-mobile-web-app-capable -> mobile-web-app-capable

### Bugs corregidos
- Deprecation warning meta PWA -> fixeado
- Touch targets < 36px currency/operation -> fixeados
- Lightbox no existia -> implementado

### QA final
- 0 errores JS en consola
- 0 overflow-x
- Lightbox verificado: open, counter 1/15, nav, ESC cierra

## [2026-07-04] Session — Fix solape badges tipo/comuna en bento cards

**Problema (reportado por Elias con screenshot):** en la 1ª tarjeta destacada
grande, el badge de comuna "📍 Quillota" se montaba sobre el badge de tipo
"CASA" (esquina superior izquierda).

**Causa raíz:** las bento cards fijan su contenido abajo con
`justify-content: flex-end`. Los badges de tipo/operación son `position:absolute`
arriba. Cuando el body (commune-badge + título + amenities + precio) es tan alto
como la tarjeta —caso de las variantes `--feature` y `--wide`, y de cualquier
card en móvil donde la tipografía agrandada del feature infla el body— su borde
superior sube hasta la banda de los badges flotantes → solape. Reproducido con
Playwright idéntico en Chromium y WebKit: overlap 40.3×13.6px en móvil (feature)
y 83.5×7.1px en tablet/desktop (wide). NO era solo móvil.

**Fix estructural (no whack-a-mole de min-height):** en `docs/css/styles.css`
- `.bento-card`: `padding: 46px 0 0` — reserva banda superior para los badges.
- `.bento-body`: `margin-top: auto` — fija el contenido abajo, debajo de la banda.
- `.bento-card--feature`: `padding-top: 52px` (badge band un poco mayor).
- `@media (max-width:600px)`: baja título/precio del feature a 22/19px (la
  tipografía agrandada era lo que inflaba el body en columna única).
Los badges absolutos y `.bento-img` (inset:0) se posicionan respecto al *padding
box*, así que el padding no los desplaza ni recorta la foto — solo pone piso al
flex body.

**Verificación:** audit Playwright 3 cards × {390,768,1280}px × {Chromium,WebKit}
= 0 colisiones (tipo/comuna, op/comuna, tipo/op) y 0 precios recortados.
Screenshot element-level confirma "CASA" / "ARRIENDO" arriba y "Quillota" con
gap limpio debajo. Commit 6ff6b8c pusheado a main (GitHub Pages).

### [2026-07-04] Follow-up: badges en una sola línea (rediseño, no separación)

Elias seguía viendo el solape y pidió explícitamente el layout final:
**tipo · ubicación · operación en una sola línea arriba**. El fix anterior
(reservar banda + margin-top:auto) evitaba el solape pero dejaba la comuna
adentro del cuerpo — no era lo que quería.

**Rediseño:** los 3 badges ahora viven en una barra flex `.badge-bar`
posicionada sobre la foto (`position:absolute; top/left/right:14px`). Dentro
de la barra los badges pasan a `position:static` y fluyen en fila: tipo +
comuna a la izquierda, `operation-badge` empujado a la derecha con
`margin-left:auto`. La comuna se sacó del `.bento-body`/`.card-body` (el
detalle en `renderDetail` la sigue usando aparte, no se tocó). Comuna con
glass blanco + ellipsis por si el nombre es largo. `pointer-events:none` en
la barra (auto en los hijos) para no romper el click que abre la tarjeta.

Cambios: `docs/js/app.js` (bentoHtml + cardHtml) y `docs/css/styles.css`
(nuevo bloque `.badge-bar`). El fix estructural previo (padding-top +
margin-top:auto) quedó — es inocuo y refuerza el piso del body.

**Verificación:** 6 tarjetas × {390,768,1280}px × {Chromium,WebKit}: los 3
badges comparten centro vertical idéntico (una línea), 0 solapes, 0 recorte
de comuna. Screenshot element-level confirma "CASA · 📍Quillota · ARRIENDO"
en fila. Commit e5b0e0a → main.

### [2026-07-04] Follow-up: colores badges + alineación operación (commit b39f49a)

Elias pidió: operación a la derecha, tipo+comuna a la izquierda, y colores
tipo=oscuro / operación=terracota / comuna=blanco. **Bug de alineación
encontrado:** `.badge-bar .operation-badge { margin-left:auto }` estaba
ANTES del reset `{ margin:0 }` (misma especificidad) → el reset lo anulaba y
la operación dejaba de irse a la derecha. Fix: mover margin-left:auto DESPUÉS
del reset + reglas de color explícitas dentro de `.badge-bar`. Verificado
Chromium+WebKit: op derecha, colores computados correctos.

### [2026-07-04] Footer logo + refresh de paleta alineada al logo (commit 63ea09e)

**1. Bug footer logo:** el header usa `<img class="brand-mark">` pero el
footer tenía `<span class="brand-mark small">` VACÍO → solo el fondo blanco
translúcido del `.brand-mark`, se veía un cuadradito en blanco en vez del
logo. Fix: cambiar el span por `<img src="brand-mark.png?v=29">` (misma
fuente que el header, verificado natural 144×144 idéntico).

**2. Paleta alineada al logo** — instalé la skill `ui-ux-pro-max`
(plugin nextlevelbuilder, en `~/.hermes/skills/`, BM25 search sobre CSVs,
stdlib pura). Elias: usarla SIEMPRE en tareas de diseño/color.
- Colores del logo MEDIDOS con canvas (no adivinados): navy `#002040`
  dominante + esmeralda `#10d090`. La skill confirmó independientemente que
  Real Estate = trust teal `#0F766E` + `#14B8A6` — misma familia.
- El sitio usaba azul royal `#1e40af`/`#1a2744` sin relación con el logo.
- Cambios: `--primary`→navy `#14233f`; nueva familia verde `--brand-teal
  #0F766E` (texto AA 5.47:1) + `--brand-emerald #10c088` (acentos);
  `--brand-gradient` replica el degradado del logo (navy→teal→esmeralda),
  usado en botón primario y marcador de eyebrow.
- TERRACOTA conservada SOLO para badges de operación (venta/arriendo) y el
  italic del hero — decisión de Elias, mantiene calidez editorial.
- Contraste WCAG verificado: teal/blanco 5.47 (AA), blanco/navy 15.65 (AAA).

**Nota deploy Pages:** los deploys de commits previos (6ff6b8c, b39f49a)
fallaron con "Deployment failed, try again later" (fallo transitorio de
GitHub, NO del código) — de ahí el correo de GitHub a Elias. El rerun o el
commit siguiente siempre desplegó OK. 63ea09e desplegó a la primera.
Procedimiento: `gh run list` → si concl=failure, `gh run rerun <id>`.

### [2026-07-04] Terracota → navy del logo en TODO el sitio (skill ui-ux-pro-max)

Elias pidió que **todos** los acentos terracota (botones/badges/toggles) pasen
a navy del logo, manteniendo el estilo profesional. Revertí la decisión previa
de "conservar terracota para operación + italic del hero".

**Colores del logo re-medidos con PIL** (no adivinados): navy dominante
`#00183c`/`#002040` + esmeralda `#0ccc90`. Elegí navy `#16335c` como acento
(un pelo más claro que el navy del logo para legibilidad AAA como texto/ícono).

**Cambios en `docs/css/styles.css` (15 reemplazos, 0 residuo terracota):**
- Tokens: `--accent` #b46a3a→`#16335c` (navy). Nuevo `--accent-strong #16335c`
  para rellenos con texto blanco (badges/tags). `--accent-soft` #f4e9d9→`#e6edf5`
  (tinte navy claro). Dark: `--accent #7aa2d6` (navy claro AA sobre oscuro) +
  `--accent-strong #274d7d` + `--accent-soft #16273f`.
- Badges operación **ARRIENDO**, `.badge-terreno`, `.offer-tag`, toggle
  Arriendo activo: fondo terracota → `var(--accent-strong)` navy, texto blanco.
- Radiales/placeholders (hero, card-image, bento-fallback) y hover de contact
  cards / amenity icons / has-offer border: terracota rgba → navy/teal rgba.
- Peach `#f4d4b8` de amenity icons en bento → `#bcd4f0` (navy claro).
- El italic del hero ("seleccionadas") usa `--accent` → ahora navy.

**Verificación:** contraste WCAG de todos los pares navy = AAA/AA (light:
12.6:1 texto, 12.6:1 badge blanco/navy; dark: 7.2:1 / 8.6:1). CSS con llaves
balanceadas (395/395). QA en vivo con Playwright (server local :8899): botón
primario = gradiente navy→teal→esmeralda del logo; badge ARRIENDO computado
`rgb(22,51,92)` navy en light y `rgb(39,77,125)` en dark; toggle Arriendo
activo navy; grep de residuo terracota = 0. Screenshots hero+catálogo
confirmados con visión: cero naranjo/terracota en todo el sitio.

**Reversión:** backup `docs/css/styles.css.bak.pre-navy` (borrado tras QA);
`git revert` del commit para volver a la terracota si Elias lo prefiere.
