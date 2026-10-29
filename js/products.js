/* =====================================================
   PT. Sabaraya Sagara Mandiri - Logika Halaman Products
   =====================================================

   Data katalog & produk ada di js/products-data.js.
   File ini hanya berisi logika tampilan (filter, pencarian,
   kartu, pop-up detail). Biasanya tidak perlu diubah.

   Hierarki navigasi: kategori -> subkategori -> brand.
   Brand hanya ditampilkan pada subkategori yang memilikinya.
   ===================================================== */
(function () {
  'use strict';

  var grid       = document.getElementById('cat-grid');
  var chipsEl    = document.getElementById('cat-chips');
  var statusEl   = document.getElementById('cat-status');
  var treeEl     = document.getElementById('cat-tree');
  var toolbar    = document.getElementById('cat-toolbar');
  var side       = document.getElementById('cat-side');
  var sideToggle = document.getElementById('cat-side-toggle');
  var searchEl   = document.getElementById('cat-search');

  if (!grid || !chipsEl || !treeEl) return;

  var PAGE = 60;   // jumlah kartu per "muat lebih banyak"

  var mobileMq     = window.matchMedia('(max-width: 899px)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state  = { category: 'alat', sub: null, brand: null, q: '', limit: PAGE };
  var chips  = {};        // id kategori -> tombol filter
  var groups = {};        // id kategori -> elemen accordion
  var brandItems = {};    // "category/sub" -> <li> pembungkus daftar brand

  var priceFmt = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  /* ---------- Util ---------- */
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function humanize(slug) {
    return String(slug).replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function findCategory(id) {
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }

  function findSub(catId, subId) {
    var c = findCategory(catId);
    if (!c) return null;
    for (var i = 0; i < c.subcategories.length; i++) {
      if (c.subcategories[i].id === subId) return c.subcategories[i];
    }
    return null;
  }

  function categoryLabel(id) {
    var c = findCategory(id);
    return c ? c.label : humanize(id);
  }

  function subLabel(catId, subId) {
    var s = findSub(catId, subId);
    return s ? s.label : humanize(subId);
  }

  function brandLabel(catId, subId, brandId) {
    if (!brandId) return '';
    var s = findSub(catId, subId);
    if (s && s.brands) {
      for (var i = 0; i < s.brands.length; i++) {
        if (s.brands[i].id === brandId) return s.brands[i].label;
      }
    }
    return humanize(brandId);
  }

  function formatPrice(value) {
    return priceFmt.format(value || 0);
  }

  // Bantu mendeteksi salah ketik pada data produk
  products.forEach(function (p) {
    var c = findCategory(p.category);
    if (!c) {
      console.warn('[products.js] Kategori tidak dikenal untuk "' + p.name + '": ' + p.category);
      return;
    }
    var s = findSub(p.category, p.subcategory);
    if (!s) {
      console.warn('[products.js] Subkategori tidak dikenal untuk "' + p.name + '": ' + p.subcategory);
    } else if (p.brand && (!s.brands || !s.brands.some(function (b) { return b.id === p.brand; }))) {
      console.warn('[products.js] Brand tidak dikenal untuk "' + p.name + '": ' + p.brand);
    }
  });

  /* ---------- Ikon SVG statis ---------- */
  var ICON_IMAGE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.6"/><path d="M21 16l-5.2-5.2a1.5 1.5 0 0 0-2.1 0L5 19.5"/></svg>';
  var ICON_BOX =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';

  /* ---------- Filter kategori utama ---------- */
  function buildChips() {
    var items = [{ id: 'all', label: 'All' }].concat(
      catalog.map(function (c) { return { id: c.id, label: c.label }; })
    );
    items.forEach(function (item) {
      var b = el('button', 'cat-chip', item.label);
      b.type = 'button';
      b.dataset.category = item.id;
      b.setAttribute('aria-pressed', 'false');
      chipsEl.appendChild(b);
      chips[item.id] = b;
    });
  }

  /* ---------- Sidebar: kategori -> subkategori -> brand ---------- */
  function buildTree() {
    catalog.forEach(function (cat) {
      var panelId = 'cat-panel-' + cat.id;

      var group = el('div', 'cat-group is-open');
      group.dataset.category = cat.id;

      var btn = el('button', 'cat-group-btn');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-controls', panelId);
      btn.appendChild(el('span', 'cat-group-label', cat.label));
      var chev = el('span', 'cat-chevron');
      chev.setAttribute('aria-hidden', 'true');
      btn.appendChild(chev);

      var panel = el('div', 'cat-panel');
      panel.id = panelId;
      var inner = el('div', 'cat-panel-inner');
      var list = el('ul', 'cat-sublist');

      cat.subcategories.forEach(function (sub) {
        var li = el('li', sub.brands ? 'cat-sub-item' : null);

        var sb = el('button', 'cat-sub', sub.label);
        sb.type = 'button';
        sb.dataset.category = cat.id;
        sb.dataset.sub = sub.id;

        // penanda bahwa subkategori punya brand
        if (sub.brands) {
          var mark = el('span', 'cat-sub-mark');
          mark.setAttribute('aria-hidden', 'true');
          sb.appendChild(mark);
        }

        li.appendChild(sb);

        if (sub.brands) {
          var bl = el('ul', 'cat-brandlist');
          bl.setAttribute('aria-label', 'Brand ' + sub.label);
          sub.brands.forEach(function (b) {
            var bli = el('li');
            var bb = el('button', 'cat-brand', b.label);
            bb.type = 'button';
            bb.dataset.category = cat.id;
            bb.dataset.sub = sub.id;
            bb.dataset.brand = b.id;
            bli.appendChild(bb);
            bl.appendChild(bli);
          });
          li.appendChild(bl);
          brandItems[cat.id + '/' + sub.id] = li;
        }

        list.appendChild(li);
      });

      inner.appendChild(list);
      panel.appendChild(inner);
      group.appendChild(btn);
      group.appendChild(panel);
      treeEl.appendChild(group);

      groups[cat.id] = { group: group, btn: btn, inner: inner };
    });
  }

  function setGroupOpen(catId, open) {
    var g = groups[catId];
    if (!g) return;
    g.group.classList.toggle('is-open', open);
    g.btn.setAttribute('aria-expanded', String(open));
    if ('inert' in g.inner) g.inner.inert = !open;
  }

  function syncBrandLists() {
    var active = state.category + '/' + state.sub;
    Object.keys(brandItems).forEach(function (key) {
      brandItems[key].classList.toggle('is-open', key === active);
    });
  }

  /* ---------- Gambar produk + placeholder ---------- */
  function addImage(media, p, withText) {
    if (!p.image) {
      showPlaceholder(media, withText);
      return;
    }
    var img = document.createElement('img');
    img.alt = p.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () { showPlaceholder(media, withText); }, { once: true });
    img.src = p.image;
    media.appendChild(img);
  }

  function showPlaceholder(media, withText) {
    media.textContent = '';
    media.classList.add('is-missing');
    var ph = el('div', 'cat-placeholder');
    ph.innerHTML = ICON_IMAGE;
    if (withText) ph.appendChild(el('span', null, 'Foto produk belum tersedia'));
    media.appendChild(ph);
  }

  /* ---------- Kartu produk ---------- */
  function createCard(p, index) {
    var card = el('article', 'cat-card');
    card.style.setProperty('--i', Math.min(index, 8));

    var link = document.createElement('a');
    link.className = 'cat-card-link';
    link.href = '#';
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(p);
    });

    var media = el('div', 'cat-image');
    addImage(media, p, false);

    var info = el('div', 'cat-info');
    var label = subLabel(p.category, p.subcategory);
    if (p.brand) label += ' \u00B7 ' + brandLabel(p.category, p.subcategory, p.brand);
    info.appendChild(el('p', 'cat-label', label));
    info.appendChild(el('h3', 'cat-name', p.name));
    if (p.variant) info.appendChild(el('p', 'cat-variant', p.variant));

    // kemasan & harga hanya ditampilkan di pop-up detail
    var foot = el('div', 'cat-foot');
    foot.appendChild(el('span', 'cat-detail', 'Lihat Detail'));
    info.appendChild(foot);

    link.appendChild(media);
    link.appendChild(info);
    card.appendChild(link);
    return card;
  }

  function createMore(remaining) {
    var wrap = el('div', 'cat-more');
    var btn = el('button', 'cat-more-btn', 'Muat lebih banyak (' + remaining + ' lagi)');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      state.limit += PAGE;
      render();
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function resetFilters() {
    state.q = '';
    if (searchEl) searchEl.value = '';
    setFilter('all', null, null);
  }

  function createEmpty() {
    var box = el('div', 'cat-empty');
    box.innerHTML = ICON_BOX;

    if (state.q) {
      var term = searchEl ? searchEl.value.trim() : state.q;
      box.appendChild(el('p', null, 'Produk tidak ditemukan untuk "' + term + '".'));
      var reset = el('button', 'cat-empty-btn', 'Reset filter');
      reset.type = 'button';
      reset.addEventListener('click', resetFilters);
      box.appendChild(reset);
      return box;
    }

    box.appendChild(el('p', null, 'Produk pada kategori ini sedang dipersiapkan.'));
    if (state.category !== 'all' || state.sub) {
      var btn = el('button', 'cat-empty-btn', 'Lihat semua produk');
      btn.type = 'button';
      btn.addEventListener('click', resetFilters);
      box.appendChild(btn);
    }
    return box;
  }

  /* ---------- Render ---------- */
  function searchHaystack(p) {
    var parts = [
      p.name,
      p.packaging || '',
      categoryLabel(p.category),
      subLabel(p.category, p.subcategory),
      brandLabel(p.category, p.subcategory, p.brand)
    ];
    return parts.join(' ').toLowerCase();
  }

  function matches(p) {
    if (state.category !== 'all' && p.category !== state.category) return false;
    if (state.sub && p.subcategory !== state.sub) return false;
    if (state.brand && (p.brand || '') !== state.brand) return false;
    if (state.q && searchHaystack(p).indexOf(state.q) === -1) return false;
    return true;
  }

  function updateStatus(count) {
    var scope = 'Semua produk';
    if (state.category !== 'all') {
      scope = categoryLabel(state.category);
      if (state.sub) scope += ' \u203A ' + subLabel(state.category, state.sub);
      if (state.brand) scope += ' \u203A ' + brandLabel(state.category, state.sub, state.brand);
    }
    if (state.q) {
      var term = searchEl ? searchEl.value.trim() : state.q;
      scope += ' \u00B7 pencarian "' + term + '"';
    }
    statusEl.textContent = '';
    statusEl.appendChild(el('strong', null, scope));
    statusEl.appendChild(document.createTextNode(' \u00B7 ' + count + ' produk'));
  }

  function updateControls() {
    Object.keys(chips).forEach(function (id) {
      chips[id].setAttribute('aria-pressed', String(id === state.category));
    });
    Object.keys(groups).forEach(function (id) {
      groups[id].group.classList.toggle('is-current', id === state.category);
    });
    treeEl.querySelectorAll('.cat-sub').forEach(function (b) {
      var active = b.dataset.category === state.category && b.dataset.sub === state.sub;
      if (active) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    treeEl.querySelectorAll('.cat-brand').forEach(function (b) {
      var active = b.dataset.category === state.category &&
                   b.dataset.sub === state.sub &&
                   b.dataset.brand === state.brand;
      if (active) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    syncBrandLists();
  }

  function render() {
    var list = products.filter(matches);
    var shown = list.slice(0, state.limit);
    var frag = document.createDocumentFragment();

    if (!list.length) {
      frag.appendChild(createEmpty());
    } else {
      shown.forEach(function (p, i) { frag.appendChild(createCard(p, i)); });
      if (list.length > shown.length) frag.appendChild(createMore(list.length - shown.length));
    }

    grid.textContent = '';
    grid.appendChild(frag);
    updateStatus(list.length);
    updateControls();
  }

  function setFilter(category, sub, brand) {
    state.category = category;
    state.sub = sub || null;
    state.brand = brand || null;
    state.limit = PAGE;
    if (category !== 'all') setGroupOpen(category, true);
    render();
  }

  /* ---------- Pop-up detail produk ---------- */
  var modal       = document.getElementById('product-modal');
  var modalDialog = modal ? modal.querySelector('.product-modal-dialog') : null;
  var pmMedia     = document.getElementById('pm-media');
  var pmCat       = document.getElementById('pm-cat');
  var pmTitle     = document.getElementById('pm-title');
  var pmDesc      = document.getElementById('pm-desc');
  var pmVariantRow = document.getElementById('pm-variant-row');
  var pmVariant   = document.getElementById('pm-variant');
  var pmPack      = document.getElementById('pm-pack');
  var pmPrice     = document.getElementById('pm-price');
  var pmClose     = modal ? modal.querySelector('.product-modal-close') : null;
  var lastFocus   = null;

  function setModalImage(p) {
    if (!pmMedia) return;
    pmMedia.textContent = '';
    pmMedia.classList.remove('is-missing');
    if (!p.image) {
      showPlaceholder(pmMedia, true);
      return;
    }
    var img = document.createElement('img');
    img.alt = p.name;
    img.decoding = 'async';
    img.addEventListener('error', function () {
      showPlaceholder(pmMedia, true);
    }, { once: true });
    img.src = p.image;
    pmMedia.appendChild(img);
  }

  function openModal(p) {
    if (!modal) return;
    lastFocus = document.activeElement;

    setModalImage(p);

    var path = categoryLabel(p.category) + ' \u203A ' + subLabel(p.category, p.subcategory);
    if (p.brand) path += ' \u203A ' + brandLabel(p.category, p.subcategory, p.brand);
    if (pmCat) pmCat.textContent = path;

    if (pmTitle) pmTitle.textContent = p.name;
    if (pmDesc) pmDesc.textContent = p.description || '';
    if (pmPack) pmPack.textContent = p.packaging || '-';
    if (pmPrice) pmPrice.textContent = formatPrice(p.price);

    if (pmVariantRow && pmVariant) {
      if (p.variant) {
        pmVariant.textContent = p.variant;
        pmVariantRow.hidden = false;
      } else {
        pmVariant.textContent = '';
        pmVariantRow.hidden = true;
      }
    }

    modal.hidden = false;
    document.body.classList.add('modal-open');
    if (pmClose) pmClose.focus();
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key !== 'Tab' || !modalDialog) return;

      var focusable = modalDialog.querySelectorAll(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ---------- Sidebar versi mobile ---------- */
  function syncSideA11y() {
    if (!side || !sideToggle) return;
    if (mobileMq.matches) {
      sideToggle.removeAttribute('aria-disabled');
      sideToggle.tabIndex = 0;
      sideToggle.setAttribute('aria-expanded', String(!side.classList.contains('is-collapsed')));
    } else {
      sideToggle.setAttribute('aria-disabled', 'true');
      sideToggle.tabIndex = -1;
      sideToggle.setAttribute('aria-expanded', 'true');
    }
  }

  function setSideCollapsed(collapsed) {
    side.classList.toggle('is-collapsed', collapsed);
    syncSideA11y();
  }

  /* ---------- Event ---------- */
  chipsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.cat-chip');
    if (b) setFilter(b.dataset.category, null, null);
  });

  treeEl.addEventListener('click', function (e) {
    var brand = e.target.closest('.cat-brand');
    if (brand) {
      setFilter(brand.dataset.category, brand.dataset.sub, brand.dataset.brand);
      return;
    }

    var sub = e.target.closest('.cat-sub');
    if (sub) {
      setFilter(sub.dataset.category, sub.dataset.sub, null);
      if (mobileMq.matches) {
        setSideCollapsed(true);
        toolbar.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
      return;
    }

    var head = e.target.closest('.cat-group-btn');
    if (head) {
      var group = head.closest('.cat-group');
      setGroupOpen(group.dataset.category, !group.classList.contains('is-open'));
    }
  });

  if (sideToggle) {
    sideToggle.addEventListener('click', function () {
      if (!mobileMq.matches) return;
      setSideCollapsed(!side.classList.contains('is-collapsed'));
    });
  }

  if (searchEl) {
    var searchTimer;
    searchEl.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.q = searchEl.value.trim().toLowerCase();
        state.limit = PAGE;
        render();
      }, 130);
    });
    searchEl.addEventListener('search', function () {
      if (!searchEl.value) {
        state.q = '';
        state.limit = PAGE;
        render();
      }
    });
  }

  if (mobileMq.addEventListener) mobileMq.addEventListener('change', syncSideA11y);
  else if (mobileMq.addListener) mobileMq.addListener(syncSideA11y);

  /* ---------- Mulai ---------- */
  buildChips();
  buildTree();
  Object.keys(groups).forEach(function (id) { setGroupOpen(id, true); });
  syncSideA11y();
  render();
})();
