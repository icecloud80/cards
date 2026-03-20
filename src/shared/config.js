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

/**
 * 作用：
 * 生成共享规则层使用的完整负级顺序。
 *
 * 为什么这样写：
 * 最新规则口径已经改成：`2` 被级牌扣底时，会先进入以 `-A` 为最高档的完整负级链，
 * 后续再沿 `-K -> -Q -> -J -> -10 ... -> -2` 逐档往下扣；
 * 这里直接从普通点数序列派生，能同时保证负级显示、结算、回放编码三处共用同一套顺序。
 *
 * 输入：
 * @param {void} - 无额外输入，直接复用全局 `RANKS`。
 *
 * 输出：
 * @returns {string[]} 按“最低到最高负级”排列的负级数组，即 `-2 ... -K ... -A`。
 *
 * 注意：
 * - 这里需要覆盖完整 `2..A`，确保 `-A` 继续作为最高负级存在。
 * - 返回顺序服务于升级链和开局码索引，不要擅自改成 `-K ... -2`。
 */
function buildNegativeLevels() {
  return RANKS.map((rank) => `-${rank}`);
}

const NEGATIVE_LEVELS = buildNegativeLevels();
const LEVEL_ORDER = [...NEGATIVE_LEVELS, ...RANKS];
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
const APP_SETTINGS_STORAGE_KEY = "five-friends-app-settings-v1";
const APP_PROGRESS_STORAGE_KEY = "five-friends-app-progress-v1";
const APP_ROUND_STORAGE_KEY = "five-friends-app-round-v1";
const APP_STORAGE_MIGRATION_KEY = "five-friends-app-storage-migration-v1";
const MAX_BURY_POINT_TOTAL = 25;
const OPENING_CODE_LEVEL_ORDER = LEVEL_ORDER;
const OPENING_CODE_AI_DIFFICULTY_ORDER = AI_DIFFICULTY_OPTIONS.map((option) => option.value);
const COMPACT_REPLAY_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const AUTO_GENERATED_REPLAY_SEED_LENGTH = 11;
const AUTO_GENERATED_REPLAY_SEED_TIME_BITS = 41n;
const AUTO_GENERATED_REPLAY_SEED_ENTROPY_BITS = 24n;
const AUTO_GENERATED_REPLAY_SEED_ENTROPY_MASK = Number((1n << AUTO_GENERATED_REPLAY_SEED_ENTROPY_BITS) - 1n);
let nativeAppSettingsSnapshotCache = null;
let nativeProgressSnapshotCache = null;
let nativeRecentReplaySnapshotCache = null;

/**
 * 作用：
 * 规范化 AI 难度取值。
 *
 * 为什么这样写：
 * AI 难度现在不仅会被设置菜单读取，还会被开局码、复盘逻辑和测试上下文共同使用；
 * 把兜底逻辑放进共享层后，规则层和运行态都能复用同一套合法值判断。
 *
 * 输入：
 * @param {string} value - 外部传入的 AI 难度键值。
 *
 * 输出：
 * @returns {"beginner"|"intermediate"|"advanced"} 合法难度值；非法输入回落到默认档。
 *
 * 注意：
 * - 当前只接受三档固定值，不做模糊匹配。
 * - 默认档必须和开始页初始值保持一致。
 */
function normalizeAiDifficulty(value) {
  return AI_DIFFICULTY_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_AI_DIFFICULTY;
}

/**
 * 作用：
 * 把非负整数编码成更短的字母数字混合文本。
 *
 * 为什么这样写：
 * 回放种子和开局码都要从旧的长 hex 文本切到更紧凑的跨端短码；
 * 统一收口成一套 base62 helper 后，默认 seed 分配、开局码压缩和未来调试短码都能复用同一实现。
 *
 * 输入：
 * @param {bigint|number} value - 当前要编码的非负整数。
 * @param {number} [minimumLength=1] - 输出至少要补齐到的长度。
 *
 * 输出：
 * @returns {string} 编码后的字母数字混合文本；输入非法时返回空串。
 *
 * 注意：
 * - 这里只接受非负整数，不处理负数或小数。
 * - 左侧补位统一使用字符 `0`，保证固定长度短码跨端显示一致。
 */
