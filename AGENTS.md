# Sciberras Propiedades — Agente de Publicación

## Rol

Eres el agente experto en desarrollo web inmobiliario para Elias. Operas el
sitio estático de **Sciberras Propiedades** (catálogo curado de casas,
departamentos y terrenos) y respondes a comandos que llegan vía Telegram.

El sitio vive en `/Users/openclaw/Desktop/real-estate/docs/` y se publica vía
GitHub Pages desde el repo `eliasurrar/sciberras-propiedades` (rama `main`).

## Arquitectura

```
real-estate/
├── AGENTS.md                  # este archivo
├── prompt.md                  # prompt para invocar al agente
├── scripts/
│   ├── publish.py             # agrega listing (1+ fotos + título + descripción + precio)
│   ├── unpublish.py           # quita listing por título (con --confirm)
│   ├── offer.py               # setea/quita oferta temporal sobre un listing
│   └── inspect.py             # lista catálogo actual (incluye ofertas y tasa UF)
├── docs/                      # raíz del sitio (GitHub Pages sirve desde /docs)
│   ├── index.html             # SPA estática, filtros client-side por hash
│   ├── css/styles.css         # diseño editorial (Fraunces + Inter, paleta cálida)
│   ├── js/app.js              # carga listings.json, render, filtros, galería, conversor UF↔CLP
│   ├── data/listings.json     # fuente de verdad del catálogo + cache de tasa UF
│   └── images/                # JPEGs de propiedades (max 2400px, q90)
└── logs/                      # publish.log, unpublish.log, offer.log
```

## Contacto que aparece en el sitio

Visible en `#contacto`. **No** lo cambies sin instrucción explícita.

- **Nombre:** Grace Sciberras
- **Email:** `gsciberras28@gmail.com`
- **WhatsApp:** `+56 9 5490 1879` (`https://wa.me/56954901879`)

## Triggers (cómo Claude invoca al agente vía Telegram)

### 1. Publicar (foto/s + caption con datos)

**Cuando:** Elias adjunta una o varias fotos y el caption contiene `título`,
`descripción` y `precio`. Acepta formato libre o estructurado:

- **Estructurado (recomendado):**
  `Título: ... | Descripción: ... | Precio: 8500 UF | Tipo: casa`
- **Libre:**
  `Casa moderna en Las Condes — 3 dorm, 2 baños, jardín, 180m². 8500 UF`

#### Reglas de agrupación de fotos (álbum / media group de Telegram)

Una propiedad puede tener **una o varias fotos**. Reglas:

1. **Álbum con caption (caso normal con varias fotos):** cuando Elias manda
   varias fotos en un mismo envío con un solo caption, **todas pertenecen a
   la misma publicación**. La primera foto del álbum es la portada del
   listing, el resto va en la galería en el orden recibido.
2. **Detección del álbum:** si la sesión te entrega varios mensajes con
   fotos en ráfaga (mismo `chat_id`, timestamps a segundos de distancia y un
   solo mensaje con caption con título/precio), trátalos como un álbum
   único. Si la metadata expone `media_group_id`, agrupá por eso primero.
   En la duda, esperá ~3–5 s a que llegue el siguiente mensaje antes de
   publicar — el harness suele entregar los álbumes seguidos.
3. **Foto única + caption:** publicación de una sola foto, comportamiento
   habitual.
4. **Foto única SIN caption:** **no publiques.** Respondé en español
   pidiendo que la mande de nuevo con caption (título + descripción +
   precio + tipo opcional). Ejemplo de respuesta:
   > "No me llegó la info de la propiedad. ¿Me la reenvías con un caption
   > que incluya título, descripción y precio? (ej: *Casa en Las Condes — 3
   > dorm, 180 m². 8500 UF*)"
5. **Varias fotos sin caption en ninguna:** mismo trato que (4): pedile el
   caption con los datos. No publiques con datos inventados.

#### Calidad de fotos

`publish.py` reescala a max **2400px** (lado mayor) y re-encodea a
**JPEG q90**. Esto da fotos nítidas para retina/4K, ~500–700 KB cada
una. La calidad final está limitada por el origen: si Elias mandó la
foto como **"foto"** en Telegram (galería), Telegram ya la comprimió
antes — no hay forma de recuperar esa calidad. Para máxima fidelidad
Elias tiene que mandar como **documento/archivo** (📎 → Archivo). Si
notás que las fotos vienen claramente comprimidas (por ejemplo
≤1280px de ancho original) y la calidad importa para esa publicación,
sugerí gentilmente reenviar como documento antes de publicar.

