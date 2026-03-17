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
  1: { label: "狐狸", src: "./images/avatars/fox.svg" },
  2: { label: "猫头鹰", src: "./images/avatars/owl.svg" },
  3: { label: "熊", src: "./images/avatars/bear.svg" },
  4: { label: "老虎", src: "./images/avatars/tiger.svg" },
  5: { label: "狼", src: "./images/avatars/wolf.svg" },
};
const APP_PLATFORM = window.APP_PLATFORM || "pc";
const FALLBACK_CARD_ASSET_DIR = window.CARD_ASSET_DIR || "./images/cards";
const CARD_FACE_OPTIONS = Array.isArray(window.CARD_FACE_OPTIONS) && window.CARD_FACE_OPTIONS.length > 0
  ? window.CARD_FACE_OPTIONS
  : [{ key: "default", label: "默认", dir: FALLBACK_CARD_ASSET_DIR }];
const CARD_FACE_KEY_ALIASES = {
  "modern-sprite": "sprite",
};
const NORMALIZED_WINDOW_DEFAULT_CARD_FACE_KEY = CARD_FACE_KEY_ALIASES[window.DEFAULT_CARD_FACE_KEY] || window.DEFAULT_CARD_FACE_KEY;
const DEFAULT_CARD_FACE_KEY = CARD_FACE_OPTIONS.some((option) => option.key === NORMALIZED_WINDOW_DEFAULT_CARD_FACE_KEY)
  ? NORMALIZED_WINDOW_DEFAULT_CARD_FACE_KEY
  : CARD_FACE_OPTIONS[0].key;
const AI_DIFFICULTY_OPTIONS = [
  { value: "beginner", label: "初级" },
  { value: "intermediate", label: "中级" },
  { value: "advanced", label: "高级" },
];
const DEFAULT_AI_DIFFICULTY = AI_DIFFICULTY_OPTIONS[0].value;
const AI_PACE_OPTIONS = [
  { value: "slow", label: "慢" },
  { value: "medium", label: "中" },
  { value: "fast", label: "快" },
  { value: "instant", label: "瞬" },
];
const DEFAULT_AI_PACE = AI_PACE_OPTIONS[0].value;
const AUTO_MANAGE_OPTIONS = [
  { value: "off", label: "关闭" },
  { value: "round", label: "本局托管" },
  { value: "persistent", label: "跨局托管" },
];
const DEFAULT_AUTO_MANAGE_MODE = AUTO_MANAGE_OPTIONS[0].value;
const FRIEND_RETARGET_WINDOW_SECONDS = 30;
const AI_PACE_PROFILES = {
  slow: {
    dealStartDelay: 140,
    dealStepDelay: 90,
    dealFinishDelay: 220,
    callingFriendDelay: { min: 900, max: 900 },
    counterPassDelay: { min: 450, max: 450 },
    counterActionDelay: { min: 1000, max: 1900 },
    buryDelay: { min: 1200, max: 1200 },
    turnDelay: { min: 900, max: 1600 },
    trickFinishDelay: 1800,
    trickPauseDelay: 2400,
    centerAnnouncementDelay: 3000,
  },
  medium: {
    dealStartDelay: 110,
    dealStepDelay: 65,
    dealFinishDelay: 170,
    callingFriendDelay: { min: 550, max: 550 },
    counterPassDelay: { min: 260, max: 260 },
    counterActionDelay: { min: 650, max: 1050 },
    buryDelay: { min: 750, max: 750 },
    turnDelay: { min: 550, max: 950 },
    trickFinishDelay: 900,
    trickPauseDelay: 1200,
    centerAnnouncementDelay: 1800,
  },
  fast: {
    dealStartDelay: 65,
    dealStepDelay: 36,
    dealFinishDelay: 90,
    callingFriendDelay: { min: 260, max: 260 },
    counterPassDelay: { min: 140, max: 140 },
    counterActionDelay: { min: 260, max: 420 },
    buryDelay: { min: 320, max: 320 },
    turnDelay: { min: 220, max: 380 },
    trickFinishDelay: 420,
    trickPauseDelay: 650,
    centerAnnouncementDelay: 1200,
  },
  instant: {
    dealStartDelay: 32,
    dealStepDelay: 20,
    dealFinishDelay: 50,
    callingFriendDelay: { min: 120, max: 120 },
    counterPassDelay: { min: 80, max: 80 },
    counterActionDelay: { min: 120, max: 180 },
    buryDelay: { min: 160, max: 160 },
    turnDelay: { min: 120, max: 180 },
    trickFinishDelay: 180,
    trickPauseDelay: 240,
    centerAnnouncementDelay: 800,
  },
};
const CARD_FACE_STORAGE_KEY = `five-friends-card-face-${APP_PLATFORM}-v1`;
const LAYOUT_STORAGE_KEY = `five-friends-layout-${APP_PLATFORM}-v1`;
const PROGRESS_COOKIE_KEY = `five-friends-progress-${APP_PLATFORM}-v1`;
const PROGRESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MAX_BURY_POINT_TOTAL = 25;
const OPENING_CODE_LEVEL_ORDER = [...NEGATIVE_LEVELS, ...RANKS];