function encodeCompactReplayCodeValue(value, minimumLength = 1) {
  const minimumTextLength = Number.isInteger(minimumLength) && minimumLength > 0 ? minimumLength : 1;
  const normalizedValue = typeof value === "bigint"
    ? value
    : (Number.isInteger(value) && value >= 0 ? BigInt(value) : -1n);
  if (normalizedValue < 0n) return "";

  const base = BigInt(COMPACT_REPLAY_CODE_ALPHABET.length);
  let encoded = "";
  let currentValue = normalizedValue;
  do {
    const digit = Number(currentValue % base);
    encoded = `${COMPACT_REPLAY_CODE_ALPHABET[digit]}${encoded}`;
    currentValue /= base;
  } while (currentValue > 0n);

  return encoded.padStart(minimumTextLength, COMPACT_REPLAY_CODE_ALPHABET[0]);
}

/**
 * 作用：
 * 把字母数字混合短码反解回非负整数。
 *
 * 为什么这样写：
 * 新开局码和未来更多调试短码都需要从文本稳定恢复出原始数值；
 * 集中在共享层做反解后，规则层、日志入口和测试都不用重复维护字母表映射。
 *
 * 输入：
 * @param {string|null|undefined} text - 当前要反解的短码文本。
 *
 * 输出：
 * @returns {bigint|null} 成功时返回非负整数；文本为空或包含非法字符时返回 `null`。
 *
 * 注意：
 * - 编码表区分大小写，不能在调用前擅自转大写或转小写。
 * - 这里只做字符层反解，不负责校验业务范围是否合法。
 */
function decodeCompactReplayCodeValue(text) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return null;

  const base = BigInt(COMPACT_REPLAY_CODE_ALPHABET.length);
  let value = 0n;
  for (let index = 0; index < normalizedText.length; index += 1) {
    const digit = COMPACT_REPLAY_CODE_ALPHABET.indexOf(normalizedText[index]);
    if (digit < 0) return null;
    value = value * base + BigInt(digit);
  }
  return value;
}

/**
 * 作用：
 * 把任意文本稳定映射成 64 位无符号整数。
 *
 * 为什么这样写：
 * 预置回放基础 seed 现在也要缩成更短的字母数字 token；
 * 用稳定的 64 位哈希先把“基础 seed + 局号”压成整数后，就能在不依赖兼容旧格式的前提下生成固定长度短码。
 *
 * 输入：
 * @param {string|number|null|undefined} textInput - 当前要参与哈希的原始文本。
 *
 * 输出：
 * @returns {bigint} 对应的 64 位无符号整数哈希值。
 *
 * 注意：
 * - 相同输入必须得到相同输出，方便 headless 回归稳定复盘。
 * - 返回值即使为 `0` 也允许保留；调用方如需非零约束，应自行再做兜底。
 */
function hashTextToUint64(textInput) {
  const raw = String(textInput ?? "");
  const mod = 18446744073709551616n;
  let hash = 14695981039346656037n;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= BigInt(raw.charCodeAt(index));
    hash = (hash * 1099511628211n) % mod;
  }
  return hash;
}

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

/**
 * 作用：
 * 判断当前运行环境是否处于 Capacitor 原生壳内。
 *
 * 为什么这样写：
 * 这轮轻量迁移要求 Web 完全保持旧行为，只有原生 App 才走 `Preferences`；
 * 把环境判断统一收口后，牌面、进度和最近一局复盘输入都能复用同一条分流逻辑。
 *
 * 输入：
 * @param {void} - 直接读取 `window.Capacitor` 运行时能力。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前为原生 App 运行时。
 *
 * 注意：
 * - Web 浏览器和测试 VM 必须稳定返回 `false`。
 * - 这里只判断运行时，不代表插件一定可用。
 */
function isNativeAppRuntime() {
  return !!window.Capacitor?.isNativePlatform?.();
}

/**
 * 作用：
 * 读取当前原生壳里可用的 `Preferences` 插件实例。
 *
 * 为什么这样写：
 * 当前仓库仍是全局脚本模式，不通过打包器直接 `import` Capacitor 插件；
 * 统一从运行时全局读取后，业务层既能在原生壳里工作，也能在浏览器和测试里安全降级。
 *
 * 输入：
 * @param {void} - 直接读取 `window.Capacitor.Plugins`。
 *
 * 输出：
 * @returns {?object} 可用的 `Preferences` 插件；拿不到时返回 `null`。
 *
 * 注意：
 * - 插件缺失时调用方必须自行降级，不能直接抛错阻断开局。
 * - 这里只返回实例，不负责做能力探测缓存。
 */
