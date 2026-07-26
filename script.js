(function() {
let isFullyLoaded = false;
let isLoadingAll = false;
let isObserverPaused = false;

function withObserverPaused(fn) {
isObserverPaused = true;
try { fn(); } finally { setTimeout(() => { isObserverPaused = false; }, 50); }
}

function removePropertyMoreBtn() {
document.querySelectorAll('div, span, p').forEach(el => {
if (!el.getAttribute('data-oopy-checked') && el.children.length === 0 && el.textContent.includes('속성') && el.textContent.includes('더 보기')) {
el.setAttribute('data-oopy-checked', 'true');
const btn = el.closest('[role="button"]') || el.closest('div[style*="cursor"]') || el;
if (btn) btn.style.setProperty('display', 'none', 'important');
}
});
}

function getGalleryCards() {
let cards = document.querySelectorAll('.notion-collection-card, [class*="collection-card"]');
if (!cards.length) {
const view = document.querySelector('.notion-gallery-view, .notion-collection_view-block, [class*="gallery"]');
if (view) cards = view.querySelectorAll('a, div[role="button"]');
}
return Array.from(cards);
}

function getTopCardElement(card) {
const gallery = card.closest('.notion-gallery-view, [class*="gallery-view"], [class*="gallery"]');
if (gallery) {
let curr = card;
while (curr && curr.parentElement && curr.parentElement !== gallery) {
curr = curr.parentElement;
}
if (curr && curr.parentElement === gallery) return curr;
}
return card.closest('a') || card.closest('.notion-collection-card') || card;
}

function getCardTitle(card) {
const titleEl = card.querySelector('.notion-property-title, [class*="property-title"], [class*="card__title"]');
if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();
const textEls = card.querySelectorAll('span, p, div');
for (let i = 0; i < textEls.length; i++) {
const txt = textEls[i].textContent.trim();
if (txt && textEls[i].children.length === 0 && !txt.includes('★') && !txt.includes('http')) {
return txt;
}
}
return card.textContent.trim();
}

function loadAllCards(onProgress, onComplete) {
if (isFullyLoaded) { if (onComplete) onComplete(); return; }
if (isLoadingAll) return;
isLoadingAll = true;

const statusEl = document.getElementById('oopy-search-status');
const timer = setInterval(() => {
  const btns = Array.from(document.querySelectorAll('div[role="button"], span, div, button'))
    .filter(el => {
      const t = el.textContent.trim();
      return (t === '더 보기' || t === 'Load more' || t === '더보기') && el.children.length <= 1;
    });

  if (btns.length > 0) {
    const btn = btns[0].closest('[role="button"]') || btns[0];
    if (statusEl) statusEl.innerText = '전체 기관 데이터를 불러오는 중...';
    btn.click();
    if (onProgress) onProgress();
  } else {
    clearInterval(timer);
    isLoadingAll = false;
    isFullyLoaded = true;
    if (statusEl) statusEl.innerText = '원하시는 기관명을 검색해 보세요.';
    if (onComplete) onComplete();
  }
}, 400);


}

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
    const topElement = getTopCardElement(card);
    const name = getCardTitle(card).toLowerCase();

    if (!query || name.includes(query)) {
      topElement.style.removeProperty('display');
      if (card !== topElement) card.style.removeProperty('display');
      matchCount++;
    } else {
      topElement.style.setProperty('display', 'none', 'important');
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

  input.addEventListener('focus', () => { loadAllCards(filterCards, filterCards); });
  input.addEventListener('input', () => { filterCards(); });
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
})();
