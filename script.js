(function () {
  'use strict';

  // 중복 실행 방지 Flag
  if (window.__oopySearchInitialized) return;
  window.__oopySearchInitialized = true;

  // 문자열 정규화 (한글 조합 및 띄어쓰기/특수문자 무시 검색)
  function cleanStr(str) {
    if (!str) return '';
    return str.normalize('NFC').toLowerCase().replace(/[\s\t\n\r\.\,\_\-\(\)\[\]\/\:\;]/g, '');
  }

  function getInstitutionName(card) {
    if (!card) return '';

    // 노션/우피 갤러리 카드의 기관명(제목) 요소 다중 탐색
    const titleSelectors = [
      '.notion-property-title',
      '[class*="property-title"]',
      '[class*="propertyTitle"]',
      '.notion-collection-card-property:first-child',
      '.notion-collection-card-body > div:first-child',
      '.notion-collection-card-body span',
      'span[style*="font-weight"]',
      'div[style*="font-weight"]'
    ];

    for (let i = 0; i < titleSelectors.length; i++) {
      const el = card.querySelector(titleSelectors[i]);
      if (el && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    }

    // 탐색 실패 시 카드의 첫 번째 줄 텍스트를 기관명으로 간주
    const fullText = card.textContent.trim();
    if (fullText) {
      const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) return lines[0];
    }

    return fullText;
  }

  function getGalleryCards() {
    const galleryContainers = document.querySelectorAll(
      '.notion-gallery-view, [class*="galleryView"], .notion-collection-gallery, [class*="collectionGallery"]'
    );
    
    let allCards = [];
    galleryContainers.forEach(container => {
      // 갤러리 내 카드 후보군 수집
      const candidateCards = Array.from(
        container.querySelectorAll('.notion-collection-card, a[class*="collection-card"], div[class*="collection-card"], [class*="collectionCard"]')
      );
      
      // 최하단 실제 카드만 필터링 (부모 감싸는 요소 제거)
      const leafCards = candidateCards.filter(card => {
        return !card.querySelector('.notion-collection-card, [class*="collection-card"], [class*="collectionCard"]');
      });

      allCards = allCards.concat(leafCards);
    });

    // 갤러리 컨테이너 감지가 안 되었을 때의 Fallback
    if (allCards.length === 0) {
      const candidates = Array.from(
        document.querySelectorAll('.notion-collection-card, a[class*="collection-card"], [class*="collectionCard"]')
      );
      allCards = candidates.filter(card => {
        return !card.querySelector('.notion-collection-card, [class*="collection-card"], [class*="collectionCard"]');
      });
    }

    return allCards;
  }

  function expandAllPages(callback) {
    let attempts = 0;
    const maxAttempts = 12;

    function checkAndClickMore() {
      const loadMoreBtns = Array.from(document.querySelectorAll('div, span, button, [role="button"]'))
        .filter(el => {
          const text = el.textContent.trim();
          return (text === '더 보기' || text === 'Load more' || el.classList.contains('notion-collection-view-load-more')) &&
                 el.children.length === 0;
        });

      if (loadMoreBtns.length > 0 && attempts < maxAttempts) {
        attempts++;
        const btnContainer = loadMoreBtns[0].closest('[role="button"]') || loadMoreBtns[0];
        btnContainer.click();
        setTimeout(checkAndClickMore, 250);
      } else {
        if (callback) callback();
      }
    }

    checkAndClickMore();
  }

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
        // 검색 일치 시 카드 및 상위 레이아웃 복원
        card.classList.remove('oopy-card-hidden');
        card.style.removeProperty('display');
        
        if (card.parentElement && !card.parentElement.classList.contains('notion-gallery-view')) {
          card.parentElement.classList.remove('oopy-card-hidden');
          card.parentElement.style.removeProperty('display');
        }
        visibleCount++;
      } else {
        // 미일치 시 카드 숨김
        card.classList.add('oopy-card-hidden');
        card.style.setProperty('display', 'none', 'important');

        if (card.parentElement && !card.parentElement.classList.contains('notion-gallery-view') && card.parentElement.children.length === 1) {
          card.parentElement.classList.add('oopy-card-hidden');
          card.parentElement.style.setProperty('display', 'none', 'important');
        }
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

  function createSearchBar() {
    if (document.getElementById('oopy-search-container')) return;

    // 검색창 생성 타겟 헤더 / 갤러리 탐색
    const targetHeading = Array.from(document.querySelectorAll('h1, h2, h3, .notion-header, [class*="header"]'))
      .find(el => el.textContent.includes('모든 리뷰') || el.textContent.includes('최근 작성된 리뷰'));

    const galleryContainer = document.querySelector('.notion-gallery-view, [class*="galleryView"], .notion-collection-gallery');

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
        <input type="text" id="oopy-search-input" class="oopy-search-input" placeholder="원하시는 기관명을 검색해 보세요 (예: 창원, 서울시청)" autocomplete="off">
        <button id="oopy-search-clear" class="oopy-search-clear-btn" title="검색어 지우기">&times;</button>
      </div>
      <div class="oopy-search-info">
        <span class="oopy-search-hint">기관명(제목) 기준 검색</span>
        <span id="oopy-search-count" class="oopy-search-count-badge">로딩 중...</span>
      </div>
    `;

    if (targetHeading && targetHeading.parentNode) {
      targetHeading.parentNode.insertBefore(container, targetHeading.nextSibling);
    } else if (galleryContainer && galleryContainer.parentNode) {
      galleryContainer.parentNode.insertBefore(container, galleryContainer);
    } else {
      document.body.appendChild(container);
    }

    const input = document.getElementById('oopy-search-input');
    const clearBtn = document.getElementById('oopy-search-clear');

    let debounceTimer;

    input.addEventListener('input', (e) => {
      const val = e.target.value;
      clearTimeout(debounceTimer);
      
      expandAllPages(() => {
        debounceTimer = setTimeout(() => {
          filterCards(val);
        }, 120);
      });
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      filterCards('');
      input.focus();
    });

    // 초기 카드 수 갱신
    setTimeout(() => {
      filterCards('');
    }, 200);
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
