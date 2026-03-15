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
const APP_VERSION = "2.0";
const APP_VERSION_LABEL = `原型版 v${APP_VERSION}`;
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
const AI_DIFFICULTY_OPTIONS = [
  { value: "beginner", label: "初级" },
  { value: "intermediate", label: "中级" },
  { value: "advanced", label: "高级" },
];
const DEFAULT_AI_DIFFICULTY = AI_DIFFICULTY_OPTIONS[0].value;
const CARD_FACE_STORAGE_KEY = `five-friends-card-face-${APP_PLATFORM}-v1`;
const LAYOUT_STORAGE_KEY = `five-friends-layout-${APP_PLATFORM}-v1`;
const PROGRESS_COOKIE_KEY = `five-friends-progress-${APP_PLATFORM}-v1`;
const PROGRESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// 获取牌面配置。
function getCardFaceOption(key = DEFAULT_CARD_FACE_KEY) {
  return CARD_FACE_OPTIONS.find((option) => option.key === key) || CARD_FACE_OPTIONS[0];
}

// 读取已保存的牌面样式键值。
function loadSavedCardFaceKey() {
  try {
    const saved = window.localStorage.getItem(CARD_FACE_STORAGE_KEY);
    return saved && CARD_FACE_OPTIONS.some((option) => option.key === saved) ? saved : DEFAULT_CARD_FACE_KEY;
  } catch (error) {
    return DEFAULT_CARD_FACE_KEY;
  }
}

// 保存当前牌面样式键值。
function saveCardFaceKey(key) {
  try {
    window.localStorage.setItem(CARD_FACE_STORAGE_KEY, getCardFaceOption(key).key);
  } catch (error) {
    // Ignore storage failures so the game still works in private mode.
  }
}

// 获取当前牌面配置。
function getCurrentCardFaceOption() {
  return getCardFaceOption(state.cardFaceKey);
}

// 获取当前牌面资源目录。
function getCurrentCardAssetDir() {
  return getCurrentCardFaceOption().dir || FALLBACK_CARD_ASSET_DIR;
}

// 获取下一套牌面配置。
function getNextCardFaceOption() {
  const currentIndex = CARD_FACE_OPTIONS.findIndex((option) => option.key === state.cardFaceKey);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % CARD_FACE_OPTIONS.length : 0;
  return CARD_FACE_OPTIONS[nextIndex] || CARD_FACE_OPTIONS[0];
}

function getActiveLevelRankForFriendLogic() {
  return state?.declaration?.rank || state?.levelRank || null;
}

function isViceLevelCard(card) {
  if (!card || card.suit === "joker") return false;
  const levelRank = getActiveLevelRankForFriendLogic();
  if (!levelRank || card.rank !== levelRank) return false;
  return state?.trumpSuit && state.trumpSuit !== "notrump" && card.suit !== state.trumpSuit;
}

function isBlockedFriendTargetCard(target) {
  if (!target || target.suit === "joker") return false;
  return isViceLevelCard(target);
}

function isFriendTargetMatchCard(card, target = state?.friendTarget) {
  if (!card || !target) return false;
  if (isBlockedFriendTargetCard(target)) return false;
  return card.rank === target.rank && card.suit === target.suit;
}

