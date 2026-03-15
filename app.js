const SUITS = ["clubs", "diamonds", "spades", "hearts"];
const SUIT_LABEL = {
  clubs: "梅花",
  diamonds: "方块",
  spades: "黑桃",
  hearts: "红桃",
  notrump: "无主",
  trump: "主牌",
};
const SUIT_SYMBOL = {
  clubs: "♣",
  diamonds: "♦",
  spades: "♠",
  hearts: "♥",
};
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const APP_VERSION_LABEL = "原型版 v1.2";
const MANDATORY_LEVELS = new Set(["5", "10", "J", "Q", "K", "A"]);
const TRUMP_PENALTY_LEVEL_FALLBACK = {
  J: "2",
  Q: "6",
  K: "J",
  A: "Q",
};
const VICE_PENALTY_LEVEL_FALLBACK = {
  J: "9",
  Q: "J",
  K: "Q",
  A: "K",
};
const RANK_WEIGHT = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  BJ: 16,
  RJ: 17,
};
const PLAYER_ORDER = [1, 2, 3, 4, 5];
const PLAYER_POSITION = {
  1: "bottom",
  2: "right",
  3: "top-right",
  4: "top-left",
  5: "left",
};
const PLAYER_AVATARS = {
  1: { label: "狐狸", src: "./avatars/fox.svg" },
  2: { label: "猫头鹰", src: "./avatars/owl.svg" },
  3: { label: "熊", src: "./avatars/bear.svg" },
  4: { label: "老虎", src: "./avatars/tiger.svg" },
  5: { label: "狼", src: "./avatars/wolf.svg" },
};
const LAYOUT_STORAGE_KEY = "five-friends-layout-v9";
const PROGRESS_COOKIE_KEY = "five_friends_progress_v1";
const PROGRESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const INITIAL_LEVELS = PLAYER_ORDER.reduce((acc, id) => {
  acc[id] = "2";
  return acc;
}, {});

const dom = {
  table: document.querySelector(".table"),
  friendHint: document.getElementById("friendHint"),
  friendCardMount: document.getElementById("friendCardMount"),
  friendLabel: document.getElementById("friendLabel"),
  friendState: document.getElementById("friendState"),
  friendOwner: document.getElementById("friendOwner"),
  phaseLabel: document.getElementById("phaseLabel"),
  leaderLabel: document.getElementById("leaderLabel"),
  trumpLabel: document.getElementById("trumpLabel"),
  bankerLabel: document.getElementById("bankerLabel"),
  trickLabel: document.getElementById("trickLabel"),
  defenderScore: document.getElementById("defenderScore"),
  turnTimer: document.getElementById("turnTimer"),
  timerHint: document.getElementById("timerHint"),
  logList: document.getElementById("logList"),
  actionHint: document.getElementById("actionHint"),
  centerTag: document.getElementById("centerTag"),
  focusAnnouncement: document.getElementById("focusAnnouncement"),
  bottomNote: document.getElementById("bottomNote"),
  bottomCardsMount: document.getElementById("bottomCardsMount"),
  bottomRevealCenter: document.getElementById("bottomRevealCenter"),
  bottomRevealText: document.getElementById("bottomRevealText"),
  bottomRevealTimer: document.getElementById("bottomRevealTimer"),
  bottomRevealCards: document.getElementById("bottomRevealCards"),
  closeBottomRevealBtn: document.getElementById("closeBottomRevealBtn"),
  versionBadge: document.getElementById("versionBadge"),
  handSummary: document.getElementById("handSummary"),
  handGroups: document.getElementById("handGroups"),
  lastTrickPanel: document.getElementById("lastTrickPanel"),
  lastTrickMeta: document.getElementById("lastTrickMeta"),
  lastTrickCards: document.getElementById("lastTrickCards"),
  toggleLastTrickBtn: document.getElementById("toggleLastTrickBtn"),
  closeLastTrickBtn: document.getElementById("closeLastTrickBtn"),
  toggleLogBtn: document.getElementById("toggleLogBtn"),
  toggleBottomBtn: document.getElementById("toggleBottomBtn"),
  toggleRulesBtn: document.getElementById("toggleRulesBtn"),
  layoutEditBtn: document.getElementById("layoutEditBtn"),
  resetLayoutBtn: document.getElementById("resetLayoutBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  startGameBtn: document.getElementById("startGameBtn"),
  beatBtn: document.getElementById("beatBtn"),
  hintBtn: document.getElementById("hintBtn"),
  playBtn: document.getElementById("playBtn"),
  newProgressBtn: document.getElementById("newProgressBtn"),
  continueGameBtn: document.getElementById("continueGameBtn"),
  declareBtn: document.getElementById("declareBtn"),
  passCounterBtn: document.getElementById("passCounterBtn"),
  logPanel: document.getElementById("logPanel"),
  logPanelDrag: document.getElementById("logPanelDrag"),
  closeLogBtn: document.getElementById("closeLogBtn"),
  bottomPanel: document.getElementById("bottomPanel"),
  bottomPanelDrag: document.getElementById("bottomPanelDrag"),
  closeBottomBtn: document.getElementById("closeBottomBtn"),
  rulesPanel: document.getElementById("rulesPanel"),
  rulesPanelDrag: document.getElementById("rulesPanelDrag"),
  closeRulesBtn: document.getElementById("closeRulesBtn"),
  resultOverlay: document.getElementById("resultOverlay"),
  resultCard: document.getElementById("resultCard"),
  resultTitle: document.getElementById("resultTitle"),
  resultBody: document.getElementById("resultBody"),
  resultBottomCards: document.getElementById("resultBottomCards"),
  resultCountdown: document.getElementById("resultCountdown"),
  restartBtn: document.getElementById("restartBtn"),
  closeResultBtn: document.getElementById("closeResultBtn"),
  friendPickerPanel: document.getElementById("friendPickerPanel"),
  friendPickerHint: document.getElementById("friendPickerHint"),
  friendPickerPreview: document.getElementById("friendPickerPreview"),
  friendOccurrenceOptions: document.getElementById("friendOccurrenceOptions"),
  friendSuitOptions: document.getElementById("friendSuitOptions"),
  friendRankOptions: document.getElementById("friendRankOptions"),
  autoFriendBtn: document.getElementById("autoFriendBtn"),
  confirmFriendBtn: document.getElementById("confirmFriendBtn"),
};

const state = {
  players: [],
  playerLevels: { ...INITIAL_LEVELS },
  trumpSuit: "hearts",
  levelRank: null,
  bankerId: 1,
  hiddenFriendId: null,
  friendTarget: null,
  defenderPoints: 0,
  currentTurnId: 1,
  leaderId: 1,
  trickNumber: 1,
  currentTrick: [],
  currentTrickBeatCount: 0,
  leadSpec: null,
  lastTrick: null,
  bottomCards: [],
  selectedCardIds: [],
  countdown: 15,
  countdownTimer: null,
  aiTimer: null,
  dealCards: [],
  dealIndex: 0,
  dealTimer: null,
  trickPauseTimer: null,
  centerAnnouncement: null,
  centerAnnouncementQueue: [],
  centerAnnouncementTimer: null,
  resultCountdownValue: 30,
  resultCountdownTimer: null,
  layoutEditMode: false,
  declaration: null,
  counterPasses: 0,
  phase: "ready",
  showLastTrick: false,
  showLogPanel: true,
  showBottomPanel: true,
  showRulesPanel: false,
  logs: [],
  gameOver: false,
  selectedFriendOccurrence: 1,
  selectedFriendSuit: "hearts",
  selectedFriendRank: "A",
  nextFirstDealPlayerId: 1,
  bottomRevealMessage: "",
  exposedTrumpVoid: {},
  awaitingHumanDeclaration: false,
  hasSavedProgress: false,
  startSelection: null,
};

function createDeck() {
  const deck = [];
  let seq = 0;
  for (let pack = 0; pack < 3; pack += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `c-${pack}-${suit}-${rank}-${seq++}`,
          suit,
          rank,
          pack,
          img: getCardImage(suit, rank),
        });
      }
    }
    deck.push({
      id: `c-${pack}-joker-BJ-${seq++}`,
      suit: "joker",
      rank: "BJ",
      pack,
      img: "./cards/black_joker.svg",
    });
    deck.push({
      id: `c-${pack}-joker-RJ-${seq++}`,
      suit: "joker",
      rank: "RJ",
      pack,
      img: "./cards/red_joker.svg",
    });
  }
  return shuffle(deck);
}

function getCardImage(suit, rank) {
  const rankName = {
    A: "ace",
    K: "king",
    Q: "queen",
    J: "jack",
  }[rank] || rank;
  return `./cards/${rankName}_of_${suit}.svg`;
}

