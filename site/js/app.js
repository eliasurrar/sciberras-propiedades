(() => {
  'use strict';

  const TYPE_LABEL = { casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno' };
  const TITLES = {
    inicio:         'Últimas publicaciones',
    casas:          'Casas en venta',
    departamentos:  'Departamentos en venta',
    terrenos:       'Terrenos en venta',
  };
  const ROUTE_TYPE = {
    casas:         'casa',
    departamentos: 'departamento',
    terrenos:      'terreno',
  };

  const state = {
    listings: [],
    route: 'inicio',
    query: '',
    typeFilter: '',
    priceMax: null,
  };

  const els = {
    grid:         document.getElementById('grid'),
    empty:        document.getElementById('empty'),
    catalogTitle: document.getElementById('catalogTitle'),
    catalogCount: document.getElementById('catalogCount'),
    catalog:      document.getElementById('catalog'),
    contact:      document.getElementById('contacto-section'),
    hero:         document.getElementById('inicio-hero'),
    nav:          document.querySelector('.main-nav'),
    navToggle:    document.querySelector('.nav-toggle'),
    searchForm:   document.getElementById('searchForm'),
    qInput:       document.getElementById('q'),
    typeSelect:   document.getElementById('filterType'),
    priceInput:   document.getElementById('filterPriceMax'),
    detail:       document.getElementById('detail'),
    detailImage:  document.getElementById('detailImage'),
    detailBadge:  document.getElementById('detailBadge'),
    detailTitle:  document.getElementById('detailTitle'),
    detailPrice:  document.getElementById('detailPrice'),
    detailDesc:   document.getElementById('detailDescription'),
    detailMeta:   document.getElementById('detailMeta'),
    footerYear:   document.getElementById('footerYear'),
    footerUpdated:document.getElementById('footerUpdated'),
  };

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

  function render() {
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === state.route);
    });

    if (state.route === 'contacto') {
      els.hero.hidden = true;
      els.catalog.hidden = true;
      els.contact.hidden = false;
      return;
    }
    els.hero.hidden = false;
    els.catalog.hidden = false;
    els.contact.hidden = true;

    els.catalogTitle.textContent = TITLES[state.route] || TITLES.inicio;

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
    }
    els.grid.setAttribute('aria-busy', 'false');
  }

  function cardHtml(l) {
    const badge = `<span class="badge badge-${l.type}">${TYPE_LABEL[l.type] || l.type}</span>`;
    const price = fmtPrice(l.price, l.currency);
    const img = l.image
      ? `<img src="${l.image}" alt="${escapeAttr(l.title || '')}" loading="lazy">`
      : '';
    return `
      <button class="card" data-id="${l.id}" type="button">
        <div class="card-image">${img}${badge}</div>
        <div class="card-body">
          <span class="card-price">${price}</span>
          <span class="card-title">${escapeHtml(l.title || 'Sin título')}</span>
          <span class="card-desc">${escapeHtml(l.description || '')}</span>
          <div class="card-foot">
            <span>${fmtDate(l.created_at)}</span>
            <span>Ver detalle →</span>
          </div>
        </div>
      </button>`;
  }

  function openDetail(id) {
    const l = state.listings.find(x => x.id === id);
    if (!l) return;
    els.detailImage.src = l.image || '';
    els.detailImage.alt = l.title || '';
    els.detailBadge.className = `badge badge-${l.type}`;
    els.detailBadge.textContent = TYPE_LABEL[l.type] || l.type;
    els.detailTitle.textContent = l.title || '';
    els.detailPrice.textContent = fmtPrice(l.price, l.currency);
    els.detailDesc.textContent  = l.description || '';
    els.detailMeta.textContent  = `Publicada el ${fmtDate(l.created_at)} · ID ${l.id}`;
    if (typeof els.detail.showModal === 'function') els.detail.showModal();
    else els.detail.setAttribute('open', 'open');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function parseHash() {
    const h = (location.hash || '').replace('#', '').trim();
    if (h && (h in TITLES || h === 'contacto')) return h;
    return 'inicio';
  }

  function bindEvents() {
    window.addEventListener('hashchange', () => {
      state.route = parseHash();
      render();
    });

    els.searchForm.addEventListener('submit', e => {
      e.preventDefault();
      state.query     = els.qInput.value.trim();
      state.typeFilter= els.typeSelect.value;
      const pm = parseFloat(els.priceInput.value);
      state.priceMax  = Number.isFinite(pm) ? pm : null;
      render();
    });

    els.detail.addEventListener('click', e => {
      if (e.target.matches('[data-close]') || e.target === els.detail) {
        els.detail.close ? els.detail.close() : els.detail.removeAttribute('open');
      }
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

  async function loadListings() {
    try {
      const res = await fetch(`data/listings.json?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      state.listings = Array.isArray(json.listings) ? json.listings : [];
      els.footerUpdated.textContent = fmtDate(json.updated_at) || '—';
      els.footerUpdated.dateTime    = json.updated_at || '';
    } catch (e) {
      console.error('No pude cargar listings.json', e);
      state.listings = [];
    }
  }

  async function init() {
    els.footerYear.textContent = new Date().getFullYear();
    state.route = parseHash();
    bindEvents();
    await loadListings();
    render();
  }

  init();
})();
