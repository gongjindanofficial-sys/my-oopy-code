(() => {
  "use strict";

  const CONFIG = {
    targetPageId: "3a74503e-4a26-80b4-af58-c15e7f9e165f",
    searchDelayMs: 250,
    loadMoreWaitMs: 5000,
    maxLoadMoreClicks: 200,
  };

  const UI_ID = "gj-review-search";
  const CARD_TITLE_SELECTOR =
    'div[contenteditable="false"][data-root="true"][placeholder="Untitled"]';

  let initialized = false;
  let allCardsLoaded = false;
  let loadPromise = null;
  let debounceTimer = null;
  let observer = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, "")
      .trim();
  }

  function isTargetPage() {
    const current = location.pathname.replace(/-/g, "").toLowerCase();
    const target = CONFIG.targetPageId.replace(/-/g, "").toLowerCase();
    return current.includes(target);
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.getClientRects().length > 0
    );
  }

  function getCardTitleElements() {
    return [...document.querySelectorAll(CARD_TITLE_SELECTOR)].filter((element) => {
      if (element.closest(`#${UI_ID}`)) return false;
      if (element.classList.contains("page-title")) return false;
      return normalizeText(element.textContent).length > 0;
    });
  }

  /**
   * 카드 제목에서 위로 올라가며, 여러 카드가 나란히 들어 있는 공통 부모를 찾습니다.
   * 그 공통 부모의 바로 아래 자식이 실제 카드 슬롯이므로 해당 요소를 반환합니다.
   */
  function findCardWrapper(titleElement) {
    let node = titleElement;

    for (let depth = 0; depth < 12 && node?.parentElement; depth += 1) {
      const parent = node.parentElement;
      const siblingCards = [...parent.children].filter(
        (child) => child.querySelector?.(CARD_TITLE_SELECTOR)
      );

      if (siblingCards.length >= 2) {
        return node;
      }

      node = parent;
    }

    // 카드가 1개뿐인 경우를 위한 안전한 대체 탐색
    const linkWrapper = titleElement.closest('a, [role="link"]');
    if (linkWrapper) return linkWrapper;

    const clickableInner = titleElement.closest(
      'div[style*="user-select: none"][style*="cursor: pointer"]'
    );
    if (clickableInner?.parentElement) return clickableInner.parentElement;
    if (clickableInner) return clickableInner;

    return titleElement.parentElement;
  }

  function getCards() {
    const seen = new Set();
    const cards = [];

    getCardTitleElements().forEach((titleElement) => {
      const wrapper = findCardWrapper(titleElement);
      if (!wrapper || seen.has(wrapper)) return;

      seen.add(wrapper);
      cards.push({
        element: wrapper,
        titleElement,
        institutionName: titleElement.textContent.trim(),
      });
    });

    return cards;
  }

  function findLoadMoreButton() {
    const candidates = [
      ...document.querySelectorAll('[role="button"], button'),
    ];

    return (
      candidates.find((button) => {
        if (!isVisible(button)) return false;

        const text = button.textContent.replace(/\s+/g, " ").trim().toLowerCase();
        return text === "load more" || text === "더 보기";
      }) || null
    );
  }

  function waitForCardChange(previousCount, previousButton) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const check = () => {
        const currentCount = getCards().length;
        const currentButton = findLoadMoreButton();

        if (
          currentCount > previousCount ||
          !currentButton ||
          currentButton !== previousButton ||
          Date.now() - startedAt >= CONFIG.loadMoreWaitMs
        ) {
          resolve(currentCount);
          return;
        }

        window.setTimeout(check, 100);
      };

      check();
    });
  }

  async function ensureAllCardsLoaded(setStatus) {
    if (allCardsLoaded) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      let previousCount = getCards().length;
      let unchangedAttempts = 0;

      for (
        let clickCount = 0;
        clickCount < CONFIG.maxLoadMoreClicks;
        clickCount += 1
      ) {
        const loadMoreButton = findLoadMoreButton();

        if (!loadMoreButton) {
          allCardsLoaded = true;
          break;
        }

        setStatus(`전체 리뷰를 불러오는 중입니다… (${previousCount}개 확인)`, "loading");
        loadMoreButton.click();

        const currentCount = await waitForCardChange(
          previousCount,
          loadMoreButton
        );

        if (currentCount <= previousCount) {
          unchangedAttempts += 1;

          // 일시적인 렌더링 지연을 고려해 최대 3회까지 재시도합니다.
          if (unchangedAttempts >= 3) break;
        } else {
          unchangedAttempts = 0;
          previousCount = currentCount;
        }

        await sleep(150);
      }

      if (!findLoadMoreButton()) {
        allCardsLoaded = true;
      }
    })().finally(() => {
      loadPromise = null;
    });

    return loadPromise;
  }

  function clearCardFilter() {
    getCards().forEach(({ element }) => {
      element.classList.remove("gj-review-card-hidden");
    });
    document.body.classList.remove("gj-review-search-active");
  }

  function filterCards(rawQuery, setStatus) {
    const query = normalizeText(rawQuery);

    if (!query) {
      clearCardFilter();
      setStatus("", "idle");
      return;
    }

    const cards = getCards();
    let matchCount = 0;

    cards.forEach(({ element, institutionName }) => {
      const matches = normalizeText(institutionName).includes(query);
      element.classList.toggle("gj-review-card-hidden", !matches);
      if (matches) matchCount += 1;
    });

    document.body.classList.add("gj-review-search-active");

    if (matchCount > 0) {
      setStatus(`${matchCount}개의 기관 리뷰를 찾았습니다.`, "success");
    } else {
      setStatus("검색 결과가 없습니다.", "empty");
    }
  }

  function createSearchUI(pageTitle) {
    const container = document.createElement("section");
    container.id = UI_ID;
    container.className = "gj-review-search";
    container.setAttribute("aria-label", "기관 리뷰 검색");

    container.innerHTML = `
      <div class="gj-review-search__box">
        <svg class="gj-review-search__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"></path>
        </svg>
        <input
          class="gj-review-search__input"
          type="search"
          inputmode="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="기관명을 검색하세요"
          aria-label="기관명 검색"
        />
        <button
          class="gj-review-search__clear"
          type="button"
          aria-label="검색어 지우기"
          title="검색어 지우기"
        >×</button>
      </div>
      <p class="gj-review-search__status" aria-live="polite"></p>
    `;

    const titleBlock =
      pageTitle.closest(".notion-page-block") || pageTitle.parentElement;
    titleBlock.insertAdjacentElement("afterend", container);

    return container;
  }

  function initialize() {
    if (!isTargetPage()) {
      clearCardFilter();
      document.getElementById(UI_ID)?.remove();
      initialized = false;
      allCardsLoaded = false;
      return;
    }

    if (initialized && document.getElementById(UI_ID)) return;

    const pageTitle = document.querySelector("h1.page-title");
    const cards = getCards();

    // 비밀번호 입력 전에는 카드가 없으므로 로그인 후 다시 시도합니다.
    if (!pageTitle || cards.length === 0) return;

    document.getElementById(UI_ID)?.remove();

    const ui = createSearchUI(pageTitle);
    const input = ui.querySelector(".gj-review-search__input");
    const clearButton = ui.querySelector(".gj-review-search__clear");
    const status = ui.querySelector(".gj-review-search__status");

    const setStatus = (message, state = "idle") => {
      status.textContent = message;
      status.dataset.state = state;
      ui.dataset.state = state;
    };

    const runSearch = async () => {
      const currentQuery = input.value;

      if (!normalizeText(currentQuery)) {
        clearCardFilter();
        setStatus("", "idle");
        clearButton.classList.remove("is-visible");
        return;
      }

      clearButton.classList.add("is-visible");
      setStatus("전체 리뷰를 확인하고 있습니다…", "loading");

      try {
        await ensureAllCardsLoaded(setStatus);
        filterCards(input.value, setStatus);
      } catch (error) {
        console.error("[공진단 리뷰 검색] 전체 카드 로딩 실패:", error);
        filterCards(input.value, setStatus);
        setStatus(
          "일부 리뷰만 불러왔습니다. 잠시 후 다시 검색해 주세요.",
          "error"
        );
      }
    };

    input.addEventListener("input", () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(runSearch, CONFIG.searchDelayMs);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = "";
        runSearch();
        input.blur();
      }
    });

    clearButton.addEventListener("click", () => {
      input.value = "";
      runSearch();
      input.focus();
    });

    initialized = true;
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      window.requestAnimationFrame(initialize);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initialize();
      startObserver();
    });
  } else {
    initialize();
    startObserver();
  }

  // 우피 내부 페이지 이동에 대응
  window.addEventListener("popstate", initialize);
})();
