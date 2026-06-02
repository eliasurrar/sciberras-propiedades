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
