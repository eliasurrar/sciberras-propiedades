# real-estate (Sciberras Propiedades) — Overview

**Estado**: activo, site estático en GitHub Pages.
**Última actualización**: 2026-05-10

## Qué hace

Catálogo de propiedades estático publicado en GitHub Pages. Se actualiza vía Telegram: Elias manda fotos + datos, el agente ejecuta `publish.py` o `unpublish.py`.

## Workflow Telegram

- **Publicar**: Elias manda fotos sin texto → agente detecta que son para el listing más reciente (hasta 10 fotos/mensaje, límite Telegram)
- `publish.py` — agrega listing al catálogo, regenera el site estático, git push
- `unpublish.py` — elimina listing, regenera, git push

## Deployment

- GitHub Pages (repositorio de Elias)
- Site estático (HTML/CSS/JS, sin backend)
- Cada cambio requiere `git push` inmediato (no esperar al cron)

## Archivos clave

- `publish.py` — alta de propiedades
- `unpublish.py` — baja de propiedades
- `docs/` o `public/` — site generado

## Notas de UX

- Fotos sin texto en Telegram → se interpretan como append al listing más reciente en Sciberras
- Telegram limita 10 fotos por mensaje