function isFriendSearchSignalCard(card, target = state?.friendTarget) {
  if (!card || !target || target.suit === "joker") return false;
  if (isBlockedFriendTargetCard(target)) return false;
  if (card.suit !== target.suit) return false;
  return !isViceLevelCard(card);
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
  setupOptions: document.getElementById("setupOptions"),
  aiDifficultySelect: document.getElementById("aiDifficultySelect"),
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
  toggleDebugBtn: document.getElementById("toggleDebugBtn"),
  toggleBottomBtn: document.getElementById("toggleBottomBtn"),
  toggleRulesBtn: document.getElementById("toggleRulesBtn"),
  toggleCardFaceBtn: document.getElementById("toggleCardFaceBtn"),
  layoutEditBtn: document.getElementById("layoutEditBtn"),
  resetLayoutBtn: document.getElementById("resetLayoutBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  startGameBtn: document.getElementById("startGameBtn"),
  beatBtn: document.getElementById("beatBtn"),
  autoManagedBtn: document.getElementById("autoManagedBtn"),
  hintBtn: document.getElementById("hintBtn"),
  playBtn: document.getElementById("playBtn"),
  newProgressBtn: document.getElementById("newProgressBtn"),
  continueGameBtn: document.getElementById("continueGameBtn"),
  declareBtn: document.getElementById("declareBtn"),
  passCounterBtn: document.getElementById("passCounterBtn"),
  logPanel: document.getElementById("logPanel"),
  logPanelDrag: document.getElementById("logPanelDrag"),
  closeLogBtn: document.getElementById("closeLogBtn"),
  debugPanel: document.getElementById("debugPanel"),
  debugPanelDrag: document.getElementById("debugPanelDrag"),
  closeDebugBtn: document.getElementById("closeDebugBtn"),
  debugPlayerTabs: document.getElementById("debugPlayerTabs"),
  debugHandMeta: document.getElementById("debugHandMeta"),
  debugHandCards: document.getElementById("debugHandCards"),
  bottomPanel: document.getElementById("bottomPanel"),
  bottomPanelDrag: document.getElementById("bottomPanelDrag"),
  closeBottomBtn: document.getElementById("closeBottomBtn"),
  rulesPanel: document.getElementById("rulesPanel"),
  rulesPanelDrag: document.getElementById("rulesPanelDrag"),
  closeRulesBtn: document.getElementById("closeRulesBtn"),
  resultOverlay: document.getElementById("resultOverlay"),
  resultCard: document.getElementById("resultCard"),
  resultTitle: document.getElementById("resultTitle"),
  resultSubinfo: document.getElementById("resultSubinfo"),
  resultBody: document.getElementById("resultBody"),
  resultBottomCards: document.getElementById("resultBottomCards"),
  resultCountdown: document.getElementById("resultCountdown"),
  copyResultLogBtn: document.getElementById("copyResultLogBtn"),
  downloadResultLogBtn: document.getElementById("downloadResultLogBtn"),
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
  playHistory: [],
  lastAiDecision: null,
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
  showDebugPanel: false,
  showBottomPanel: true,
  showRulesPanel: false,
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  cardFaceKey: loadSavedCardFaceKey(),
  logs: [],
  allLogs: [],
  gameOver: false,
  selectedFriendOccurrence: 1,
  selectedFriendSuit: "hearts",
  selectedFriendRank: "A",
  friendRetargetUsed: false,
  nextFirstDealPlayerId: 1,
  bottomRevealMessage: "",
  exposedTrumpVoid: {},
  exposedSuitVoid: {},
  awaitingHumanDeclaration: false,
  hasSavedProgress: false,
  startSelection: null,
  selectedDebugPlayerId: 2,
};

// 规范化玩家等级进度。
function normalizePlayerLevels(levels) {
  return PLAYER_ORDER.reduce((acc, playerId) => {
    const value = levels?.[playerId] ?? levels?.[String(playerId)];
    acc[playerId] = RANKS.includes(value) ? value : INITIAL_LEVELS[playerId];
    return acc;
  }, {});
}

// 从浏览器 Cookie 里读取指定值。
function readCookieValue(name) {
  const encodedName = `${name}=`;
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(encodedName))
    ?.slice(encodedName.length) || "";
}

// 从 Cookie 里加载玩家等级进度。
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

// 将玩家等级进度写入 Cookie。
function saveProgressToCookie(levels = state.playerLevels) {
  const playerLevels = normalizePlayerLevels(levels);
  const payload = encodeURIComponent(JSON.stringify({
    playerLevels,
    savedAt: Date.now(),
  }));
  document.cookie = `${PROGRESS_COOKIE_KEY}=${payload}; Max-Age=${PROGRESS_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  state.hasSavedProgress = true;
}

// 刷新当前是否存在可继续进度的状态。
function refreshSavedProgressAvailability() {
  state.hasSavedProgress = !!loadProgressFromCookie();
}
