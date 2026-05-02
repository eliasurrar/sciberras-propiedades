(() => {
  'use strict';

  const WHATSAPP_PHONE = '56954901879';
  const TYPE_LABEL = { casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno' };
  const TITLES = {
    inicio:         'Todas las propiedades',
    casas:          'Casas en venta',
    departamentos:  'Departamentos en venta',
    terrenos:       'Terrenos en venta',
  };
  const ROUTE_TYPE = {
    casas:         'casa',
    departamentos: 'departamento',
    terrenos:      'terreno',
  };
  const FEATURED_COUNT = 5;
  const CURRENCY_KEY = 'sciberras:displayCurrency';
  const UF_API = 'https://mindicador.cl/api/uf';
  const UF_FETCH_TIMEOUT_MS = 4000;

  const state = {
    listings:        [],
    route:           'inicio',
    query:           '',
    typeFilter:      '',
    operationFilter: '',
    regionFilter:    '',
    communeFilter:   '',
    bedroomsMin:     null,
    bathroomsMin:    null,
    priceMin:        null,
    priceMax:        null,
    poolOnly:        false,
    parkingOnly:     false,
    furnishedOnly:   false,
    galleryImages:   [],
    galleryIndex:    0,
    displayCurrency: 'UF',
    ufRate:          null,
    ufRateDate:      null,
  };

  const els = {
    grid:            document.getElementById('grid'),
    empty:           document.getElementById('empty'),
    catalogTitle:    document.getElementById('catalogTitle'),
    catalogCount:    document.getElementById('catalogCount'),
    catalog:         document.getElementById('catalog'),
    contact:         document.getElementById('contacto-section'),
    hero:            document.getElementById('inicio-hero'),
    searchBand:      document.getElementById('searchBand'),
    featured:        document.getElementById('destacadas'),
    featuredGrid:    document.getElementById('featuredGrid'),
    featuredEmpty:   document.getElementById('featuredEmpty'),
    nav:             document.querySelector('.main-nav'),
    navToggle:       document.querySelector('.nav-toggle'),
    currencyToggle:  document.getElementById('currencyToggle'),
    searchForm:      document.getElementById('searchForm'),
    qInput:          document.getElementById('q'),
    typeSelect:      document.getElementById('filterType'),
    operationSelect: document.getElementById('filterOperation'),
    regionSelect:    document.getElementById('filterRegion'),
    communeSelect:   document.getElementById('filterCommune'),
    bedroomsSelect:  document.getElementById('filterBedrooms'),
    bathroomsSelect: document.getElementById('filterBathrooms'),
    priceMinInput:   document.getElementById('filterPriceMin'),
    priceInput:      document.getElementById('filterPriceMax'),
    poolCheck:       document.getElementById('filterPool'),
    parkingCheck:    document.getElementById('filterParking'),
    furnishedCheck:  document.getElementById('filterFurnished'),
    filterReset:     document.getElementById('filterReset'),
    detail:          document.getElementById('detail'),
    detailGallery:   null,
    detailImage:     document.getElementById('detailImage'),
    detailBadge:     document.getElementById('detailBadge'),
    detailTitle:     document.getElementById('detailTitle'),
    detailPrice:     document.getElementById('detailPrice'),
    detailDesc:      document.getElementById('detailDescription'),
    detailMeta:      document.getElementById('detailMeta'),
    detailWhatsapp:  document.getElementById('detailWhatsapp'),
    detailShare:     document.getElementById('detailShare'),
    detailShareLbl:  document.getElementById('detailShareLabel'),
    footerYear:      document.getElementById('footerYear'),
    footerUpdated:   document.getElementById('footerUpdated'),
    footerUf:        document.getElementById('footerUf'),
    footerUfValue:   document.getElementById('footerUfValue'),
    footerUfDate:    document.getElementById('footerUfDate'),
    heroCount:       document.getElementById('heroCount'),
    heroUpdated:     document.getElementById('heroUpdated'),
  };

  let currentListing = null;

  /* ── Data helpers ────────────────────────────────────────────── */

  function listingImages(l) {
    if (Array.isArray(l.images) && l.images.length) return l.images;
    if (l.image) return [l.image];
    return [];
  }
  function listingCover(l) {
    return listingImages(l)[0] || '';
  }
  function listingImageMeta(l, idx) {
    if (Array.isArray(l.image_meta) && l.image_meta[idx]) return l.image_meta[idx];
    return null;
  }
  function coverOrientation(l) {
    const meta = listingImageMeta(l, 0);
    return (meta && meta.orientation === 'v') ? 'v' : 'h';
  }

  function fmtAmount(n, currency) {
    if (n == null || !Number.isFinite(Number(n))) return '';
    const num = Number(n);
    if (currency === 'CLP') {
      return `$${Math.round(num).toLocaleString('es-CL')}`;
    }
    if (currency === 'USD') {
      return `US$ ${Math.round(num).toLocaleString('es-CL')}`;
    }
    // UF: keep one decimal if not integer
    const opts = Number.isInteger(num)
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 1, maximumFractionDigits: 2 };
    return `UF ${num.toLocaleString('es-CL', opts)}`;
  }

  function convert(amount, fromCcy, toCcy) {
    if (amount == null) return null;
    if (fromCcy === toCcy) return Number(amount);
    if (!state.ufRate) return null;
    if (fromCcy === 'UF'  && toCcy === 'CLP') return Number(amount) * state.ufRate;
    if (fromCcy === 'CLP' && toCcy === 'UF')  return Number(amount) / state.ufRate;
    return null; // USD or unsupported pair
  }

  function altCurrency(ccy) {
    if (ccy === 'UF')  return 'CLP';
    if (ccy === 'CLP') return 'UF';
    return null; // USD has no alt
  }

  /**
   * Resolve which currency is shown as primary for a given listing currency.
   * If the global toggle picks the listing's native currency, primary = native.
   * If the toggle picks something else, prefer that as primary (when convertible).
   * USD stays USD always.
   */
  function pickPrimaryCurrency(nativeCcy) {
    if (nativeCcy === 'USD') return 'USD';
    if (state.displayCurrency === 'CLP' && state.ufRate) return 'CLP';
    return 'UF';
  }

  /**
   * Build {primary, secondary} display strings for a price+currency pair.
   * Primary is the currency selected by the global toggle (or native if USD).
   * Secondary shows the alternate currency conversion (≈), or "" if not applicable.
   */
  function pricePair(price, nativeCcy) {
    if (price == null) return { primary: '', secondary: '', primaryCcy: nativeCcy, altCcy: null };
    const primaryCcy = pickPrimaryCurrency(nativeCcy);
    const alt = altCurrency(primaryCcy);
    const primaryAmount = convert(price, nativeCcy, primaryCcy);
    const altAmount = alt ? convert(price, nativeCcy, alt) : null;
    return {
      primary:    fmtAmount(primaryAmount, primaryCcy),
      secondary:  altAmount != null ? `≈ ${fmtAmount(altAmount, alt)}` : '',
      primaryCcy,
      altCcy: alt,
    };
  }

  /* ── Offers ─────────────────────────────────────────────────── */

  function activeOffer(l) {
    const o = l && l.offer;
    if (!o || o.price == null) return null;
    if (o.until) {
      const until = new Date(o.until);
      if (!Number.isNaN(+until) && +until < Date.now()) return null;
    }
    return {
      price:    Number(o.price),
      currency: o.currency || l.currency || 'UF',
      until:    o.until || null,
    };
  }

  function fmtUntil(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  }

  /* ── Price HTML builders ────────────────────────────────────── */

  /**
   * Build the price block HTML for a listing.
   * variant: 'card' | 'bento' | 'detail' — only affects class names for styling.
   * Returns a string of HTML.
   */
  function priceBlockHtml(l, variant) {
    const offer = activeOffer(l);
    const cls = variant === 'bento'  ? 'price-block price-block--bento'
              : variant === 'detail' ? 'price-block price-block--detail'
              :                        'price-block price-block--card';

    if (offer) {
      const offerPair  = pricePair(offer.price,   offer.currency);
      const originPair = pricePair(l.price,       l.currency);
      const offerSecondary = offerPair.secondary
        ? `<button type="button" class="price-secondary price-flip" data-flip="${escapeAttr(offerPair.altCcy || '')}" aria-label="Ver en ${escapeAttr(offerPair.altCcy || '')}">${escapeHtml(offerPair.secondary)}</button>`
        : '';
      const untilTxt = offer.until ? `<span class="offer-until">hasta ${escapeHtml(fmtUntil(offer.until))}</span>` : '';
      return `
        <div class="${cls} has-offer">
          <span class="offer-tag">Oferta${untilTxt ? '' : ''}</span>
          <span class="price-original">${escapeHtml(originPair.primary)}</span>
          <span class="price-primary price-offer">${escapeHtml(offerPair.primary)}</span>
          ${offerSecondary}
          ${untilTxt}
        </div>`;
    }

    const pair = pricePair(l.price, l.currency);
    const secondary = pair.secondary
      ? `<button type="button" class="price-secondary price-flip" data-flip="${escapeAttr(pair.altCcy || '')}" aria-label="Ver en ${escapeAttr(pair.altCcy || '')}">${escapeHtml(pair.secondary)}</button>`
      : '';
    return `
      <div class="${cls}">
        <span class="price-primary">${escapeHtml(pair.primary)}</span>
        ${secondary}
      </div>`;
  }

  /* ── Format helpers ─────────────────────────────────────────── */

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    return d.toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function buildShareUrl(id) {
    return `${location.origin}${location.pathname}#prop/${id}`;
  }

  function buildWhatsappLink(l) {
    const url = buildShareUrl(l.id);
    const title = (l.title || 'Sin título').replace(/"/g, "'");
    const offer = activeOffer(l);
    const priceText = offer
      ? `Oferta: ${fmtAmount(offer.price, offer.currency)}`
      : fmtAmount(l.price, l.currency);
    const msg = `Hola Grace, me interesa la propiedad "${title}" (${priceText}). Link: ${url}`;
    return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`;
  }

  function parsePropFromHash() {
    const h = (location.hash || '').replace('#', '').trim();
    if (h.startsWith('prop/')) return h.slice(5);
    return null;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ── Amenity icons (inline SVG) ─────────────────────────────── */

  const ICONS = {
    bed:   '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17v-7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v7M2 17h20M2 21v-4M22 21v-4M7 11h4a2 2 0 0 1 2 2v0H5v0a2 2 0 0 1 2-2z"/></svg>',
    bath:  '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM7 12V6a3 3 0 0 1 6 0M5 19l-1 2M19 19l1 2"/></svg>',
    area:  '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
    lot:   '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l9-2 9 2v14l-9 2-9-2V5zM12 3v18"/></svg>',
    car:   '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17v-4l2-5h10l2 5v4M5 17v2M19 17v2M8 13h8"/><circle cx="8" cy="17" r="1.4"/><circle cx="16" cy="17" r="1.4"/></svg>',
    pool:  '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18c1.5-1 3 1 4.5 0S9 17 10.5 18 13.5 17 15 18s3-1 4.5 0 3 0 2.5 0M2 14c1.5-1 3 1 4.5 0S9 13 10.5 14 13.5 13 15 14s3-1 4.5 0 3 0 2.5 0M7 10V4M17 10V4"/></svg>',
    pin:   '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  };

  function fmtArea(n) {
    if (n == null) return '';
    return Number(n).toLocaleString('es-CL');
  }

  function amenityHtml(l) {
    const items = [];
    if (l.bedrooms != null)      items.push(`<span class="amenity">${ICONS.bed}<span>${l.bedrooms}</span></span>`);
    if (l.bathrooms != null)     items.push(`<span class="amenity">${ICONS.bath}<span>${l.bathrooms}</span></span>`);
    if (l.area_built_m2 != null) items.push(`<span class="amenity" title="Superficie construida">${ICONS.area}<span>${fmtArea(l.area_built_m2)} m²</span></span>`);
    if (l.area_lot_m2 != null)   items.push(`<span class="amenity" title="Terreno">${ICONS.lot}<span>${fmtArea(l.area_lot_m2)} m²</span></span>`);
    if (l.parking != null && l.parking > 0) items.push(`<span class="amenity" title="Estacionamientos">${ICONS.car}<span>${l.parking}</span></span>`);
    if (l.pool)                  items.push(`<span class="amenity" title="Piscina">${ICONS.pool}</span>`);
    if (!items.length) return '';
    return `<div class="amenities">${items.join('')}</div>`;
  }

  function communeBadgeHtml(l) {
    if (!l.commune) return '';
    return `<span class="commune-badge">${ICONS.pin}<span>${escapeHtml(l.commune)}</span></span>`;
  }

  /* ── Filtering ──────────────────────────────────────────────── */

  /**
   * Effective price for filtering: if there's an active offer, use that.
   * Convert to the user's selected display currency when possible so the
   * "Precio máx." filter is applied in the same units the user sees.
   */
  function effectivePrice(l) {
    const offer = activeOffer(l);
    const price    = offer ? offer.price    : Number(l.price);
    const currency = offer ? offer.currency : l.currency;
    const target = pickPrimaryCurrency(currency);
    const v = convert(price, currency, target);
    return v != null ? v : Number(price);
  }

  function applyFilters() {
    let items = state.listings.slice();
    if (state.route !== 'inicio' && state.route !== 'contacto') {
      const t = ROUTE_TYPE[state.route];
      if (t) items = items.filter(l => l.type === t);
    }
    if (state.typeFilter)      items = items.filter(l => l.type === state.typeFilter);
    if (state.operationFilter) items = items.filter(l => (l.operation || 'venta') === state.operationFilter);
    if (state.regionFilter)    items = items.filter(l => l.region === state.regionFilter);
    if (state.communeFilter)   items = items.filter(l => (l.commune || '').toLowerCase() === state.communeFilter.toLowerCase());
    if (state.bedroomsMin != null)  items = items.filter(l => l.bedrooms != null && Number(l.bedrooms) >= state.bedroomsMin);
    if (state.bathroomsMin != null) items = items.filter(l => l.bathrooms != null && Number(l.bathrooms) >= state.bathroomsMin);
    if (state.priceMin != null)     items = items.filter(l => effectivePrice(l) >= state.priceMin);
    if (state.priceMax != null)     items = items.filter(l => effectivePrice(l) <= state.priceMax);
    if (state.poolOnly)             items = items.filter(l => !!l.pool);
    if (state.parkingOnly)          items = items.filter(l => l.parking != null && Number(l.parking) > 0);
    if (state.furnishedOnly)        items = items.filter(l => !!l.furnished);
    if (state.query) {
      const q = state.query.toLowerCase();
      items = items.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.description || '').toLowerCase().includes(q) ||
        (l.commune || '').toLowerCase().includes(q) ||
        (l.id || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return items;
  }

  function populateCommuneOptions() {
    if (!els.communeSelect) return;
    const set = new Set();
    state.listings.forEach(l => { if (l.commune) set.add(l.commune); });
    const current = state.communeFilter;
    const opts = ['<option value="">Todas</option>']
      .concat([...set].sort((a, b) => a.localeCompare(b, 'es'))
        .map(c => `<option value="${escapeAttr(c)}"${c === current ? ' selected' : ''}>${escapeHtml(c)}</option>`));
    els.communeSelect.innerHTML = opts.join('');
  }

  /* ── Render ─────────────────────────────────────────────────── */

  function render() {
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === state.route);
    });

    const isInicio = state.route === 'inicio';
    const isContacto = state.route === 'contacto';

    els.hero.hidden       = !isInicio;
    els.featured.hidden   = !isInicio;
    els.catalog.hidden    = isContacto;
    els.contact.hidden    = !isContacto;
    if (els.searchBand) els.searchBand.hidden = isContacto;

    if (isContacto) return;

    els.catalogTitle.textContent = TITLES[state.route] || TITLES.inicio;

    if (isInicio) renderFeatured();
    renderCatalog();
    updateHeroMeta();
    syncCurrencyToggleUi();
  }

  function syncCurrencyToggleUi() {
    if (!els.currencyToggle) return;
    const buttons = els.currencyToggle.querySelectorAll('button[data-currency]');
    buttons.forEach(btn => {
      const active = btn.dataset.currency === state.displayCurrency;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    // Disable CLP if we have no rate
    const clpBtn = els.currencyToggle.querySelector('button[data-currency="CLP"]');
    if (clpBtn) clpBtn.disabled = !state.ufRate;
  }

  function updateHeroMeta() {
    if (!els.heroCount) return;
    els.heroCount.textContent = state.listings.length || '0';
  }

  function updateFooterUf() {
    if (!els.footerUf) return;
    if (!state.ufRate) {
      els.footerUf.hidden = true;
      return;
    }
    els.footerUf.hidden = false;
    els.footerUfValue.textContent = `$${Math.round(state.ufRate).toLocaleString('es-CL')}`;
    if (state.ufRateDate) {
      const d = new Date(state.ufRateDate);
      if (!Number.isNaN(+d)) {
        els.footerUfDate.textContent = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
        els.footerUfDate.dateTime = state.ufRateDate;
      }
    }
  }

  function renderFeatured() {
    const sorted = state.listings
      .slice()
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const items = sorted.slice(0, FEATURED_COUNT);

    if (items.length === 0) {
      els.featuredGrid.innerHTML = '';
      els.featuredGrid.hidden = true;
      els.featuredEmpty.hidden = false;
      els.featuredGrid.setAttribute('aria-busy', 'false');
      return;
    }

    els.featuredEmpty.hidden = true;
    els.featuredGrid.hidden = false;
    els.featuredGrid.innerHTML = items.map((l, i) => bentoHtml(l, i, items.length)).join('');
    bindCardEvents(els.featuredGrid);
    observeFadeIns(els.featuredGrid.querySelectorAll('.fade-in'));
    els.featuredGrid.setAttribute('aria-busy', 'false');
  }

  function bentoHtml(l, idx, total) {
    let modifier = '';
    if (idx === 0)                       modifier = 'bento-card--feature';
    else if (total === 2)                modifier = 'bento-card--wide';
    else if (total === 3 && idx === 2)   modifier = 'bento-card--wide';

    const cover = listingCover(l);
    const imgs  = listingImages(l);
    const isHero = idx === 0;
    const imgAttrs = isHero
      ? `fetchpriority="high" decoding="async"`
      : `loading="lazy" decoding="async"`;
    const img = cover
      ? `<img class="bento-img" src="${escapeAttr(cover)}" alt="${escapeAttr(l.title || '')}" ${imgAttrs}>`
      : `<div class="bento-img-fallback" aria-hidden="true"></div>`;
    const badge = `<span class="bento-badge">${TYPE_LABEL[l.type] || l.type}</span>`;
    const photoHint = imgs.length > 1
      ? `<span class="bento-photos" aria-label="${imgs.length} fotos">◫ ${imgs.length}</span>`
      : '';
    return `
      <div class="bento-card ${modifier} fade-in" data-id="${escapeAttr(l.id)}">
        ${img}${badge}${photoHint}
        <div class="bento-body">
          ${communeBadgeHtml(l)}
          <span class="bento-title">${escapeHtml(l.title || 'Sin título')}</span>
          ${amenityHtml(l)}
          ${priceBlockHtml(l, 'bento')}
        </div>
      </div>`;
  }

  function renderCatalog() {
    const items = applyFilters();
    els.catalogCount.textContent =
      items.length === 0 ? 'Sin resultados' :
      items.length === 1 ? '1 propiedad' : `${items.length} propiedades`;

    if (items.length === 0) {
      els.grid.innerHTML = '';
      els.empty.hidden = false;
    } else {
      els.empty.hidden = true;
      els.grid.innerHTML = items.map(cardHtml).join('');
      bindCardEvents(els.grid);
      observeFadeIns(els.grid.querySelectorAll('.fade-in'));
    }
    els.grid.setAttribute('aria-busy', 'false');
  }

  function cardHtml(l) {
    const badge = `<span class="badge badge-${l.type}">${TYPE_LABEL[l.type] || l.type}</span>`;
    const cover = listingCover(l);
    const imgs = listingImages(l);
    const photoHint = imgs.length > 1
      ? `<span class="card-photo-count" aria-label="${imgs.length} fotos">◫ ${imgs.length}</span>`
      : '';
    const img = cover
      ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(l.title || '')}" loading="lazy" decoding="async">`
      : '';
    const orientCls = coverOrientation(l) === 'v' ? ' card-image--vertical' : '';
    return `
      <div class="card fade-in" data-id="${escapeAttr(l.id)}">
        <div class="card-image${orientCls}">${img}${badge}${photoHint}</div>
        <div class="card-body">
          ${priceBlockHtml(l, 'card')}
          ${communeBadgeHtml(l)}
          <span class="card-title">${escapeHtml(l.title || 'Sin título')}</span>
          ${amenityHtml(l)}
          <span class="card-desc">${escapeHtml(l.description || '')}</span>
          <div class="card-foot">
            <span>${fmtDate(l.created_at)}</span>
            <span class="card-foot-link">Ver detalle →</span>
          </div>
        </div>
      </div>`;
  }

  /**
   * Bind click events on cards. We use containers (div) instead of buttons so the
   * inline currency-flip button (price-flip) is valid HTML — clicking it switches
   * the global currency without opening the detail dialog (event.stopPropagation).
   */
  function bindCardEvents(scope) {
    scope.querySelectorAll('.card, .bento-card').forEach(card => {
      card.addEventListener('click', e => {
        const flip = e.target.closest('.price-flip');
        if (flip) {
          e.preventDefault();
          e.stopPropagation();
          const next = flip.dataset.flip;
          if (next === 'UF' || next === 'CLP') setDisplayCurrency(next);
          return;
        }
        openDetail(card.dataset.id);
      });
      // keyboard support: cards used to be <button>, keep Enter/Space behaviour
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('.price-flip')) return;
          e.preventDefault();
          openDetail(card.dataset.id);
        }
      });
    });
  }

  /* ── Detail dialog with gallery ─────────────────────────────── */

  function openDetail(id) {
    const l = state.listings.find(x => x.id === id);
    if (!l) return;
    currentListing = l;
    state.galleryImages = listingImages(l);
    state.galleryIndex  = 0;

    setGalleryImage();
    els.detailBadge.className = `badge badge-${l.type}`;
    els.detailBadge.textContent = TYPE_LABEL[l.type] || l.type;
    els.detailTitle.textContent = l.title || '';
    els.detailPrice.innerHTML = priceBlockHtml(l, 'detail') + communeBadgeHtml(l) + amenityHtml(l);
    els.detailDesc.textContent  = l.description || '';
    els.detailMeta.textContent  = `Publicada el ${fmtDate(l.created_at)} · ID ${l.id}`;
    if (els.detailWhatsapp) els.detailWhatsapp.href = buildWhatsappLink(l);
    resetShareLabel();
    injectListingSchema(l);
    document.title = `${l.title || 'Propiedad'} · Sciberras Propiedades`;
    if (typeof els.detail.showModal === 'function') els.detail.showModal();
    else els.detail.setAttribute('open', 'open');
  }

  function refreshDetailPrice() {
    if (!currentListing) return;
    els.detailPrice.innerHTML = priceBlockHtml(currentListing, 'detail');
    if (els.detailWhatsapp) els.detailWhatsapp.href = buildWhatsappLink(currentListing);
  }

  function resetShareLabel() {
    if (!els.detailShareLbl) return;
    els.detailShareLbl.textContent = 'Compartir';
    els.detailShare.classList.remove('is-copied');
  }

  function injectListingSchema(l) {
    const old = document.getElementById('listingSchema');
    if (old) old.remove();
    const cover = listingCover(l);
    const offer = activeOffer(l);
    const offerPrice    = offer ? offer.price    : l.price;
    const offerCurrency = offer ? offer.currency : l.currency;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      'name': l.title || '',
      'description': l.description || '',
      'url': buildShareUrl(l.id),
      'datePosted': l.created_at || undefined,
      'image': cover ? new URL(cover, location.href).href : undefined,
      'offers': {
        '@type': 'Offer',
        'price': offerPrice,
        'priceCurrency': offerCurrency === 'UF' ? 'CLF' : (offerCurrency || 'CLP'),
        'availability': 'https://schema.org/InStock',
        ...(offer && offer.until ? { 'priceValidUntil': offer.until } : {}),
      },
    };
    const tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.id = 'listingSchema';
    tag.textContent = JSON.stringify(data);
    document.head.appendChild(tag);
  }

  function removeListingSchema() {
    const old = document.getElementById('listingSchema');
    if (old) old.remove();
    document.title = 'Sciberras Propiedades — Casas, Departamentos y Terrenos';
  }

  async function shareListing() {
    if (!currentListing) return;
    const l = currentListing;
    const url = buildShareUrl(l.id);
    const title = l.title || 'Propiedad';
    const offer = activeOffer(l);
    const priceLabel = offer
      ? `Oferta ${fmtAmount(offer.price, offer.currency)}`
      : fmtAmount(l.price, l.currency);
    const text = `${title} — ${priceLabel}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (_) { /* fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      els.detailShareLbl.textContent = 'Link copiado';
      els.detailShare.classList.add('is-copied');
      setTimeout(resetShareLabel, 2200);
    } catch (_) {
      window.open(buildWhatsappLink(l), '_blank', 'noopener');
    }
  }

  function setGalleryImage() {
    const imgs = state.galleryImages;
    const idx  = state.galleryIndex;
    const wrap = els.detailGallery;
    const counter = wrap.querySelector('.gallery-counter');
    const prevBtn = wrap.querySelector('.gallery-prev');
    const nextBtn = wrap.querySelector('.gallery-next');
    const thumbs  = wrap.querySelector('.gallery-thumbs');

    if (imgs.length === 0) {
      els.detailImage.removeAttribute('src');
      els.detailImage.alt = '';
    } else {
      els.detailImage.src = imgs[idx];
      els.detailImage.alt = `Imagen ${idx + 1} de ${imgs.length}`;
    }

    const multi = imgs.length > 1;
    counter.textContent = multi ? `${idx + 1} / ${imgs.length}` : '';
    counter.hidden = !multi;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
    thumbs.hidden  = !multi;

    if (multi) {
      thumbs.innerHTML = imgs.map((src, i) =>
        `<button type="button" class="gallery-thumb${i === idx ? ' is-active' : ''}" data-idx="${i}" aria-label="Imagen ${i + 1}">
           <img src="${escapeAttr(src)}" alt="" loading="lazy">
         </button>`
      ).join('');
    } else {
      thumbs.innerHTML = '';
    }
  }

  function galleryStep(delta) {
    const n = state.galleryImages.length;
    if (n <= 1) return;
    state.galleryIndex = (state.galleryIndex + delta + n) % n;
    setGalleryImage();
  }

  /* ── Currency toggle ────────────────────────────────────────── */

  function setDisplayCurrency(ccy) {
    if (ccy !== 'UF' && ccy !== 'CLP') return;
    if (ccy === 'CLP' && !state.ufRate) return; // can't display CLP without rate
    if (state.displayCurrency === ccy) return;
    state.displayCurrency = ccy;
    try { localStorage.setItem(CURRENCY_KEY, ccy); } catch (_) {}
    syncCurrencyToggleUi();
    if (state.route === 'inicio') renderFeatured();
    renderCatalog();
    refreshDetailPrice();
  }

  function loadStoredCurrency() {
    try {
      const v = localStorage.getItem(CURRENCY_KEY);
      if (v === 'UF' || v === 'CLP') state.displayCurrency = v;
    } catch (_) {}
  }

  /* ── UF rate fetch ─────────────────────────────────────────── */

  function fetchUfRateLive() {
    return new Promise(resolve => {
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(() => { if (controller) controller.abort(); resolve(null); }, UF_FETCH_TIMEOUT_MS);
      fetch(UF_API, { signal: controller ? controller.signal : undefined, cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          clearTimeout(timer);
          if (!j || !Array.isArray(j.serie) || !j.serie.length) return resolve(null);
          const latest = j.serie[0];
          if (typeof latest.valor === 'number' && latest.valor > 0) {
            resolve({ rate: latest.valor, date: latest.fecha });
          } else resolve(null);
        })
        .catch(() => { clearTimeout(timer); resolve(null); });
    });
  }

  /* ── Routing & events ───────────────────────────────────────── */

  function parseHash() {
    const h = (location.hash || '').replace('#', '').trim();
    if (!h) return 'inicio';
    if (h in TITLES || h === 'contacto') return h;
    return 'inicio';
  }

  function bindEvents() {
    window.addEventListener('hashchange', () => {
      state.route = parseHash();
      render();
      const propId = parsePropFromHash();
      if (propId) openDetail(propId);
    });

    function readFiltersFromForm() {
      state.query           = (els.qInput?.value || '').trim();
      state.typeFilter      = els.typeSelect?.value || '';
      state.operationFilter = els.operationSelect?.value || '';
      state.regionFilter    = els.regionSelect?.value || '';
      state.communeFilter   = els.communeSelect?.value || '';
      const bMin = parseInt(els.bedroomsSelect?.value || '', 10);
      state.bedroomsMin     = Number.isFinite(bMin) ? bMin : null;
      const baMin = parseInt(els.bathroomsSelect?.value || '', 10);
      state.bathroomsMin    = Number.isFinite(baMin) ? baMin : null;
      const pmin = parseFloat(els.priceMinInput?.value);
      state.priceMin        = Number.isFinite(pmin) ? pmin : null;
      const pmax = parseFloat(els.priceInput?.value);
      state.priceMax        = Number.isFinite(pmax) ? pmax : null;
      state.poolOnly        = !!els.poolCheck?.checked;
      state.parkingOnly     = !!els.parkingCheck?.checked;
      state.furnishedOnly   = !!els.furnishedCheck?.checked;
    }

    els.searchForm.addEventListener('submit', e => {
      e.preventDefault();
      readFiltersFromForm();
      renderCatalog();
    });

    if (els.filterReset) {
      els.filterReset.addEventListener('click', () => {
        els.searchForm.reset();
        readFiltersFromForm();
        renderCatalog();
      });
    }

    if (els.currencyToggle) {
      els.currencyToggle.addEventListener('click', e => {
        const btn = e.target.closest('button[data-currency]');
        if (!btn || btn.disabled) return;
        setDisplayCurrency(btn.dataset.currency);
      });
    }

    els.detail.addEventListener('click', e => {
      const flip = e.target.closest('.price-flip');
      if (flip) {
        e.preventDefault();
        const next = flip.dataset.flip;
        if (next === 'UF' || next === 'CLP') setDisplayCurrency(next);
        return;
      }
      if (e.target.matches('[data-close]') || e.target === els.detail) {
        if (els.detail.close) els.detail.close();
        else els.detail.removeAttribute('open');
        if (parsePropFromHash()) {
          history.replaceState(null, '', location.pathname + location.search);
        }
        currentListing = null;
        removeListingSchema();
        return;
      }
      if (e.target.closest('.gallery-prev')) { galleryStep(-1); return; }
      if (e.target.closest('.gallery-next')) { galleryStep(1);  return; }
      if (e.target.closest('#detailShare'))  { shareListing();  return; }
      const thumb = e.target.closest('.gallery-thumb');
      if (thumb) {
        state.galleryIndex = Number(thumb.dataset.idx) || 0;
        setGalleryImage();
      }
    });

    els.detail.addEventListener('close', () => {
      currentListing = null;
      removeListingSchema();
    });

    document.addEventListener('keydown', e => {
      if (!els.detail.open) return;
      if (e.key === 'ArrowLeft')  galleryStep(-1);
      if (e.key === 'ArrowRight') galleryStep(1);
    });

    els.navToggle.addEventListener('click', () => {
      const open = els.nav.classList.toggle('open');
      els.navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    els.nav.addEventListener('click', e => {
      if (e.target.matches('.nav-link')) {
        els.nav.classList.remove('open');
        els.navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Fade-in observer ───────────────────────────────────────── */

  let fadeObserver = null;
  function getFadeObserver() {
    if (fadeObserver) return fadeObserver;
    if (typeof IntersectionObserver === 'undefined') return null;
    fadeObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          fadeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    return fadeObserver;
  }
  function observeFadeIns(nodes) {
    const obs = getFadeObserver();
    if (!obs) {
      nodes.forEach(n => n.classList.add('in-view'));
      return;
    }
    nodes.forEach(n => obs.observe(n));
  }

  /* ── Boot ───────────────────────────────────────────────────── */

  async function loadListings() {
    try {
      const res = await fetch(`data/listings.json?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      state.listings = Array.isArray(json.listings) ? json.listings : [];
      // Cached UF rate as a fallback (publish.py refreshes this on each publish)
      if (typeof json.uf_clp_rate === 'number' && json.uf_clp_rate > 0) {
        state.ufRate = json.uf_clp_rate;
        state.ufRateDate = json.uf_rate_updated_at || null;
      }
      const updated = fmtDate(json.updated_at) || '—';
      els.footerUpdated.textContent = updated;
      els.footerUpdated.dateTime = json.updated_at || '';
      if (els.heroUpdated) {
        els.heroUpdated.textContent = updated;
        els.heroUpdated.dateTime = json.updated_at || '';
      }
    } catch (e) {
      console.error('No pude cargar listings.json', e);
      state.listings = [];
    }
  }

  async function init() {
    els.detailGallery = els.detailImage.closest('.detail-gallery');
    els.footerYear.textContent = new Date().getFullYear();
    state.route = parseHash();
    loadStoredCurrency();
    bindEvents();
    observeFadeIns(document.querySelectorAll('.hero .fade-in, .section-head.fade-in, .search-bar.fade-in'));
    await loadListings();

    // First render with the cached/stored data — guarantees something paints fast.
    if (!state.ufRate && state.displayCurrency === 'CLP') state.displayCurrency = 'UF';
    populateCommuneOptions();
    syncCurrencyToggleUi();
    updateFooterUf();
    render();
    const propId = parsePropFromHash();
    if (propId) openDetail(propId);

    // Then try to refresh the UF rate live and re-render if it changed.
    const live = await fetchUfRateLive();
    if (live && live.rate && Math.abs(live.rate - (state.ufRate || 0)) > 0.5) {
      state.ufRate = live.rate;
      state.ufRateDate = live.date || state.ufRateDate;
      updateFooterUf();
      syncCurrencyToggleUi();
      if (state.route === 'inicio') renderFeatured();
      renderCatalog();
      refreshDetailPrice();
    } else if (live && live.rate) {
      // Same rate, but possibly fresher date
      state.ufRateDate = live.date || state.ufRateDate;
      updateFooterUf();
    }
  }

  init();
})();