function describeCard(card) {
  if (!card) return "";
  if (card.rank === "RJ") return "大王";
  if (card.rank === "BJ") return "小王";
  return `${SUIT_LABEL[card.suit]} ${card.rank}`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getPlayerLevel(playerId) {
  return state.playerLevels[playerId] || "2";
}

function getCurrentLevelRank() {
  return state.declaration?.rank || state.levelRank || null;
}

function shiftLevel(rank, delta) {
  let current = RANKS.includes(rank) ? rank : "2";
  for (let i = 0; i < delta; i += 1) {
    const currentIndex = RANKS.indexOf(current);
    if (currentIndex < 0 || currentIndex >= RANKS.length - 1) {
      return "A";
    }
    current = RANKS[currentIndex + 1];
    if (MANDATORY_LEVELS.has(current)) {
      break;
    }
  }
  return current;
}

function getPenaltyFallbackMap(mode = "trump") {
  if (mode === "vice") return VICE_PENALTY_LEVEL_FALLBACK;
  return TRUMP_PENALTY_LEVEL_FALLBACK;
}

function dropLevel(rank, steps = 1, mode = "trump") {
  let current = rank;
  const fallbackMap = getPenaltyFallbackMap(mode);
  for (let i = 0; i < steps; i += 1) {
    if (!RANKS.includes(current)) {
      current = "2";
      continue;
    }
    if (fallbackMap[current]) {
      current = fallbackMap[current];
      continue;
    }
    current = current === "2" ? "A" : RANKS[Math.max(0, RANKS.indexOf(current) - 1)];
  }
  return current;
}

function syncPlayerLevels() {
  for (const player of state.players) {
    player.level = getPlayerLevel(player.id);
  }
}

function getLayoutElements() {
  return [...dom.table.querySelectorAll("[data-layout-id]")];
}

function captureLayoutRect(element) {
  if (element.offsetParent === null) return null;
  const tableRect = dom.table.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - tableRect.left,
    top: rect.top - tableRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function applyLayoutRect(element, rect) {
  if (!rect) return;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.style.transform = "none";
}

function normalizeLayoutElement(element) {
  const rect = captureLayoutRect(element);
  if (!rect) return;
  applyLayoutRect(element, rect);
}

function saveLayoutState() {
  const layouts = {};
  for (const element of getLayoutElements()) {
    const rect = captureLayoutRect(element);
    if (!rect) continue;
    layouts[element.dataset.layoutId] = rect;
    applyLayoutRect(element, rect);
  }
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
}

function normalizePlayerLevels(levels) {
  return PLAYER_ORDER.reduce((acc, playerId) => {
    const value = levels?.[playerId] ?? levels?.[String(playerId)];
    acc[playerId] = RANKS.includes(value) ? value : INITIAL_LEVELS[playerId];
    return acc;
  }, {});
}

function readCookieValue(name) {
  const encodedName = `${name}=`;
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(encodedName))
    ?.slice(encodedName.length) || "";
}

function loadProgressFromCookie() {
  const raw = readCookieValue(PROGRESS_COOKIE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return normalizePlayerLevels(parsed.playerLevels);
  } catch {
    document.cookie = `${PROGRESS_COOKIE_KEY}=; Max-Age=0; path=/; SameSite=Lax`;
    return null;
  }
}

function saveProgressToCookie(levels = state.playerLevels) {
  const playerLevels = normalizePlayerLevels(levels);
  const payload = encodeURIComponent(JSON.stringify({
    playerLevels,
    savedAt: Date.now(),
  }));
  document.cookie = `${PROGRESS_COOKIE_KEY}=${payload}; Max-Age=${PROGRESS_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  state.hasSavedProgress = true;
}

function refreshSavedProgressAvailability() {
  state.hasSavedProgress = !!loadProgressFromCookie();
}

function getReadyStartMessage() {
  return "开始游戏将从2重新开始。继续游戏可继续之前的级别。";
}

function startNewProgress(autoStart = false) {
  state.playerLevels = { ...INITIAL_LEVELS };
  state.startSelection = "new";
  saveProgressToCookie();
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

function continueSavedProgress(autoStart = false) {
  const savedLevels = loadProgressFromCookie();
  if (!savedLevels) {
    state.hasSavedProgress = false;
    state.startSelection = null;
    render();
    return;
  }
  state.playerLevels = savedLevels;
  state.hasSavedProgress = true;
  state.startSelection = "continue";
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

function applySavedLayoutState() {
  const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!raw) return;
  try {
    const layouts = JSON.parse(raw);
    for (const element of getLayoutElements()) {
      const saved = layouts[element.dataset.layoutId];
      if (saved) {
        applyLayoutRect(element, saved);
      }
    }
  } catch {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  }
}

function clearLayoutStyles(element) {
  element.style.left = "";
  element.style.top = "";
  element.style.right = "";
  element.style.bottom = "";
  element.style.width = "";
  element.style.height = "";
  element.style.transform = "";
}

function setLayoutEditMode(enabled) {
  state.layoutEditMode = enabled;
  dom.table.classList.toggle("layout-edit-mode", enabled);
  dom.layoutEditBtn.textContent = enabled ? "完成布局" : "布局编辑";
  dom.layoutEditBtn.classList.toggle("alert", enabled);
  if (enabled) {
    for (const element of getLayoutElements()) {
      normalizeLayoutElement(element);
    }
    return;
  }
  saveLayoutState();
}

function resetLayoutState() {
  window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  setLayoutEditMode(false);
  for (const element of getLayoutElements()) {
    clearLayoutStyles(element);
  }
}

function setupGame() {
  clearTimers();
  clearCenterAnnouncement(true);
  refreshSavedProgressAvailability();
  state.bankerId = PLAYER_ORDER.includes(state.bankerId) ? state.bankerId : 1;
  state.levelRank = null;
  state.players = PLAYER_ORDER.map((id) => ({
    id,
    name: `玩家${id}`,
    isHuman: id === 1,
    hand: [],
    played: [],
    capturedPoints: 0,
    roundPoints: 0,
    level: getPlayerLevel(id),
  }));
  state.trumpSuit = "hearts";
  state.hiddenFriendId = null;
  state.friendTarget = null;
  state.defenderPoints = 0;
  state.currentTurnId = 1;
  state.leaderId = 1;
  state.trickNumber = 1;
  state.currentTrick = [];
  state.currentTrickBeatCount = 0;
  state.leadSpec = null;
  state.lastTrick = null;
  state.bottomCards = [];
  state.selectedCardIds = [];
  state.countdown = 30;
  state.dealCards = [];
  state.dealIndex = 0;
  state.declaration = null;
  state.counterPasses = 0;
  state.phase = "ready";
  state.showLastTrick = false;
  state.showLogPanel = true;
  state.showBottomPanel = false;
  state.showRulesPanel = false;
  state.logs = [];
  state.gameOver = false;
  state.bottomRevealMessage = "";
  state.selectedFriendOccurrence = 1;
  state.selectedFriendSuit = "hearts";
  state.selectedFriendRank = "A";
  state.resultCountdownValue = 30;
  state.exposedTrumpVoid = PLAYER_ORDER.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {});
  state.awaitingHumanDeclaration = false;
  state.currentTurnId = state.nextFirstDealPlayerId || 1;
  state.leaderId = state.currentTurnId;
  dom.resultOverlay.classList.remove("show");
  updateResultCountdownLabel();

  const deck = createDeck();
  state.dealCards = deck.splice(0, 31 * 5);
  state.bottomCards = deck.splice(0, 7);

  appendLog(getReadyStartMessage());

  render();
}

function chooseFriendTarget() {
  const banker = getPlayer(state.bankerId);
  if (!banker) {
    return {
      target: {
        suit: "hearts",
        rank: "A",
        occurrence: 1,
        label: "第一张红桃 A",
        img: "./cards/ace_of_hearts.svg",
      },
      ownerId: 2,
    };
  }

  const rankPriority = getPlayerLevel(state.bankerId) === "A"
    ? ["K", "A", "Q", "J", "10"]
    : ["A", "K", "Q", "J", "10"];
  const suitPriority = [...SUITS.filter((suit) => suit !== state.trumpSuit), state.trumpSuit].filter(Boolean);
  const targetCandidates = [];

  for (const suit of suitPriority) {
    for (const rank of rankPriority) {
      const bankerCopies = banker.hand.filter((card) => card.suit === suit && card.rank === rank).length;
      const owners = state.players
        .filter((player) => player.id !== state.bankerId)
        .filter((player) => player.hand.some((card) => card.rank === rank && card.suit === suit));
      if (owners.length === 0) continue;
      const otherCopies = state.players
        .filter((player) => player.id !== state.bankerId)
        .reduce((sum, player) => sum + player.hand.filter((card) => card.rank === rank && card.suit === suit).length, 0);
      const maxOccurrence = Math.min(3, bankerCopies + otherCopies);
      for (let occurrence = bankerCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
        const target = { suit, rank, occurrence };
        targetCandidates.push({
          target,
          ownerId: owners[0].id,
          score: scoreFriendTargetCandidate(target, banker, owners),
        });
      }
    }
  }

  for (const rank of ["RJ", "BJ"]) {
    const bankerCopies = banker.hand.filter((card) => card.suit === "joker" && card.rank === rank).length;
    const owners = state.players
      .filter((player) => player.id !== state.bankerId)
      .filter((player) => player.hand.some((card) => card.suit === "joker" && card.rank === rank));
    if (owners.length === 0) continue;
    const otherCopies = state.players
      .filter((player) => player.id !== state.bankerId)
      .reduce((sum, player) => sum + player.hand.filter((card) => card.suit === "joker" && card.rank === rank).length, 0);
    const maxOccurrence = Math.min(3, bankerCopies + otherCopies);
    for (let occurrence = bankerCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
      const target = { suit: "joker", rank, occurrence };
      targetCandidates.push({
        target,
        ownerId: owners[0].id,
        score: scoreFriendTargetCandidate(target, banker, owners),
      });
    }
  }

  const bestCandidate = targetCandidates.sort((a, b) => b.score - a.score)[0];
  if (bestCandidate) {
    return {
      target: buildFriendTarget(bestCandidate.target),
      ownerId: bestCandidate.ownerId,
    };
  }

  return {
    target: {
      suit: "hearts",
      rank: "A",
      occurrence: 1,
      label: "第一张红桃 A",
      img: "./cards/ace_of_hearts.svg",
    },
    ownerId: 2,
  };
}

function scoreFriendTargetCandidate(target, banker, owners) {
  const bankerSuitCards = banker.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit));
  const bankerTargetCopies = bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = bankerSuitCards.filter((card) => card.rank !== target.rank);
  const targetPower = target.suit === "joker"
    ? (target.rank === "RJ" ? 200 : 190)
    : cardStrength({ suit: target.suit, rank: target.rank, deckIndex: 0, id: `friend-target-${target.suit}-${target.rank}` });
  const bankerReturnCards = bankerSupportCards.filter((card) => cardStrength(card) < targetPower).length;
  const ownerSupportCards = owners.flatMap((player) =>
    player.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit) && card.rank !== target.rank)
  );
  const ownerHighCards = owners.flatMap((player) =>
    player.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit) && cardStrength(card) >= targetPower)
  );
  const rankBonus = {
    A: 60,
    K: 48,
    Q: 40,
    J: 34,
    "10": 24,
    RJ: 52,
    BJ: 44,
  }[target.rank] || 0;
  const occurrenceBonus = target.occurrence === 2 ? 12 : target.occurrence === 3 ? 8 : 0;
  const suitBonus = target.suit !== "joker" && target.suit !== state.trumpSuit ? 18 : 0;
  const trumpPenalty = target.suit === state.trumpSuit ? 10 : 0;
  const jokerPenalty = target.suit === "joker" ? 14 : 0;
  const uniqueOwnerBonus = owners.length === 1 ? 10 : 3;
  const bankerOwnCopyBonus = bankerTargetCopies > 0 ? 8 : 0;
  const returnBonus = Math.min(bankerReturnCards, 3) * 7 + Math.min(ownerSupportCards.length, 3) * 5 + Math.min(ownerHighCards.length, 2) * 4;
  const supportPenalty = bankerSupportCards.length === 0 ? 18 : 0;
  return rankBonus + occurrenceBonus + suitBonus + uniqueOwnerBonus + bankerOwnCopyBonus + returnBonus - trumpPenalty - jokerPenalty - supportPenalty;
}

function buildFriendTarget(target) {
  return {
    ...target,
    label: describeTarget(target),
    img: target.suit === "joker"
      ? `./cards/${target.rank === "RJ" ? "red_joker" : "black_joker"}.svg`
      : getCardImage(target.suit, target.rank),
  };
}

function getOccurrenceLabel(occurrence = 1) {
  return ({ 1: "第一张", 2: "第二张", 3: "第三张" }[occurrence] || `第${occurrence}张`);
}

function getFriendSearchOrder(fromId = state.bankerId) {
  const order = [];
  let currentId = getNextPlayerId(fromId);
  while (currentId !== fromId) {
    order.push(currentId);
    currentId = getNextPlayerId(currentId);
  }
  return order;
}

function resolveFriendOwnerId(target, bankerId = state.bankerId) {
  for (const playerId of getFriendSearchOrder(bankerId)) {
    const player = getPlayer(playerId);
    if (!player) continue;
    if (player.hand.some((card) => card.rank === target.rank && card.suit === target.suit)) {
      return playerId;
    }
  }
  return null;
}

function setFriendTarget(target) {
  state.friendTarget = {
    ...buildFriendTarget(target),
    occurrence: target.occurrence ?? 1,
    matchesSeen: 0,
    failed: false,
    revealed: false,
    revealedBy: null,
  };
  state.hiddenFriendId = null;
}

function getDefaultFriendSelection() {
  const suggested = chooseFriendTarget().target;
  return {
    occurrence: suggested.occurrence || 1,
    suit: suggested.suit,
    rank: suggested.rank,
  };
}

function startCallingFriendPhase() {
  clearTimers();
  const banker = getPlayer(state.bankerId);
  const defaults = getDefaultFriendSelection();
  state.selectedFriendOccurrence = defaults.occurrence;
  state.selectedFriendSuit = defaults.suit;
  state.selectedFriendRank = defaults.rank;
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.phase = "callingFriend";
  appendLog(`${banker.name} 已扣底完成，当前需要先叫朋友，再进入出牌。`);
  render();

  if (banker.isHuman) return;

  state.aiTimer = window.setTimeout(() => {
    confirmFriendTargetSelection(defaults);
  }, 900);
}

function confirmFriendTargetSelection(selection = {
  occurrence: state.selectedFriendOccurrence,
  suit: state.selectedFriendSuit,
  rank: state.selectedFriendRank,
}) {
  if (state.phase !== "callingFriend") return;
  if (!selection?.suit || !selection?.rank) return;
  setFriendTarget(selection);
  appendLog(`已叫朋友：${state.friendTarget.label}。`);
  enterPlayingPhase();
}

function enterPlayingPhase() {
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.phase = "playing";
  appendLog(`进入出牌阶段，${getPlayer(state.bankerId).name} 先出牌。`);
  render();
  startTurn();
}

function startDealing() {
  clearTimers();
  if (state.gameOver || state.phase !== "ready") return;
  state.phase = "dealing";
  state.awaitingHumanDeclaration = false;
  appendLog("开始发牌。每位玩家按自己的等级牌亮主或反主。");
  render();
  queueDealStep(140);
}

function queueDealStep(delay = 90) {
  if (state.dealTimer) {
    window.clearTimeout(state.dealTimer);
  }
  state.dealTimer = window.setTimeout(() => {
    state.dealTimer = null;
    dealOneCard();
  }, delay);
}

function dealOneCard() {
  if (state.gameOver || state.phase !== "dealing") return;

  if (state.dealIndex >= state.dealCards.length) {
    finishDealingPhase();
    return;
  }

  const startIndex = PLAYER_ORDER.indexOf(state.nextFirstDealPlayerId || 1);
  const playerId = PLAYER_ORDER[(Math.max(0, startIndex) + state.dealIndex) % PLAYER_ORDER.length];
  const player = getPlayer(playerId);
  const card = state.dealCards[state.dealIndex];
  state.dealIndex += 1;
  player.hand.push(card);

  maybeAutoDeclare(playerId);
  render();

  if (state.dealIndex >= state.dealCards.length) {
    queueDealStep(220);
    return;
  }
  queueDealStep();
}

function getBottomRevealWeight(card) {
  if (card.rank === "RJ") return 100;
  if (card.rank === "BJ") return 99;
  return RANK_WEIGHT[card.rank] || 0;
}

function resolveBottomDeclarationForPlayer(playerId) {
  const playerLevel = getPlayerLevel(playerId);
  let highestCard = null;

  for (const card of state.bottomCards) {
    if (card.rank === playerLevel && card.suit !== "joker") {
      return {
        playerId,
        suit: card.suit,
        rank: playerLevel,
        count: 0,
        cards: [],
        source: "bottom",
        revealCard: card,
      };
    }

    if (!highestCard || getBottomRevealWeight(card) > getBottomRevealWeight(highestCard)) {
      highestCard = card;
    }
  }

  if (!highestCard) {
    return {
      playerId,
      suit: "notrump",
      rank: playerLevel,
      count: 0,
      cards: [],
      source: "bottom",
      revealCard: null,
    };
  }

  return {
    playerId,
    suit: highestCard.suit === "joker" ? "notrump" : highestCard.suit,
    rank: playerLevel,
    count: 0,
    cards: [],
    source: "bottom",
    revealCard: highestCard,
  };
}

function finishDealingPhase() {
  if (state.phase !== "dealing") return;

  if (!state.declaration) {
    const humanDeclaration = getBestDeclarationForPlayer(1);
    if (humanDeclaration && !state.awaitingHumanDeclaration) {
      startAwaitingHumanDeclaration();
      return;
    }
    state.awaitingHumanDeclaration = false;
    const firstDealPlayerId = state.nextFirstDealPlayerId || 1;
    const bottomDeclaration = resolveBottomDeclarationForPlayer(firstDealPlayerId);
    state.declaration = bottomDeclaration;
    state.trumpSuit = bottomDeclaration.suit;
    state.bankerId = firstDealPlayerId;
    state.levelRank = getPlayerLevel(firstDealPlayerId);
    if (bottomDeclaration.suit === "notrump") {
      state.bottomRevealMessage = `无人亮主，由先抓牌的${getPlayer(firstDealPlayerId).name}翻底定主。底牌翻到${bottomDeclaration.revealCard ? describeCard(bottomDeclaration.revealCard) : "王"}，本局定为无主，王和级牌都算主，${getPlayer(firstDealPlayerId).name}做打家。`;
    } else if (bottomDeclaration.revealCard?.rank === state.levelRank) {
      state.bottomRevealMessage = `无人亮主，由先抓牌的${getPlayer(firstDealPlayerId).name}翻底定主。底牌翻到级牌${describeCard(bottomDeclaration.revealCard)}，定${SUIT_LABEL[bottomDeclaration.suit]}为主，${getPlayer(firstDealPlayerId).name}做打家。`;
    } else {
      state.bottomRevealMessage = `无人亮主，由先抓牌的${getPlayer(firstDealPlayerId).name}翻底定主。底牌未翻到级牌，按最大首见牌${describeCard(bottomDeclaration.revealCard)}定${SUIT_LABEL[bottomDeclaration.suit]}为主，${getPlayer(firstDealPlayerId).name}做打家。`;
    }
    appendLog(state.bottomRevealMessage);
    startBottomRevealPhase();
    return;
  }

  state.trumpSuit = state.declaration.suit;
  state.bankerId = state.declaration.playerId;
  state.phase = "countering";
  state.counterPasses = 0;
  state.currentTurnId = getNextCounterPlayerId(state.declaration.playerId);

  appendLog(`发牌结束，当前亮主为 ${getPlayer(state.bankerId).name} 的 ${formatDeclaration(state.declaration)}。`);
  appendLog("进入最后反主阶段。若没人反主，本局将按当前亮主进入出牌。");
  render();
  startCounterTurn();
}

function startAwaitingHumanDeclaration() {
  clearTimers();
  state.awaitingHumanDeclaration = true;
  state.countdown = 15;
  appendLog("发牌结束，其他玩家都没有亮主。玩家1可在 15 秒内决定是否亮主；若超时未亮，则进入翻底定主。");
  render();
  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    renderCenterPanel();
    if (state.countdown <= 0) {
      clearTimers();
      finishDealingPhase();
    }
  }, 1000);
}

function startBottomRevealPhase() {
  clearTimers();
  state.phase = "bottomReveal";
  state.showBottomPanel = true;
  state.countdown = 30;
  queueCenterAnnouncement(`${getPlayer(state.bankerId).name} 翻底定主`, "friend");
  render();
  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    renderBottomRevealCenter();
    if (state.countdown <= 0) {
      finishBottomRevealPhase();
    }
  }, 1000);
}

function finishBottomRevealPhase() {
  if (state.phase !== "bottomReveal") return;
  clearTimers();
  startBuryingPhase();
}

function describeTarget(target) {
  const prefix = getOccurrenceLabel(target.occurrence ?? 1);
  if (target.suit === "joker") {
    return target.rank === "RJ" ? `${prefix}大王` : `${prefix}小王`;
  }
  return `${prefix}${SUIT_LABEL[target.suit]} ${target.rank}`;
}

function getDeclarationOptions(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  const playerLevel = getPlayerLevel(playerId);

  return SUITS.map((suit) => {
    const cards = player.hand.filter((card) => card.suit === suit && card.rank === playerLevel);
    return {
      playerId,
      suit,
      rank: playerLevel,
      count: cards.length,
      cards,
    };
  })
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return SUITS.indexOf(b.suit) - SUITS.indexOf(a.suit);
    });
}

function getBestDeclarationForPlayer(playerId) {
  return getDeclarationOptions(playerId)[0] || null;
}

function canOverrideDeclaration(candidate, current = state.declaration) {
  if (!candidate) return false;
  if (!current) return true;
  if (candidate.playerId === current.playerId) return false;
  if (candidate.suit === "notrump" && current.suit !== "notrump" && candidate.count === current.count) {
    return true;
  }
  return candidate.count > current.count;
}

function getNoTrumpCounterLabel(entry) {
  if (!entry || entry.suit !== "notrump") return "";
  const rank = entry.cards?.[0]?.rank;
  if (rank === "RJ") return "对大王反无主";
  if (rank === "BJ") return "对小王反无主";
  return "反无主";
}

function formatDeclaration(entry) {
  if (entry?.source === "bottom") {
    return entry.suit === "notrump"
      ? "翻底定无主"
      : `翻底定主 ${SUIT_LABEL[entry.suit]}`;
  }
  if (entry.suit === "notrump") {
    return getNoTrumpCounterLabel(entry);
  }
  return `${SUIT_LABEL[entry.suit]} ${entry.rank} x${entry.count}`;
}

function getDeclarationCards(entry = state.declaration) {
  if (!entry) return [];
  const player = getPlayer(entry.playerId);
  if (!player) return [];
  if (entry.suit === "notrump") {
    if (entry.cards?.length) {
      const wantedIds = new Set(entry.cards.map((card) => card.id));
      return player.hand.filter((card) => wantedIds.has(card.id)).slice(0, entry.count);
    }
    return [...player.hand]
      .filter((card) => card.suit === "joker")
      .sort((a, b) => cardStrength(b) - cardStrength(a))
      .slice(0, entry.count);
  }
  return player.hand
    .filter((card) => card.suit === entry.suit && card.rank === entry.rank)
    .slice(0, entry.count);
}

function getActionSuitLabel(entry) {
  return entry ? SUIT_LABEL[entry.suit] : "";
}

function declareTrump(playerId, declaration, source = "manual") {
  if (!declaration || !canOverrideDeclaration(declaration)) return false;

  const player = getPlayer(playerId);
  const previous = state.declaration;
  const declarationLevelRank = declaration.suit === "notrump"
    ? getPlayerLevel(playerId)
    : declaration.rank;
  state.awaitingHumanDeclaration = false;
  state.declaration = {
    playerId,
    suit: declaration.suit,
    rank: declarationLevelRank,
    count: declaration.count,
    cards: getDeclarationCards(declaration),
  };
  state.levelRank = declarationLevelRank;
  state.trumpSuit = declaration.suit;
  state.bankerId = playerId;

  if (!previous) {
    appendLog(`${player.name} 亮主：${formatDeclaration(state.declaration)}。`);
  } else {
    appendLog(`${player.name}${source === "manual" ? " 抢亮" : " 抢亮"}：${formatDeclaration(state.declaration)}。`);
  }

  render();
  return true;
}

function maybeAutoDeclare(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.isHuman) return;
  const best = getBestDeclarationForPlayer(playerId);
  if (!best || !canOverrideDeclaration(best)) return;

  const willing = best.count >= 3 || Math.random() < 0.65;
  if (!willing) return;
  declareTrump(playerId, best, "auto");
}

function getNoTrumpCounterOption(playerId) {
  const current = state.declaration;
  if (!current || current.suit === "notrump" || current.count < 2) return null;
  if (current.count !== 2) return null;
  const player = getPlayer(playerId);
  if (!player) return null;
  const bigJokers = player.hand.filter((card) => card.rank === "RJ");
  if (bigJokers.length >= 2) {
    return {
      playerId,
      suit: "notrump",
      count: 2,
      cards: bigJokers.slice(0, 2),
    };
  }
  const smallJokers = player.hand.filter((card) => card.rank === "BJ");
  if (smallJokers.length >= 2) {
    return {
      playerId,
      suit: "notrump",
      count: 2,
      cards: smallJokers.slice(0, 2),
    };
  }
  return null;
}

function getCounterDeclarationForPlayer(playerId) {
  const current = state.declaration;
  if (!current) return null;
  const candidates = getDeclarationOptions(playerId)
    .filter((entry) => entry.count > current.count);
  const noTrumpOption = getNoTrumpCounterOption(playerId);
  if (noTrumpOption) {
    candidates.unshift(noTrumpOption);
  }
  return candidates.sort((a, b) => {
    if (a.suit === "notrump" && b.suit !== "notrump") return -1;
    if (a.suit !== "notrump" && b.suit === "notrump") return 1;
    return b.count - a.count;
  })[0] || null;
}

function getNextCounterPlayerId(fromId) {
  let nextId = getNextPlayerId(fromId);
  while (nextId === state.declaration?.playerId) {
    nextId = getNextPlayerId(nextId);
  }
  return nextId;
}

function startCounterTurn() {
  clearTimers();
  if (state.gameOver || state.phase !== "countering") return;

  const player = getPlayer(state.currentTurnId);
  const option = getCounterDeclarationForPlayer(state.currentTurnId);
  if (!option) {
    state.countdown = 0;
    state.aiTimer = window.setTimeout(() => {
      passCounterForCurrentPlayer();
    }, 450);
    render();
    return;
  }

  state.countdown = 30;
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      passCounterForCurrentPlayer(true);
    }
  }, 1000);

  if (!player || player.isHuman) return;

  state.aiTimer = window.setTimeout(() => {
    if (option && (option.suit === "notrump" || option.count >= 3 || Math.random() < 0.72)) {
      counterDeclare(player.id, option);
      return;
    }
    passCounterForCurrentPlayer();
  }, 1000 + Math.random() * 900);
}

function counterDeclare(playerId, declaration) {
  if (state.phase !== "countering" || playerId !== state.currentTurnId) return;
  if (!declaration || !canOverrideDeclaration(declaration)) return;
  clearTimers();
  declareTrump(playerId, declaration, "counter");
  state.counterPasses = 0;
  appendLog(`${getPlayer(playerId).name}${playerId === 1 ? " 完成了最后反主" : " 在最后反主阶段完成反主"}。`);
  state.currentTurnId = getNextCounterPlayerId(playerId);
  render();
  startCounterTurn();
}

function passCounterForCurrentPlayer(isTimeout = false) {
  if (state.phase !== "countering") return;
  const player = getPlayer(state.currentTurnId);
  clearTimers();
  state.counterPasses += 1;
  appendLog(`${player.name}${isTimeout ? " 反主超时，自动不反主" : " 选择不反主"}。`);
  if (state.counterPasses >= PLAYER_ORDER.length - 1) {
    appendLog("最后反主阶段结束，无人继续反主。");
    startBuryingPhase();
    return;
  }
  state.currentTurnId = getNextCounterPlayerId(state.currentTurnId);
  render();
  startCounterTurn();
}

function getBuryHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  return [...player.hand]
    .sort((a, b) => {
      const aScore = (isTrump(a) ? 1000 : 0) + scoreValue(a) * 50 + cardStrength(a);
      const bScore = (isTrump(b) ? 1000 : 0) + scoreValue(b) * 50 + cardStrength(b);
      return aScore - bScore;
    })
    .slice(0, 7);
}

function completeBurying(playerId, cardIds) {
  if (state.phase !== "burying" || playerId !== state.bankerId) return;
  const player = getPlayer(playerId);
  const cards = cardIds
    .map((id) => player.hand.find((card) => card.id === id))
    .filter(Boolean);
  if (cards.length !== 7) return;

  for (const cardId of cardIds) {
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      player.hand.splice(index, 1);
    }
  }
  player.hand = sortHand(player.hand);
  state.bottomCards = sortHand(cards);
  state.selectedCardIds = [];
  state.showBottomPanel = false;
  appendLog(`${player.name} 已重新扣下 7 张底牌。`);
  beginPlayingPhase();
}

function startBuryingPhase() {
  clearTimers();
  const banker = getPlayer(state.bankerId);
  banker.hand.push(...state.bottomCards);
  banker.hand = sortHand(banker.hand);
  state.selectedCardIds = [];
  state.showBottomPanel = false;
  state.phase = "burying";
  state.countdown = 60;

  appendLog(`${banker.name} 拿起底牌，请重新整理并扣下 7 张牌。`);
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      const buryCards = getBuryHintForPlayer(banker.id);
      completeBurying(banker.id, buryCards.map((card) => card.id));
    }
  }, 1000);

  if (banker.isHuman) return;

  state.aiTimer = window.setTimeout(() => {
    const buryCards = getBuryHintForPlayer(banker.id);
    completeBurying(banker.id, buryCards.map((card) => card.id));
  }, 1200);
}

function beginPlayingPhase() {
  for (const player of state.players) {
    player.hand = sortHand(player.hand);
  }

  state.counterPasses = 0;
  state.trumpSuit = state.declaration ? state.declaration.suit : state.trumpSuit;
  state.bankerId = state.declaration ? state.declaration.playerId : state.bankerId;
  state.friendTarget = null;
  state.hiddenFriendId = null;
  startCallingFriendPhase();
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    return compareHandCardsForDisplay(a, b);
  });
}

function groupOrder(card) {
  if (isTrump(card)) return 4;
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

function getDisplaySuitOrder(card) {
  const activeTrumpSuit = getActiveTrumpSuit();
  if (card.suit === "joker") return 5;
  if (isTrump(card) && getCurrentLevelRank() && card.rank === getCurrentLevelRank()) {
    if (activeTrumpSuit && card.suit === activeTrumpSuit) return -1;
  }
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

function compareHandCardsForDisplay(a, b) {
  const groupDiff = groupOrder(a) - groupOrder(b);
  if (groupDiff !== 0) return groupDiff;

  const strengthDiff = cardStrength(b) - cardStrength(a);
  if (strengthDiff !== 0) return strengthDiff;

  const suitDiff = getDisplaySuitOrder(a) - getDisplaySuitOrder(b);
  if (suitDiff !== 0) return suitDiff;

  return (a.deckIndex ?? 0) - (b.deckIndex ?? 0);
}

function getActiveTrumpSuit() {
  if (state.phase === "ready") {
    return null;
  }
  if (state.phase === "dealing") {
    if (!state.declaration || state.declaration.suit === "notrump") return null;
    return state.declaration.suit;
  }
  if (state.trumpSuit === "notrump") return null;
  return state.trumpSuit;
}

function isTrump(card) {
  const currentLevelRank = getCurrentLevelRank();
  const activeTrumpSuit = getActiveTrumpSuit();
  return card.suit === "joker" || (currentLevelRank && card.rank === currentLevelRank) || (activeTrumpSuit ? card.suit === activeTrumpSuit : false);
}

function effectiveSuit(card) {
  return isTrump(card) ? "trump" : card.suit;
}

function getTrumpRankIndex(card) {
  const currentLevelRank = getCurrentLevelRank();
  const plainRanks = RANKS.filter((rank) => rank !== currentLevelRank);
  if (card.rank === "RJ") return plainRanks.length + 3;
  if (card.rank === "BJ") return plainRanks.length + 2;
  const activeTrumpSuit = getActiveTrumpSuit();
  if (currentLevelRank && card.rank === currentLevelRank && activeTrumpSuit && card.suit === activeTrumpSuit) {
    return plainRanks.length + 1;
  }
  if (currentLevelRank && card.rank === currentLevelRank) {
    return plainRanks.length;
  }
  return plainRanks.indexOf(card.rank);
}

function getPatternUnitPower(card, suit = effectiveSuit(card)) {
  return suit === "trump" ? getTrumpRankIndex(card) : getNonTrumpRankIndex(card.rank);
}

function cardStrength(card) {
  const suit = effectiveSuit(card);
  return (suit === "trump" ? 500 : 100) + getPatternUnitPower(card, suit);
}

function scoreValue(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

function getPlayer(id) {
  return state.players.find((player) => player.id === id);
}

function getNextPlayerId(id) {
  return (id % 5) + 1;
}

function getPreviousPlayerId(id) {
  return id === PLAYER_ORDER[0] ? PLAYER_ORDER[PLAYER_ORDER.length - 1] : id - 1;
}

function getVisibleDefenderPoints() {
  if (!isFriendTeamResolved()) {
    return null;
  }
  return state.defenderPoints;
}

function isFriendTeamResolved() {
  return !!state.friendTarget && (state.friendTarget.revealed || state.friendTarget.failed);
}

function recalcDefenderPoints() {
  return state.players.reduce((sum, player) => {
    if (!isDefenderTeam(player.id)) return sum;
    return sum + (player.roundPoints || 0);
  }, 0);
}

function canHumanViewBottomCards() {
  if (state.gameOver) return true;
  if (state.phase === "bottomReveal") return true;
  return state.bankerId === 1 && (state.phase === "burying" || state.phase === "callingFriend" || state.phase === "playing" || state.phase === "pause");
}

function startTurn() {
  clearTimers();
  if (state.gameOver) return;

  state.countdown = 15;
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      autoPlayCurrentTurn();
    }
  }, 1000);

  const player = getPlayer(state.currentTurnId);
  if (!player.isHuman) {
    state.aiTimer = window.setTimeout(() => {
      autoPlayCurrentTurn();
    }, 900 + Math.random() * 700);
  }
}

function clearTimers() {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
  if (state.aiTimer) {
    window.clearTimeout(state.aiTimer);
    state.aiTimer = null;
  }
  if (state.dealTimer) {
    window.clearTimeout(state.dealTimer);
    state.dealTimer = null;
  }
  if (state.trickPauseTimer) {
    window.clearTimeout(state.trickPauseTimer);
    state.trickPauseTimer = null;
  }
  if (state.resultCountdownTimer) {
    window.clearInterval(state.resultCountdownTimer);
    state.resultCountdownTimer = null;
  }
}

function updateResultCountdownLabel() {
  if (!dom.resultCountdown || !dom.restartBtn) return;
  dom.resultCountdown.textContent = `30 秒后自动开局：${state.resultCountdownValue}`;
  dom.restartBtn.textContent = state.resultCountdownValue > 0
    ? `再来一局 (${state.resultCountdownValue})`
    : "再来一局";
}

function goToMainMenu() {
  dom.resultOverlay.classList.remove("show");
  state.startSelection = null;
  setupGame();
}

function beginNextGame(autoStart = false) {
  dom.resultOverlay.classList.remove("show");
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

function startResultCountdown() {
  state.resultCountdownValue = 30;
  updateResultCountdownLabel();
  if (state.resultCountdownTimer) {
    window.clearInterval(state.resultCountdownTimer);
  }
  state.resultCountdownTimer = window.setInterval(() => {
    state.resultCountdownValue -= 1;
    if (state.resultCountdownValue <= 0) {
      state.resultCountdownValue = 0;
      updateResultCountdownLabel();
      window.clearInterval(state.resultCountdownTimer);
      state.resultCountdownTimer = null;
      beginNextGame(true);
      return;
    }
    updateResultCountdownLabel();
  }, 1000);
}

function clearCenterAnnouncement(resetQueue = false) {
  if (state.centerAnnouncementTimer) {
    window.clearTimeout(state.centerAnnouncementTimer);
    state.centerAnnouncementTimer = null;
  }
  state.centerAnnouncement = null;
  if (resetQueue) {
    state.centerAnnouncementQueue = [];
  }
}

function queueCenterAnnouncement(message, tone = "default") {
  if (!message) return;
  state.centerAnnouncementQueue.push({ message, tone });
  if (state.centerAnnouncement) return;
  showNextCenterAnnouncement();
}

function showNextCenterAnnouncement() {
  if (state.centerAnnouncementQueue.length === 0) {
    clearCenterAnnouncement();
    renderCenterPanel();
    return;
  }
  const next = state.centerAnnouncementQueue.shift();
  state.centerAnnouncement = next;
  renderCenterPanel();
  state.centerAnnouncementTimer = window.setTimeout(() => {
    state.centerAnnouncementTimer = null;
    state.centerAnnouncement = null;
    renderCenterPanel();
    if (state.centerAnnouncementQueue.length > 0) {
      showNextCenterAnnouncement();
    }
  }, 3000);
}

function getSpecialPatternAnnouncement(pattern, playerId) {
  if (!pattern?.ok) return "";
  const labelMap = {
    triple: "刻子",
    tractor: "拖拉机",
    train: "火车",
    bulldozer: "推土机",
    throw: "甩牌",
  };
  const label = labelMap[pattern.type];
  if (!label) return "";
  return `${getPlayer(playerId).name} 打出${label}`;
}

function getPlayAnnouncement(playerId, pattern, options = {}) {
  const player = getPlayer(playerId);
  if (!player || !pattern?.ok) return "";
  const parts = [];
  if (options.leadTrump) {
    parts.push("吊主");
  }
  const labelMap = {
    triple: "刻子",
    tractor: "拖拉机",
    train: "火车",
    bulldozer: "推土机",
    throw: "甩牌",
  };
  const special = labelMap[pattern.type];
  if (special) {
    parts.push(special);
  }
  if (parts.length === 0) return "";
  return `${player.name} ${parts.join(" · ")}`;
}

function getFriendProgressAnnouncement(playerId, cards) {
  if (state.currentTrick.length !== 1) return null;
  if (!state.friendTarget || isFriendTeamResolved()) return null;
  if (state.friendTarget.suit === "joker") return null;
  const hasTargetSuit = cards.some((card) => card.suit === state.friendTarget.suit);
  if (!hasTargetSuit) return null;
  const hitExactTarget = cards.some(
    (card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  if (hitExactTarget) return null;
  return {
    message: `${getPlayer(playerId).name} ${playerId === state.bankerId ? "找朋友" : "帮找朋友"}`,
    tone: "default",
  };
}

function getTrickOutcomeAnnouncement(winnerId) {
  if (winnerId === 1) return "上轮你大，请出牌";
  return `上轮${getPlayer(winnerId).name}大`;
}

function isVisibleAllyOfHuman(playerId) {
  if (playerId === 1) return true;
  if (!state.friendTarget?.revealed) return false;
  const humanOnBankerTeam = state.bankerId === 1 || state.friendTarget.revealedBy === 1;
  if (humanOnBankerTeam) {
    return playerId === state.bankerId || playerId === state.friendTarget.revealedBy;
  }
  return isDefenderTeam(playerId);
}

function areSameSide(playerA, playerB) {
  if (playerA === playerB) return true;
  if (!isFriendTeamResolved()) {
    return playerA === state.bankerId && playerB === state.bankerId;
  }
  return isDefenderTeam(playerA) === isDefenderTeam(playerB);
}

function getAiHandStrength(playerId) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  return player.hand.reduce((sum, card) => {
    const trumpBonus = isTrump(card) ? 3 : 0;
    const highBonus = cardStrength(card) >= 12 ? 1 : 0;
    return sum + trumpBonus + highBonus + scoreValue(card) / 5;
  }, 0);
}

function getAiRevealPatternPressure(player) {
  if (!player) return 0;
  const bulldozers = findSerialTuples(player.hand, 3);
  if (bulldozers.length > 0) return 3;
  const trains = findSerialTuples(player.hand, 2).filter((combo) => classifyPlay(combo).type === "train");
  if (trains.length > 0) return 3;
  const tractors = findSerialTuples(player.hand, 2).filter((combo) => classifyPlay(combo).type === "tractor");
  if (tractors.length > 0) return 2;
  const strongTriples = findTriples(player.hand);
  if (strongTriples.length > 0) return 1;
  return 0;
}

function getGoalkeeperId() {
  return getPreviousPlayerId(state.nextFirstDealPlayerId || PLAYER_ORDER[0]);
}

function getAiRevealIntentScore(playerId) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  let score = 0;
  if (getAiHandStrength(playerId) >= 18) score += 1;
  if (player.hand.filter((card) => isTrump(card)).length >= 4) score += 1;
  score += getAiRevealPatternPressure(player);
  if (state.trickNumber === 1 && playerId === getGoalkeeperId()) {
    score += 2;
  }
  return score;
}

function shouldAiRevealFriend(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  const player = getPlayer(playerId);
  if (!player) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (currentSeen + 1 !== neededOccurrence) return false;
  const hasTarget = player.hand.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
  if (!hasTarget) return false;
  return getAiRevealIntentScore(playerId) >= 2;
}

function chooseAiRevealCombo(candidates) {
  const revealChoices = candidates.filter((combo) =>
    combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank)
  );
  if (revealChoices.length === 0) return [];
  return revealChoices.sort((a, b) => {
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function getPendingPlayersAfter(playerId) {
  if (!state.leadSpec || state.currentTrick.length === 0) return [];
  const pending = [];
  let nextPlayerId = getNextPlayerId(playerId);
  while (nextPlayerId !== state.leaderId && pending.length < PLAYER_ORDER.length) {
    pending.push(nextPlayerId);
    nextPlayerId = getNextPlayerId(nextPlayerId);
  }
  return pending;
}

function canPlayerBeatCurrentWinning(playerId) {
  const legalSelections = getLegalSelectionsForPlayer(playerId, 48);
  return legalSelections.some((combo) => doesSelectionBeatCurrent(playerId, combo));
}

function isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay) {
  if (!currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return false;
  return !getPendingPlayersAfter(playerId).some((pendingPlayerId) => canPlayerBeatCurrentWinning(pendingPlayerId));
}

function getTargetVirtualCard(target = state.friendTarget) {
  if (!target) return null;
  return {
    id: `target-${target.suit}-${target.rank}`,
    suit: target.suit,
    rank: target.rank,
  };
}

function isOneStepBelowFriendTarget(card, target = state.friendTarget) {
  if (!card || !target || target.suit === "joker" || card.suit !== target.suit) return false;
  const targetCard = getTargetVirtualCard(target);
  if (!targetCard) return false;
  return getPatternUnitPower(targetCard, effectiveSuit(targetCard)) - getPatternUnitPower(card, effectiveSuit(card)) === 1;
}

function chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) {
  if (!state.friendTarget || !currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return [];
  if (state.trickNumber !== 1 || state.currentTrick[0]?.playerId !== state.bankerId) return [];
  if (state.currentTrick[0]?.cards.length !== 1) return [];

  const bankerLeadCard = state.currentTrick[0].cards[0];
  if (!isOneStepBelowFriendTarget(bankerLeadCard, state.friendTarget)) return [];
  if (!isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay)) return [];

  const supportChoices = candidates.filter((combo) =>
    !combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank)
      && !doesSelectionBeatCurrent(state.currentTurnId, combo)
  );

  if (supportChoices.length === 0) return [];

  return supportChoices.sort((a, b) => {
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function getLegalSelectionsForPlayer(playerId, limit = 72) {
  const player = getPlayer(playerId);
  if (!player || state.currentTrick.length === 0) return [];
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const targetCount = state.leadSpec.count;
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  const pools = [];
  if (suited.length >= targetCount) {
    pools.push(suited);
  } else if (suited.length > 0) {
    pools.push([...suited, ...hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id))]);
  }
  pools.push(hand);

  const seen = new Set();
  const results = [];
  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    for (const combo of enumerateCombinations(pool, targetCount)) {
      if (!validateSelection(playerId, combo).ok) continue;
      const key = combo.map((card) => card.id).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(combo);
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function chooseAiLeadPlay(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  if (playerId === state.bankerId && state.friendTarget && !isFriendTeamResolved() && state.friendTarget.suit !== "joker") {
    const targetCopies = player.hand.filter(
      (card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
    );
    const currentSeen = state.friendTarget.matchesSeen || 0;
    const remainingBeforeReveal = (state.friendTarget.occurrence || 1) - currentSeen;
    if (targetCopies.length > 0 && remainingBeforeReveal > 1) {
      return [targetCopies[0]];
    }
    const searchSuitCards = player.hand.filter(
      (card) => card.suit === state.friendTarget.suit && card.rank !== state.friendTarget.rank
    );
    if (searchSuitCards.length > 0) {
      return [lowestCard(searchSuitCards)];
    }
  }
  if (shouldAiRevealFriend(playerId)) {
    const friendCard = player.hand.find((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
    if (friendCard) return [friendCard];
  }
  return [];
}

function chooseAiFollowPlay(playerId, candidates) {
  if (candidates.length === 0) return [];
  const currentWinningPlay = getCurrentWinningPlay();
  const allyWinning = currentWinningPlay ? areSameSide(playerId, currentWinningPlay.playerId) : false;
  const beatingCandidates = candidates.filter((combo) => doesSelectionBeatCurrent(playerId, combo));
  const revealChoice = shouldAiRevealFriend(playerId) ? chooseAiRevealCombo(candidates) : [];
  const supportChoice = revealChoice.length > 0 ? chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) : [];

  if (supportChoice.length > 0) {
    return supportChoice;
  }

  if (revealChoice.length > 0 && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  if (!allyWinning && beatingCandidates.length > 0) {
    return beatingCandidates.sort((a, b) => {
      const aPattern = classifyPlay(a);
      const bPattern = classifyPlay(b);
      const powerDiff = aPattern.power - bPattern.power;
      if (powerDiff !== 0) return powerDiff;
      return a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    })[0];
  }

  if (allyWinning) {
    const nonBeating = candidates.filter((combo) => !doesSelectionBeatCurrent(playerId, combo));
    const feedChoices = nonBeating.length > 0 ? nonBeating : candidates;
    return feedChoices.sort((a, b) => {
      const scoreDiff = b.reduce((sum, card) => sum + scoreValue(card), 0) - a.reduce((sum, card) => sum + scoreValue(card), 0);
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a).power - classifyPlay(b).power;
    })[0];
  }

  if (revealChoice.length > 0) {
    return revealChoice;
  }

  return candidates.sort((a, b) => {
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function getLegalHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];

  const hand = player.hand;
  if (state.currentTrick.length === 0) {
    const aiLead = chooseAiLeadPlay(playerId);
    if (aiLead.length > 0) return aiLead;
    const bulldozers = findSerialTuples(hand, 3);
    if (bulldozers.length > 0) return bulldozers[0];
    const trains = findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "train");
    if (trains.length > 0) return trains[0];
    const tractors = findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "tractor");
    if (tractors.length > 0) return tractors[0];
    const triples = findTriples(hand);
    if (triples.length > 0) return triples[0];
    const pairs = findPairs(hand);
    if (pairs.length > 0) return pairs[0];
    return hand.length > 0 ? [hand[0]] : [];
  }

  if (state.leadSpec.type === "single") {
    const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
    return suited.length > 0 ? [lowestCard(suited)] : [lowestCard(hand)];
  }

  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  const candidates = getLegalSelectionsForPlayer(playerId);
  const aiChoice = chooseAiFollowPlay(playerId, candidates);
  if (aiChoice.length > 0) return aiChoice;
  if (suited.length >= state.leadSpec.count) {
    if (state.leadSpec.type === "pair") {
      const suitedPairs = findPairs(suited);
      if (hasForcedPair(suited) && suitedPairs.length > 0) return suitedPairs[0];
    }
    if (state.leadSpec.type === "triple") {
      const suitedTriples = findTriples(suited);
      if (suitedTriples.length > 0) return suitedTriples[0];
      const searched = findLegalSelectionBySearch(playerId);
      if (searched.length > 0) return searched;
    }
    if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train" || state.leadSpec.type === "bulldozer" || state.leadSpec.type === "throw") {
      const combos = getPatternCombos(suited, state.leadSpec);
      if (combos.length > 0) return combos[0];
      const searched = findLegalSelectionBySearch(playerId);
      if (searched.length > 0) return searched;
    }
    return suited.slice(-state.leadSpec.count);
  }
  if (suited.length > 0) {
    const fillers = hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id));
    return [...suited, ...fillers.slice(0, state.leadSpec.count - suited.length)];
  }

  const trumpCards = hand.filter((card) => effectiveSuit(card) === "trump");
  if (state.leadSpec.type === "pair") {
    const trumpPairs = findPairs(trumpCards);
    if (trumpPairs.length > 0) return trumpPairs[0];
  }
  if (state.leadSpec.type === "triple") {
    const trumpTriples = findTriples(trumpCards);
    if (trumpTriples.length > 0) return trumpTriples[0];
  }
  if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train" || state.leadSpec.type === "bulldozer" || state.leadSpec.type === "throw") {
    const trumpCombos = getPatternCombos(trumpCards, state.leadSpec);
    if (trumpCombos.length > 0) return trumpCombos[0];
  }
  return hand.slice(0, state.leadSpec.count);
}

function lowestCard(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b))[0];
}

function findPairs(cards) {
  return findTuples(cards, 2);
}

function hasForcedPair(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()].some((count) => count === 2 || count >= 4);
}

function getCardGroupCounts(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()];
}

function getForcedPairUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => {
    if (count < 2 || count === 3) return sum;
    return sum + Math.floor(count / 2);
  }, 0);
}

function getTripleUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => sum + Math.floor(count / 3), 0);
}

function getForcedPairUnitsWithReservedTriples(cards, reservedTriples = 0) {
  const counts = getCardGroupCounts(cards);
  let triplesLeft = reservedTriples;

  while (triplesLeft > 0) {
    const candidates = counts
      .map((count, index) => ({ count, index }))
      .filter((entry) => entry.count >= 3);
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      const pairLossA = getPairUnitsFromCount(a.count) - getPairUnitsFromCount(a.count - 3);
      const pairLossB = getPairUnitsFromCount(b.count) - getPairUnitsFromCount(b.count - 3);
      if (pairLossA !== pairLossB) return pairLossA - pairLossB;
      return a.count - b.count;
    });

    counts[candidates[0].index] -= 3;
    triplesLeft -= 1;
  }

  return counts.reduce((sum, count) => sum + getPairUnitsFromCount(count), 0);
}

function getPairUnitsFromCount(count) {
  if (count < 2 || count === 3) return 0;
  return Math.floor(count / 2);
}

function findTriples(cards) {
  return findTuples(cards, 3);
}

function findTuples(cards, tupleSize) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }
  return [...map.values()]
    .filter((group) => group.length >= tupleSize)
    .map((group) => group.slice(0, tupleSize))
    .sort((a, b) => getPatternUnitPower(a[0]) - getPatternUnitPower(b[0]));
}

function getNonTrumpRankIndex(rank) {
  const currentLevelRank = getCurrentLevelRank();
  const ranks = RANKS.filter((item) => item !== currentLevelRank);
  return ranks.indexOf(rank);
}

function isExactTriple(cards) {
  return cards.length === 3
    && cards.every((card) => card.rank === cards[0].rank && card.suit === cards[0].suit);
}

function findSerialTuples(cards, tupleSize, exactChainLength = null) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const bySuit = new Map();
  for (const group of map.values()) {
    if (group.length < tupleSize) continue;
    const tuple = group.slice(0, tupleSize);
    const suit = effectiveSuit(tuple[0]);
    const entry = {
      cards: tuple,
      suit,
      index: getPatternUnitPower(tuple[0], suit),
    };
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(entry);
  }

  const results = [];
  for (const entries of bySuit.values()) {
    entries.sort((a, b) => a.index - b.index);
    let runStart = 0;
    for (let i = 1; i <= entries.length; i += 1) {
      const consecutive = i < entries.length && entries[i].index - entries[i - 1].index === 1;
      if (consecutive) continue;
      const run = entries.slice(runStart, i);
      const need = exactChainLength || run.length;
      if (run.length >= 2 && run.length >= need) {
        if (exactChainLength) {
          for (let j = 0; j <= run.length - exactChainLength; j += 1) {
            results.push(run.slice(j, j + exactChainLength).flatMap((entry) => entry.cards));
          }
        } else {
          results.push(run.flatMap((entry) => entry.cards));
        }
      }
      runStart = i;
    }
  }

  return results.sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
}

function isSameSuitSet(cards) {
  if (cards.length === 0) return false;
  const suit = effectiveSuit(cards[0]);
  return cards.every((card) => effectiveSuit(card) === suit);
}

function decomposeThrowComponents(cards) {
  if (!isSameSuitSet(cards)) return null;
  const remaining = [...cards].sort((a, b) => cardStrength(b) - cardStrength(a));
  const components = [];

  const takeComponent = (componentCards) => {
    for (const picked of componentCards) {
      const index = remaining.findIndex((card) => card.id === picked.id);
      if (index >= 0) remaining.splice(index, 1);
    }
    components.push({
      ...classifyPlay(componentCards),
      cards: sortPlayedCards(componentCards),
    });
  };

  while (remaining.length > 0) {
    const bulldozers = findSerialTuples(remaining, 3);
    if (bulldozers.length > 0) {
      takeComponent(bulldozers[bulldozers.length - 1]);
      continue;
    }
    const serialPairs = findSerialTuples(remaining, 2);
    if (serialPairs.length > 0) {
      takeComponent(serialPairs[serialPairs.length - 1]);
      continue;
    }
    const triples = findTriples(remaining);
    if (triples.length > 0) {
      takeComponent(triples[triples.length - 1]);
      continue;
    }
    const pairs = findPairs(remaining);
    if (pairs.length > 0) {
      takeComponent(pairs[pairs.length - 1]);
      continue;
    }
    takeComponent([remaining[0]]);
  }

  return components.every((component) => component.ok) ? components : null;
}

function isSerialTuplePlay(cards, tupleSize) {
  if (cards.length < tupleSize * 2 || cards.length % tupleSize !== 0) return false;
  const suit = effectiveSuit(cards[0]);
  if (cards.some((card) => effectiveSuit(card) !== suit)) return false;

  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const groups = [...map.values()];
  if (groups.some((group) => group.length !== tupleSize)) return false;

  const ordered = groups
    .map((group) => ({
      index: getPatternUnitPower(group[0], suit),
      key: `${group[0].suit}-${group[0].rank}`,
    }))
    .sort((a, b) => a.index - b.index);

  if (new Set(ordered.map((item) => item.key)).size !== groups.length) return false;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].index - ordered[i - 1].index !== 1) {
      return false;
    }
  }
  return true;
}

function classifyPlay(cards) {
  const sorted = sortPlayedCards(cards);
  const suit = sorted.length > 0 ? effectiveSuit(sorted[0]) : null;
  if (sorted.length === 1) {
    return { ok: true, type: "single", count: 1, suit, power: cardStrength(sorted[0]) };
  }
  if (isExactPair(sorted)) {
    return { ok: true, type: "pair", count: 2, suit, power: cardStrength(sorted[0]) };
  }
  if (isExactTriple(sorted)) {
    return { ok: true, type: "triple", count: 3, suit, power: cardStrength(sorted[0]) };
  }
  if (isSerialTuplePlay(sorted, 2)) {
    const pairs = findPairs(sorted).sort((a, b) => getPatternUnitPower(a[0], suit) - getPatternUnitPower(b[0], suit));
    const chainLength = pairs.length;
    return {
      ok: true,
      type: chainLength >= 4 ? "train" : "tractor",
      count: sorted.length,
      suit,
      chainLength,
      tupleSize: 2,
      power: getPatternUnitPower(pairs[pairs.length - 1][0], suit),
    };
  }
  if (isSerialTuplePlay(sorted, 3)) {
    const triples = findTriples(sorted).sort((a, b) => getPatternUnitPower(a[0], suit) - getPatternUnitPower(b[0], suit));
    return {
      ok: true,
      type: "bulldozer",
      count: sorted.length,
      suit,
      chainLength: triples.length,
      tupleSize: 3,
      power: getPatternUnitPower(triples[triples.length - 1][0], suit),
    };
  }
  const throwComponents = sorted.length > 1 ? decomposeThrowComponents(sorted) : null;
  if (throwComponents && throwComponents.length > 1) {
    return {
      ok: true,
      type: "throw",
      count: sorted.length,
      suit,
      components: throwComponents,
      power: Math.max(...throwComponents.map((component) => component.power ?? 0)),
    };
  }
  return { ok: false, type: "invalid", count: sorted.length, suit };
}

function matchesLeadPattern(pattern, leadSpec) {
  if (!pattern?.ok || !leadSpec) return false;
  if (pattern.count !== leadSpec.count) return false;
  if (pattern.type !== leadSpec.type) return false;
  if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") {
    return pattern.chainLength === leadSpec.chainLength;
  }
  return true;
}

function hasMatchingPattern(cards, leadSpec) {
  if (!leadSpec) return false;
  if (leadSpec.type === "single") return cards.length >= 1;
  if (leadSpec.type === "pair") return findPairs(cards).length > 0;
  if (leadSpec.type === "triple") return findTriples(cards).length > 0;
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "train") return findSerialTuples(cards, 2, leadSpec.chainLength).some((combo) => classifyPlay(combo).type === "train");
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "throw") return cards.length >= leadSpec.count;
  return false;
}

function getPatternCombos(cards, leadSpec) {
  if (!leadSpec) return [];
  if (leadSpec.type === "single") return cards.map((card) => [card]).sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  if (leadSpec.type === "pair") return findPairs(cards);
  if (leadSpec.type === "triple") return findTriples(cards);
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength);
  if (leadSpec.type === "train") return findSerialTuples(cards, 2, leadSpec.chainLength).filter((combo) => classifyPlay(combo).type === "train");
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength);
  if (leadSpec.type === "throw") {
    return enumerateCombinations(cards, leadSpec.count)
      .filter((combo) => isSameSuitSet(combo) && classifyPlay(combo).ok)
      .sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  }
  return [];
}

function enumerateCombinations(cards, count) {
  const results = [];
  const current = [];
  const limit = count <= 4 ? 240 : count <= 6 ? 360 : 520;

  function walk(start) {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < cards.length; i += 1) {
      current.push(cards[i]);
      walk(i + 1);
      current.pop();
      if (results.length >= limit) return;
    }
  }

  walk(0);
  return results;
}

function findLegalSelectionBySearch(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  if (state.currentTrick.length === 0) return [];

  const targetCount = state.leadSpec.count;
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  const pools = [];

  if (suited.length >= targetCount) {
    pools.push(suited);
  } else if (suited.length > 0) {
    pools.push([...suited, ...hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id))]);
  }

  if (!pools.some((pool) => pool.length === hand.length)) {
    pools.push(hand);
  }

  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    const combos = enumerateCombinations(pool, targetCount);
    const validCombo = combos.find((combo) => validateSelection(playerId, combo).ok);
    if (validCombo) return validCombo;
  }

  return [];
}

function compareSameTypePlay(candidatePattern, currentPattern, leadSuit) {
  const candidateTrump = candidatePattern.suit === "trump";
  const currentTrump = currentPattern.suit === "trump";
  if (candidateTrump && !currentTrump) return 1;
  if (!candidateTrump && currentTrump) return -1;
  if (!candidateTrump && !currentTrump) {
    if (candidatePattern.suit === leadSuit && currentPattern.suit !== leadSuit) return 1;
    if (candidatePattern.suit !== leadSuit && currentPattern.suit === leadSuit) return -1;
  }
  return candidatePattern.power - currentPattern.power;
}

function compareComponentSize(a, b) {
  if ((a.power ?? 0) !== (b.power ?? 0)) return (a.power ?? 0) - (b.power ?? 0);
  if ((a.count ?? 0) !== (b.count ?? 0)) return (a.count ?? 0) - (b.count ?? 0);
  const typeOrder = { single: 0, pair: 1, triple: 2, tractor: 3, train: 4, bulldozer: 5 };
  return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
}

function handHasStrongerPattern(hand, targetPattern) {
  const suited = hand.filter((card) => effectiveSuit(card) === targetPattern.suit);
  const combos = getPatternCombos(suited, targetPattern);
  return combos.some((combo) => {
    const candidate = classifyPlay(combo);
    return compareSameTypePlay(candidate, targetPattern, targetPattern.suit) > 0;
  });
}

function getThrowFailure(playerId, pattern) {
  if (!pattern?.ok || pattern.type !== "throw" || state.currentTrick.length !== 0) return null;
  const vulnerableComponents = pattern.components.filter((component) =>
    state.players.some((player) =>
      player.id !== playerId && handHasStrongerPattern(player.hand, component)
    )
  );
  if (vulnerableComponents.length === 0) return null;
  const forcedComponent = [...vulnerableComponents].sort(compareComponentSize)[0];
  return {
    forcedCards: forcedComponent.cards,
    failedComponent: forcedComponent,
  };
}

function applyThrowFailurePenalty(playerId) {
  const penalty = 10;
  const player = getPlayer(playerId);
  if (!player) return penalty;
  player.roundPoints -= penalty;
  if (!isFriendTeamResolved()) {
    player.capturedPoints -= penalty;
  }
  if (isFriendTeamResolved() && isDefenderTeam(playerId)) {
    state.defenderPoints -= penalty;
  } else if (isFriendTeamResolved()) {
    state.defenderPoints += penalty;
  }
  return penalty;
}

function getThrowPenaltySummary(playerId, penalty) {
  return isDefenderTeam(playerId)
    ? `非打家少 ${penalty} 分`
    : `非打家加 ${penalty} 分`;
}

function validateSelection(playerId, cards) {
  const player = getPlayer(playerId);
  if (!player || cards.length === 0) {
    return { ok: false, reason: "请选择要出的牌。" };
  }
  const pattern = classifyPlay(cards);

  if (state.currentTrick.length === 0) {
    if (pattern.ok) return { ok: true };
    return { ok: false, reason: "首家当前支持单张、对子、拖拉机、火车、刻子、推土机和基础甩牌。" };
  }

  if (cards.length !== state.leadSpec.count) {
    return { ok: false, reason: `这一轮需要跟 ${state.leadSpec.count} 张牌。` };
  }

  const suited = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length >= state.leadSpec.count) {
    if (!cards.every((card) => effectiveSuit(card) === state.leadSpec.suit)) {
      return { ok: false, reason: "有足够同门牌时，必须先跟同门。"};
    }

    if (state.leadSpec.type === "pair") {
      if (hasForcedPair(suited) && pattern.type !== "pair") {
        return { ok: false, reason: "对家出对时，你有对子就必须跟对子；三张刻子不用强拆成对。" };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "triple") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: "首家出刻子时，你有刻子就必须跟刻子。" };
        }
        return { ok: true };
      }

      if (hasForcedPair(suited) && getForcedPairUnits(cards) < 1) {
        return { ok: false, reason: "首家出刻子时，没有刻子也要尽量跟对子。" };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: "首家出拖拉机或火车时，你有同长度连对就必须跟连对。" };
        }
        return { ok: true };
      }

      const requiredPairs = Math.min(state.leadSpec.chainLength || 0, getForcedPairUnits(suited));
      if (requiredPairs > 0 && getForcedPairUnits(cards) < requiredPairs) {
        return { ok: false, reason: "首家出拖拉机或火车时，没有连对也要尽量跟对子；三张刻子不用拆对。" };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "bulldozer") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: "首家出推土机时，你有同长度推土机就必须跟推土机。" };
        }
        return { ok: true };
      }

      const requiredTriples = Math.min(state.leadSpec.chainLength || 0, getTripleUnits(suited));
      if (requiredTriples > 0 && getTripleUnits(cards) < requiredTriples) {
        return { ok: false, reason: "首家出推土机时，你有刻子就必须先跟刻子。" };
      }

      const requiredPairs = Math.min(2, getForcedPairUnitsWithReservedTriples(suited, requiredTriples));
      if (requiredPairs > 0 && getForcedPairUnitsWithReservedTriples(cards, requiredTriples) < requiredPairs) {
        return { ok: false, reason: "首家出推土机时，你有对子就必须跟对子；两对即可，不需要把三张硬拆成对。" };
      }
      return { ok: true };
    }

    if (hasMatchingPattern(suited, state.leadSpec) && !matchesLeadPattern(pattern, state.leadSpec)) {
      return { ok: false, reason: "有同牌型可跟时，必须按同牌型跟牌。"};
    }
    return { ok: true };
  }

  if (suited.length > 0) {
    const suitedIds = new Set(suited.map((card) => card.id));
    const selectedSuitedCount = cards.filter((card) => suitedIds.has(card.id)).length;
    if (selectedSuitedCount !== suited.length) {
      return { ok: false, reason: "同门牌不够时，必须把手里剩余的同门牌全部跟出。"};
    }
    return { ok: true };
  }

  return { ok: true };
}

function isExactPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank && cards[0].suit === cards[1].suit;
}

function autoPlayCurrentTurn() {
  const player = getPlayer(state.currentTurnId);
  if (!player || state.gameOver) return;
  const chosen = getLegalHintForPlayer(player.id);
  if (chosen.length > 0 && playCards(player.id, chosen.map((card) => card.id))) {
    return;
  }
  const fallback = findLegalSelectionBySearch(player.id);
  if (fallback.length === 0) return;
  playCards(player.id, fallback.map((card) => card.id));
}

function playCards(playerId, cardIds, options = {}) {
  const player = getPlayer(playerId);
  if (!player || state.gameOver) return false;

  let cards = cardIds.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean);
  let pattern = classifyPlay(cards);
  const throwFailure = getThrowFailure(playerId, pattern);
  if (throwFailure) {
    cards = throwFailure.forcedCards;
    pattern = classifyPlay(cards);
  }
  const currentWinningPlay = state.currentTrick.length > 0 ? getCurrentWinningPlay() : null;
  const beatPlay = !!currentWinningPlay && doesSelectionBeatCurrent(playerId, cards);
  const validation = validateSelection(playerId, cards);
  if (!validation.ok) {
    if (player.isHuman) {
      dom.actionHint.textContent = validation.reason;
    }
    return false;
  }

  clearTimers();
  state.selectedCardIds = [];
  const resolvedCardIds = cards.map((card) => card.id);

  for (const cardId of resolvedCardIds) {
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      player.hand.splice(index, 1);
    }
  }
  player.hand = sortHand(player.hand);

  const playedCards = sortPlayedCards(cards);
  const exposedTrumpVoid = state.currentTrick.length > 0
    && state.leadSpec?.suit === "trump"
    && playedCards.some((card) => effectiveSuit(card) !== "trump")
    && !player.hand.some((card) => isTrump(card));
  if (exposedTrumpVoid) {
    state.exposedTrumpVoid[playerId] = true;
  }
  state.currentTrick.push({ playerId, cards: playedCards });
  player.played = playedCards;
  let leadTrumpAnnouncement = false;

  if (state.currentTrick.length === 1) {
    const leadPattern = pattern;
    state.leadSpec = { ...leadPattern, leaderId: playerId };
    if (leadPattern.suit === "trump") {
      leadTrumpAnnouncement = true;
    }
  }

  const friendProgressAnnouncement = getFriendProgressAnnouncement(playerId, playedCards);
  const friendReveal = maybeRevealFriend(playerId, playedCards);
  if (throwFailure) {
    const penalty = applyThrowFailurePenalty(playerId);
    appendLog(`${player.name} 甩牌失败，强制改出：${playedCards.map(shortCardLabel).join("、")}，扣 ${penalty} 分（${getThrowPenaltySummary(playerId, penalty)}）。`);
    queueCenterAnnouncement(`${player.name} 甩牌失败 · 扣${penalty}分`, "strong");
  } else {
    appendLog(`${player.name} 出牌：${playedCards.map(shortCardLabel).join("、")}。`);
  }
  if (friendReveal?.message) {
    queueCenterAnnouncement(friendReveal.message, friendReveal.tone || "default");
  } else if (friendProgressAnnouncement?.message) {
    queueCenterAnnouncement(friendProgressAnnouncement.message, friendProgressAnnouncement.tone || "default");
  }
  if (beatPlay) {
    const beatAnnouncement = state.currentTrickBeatCount > 0
      ? `${player.name} 盖毙`
      : `${player.name} 毙牌`;
    queueCenterAnnouncement(beatAnnouncement, "strong");
    state.currentTrickBeatCount += 1;
  }
  const playAnnouncement = throwFailure || (pattern.type === "throw" && state.currentTrick.length > 1)
    ? ""
    : getPlayAnnouncement(playerId, pattern, { leadTrump: leadTrumpAnnouncement });
  if (playAnnouncement) {
    queueCenterAnnouncement(playAnnouncement, leadTrumpAnnouncement && isVisibleAllyOfHuman(playerId) ? "ally" : "default");
  }

  if (state.currentTrick.length === 5) {
    resolveTrick(options);
    return true;
  }

  state.currentTurnId = getNextPlayerId(playerId);
  render();
  if (!options.skipStartTurn) {
    startTurn();
  }
  return true;
}

function sortPlayedCards(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b));
}

function maybeRevealFriend(playerId, cards) {
  if (!state.friendTarget) return null;
  if (state.friendTarget.revealed || state.friendTarget.failed) return null;
  const matchedCards = cards.filter(
    (card) => card.rank === state.friendTarget.rank && card.suit === state.friendTarget.suit
  );
  if (matchedCards.length === 0) return null;

  for (const _card of matchedCards) {
    const nextOccurrence = (state.friendTarget.matchesSeen || 0) + 1;
    state.friendTarget.matchesSeen = nextOccurrence;

    if (nextOccurrence === state.friendTarget.occurrence) {
      if (playerId === state.bankerId) {
        state.friendTarget.failed = true;
        state.hiddenFriendId = null;
        state.defenderPoints = recalcDefenderPoints();
        for (const seatPlayer of state.players) {
          seatPlayer.capturedPoints = 0;
        }
        appendLog(`${getPlayer(playerId).name} 误打出了${describeTarget(state.friendTarget)}，本局无朋友，变为 1 打 4。`);
        return {
          message: `${getPlayer(playerId).name} 误出朋友牌 · 1打4`,
          tone: "strong",
        };
      }
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = playerId;
      state.hiddenFriendId = playerId;
      state.defenderPoints = recalcDefenderPoints();
      for (const seatPlayer of state.players) {
        seatPlayer.capturedPoints = 0;
        }
      appendLog(`${getPlayer(playerId).name} 打出了${describeTarget(state.friendTarget)}，朋友身份揭晓。`);
      appendLog(`阵营已揭晓，非打家当前累计 ${state.defenderPoints} 分。`);
      return {
        message: `${getPlayer(playerId).name} 站队了`,
        tone: "friend",
      };
    }
  }
  return null;
}

function resolveTrick(options = {}) {
  const winnerId = pickTrickWinner();
  const winner = getPlayer(winnerId);
  const trickPoints = state.currentTrick.reduce(
    (sum, play) => sum + play.cards.reduce((cardSum, card) => cardSum + scoreValue(card), 0),
    0
  );

  winner.roundPoints += trickPoints;
  if (!isFriendTeamResolved()) {
    winner.capturedPoints += trickPoints;
  }
  if (isFriendTeamResolved() && isDefenderTeam(winnerId)) {
    state.defenderPoints += trickPoints;
  }

  state.lastTrick = {
    plays: state.currentTrick.map((play) => ({ ...play })),
    winnerId,
    points: trickPoints,
    trickNumber: state.trickNumber,
  };

  appendLog(`${getPlayer(winnerId).name} 赢下第 ${state.trickNumber} 轮，获得 ${trickPoints} 分。`);
  queueCenterAnnouncement(
    getTrickOutcomeAnnouncement(winnerId),
    isVisibleAllyOfHuman(winnerId) ? "ally" : "strong"
  );

  const everyoneEmpty = state.players.every((player) => player.hand.length === 0);
  if (everyoneEmpty) {
    const defenderWinningFinal = isFriendTeamResolved() ? isDefenderTeam(winnerId) : winnerId !== state.bankerId;
    if (defenderWinningFinal) {
      const bottomBasePoints = Math.min(
        state.bottomCards.reduce((sum, card) => sum + scoreValue(card), 0),
        25
      );
      const bottomPoints = bottomBasePoints * 2;
      if (bottomPoints > 0) {
        winner.roundPoints += bottomPoints;
        if (!isFriendTeamResolved()) {
          winner.capturedPoints += bottomPoints;
        }
        if (isFriendTeamResolved()) {
          state.defenderPoints += bottomPoints;
        }
        appendLog(`最后一轮由非打家方获胜，底牌分按最多 25 分封顶后双倍计入，再加 ${bottomPoints} 分。`);
      }
      const bottomPenalty = getBottomPenalty();
      if (bottomPenalty) {
        appendLog(`非打家以${bottomPenalty.label}完成扣底，打家额外降 ${bottomPenalty.levels} 级。`);
      }
    }
    state.phase = "ending";
    state.currentTurnId = winnerId;
    render();
    if (options.skipResolveDelay) {
      finishGame();
    } else {
      state.trickPauseTimer = window.setTimeout(() => {
        state.trickPauseTimer = null;
        finishGame();
      }, 1800);
    }
    return;
  }

  state.phase = "pause";
  state.currentTurnId = winnerId;
  render();

  const advanceToNextTrick = () => {
    state.currentTrick = [];
    state.currentTrickBeatCount = 0;
    state.leadSpec = null;
    for (const player of state.players) {
      player.played = [];
    }
    state.trickNumber += 1;
    state.phase = "playing";
    render();
    startTurn();
  };

  if (options.skipResolveDelay) {
    advanceToNextTrick();
  } else {
    state.trickPauseTimer = window.setTimeout(() => {
      state.trickPauseTimer = null;
      advanceToNextTrick();
    }, 2400);
  }
}

function pickTrickWinner() {
  if (!state.leadSpec) return state.leaderId;
  if (state.leadSpec.type === "single") {
    let winner = state.currentTrick[0];
    for (const play of state.currentTrick.slice(1)) {
      if (compareSingle(play.cards[0], winner.cards[0], state.leadSpec.suit) > 0) {
        winner = play;
      }
    }
    return winner.playerId;
  }

  let best = state.currentTrick[0];
  let bestPattern = classifyPlay(best.cards);
  for (const play of state.currentTrick.slice(1)) {
    const pattern = classifyPlay(play.cards);
    if (!matchesLeadPattern(pattern, state.leadSpec)) continue;
    if (compareSameTypePlay(pattern, bestPattern, state.leadSpec.suit) > 0) {
      best = play;
      bestPattern = pattern;
    }
  }
  return best.playerId;
}

function getCurrentWinningPlay() {
  if (state.currentTrick.length === 0) return null;
  const winnerId = pickTrickWinner();
  return state.currentTrick.find((play) => play.playerId === winnerId) || null;
}

function getBeatHintForPlayer(playerId) {
  if (!state.leadSpec || state.currentTrick.length === 0) return [];
  const player = getPlayer(playerId);
  if (!player) return [];

  const suited = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length > 0) return [];

  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  if (trumpCards.length < state.leadSpec.count) return [];

  const currentWinningPlay = getCurrentWinningPlay();
  if (!currentWinningPlay) return [];
  const currentPattern = classifyPlay(currentWinningPlay.cards);

  const combos = getPatternCombos(trumpCards, state.leadSpec);

  const beatingCombo = combos.find((combo) => {
    const pattern = classifyPlay(combo);
    return compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) > 0;
  });

  return beatingCombo || [];
}

function doesSelectionBeatCurrent(playerId, cards) {
  if (!state.leadSpec || state.currentTrick.length === 0 || cards.length === 0) return false;
  const player = getPlayer(playerId);
  if (!player) return false;
  const hand = player.hand;
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length > 0) return false;

  const pattern = classifyPlay(cards);
  if (!matchesLeadPattern(pattern, state.leadSpec)) return false;

  const currentWinningPlay = getCurrentWinningPlay();
  if (!currentWinningPlay) return false;
  const currentPattern = classifyPlay(currentWinningPlay.cards);
  return compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) > 0;
}

function compareSingle(candidate, current, leadSuit) {
  const candidateSuit = effectiveSuit(candidate);
  const currentSuit = effectiveSuit(current);
  const candidateTrump = candidateSuit === "trump";
  const currentTrump = currentSuit === "trump";
  if (candidateTrump && !currentTrump) return 1;
  if (!candidateTrump && currentTrump) return -1;
  if (!candidateTrump && !currentTrump) {
    if (candidateSuit === leadSuit && currentSuit !== leadSuit) return 1;
    if (candidateSuit !== leadSuit && currentSuit === leadSuit) return -1;
  }
  return getPatternUnitPower(candidate, candidateSuit) - getPatternUnitPower(current, currentSuit);
}

function isDefenderTeam(playerId) {
  if (playerId === state.bankerId) return false;
  if (state.friendTarget?.failed) return true;
  if (!state.friendTarget?.revealed) return false;
  return playerId !== state.hiddenFriendId;
}

function didHumanSideWin(outcome) {
  const humanOnBankerTeam = state.bankerId === 1
    || (state.friendTarget?.revealed && state.friendTarget.revealedBy === 1);
  if (humanOnBankerTeam) {
    return outcome.bankerLevels > 0 || state.defenderPoints < 120;
  }
  return state.defenderPoints >= 120;
}

function finishGame() {
  state.gameOver = true;
  clearTimers();
  if (state.friendTarget && !isFriendTeamResolved()) {
    state.friendTarget.failed = true;
    state.hiddenFriendId = null;
    state.defenderPoints = recalcDefenderPoints();
    appendLog("本局朋友牌始终未被他人打出，按 1 打 4 结算。");
  }
  const bottomResult = getBottomResultSummary();
  state.nextFirstDealPlayerId = bottomResult?.nextLeadPlayerId || state.bankerId;
  const outcome = getOutcome(state.defenderPoints);
  const humanWon = didHumanSideWin(outcome);
  applyLevelSettlement(outcome, bottomResult?.penalty || null);
  dom.resultCard.classList.toggle("win", humanWon);
  dom.resultCard.classList.toggle("loss", !humanWon);
  dom.resultTitle.textContent = humanWon ? "获胜" : "失败";
  dom.resultBody.textContent = `${outcome.body}${getBottomResultText(bottomResult)}${getLevelSettlementSummary(outcome)}`;
  dom.resultOverlay.classList.add("show");
  startResultCountdown();
  render();
}

function getOutcome(points) {
  if (points === 0) {
    return {
      title: "打家方大光",
      body: "非打家总分为 0 分，打家方升 3 级。当前这一版原型已经按你的五人规则做了这条判定。",
      bankerLevels: 3,
      defenderLevels: 0,
    };
  }
  if (points < 60) {
    return {
      title: "打家方小光",
      body: `非打家总分为 ${points} 分，小于 60 分，打家方升 2 级。`,
      bankerLevels: 2,
      defenderLevels: 0,
    };
  }
  if (points < 120) {
    return {
      title: "打家方获胜",
      body: `非打家总分为 ${points} 分，小于 120 分，打家方正常获胜，升 1 级。`,
      bankerLevels: 1,
      defenderLevels: 0,
    };
  }
  if (points < 165) {
    return {
      title: "非打家方获胜",
      body: `非打家总分为 ${points} 分，已达到 120 分但未到 165 分。非打家方获胜，但本局不升级。`,
      bankerLevels: 0,
      defenderLevels: 0,
    };
  }
  const levels = 1 + Math.floor((points - 165) / 60);
  return {
    title: "非打家方升级",
    body: `非打家总分为 ${points} 分，按你当前规则从 165 分开始升级，本局非打家方升 ${levels} 级。`,
    bankerLevels: 0,
    defenderLevels: levels,
  };
}

function getBankerTeamIds() {
  if (state.friendTarget?.failed) return [state.bankerId];
  return [...new Set([state.bankerId, state.hiddenFriendId].filter(Boolean))];
}

function getDefenderIds() {
  return state.players
    .map((player) => player.id)
    .filter((playerId) => isDefenderTeam(playerId));
}

function applyLevelSettlement(outcome, bankerPenalty = null) {
  if (outcome.bankerLevels > 0) {
    for (const playerId of getBankerTeamIds()) {
      state.playerLevels[playerId] = shiftLevel(getPlayerLevel(playerId), outcome.bankerLevels);
    }
  }
  if (outcome.defenderLevels > 0) {
    for (const playerId of getDefenderIds()) {
      state.playerLevels[playerId] = shiftLevel(getPlayerLevel(playerId), outcome.defenderLevels);
    }
  }
  if (bankerPenalty?.levels > 0) {
    state.playerLevels[state.bankerId] = dropLevel(
      getPlayerLevel(state.bankerId),
      bankerPenalty.levels,
      bankerPenalty.mode || "trump"
    );
  }
  syncPlayerLevels();
  state.levelRank = null;
  saveProgressToCookie();
}

function getLevelSettlementSummary(outcome) {
  const parts = [];
  if (outcome.bankerLevels > 0) {
    const bankerLevels = getBankerTeamIds()
      .map((playerId) => `玩家${playerId} Lv:${getPlayerLevel(playerId)}`)
      .join("，");
    parts.push(`打家方升级后：${bankerLevels}`);
  }
  if (outcome.defenderLevels > 0) {
    const defenderLevels = getDefenderIds()
      .map((playerId) => `玩家${playerId} Lv:${getPlayerLevel(playerId)}`)
      .join("，");
    parts.push(`非打家方升级后：${defenderLevels}`);
  }
  if (parts.length === 0) {
    parts.push("当前等级保持不变，下一局继续按各自 Lv 亮主。");
  } else {
    parts.push("下一局继续按各自 Lv 亮主。");
  }
  return ` ${parts.join(" ")}`;
}

function getBottomPenalty() {
  if (!state.lastTrick || !isDefenderTeam(state.lastTrick.winnerId)) return null;

  const winningPlay = state.lastTrick.plays.find((play) => play.playerId === state.lastTrick.winnerId);
  if (!winningPlay || winningPlay.cards.length === 0) return null;
  if (!winningPlay.cards.every((card) => isTrump(card))) return null;

  if (winningPlay.cards.length === 1) {
    return { levels: 1, label: "单张主牌扣底", winnerId: state.lastTrick.winnerId, mode: "trump" };
  }
  if (winningPlay.cards.length === 2 && isExactPair(winningPlay.cards)) {
    return { levels: 2, label: "两张主牌扣底", winnerId: state.lastTrick.winnerId, mode: "trump" };
  }
  if (winningPlay.cards.length === 3 && isExactTriple(winningPlay.cards)) {
    return { levels: 3, label: "三张主牌扣底", winnerId: state.lastTrick.winnerId, mode: "trump" };
  }
  if (winningPlay.cards.length >= 4) {
    return { levels: 4, label: "主牌拖拉机扣底", winnerId: state.lastTrick.winnerId, mode: "trump" };
  }
  return null;
}

function getBottomResultSummary() {
  if (!state.lastTrick) return null;
  const bottomPlayer = getPlayer(state.lastTrick.winnerId);
  if (!bottomPlayer) return null;
  const defenderBottom = isDefenderTeam(state.lastTrick.winnerId);
  const penalty = getBottomPenalty();
  return {
    playerId: bottomPlayer.id,
    playerName: bottomPlayer.name,
    defenderBottom,
    penalty,
    nextLeadPlayerId: bottomPlayer.id,
  };
}

function getBottomResultText(bottomResult) {
  if (!bottomResult) return "";
  if (!bottomResult.defenderBottom) {
    return ` 最后一轮由${bottomResult.playerName}守底成功，未发生非打家扣底；下一局由玩家${bottomResult.nextLeadPlayerId}先抓牌。`;
  }
  if (bottomResult.penalty) {
    return ` ${bottomResult.playerName}完成扣底，牌型为${bottomResult.penalty.label}，打家额外降 ${bottomResult.penalty.levels} 级；下一局由玩家${bottomResult.nextLeadPlayerId}先抓牌。`;
  }
  return ` ${bottomResult.playerName}完成扣底，但未形成主牌降级；下一局由玩家${bottomResult.nextLeadPlayerId}先抓牌。`;
}

function appendLog(message) {
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, 5);
}

function render() {
  renderFriendPanel();
  renderHud();
  renderScorePanel();
  renderSeats();
  renderTrickSpots();
  renderHand();
  renderLastTrick();
  renderFriendPicker();
  renderLogs();
  renderBottomPanel();
  renderBottomRevealCenter();
  renderResultBottomCards();
  renderCenterPanel();
  const snapshot = {
    phase: state.phase,
    gameOver: state.gameOver,
    bankerId: state.bankerId,
    currentTurnId: state.currentTurnId,
    trickNumber: state.trickNumber,
    countdown: state.countdown,
    defenderPoints: getVisibleDefenderPoints(),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      level: player.level,
      handCount: player.hand.length,
      capturedPoints: player.capturedPoints,
      role: getVisibleRole(player.id),
      exposedTrumpVoid: !!state.exposedTrumpVoid[player.id],
    })),
    declaration: state.declaration
      ? {
          suit: state.declaration.suit,
          rank: state.declaration.rank,
          count: state.declaration.count,
          cards: (state.declaration.cards || []).map((card) => ({
            suit: card.suit,
            rank: card.rank,
            img: card.img,
          })),
        }
      : null,
    friendTarget: state.friendTarget
      ? {
          label: state.friendTarget.label,
          occurrence: state.friendTarget.occurrence || 1,
          suit: state.friendTarget.suit,
          rank: state.friendTarget.rank,
          revealed: !!state.friendTarget.revealed,
          failed: !!state.friendTarget.failed,
          revealedBy: state.friendTarget.revealedBy || null,
        }
      : null,
  };
  window.__fiveFriendsSnapshot = snapshot;
  window.dispatchEvent(new CustomEvent("fivefriends:render", { detail: snapshot }));
}

function renderBottomPanel() {
  dom.bottomPanel.classList.toggle("hidden", !state.showBottomPanel || state.phase === "bottomReveal");
  if (state.gameOver) {
    dom.bottomNote.textContent = "牌局结束，底牌已全部亮出。";
  } else if (state.phase === "bottomReveal") {
    dom.bottomNote.textContent = "当前处于翻底定主展示阶段，底牌公开 30 秒后进入扣底。";
  } else if (!canHumanViewBottomCards()) {
    dom.bottomNote.textContent = "局中只有打家本人可以翻看底牌。";
  } else if (state.phase === "burying") {
    dom.bottomNote.textContent = "你已拿起底牌。整理后请从手中选出 7 张重新扣底；扣完后不能再换。";
  } else {
    dom.bottomNote.textContent = `当前底牌分 ${state.bottomCards.reduce((sum, card) => sum + scoreValue(card), 0)} 分，仅打家本人可翻看。`;
  }

  const canShowCards = state.gameOver || canHumanViewBottomCards();
  dom.bottomCardsMount.innerHTML = canShowCards
    ? state.bottomCards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")
    : '<div class="empty-note">当前不可查看底牌</div>';
}

function renderBottomRevealCenter() {
  const showBottomReveal = state.phase === "bottomReveal";
  dom.bottomRevealCenter.classList.toggle("hidden", !showBottomReveal);
  if (!showBottomReveal) return;

  dom.bottomRevealText.textContent = state.bottomRevealMessage || "无人亮主，由先抓牌玩家翻底定主。";
  dom.bottomRevealTimer.textContent = String(Math.max(0, state.countdown || 0));
  dom.bottomRevealCards.innerHTML = state.bottomCards
    .map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML)
    .join("");
}

function renderResultBottomCards() {
  dom.resultBottomCards.innerHTML = state.bottomCards
    .map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML)
    .join("");
}

function renderFriendPanel() {
  if (!state.friendTarget) {
    dom.friendHint.textContent = state.phase === "callingFriend"
      ? "打家正在叫朋友。通常会先选一门花色，再选其中一张目标牌。"
      : "扣底完成后由打家叫朋友；后续打出这张目标牌的人就是朋友。";
    dom.friendLabel.textContent = "朋友牌待确定";
    dom.friendState.textContent = state.phase === "callingFriend" ? "当前状态：叫朋友中" : "当前状态：尚未进入叫朋友";
    dom.friendOwner.textContent = "朋友身份尚未揭晓";
    dom.friendCardMount.innerHTML = "";
    return;
  }

  dom.friendHint.textContent = "朋友牌已定，先打出它的人就是朋友。";
  dom.friendLabel.textContent = state.friendTarget.label;
  dom.friendState.textContent = state.friendTarget.failed
    ? "当前状态：未找到朋友"
    : state.friendTarget.revealed
      ? "当前状态：已出现"
      : `当前状态：等待第 ${state.friendTarget.occurrence} 张出现（已出 ${state.friendTarget.matchesSeen || 0} 张）`;
  dom.friendOwner.textContent = state.friendTarget.failed
    ? "本局按 1 打 4 进行"
    : state.friendTarget.revealed
    ? `朋友已揭晓：${getPlayer(state.friendTarget.revealedBy).name}`
    : "朋友身份尚未揭晓";
  dom.friendCardMount.innerHTML = "";
  dom.friendCardMount.appendChild(buildCardNode(state.friendTarget, "friend-card"));
}

function renderHud() {
  dom.phaseLabel.textContent = state.gameOver
    ? "牌局结束"
    : state.phase === "ready"
      ? "等待开始"
    : state.phase === "dealing"
      ? "发牌中"
      : state.phase === "bottomReveal"
        ? "翻底定主"
      : state.phase === "countering"
        ? "最后反主"
      : state.phase === "burying"
        ? "扣底中"
      : state.phase === "callingFriend"
        ? "叫朋友中"
      : state.phase === "ending"
        ? "结算中"
      : state.phase === "pause"
        ? "本轮结算中"
        : "出牌中";
  dom.leaderLabel.textContent = state.phase === "ready"
    ? "等待玩家点击开始发牌"
    : state.phase === "dealing"
    ? (state.declaration
      ? `当前亮主：${getPlayer(state.declaration.playerId).name}`
      : "当前亮主：暂无")
    : state.phase === "bottomReveal"
      ? `当前打家：${getPlayer(state.bankerId).name}`
    : state.phase === "countering"
      ? `当前反主：${getPlayer(state.currentTurnId).name}`
    : state.phase === "burying"
      ? `当前打家：${getPlayer(state.bankerId).name}`
    : state.phase === "callingFriend"
      ? `当前打家：${getPlayer(state.bankerId).name}`
    : state.phase === "ending"
      ? "牌局已结束，正在结算"
    : `当前首家：${getPlayer(state.currentTurnId).name}`;
  dom.trumpLabel.textContent = state.declaration
    ? (state.declaration.source === "bottom"
      ? (state.declaration.suit === "notrump"
        ? `无主（王和级牌为主） · 翻底定主`
        : `${SUIT_LABEL[state.declaration.suit]} · 翻底定主`)
      : (state.declaration.suit === "notrump"
        ? `无主（王和级牌为主） · ${state.declaration.count} 张亮`
        : `${SUIT_LABEL[state.declaration.suit]} ${state.declaration.rank} · ${state.declaration.count} 张亮`))
    : "尚未亮主 · 各家按自己的 Lv 亮主";
  dom.bankerLabel.textContent = state.phase === "ready"
    ? "待亮主确定"
    : state.phase === "dealing"
    ? (state.declaration ? `暂定 ${getPlayer(state.declaration.playerId).name}` : (state.awaitingHumanDeclaration ? "待玩家1确认" : "待亮主确定"))
    : state.phase === "bottomReveal"
      ? "翻底结果展示中"
    : state.phase === "countering"
      ? `待反主确认`
    : state.phase === "burying"
      ? `待扣底完成`
    : state.phase === "callingFriend"
      ? "待叫朋友完成"
    : `玩家${state.bankerId}`;
  dom.trickLabel.textContent = state.phase === "ready"
    ? "等待开始"
    : state.phase === "dealing"
    ? (state.awaitingHumanDeclaration ? "补亮等待" : `发至 ${state.dealIndex} / ${state.dealCards.length}`)
    : state.phase === "bottomReveal"
      ? "展示底牌"
    : state.phase === "countering"
      ? "发牌完成"
    : state.phase === "burying"
      ? "整理底牌"
    : state.phase === "callingFriend"
      ? "选择朋友牌"
    : state.phase === "ending"
      ? "最终结算"
    : `第 ${state.trickNumber} 轮`;
}

function renderScorePanel() {
  const visibleDefenderPoints = getVisibleDefenderPoints();
  dom.defenderScore.textContent = visibleDefenderPoints === null ? "--" : String(visibleDefenderPoints);
  dom.toggleLastTrickBtn.textContent = state.showLastTrick ? "收起上一轮" : "上一轮";
  dom.turnTimer.textContent = (state.phase === "ready" || (state.phase === "dealing" && !state.awaitingHumanDeclaration) || state.phase === "callingFriend" || state.phase === "ending")
    ? "--"
    : String(Math.max(0, state.countdown));
  dom.timerHint.textContent = state.gameOver
    ? "本局已结束"
    : state.phase === "ready"
      ? getReadyStartMessage()
    : state.phase === "dealing"
      ? (state.awaitingHumanDeclaration
        ? "发牌结束。其他玩家都没有亮主，玩家1可在 15 秒内决定是否补亮；超时后再翻底定主。"
        : "发牌进行中，每位玩家用自己当前 Lv 对应的级牌亮主或抢亮；若始终无人亮主，则由先抓牌玩家翻底定主做打家。打无主时，王和本局级牌都算主。")
      : state.phase === "bottomReveal"
        ? `${state.bottomRevealMessage} 底牌公开展示 30 秒后进入扣底。`
      : state.phase === "countering"
        ? `最后反主阶段：当前轮到玩家${state.currentTurnId}，30 秒内决定是否反主。`
      : state.phase === "burying"
        ? (state.bankerId === 1 ? "你已拿起底牌，请在 60 秒内选 7 张重新扣底。" : "打家正在 60 秒倒计时内整理底牌并重新扣 7 张。")
      : state.phase === "callingFriend"
        ? (state.bankerId === 1 ? "你已扣底完成，请先叫朋友，再开始出牌。" : "打家正在叫朋友，稍后进入正式出牌。")
      : state.phase === "ending"
        ? "本局已出完最后一张牌，正在整理结算结果。"
      : !state.friendTarget?.revealed
        ? "朋友未揭晓前，抓分先记在各玩家自己名下。"
        : state.phase === "pause"
          ? "本轮暂停中，准备进入下一轮"
          : `当前轮到玩家${state.currentTurnId}出牌`;
  dom.toggleBottomBtn.disabled = !canHumanViewBottomCards();
}

function renderSeats() {
  for (const player of state.players) {
    const seat = document.getElementById(`playerSeat-${player.id}`);
    const role = getVisibleRole(player.id);
    const avatar = PLAYER_AVATARS[player.id];
    const showNoTrumpBadge = ["playing", "pause", "ending"].includes(state.phase)
      && player.hand.length > 0
      && !!state.exposedTrumpVoid[player.id];
    seat.classList.toggle("current-turn", player.id === state.currentTurnId && state.phase === "playing" && !state.gameOver);
    seat.classList.toggle("role-banker", role.kind === "banker");
    seat.innerHTML = `
      <div class="seat-top">
        <div class="avatar"><img src="${avatar.src}" alt="${avatar.label}" /></div>
        <div class="seat-copy">
          <div class="title">${player.name}</div>
          <div class="seat-meta">${player.isHuman ? "本人操控" : "电脑操控"}</div>
          <div class="seat-level-row">
            <div class="seat-level">Lv:${player.level}</div>
            ${showNoTrumpBadge ? '<span class="seat-no-trump" aria-label="无主牌">🈚️</span>' : ""}
          </div>
        </div>
      </div>
      <div class="role-badge ${role.kind}">${role.label}</div>
      <div class="seat-stats">
        <div class="seat-metric">
          <span class="stat-label">剩余手牌</span>
          <strong class="seat-count">${player.hand.length}</strong>
        </div>
        <div class="seat-metric">
          <span class="stat-label">个人得分</span>
          <strong class="seat-score">${player.capturedPoints}</strong>
        </div>
      </div>
    `;
  }
}

function getVisibleRole(playerId) {
  if (state.phase === "ready") {
    return { kind: "unknown", label: "等待开局" };
  }
  if (state.phase === "dealing") {
    if (state.declaration && playerId === state.declaration.playerId) {
      return { kind: "banker", label: "当前亮主" };
    }
    return { kind: "unknown", label: "等待亮主" };
  }
  if (state.phase === "countering") {
    if (state.declaration && playerId === state.declaration.playerId) {
      return { kind: "banker", label: "待反主" };
    }
    return { kind: "unknown", label: "反主确认中" };
  }
  if (state.phase === "burying") {
    if (playerId === state.bankerId) {
      return { kind: "banker", label: "扣底中" };
    }
    return { kind: "unknown", label: "等待开打" };
  }
  if (state.phase === "callingFriend") {
    if (playerId === state.bankerId) {
      return { kind: "banker", label: "叫朋友中" };
    }
    return { kind: "unknown", label: "等待叫朋友" };
  }
  if (playerId === state.bankerId) return { kind: "banker", label: "打家" };
  if (state.friendTarget?.failed) return { kind: "defender", label: "非打家" };
  if (state.friendTarget?.revealed && playerId === state.friendTarget.revealedBy) {
    return { kind: "friend", label: "朋友" };
  }
  if (state.friendTarget?.revealed) return { kind: "defender", label: "非打家" };
  return { kind: "unknown", label: "阵营待揭晓" };
}

function renderTrickSpots() {
  for (const player of state.players) {
    const spot = document.getElementById(`trickSpot-${player.id}`);
    const play = state.currentTrick.find((entry) => entry.playerId === player.id);
    const declarationCards = (state.phase === "dealing" || state.phase === "countering") && state.declaration && state.declaration.playerId === player.id
      ? getDeclarationCards(state.declaration)
      : [];
    const visibleCards = play?.cards || declarationCards;
    const zoomEnabled = !player.isHuman && visibleCards.length > 4;
    const cardsHtml = play
      ? play.cards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")
      : declarationCards.length > 0
        ? declarationCards.map((card) => buildCardNode(card, "played-card trump").outerHTML).join("")
        : "";
    const zoomHtml = zoomEnabled
      ? `
        <div class="spot-zoom" aria-hidden="true">
          ${visibleCards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")}
        </div>
      `
      : "";
    const emptyText = state.phase === "ready"
      ? "等待开始发牌"
      : (state.phase === "dealing" || state.phase === "countering")
      ? "等待发牌或亮主"
      : state.phase === "bottomReveal"
        ? "等待翻底展示"
      : state.phase === "burying"
        ? "等待打家扣底"
      : state.phase === "callingFriend"
        ? "等待打家叫朋友"
      : "本轮尚未出牌";
    spot.classList.toggle("current-turn", player.id === state.currentTurnId && state.phase === "playing" && !state.gameOver);
    spot.classList.toggle("zoomable", zoomEnabled);
    if (!zoomEnabled) {
      spot.classList.remove("show-zoom");
    }
    spot.innerHTML = `
      <div class="label">${player.id === 1 ? "我的本轮出牌区" : `${player.name}出牌区`}</div>
      <div class="spot-row">
        ${cardsHtml || `<div class="empty-note">${emptyText}</div>`}
        ${zoomHtml}
      </div>
    `;
    spot.onclick = zoomEnabled
      ? (event) => {
        if (event.target.closest(".played-card")) return;
        for (const otherSpot of state.players.map((entry) => document.getElementById(`trickSpot-${entry.id}`))) {
          if (otherSpot && otherSpot !== spot) {
            otherSpot.classList.remove("show-zoom");
          }
        }
        spot.classList.toggle("show-zoom");
      }
      : null;
  }
}

function renderHand() {
  const human = getPlayer(1);
  if (state.phase === "ready") {
    dom.handSummary.textContent = `${getReadyStartMessage()} 你当前是 Lv:${human.level}。`;
  } else if (state.phase === "dealing") {
    const humanOptions = getDeclarationOptions(1);
    dom.handSummary.textContent = state.awaitingHumanDeclaration
      ? (humanOptions.length > 0
        ? `当前共 ${human.hand.length} 张，其他玩家都没亮主；你可在 ${Math.max(0, state.countdown)} 秒内补亮：${humanOptions.map((entry) => formatDeclaration(entry)).join(" / ")}。`
        : `当前共 ${human.hand.length} 张，其他玩家都没亮主，等待翻底定主。`)
      : (humanOptions.length > 0
        ? `当前共 ${human.hand.length} 张，已可亮主：${humanOptions.map((entry) => formatDeclaration(entry)).join(" / ")}。`
        : `当前共 ${human.hand.length} 张，发牌中按花色分组显示；你当前是 Lv:${human.level}，拿到同花色两张 ${human.level} 即可亮主。`);
  } else if (state.phase === "countering") {
    const counterOption = getCounterDeclarationForPlayer(1);
    dom.handSummary.textContent = counterOption
      ? `当前共 ${human.hand.length} 张，你可以用 ${formatDeclaration(counterOption)} 进行最后反主。`
      : `当前共 ${human.hand.length} 张，你没有更强主牌可用于最后反主。`;
  } else if (state.phase === "bottomReveal") {
    dom.handSummary.textContent = `当前共 ${human.hand.length} 张，正在展示翻底定主结果；30 秒后由打家拿底并扣底。`;
  } else if (state.phase === "burying") {
    dom.handSummary.textContent = state.bankerId === 1
      ? `当前共 ${human.hand.length} 张，请选出 7 张重新扣底。扣完后不能再换。`
      : `当前共 ${human.hand.length} 张，等待打家整理底牌。`;
  } else if (state.phase === "callingFriend") {
    dom.handSummary.textContent = state.bankerId === 1
      ? `当前共 ${human.hand.length} 张，请先在弹出的菜单里叫朋友，再进入首轮出牌。`
      : `当前共 ${human.hand.length} 张，等待打家叫朋友。`;
  } else {
    dom.handSummary.textContent = `当前共 ${human.hand.length} 张，点击牌即可选择；首家支持单张、对子、拖拉机、火车、刻子、推土机和甩牌。`;
  }
  const isSetupPhase = state.phase === "dealing" || state.phase === "countering" || state.phase === "burying";
  const specialLabel = isSetupPhase
    ? (state.declaration ? "当前主牌" : "级牌 / 王")
    : "主牌";
  const setupLevelRank = human.level;
  const groups = [
    { key: "trump", label: specialLabel, red: true },
    { key: "clubs", label: "梅花", red: false },
    { key: "diamonds", label: "方块", red: true },
    { key: "spades", label: "黑桃", red: false },
    { key: "hearts", label: "红桃", red: true },
  ];

  dom.handGroups.innerHTML = "";
  for (const group of groups) {
    const cards = human.hand.filter((card) => {
      if (group.key === "trump") {
        if (isSetupPhase && !state.declaration) {
          return card.suit === "joker" || card.rank === setupLevelRank;
        }
        return isTrump(card);
      }
      if (isSetupPhase && !state.declaration) {
        return card.suit === group.key && card.rank !== setupLevelRank;
      }
      return !isTrump(card) && card.suit === group.key;
    }).sort(compareHandCardsForDisplay);
    if (cards.length === 0) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "hand-group";
    const chip = document.createElement("div");
    chip.className = `group-chip${group.red ? " red" : ""}`;
    chip.textContent = group.label;
    wrapper.appendChild(chip);

    const row = document.createElement("div");
    row.className = "cards-row";
    for (const card of cards) {
      const button = buildCardNode(card, `card-btn${state.selectedCardIds.includes(card.id) ? " selected" : ""}${isTrump(card) ? " trump" : ""}`);
      button.type = "button";
      const canInteract = (state.phase === "playing" && isHumanTurnActive()) || (state.phase === "burying" && state.bankerId === 1);
      button.disabled = !canInteract;
      if (canInteract) {
        const eventName = APP_PLATFORM === "mobile" ? "pointerup" : "click";
        button.addEventListener(eventName, (event) => {
          event.preventDefault();
          toggleSelection(card.id);
        });
      }
      row.appendChild(button);
    }
    wrapper.appendChild(row);
    dom.handGroups.appendChild(wrapper);
  }
}

function buildCardNode(card, className) {
  const node = document.createElement("button");
  node.className = className;
  node.setAttribute("aria-label", shortCardLabel(card));
  const image = document.createElement("img");
  image.src = card.img;
  image.alt = shortCardLabel(card);
  node.appendChild(image);
  return node;
}

function shortCardLabel(card) {
  if (card.rank === "RJ") return "大王";
  if (card.rank === "BJ") return "小王";
  return `${SUIT_SYMBOL[card.suit] || ""}${card.rank}`;
}

function toggleSelection(cardId) {
  if (!isHumanTurnActive() && !(state.phase === "burying" && state.bankerId === 1)) return;
  if (state.selectedCardIds.includes(cardId)) {
    state.selectedCardIds = state.selectedCardIds.filter((id) => id !== cardId);
  } else {
    state.selectedCardIds = [...state.selectedCardIds, cardId];
  }
  renderHand();
  renderCenterPanel();
  updateActionHint();
}

function updateActionHint() {
  if (state.phase === "ready") {
    dom.actionHint.textContent = "开始游戏将从2重新开始。继续游戏可继续之前的级别。";
    return;
  }
  if (state.phase === "dealing") {
    const best = getBestDeclarationForPlayer(1);
    if (state.awaitingHumanDeclaration) {
      dom.actionHint.textContent = best && canOverrideDeclaration(best)
        ? `其他玩家都没亮主。你可在 ${Math.max(0, state.countdown)} 秒内补亮 ${formatDeclaration(best)}；若不亮，则转入翻底定主。`
        : "其他玩家都没亮主，等待翻底定主。";
      return;
    }
    if (best && canOverrideDeclaration(best)) {
      dom.actionHint.textContent = `发牌中。你现在可以亮主：${formatDeclaration(best)}。如果不点“亮主”，发牌会继续进行。`;
      return;
    }
    dom.actionHint.textContent = "发牌中。花色之间不分大小；一般只有更多张数才能反，同张数反无主只接受对大王或对小王。";
    return;
  }

  if (state.phase === "bottomReveal") {
    dom.actionHint.textContent = "无人亮主，正在公开展示翻底结果。30 秒后进入打家扣底。";
    return;
  }

  if (state.phase === "countering") {
    const counterOption = getCounterDeclarationForPlayer(1);
    if (state.currentTurnId !== 1) {
      dom.actionHint.textContent = `最后反主阶段。当前由玩家${state.currentTurnId}决定是否反主，请等待。`;
      return;
    }
    dom.actionHint.textContent = counterOption
      ? `最后反主阶段。你可以用 ${formatDeclaration(counterOption)} 反主；更多张数优先，同张数反无主只接受对大王或对小王。`
      : "最后反主阶段。你没有可用的更高张数组合，也没有对大王或对小王可反无主，30 秒后会自动不反主。";
    return;
  }

  if (state.phase === "burying") {
    if (state.bankerId !== 1) {
      dom.actionHint.textContent = "打家正在整理底牌，请等待。";
      return;
    }
    dom.actionHint.textContent = state.selectedCardIds.length === 7
      ? "已选择 7 张底牌，可以确认扣牌。"
      : `请从手中选出 7 张重新扣底。当前已选 ${state.selectedCardIds.length} 张。`;
    return;
  }

  if (state.phase === "callingFriend") {
    dom.actionHint.textContent = state.bankerId === 1
      ? "请先叫朋友。通常会先选一门花色，再选点数，确认后才进入正式出牌。"
      : "打家正在叫朋友，请稍候。";
    return;
  }

  if (state.phase === "ending") {
    dom.actionHint.textContent = "最后一张已打完，正在结算本局结果。";
    return;
  }

  const selected = state.selectedCardIds
    .map((id) => getPlayer(1).hand.find((card) => card.id === id))
    .filter(Boolean);
  if (doesSelectionBeatCurrent(1, selected)) {
    dom.actionHint.textContent = `已选择：${selected.map(shortCardLabel).join("、")}。当前选择构成毙牌，可以点“毙牌”确认。`;
    return;
  }
  if (selected.length === 0) {
    dom.actionHint.textContent = "选择要出的牌。出牌直接落在桌布虚线区；轮到你时有 15 秒，超时会自动选择一手合法牌。";
    return;
  }
  const validation = validateSelection(1, selected);
  dom.actionHint.textContent = validation.ok
    ? `已选择：${selected.map(shortCardLabel).join("、")}。花色内已按从大到小排列。`
    : validation.reason;
}

function renderLastTrick() {
  dom.lastTrickPanel.classList.toggle("hidden", !state.showLastTrick);
  if (!state.lastTrick) {
    dom.lastTrickMeta.textContent = "当前还没有上一轮记录。";
    dom.lastTrickCards.innerHTML = "";
    return;
  }
  dom.lastTrickMeta.textContent = `第 ${state.lastTrick.trickNumber} 轮 · 胜者：${getPlayer(state.lastTrick.winnerId).name} · 本轮 ${state.lastTrick.points} 分`;
  dom.lastTrickCards.innerHTML = state.lastTrick.plays
    .map((play) => `
      <div style="margin-top:10px;">
        <div class="subtle">${getPlayer(play.playerId).name}</div>
        <div class="spot-row" style="min-height:70px; margin-top:6px;">
          ${play.cards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")}
        </div>
      </div>
    `)
    .join("");
}

function getFriendPickerRanksForSuit(suit) {
  if (suit === "joker") {
    return [
      { value: "RJ", label: "大王" },
      { value: "BJ", label: "小王" },
    ];
  }
  return [...RANKS]
    .reverse()
    .map((rank) => ({ value: rank, label: rank }));
}

function renderFriendPicker() {
  const visible = state.phase === "callingFriend" && state.bankerId === 1 && !state.gameOver;
  dom.friendPickerPanel.classList.toggle("hidden", !visible);
  if (!visible) return;

  const suitOptions = [
    { value: "hearts", label: "红桃" },
    { value: "spades", label: "黑桃" },
    { value: "diamonds", label: "方块" },
    { value: "clubs", label: "梅花" },
    { value: "joker", label: "王" },
  ];
  const suitGlyphMap = {
    hearts: { glyph: "♥", tone: "red" },
    spades: { glyph: "♠", tone: "black" },
    diamonds: { glyph: "♦", tone: "red" },
    clubs: { glyph: "♣", tone: "black" },
    joker: { glyph: "王", tone: "gold" },
  };
  const occurrenceOptions = [
    { value: 1, label: "第一张" },
    { value: 2, label: "第二张" },
    { value: 3, label: "第三张" },
  ];
  const rankOptions = getFriendPickerRanksForSuit(state.selectedFriendSuit);
  if (!rankOptions.some((entry) => entry.value === state.selectedFriendRank)) {
    state.selectedFriendRank = rankOptions[0]?.value || "A";
  }
  const previewTarget = buildFriendTarget({
    occurrence: state.selectedFriendOccurrence,
    suit: state.selectedFriendSuit,
    rank: state.selectedFriendRank,
  });

  dom.friendPickerHint.textContent = "先选第几张，再选花色和点数。常见找法是副牌 A，或者主牌里的大王。";
  dom.friendOccurrenceOptions.innerHTML = occurrenceOptions
    .map((option) => `<button type="button" class="tiny-btn${state.selectedFriendOccurrence === option.value ? " alert" : ""}" data-friend-occurrence="${option.value}">${option.label}</button>`)
    .join("");
  dom.friendSuitOptions.innerHTML = suitOptions
    .map((option) => {
      const glyph = suitGlyphMap[option.value] || { glyph: option.label, tone: "black" };
      return `<button type="button" class="tiny-btn friend-suit-btn${state.selectedFriendSuit === option.value ? " alert" : ""}" data-friend-suit="${option.value}" aria-label="${option.label}">
        <span class="friend-picker-suit-glyph ${glyph.tone}">${glyph.glyph}</span>
      </button>`;
    })
    .join("");
  dom.friendRankOptions.innerHTML = rankOptions
    .map((option) => `<button type="button" class="tiny-btn friend-rank-btn${state.selectedFriendRank === option.value ? " alert" : ""}" data-friend-rank="${option.value}">${option.label}</button>`)
    .join("");
  dom.friendPickerPreview.innerHTML = `
    <div class="subtle">当前将叫：${previewTarget.label}</div>
    <div>${buildCardNode(previewTarget, "friend-card").outerHTML}</div>
  `;
}

function renderLogs() {
  dom.logPanel.classList.toggle("hidden", !state.showLogPanel);
  dom.bottomPanel.classList.toggle("hidden", !state.showBottomPanel);
  dom.rulesPanel.classList.toggle("hidden", !state.showRulesPanel);
  dom.logList.innerHTML = state.logs.map((item) => `<li>${item}</li>`).join("");
}

function renderCenterPanel() {
  const humanDeclaration = getBestDeclarationForPlayer(1);
  const humanCounter = getCounterDeclarationForPlayer(1);
  const isOpeningPhase = state.phase === "dealing" || state.phase === "countering";
  const canDeclareNow = state.phase === "dealing"
    ? canOverrideDeclaration(humanDeclaration)
    : state.phase === "countering"
      ? state.currentTurnId === 1 && !!humanCounter
      : false;
  const selected = state.selectedCardIds
    .map((id) => getPlayer(1).hand.find((card) => card.id === id))
    .filter(Boolean);
  const selectionValid = state.phase === "burying"
    ? selected.length === 7
    : selected.length > 0 && validateSelection(1, selected).ok;
  const selectedBeat = state.phase === "playing" && selectionValid && doesSelectionBeatCurrent(1, selected);
  const humanCanBury = state.phase === "burying" && state.bankerId === 1;
  const friendCallingPhase = state.phase === "callingFriend";
  dom.centerTag.textContent = state.gameOver
    ? "牌局结束"
    : state.phase === "ready"
      ? "等待开始"
    : state.phase === "dealing"
      ? "发牌 / 抢亮"
    : state.phase === "bottomReveal"
      ? "翻底展示"
    : state.phase === "countering"
      ? "最后反主"
    : state.phase === "burying"
      ? "整理底牌"
    : state.phase === "callingFriend"
      ? "叫朋友"
    : state.phase === "ending"
      ? "牌局结束"
    : state.phase === "pause"
      ? "本轮展示中"
      : `${getPlayer(state.currentTurnId).name} 行动中`;
  dom.focusAnnouncement.textContent = state.centerAnnouncement?.message || "";
  dom.focusAnnouncement.classList.toggle("show", !!state.centerAnnouncement);
  dom.focusAnnouncement.classList.toggle("strong", state.centerAnnouncement?.tone === "strong");
  dom.focusAnnouncement.classList.toggle("ally", state.centerAnnouncement?.tone === "ally");
  dom.focusAnnouncement.classList.toggle("friend", state.centerAnnouncement?.tone === "friend");
  updateActionHint();
  const humanTurn = isHumanTurnActive();
  dom.beatBtn.hidden = state.phase !== "playing" || !selectedBeat;
  dom.beatBtn.disabled = !humanTurn || !selectedBeat;
  dom.hintBtn.hidden = isOpeningPhase || state.phase === "ready" || state.phase === "bottomReveal" || friendCallingPhase || (state.phase === "burying" && !humanCanBury);
  dom.playBtn.hidden = isOpeningPhase || state.phase === "ready" || state.phase === "bottomReveal" || friendCallingPhase || (state.phase === "burying" && !humanCanBury);
  dom.playBtn.textContent = state.phase === "burying" ? "扣牌" : "出牌";
  dom.playBtn.disabled = state.phase === "burying"
    ? state.gameOver || state.bankerId !== 1 || !selectionValid
    : !humanTurn || !selectionValid;
  dom.hintBtn.disabled = state.selectedCardIds.length > 0
    ? false
    : state.phase === "burying"
      ? state.bankerId !== 1
      : !humanTurn;
  dom.hintBtn.textContent = state.selectedCardIds.length > 0
    ? "取消选择"
    : state.phase === "burying"
      ? "选 7 张"
      : "选择";
  if (state.phase === "countering") {
    dom.declareBtn.textContent = humanCounter
      ? (humanCounter.suit === "notrump"
        ? getNoTrumpCounterLabel(humanCounter)
        : `反主${getActionSuitLabel(humanCounter)} x${humanCounter.count}`)
      : "反主";
  } else if (state.phase === "dealing") {
    if (humanDeclaration) {
      dom.declareBtn.textContent = state.declaration
        ? `抢亮${getActionSuitLabel(humanDeclaration)}主`
        : `亮${getActionSuitLabel(humanDeclaration)}主`;
    } else {
      dom.declareBtn.textContent = state.declaration ? "抢亮" : "亮主";
    }
  } else {
    dom.declareBtn.textContent = "亮主";
  }
  dom.declareBtn.hidden = !isOpeningPhase;
  dom.declareBtn.disabled = state.gameOver || !canDeclareNow;
  dom.declareBtn.classList.toggle("primary", canDeclareNow);
  dom.passCounterBtn.disabled = state.gameOver || state.phase !== "countering" || state.currentTurnId !== 1;
  dom.passCounterBtn.hidden = state.phase !== "countering" || state.currentTurnId !== 1;
  dom.newProgressBtn.hidden = true;
  dom.newProgressBtn.disabled = true;
  dom.newProgressBtn.classList.remove("primary");
  dom.continueGameBtn.hidden = state.phase !== "ready";
  dom.continueGameBtn.disabled = state.gameOver || state.phase !== "ready" || !state.hasSavedProgress;
  dom.continueGameBtn.classList.toggle("primary", false);
  dom.continueGameBtn.textContent = "继续游戏";
  dom.startGameBtn.hidden = state.phase !== "ready";
  dom.startGameBtn.disabled = state.gameOver || state.phase !== "ready";
  dom.startGameBtn.textContent = "开始游戏";
}

function isHumanTurnActive() {
  return !state.gameOver && state.phase === "playing" && state.currentTurnId === 1;
}

dom.startGameBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress(true);
});

dom.newProgressBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress();
});

dom.continueGameBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready" || !state.hasSavedProgress) return;
  continueSavedProgress(true);
});

dom.playBtn.addEventListener("click", () => {
  if (state.phase === "burying") {
    if (state.bankerId !== 1) return;
    completeBurying(1, [...state.selectedCardIds]);
    return;
  }
  if (!isHumanTurnActive()) return;
  playCards(1, [...state.selectedCardIds]);
});

dom.beatBtn.addEventListener("click", () => {
  if (!isHumanTurnActive()) return;
  const selected = state.selectedCardIds
    .map((id) => getPlayer(1).hand.find((card) => card.id === id))
    .filter(Boolean);
  if (!doesSelectionBeatCurrent(1, selected)) return;
  playCards(1, [...state.selectedCardIds]);
});

dom.hintBtn.addEventListener("click", () => {
  if (state.selectedCardIds.length > 0) {
    state.selectedCardIds = [];
    renderHand();
    renderCenterPanel();
    updateActionHint();
    return;
  }
  if (state.phase === "burying") {
    if (state.bankerId !== 1) return;
    const hint = getBuryHintForPlayer(1);
    state.selectedCardIds = hint.map((card) => card.id);
    renderHand();
    renderCenterPanel();
    updateActionHint();
    return;
  }
  if (!isHumanTurnActive()) return;
  const hint = getLegalHintForPlayer(1);
  state.selectedCardIds = hint.map((card) => card.id);
  renderHand();
  renderCenterPanel();
  updateActionHint();
});

dom.declareBtn.addEventListener("click", () => {
  if (state.gameOver) return;
  if (state.phase === "dealing") {
    const best = getBestDeclarationForPlayer(1);
    if (!best || !canOverrideDeclaration(best)) return;
    if (!declareTrump(1, best, "manual")) return;
    if (state.dealIndex >= state.dealCards.length) {
      clearTimers();
      finishDealingPhase();
    }
    return;
  }
  if (state.phase === "countering") {
    if (state.currentTurnId !== 1) return;
    const counter = getCounterDeclarationForPlayer(1);
    if (!counter) return;
    counterDeclare(1, counter);
  }
});

dom.passCounterBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "countering" || state.currentTurnId !== 1) return;
  passCounterForCurrentPlayer();
});

dom.friendSuitOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-friend-suit]");
  if (!button || state.phase !== "callingFriend" || state.bankerId !== 1) return;
  state.selectedFriendSuit = button.dataset.friendSuit;
  const rankOptions = getFriendPickerRanksForSuit(state.selectedFriendSuit);
  state.selectedFriendRank = rankOptions[0]?.value || "A";
  renderFriendPicker();
});

dom.friendRankOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-friend-rank]");
  if (!button || state.phase !== "callingFriend" || state.bankerId !== 1) return;
  state.selectedFriendRank = button.dataset.friendRank;
  renderFriendPicker();
});

dom.friendOccurrenceOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-friend-occurrence]");
  if (!button || state.phase !== "callingFriend" || state.bankerId !== 1) return;
  state.selectedFriendOccurrence = Number(button.dataset.friendOccurrence);
  renderFriendPicker();
});

dom.confirmFriendBtn.addEventListener("click", () => {
  if (state.phase !== "callingFriend" || state.bankerId !== 1) return;
  confirmFriendTargetSelection();
});

dom.autoFriendBtn?.addEventListener("click", () => {
  if (state.phase !== "callingFriend" || state.bankerId !== 1) return;
  const best = chooseFriendTarget()?.target;
  if (!best) return;
  state.selectedFriendOccurrence = best.occurrence || 1;
  state.selectedFriendSuit = best.suit;
  state.selectedFriendRank = best.rank;
  confirmFriendTargetSelection(best);
});

dom.closeBottomRevealBtn.addEventListener("click", () => {
  finishBottomRevealPhase();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".trick-spot.zoomable")) return;
  for (const playerId of PLAYER_ORDER) {
    document.getElementById(`trickSpot-${playerId}`)?.classList.remove("show-zoom");
  }
});

dom.toggleLastTrickBtn.addEventListener("click", () => {
  state.showLastTrick = !state.showLastTrick;
  renderLastTrick();
  renderScorePanel();
});

dom.closeLastTrickBtn.addEventListener("click", () => {
  state.showLastTrick = false;
  dom.lastTrickPanel.classList.add("hidden");
  renderLastTrick();
  renderScorePanel();
});

dom.toggleLogBtn.addEventListener("click", () => {
  state.showLogPanel = !state.showLogPanel;
  renderLogs();
});

dom.toggleBottomBtn.addEventListener("click", () => {
  if (!canHumanViewBottomCards()) return;
  state.showBottomPanel = !state.showBottomPanel;
  renderBottomPanel();
});

dom.toggleRulesBtn.addEventListener("click", () => {
  state.showRulesPanel = !state.showRulesPanel;
  renderLogs();
});

dom.layoutEditBtn.addEventListener("click", () => {
  setLayoutEditMode(!state.layoutEditMode);
});

dom.closeLogBtn.addEventListener("click", () => {
  state.showLogPanel = false;
  renderLogs();
});

dom.closeBottomBtn.addEventListener("click", () => {
  state.showBottomPanel = false;
  renderLogs();
});

dom.closeRulesBtn.addEventListener("click", () => {
  state.showRulesPanel = false;
  renderLogs();
});

dom.newGameBtn.addEventListener("click", startNewProgress);

dom.restartBtn.addEventListener("click", () => {
  beginNextGame(true);
});

dom.closeResultBtn?.addEventListener("click", () => {
  goToMainMenu();
});

makeFloatingPanel(dom.logPanel, dom.logPanelDrag);
makeFloatingPanel(dom.bottomPanel, dom.bottomPanelDrag);
makeFloatingPanel(dom.rulesPanel, dom.rulesPanelDrag);
for (const element of getLayoutElements()) {
  makeLayoutEditable(element);
}
applySavedLayoutState();
dom.versionBadge.textContent = APP_VERSION_LABEL;

setupGame();

function makeFloatingPanel(panel, handle) {
  if (!panel || !handle) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (state.layoutEditMode) return;
    if (event.target.closest(".panel-close")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    const tableRect = panel.parentElement.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    panel.style.left = `${rect.left - tableRect.left}px`;
    panel.style.top = `${rect.top - tableRect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    handle.style.cursor = "grabbing";
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const tableRect = panel.parentElement.getBoundingClientRect();
    const nextLeft = Math.max(12, Math.min(tableRect.width - panel.offsetWidth - 12, event.clientX - tableRect.left - offsetX));
    const nextTop = Math.max(12, Math.min(tableRect.height - panel.offsetHeight - 12, event.clientY - tableRect.top - offsetY));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = "grab";
    if (event?.pointerId !== undefined) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  handle.addEventListener("pointerup", stopDragging);
  handle.addEventListener("pointercancel", stopDragging);
}

function makeLayoutEditable(element) {
  if (!element) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  element.addEventListener("pointerdown", (event) => {
    if (!state.layoutEditMode) return;
    if (event.target.closest("button")) return;
    normalizeLayoutElement(element);
    const rect = element.getBoundingClientRect();
    const tableRect = dom.table.getBoundingClientRect();
    dragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    element.style.zIndex = "9";
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!state.layoutEditMode || !dragging) return;
    const tableRect = dom.table.getBoundingClientRect();
    const nextLeft = Math.max(8, Math.min(tableRect.width - element.offsetWidth - 8, event.clientX - tableRect.left - offsetX));
    const nextTop = Math.max(8, Math.min(tableRect.height - element.offsetHeight - 8, event.clientY - tableRect.top - offsetY));
    element.style.left = `${nextLeft}px`;
    element.style.top = `${nextTop}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    element.style.zIndex = "";
    if (event?.pointerId !== undefined) {
      element.releasePointerCapture(event.pointerId);
    }
    if (state.layoutEditMode) {
      saveLayoutState();
    }
  };

  element.addEventListener("pointerup", stopDragging);
  element.addEventListener("pointercancel", stopDragging);
  element.addEventListener("mouseleave", () => {
    if (state.layoutEditMode) {
      saveLayoutState();
    }
  });
}
