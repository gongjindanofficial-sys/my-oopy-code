(function () {
  'use strict';

  // 타겟 페이지 식별 ID ('모든 리뷰' 페이지)
  const TARGET_PAGE_ID = '3a74503e';

  // 이미 검색창이 생성되었는지 체크하는 플래그
  let isSearchInitialized = false;
  let isFullyLoaded = false;

  // 검색창 UI 생성 함수
  function createSearchBar() {
    const container = document.createElement('div');
    container.className = 'oopy-search-container';
    container.id = 'oopy-search-box-root';

    container.innerHTML = `
      <div class="oopy-search-input-wrapper">
        <svg class="oopy-search-icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input 
          type="text" 
          id="oopy-institution-search-input" 
          class="oopy-search-input" 
          placeholder="검색할 기관명을 입력하세요 (예: 서울대병원)" 
          autocomplete="off"
        />
        <button type="button" id="oopy-search-clear" class="oopy-search-clear-btn" title="검색어 지우기">✕</button>
      </div>
      <div class="oopy-search-info">
        <span id="oopy-search-count-text">전체 리뷰 표시 중</span>
        <div id="oopy-search-loading" class="oopy-search-loading">
          <div class="oopy-search-spinner"></div>
          <span>전체 데이터 불러오는 중...</span>
        </div>
      </div>
    `;

    return container;
  }

  // 노션 데이터베이스의 '더 보기' (Load More) 버튼을 자동으로 모두 눌러 전체 카드를 로드
  function loadAllCards(onComplete) {
    if (isFullyLoaded) {
      if (onComplete) onComplete();
      return;
    }

    const loadingIndicator = document.getElementById('oopy-search-loading');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    let loadCount = 0;
    const maxAttempts = 60; // 최대 60회 시도 (안전장치)

    const interval = setInterval(() => {
      // '더 보기', 'Load more', '더보기' 버튼 찾기
      const buttons = Array.from(document.querySelectorAll('div[role="button"], button, .notion-collection-view-load-more'))
        .filter(el => {
          const text = el.textContent.trim();
          return (text.includes('더 보기') || text.includes('Load more') || text.includes('더보기')) && el.offsetParent !== null;
        });

      if (buttons.length > 0) {
        buttons.forEach(btn => btn.click());
        loadCount++;
      } else {
        // 더 이상 눌러야 할 버튼이 없으면 로딩 완료
        clearInterval(interval);
        isFullyLoaded = true;
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (onComplete) onComplete();
      }

      if (loadCount >= maxAttempts) {
        clearInterval(interval);
        isFullyLoaded = true;
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (onComplete) onComplete();
      }
    }, 250);
  }

  // 기관명 전용 고속 검색 필터 함수
  function filterByInstitutionName(query) {
    const cleanQuery = query.trim().toLowerCase().replace(/\s+/g, '');
    const cards = document.querySelectorAll('.notion-collection-card, a.notion-collection-card');
    
    let visibleCount = 0;
    const totalCount = cards.length;

    cards.forEach(card => {
      // 갤러리 카드의 '기관명' 영역만 타겟팅 (노션 타이틀 프로퍼티)
      const titleEl = card.querySelector('.notion-property-title, [class*="property-title"], .notion-collection-card-body span, div[style*="font-weight: 600"]');
      
      // 타겟 텍스트 추출 (공백 제거 후 비교로 검색 편의성 증대)
      const rawText = titleEl ? titleEl.textContent : card.textContent;
      const cleanTitle = rawText.trim().toLowerCase().replace(/\s+/g, '');

      if (!cleanQuery || cleanTitle.includes(cleanQuery)) {
        card.classList.remove('oopy-card-hidden');
        card.style.setProperty('display', 'flex', 'important');
        visibleCount++;
      } else {
        card.classList.add('oopy-card-hidden');
        card.style.setProperty('display', 'none', 'important');
      }
    });

    // 검색 결과 카운트 텍스트 업데이트
    const countTextEl = document.getElementById('oopy-search-count-text');
    const clearBtn = document.getElementById('oopy-search-clear');

    if (clearBtn) {
      clearBtn.style.display = cleanQuery.length > 0 ? 'block' : 'none';
    }

    if (countTextEl) {
      if (!cleanQuery) {
        countTextEl.innerHTML = `전체 기관 리뷰 <span class="oopy-search-count-badge">${totalCount}</span>개`;
      } else {
        countTextEl.innerHTML = `'<strong>${escapeHtml(query)}</strong>' 검색 결과: <span class="oopy-search-count-badge">${visibleCount}</span>개 / 전체 ${totalCount}개`;
      }
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // 노션 '모든 리뷰' 제목을 찾아 아래에 검색창을 삽입
  function injectSearchBar() {
    if (document.getElementById('oopy-search-box-root')) return;

    // '모든 리뷰' 페이지 확인 (URL 또는 제목 기준)
    const isTargetPage = location.href.includes(TARGET_PAGE_ID) || 
      document.title.includes('모든 리뷰') || 
      document.title.includes('모든리뷰');

    if (!isTargetPage) return;

    // 모든 리뷰 제목 노드 탐색
    const titleElement = document.querySelector('h1.notion-title, .notion-page-block .notion-title, div.notion-header-block');

    if (titleElement) {
      const searchBar = createSearchBar();
      
      // 제목 요소 바로 다음에 검색창 삽입
      titleElement.parentNode.insertBefore(searchBar, titleElement.nextSibling);
      isSearchInitialized = true;

      // 이벤트 리스너 바인딩
      const inputEl = document.getElementById('oopy-institution-search-input');
      const clearBtn = document.getElementById('oopy-search-clear');

      if (inputEl) {
        // 검색어 입력 시 전체 카드 로드 후 실시간 검색
        inputEl.addEventListener('input', (e) => {
          const val = e.target.value;
          if (!isFullyLoaded) {
            loadAllCards(() => filterByInstitutionName(val));
          } else {
            filterByInstitutionName(val);
          }
        });

        // 포커스 시 자동으로 전체 카드 사전 로딩 진행
        inputEl.addEventListener('focus', () => {
          if (!isFullyLoaded) {
            loadAllCards(() => filterByInstitutionName(inputEl.value));
          }
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          if (inputEl) {
            inputEl.value = '';
            filterByInstitutionName('');
            inputEl.focus();
          }
        });
      }

      // 처음 로드 시 초기 상태 카운트 계산
      setTimeout(() => {
        filterByInstitutionName('');
      }, 300);
    }
  }

  // 페이지 전환 및 동적 DOM 변경 감지
  const observer = new MutationObserver(() => {
    if (!document.getElementById('oopy-search-box-root')) {
      injectSearchBar();
    }
  });

  // 초기 실행
  document.addEventListener('DOMContentLoaded', () => {
    injectSearchBar();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  if (document.body) {
    injectSearchBar();
    observer.observe(document.body, { childList: true, subtree: true });
  }

})();
