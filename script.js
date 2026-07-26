(function () {
  'use strict';

  // 중복 실행 방지 Flag
  if (window.__oopySearchInitialized) return;
  window.__oopySearchInitialized = true;

  // 문자열 정규화 (한글 조합 및 띄어쓰기/특수문자 무시 검색)
  function cleanStr(str) {
    if (!str) return '';
    return str.normalize('NFC').toLowerCase().replace(/[\s\t\n\r\.\,\_\-\(\)\[\]\/\:\;\*\~\!\@\#\$\%\^\&\=]/g, '');
  }

  // 카드 내 기관명(제목) 정밀 추출
  function getInstitutionName(card) {
    if (!card) return '';

    // 노션/우피 갤러리 카드의 기관명(제목) 요소 다중 탐색
    const titleSelectors = [
      '.notion-property-title',
      '[class*="property-title"]',
      '[class*="propertyTitle"]',
      '.notion-collection-card-property:first-child',
      '.notion-collection-card-body > div:first-child',
      'span[style*="font-weight"]',
      'div[style*="font-weight"]'
    ];

    for (let i = 0; i < titleSelectors.length; i++) {
      const el = card.querySelector(titleSelectors[i]);
      if (el && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    }

    // 탐색 실패 시 카드의 첫 줄 텍스트 추출
    const fullText = card.textContent.trim();
    if (fullText) {
      const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) return lines[0];
    }

    return fullText;
  }

  // 순수 노션 갤러리 카드 목록만 수집
  function getGalleryCards() {
    const cardCandidates = Array.from(
      document.querySelectorAll('.notion-collection-card, a[class*="collectionCard"], div[class*="collectionCard"]')
    );

    // 검색창 등 외부 감싸는 요소 제외
    const validCards = cardCandidates.filter(card => {
      return !card.closest('.oopy-search-container') && !card.classList.contains('oopy-search-container');
    });

    // 중첩 구조 중 최상위 카드 노드만 정밀 필터링
    const topCards = validCards.filter(card => {
      return !validCards.some(other => other !== card && other.contains(card));
    });

    return topCards;
  }

  // '더 보기' 버튼 자동 클릭 (전체 데이터 대상 검색)
  function expandAllPages(callback) {
    let attempts = 0;
    const maxAttempts = 15;

    function checkAndClickMore() {
      const loadMoreBtns = Array.from(document.querySelectorAll('div, span, button, [role="button"], a'))
        .filter(el => {
          if (el.children.length > 0) return false;
          const text = el.textContent.trim();
          return (text === '더 보기' || text === 'Load more' || text === '더보기' ||
                  el.classList.contains('notion-collection-view-load-more')) &&
                 el.offsetWidth > 0 && el.offsetHeight > 0;
        });

      if (loadMoreBtns.length > 0 && attempts < maxAttempts) {
        attempts++;
        const btnContainer = loadMoreBtns[0].closest('[role="button"]') || loadMoreBtns[0];
        btnContainer.click();
        setTimeout(checkAndClickMore, 300);
      } else {
        if (callback) callback();
      }
    }

    checkAndClickMore();
  }

  // 카드 필터링 처리 (상위 레이아웃을 건드리지 않고 카드 개별 노출/숨김)
  function filterCards(query) {
    const cards = getGalleryCards();
    const cleanQuery = cleanStr(query);
    const infoCountBadge = document.getElementById('oopy-search-count');
    const clearBtn = document.getElementById('oopy-search-clear');

    if (clearBtn) {
      clearBtn.style.display = query.trim() ? 'flex' : 'none';
    }

    let visibleCount = 0;

    cards.forEach(card => {
      const instName = getInstitutionName(card);
      const cleanInstName = cleanStr(instName);

      const matches = !cleanQuery || cleanInstName.includes(cleanQuery);

      if (matches) {
        card.classList.remove('oopy-card-hidden');
        card.style.removeProperty('display');
        visibleCount++;
      } else {
        card.classList.add('oopy-card-hidden');
        card.style.setProperty('display', 'none', 'important');
      }
    });

    if (infoCountBadge) {
      if (!cleanQuery) {
        infoCountBadge.textContent = `전체 ${cards.length}개 리뷰`;
      } else {
        infoCountBadge.textContent = `검색 결과: ${visibleCount}개`;
      }
    }
  }

  // 검색창 UI 동적 생성 및 위치 지정
  function createSearchBar() {
    if (document.getElementById('oopy-search-container')) return;

    // '모든 리뷰' 제목 또는 헤더 탐색
    const targetHeading = Array.from(document.querySelectorAll('h1, h2, h3, .notion-header, [class*="header"]'))
      .find(el => {
        const txt = el.textContent.trim();
        return txt.includes('모든 리뷰') || txt.includes('모든리뷰') || txt.includes('최근 작성된 리뷰');
      });

    const galleryContainer = document.querySelector(
      '.notion-gallery-view, [class*="galleryView"], .notion-collection-gallery, [class*="collectionGallery"]'
    );

    if (!targetHeading && !galleryContainer) return;

    const container = document.createElement('div');
    container.id = 'oopy-search-container';
    container.className = 'oopy-search-container';

    container.innerHTML = `
      <div class="oopy-search-input-wrapper">
        <svg class="oopy-search-icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" id="oopy-search-input" class="oopy-search-input" placeholder="원하시는 기관명을 검색해 보세요 (예: 경상북도, 창원)" autocomplete="off">
        <button id="oopy-search-clear" class="oopy-search-clear-btn" title="검색어 지우기">&times;</button>
      </div>
      <div class="oopy-search-info">
        <span class="oopy-search-hint">기관명(제목) 기준 검색</span>
        <span id="oopy-search-count" class="oopy-search-count-badge">로딩 중...</span>
      </div>
    `;

    // 헤더 블록 직후에 검색창 삽입
    if (targetHeading) {
      const blockParent = targetHeading.closest('.notion-header-block, .notion-text-block, div[class*="block"]') || targetHeading;
      if (blockParent && blockParent.parentNode) {
        blockParent.parentNode.insertBefore(container, blockParent.nextSibling);
      } else if (targetHeading.parentNode) {
        targetHeading.parentNode.insertBefore(container, targetHeading.nextSibling);
      }
    } else if (galleryContainer && galleryContainer.parentNode) {
      galleryContainer.parentNode.insertBefore(container, galleryContainer);
    }

    const input = document.getElementById('oopy-search-input');
    const clearBtn = document.getElementById('oopy-search-clear');

    let debounceTimer;

    input.addEventListener('input', (e) => {
      const val = e.target.value;
      clearTimeout(debounceTimer);

      if (val.trim().length > 0) {
        expandAllPages(() => {
          debounceTimer = setTimeout(() => {
            filterCards(val);
          }, 100);
        });
      } else {
        filterCards('');
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      filterCards('');
      input.focus();
    });

    // 초기 카드 수 갱신
    setTimeout(() => {
      filterCards('');
    }, 250);
  }

  function init() {
    createSearchBar();

    const observer = new MutationObserver(() => {
      createSearchBar();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
