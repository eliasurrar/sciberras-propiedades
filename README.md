# Sciberras Propiedades

Sitio estático del catálogo inmobiliario de Sciberras Propiedades, alimentado
desde Telegram via un agente OpenClaw/Claude.

- **Sitio en vivo:** https://sciberraspropiedades.cl/
- **Spec del agente:** [`AGENTS.md`](./AGENTS.md)
- **Scripts:** `scripts/publish.py`, `scripts/unpublish.py`, `scripts/inspect.py`, `scripts/offer.py`
- **Fuente de datos:** `docs/data/listings.json`

Stack: HTML + CSS + Vanilla JS, sin build step. Hosting en GitHub Pages.

## Quién mantiene qué

Este sitio lo cuidan **dos agentes con responsabilidades estrictamente
separadas** (catálogo en `~/Desktop/agents/`):

| Agente | Lo que toca | Lo que NO toca |
|---|---|---|
| `real-estate-publisher` | `docs/data/listings.json`, imágenes en `docs/images/`, `scripts/publish.py` / `unpublish.py` / `inspect.py`, `git commit`+`push` de cambios de catálogo | HTML / CSS / JS del sitio, deploy infra, dominio, performance |
| `web-developer-specialist` | `docs/index.html`, `docs/styles.css`, `docs/app.js`, optimización de imágenes (WebP/AVIF), `sitemap.xml`, meta OG, GitHub Pages config, dominio `.cl` futuro | Contenido de `listings.json`, agregar/quitar propiedades |

Si tocás el repo manualmente, mantené esta división. Cualquier cosa de
contenido (subir/bajar propiedades) → flujo del publisher; cualquier cosa
visual/estructural → specialist.

## Cómo agregar una propiedad

Mandar a Elias (Telegram) una o varias fotos **con caption** que incluya
título, descripción y precio. Ejemplo de caption:

```
Casa en Las Condes
3 dorms, jardín, 180 m²
Precio: 8500 UF
```

El publisher procesa imágenes (`sips`, q80, max 1600px), inserta en
`listings.json` y hace push. GitHub Pages reconstruye en 30–60 s.

## Cómo quitar una propiedad

Mandar a Elias: "borrá la publicación de [fragmento del título]" o "saca X del
sitio". El publisher hace dry-run primero, muestra el match y espera
confirmación antes de borrar.

## Cómo evolucionar el sitio

Mandar a Elias cualquier pedido visual/estructural ("hacelo más rápido",
"agregale un filtro por precio", "modernizá el hero", "subí el dominio .cl").
Eso lo toma `web-developer-specialist`.

## Contacto del sitio (no modificar sin orden)

- **Nombre:** Grace Sciberras
- **Email:** `gsciberras28@gmail.com`
- **WhatsApp:** `+56 9 5490 1879`

