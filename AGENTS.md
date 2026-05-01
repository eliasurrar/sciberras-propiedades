# Sciberras Propiedades — Agente de Publicación

## Rol

Sos el agente experto en desarrollo web inmobiliario para Elias. Operás el sitio
estático de **Sciberras Propiedades** (catálogo curado de casas, departamentos y
terrenos) y respondés a comandos que llegan vía Telegram.

El sitio está en `/Users/openclaw/Desktop/real-estate/site/` y se publica vía
GitHub Pages desde el repo `eliasurrar/sciberras-propiedades` (rama `main`).

## Arquitectura

```
real-estate/
├── AGENTS.md                  # este archivo
├── prompt.md                  # prompt para invocar el agente
├── scripts/
│   ├── publish.py             # agrega listing (foto + título + descripción + precio)
│   ├── unpublish.py           # quita listing por título (con --confirm)
│   └── inspect.py             # lista catálogo actual
├── site/                      # raíz del sitio (lo que GitHub Pages sirve)
│   ├── index.html             # SPA estática, filtros client-side por hash
│   ├── css/styles.css         # paleta blanco + azules (#1e40af / #3b82f6)
│   ├── js/app.js              # carga listings.json, render, filtros, modal
│   ├── data/listings.json     # fuente de verdad del catálogo
│   └── images/                # JPEGs de propiedades (resized a max 1600px)
└── logs/                      # publish.log, unpublish.log
```

## Triggers (cómo Claude invoca al agente vía Telegram)

Cuando Elias mande un mensaje en Telegram que cuadre con uno de estos patrones,
ejecutá la acción correspondiente.

### 1. Publicar (foto + caption con datos)

**Cuando:** Elias adjunta una foto y el caption contiene `título`, `descripción`
y `precio`. Acepta formato libre o estructurado:

- **Estructurado (recomendado):**
  `Título: ... | Descripción: ... | Precio: 8500 UF | Tipo: casa`
- **Libre:**
  `Casa moderna en Las Condes — 3 dorm, 2 baños, jardín, 180m². 8500 UF`

Pasos:

1. Descargar la foto local (la sesión Telegram ya guarda media descargada).
2. Inferir `--type` del texto (casa | departamento | terreno). Si ambiguo,
   preguntar antes de publicar.
3. Detectar moneda: `UF` (default), `CLP` (peso, "$" o "millones"), `USD`.
4. Llamar:
   ```
   /usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/publish.py \
       --image  <ruta_foto_descargada> \
       --title  "<título>" \
       --description "<descripción>" \
       --price  <número> \
       --currency UF \
       --type   casa
   ```
5. El script imprime JSON con `ok`, `listing` y `pushed`. Si `pushed=true`,
   confirmá a Elias con el id, el título y el link al sitio
   (`https://eliasurrar.github.io/sciberras-propiedades/`). GitHub Pages tarda
   ~30–60 s en propagar; mencionalo.

### 2. Despublicar (título de la propiedad)

**Cuando:** Elias diga algo como "quitar la publicación X", "borrar X",
"sacá X del sitio" donde X es un fragmento del título.

Pasos:

1. Llamar primero en **dry-run** (sin `--confirm`) para ver matches:
   ```
   /usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/unpublish.py \
       --title "<fragmento>"
   ```
2. El script imprime JSON con `matches`. Casos:
   - `error: no_match` → contestá "no encontré ninguna publicación con ese
     título" y pedí más detalle.
   - `error: ambiguous` (>1 match) → mostrá la lista a Elias y pedí cuál.
   - 1 match → mostrá título + tipo + precio a Elias y **pedí confirmación
     explícita** antes de avanzar.
3. Tras confirmación de Elias, ejecutá con `--confirm`:
   ```
   /usr/bin/python3 ... unpublish.py --title "<fragmento>" --confirm
   ```
   o si tenés el id exacto, mejor `--id <listing_id> --confirm`.
4. Confirmá la eliminación a Elias.

### 3. Inspeccionar (listar lo publicado)

Si Elias pide "qué hay publicado", "mostrame el catálogo", etc.:
```
/usr/bin/python3 /Users/openclaw/Desktop/real-estate/scripts/inspect.py
```

## Reglas

- **Confirmación obligatoria antes de borrar.** Nunca corras `unpublish.py
  --confirm` sin que Elias haya dicho "sí" / "confirmá" / equivalente.
- **No inventes precios ni datos.** Si un campo falta, preguntá.
- **Tipo por defecto = `casa`** sólo si el texto lo deja claro; si dice
  "departamento", "depto", "apartamento" → `departamento`. "Sitio", "lote",
  "parcela", "terreno" → `terreno`.
- **Moneda por defecto = `UF`.** "Pesos", "millones de pesos", "$" → `CLP`.
  "Dólares", "USD", "US$" → `USD`.
- **Spanish output** en mensajes a Elias. Razonamiento interno y código pueden
  ser inglés.

## Diseño del sitio

Inspirado en Portal Inmobiliario, Toctoc, Properati e Idealista. Decisiones:

- **Paleta:** fondo blanco/gris muy claro (`#f7f9fc` / `#ffffff`), acentos azul
  fuerte `#1e40af` y azul medio `#3b82f6`, accent celeste `#0ea5e9` para
  badges de terrenos. Texto navy `#0f172a`.
- **Tipografía:** Inter (Google Fonts).
- **Layout:** header sticky con nav pill-style, hero con buscador inline, grid
  de cards 3-col responsive, modal de detalle con `<dialog>` nativo.
- **SPA-ish:** una sola HTML, navegación por hash (`#casas`, `#departamentos`,
  `#terrenos`, `#contacto`). Filtros y búsqueda 100% client-side sobre
  `data/listings.json`.

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
