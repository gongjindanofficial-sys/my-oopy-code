(function() {
  let isFullyLoaded = false;
  let isLoadingAll = false;
  let isObserverPaused = false;

  // DOM 관찰자 일시 중지 도우미
  function withObserverPaused(fn) {
    isObserverPaused = true;
    try { fn(); } finally { setTimeout(() => { isObserverPaused = false; }, 50); }
  }

  // 노션 '속성 더 보기' 버튼 제거
  function removePropertyMoreBtn() {
    document.querySelectorAll('div, span, p').forEach(el => {
      if (!el.getAttribute('data-oopy-checked') && el.children.length === 0 && el.textContent.includes('속성') && el.textContent.includes('더 보기')) {
        el.setAttribute('data-oopy-checked', 'true');
        const btn = el.closest('[role="button"]') || el.closest('div[style*="cursor"]') || el;
        if (btn) btn.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // 1. 갤러리 카드 항목을 정확히 탐색
  function getGalleryCards() {
    // 노션 및 우피에서 생성되는 카드의 최상위 링크/버튼 엘리먼트 수집
    let cards = Array.from(document.querySelectorAll('.notion-collection-card, [class*="collection-card"]'));
    
    if (cards.length === 0) {
      const view = document.querySelector('.notion-gallery-view, .notion-collection_view-block, [class*="gallery"]');
      if (view) {
        cards = Array.from(view.querySelectorAll('a[href], div[role="button"]')).filter(el => {
          return el.querySelector('img') || el.textContent.trim().length > 0;
        });
      }
    }
    return cards;
  }

  // 2. 카드의 개별 숨김/노출 처리 대상 엘리먼트 반환 (부모 컨테이너가 숨겨지는 버그 방지)
  function getCardElementToHide(card) {
    // 최상위 컨테이너까지 올라가지 않고, 카드 개별 a 태그나 카드 자체만 반환
    const anchor = card.closest('a');
    if (anchor && anchor.parentElement && !anchor.parentElement.classList.contains('notion-gallery-view')) {
      // a 태그 바로 위 개별 카드 래퍼가 있는 경우
      if (anchor.parentElement.children.length === 1 || anchor.parentElement.classList.toString().includes('card')) {
        return anchor.parentElement;
      }
    }
    return anchor || card;
  }

  // 3. 카드 제목(기관명) 추출
  function getCardTitle(card) {
    const titleEl = card.querySelector('.notion-property-title, [class*="property-title"], [class*="card__title"]');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    
    // Fallback: 카드 내 첫 번째 유효한 텍스트 노드 탐색
    const textEls = card.querySelectorAll('span, p, div, b, strong');
    for (let i = 0; i < textEls.length; i++) {
      const txt = textEls[i].textContent.trim();
      if (txt && !txt.includes('★') && !txt.includes('http') && !txt.startsWith('@') && txt.length < 50) {
        return txt;
      }
    }
    return card.textContent.trim();
  }

  // 4. 노션 데이터베이스의 '더 보기' 버튼을 자동으로 끝까지 클릭하여 모든 리뷰 데이터 로드
  function loadAllCards(onProgress, onComplete) {
    if (isFullyLoaded) { 
      if (onComplete) onComplete(); 
      return; 
    }
    if (isLoadingAll) return;
    isLoadingAll = true;

    const statusEl = document.getElementById('oopy-search-status');
    if (statusEl) statusEl.innerText = '⏳ 전체 기관 데이터를 불러오는 중입니다...';

    const timer = setInterval(() => {
      // '더 보기' / 'Load more' / 'More' 버튼 탐색
      const btns = Array.from(document.querySelectorAll('div[role="button"], span, div, button'))
        .filter(el => {
          const t = el.textContent.trim();
          return (t === '더 보기' || t === 'Load more' || t === '더보기' || t === 'More') && el.children.length <= 1;
        });

      if (btns.length > 0) {
        const btn = btns[0].closest('[role="button"]') || btns[0];
        btn.click();
        if (onProgress) onProgress();
      } else {
        clearInterval(timer);
        isLoadingAll = false;
        isFullyLoaded = true;
        if (statusEl) statusEl.innerText = '원하시는 기관명을 검색해 보세요.';
        if (onComplete) onComplete();
      }
    }, 350);
  }

  // 5. 검색 필터링 로직
  function filterCards() {
    const input = document.getElementById('oopy-search-input');
    if (!input) return;

    const query = input.value.trim().toLowerCase();
    const clearBtn = document.getElementById('oopy-search-clear');
    const countWrapper = document.getElementById('oopy-search-count-wrapper');
    const countEl = document.getElementById('oopy-search-count');
    const noResultsEl = document.getElementById('oopy-no-results');

    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

    const cards = getGalleryCards();
    let matchCount = 0;

    withObserverPaused(() => {
      cards.forEach(card => {
        const targetElement = getCardElementToHide(card);
        const name = getCardTitle(card).toLowerCase();

        if (!query || name.includes(query)) {
          targetElement.style.removeProperty('display');
          matchCount++;
        } else {
          targetElement.style.setProperty('display', 'none', 'important');
        }
      });
    });

    if (query) {
      if (countWrapper) countWrapper.style.display = 'inline';
      if (countEl) countEl.innerText = matchCount;
      if (noResultsEl) noResultsEl.style.display = matchCount === 0 ? 'block' : 'none';
    } else {
      if (countWrapper) countWrapper.style.display = 'none';
      if (noResultsEl) noResultsEl.style.display = 'none';
    }
  }

  // 6. 검색창 UI 생성
  function createSearchBar() {
    if (document.getElementById('oopy-search-container')) return;

    const target = document.querySelector('.notion-collection_view-block') ||
                   document.querySelector('.notion-gallery-view') ||
                   document.querySelector('[class*="gallery"]') ||
                   document.querySelector('.notion-page-content');

    if (!target || !target.parentNode) return;

    const container = document.createElement('div');
    container.id = 'oopy-search-container';
    container.innerHTML = `
      <div class="oopy-search-wrapper">
        <svg class="oopy-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        <input type="text" id="oopy-search-input" class="oopy-search-input" placeholder="기관명을 입력하세요 (예: 성남시, 방위사업청)" autocomplete="off"/>
        <button type="button" id="oopy-search-clear" class="oopy-search-clear">✕</button>
      </div>
      <div class="oopy-search-info">
        <span id="oopy-search-status">원하시는 기관명을 검색해 보세요.</span>
        <span id="oopy-search-count-wrapper" style="display:none;">검색 결과: <span id="oopy-search-count" class="oopy-search-count">0</span>개</span>
      </div>
      <div id="oopy-no-results" class="oopy-no-results">🔍 검색 결과와 일치하는 기관이 없습니다.</div>
    `;

    target.parentNode.insertBefore(container, target);

    const input = document.getElementById('oopy-search-input');
    const clearBtn = document.getElementById('oopy-search-clear');

    if (input) {
      const stopProp = (e) => e.stopPropagation();
      input.addEventListener('keydown', stopProp);
      input.addEventListener('keyup', stopProp);
      input.addEventListener('keypress', stopProp);

      // 검색창 클릭/포커스 또는 입력 시 전체 데이터 자동 불러오기 실행
      input.addEventListener('focus', () => { 
        loadAllCards(filterCards, filterCards); 
      });
      input.addEventListener('input', () => { 
        if (!isFullyLoaded && !isLoadingAll) {
          loadAllCards(filterCards, filterCards);
        } else {
          filterCards(); 
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (input) {
          input.value = '';
          filterCards();
          input.focus();
        }
      });
    }
  }

  function init() {
    withObserverPaused(() => {
      removePropertyMoreBtn();
      createSearchBar();
    });
  }

  const observer = new MutationObserver(() => {
    if (isObserverPaused) return;
    init();
    const input = document.getElementById('oopy-search-input');
    if (input && document.activeElement !== input && input.value.trim().length > 0) {
      filterCards();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      init();
    });
  } else {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    init();
  }

  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    init();
    if (document.getElementById('oopy-search-container') || attempts > 15) {
      clearInterval(interval);
    }
  }, 200);
