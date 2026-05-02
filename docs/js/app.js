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

  const state = {
    listings:       [],
    route:          'inicio',
    query:          '',
    typeFilter:     '',
    priceMax:       null,
    galleryImages:  [],
    galleryIndex:   0,
  };

  const els = {
    grid:           document.getElementById('grid'),
    empty:          document.getElementById('empty'),
    catalogTitle:   document.getElementById('catalogTitle'),
    catalogCount:   document.getElementById('catalogCount'),
    catalog:        document.getElementById('catalog'),
    contact:        document.getElementById('contacto-section'),
    hero:           document.getElementById('inicio-hero'),
    featured:       document.getElementById('destacadas'),
    featuredGrid:   document.getElementById('featuredGrid'),
    featuredEmpty:  document.getElementById('featuredEmpty'),
    nav:            document.querySelector('.main-nav'),
    navToggle:      document.querySelector('.nav-toggle'),
    searchForm:     document.getElementById('searchForm'),
    qInput:         document.getElementById('q'),
    typeSelect:     document.getElementById('filterType'),
    priceInput:     document.getElementById('filterPriceMax'),
    detail:         document.getElementById('detail'),
    detailGallery:  null,
    detailImage:    document.getElementById('detailImage'),
    detailBadge:    document.getElementById('detailBadge'),
    detailTitle:    document.getElementById('detailTitle'),
    detailPrice:    document.getElementById('detailPrice'),
    detailDesc:     document.getElementById('detailDescription'),
    detailMeta:     document.getElementById('detailMeta'),
    detailWhatsapp: document.getElementById('detailWhatsapp'),
    detailShare:    document.getElementById('detailShare'),
    detailShareLbl: document.getElementById('detailShareLabel'),
    footerYear:     document.getElementById('footerYear'),
    footerUpdated:  document.getElementById('footerUpdated'),
    heroCount:      document.getElementById('heroCount'),
    heroUpdated:    document.getElementById('heroUpdated'),
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

  function fmtPrice(price, currency) {
    if (price == null) return '';
    const n = Number(price);
    const localized = n.toLocaleString('es-CL');
    if (currency === 'UF')  return `UF ${localized}`;
    if (currency === 'USD') return `US$ ${localized}`;
    return `$${localized}`;
  }

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
    const msg = `Hola Grace, me interesa la propiedad "${title}". Link: ${url}`;
    return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`;
  }

  function parsePropFromHash() {
    const h = (location.hash || '').replace('#', '').trim();
    if (h.startsWith('prop/')) return h.slice(5);
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ── Filtering ──────────────────────────────────────────────── */

  function applyFilters() {
    let items = state.listings.slice();
    if (state.route !== 'inicio' && state.route !== 'contacto') {
      const t = ROUTE_TYPE[state.route];
      if (t) items = items.filter(l => l.type === t);
    }
    if (state.typeFilter) {
      items = items.filter(l => l.type === state.typeFilter);
    }
    if (state.priceMax != null) {
      items = items.filter(l => Number(l.price) <= state.priceMax);
    }
    if (state.query) {
      const q = state.query.toLowerCase();
      items = items.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.description || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return items;
  }

  /* ── Render ─────────────────────────────────────────────────── */

  function render() {
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === state.route);
    });

    const isInicio = state.route === 'inicio';
    const isContacto = state.route === 'contacto';

    els.hero.hidden     = !isInicio;
    els.featured.hidden = !isInicio;
    els.catalog.hidden  = isContacto;
    els.contact.hidden  = !isContacto;

    if (isContacto) return;

    els.catalogTitle.textContent = TITLES[state.route] || TITLES.inicio;

    if (isInicio) renderFeatured();
    renderCatalog();
    updateHeroMeta();
  }

  function updateHeroMeta() {
    if (!els.heroCount) return;
    els.heroCount.textContent = state.listings.length || '0';
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
    els.featuredGrid.querySelectorAll('.bento-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
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
    const price = fmtPrice(l.price, l.currency);
    return `
      <button class="bento-card ${modifier} fade-in" data-id="${escapeAttr(l.id)}" type="button">
        ${img}${badge}${photoHint}
        <div class="bento-body">
          <span class="bento-title">${escapeHtml(l.title || 'Sin título')}</span>
          <span class="bento-price">${price}</span>
        </div>
      </button>`;
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
      els.grid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => openDetail(card.dataset.id));
      });
      observeFadeIns(els.grid.querySelectorAll('.fade-in'));
    }
    els.grid.setAttribute('aria-busy', 'false');
  }

  function cardHtml(l) {
    const badge = `<span class="badge badge-${l.type}">${TYPE_LABEL[l.type] || l.type}</span>`;
    const price = fmtPrice(l.price, l.currency);
    const cover = listingCover(l);
    const imgs = listingImages(l);
    const photoHint = imgs.length > 1
      ? `<span class="card-photo-count" aria-label="${imgs.length} fotos">◫ ${imgs.length}</span>`
      : '';
    const img = cover
      ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(l.title || '')}" loading="lazy" decoding="async">`
      : '';
    return `
      <button class="card fade-in" data-id="${escapeAttr(l.id)}" type="button">
        <div class="card-image">${img}${badge}${photoHint}</div>
        <div class="card-body">
          <span class="card-price">${price}</span>
          <span class="card-title">${escapeHtml(l.title || 'Sin título')}</span>
          <span class="card-desc">${escapeHtml(l.description || '')}</span>
          <div class="card-foot">
            <span>${fmtDate(l.created_at)}</span>
            <span class="card-foot-link">Ver detalle →</span>
          </div>
        </div>
      </button>`;
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
    els.detailPrice.textContent = fmtPrice(l.price, l.currency);
    els.detailDesc.textContent  = l.description || '';
    els.detailMeta.textContent  = `Publicada el ${fmtDate(l.created_at)} · ID ${l.id}`;
    if (els.detailWhatsapp) els.detailWhatsapp.href = buildWhatsappLink(l);
    resetShareLabel();
    injectListingSchema(l);
    document.title = `${l.title || 'Propiedad'} · Sciberras Propiedades`;
    if (typeof els.detail.showModal === 'function') els.detail.showModal();
    else els.detail.setAttribute('open', 'open');
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
        'price': l.price,
        'priceCurrency': l.currency === 'UF' ? 'CLF' : (l.currency || 'CLP'),
        'availability': 'https://schema.org/InStock',
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
    const text = `${title} — ${fmtPrice(l.price, l.currency)}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (_) {
        /* user cancelled or unsupported MIME — fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      els.detailShareLbl.textContent = 'Link copiado';
      els.detailShare.classList.add('is-copied');
      setTimeout(resetShareLabel, 2200);
    } catch (_) {
      /* clipboard blocked — open WhatsApp link as last resort */
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

  /* ── Routing & events ───────────────────────────────────────── */

  function parseHash() {
    const h = (location.hash || '').replace('#', '').trim();
    if (!h) return 'inicio';
    if (h in TITLES || h === 'contacto') return h;
    return 'inicio'; // unknown anchor (e.g. #destacadas) keeps inicio
  }

  function bindEvents() {
    window.addEventListener('hashchange', () => {
      state.route = parseHash();
      render();
      const propId = parsePropFromHash();
      if (propId) openDetail(propId);
    });

    els.searchForm.addEventListener('submit', e => {
      e.preventDefault();
      state.query      = els.qInput.value.trim();
      state.typeFilter = els.typeSelect.value;
      const pm = parseFloat(els.priceInput.value);
      state.priceMax   = Number.isFinite(pm) ? pm : null;
      renderCatalog();
    });

    els.detail.addEventListener('click', e => {
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
    bindEvents();
    observeFadeIns(document.querySelectorAll('.hero .fade-in, .section-head.fade-in, .search-bar.fade-in'));
    await loadListings();
    render();
    const propId = parsePropFromHash();
    if (propId) openDetail(propId);
  }

  init();
})();
