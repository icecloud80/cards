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
const NEGATIVE_LEVELS = ["-2", "-A"];
const APP_VERSION_LABEL = "原型版 v1.2";
const MANDATORY_LEVELS = new Set(["5", "10", "J", "Q", "K", "A"]);
const FACE_CARD_LEVELS = new Set(["J", "Q", "K", "A"]);
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
const APP_PLATFORM = window.APP_PLATFORM || "pc";
const FALLBACK_CARD_ASSET_DIR = window.CARD_ASSET_DIR || "./cards";
const CARD_FACE_OPTIONS = Array.isArray(window.CARD_FACE_OPTIONS) && window.CARD_FACE_OPTIONS.length > 0
  ? window.CARD_FACE_OPTIONS
  : [{ key: "default", label: "默认", dir: FALLBACK_CARD_ASSET_DIR }];
const DEFAULT_CARD_FACE_KEY = CARD_FACE_OPTIONS.some((option) => option.key === window.DEFAULT_CARD_FACE_KEY)
  ? window.DEFAULT_CARD_FACE_KEY
  : CARD_FACE_OPTIONS[0].key;
const CARD_FACE_STORAGE_KEY = `five-friends-card-face-${APP_PLATFORM}-v1`;
const LAYOUT_STORAGE_KEY = `five-friends-layout-${APP_PLATFORM}-v1`;
const PROGRESS_COOKIE_KEY = `five-friends-progress-${APP_PLATFORM}-v1`;
const PROGRESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getCardFaceOption(key = DEFAULT_CARD_FACE_KEY) {
  return CARD_FACE_OPTIONS.find((option) => option.key === key) || CARD_FACE_OPTIONS[0];
}

function loadSavedCardFaceKey() {
  try {
    const saved = window.localStorage.getItem(CARD_FACE_STORAGE_KEY);
    return saved && CARD_FACE_OPTIONS.some((option) => option.key === saved) ? saved : DEFAULT_CARD_FACE_KEY;
  } catch (error) {
    return DEFAULT_CARD_FACE_KEY;
  }
}

function saveCardFaceKey(key) {
  try {
    window.localStorage.setItem(CARD_FACE_STORAGE_KEY, getCardFaceOption(key).key);
  } catch (error) {
    // Ignore storage failures so the game still works in private mode.
  }
}

function getCurrentCardFaceOption() {
  return getCardFaceOption(state.cardFaceKey);
}

function getCurrentCardAssetDir() {
  return getCurrentCardFaceOption().dir || FALLBACK_CARD_ASSET_DIR;
}

function getNextCardFaceOption() {
  const currentIndex = CARD_FACE_OPTIONS.findIndex((option) => option.key === state.cardFaceKey);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % CARD_FACE_OPTIONS.length : 0;
  return CARD_FACE_OPTIONS[nextIndex] || CARD_FACE_OPTIONS[0];
}

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
  toggleCardFaceBtn: document.getElementById("toggleCardFaceBtn"),
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
  cardFaceKey: loadSavedCardFaceKey(),
  logs: [],
  gameOver: false,
  selectedFriendOccurrence: 1,
  selectedFriendSuit: "hearts",
  selectedFriendRank: "A",
  nextFirstDealPlayerId: 1,
  bottomRevealMessage: "",
  exposedTrumpVoid: {},
  exposedSuitVoid: {},
  awaitingHumanDeclaration: false,
  hasSavedProgress: false,
  startSelection: null,
};

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
  } catch (error) {
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