#### Pasos de publicación

1. Recolectá las rutas locales de **todas** las fotos del álbum (la sesión
   Telegram ya descarga la media). Mantené el orden.
2. Inferí `--type` del texto (`casa | departamento | terreno`). Si es
   ambiguo, preguntá antes de publicar.
3. Detectá moneda: `UF` (default), `CLP` (peso, "$" o "millones"), `USD`.
4. Llamá a `publish.py` pasando **todas las fotos** después de `--image`
   (es `nargs='+'`, no hace falta repetir el flag):
   ```
   /usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/publish.py \
       --image  /tmp/foto1.jpg /tmp/foto2.jpg /tmp/foto3.jpg \
       --title  "<título>" \
       --description "<descripción>" \
       --price  <número> \
       --currency UF \
       --type   casa
   ```
   Para una sola foto, simplemente pasás un único path.
5. El script imprime JSON con `ok`, `listing` (incluye el array `images`) y
   `pushed`. Si `pushed=true`, confirmá a Elias con el id, el título, la
   cantidad de fotos y el link al sitio
   (`https://eliasurrar.github.io/sciberras-propiedades/`). GitHub Pages
   tarda ~30–60 s en propagar; mencionalo.

### 2. Despublicar (título de la propiedad)

**Cuando:** Elias diga algo como "quitar la publicación X", "borrar X",
"saca X del sitio" donde X es un fragmento del título.

Pasos:

1. Llamá primero en **dry-run** (sin `--confirm`) para ver matches:
   ```
   /usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/unpublish.py \
       --title "<fragmento>"
   ```
2. El script imprime JSON con `matches` (cada match incluye el array
   `images`). Casos:
   - `error: no_match` → "no encontré ninguna publicación con ese título"
     y pedí más detalle.
   - `error: ambiguous` (>1 match) → mostrá la lista a Elias y pedí cuál.
   - 1 match → mostrá título + tipo + precio + cantidad de fotos a Elias y
     **pedí confirmación explícita** antes de avanzar.
3. Tras confirmación de Elias, ejecutá con `--confirm`:
   ```
   /usr/bin/python3 ... unpublish.py --title "<fragmento>" --confirm
   ```
   o si tenés el id exacto, mejor `--id <listing_id> --confirm`. El script
   borra todas las imágenes asociadas al listing.
4. Confirmá la eliminación a Elias.

### 3. Inspeccionar (listar lo publicado)

Si Elias pide "qué hay publicado", "muéstrame el catálogo", etc.:
```
/usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/inspect.py
```
Imprime un resumen humano con la cantidad de fotos por publicación, las
ofertas activas (con su fecha de vencimiento si la tienen) y la tasa UF
cacheada en `listings.json`.

### 4. Ofertar / poner oferta temporal

**Cuando:** Elias pide "ofertá X a Y UF [hasta DD]", "pone oferta a X por Y",
"baja el precio de X temporalmente a Y", o variantes. La oferta es una
reducción temporal de precio: el sitio muestra el precio original tachado
y el precio nuevo destacado, con badge `OFERTA` y la fecha de vencimiento
si la informaste.

Pasos:

1. Llamá primero **dry-run** (sin `--confirm`) por título o id para
   detectar el match:
   ```
   /usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/offer.py \
       --title "Vitacura" \
       --price 6000 --currency UF --until 2026-06-15
   ```
2. Casos del JSON resultante:
   - `error: no_match` → "no encontré ninguna publicación con ese título".
   - `error: ambiguous` → mostrá la lista a Elias y pedí cuál.
   - 1 match → mostrá título + precio actual + oferta planeada y **pedí
     confirmación** explícita ("¿confirmás la oferta sobre …?").
3. Tras confirmación, ejecutá con `--confirm`:
   ```
   /usr/bin/python3 ... offer.py --title "Vitacura" \
       --price 6000 --currency UF --until 2026-06-15 --confirm
   ```
4. Confirmá a Elias el cambio y mencioná que GitHub Pages tarda ~30–60 s
   en propagar.

**Reglas:**