/**
 * 作用：
 * 规范化牌面配置键值，并兼容历史存档里的旧 key。
 *
 * 为什么这样写：
 * 历史版本曾把 `modern-sprite` 当成实验 key，后面又一度回退成只做兼容映射；
 * 统一把 key 归一化逻辑留在共享层后，无论当前环境是否真正提供 `modern-sprite` 主题，
 * 运行态配置、按钮切换和本地存档都能继续走同一套读取逻辑。
 *
 * 输入：
 * @param {string} [key=DEFAULT_CARD_FACE_KEY] - 调用方传入的牌面键值。
 *
 * 输出：
 * @returns {string} 当前环境里真实可用的牌面键值；拿不到时回落到默认值。
 *
 * 注意：
 * - 这里只兼容明确收口过的历史 key，不做模糊匹配。
 * - 返回值必须保证能在 `CARD_FACE_OPTIONS` 里找到对应配置。
 */
function normalizeCardFaceKey(key = DEFAULT_CARD_FACE_KEY) {
  const rawKey = typeof key === "string" ? key : DEFAULT_CARD_FACE_KEY;
  const aliasedKey = CARD_FACE_OPTIONS.some((option) => option.key === rawKey)
    ? rawKey
    : (CARD_FACE_KEY_ALIASES[rawKey] || rawKey);
  return CARD_FACE_OPTIONS.some((option) => option.key === aliasedKey) ? aliasedKey : DEFAULT_CARD_FACE_KEY;
}

// 获取牌面配置。
function getCardFaceOption(key = DEFAULT_CARD_FACE_KEY) {
  const normalizedKey = normalizeCardFaceKey(key);
  return CARD_FACE_OPTIONS.find((option) => option.key === normalizedKey) || CARD_FACE_OPTIONS[0];
}

