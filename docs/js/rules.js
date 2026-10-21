/* Regla de visibilidad de avisos (SPEC §4.3) — espejo JS de scripts/listing_rules.py.
 *
 * UMD sin dependencias: en el navegador expone window.SciberrasRules; en Node
 * (tests) se importa con require(). Ambos lados se validan contra
 * tests/fixtures/visibility_vectors.json. Si cambias algo aquí, cambia también
 * scripts/listing_rules.py (y los vectores).
 *
 * Un aviso es público si:
 *   · no tiene status, o es "active" o "reserved" (la reservada no caduca);
 *   · es "sold" / "rented" y todavía no pasaron 30 días exactos (30×24 h) desde
 *     status_changed_at. Sin fecha, o con fecha que no se puede interpretar, se
 *     mantiene público (no hay con qué calcular);
 *   · cualquier otro valor (incluido "inactive") es NO público (falla cerrada).
 *
 * Gramática de fechas (idéntica a scripts/listing_rules.py): YYYY-MM-DD, "T" o espacio, HH:MM[:SS[.fff|.ffffff]]
 * y offset obligatorio (Z o ±HH:MM). Cualquier otra cosa es "no interpretable" ⇒ público. La regla tiene
 * resolución de 1 ms (los microsegundos se descartan en ambos motores).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SciberrasRules = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STATUSES = Object.freeze(['active', 'inactive', 'reserved', 'sold', 'rented']);
  const CLOSED = Object.freeze(['sold', 'rented']);
  const HIDE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
  const BADGE_LABEL = Object.freeze({ reserved: 'RESERVADA', sold: 'VENDIDA', rented: 'ARRENDADA' });

  // ISO-8601 *con* offset (Z o ±HH:MM). Una fecha sin offset (naive) es inválida,
  // igual que en Python. Se calcula a mano en vez de usar Date.parse para que el
  // resultado no dependa de la zona horaria ni de las rarezas de cada motor.
  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}|\d{6}))?)?(Z|[+-]\d{2}:\d{2})$/;

  function parseIso(s) {
    if (typeof s !== 'string' || !s) return null;
    const m = ISO_RE.exec(s);
    if (!m) return null;
    const [Y, Mo, D, H, Mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
    const S = m[6] ? Number(m[6]) : 0;
    const ms = m[7] ? Number(m[7].slice(0, 3)) : 0;
    let offMin = 0;
    if (m[8] !== 'Z') {
      const oh = Number(m[8].slice(1, 3));
      const om = Number(m[8].slice(4, 6));
      if (oh > 23 || om > 59) return null;
      offMin = (m[8][0] === '-' ? -1 : 1) * (oh * 60 + om);
    }
    if (Y < 1) return null; // el año 0000 no existe en Python: misma respuesta en los dos motores
    // Date.UTC trata los años 0–99 como 1900–1999; setUTCFullYear no.
    const back = new Date(0);
    back.setUTCFullYear(Y, Mo - 1, D);
    back.setUTCHours(H, Mi, S, ms);
    const utc = back.getTime();
    if (back.getUTCFullYear() !== Y || back.getUTCMonth() !== Mo - 1 || back.getUTCDate() !== D ||
        back.getUTCHours() !== H || back.getUTCMinutes() !== Mi || back.getUTCSeconds() !== S) {
      return null; // p. ej. 30 de febrero, hora 24, minuto 61
    }
    return utc - offMin * 60 * 1000;
  }

  // Mismos valores "falsy" que Python (`listing.get("status") or "active"`): además de null/""/0/false,
  // la lista vacía y el objeto vacío cuentan como ausentes.
  function isFalsy(v) {
    if (!v) return true;
    if (Array.isArray(v)) return v.length === 0;
    return typeof v === 'object' && Object.keys(v).length === 0;
  }

  function rawStatus(listing) {
    const s = listing && listing.status;
    return isFalsy(s) ? 'active' : s;
  }

  function isClosed(listing) {
    return CLOSED.indexOf(rawStatus(listing)) !== -1;
  }

  // nowMs: milisegundos epoch (Date.now()).
  function isPublic(listing, nowMs) {
    const s = rawStatus(listing);
    if (s === 'active' || s === 'reserved') return true;
    if (s === 'sold' || s === 'rented') {
      const t = parseIso(listing.status_changed_at);
      return t === null ? true : nowMs < t + HIDE_AFTER_MS;
    }
    return false; // inactive o desconocido
  }

  // Etiqueta de badge para un status (null si no lleva).
  function badgeLabel(status) {
    return Object.prototype.hasOwnProperty.call(BADGE_LABEL, status) ? BADGE_LABEL[status] : null;
  }

  // 0 activa · 1 reservada · 2 vendida/arrendada (orden del catálogo, SPEC §8.1).
  function availabilityGroup(listing) {
    const s = rawStatus(listing);
    if (s === 'reserved') return 1;
    if (s === 'sold' || s === 'rented') return 2;
    return 0;
  }

  // Filtro "Estado" del buscador (SPEC §8.3). Valores de URL: disponible | reservada | cerrada.
  const STATUS_FILTERS = Object.freeze(['disponible', 'reservada', 'cerrada']);
  function matchesStatusFilter(listing, filter) {
    if (!filter) return true;
    const g = availabilityGroup(listing);
    if (filter === 'disponible') return g === 0;
    if (filter === 'reservada') return g === 1;
    if (filter === 'cerrada') return g === 2;
    return true; // valor desconocido en la URL: no filtra
  }

  return {
    STATUSES, CLOSED, HIDE_AFTER_MS, BADGE_LABEL, STATUS_FILTERS,
    parseIso, rawStatus, isClosed, isPublic, badgeLabel, availabilityGroup, matchesStatusFilter,
  };
});