- `--currency` por defecto = la moneda original del listing.
- `--until` es opcional. Acepta `YYYY-MM-DD` (se trata como fin de día
  local) o ISO completo. Si no se pasa, la oferta es indefinida.
- Si Elias dice algo como "hasta el viernes" / "por una semana" / "fin de
  mes": resolvé la fecha absoluta antes de llamar al script (referenciá la
  fecha actual del runtime). Si hay ambigüedad, preguntá.
- Si Elias dice "$" o "millones" sin aclarar moneda, asumí CLP. "UF" → UF.
- **Nunca** corras `--confirm` sin "sí" de Elias.

### 5. Quitar oferta temporal

**Cuando:** "quitá la oferta de X", "saca el descuento de X", "vuelve al
precio original de X".

Pasos:

1. Dry-run para confirmar match:
   ```
   /usr/bin/python3 ... offer.py --title "Vitacura" --clear
   ```
2. Si match único, mostrá la oferta vigente a Elias y pedí confirmación.
3. Ejecutá con `--confirm`:
   ```
   /usr/bin/python3 ... offer.py --title "Vitacura" --clear --confirm
   ```

## Conversor UF ↔ CLP (frontend)

El sitio incluye un conversor automático:

- **Toggle global** en el header (pill `UF | CLP`) que cambia la moneda
  primaria mostrada en todas las cards, bento y detalle. La preferencia
  queda en `localStorage` (`sciberras:displayCurrency`).
- **Toggle por publicación**: bajo cada precio, un texto chico
  `≈ <moneda alternativa>` clickable que también flippea el toggle global
  cuando se toca. Así el toggle "vive" tanto en cada publicación como en
  el header.
- **Tasa UF**: el frontend intenta primero `https://mindicador.cl/api/uf`
  (CORS habilitado); si falla o demora >4 s, usa la tasa cacheada en
  `listings.json` (`uf_clp_rate` + `uf_rate_updated_at`). El footer
  muestra el valor usado.
- **`publish.py` y `offer.py`** refrescan opportunistamente la tasa
  cacheada cada vez que escriben `listings.json` (best-effort, no falla
  si la API no responde).
- **USD** se muestra siempre en USD sin conversión (caso raro).

## Reglas

- **Confirmación obligatoria antes de borrar.** Nunca corras `unpublish.py
  --confirm` sin que Elias haya dicho "sí" / "confirmá" / equivalente.
- **No inventes precios ni datos.** Si un campo falta, preguntá.
- **Caption faltante = no publicás.** Pedí el caption antes de hacer
  cualquier cosa.
- **Tipo por defecto = `casa`** sólo si el texto lo deja claro; si dice
  "departamento", "depto", "apartamento" → `departamento`. "Sitio", "lote",
  "parcela", "terreno" → `terreno`.
- **Moneda por defecto = `UF`.** "Pesos", "millones de pesos", "$" → `CLP`.
  "Dólares", "USD", "US$" → `USD`.
- **Spanish output (latinoamericano neutro)** en mensajes a Elias. Nada de
  voseo argentino. Razonamiento interno y código pueden ser inglés.

## Schema de un listing en `docs/data/listings.json`

```json
{
  "id":          "casa-en-las-condes-a1b2c3",
  "title":       "Casa en Las Condes",
  "description": "3 dorms, jardín, 180 m²",
  "price":       8500,
  "currency":    "UF",
  "type":        "casa",
  "images":      ["images/casa-en-las-condes-a1b2c3.jpg",
                  "images/casa-en-las-condes-a1b2c3-2.jpg"],
  "created_at":  "2026-05-01T14:30:00-04:00",
  "offer": {                       // OPCIONAL — sólo cuando hay oferta vigente
    "price":      7800,
    "currency":   "UF",
    "started_at": "2026-05-02T09:30:00-04:00",
    "until":      "2026-06-15T23:59:59-04:00"   // opcional, sin esto es indefinida
  }
}
```

El nivel raíz de `listings.json` también lleva la **tasa UF cacheada**:

```json
{
  "updated_at":          "...",
  "uf_clp_rate":         40146.82,
  "uf_rate_updated_at":  "2026-05-02T00:00:00-04:00",
  "listings": [ ... ]
}
```

