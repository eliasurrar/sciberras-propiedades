# Instrucciones del proyecto

Leer y aplicar las [instrucciones del arnés compartido](../../../arnes/AGENTS.md).
El trabajo en este proyecto se rige por ese arnés.

Procedimientos de publicación, esquema de datos, diseño y hosting: [AGENTE-PUBLICACION.md](AGENTE-PUBLICACION.md). Las integraciones Telegram allí descritas requieren configuración propia; los scripts hacen push a `main` y publican en el sitio, así que no se ejecutan con `--confirm` sin instrucción explícita.

## Development lifecycle

Lifecycle files for this site (`SPEC.md`, `docs/specs/`, `tasks/`) live in the private repo `eliasurrar/sciberras-bot`, not here.
Any merge or push to `main` in this repo publishes the live site and requires a gate. Do not add specs or internal details to this public repo.
