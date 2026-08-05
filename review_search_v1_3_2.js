/* 공진단 우피 - v1.3.1 기반 날짜 표시 및 최신순 정렬 보완 v1.3.2 */
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

  let searchInitialized = false;
  let allCardsLoaded = false;
  let loadPromise = null;
  let debounceTimer = null;
  let observer = null;
  const cardDateCache = new WeakMap();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  console.info("[공진단 리뷰] v1.3.2 로드됨");

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, "")
      .trim();
  }


  /**
   * 카드에 표시되는 작성일자를 읽습니다.
   * 예: 2026/08/05, 2026/08/05 01:44, 2026-08-05 01:44
   */
  function parseReviewDateText(value) {
    const text = String(value || "").replace(/\u00a0/g, " ").trim();
    const match = text.match(
      /^(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    const date = new Date(year, month - 1, day, hour, minute, second);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute ||
      date.getSeconds() !== second
    ) {
      return null;
    }

    return {
      timestamp: date.getTime(),
      dateKey: [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("/"),
      hasTime: Boolean(match[4]),
    };
  }

  /**
   * 카드 안에서 작성일자만 담고 있는 가장 안쪽 요소를 찾습니다.
   * 날짜와 시간이 서로 다른 span으로 나뉜 경우에도 부모 요소의 textContent로 인식합니다.
   */
  function findReviewDateElement(cardElement) {
    const elements = [cardElement, ...cardElement.querySelectorAll("*")];
    let dateOnlyResult = null;
    let dateTimeResult = null;

    elements.forEach((element) => {
      const dateInfo = parseReviewDateText(element.textContent);
      if (!dateInfo) return;

      /*
       * 날짜와 시간이 여러 span으로 나뉘면 부모 요소에만 전체 일시가 잡힙니다.
       * 따라서 시간까지 포함된 후보를 가장 먼저 사용합니다.
       */
      if (dateInfo.hasTime) {
        dateTimeResult = { element, dateInfo };
        return;
      }

      const childContainsDate = [...element.children].some((child) =>
        Boolean(parseReviewDateText(child.textContent))
      );

      if (!childContainsDate) {
        dateOnlyResult = { element, dateInfo };
      }
    });

    return dateTimeResult || dateOnlyResult;
  }

  /**
   * 시간은 화면에서 제거하되 최초 시간값은 최신순 정렬에 계속 사용합니다.
   */
  function readAndFormatCardDate(cardElement) {
    const found = findReviewDateElement(cardElement);

    if (!found) {
      return cardDateCache.get(cardElement) || null;
    }

    const previous = cardDateCache.get(cardElement);
    const current = found.dateInfo;
    const dateInfo =
      previous && !current.hasTime && previous.dateKey === current.dateKey
        ? previous
        : current;

    cardDateCache.set(cardElement, dateInfo);

    if (found.element.textContent.trim() !== current.dateKey) {
      found.element.textContent = current.dateKey;
    }

    return dateInfo;
  }

  function hasSameCardOrder(currentElements, sortedCards) {
    return (
      currentElements.length === sortedCards.length &&
      currentElements.every(
        (element, index) => element === sortedCards[index].element
      )
    );
  }

  /**
   * 카드 DOM 자체를 작성일자 최신순으로 재배치합니다.
   * CSS order에 의존하지 않아 기존 모바일 2열 레이아웃과 검색 필터를 건드리지 않습니다.
   */
  function formatAndSortReviewCards(groups) {
    groups.forEach(({ container, cards }) => {
      const sortedCards = cards
        .map((card, originalIndex) => ({
          ...card,
          originalIndex,
          dateInfo: readAndFormatCardDate(card.element),
        }))
        .sort((a, b) => {
          const aTime = a.dateInfo?.timestamp ?? Number.NEGATIVE_INFINITY;
          const bTime = b.dateInfo?.timestamp ?? Number.NEGATIVE_INFINITY;

          if (aTime !== bTime) return bTime - aTime;
          return a.originalIndex - b.originalIndex;
        });

      const cardSet = new Set(sortedCards.map(({ element }) => element));
      const currentElements = [...container.children].filter((element) =>
        cardSet.has(element)
      );

      if (
        currentElements.length === 0 ||
        hasSameCardOrder(currentElements, sortedCards)
      ) {
        return;
      }

      const marker = document.createComment("gj-review-sort-position");
      container.insertBefore(marker, currentElements[0]);

      const fragment = document.createDocumentFragment();
      sortedCards.forEach(({ element }) => fragment.appendChild(element));

      container.insertBefore(fragment, marker);
      marker.remove();
    });
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
      if (!normalizeText(element.textContent)) return false;

      /*
       * 실제 리뷰 카드에는 기관명 아래에 속성 영역(.css-1yjhumr)이 있습니다.
       * 페이지 제목이나 다른 일반 텍스트 블록이 카드로 오인되는 것을 방지합니다.
       */
      const inner = findClickableCardInner(element);
      return Boolean(inner && inner.querySelector(".css-1yjhumr"));
    });
  }

  function findClickableCardInner(titleElement) {
    let node = titleElement;

    for (let depth = 0; depth < 10 && node; depth += 1) {
      if (
        node instanceof HTMLElement &&
        node.matches('div[style*="cursor: pointer"]') &&
        node.querySelector(".css-1yjhumr")
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return null;
  }

  function directChildUnder(ancestor, descendant) {
    let node = descendant;

    while (node?.parentElement && node.parentElement !== ancestor) {
      node = node.parentElement;
    }

    return node?.parentElement === ancestor ? node : null;
  }

  /**
   * 카드 내부 클릭 영역들을 기준으로 가장 가까운 공통 갤러리 부모를 찾습니다.
   * 우피가 모바일에서 카드마다 중간 wrapper를 추가해도 직접 카드 슬롯을 계산합니다.
   */
  function discoverGalleryGroups() {
    const items = getRawCardItems();
    const groups = new Map();

    items.forEach((item) => {
      let ancestor = item.inner.parentElement;
      let selectedContainer = null;
      let selectedBranches = null;

      for (let depth = 0; depth < 12 && ancestor; depth += 1) {
        const containedItems = items.filter(({ inner }) => ancestor.contains(inner));
        const branches = new Map();

        containedItems.forEach((containedItem) => {
          const branch = directChildUnder(ancestor, containedItem.inner);
          if (branch) branches.set(branch, containedItem);
        });

        /*
         * 서로 다른 직접 자식 branch에 카드가 2개 이상 들어가는 첫 부모가
         * 실제 카드 목록 컨테이너입니다.
         */
        if (branches.size >= 2) {
          selectedContainer = ancestor;
          selectedBranches = branches;
          break;
        }

        ancestor = ancestor.parentElement;
      }

      if (!selectedContainer || !selectedBranches) return;

      if (!groups.has(selectedContainer)) {
        groups.set(selectedContainer, new Map());
      }

      const groupCards = groups.get(selectedContainer);
      selectedBranches.forEach((containedItem, branch) => {
        if (!groupCards.has(branch)) {
          groupCards.set(branch, containedItem);
        }
      });
    });

    return [...groups.entries()].map(([container, cardsMap]) => ({
      container,
      cards: [...cardsMap.entries()].map(([element, item]) => ({
        element,
        titleElement: item.titleElement,
        institutionName: item.titleElement.textContent.trim(),
      })),
    }));
  }

  function getRawCardItems() {
    const items = [];

    [...document.querySelectorAll(CARD_TITLE_SELECTOR)].forEach((titleElement) => {
      if (titleElement.closest(`#${UI_ID}`)) return;
      if (titleElement.classList.contains("page-title")) return;
      if (!normalizeText(titleElement.textContent)) return;

      const inner = findClickableCardInner(titleElement);
      if (!inner || !inner.querySelector(".css-1yjhumr")) return;

      items.push({ titleElement, inner });
    });

    return items;
  }

  function getCards() {
    const seen = new Set();
    const cards = [];

    discoverGalleryGroups().forEach((group) => {
      group.cards.forEach((card) => {
        if (seen.has(card.element)) return;
        seen.add(card.element);
        cards.push(card);
      });
    });

    return cards;
  }

  function applyReviewGalleryLayout() {
    const groups = discoverGalleryGroups();
    const activeContainers = new Set();
    const activeCards = new Set();

    groups.forEach(({ container, cards }) => {
      container.setAttribute("data-gj-review-gallery", "true");
      activeContainers.add(container);

      cards.forEach(({ element }) => {
        element.setAttribute("data-gj-review-card", "true");
        activeCards.add(element);
      });
    });

    formatAndSortReviewCards(groups);

    document
      .querySelectorAll('[data-gj-review-gallery="true"]')
      .forEach((container) => {
        if (!activeContainers.has(container)) {
          container.removeAttribute("data-gj-review-gallery");
        }
      });

    document
      .querySelectorAll('[data-gj-review-card="true"]')
      .forEach((card) => {
        if (!activeCards.has(card)) {
          card.removeAttribute("data-gj-review-card");
        }
      });
  }

  function findLoadMoreButton() {
    return (
      [...document.querySelectorAll('[role="button"], button')].find((button) => {
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
          if (unchangedAttempts >= 3) break;
        } else {
          unchangedAttempts = 0;
          previousCount = currentCount;
        }

        applyReviewGalleryLayout();
        await sleep(150);
      }

      applyReviewGalleryLayout();

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
    applyReviewGalleryLayout();

    if (!isTargetPage()) {
      clearCardFilter();
      document.getElementById(UI_ID)?.remove();
      searchInitialized = false;
      allCardsLoaded = false;
      return;
    }

    if (searchInitialized && document.getElementById(UI_ID)) return;

    const pageTitle = document.querySelector("h1.page-title");
    const cards = getCards();

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
      if (!normalizeText(input.value)) {
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

    searchInitialized = true;
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

  window.addEventListener("popstate", () => {
    window.setTimeout(initialize, 50);
  });
})();
