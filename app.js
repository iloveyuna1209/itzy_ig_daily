(() => {
  const PAGE_SIZE = 20;
  const BG_IMAGE_URL = 'assets/bg/itzy-bg.jpg';

  const data = window.DIARY_DATA || { updatedAt: '—', members: [], entries: [] };
  const memberMap = new Map(data.members.map((m) => [m.id, m]));

  const membersViewEl = document.getElementById('members-view');
  const timelineViewEl = document.getElementById('timeline-view');
  const galleryEl = document.getElementById('member-gallery');
  const panelEl = document.getElementById('diary-panel');
  const panelAccentEl = document.getElementById('panel-accent');
  const panelTitleEl = document.getElementById('panel-title');
  const panelHandleEl = document.getElementById('panel-handle');
  const diaryListEl = document.getElementById('diary-list');
  const diaryPaginationEl = document.getElementById('diary-pagination');
  const timelineListEl = document.getElementById('timeline-list');
  const timelinePaginationEl = document.getElementById('timeline-pagination');
  const closePanelBtn = document.getElementById('close-panel');
  const bgPreviewBtn = document.getElementById('bg-preview-btn');
  const dockToggleBtn = document.getElementById('dock-toggle-btn');
  const dockToggleIcon = document.getElementById('dock-toggle-icon');
  const dockToggleText = document.getElementById('dock-toggle-text');
  const totalCountEl = document.getElementById('total-count');
  const updatedAtEl = document.getElementById('updated-at');

  const switchBtns = document.querySelectorAll('.switch-btn');
  const searchInput = document.getElementById('search-input');
  const dateFromInput = document.getElementById('date-from');
  const dateToInput = document.getElementById('date-to');
  const tagSelect = document.getElementById('tag-select');
  const memberDropdownEl = document.getElementById('member-dropdown');
  const memberDropdownTrigger = document.getElementById('member-dropdown-trigger');
  const memberDropdownLabel = document.getElementById('member-dropdown-label');
  const memberDropdownMenu = document.getElementById('member-dropdown-menu');
  const resetFiltersBtn = document.getElementById('reset-filters');

  const lightboxEl = document.getElementById('lightbox');
  const lbImgEl = document.getElementById('lb-img');
  const lbCaptionEl = document.getElementById('lb-caption');
  const lbCloseBtn = document.getElementById('lb-close');
  const lbPrevBtn = document.getElementById('lb-prev');
  const lbNextBtn = document.getElementById('lb-next');

  let currentView = 'members';
  let activeMemberId = null;
  let isMembersDocked = false;
  let memberPage = 1;
  let timelinePage = 1;
  const selectedTimelineMembers = new Set();

  let lbImages = [];
  let lbIndex = 0;
  let lbLabel = '';

  const filters = {
    query: '',
    dateFrom: '',
    dateTo: '',
    tag: '',
  };

  totalCountEl.textContent = `${data.entries.length} 篇日記`;
  updatedAtEl.textContent = `最後更新 ${data.updatedAt}`;

  function populateTagOptions() {
    const tags = new Set();
    data.entries.forEach((e) => (e.tags || []).forEach((t) => tags.add(t)));
    [...tags]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      .forEach((tag) => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = `#${tag}`;
        tagSelect.appendChild(opt);
      });
  }

  function hasActiveFilters() {
    return Boolean(
      filters.query ||
        filters.dateFrom ||
        filters.dateTo ||
        (currentView === 'members' && filters.tag) ||
        (currentView === 'timeline' && selectedTimelineMembers.size > 0)
    );
  }

  function matchesFilters(entry, applyTagFilter = true) {
    if (filters.dateFrom && entry.date < filters.dateFrom) return false;
    if (filters.dateTo && entry.date > filters.dateTo) return false;
    if (applyTagFilter && filters.tag && !(entry.tags || []).includes(filters.tag)) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const member = memberMap.get(entry.memberId);
      const haystack = [
        entry.originalText,
        entry.translatedText,
        ...(entry.tags || []),
        member?.name,
        member?.zhName,
        member?.koName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }

  function sortByNewest(a, b) {
    const byDate = (b.date || '').localeCompare(a.date || '');
    if (byDate !== 0) return byDate;
    return (b.id || '').localeCompare(a.id || '');
  }

  function getFilteredEntries(memberId = null, memberSet = null, applyTagFilter = true) {
    return data.entries
      .filter((entry) => {
        if (memberId && entry.memberId !== memberId) return false;
        if (memberSet && memberSet.size > 0 && !memberSet.has(entry.memberId)) return false;
        return matchesFilters(entry, applyTagFilter);
      })
      .sort(sortByNewest);
  }

  function getMemberCover(member) {
    if (member.coverImage) return member.coverImage;
    const latestWithImg = data.entries
      .filter((e) => e.memberId === member.id && e.images && e.images.length > 0)
      .sort(sortByNewest)[0];
    return latestWithImg ? latestWithImg.images[0] : '';
  }

  function renderGallery() {
    galleryEl.innerHTML = '';
    data.members.forEach((member) => {
      const count = getFilteredEntries(member.id).length;
      const cover = getMemberCover(member);
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.memberId = member.id;
      card.className = `member-card${activeMemberId === member.id ? ' active' : ''}`;
      card.style.setProperty('--accent', member.accent);

      const coverStyle = cover ? `style="background-image: url('${escapeAttr(cover)}')"` : '';
      card.innerHTML = `
        <div class="member-cover" ${coverStyle}></div>
        <div class="member-body">
          <div class="member-name">${member.name} · ${member.zhName}</div>
          <div class="member-sub">${member.koName} · ${member.handle}</div>
          <div class="member-stats">
            <span class="member-role">${member.subtitle || ''}</span>
            <span>${count} 篇</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => selectMember(member.id));
      galleryEl.appendChild(card);
    });
  }

  function toggleDockWithFlip() {
    const cards = [...galleryEl.querySelectorAll('.member-card')];
    const firstRects = new Map(cards.map((card) => [card.dataset.memberId, card.getBoundingClientRect()]));

    isMembersDocked = !isMembersDocked;
    membersViewEl.classList.toggle('is-docked', isMembersDocked);
    dockToggleBtn.classList.toggle('active', isMembersDocked);
    dockToggleBtn.setAttribute('aria-pressed', String(isMembersDocked));
    dockToggleIcon.textContent = isMembersDocked ? '▤' : '◧';
    dockToggleText.textContent = isMembersDocked ? '展開卡片' : '收合至左側';

    cards.forEach((card, idx) => {
      const first = firstRects.get(card.dataset.memberId);
      const last = card.getBoundingClientRect();
      if (!first || !last.width || !last.height) return;

      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = first.width / last.width;
      const sy = first.height / last.height;

      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
        return;
      }

      card.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: 'translate(0, 0) scale(1, 1)' },
        ],
        {
          duration: 1920,
          delay: idx * 60,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'backwards',
        }
      );
    });
  }

  function renderMemberDropdown() {
    if (selectedTimelineMembers.size === 0) {
      memberDropdownLabel.textContent = '全部成員';
    } else if (selectedTimelineMembers.size === 1) {
      const onlyId = [...selectedTimelineMembers][0];
      const m = memberMap.get(onlyId);
      memberDropdownLabel.textContent = m ? `${m.name} ${m.koName}` : onlyId;
    } else {
      memberDropdownLabel.textContent = `已選 ${selectedTimelineMembers.size} 位`;
    }

    memberDropdownMenu.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `dropdown-option${selectedTimelineMembers.size === 0 ? ' active' : ''}`;
    allBtn.innerHTML = `
      <span class="dropdown-option-left"><span class="pill-dot" style="--pill-color: #161822"></span><span>全部成員</span></span>
      <span class="dropdown-check">✓</span>
    `;
    allBtn.addEventListener('click', () => {
      selectedTimelineMembers.clear();
      timelinePage = 1;
      renderAll();
    });
    memberDropdownMenu.appendChild(allBtn);

    data.members.forEach((member) => {
      const isSelected = selectedTimelineMembers.has(member.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dropdown-option${isSelected ? ' active' : ''}`;
      btn.innerHTML = `
        <span class="dropdown-option-left">
          <span class="pill-dot" style="--pill-color: ${escapeAttr(member.accent)}"></span>
          <span>${escapeHtml(member.name)} ${escapeHtml(member.koName)}</span>
        </span>
        <span class="dropdown-check">✓</span>
      `;
      btn.addEventListener('click', () => {
        if (selectedTimelineMembers.has(member.id)) {
          selectedTimelineMembers.delete(member.id);
        } else {
          selectedTimelineMembers.add(member.id);
        }
        if (selectedTimelineMembers.size === data.members.length) {
          selectedTimelineMembers.clear();
        }
        timelinePage = 1;
        renderAll();
      });
      memberDropdownMenu.appendChild(btn);
    });
  }

  function closeMemberDropdown() {
    memberDropdownMenu.classList.add('hidden');
    memberDropdownTrigger.setAttribute('aria-expanded', 'false');
  }

  function populateCardContent(container, entry) {
    const member = memberMap.get(entry.memberId) || {
      name: entry.memberId,
      zhName: '',
      koName: entry.memberId,
      accent: '#666',
    };

    const videoBadgeHtml =
      entry.mediaType === 'video' ? `<span class="media-badge">REELS</span>` : '';

    const postLinkHtml = entry.postUrl
      ? `<a class="post-link" href="${escapeAttr(entry.postUrl)}" target="_blank" rel="noopener noreferrer">原貼文 ↗</a>`
      : '';

    const tagsHtml = (entry.tags || [])
      .map((tag) => `<button type="button" class="tag" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`)
      .join('');

    container.innerHTML = `
      <div class="diary-meta">
        <div class="diary-meta-left">
          <time class="diary-date">${escapeHtml(entry.date)}</time>
          ${videoBadgeHtml}
          ${postLinkHtml}
        </div>
        <div class="tag-list">${tagsHtml}</div>
      </div>
      <div class="diary-body">
        <div class="bilingual">
          <div class="lang-box">
            <span class="lang-label">KR</span>${escapeHtml(entry.originalText || '')}
          </div>
          <div class="lang-box">
            <span class="lang-label">繁中</span>${escapeHtml(entry.translatedText || '')}
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('.tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (currentView === 'members') {
          filters.tag = btn.dataset.tag;
          tagSelect.value = filters.tag;
        } else {
          filters.query = btn.dataset.tag;
          searchInput.value = filters.query;
        }
        resetPages();
        renderAll();
      });
    });

    if (entry.images && entry.images.length > 0) {
      const row = document.createElement('div');
      row.className = 'thumb-row';
      entry.images.forEach((src, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb-btn';
        const playOverlay = entry.mediaType === 'video' && idx === 0 ? `<span class="play-overlay">▶</span>` : '';
        btn.innerHTML = `<img src="${escapeAttr(src)}" alt="${escapeAttr(member.name)} ${escapeAttr(entry.date)} 照片 ${idx + 1}" loading="lazy" />${playOverlay}`;
        btn.addEventListener('click', () => openLightbox(entry.images, idx, `${member.name} · ${entry.date}`));
        row.appendChild(btn);
      });
      container.querySelector('.diary-body').appendChild(row);
    }
  }

  function buildDiaryCard(entry) {
    const article = document.createElement('article');
    article.className = 'diary-item';
    populateCardContent(article, entry);
    return article;
  }

  function buildTimelineRow(entry, idx) {
    const member = memberMap.get(entry.memberId) || {
      name: entry.memberId,
      koName: entry.memberId,
      accent: '#2b3040',
    };
    const sideClass = idx % 2 === 0 ? 'is-right' : 'is-left';

    const row = document.createElement('div');
    row.className = `timeline-row ${sideClass}`;

    const center = document.createElement('div');
    center.className = 'timeline-center';
    center.innerHTML = `<div class="timeline-node" style="--node-color: ${escapeAttr(member.accent)}" title="${escapeAttr(member.name)} ${escapeAttr(member.zhName || '')}">${escapeHtml(member.koName)}</div>`;

    const side = document.createElement('div');
    side.className = 'timeline-side';

    const connector = document.createElement('div');
    connector.className = 'timeline-connector';

    const card = document.createElement('article');
    card.className = 'timeline-card';
    populateCardContent(card, entry);

    side.appendChild(connector);
    side.appendChild(card);

    row.appendChild(center);
    row.appendChild(side);
    return row;
  }

  function buildPageNumbers(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  }

  function renderPagination(navEl, totalItems, currentPage, onPageChange) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    navEl.innerHTML = '';

    if (totalItems === 0 || totalPages <= 1) {
      navEl.classList.add('hidden');
      return;
    }

    navEl.classList.remove('hidden');

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '‹ 上一頁';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
    navEl.appendChild(prevBtn);

    buildPageNumbers(currentPage, totalPages).forEach((item) => {
      if (item === '...') {
        const span = document.createElement('span');
        span.className = 'page-ellipsis';
        span.textContent = '…';
        navEl.appendChild(span);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-btn${item === currentPage ? ' active' : ''}`;
      btn.textContent = String(item);
      btn.disabled = item === currentPage;
      btn.addEventListener('click', () => onPageChange(item));
      navEl.appendChild(btn);
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '下一頁 ›';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
    navEl.appendChild(nextBtn);

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `第 ${currentPage} / ${totalPages} 頁（共 ${totalItems} 篇）`;
    navEl.appendChild(info);
  }

  function renderDiaryPanel() {
    if (!activeMemberId) {
      panelEl.classList.add('hidden');
      return;
    }
    const member = memberMap.get(activeMemberId);
    if (!member) return;

    panelAccentEl.style.background = member.accent;
    panelTitleEl.textContent = `${member.name} ${member.zhName} (${member.koName})`;
    panelHandleEl.textContent = member.handle;
    panelEl.classList.remove('hidden');

    const entries = getFilteredEntries(activeMemberId, null, true);
    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    if (memberPage > totalPages) memberPage = totalPages;

    const start = (memberPage - 1) * PAGE_SIZE;
    const pageEntries = entries.slice(start, start + PAGE_SIZE);

    diaryListEl.innerHTML = '';

    if (entries.length === 0) {
      diaryListEl.innerHTML = `
        <div class="empty-state">
          ${hasActiveFilters() ? '沒有符合目前篩選條件的日記。' : `尚無 ${member.name} ${member.zhName} 的日記紀錄。<br />將 IG 貼文 <code>.mhtml</code> 放入 <code>raw/${member.id}/</code> 後通知 AI 解析匯入。`}
        </div>
      `;
      diaryPaginationEl.classList.add('hidden');
      return;
    }

    pageEntries.forEach((entry) => diaryListEl.appendChild(buildDiaryCard(entry)));
    renderPagination(diaryPaginationEl, entries.length, memberPage, (newPage) => {
      memberPage = newPage;
      renderDiaryPanel();
      panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderTimeline() {
    renderMemberDropdown();

    const entries = getFilteredEntries(null, selectedTimelineMembers, false);
    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    if (timelinePage > totalPages) timelinePage = totalPages;

    const start = (timelinePage - 1) * PAGE_SIZE;
    const pageEntries = entries.slice(start, start + PAGE_SIZE);

    timelineListEl.innerHTML = '';

    if (entries.length === 0) {
      timelineListEl.classList.remove('has-items');
      timelineListEl.innerHTML = `
        <div class="empty-state">
          ${hasActiveFilters() ? '沒有符合目前篩選條件的日記。' : '尚無任何日記紀錄。將 IG 貼文 <code>.mhtml</code> 放入 <code>raw/&lt;member&gt;/</code> 後通知 AI 解析匯入。'}
        </div>
      `;
      timelinePaginationEl.classList.add('hidden');
      return;
    }

    timelineListEl.classList.add('has-items');
    timelineListEl.insertAdjacentHTML(
      'beforeend',
      '<span class="timeline-cap timeline-cap-top" aria-hidden="true"></span><span class="timeline-cap timeline-cap-bottom" aria-hidden="true"></span>'
    );

    pageEntries.forEach((entry, idx) => timelineListEl.appendChild(buildTimelineRow(entry, idx)));
    renderPagination(timelinePaginationEl, entries.length, timelinePage, (newPage) => {
      timelinePage = newPage;
      renderTimeline();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function resetPages() {
    memberPage = 1;
    timelinePage = 1;
  }

  function renderAll() {
    const isMembers = currentView === 'members';
    resetFiltersBtn.classList.toggle('hidden', !hasActiveFilters());

    tagSelect.classList.toggle('hidden', !isMembers);
    dockToggleBtn.classList.toggle('hidden', !isMembers);
    memberDropdownEl.classList.toggle('hidden', isMembers);

    if (isMembers) {
      closeMemberDropdown();
      membersViewEl.classList.remove('hidden');
      timelineViewEl.classList.add('hidden');
      renderGallery();
      renderDiaryPanel();
    } else {
      membersViewEl.classList.add('hidden');
      timelineViewEl.classList.remove('hidden');
      renderTimeline();
    }
  }

  function selectMember(memberId) {
    activeMemberId = activeMemberId === memberId ? null : memberId;
    memberPage = 1;
    renderAll();
  }

  function openLightbox(images, index, label) {
    lbImages = images;
    lbIndex = index;
    lbLabel = label;
    updateLightbox();
    lightboxEl.classList.remove('hidden');
  }

  function updateLightbox() {
    lbImgEl.src = lbImages[lbIndex];
    lbCaptionEl.textContent = lbImages.length > 1 ? `${lbLabel} (${lbIndex + 1} / ${lbImages.length})` : lbLabel;
    lbPrevBtn.classList.toggle('hidden', lbImages.length <= 1);
    lbNextBtn.classList.toggle('hidden', lbImages.length <= 1);
  }

  function closeLightbox() {
    lightboxEl.classList.add('hidden');
    lbImgEl.src = '';
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  bgPreviewBtn.addEventListener('click', () => {
    openLightbox([BG_IMAGE_URL], 0, 'ITZY 背景原圖');
  });

  dockToggleBtn.addEventListener('click', toggleDockWithFlip);

  memberDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !memberDropdownMenu.classList.contains('hidden');
    memberDropdownMenu.classList.toggle('hidden', isOpen);
    memberDropdownTrigger.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!memberDropdownEl.contains(e.target)) {
      closeMemberDropdown();
    }
  });

  switchBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      switchBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      renderAll();
    });
  });

  searchInput.addEventListener('input', (e) => {
    filters.query = e.target.value.trim();
    resetPages();
    renderAll();
  });

  dateFromInput.addEventListener('change', (e) => {
    filters.dateFrom = e.target.value;
    resetPages();
    renderAll();
  });

  dateToInput.addEventListener('change', (e) => {
    filters.dateTo = e.target.value;
    resetPages();
    renderAll();
  });

  tagSelect.addEventListener('change', (e) => {
    filters.tag = e.target.value;
    resetPages();
    renderAll();
  });

  resetFiltersBtn.addEventListener('click', () => {
    filters.query = '';
    filters.dateFrom = '';
    filters.dateTo = '';
    filters.tag = '';
    selectedTimelineMembers.clear();
    searchInput.value = '';
    dateFromInput.value = '';
    dateToInput.value = '';
    tagSelect.value = '';
    resetPages();
    renderAll();
  });

  closePanelBtn.addEventListener('click', () => {
    activeMemberId = null;
    renderAll();
  });

  lbCloseBtn.addEventListener('click', closeLightbox);
  lightboxEl.addEventListener('click', (e) => {
    if (e.target === lightboxEl) closeLightbox();
  });
  lbPrevBtn.addEventListener('click', () => {
    lbIndex = (lbIndex - 1 + lbImages.length) % lbImages.length;
    updateLightbox();
  });
  lbNextBtn.addEventListener('click', () => {
    lbIndex = (lbIndex + 1) % lbImages.length;
    updateLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMemberDropdown();
      if (!lightboxEl.classList.contains('hidden')) closeLightbox();
      return;
    }
    if (lightboxEl.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') lbPrevBtn.click();
    if (e.key === 'ArrowRight') lbNextBtn.click();
  });

  populateTagOptions();
  renderAll();
  initMusicPlayer();

  function initMusicPlayer() {
    const musicData = window.MUSIC_DATA || { tracks: [] };
    const tracks = Array.isArray(musicData.tracks) ? musicData.tracks : [];

    const anchorEl = document.getElementById('music-anchor');
    const toggleBtn = document.getElementById('vinyl-toggle-btn');
    const spinnerEl = document.getElementById('vinyl-spinner');
    const centerCoverEl = document.getElementById('vinyl-center-cover');
    const popoverEl = document.getElementById('music-popover');

    const titleEl = document.getElementById('music-title');
    const artistEl = document.getElementById('music-artist');
    const dateEl = document.getElementById('music-date');
    const statusEl = document.getElementById('music-status');
    const playlistEl = document.getElementById('music-playlist');

    const coverImgEl = document.getElementById('music-cover-img');
    const coverFallbackEl = document.getElementById('music-cover-fallback');
    const prevBtn = document.getElementById('music-prev-btn');
    const playBtn = document.getElementById('music-play-btn');
    const nextBtn = document.getElementById('music-next-btn');
    const progressEl = document.getElementById('music-progress');
    const timeCurEl = document.getElementById('music-time-cur');
    const timeDurEl = document.getElementById('music-time-dur');

    if (!anchorEl || !toggleBtn || !popoverEl) return;

    let currentIdx = 0;
    let ytPlayer = null;
    let ytReady = false;
    let ytApiRequested = false;
    let pendingPlay = false;
    let isPlaying = false;
    let isSeeking = false;
    let progressTimer = null;

    function extractYoutubeId(url) {
      if (!url) return '';
      const str = String(url).trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(str)) return str;
      const patterns = [
        /[?&]v=([A-Za-z0-9_-]{11})/,
        /youtu\.be\/([A-Za-z0-9_-]{11})/,
        /youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/,
      ];
      for (const pat of patterns) {
        const m = str.match(pat);
        if (m) return m[1];
      }
      return '';
    }

    function formatTime(sec) {
      if (!Number.isFinite(sec) || sec < 0) return '0:00';
      const total = Math.floor(sec);
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    function setStatus(msg) {
      if (!msg) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
      } else {
        statusEl.textContent = msg;
        statusEl.classList.remove('hidden');
      }
    }

    function setPlayingUI(playing) {
      isPlaying = playing;
      spinnerEl.classList.toggle('is-playing', playing);
      playBtn.textContent = playing ? '❚❚' : '▶';
    }

    function stopProgressLoop() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }

    function startProgressLoop() {
      stopProgressLoop();
      progressTimer = setInterval(() => {
        if (!ytPlayer || !ytReady || isSeeking) return;
        const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
        const cur = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
        if (dur > 0) {
          progressEl.max = String(dur);
          progressEl.value = String(cur);
          timeCurEl.textContent = formatTime(cur);
          timeDurEl.textContent = formatTime(dur);
        }
      }, 300);
    }

    function renderTrackUI() {
      const track = tracks[currentIdx];
      if (!track) {
        titleEl.textContent = '尚無歌曲';
        artistEl.textContent = '請於 data/music.js 新增';
        dateEl.textContent = '';
        playBtn.disabled = true;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }

      titleEl.textContent = track.title || '未命名歌曲';
      artistEl.textContent = track.artist || 'ITZY';
      dateEl.textContent = track.releaseDate ? `發行日 ${track.releaseDate}` : '';

      if (track.coverImage) {
        centerCoverEl.style.backgroundImage = `url('${escapeAttr(track.coverImage)}')`;
        coverImgEl.src = track.coverImage;
        coverImgEl.alt = `${track.title || '歌曲'} 封面`;
        coverImgEl.classList.remove('hidden');
        coverFallbackEl.classList.add('hidden');
      } else {
        centerCoverEl.style.backgroundImage = '';
        coverImgEl.src = '';
        coverImgEl.classList.add('hidden');
        coverFallbackEl.classList.remove('hidden');
      }

      const hasMulti = tracks.length > 1;
      prevBtn.disabled = !hasMulti;
      nextBtn.disabled = !hasMulti;

      playlistEl.innerHTML = '';
      if (hasMulti) {
        playlistEl.classList.remove('hidden');
        tracks.forEach((t, i) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = `music-track-item${i === currentIdx ? ' active' : ''}`;
          item.textContent = `${i + 1}. ${t.title} — ${t.artist}`;
          item.addEventListener('click', () => loadTrack(i, true));
          playlistEl.appendChild(item);
        });
      } else {
        playlistEl.classList.add('hidden');
      }
    }

    function ensureYoutubePlayer(autoPlay) {
      const track = tracks[currentIdx];
      if (!track) return;
      const videoId = extractYoutubeId(track.youtubeUrl);
      if (!videoId) {
        setStatus('YouTube 連結格式無效');
        return;
      }

      if (ytReady && ytPlayer) {
        if (autoPlay) ytPlayer.playVideo();
        return;
      }

      pendingPlay = autoPlay;

      if (window.YT && window.YT.Player) {
        createPlayer(videoId);
        return;
      }

      if (!ytApiRequested) {
        ytApiRequested = true;
        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (typeof prevReady === 'function') prevReady();
          const currentTrack = tracks[currentIdx];
          const vid = currentTrack ? extractYoutubeId(currentTrack.youtubeUrl) : '';
          if (vid) createPlayer(vid);
        };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    function createPlayer(videoId) {
      if (ytPlayer) return;
      const playerVars = {
        playsinline: 1,
        controls: 0,
        rel: 0,
      };
      if (window.location.protocol.startsWith('http')) {
        playerVars.origin = window.location.origin;
      }

      ytPlayer = new window.YT.Player('yt-player-host', {
        height: '1',
        width: '1',
        videoId,
        playerVars,
        events: {
          onReady: () => {
            ytReady = true;
            setStatus('');
            const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
            if (dur > 0) {
              progressEl.max = String(dur);
              timeDurEl.textContent = formatTime(dur);
            }
            if (pendingPlay) {
              pendingPlay = false;
              ytPlayer.playVideo();
            }
          },
          onStateChange: (e) => {
            const state = e.data;
            if (state === window.YT.PlayerState.PLAYING) {
              setStatus('');
              setPlayingUI(true);
              startProgressLoop();
            } else if (state === window.YT.PlayerState.PAUSED) {
              setPlayingUI(false);
              stopProgressLoop();
            } else if (state === window.YT.PlayerState.ENDED) {
              setPlayingUI(false);
              stopProgressLoop();
              if (tracks.length > 1) {
                loadTrack((currentIdx + 1) % tracks.length, true);
              } else if (ytPlayer) {
                ytPlayer.seekTo(0, true);
                ytPlayer.playVideo();
              }
            }
          },
          onError: (e) => {
            setPlayingUI(false);
            stopProgressLoop();
            if (window.location.protocol === 'file:') {
              setStatus('本機 file:// 受 YouTube 嵌入限制，請透過 GitHub Pages 或 localhost 開啟播放。');
            } else if (e.data === 101 || e.data === 150 || e.data === 153) {
              setStatus('此影片禁止外部嵌入，請改用該曲的 YouTube Topic 音軌連結。');
            } else {
              setStatus(`影片載入失敗（錯誤碼 ${e.data}）`);
            }
          },
        },
      });
    }

    function loadTrack(index, autoPlay) {
      if (!tracks.length) return;
      currentIdx = (index + tracks.length) % tracks.length;
      progressEl.value = '0';
      timeCurEl.textContent = '0:00';
      timeDurEl.textContent = '0:00';
      setStatus('');
      renderTrackUI();

      const videoId = extractYoutubeId(tracks[currentIdx].youtubeUrl);
      if (!videoId) {
        setStatus('YouTube 連結格式無效');
        return;
      }

      if (ytReady && ytPlayer) {
        if (autoPlay) {
          ytPlayer.loadVideoById(videoId);
        } else {
          ytPlayer.cueVideoById(videoId);
          setPlayingUI(false);
        }
      } else {
        ensureYoutubePlayer(autoPlay);
      }
    }

    function closePopover() {
      popoverEl.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = popoverEl.classList.contains('hidden');
      popoverEl.classList.toggle('hidden', !willOpen);
      toggleBtn.setAttribute('aria-expanded', String(willOpen));
      if (willOpen && !ytReady) {
        ensureYoutubePlayer(false);
      }
    });

    playBtn.addEventListener('click', () => {
      if (!tracks.length) return;
      if (!ytReady || !ytPlayer) {
        setStatus('載入音樂中...');
        ensureYoutubePlayer(true);
        return;
      }
      if (isPlaying) {
        ytPlayer.pauseVideo();
      } else {
        ytPlayer.playVideo();
      }
    });

    prevBtn.addEventListener('click', () => loadTrack(currentIdx - 1, true));
    nextBtn.addEventListener('click', () => loadTrack(currentIdx + 1, true));

    progressEl.addEventListener('input', () => {
      isSeeking = true;
      timeCurEl.textContent = formatTime(Number(progressEl.value));
    });

    progressEl.addEventListener('change', () => {
      const targetSec = Number(progressEl.value);
      if (ytReady && ytPlayer && ytPlayer.seekTo) {
        ytPlayer.seekTo(targetSec, true);
      }
      isSeeking = false;
    });

    document.addEventListener('click', (e) => {
      if (!anchorEl.contains(e.target)) {
        closePopover();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
    });

    renderTrackUI();
  }
})();