function getNativePreferencesPlugin() {
  const plugin = window.Capacitor?.Plugins?.Preferences || null;
  return plugin && typeof plugin.get === "function" && typeof plugin.set === "function" ? plugin : null;
}

/**
 * 作用：
 * 规范化 App 侧设置快照。
 *
 * 为什么这样写：
 * 原生壳会把多项设置收口到同一份 JSON 里保存；
 * 统一在这里做兜底，可以避免旧值、脏值或缺字段把 App 启动态带偏。
 *
 * 输入：
 * @param {?object} snapshot - 从 `Preferences` 读取到的原始设置对象。
 *
 * 输出：
 * @returns {{cardFaceKey:string,aiDifficulty:string,aiPace:string,autoManageMode:string}} 规范化后的设置快照。
 *
 * 注意：
 * - 这里只处理 App 额外持久化的字段，不扩展到 Web 现有布局存储。
 * - 牌面键值仍需兼容历史 `modern-sprite` 别名。
 */
function normalizeNativeAppSettingsSnapshot(snapshot) {
  return {
    cardFaceKey: normalizeCardFaceKey(snapshot?.cardFaceKey),
    aiDifficulty: normalizeAiDifficulty(snapshot?.aiDifficulty),
    aiPace: normalizeAiPace(snapshot?.aiPace),
    autoManageMode: normalizeStoredAutoManageMode(snapshot?.autoManageMode),
  };
}

/**
 * 作用：
 * 规范化 App 侧玩家等级进度快照。
 *
 * 为什么这样写：
 * 原生存储要接管“继续游戏”入口，但我们仍希望沿用现有等级结构和 cookie 兼容口径；
 * 用统一 helper 包一层后，读旧值、写新值和测试断言都能共享同一份结构。
 *
 * 输入：
 * @param {?object} snapshot - 从 `Preferences` 读取到的原始进度对象。
 *
 * 输出：
 * @returns {{playerLevels:object,savedAt:number}|null} 合法进度对象；没有可用内容时返回 `null`。
 *
 * 注意：
 * - `savedAt` 只用于调试与未来扩展，不参与玩法逻辑。
 * - 玩家等级始终按共享层合法值兜底。
 */
function normalizeNativeAppProgressSnapshot(snapshot) {
  if (!snapshot?.playerLevels) return null;
  return {
    playerLevels: normalizePlayerLevels(snapshot.playerLevels),
    savedAt: Number.isFinite(snapshot.savedAt) ? snapshot.savedAt : Date.now(),
  };
}

/**
 * 作用：
 * 规范化 App 侧最近一局复盘输入快照。
 *
 * 为什么这样写：
 * 这轮 `round` 不再保存中途牌局，只保留“最近一局的开局输入”；
 * 提前把开局码和回放种子一起收口后，复盘面板和未来 App 专用恢复入口都能稳定读取同一份数据。
 *
 * 输入：
 * @param {?object} snapshot - 从 `Preferences` 读取到的原始 round 对象。
 *
 * 输出：
 * @returns {{openingCode:string,replaySeed:string}|null} 合法的复盘输入对象；无效时返回 `null`。
 *
 * 注意：
 * - 两个字段缺一不可；拿不到完整开局输入时统一视为没有最近一局记录。
 * - 这里只保留最小复盘输入，不额外存 phase、手牌或日志。
 */
function normalizeNativeRecentReplaySnapshot(snapshot) {
  const openingCode = normalizeOpeningCodeInput(snapshot?.openingCode);
  const replaySeed = normalizeReplaySeedInput(snapshot?.replaySeed);
  if (!openingCode || !replaySeed) return null;
  return {
    openingCode,
    replaySeed,
  };
}

/**
 * 作用：
 * 以 JSON 形式读取一份原生 `Preferences` 存储值。
 *
 * 为什么这样写：
 * App 侧三类存储都统一走 JSON 文本；
 * 收口成同一个 helper 后，迁移逻辑、设置保存和最近一局复盘输入都可以复用相同的容错规则。
 *
 * 输入：
 * @param {string} storageKey - 当前要读取的 `Preferences` key。
 *
 * 输出：
 * @returns {Promise<object|null>} 解析后的对象；没有值或解析失败时返回 `null`。
 *
 * 注意：
 * - 插件缺失或读取失败时必须静默降级，不能阻断运行时。
 * - 返回对象只代表“原始读取结果”，业务字段仍需单独规范化。
 */