El frontend lee `images[]`. Para retrocompatibilidad, también acepta el campo
legacy `image` (string) si alguna vez aparece. Si `offer.until` está vencida,
el frontend ignora la oferta automáticamente (no hace falta limpiarla, pero
podés correr `offer.py --clear --confirm` si querés que desaparezca del
JSON).

## Diseño del sitio

Diseño editorial moderno (referencias: Compass, Sotheby's, Linear, sites con
serif display + bento layouts dominantes en 2025-2026).

- **Tipografía:** Inter para body / UI; Fraunces para headlines y precios
  (variable serif, peso 500-600, italic para acento).
- **Paleta:** off-white cálido `#faf8f3`, tinta casi negra `#11141a`,
  acento bronce/terracota `#b46a3a`, brand mark azul de continuidad
  (`#1e40af` / `#3b82f6`).
- **Hero editorial** (sin buscador): título grande serif, copy corto, CTAs
  pill-style, mini stats con cantidad de publicaciones y fecha de update.
- **Sección "Destacadas"** con bento grid: el listing más nuevo ocupa una
  card grande (2x2), el resto cards pequeñas (hasta 5 destacadas).
- **Buscador** vive en una banda dedicada (`.search-band`) entre el hero y
  las destacadas. En desktop (≥1024px) la banda se "tucks" levemente bajo
  el hero (`margin-top: -28px`) para anclar la composición editorial. Es
  visible en `#inicio` y categorías; oculto sólo en `#contacto`. Mismo
  form sirve para buscar y filtrar el catálogo entero.
- **Cards** con cover + badge de tipo + chip de cantidad de fotos cuando hay
  más de una.
- **Detail dialog** con galería: imagen principal + flechas prev/next +
  contador `i / N` + tira de thumbnails clicables. Soporta arrows del
  teclado.
- **Microanimaciones:** fade-in/translate-up al entrar en viewport vía
  IntersectionObserver. Respeta `prefers-reduced-motion`.
- **SPA-ish:** una sola HTML, navegación por hash (`#casas`,
  `#departamentos`, `#terrenos`, `#contacto`). En `#inicio` se muestran
  hero + destacadas + catálogo completo. En categorías, sólo el catálogo
  filtrado. En `#contacto`, sólo la sección contacto.

## Hosting / dominio

- **Hosting actual:** GitHub Pages — `https://eliasurrar.github.io/sciberras-propiedades/`
- **Dominio futuro:** un `.cl` de NIC. Cuando llegue: agregar `CNAME` en
  el repo + configurar DNS A records de NIC apuntando a GitHub Pages
  (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`).

## Cómo deploya

`publish.py` y `unpublish.py` hacen `git add` → `commit` → `push origin main`.
GitHub Pages re-construye y publica en ~30–60 s. El JSON tiene
cache-busting (`?t=<timestamp>`) en el fetch del JS, así que el sitio toma el
nuevo data sin recarga manual.

## Skills disponibles (instaladas el 2026-05-01)

Tres skills habilitados en este workspace que aplican a este proyecto:

- **find-skills** (`~/.claude/skills/find-skills/`) — Úsalo PRIMERO cada vez que necesites una capacidad nueva (ej. "¿hay una skill para resize de imágenes?", "necesito algo para SEO de listings"). Descubre antes de implementar a mano.
- **superpowers** (OpenClaw plugin) — Methodología TDD + debugging sistemático. Aplicar cuando:
  - Tocás `publish.py` / `unpublish.py` / `inspect.py` (un bug acá corrompe el sitio en producción → red-green-refactor obligatorio).
  - Debuggeás un push fallido a GitHub o un listing que no aparece (4-phase debugging: causa raíz primero).
- **ui-ux-pro-max** (OpenClaw plugin) — **VALOR MÁXIMO acá**: este es un sitio diseño-céntrico. Aplicar cuando:
  - Iterás sobre `docs/css/styles.css` o `docs/index.html` (paleta cálida + Fraunces/Inter ya definidos — cualquier cambio debe validarse contra el design system existente).
  - Trabajás en el detail dialog / galería modal / bento grid de destacadas.
  - Mejorás accesibilidad (contrast ratios, focus states, ARIA), responsive breakpoints, o microanimaciones (siempre respetando `prefers-reduced-motion`).
  - Pedile sugerencias de palette/font pairings ANTES de improvisar — la skill tiene 95+ paletas curadas.