// 读取已保存的牌面样式键值。
function loadSavedCardFaceKey() {
  try {
    const saved = window.localStorage.getItem(CARD_FACE_STORAGE_KEY);
    return saved ? normalizeCardFaceKey(saved) : DEFAULT_CARD_FACE_KEY;
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

/**
 * 作用：
 * 规范化当前节奏档位取值。
 *
 * 为什么这样写：
 * 节奏档位会被 PC、手游和测试共用；统一在共享层做兜底，
 * 可以避免某一端传入非法值后把整套计时配置打坏。
 *
 * 输入：
 * @param {string} value - UI 或外部逻辑传入的节奏档位键值。
 *
 * 输出：
 * @returns {string} 合法的节奏档位键值；非法输入统一回落到默认档。
 *
 * 注意：
 * - 这里只校验 `slow / medium / fast / instant` 四档。
 * - 默认档必须和“当前体验不变”的慢档保持一致。
 */
function normalizeAiPace(value) {
  return AI_PACE_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_AI_PACE;
}

/**
 * 作用：
 * 读取某个节奏档位对应的完整延迟配置。
 *
 * 为什么这样写：
 * 牌局里有发牌、叫朋友、AI 出牌、结算停顿等多种等待；
 * 用统一 profile 管理，后续再调“慢 / 中 / 快 / 瞬”时只改一处即可。
 *
 * 输入：
 * @param {string} value - 目标节奏档位；不传时读取当前全局状态。
 *
 * 输出：
 * @returns {object} 当前档位对应的延迟 profile。
 *
 * 注意：
 * - `slow` 必须严格保持现有体验，避免用户切回慢档后手感漂移。
 * - `instant` 也不能返回 0，仍需保留极短但可感知的过渡时间。
 */
function getAiPaceProfile(value = state?.aiPace) {
  return AI_PACE_PROFILES[normalizeAiPace(value)];
}

/**
 * 作用：
 * 把当前节奏档位转换成界面或日志可读的中文标签。
 *
 * 为什么这样写：
 * 开始界面、设置菜单和对局日志都需要展示相同的节奏名称；
 * 统一走同一个 helper，能避免多端文案出现“慢速 / 慢档 / 慢”等不一致。
 *
 * 输入：
 * @param {string} value - 目标节奏档位；不传时读取当前全局状态。
 *
 * 输出：
 * @returns {string} 当前档位对应的中文短标签。
 *
 * 注意：
 * - 未知值必须回退到 `慢`，和默认档保持一致。
 * - 这里只返回纯标签，不拼接“节奏”前后缀。
 */
function getAiPaceLabel(value = state?.aiPace) {
  return AI_PACE_OPTIONS.find((option) => option.value === normalizeAiPace(value))?.label || "慢";
}

/**
 * 作用：
 * 规范化外部传入的回放 seed 文本。
 *
 * 为什么这样写：
 * 后续日志、测试和人工调试都需要引用同一份 seed；
 * 先统一收口成稳定字符串后，开局初始化、日志导出和未来的“按 seed 重开”才能共享同一格式。
 *
 * 输入：
 * @param {string|number|null|undefined} seedInput - 外部传入的原始 seed。
 *
 * 输出：
 * @returns {string} 去掉首尾空白后的 seed；拿不到有效值时返回空串。
 *
 * 注意：
 * - 这里不做 hash，只负责格式归一化。
 * - 空串代表“调用方没有显式指定 seed”，后续应走默认分配逻辑。
 */
function normalizeReplaySeedInput(seedInput) {
  if (seedInput == null) return "";
  const normalized = String(seedInput).trim();
  return normalized;
}

/**
 * 作用：
 * 读取当前环境预置的默认回放 seed 基础串。
 *
 * 为什么这样写：
 * headless 回归和未来的调试入口都可能希望“整局默认走固定 seed”，
 * 统一从全局变量读取后，浏览器运行态和测试 VM 都能复用同一入口，不需要到处额外打补丁。
 *
 * 输入：
 * @param {void} - 直接读取浏览器全局变量。
 *
 * 输出：
 * @returns {string} 当前环境预置的默认 seed；未预置时返回空串。
 *
 * 注意：
 * - 这里只读 `window.__FIVE_FRIENDS_DEFAULT_REPLAY_SEED`，不做模糊兜底。
 * - 返回空串时，调用方应继续走运行态自动分配逻辑。
 */
function getDefaultReplaySeedBase() {
  return normalizeReplaySeedInput(window.__FIVE_FRIENDS_DEFAULT_REPLAY_SEED);
}

/**
 * 作用：
 * 把任意 seed 输入稳定映射成 32 位无符号整数。
 *
 * 为什么这样写：
 * 运行态回放 seed、headless 回归 seed 和未来日志里的手动输入 seed 都需要落到同一套 PRNG 初始化值；
 * 用轻量哈希统一后，可以同时支持数字和字符串 seed，并保持跨平台结果一致。
 *
 * 输入：
 * @param {string|number} seedInput - 本局使用的回放 seed。
 *
 * 输出：
 * @returns {number} 可用于 PRNG 初始化的 32 位正整数。
 *
 * 注意：
 * - 相同 seed 必须得到相同结果。
 * - 返回值需要避免为 `0`，减少某些 PRNG 的退化风险。
 */
function hashReplaySeedInput(seedInput) {
  const raw = normalizeReplaySeedInput(seedInput) || "five-friends-replay";
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

/**
 * 作用：
 * 基于回放 seed 创建一个可复现的伪随机数函数。
 *
 * 为什么这样写：
 * 当前洗牌、AI 自动亮主/反主意愿以及节奏随机都依赖随机源；
 * 只要这些地方统一走同一个 seeded random，日志里的 seed 才真正具备“重放这一局”的价值。
 *
 * 输入：
 * @param {string|number} seedInput - 本局使用的回放 seed。
 *
 * 输出：
 * @returns {() => number} 返回 `[0, 1)` 浮点数的随机函数。
 *
 * 注意：
 * - 这套实现追求稳定复现，不追求密码学随机性。
 * - 不要改成依赖系统时间的实现，否则日志里的 seed 会失去意义。
 */
function createSeededRandom(seedInput) {
  let currentState = hashReplaySeedInput(seedInput);
  return function nextRandom() {
    currentState = (currentState + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(currentState ^ (currentState >>> 15), 1 | currentState);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 作用：
 * 为当前运行环境分配一条默认回放 seed。
 *
 * 为什么这样写：
 * 正式运行态希望每局都能拿到一条日志可追踪的 seed，而 headless 回归又希望相同基础 seed 下稳定复现；
 * 因此这里优先使用测试/调试预置 seed，再回退到运行态自动生成。
 *
 * 输入：
 * @param {void} - 直接读取共享状态和浏览器全局。
 *
 * 输出：
 * @returns {string} 当前牌局应使用的默认 seed。
 *
 * 注意：
 * - 当环境预置了基础 seed 时，会自动附加递增局号，避免同一上下文里多次开局仍然完全重复。
 * - 浏览器运行态优先尝试 `crypto.getRandomValues`，拿不到时才回退到时间戳与 `Math.random()`。
 */
function allocateDefaultReplaySeed() {
  const presetSeedBase = getDefaultReplaySeedBase();
  if (presetSeedBase) {
    const nextRoundIndex = Number.isInteger(state?.replaySeedCounter) ? state.replaySeedCounter + 1 : 1;
    if (state) {
      state.replaySeedCounter = nextRoundIndex;
    }
    return `${presetSeedBase}:round-${String(nextRoundIndex).padStart(4, "0")}`;
  }

  let entropy = 0;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    entropy = values[0] >>> 0;
  } else {
    entropy = Math.floor(Math.random() * 4294967296) >>> 0;
  }
  const timePart = Date.now().toString(16).padStart(11, "0");
  const entropyPart = entropy.toString(16).padStart(8, "0");
  return `${timePart}-${entropyPart}`;
}

/**
 * 作用：
 * 初始化当前这一局要使用的回放 seed 与伪随机函数。
 *
 * 为什么这样写：
 * 牌局初始化希望一次性把“本局 seed 是什么”和“后续随机从哪儿来”绑定好；
 * 收口到一个 helper 后，`setupGame()` 和未来的“按 seed 重开”入口都可以复用同一套逻辑。
 *
 * 输入：
 * @param {string|number|null|undefined} [seedInput] - 可选的显式回放 seed；不传时自动分配。
 *
 * 输出：
 * @returns {string} 当前局实际采用的回放 seed。
 *
 * 注意：
 * - 这里会直接改写 `state.replaySeed` 与 `state.roundRandom`。
 * - 调用时机必须早于洗牌与任何 AI 自动决策随机。
 */
function initializeRoundReplaySeed(seedInput) {
  const explicitSeed = normalizeReplaySeedInput(seedInput);
  const replaySeed = explicitSeed || allocateDefaultReplaySeed();
  state.replaySeed = replaySeed;
  state.roundRandom = createSeededRandom(replaySeed);
  return replaySeed;
}

/**
 * 作用：
 * 读取当前牌局应使用的统一随机数。
 *
 * 为什么这样写：
 * 洗牌、AI 自动亮主/反主和节奏随机都需要复用同一条 seeded random；
 * 把读取逻辑统一收口后，后续新增随机点时不容易漏掉回放链路。
 *
 * 输入：
 * @param {void} - 直接读取当前局状态。
 *
 * 输出：
 * @returns {number} `[0, 1)` 区间内的随机浮点数。
 *
 * 注意：
 * - 若当前局尚未初始化专用随机源，必须安全回退到原生 `Math.random()`。
 * - 不要在调用方额外缓存随机函数，避免 future replay 入口切换 seed 时出现旧引用。
 */
function getSharedRandomNumber() {
  if (typeof state?.roundRandom === "function") {
    return state.roundRandom();
  }
  return Math.random();
}

/**
 * 作用：
 * 按当前节奏档位抽取某个等待项的实际毫秒数。
 *
 * 为什么这样写：
 * 一部分等待项是固定时长，一部分需要在区间内随机，
 * 集中在这里做数值展开后，业务层只管声明“要哪种等待”，不再到处手写随机公式。
 *
 * 输入：
 * @param {string} key - 当前要读取的延迟配置键名。
 * @param {string} pace - 目标节奏档位；不传时读取当前全局状态。
 *
 * 输出：
 * @returns {number} 实际可直接传给定时器的毫秒数。
 *
 * 注意：
 * - 当配置是 `{min,max}` 时会返回闭区间内的随机值。
 * - 所有返回值都至少为 `1`，避免误产生 0ms 定时器。
 */
function getAiPaceDelay(key, pace = state?.aiPace) {
  const profile = getAiPaceProfile(pace);
  const timing = profile?.[key];
  if (typeof timing === "number") return Math.max(1, timing);
  if (!timing || typeof timing.min !== "number" || typeof timing.max !== "number") return 1;
  const min = Math.max(1, Math.min(timing.min, timing.max));
  const max = Math.max(min, timing.max);
  return Math.max(1, Math.round(min + getSharedRandomNumber() * (max - min)));
}

/**
 * 作用：
 * 读取当前牌面配置里声明的整图牌面信息。
 *
 * 为什么这样写：
 * 现在 PC 和 mobile 都支持传统的“单张 SVG 牌面”，也支持 `poker.png` / `m_cards_sprite.png` 这类整图 sprite；
 * 把读取逻辑统一收口后，渲染层只需要判断是否拿到 sprite 配置，
 * 就能在不改玩法层的前提下切换不同牌面来源。
 *
 * 输入：
 * @param {{spriteSheet?: {src: string, columns: number, rows: number}}} [option=getCurrentCardFaceOption()] - 当前要读取的牌面配置。
 *
 * 输出：
 * @returns {{src: string, columns: number, rows: number}|null} 可用的整图牌面配置；若当前牌面不是 sprite，则返回 `null`。
 *
 * 注意：
 * - 只有同时具备 `src / columns / rows` 的配置才视为有效 sprite。
 * - 当前仍需允许返回 `null`，兼容用户切回 `classic` 单张牌面时的兜底分支。
 */
function getCardFaceSpriteSheet(option = getCurrentCardFaceOption()) {
  if (!option?.spriteSheet?.src || !option.spriteSheet.columns || !option.spriteSheet.rows) {
    return null;
  }
  return option.spriteSheet;
}

// 获取当前牌面资源目录。
function getCurrentCardAssetDir() {
  return getCurrentCardFaceOption().dir || FALLBACK_CARD_ASSET_DIR;
}

// 获取下一套牌面配置。
function getNextCardFaceOption() {
  const currentIndex = CARD_FACE_OPTIONS.findIndex((option) => option.key === normalizeCardFaceKey(state.cardFaceKey));
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

function createDebugDecisionOffsets() {
  return PLAYER_ORDER.reduce((acc, playerId) => {
    if (playerId !== 1) acc[playerId] = 0;
    return acc;
  }, {});
}

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
  topbarTrumpBadge: document.getElementById("topbarTrumpBadge"),
  bankerLabel: document.getElementById("bankerLabel"),
  trickLabel: document.getElementById("trickLabel"),
  defenderScore: document.getElementById("defenderScore"),
  turnTimer: document.getElementById("turnTimer"),
  topbarDifficulty: document.getElementById("topbarDifficulty"),
  timerHint: document.getElementById("timerHint"),
  logList: document.getElementById("logList"),
  actionHint: document.getElementById("actionHint"),
  setupOptions: document.getElementById("setupOptions"),
  aiDifficultySelect: document.getElementById("aiDifficultySelect"),
  aiPaceSelect: document.getElementById("aiPaceSelect"),
  aiPaceButtons: document.getElementById("aiPaceButtons"),
  centerTag: document.getElementById("centerTag"),
  focusAnnouncement: document.getElementById("focusAnnouncement"),
  centerPanel: document.getElementById("centerPanel"),
  bottomNote: document.getElementById("bottomNote"),
  bottomCardsMount: document.getElementById("bottomCardsMount"),
  bottomRevealCenter: document.getElementById("bottomRevealCenter"),
  bottomRevealText: document.getElementById("bottomRevealText"),
  bottomRevealTimer: document.getElementById("bottomRevealTimer"),
  bottomRevealCards: document.getElementById("bottomRevealCards"),
  closeBottomRevealPanelBtn: document.getElementById("closeBottomRevealPanelBtn"),
  closeBottomRevealBtn: document.getElementById("closeBottomRevealBtn"),
  versionBadge: document.getElementById("versionBadge"),
  handSummary: document.getElementById("handSummary"),
  handPlayerAvatar: document.getElementById("handPlayerAvatar"),
  handPanelTitle: document.getElementById("handPanelTitle"),
  handRoleBadge: document.getElementById("handRoleBadge"),
  handPlayerRole: document.getElementById("handPlayerRole"),
  handPhasePill: document.getElementById("handPhasePill"),
  handCountPill: document.getElementById("handCountPill"),
  handSelectedPill: document.getElementById("handSelectedPill"),
  handSelectionNote: document.getElementById("handSelectionNote"),
  handStatsRail: document.getElementById("handStatsRail"),
  handGroups: document.getElementById("handGroups"),
  actionSelectionBadge: document.getElementById("actionSelectionBadge"),
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
  toolbarMenuPanel: document.getElementById("toolbarMenuPanel"),
  menuRulesBtn: document.getElementById("menuRulesBtn"),
  menuAiPaceSelect: document.getElementById("menuAiPaceSelect"),
  menuAiPaceButtons: document.getElementById("menuAiPaceButtons"),
  menuHomeBtn: document.getElementById("menuHomeBtn"),
  layoutEditBtn: document.getElementById("layoutEditBtn"),
  resetLayoutBtn: document.getElementById("resetLayoutBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  startGameBtn: document.getElementById("startGameBtn"),
  startLobbyPanel: document.getElementById("startLobbyPanel"),
  startLobbyStatus: document.getElementById("startLobbyStatus"),
  startLobbyStartBtn: document.getElementById("startLobbyStartBtn"),
  startLobbyContinueBtn: document.getElementById("startLobbyContinueBtn"),
  startLobbyRulesBtn: document.getElementById("startLobbyRulesBtn"),
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
  debugDecisionMeta: document.getElementById("debugDecisionMeta"),
  debugDecisionPrevBtn: document.getElementById("debugDecisionPrevBtn"),
  debugDecisionIndex: document.getElementById("debugDecisionIndex"),
  debugDecisionNextBtn: document.getElementById("debugDecisionNextBtn"),
  debugDecisionCards: document.getElementById("debugDecisionCards"),
  debugDecisionList: document.getElementById("debugDecisionList"),
  debugHandCards: document.getElementById("debugHandCards"),
  debugReplaySeedInput: document.getElementById("debugReplaySeedInput"),
  debugReplaySeedApplyBtn: document.getElementById("debugReplaySeedApplyBtn"),
  debugOpeningCodeInput: document.getElementById("debugOpeningCodeInput"),
  debugOpeningCodeApplyBtn: document.getElementById("debugOpeningCodeApplyBtn"),
  debugReplayCurrentSeed: document.getElementById("debugReplayCurrentSeed"),
  debugReplayCurrentOpeningCode: document.getElementById("debugReplayCurrentOpeningCode"),
  debugReplayStatus: document.getElementById("debugReplayStatus"),
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
  aiDecisionHistory: [],
  aiDecisionHistorySeq: 0,
  bottomCards: [],
  selectedCardIds: [],
  replaySeed: "",
  replaySeedCounter: 0,
  roundRandom: null,
  openingCode: "",
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
  selectedSetupOptionKey: null,
  counterPasses: 0,
  phase: "ready",
  showLastTrick: false,
  showLogPanel: false,
  showDebugPanel: false,
  showToolbarMenu: false,
  showBottomPanel: false,
  showRulesPanel: false,
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  aiPace: DEFAULT_AI_PACE,
  autoManageMode: DEFAULT_AUTO_MANAGE_MODE,
  cardFaceKey: loadSavedCardFaceKey(),
  logs: [],
  allLogs: [],
  resultScreenExportLines: [],
  gameOver: false,
  selectedFriendOccurrence: 1,
  selectedFriendSuit: "hearts",
  selectedFriendRank: "A",
  friendRetargetUsed: false,
  friendRetargetCountdown: 0,
  friendRetargetTimer: null,
  nextFirstDealPlayerId: 1,
  bottomRevealMessage: "",
  bottomRevealCount: 0,
  exposedTrumpVoid: {},
  exposedSuitVoid: {},
  awaitingHumanDeclaration: false,
  hasSavedProgress: false,
  startSelection: null,
  selectedDebugPlayerId: 2,
  selectedDebugDecisionOffsets: createDebugDecisionOffsets(),
  debugReplaySeedDraft: "",
  debugOpeningCodeDraft: "",
  debugReplayStatusTone: "",
  debugReplayStatusText: "",
};

function isAiDecisionDebugEnabled() {
  return APP_PLATFORM === "pc" && !!state.showDebugPanel;
}

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