async function readNativePreferenceJson(storageKey) {
  const preferences = getNativePreferencesPlugin();
  if (!preferences) return null;
  try {
    const result = await preferences.get({ key: storageKey });
    if (!result?.value) return null;
    return JSON.parse(result.value);
  } catch (error) {
    console.warn?.(`Failed to read native preference "${storageKey}"`, error);
    return null;
  }
}

/**
 * 作用：
 * 把一份 JSON 对象写入原生 `Preferences`。
 *
 * 为什么这样写：
 * App 侧最近一局复盘输入、设置和进度都只需要轻量 key-value 持久化；
 * 统一封装写入逻辑后，可以让业务层专注于准备快照本身，不用重复处理 JSON 和插件缺失兜底。
 *
 * 输入：
 * @param {string} storageKey - 当前要写入的 `Preferences` key。
 * @param {?object} payload - 待写入的业务对象；传 `null` 时视为清理该 key。
 *
 * 输出：
 * @returns {Promise<void>} 写入或清理结束后正常完成。
 *
 * 注意：
 * - 写入失败时只打告警，不阻断牌局流程。
 * - 传 `null` 时需要显式删除 key，避免把字符串 `"null"` 留在原生存储里。
 */
async function writeNativePreferenceJson(storageKey, payload) {
  const preferences = getNativePreferencesPlugin();
  if (!preferences) return;
  try {
    if (payload == null) {
      await preferences.remove({ key: storageKey });
      return;
    }
    await preferences.set({
      key: storageKey,
      value: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn?.(`Failed to write native preference "${storageKey}"`, error);
  }
}

/**
 * 作用：
 * 生成当前 App 侧设置快照。
 *
 * 为什么这样写：
 * 牌面、AI 难度、节奏和托管模式会在多个入口里被修改；
 * 集中在一个 helper 里取当前快照后，原生保存逻辑就不必到处手拼对象字段。
 *
 * 输入：
 * @param {void} - 直接读取当前共享状态。
 *
 * 输出：
 * @returns {{cardFaceKey:string,aiDifficulty:string,aiPace:string,autoManageMode:string}} 当前设置快照。
 *
 * 注意：
 * - 输出字段必须与 `normalizeNativeAppSettingsSnapshot(...)` 对齐。
 * - 这里只返回轻量设置，不包含布局或调试状态。
 */
function buildNativeAppSettingsSnapshot() {
  return normalizeNativeAppSettingsSnapshot({
    cardFaceKey: state?.cardFaceKey,
    aiDifficulty: state?.aiDifficulty,
    aiPace: state?.aiPace,
    autoManageMode: state?.autoManageMode === "persistent" ? "persistent" : "off",
  });
}

/**
 * 作用：
 * 生成当前共享状态对应的最近一局复盘输入快照。
 *
 * 为什么这样写：
 * 这轮 `round` 只保留“最近一局的开局输入”；
 * 抽成 helper 后，发牌开始、调试重开和未来 App 入口都能复用同一套最小快照结构。
 *
 * 输入：
 * @param {void} - 直接读取当前共享状态。
 *
 * 输出：
 * @returns {{openingCode:string,replaySeed:string}|null} 当前局可保存的复盘输入；不完整时返回 `null`。
 *
 * 注意：
 * - 必须同时具备 `openingCode` 和 `replaySeed` 才允许写入。
 * - 这里只表示“最近一局开局输入”，不是中途牌局快照。
 */
function buildNativeRecentReplaySnapshot() {
  return normalizeNativeRecentReplaySnapshot({
    openingCode: state?.openingCode,
    replaySeed: state?.replaySeed,
  });
}

/**
 * 作用：
 * 在原生 App 中异步持久化当前设置快照。
 *
 * 为什么这样写：
 * 这轮新增的设置持久化只对原生壳开放，Web 仍保持旧语义；
 * 用单独 helper 隔离后，事件处理器只需要在状态变更后轻量调用一次，不会把平台分支散落到各处。
 *
 * 输入：
 * @param {void} - 直接读取共享状态并写入当前设置。
 *
 * 输出：
 * @returns {Promise<void>} 写入完成后结束。
 *
 * 注意：
 * - 只在 `state.appStorageHydrated === true` 后真正写原生存储，避免启动阶段误覆盖旧数据。
 * - Web 调用时必须静默跳过。
 */
async function persistNativeAppSettingsFromState() {
  if (!isNativeAppRuntime() || !state?.appStorageHydrated) return;
  const snapshot = buildNativeAppSettingsSnapshot();
  nativeAppSettingsSnapshotCache = snapshot;
  state.nativeAppSettingsSnapshot = snapshot;
  await writeNativePreferenceJson(APP_SETTINGS_STORAGE_KEY, snapshot);
}

/**
 * 作用：
 * 在原生 App 中异步持久化当前玩家等级进度。
 *
 * 为什么这样写：
 * “继续游戏”入口需要在 App 内不再依赖浏览器 cookie；
 * 把原生进度保存收口后，旧 cookie 兼容和新 App 存储可以并行存在，但读取优先级保持清晰。
 *
 * 输入：
 * @param {object} [levels=state.playerLevels] - 当前要写入的玩家等级。
 *
 * 输出：
 * @returns {Promise<void>} 写入完成后结束。
 *
 * 注意：
 * - 只保存长期等级进度，不扩展到中途牌局。
 * - Web 仍继续写 cookie；原生保存只是额外补一份可控存储。
 */
async function persistNativeProgressFromState(levels = state?.playerLevels) {
  if (!isNativeAppRuntime() || !state?.appStorageHydrated) return;
  const snapshot = normalizeNativeAppProgressSnapshot({
    playerLevels: levels,
    savedAt: Date.now(),
  });
  nativeProgressSnapshotCache = snapshot;
  state.nativeProgressSnapshot = snapshot;
  await writeNativePreferenceJson(APP_PROGRESS_STORAGE_KEY, snapshot);
}

/**
 * 作用：
 * 在原生 App 中异步持久化最近一局复盘输入。
 *
 * 为什么这样写：
 * 这轮 `round` 的职责已经收口成“给日志、QA 和手动重建开局用”；
 * 用统一 helper 保存最近一局后，发牌真正开始时就能把这份输入稳定留在 App 可控存储里。
 *
 * 输入：
 * @param {{openingCode:string,replaySeed:string}|null} [snapshot] - 可选的最近一局复盘输入；不传时默认读取当前局。
 *
 * 输出：
 * @returns {Promise<void>} 写入完成后结束。
 *
 * 注意：
 * - 这里只保存最近一份记录，新局开始后允许覆盖旧值。
 * - 当开局输入不完整时必须跳过，避免写入半成品。
 */
async function persistNativeRecentReplayFromState(snapshot = buildNativeRecentReplaySnapshot()) {
  if (!isNativeAppRuntime() || !state?.appStorageHydrated || !snapshot) return;
  nativeRecentReplaySnapshotCache = snapshot;
  state.nativeRecentReplaySnapshot = snapshot;
  await writeNativePreferenceJson(APP_ROUND_STORAGE_KEY, snapshot);
}

/**
 * 作用：
 * 返回当前运行时更适合预填到复盘面板里的开局输入。
 *
 * 为什么这样写：
 * Web 仍希望默认预填“当前局”的回放信息，而 App 则更希望优先带出最近一局持久化下来的复盘输入；
 * 把优先级统一写死后，复盘面板入口和未来 App 恢复入口都能得到同一份结果。
 *
 * 输入：
 * @param {void} - 直接读取当前共享状态和原生缓存。
 *
 * 输出：
 * @returns {{openingCode:string,replaySeed:string}|null} 当前应优先使用的复盘输入。
 *
 * 注意：
 * - 原生缓存可用时优先返回最近一局记录。
 * - 拿不到完整字段时统一返回 `null`。
 */
function getPreferredReplayDraftSource() {
  return nativeRecentReplaySnapshotCache || state?.nativeRecentReplaySnapshot || buildNativeRecentReplaySnapshot();
}

/**
 * 作用：
 * 执行一次原生 App 存储初始化与旧 Web 数据迁移。
 *
 * 为什么这样写：
 * 原生 App 这轮要开始接管设置、等级进度和最近一局复盘输入，
 * 但现有代码里仍有 `localStorage/cookie` 历史数据；统一在启动时做一次轻量迁移后，
 * 就能让后续读取优先走 App 可控存储，同时又不影响 Web 原本行为。
 *
 * 输入：
 * @param {void} - 直接读取原生存储、当前共享状态和旧 Web 存储。
 *
 * 输出：
 * @returns {Promise<void>} 初始化和迁移结束后完成。
 *
 * 注意：
 * - 只迁移这轮方案需要的最小字段，不扩展到完整牌局快照。
 * - 初始化完成前不能回写原生设置，避免把默认值误覆盖成用户旧值。
 */
async function hydrateNativeAppStorageState() {
  if (!isNativeAppRuntime()) return;

  const migrationMarker = await readNativePreferenceJson(APP_STORAGE_MIGRATION_KEY);
  const storedSettingsSnapshot = await readNativePreferenceJson(APP_SETTINGS_STORAGE_KEY);
  let settingsSnapshot = storedSettingsSnapshot ? normalizeNativeAppSettingsSnapshot(storedSettingsSnapshot) : null;
  let progressSnapshot = normalizeNativeAppProgressSnapshot(await readNativePreferenceJson(APP_PROGRESS_STORAGE_KEY));
  let recentReplaySnapshot = normalizeNativeRecentReplaySnapshot(await readNativePreferenceJson(APP_ROUND_STORAGE_KEY));

  if (!migrationMarker?.done) {
    if (!settingsSnapshot) {
      settingsSnapshot = normalizeNativeAppSettingsSnapshot({
        cardFaceKey: loadSavedCardFaceKey(),
        aiDifficulty: state.aiDifficulty,
        aiPace: state.aiPace,
        autoManageMode: state.autoManageMode,
      });
      await writeNativePreferenceJson(APP_SETTINGS_STORAGE_KEY, settingsSnapshot);
    }

    if (!progressSnapshot) {
      const browserProgress = loadProgressFromCookie();
      if (browserProgress) {
        progressSnapshot = normalizeNativeAppProgressSnapshot({
          playerLevels: browserProgress,
          savedAt: Date.now(),
        });
        await writeNativePreferenceJson(APP_PROGRESS_STORAGE_KEY, progressSnapshot);
      }
    }

    await writeNativePreferenceJson(APP_STORAGE_MIGRATION_KEY, {
      done: true,
      migratedAt: Date.now(),
    });
  }

  nativeAppSettingsSnapshotCache = settingsSnapshot;
  nativeProgressSnapshotCache = progressSnapshot;
  nativeRecentReplaySnapshotCache = recentReplaySnapshot;
  state.nativeAppSettingsSnapshot = settingsSnapshot;
  state.nativeProgressSnapshot = progressSnapshot;
  state.nativeRecentReplaySnapshot = recentReplaySnapshot;
  state.appStorageHydrated = true;
}

// 读取已保存的牌面样式键值。
function loadSavedCardFaceKey() {
  if (isNativeAppRuntime() && nativeAppSettingsSnapshotCache?.cardFaceKey) {
    return normalizeCardFaceKey(nativeAppSettingsSnapshotCache.cardFaceKey);
  }
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
  persistNativeAppSettingsFromState();
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
 * 规范化托管模式在持久化层里的取值。
 *
 * 为什么这样写：
 * `config.js` 需要在 `main.js` 之前加载，但原生设置快照又要保存托管模式；
 * 在这里补一份同口径兜底后，就能避免脚本加载顺序导致的未定义引用。
 *
 * 输入：
 * @param {string} value - 外部传入的托管模式键值。
 *
 * 输出：
 * @returns {"off"|"round"|"persistent"} 合法托管模式；非法输入回退到关闭。
 *
 * 注意：
 * - 这里只服务持久化层与启动期读取，不改变 `main.js` 里的业务入口。
 * - 合法值必须和顶部托管按钮循环口径保持一致。
 */
function normalizeStoredAutoManageMode(value) {
  return AUTO_MANAGE_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_AUTO_MANAGE_MODE;
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
 * 规范化外部传入的开局码文本。
 *
 * 为什么这样写：
 * 新开局码已经改成区分大小写的字母数字混合格式；
 * 把 trim 规则收口到共享层后，运行态输入、原生持久化和测试夹具都能保留同一份原始编码，不会被误转成旧 hex 口径。
 *
 * 输入：
 * @param {string|null|undefined} openingCodeInput - 外部传入的原始开局码。
 *
 * 输出：
 * @returns {string} 去掉首尾空白后的开局码；拿不到有效值时返回空串。
 *
 * 注意：
 * - 这里故意不做大小写转换，因为新编码区分大小写。
 * - 这里只做文本归一化，合法性校验仍交给 `decodeOpeningCode(...)`。
 */
function normalizeOpeningCodeInput(openingCodeInput) {
  if (openingCodeInput == null) return "";
  return String(openingCodeInput).trim();
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
    return encodeCompactReplayCodeValue(
      hashTextToUint64(`${presetSeedBase}:${nextRoundIndex}`),
      AUTO_GENERATED_REPLAY_SEED_LENGTH
    );
  }

  let entropy = 0;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    entropy = values[0] >>> 0;
  } else {
    entropy = Math.floor(Math.random() * 4294967296) >>> 0;
  }
  const replaySeedValue = (
    (BigInt(Date.now()) & ((1n << AUTO_GENERATED_REPLAY_SEED_TIME_BITS) - 1n))
    << AUTO_GENERATED_REPLAY_SEED_ENTROPY_BITS
  ) | BigInt(entropy & AUTO_GENERATED_REPLAY_SEED_ENTROPY_MASK);
  return encodeCompactReplayCodeValue(replaySeedValue, AUTO_GENERATED_REPLAY_SEED_LENGTH);
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
  menuReplayBtn: document.getElementById("menuReplayBtn"),
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
  replayPanel: document.getElementById("replayPanel"),
  replayPanelDrag: document.getElementById("replayPanelDrag"),
  closeReplayBtn: document.getElementById("closeReplayBtn"),
  replaySeedInput: document.getElementById("replaySeedInput"),
  replaySeedApplyBtn: document.getElementById("replaySeedApplyBtn"),
  replayPasteBtn: document.getElementById("replayPasteBtn"),
  replayOpeningCodeInput: document.getElementById("replayOpeningCodeInput"),
  replayOpeningCodeApplyBtn: document.getElementById("replayOpeningCodeApplyBtn"),
  replayCurrentSeed: document.getElementById("replayCurrentSeed"),
  replayCurrentOpeningCode: document.getElementById("replayCurrentOpeningCode"),
  replayStatus: document.getElementById("replayStatus"),
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
  pendingHumanCounterPassKey: "",
  counterPasses: 0,
  phase: "ready",
  showLastTrick: false,
  showLogPanel: false,
  showDebugPanel: false,
  showReplayPanel: false,
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
  appStorageHydrated: false,
  appStorageHydrationPromise: null,
  nativeAppSettingsSnapshot: null,
  nativeProgressSnapshot: null,
  nativeRecentReplaySnapshot: null,
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

/**
 * 作用：
 * 把外部读到的玩家等级进度整理成共享状态机可直接使用的标准结构。
 *
 * 为什么这样写：
 * 玩家等级既会来自 Cookie / 原生存储，也会来自开局码元信息与测试注入；
 * 这次负级链已经扩成 `Lv:-A, -K ... Lv:-2`，如果这里仍只接受正级，就会把新负级 silently 洗回 `2`，
 * 让存档、复盘和结果结算出现“规则层算对了，但落盘又丢了”的假一致性问题。
 *
 * 输入：
 * @param {Record<number|string, string>} levels - 待规范化的玩家等级映射。
 *
 * 输出：
 * @returns {Record<number, string>} 覆盖 5 位玩家的合法等级映射；非法值回退到初始等级。
 *
 * 注意：
 * - 这里必须接受完整 `LEVEL_ORDER`，不能只认正级。
 * - 回退值继续使用 `INITIAL_LEVELS`，避免脏数据把所有人都重置成同一档。
 */
function normalizePlayerLevels(levels) {
  return PLAYER_ORDER.reduce((acc, playerId) => {
    const value = levels?.[playerId] ?? levels?.[String(playerId)];
    acc[playerId] = LEVEL_ORDER.includes(value) ? value : INITIAL_LEVELS[playerId];
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
  if (isNativeAppRuntime() && nativeProgressSnapshotCache?.playerLevels) {
    return normalizePlayerLevels(nativeProgressSnapshotCache.playerLevels);
  }
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
  persistNativeProgressFromState(playerLevels);
}

// 刷新当前是否存在可继续进度的状态。
function refreshSavedProgressAvailability() {
  state.hasSavedProgress = !!loadProgressFromCookie();
}
