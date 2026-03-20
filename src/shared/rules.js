// 创建并洗混本局要使用的牌堆。
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
      img: getJokerImage("BJ"),
    });
    deck.push({
      id: `c-${pack}-joker-RJ-${seq++}`,
      suit: "joker",
      rank: "RJ",
      pack,
      img: getJokerImage("RJ"),
    });
  }
  return shuffle(deck);
}

// 返回大小王对应的图片路径。
function getJokerImage(rank) {
  return `${getCurrentCardAssetDir()}/${rank === "RJ" ? "red_joker" : "black_joker"}.svg`;
}

// 返回普通牌对应的图片路径。
function getCardImage(suit, rank) {
  const rankName = {
    A: "ace",
    K: "king",
    Q: "queen",
    J: "jack",
  }[rank] || rank;
  return `${getCurrentCardAssetDir()}/${rankName}_of_${suit}.svg`;
}

// 根据牌对象解析对应的图片路径。
function resolveCardImage(card) {
  if (!card) return "";
  if (card.suit === "joker") return getJokerImage(card.rank);
  if (card.suit && card.rank) return getCardImage(card.suit, card.rank);
  return card.img || "";
}

/**
 * 作用：
 * 把玩家等级映射成开局码元信息里使用的稳定索引。
 *
 * 为什么这样写：
 * 新开局码虽然不再使用旧的 meta byte 布局，但仍需要在紧凑元信息里稳定记录 5 位玩家等级；
 * 先收口成固定顺序索引后，无论底层继续用排列压缩还是以后再换编码，都能保持同一份业务映射。
 *
 * 输入：
 * @param {string} level - 当前玩家等级文本。
 *
 * 输出：
 * @returns {number} 对应的等级索引；非法值统一回退到 `2`。
 *
 * 注意：
 * - 这里和 UI 展示等级共用同一份原始等级文本，不额外做业务翻译。
 * - 兜底值必须稳定，避免旧日志因为脏值无法解码。
 */
function getOpeningCodeLevelIndex(level) {
  const normalizedLevel = String(level ?? "");
  const levelIndex = OPENING_CODE_LEVEL_ORDER.indexOf(normalizedLevel);
  return levelIndex >= 0 ? levelIndex : OPENING_CODE_LEVEL_ORDER.indexOf("2");
}

/**
 * 作用：
 * 把 AI 难度映射成开局码元信息里使用的稳定索引。
 *
 * 为什么这样写：
 * 用户希望复盘重开时能自动切回原局 AI 难度；
 * 新开局码现在会把元信息整体压成一段整数，因此先保留稳定索引映射，更方便跨端共享和后续继续扩展。
 *
 * 输入：
 * @param {string} aiDifficulty - 当前局使用的 AI 难度键值。
 *
 * 输出：
 * @returns {number} 对应的难度索引；非法值统一回退到默认难度。
 *
 * 注意：
 * - 这里只记录全局 AI 难度，不记录未来可能出现的逐座位难度映射。
 * - 默认索引必须继续回落到 `beginner`，避免脏值把复盘局带到未知难度。
 */
function getOpeningCodeAiDifficultyIndex(aiDifficulty) {
  const normalizedDifficulty = normalizeAiDifficulty(aiDifficulty);
  const difficultyIndex = OPENING_CODE_AI_DIFFICULTY_ORDER.indexOf(normalizedDifficulty);
  return difficultyIndex >= 0 ? difficultyIndex : OPENING_CODE_AI_DIFFICULTY_ORDER.indexOf(DEFAULT_AI_DIFFICULTY);
}

const OPENING_CODE_VERSION = 1;
const OPENING_CODE_CARD_COUNT = 162;
const OPENING_CODE_CHECKSUM_LENGTH = 3;
const OPENING_CODE_CHECKSUM_SPACE = COMPACT_REPLAY_CODE_ALPHABET.length ** OPENING_CODE_CHECKSUM_LENGTH;
const OPENING_CODE_LEVEL_RADIX = BigInt(OPENING_CODE_LEVEL_ORDER.length);
const OPENING_CODE_AI_DIFFICULTY_RADIX = BigInt(OPENING_CODE_AI_DIFFICULTY_ORDER.length);
const OPENING_CODE_FIRST_DEAL_PLAYER_RADIX = BigInt(PLAYER_ORDER.length);

/**
 * 作用：
 * 预计算开局码排列压缩需要的阶乘表。
 *
 * 为什么这样写：
 * 新开局码不再逐张写 162 个字节，而是把整副牌顺序映射成一个排列序号；
 * 先把 `0! ~ 162!` 阶乘表算好后，编码和解码都能稳定复用同一套基数，不用在每次开局时重复做大整数乘法。
 *
 * 输入：
 * @param {number} cardCount - 当前要支持编码的总牌数。
 *
 * 输出：
 * @returns {bigint[]} 从 `0!` 到 `cardCount!` 的阶乘数组；输入非法时返回空数组。
 *
 * 注意：
 * - 这里默认服务于 162 张牌的完整牌堆，不要随意改成只算 155 张手牌。
 * - 返回数组下标就是阶乘里的 `n`，调用方不要自己再做偏移换算。
 */
function buildOpeningCodePermutationFactorials(cardCount) {
  if (!Number.isInteger(cardCount) || cardCount < 0) return [];
  const factorials = [1n];
  for (let value = 1; value <= cardCount; value += 1) {
    factorials[value] = factorials[value - 1] * BigInt(value);
  }
  return factorials;
}

const OPENING_CODE_PERMUTATION_FACTORIALS = buildOpeningCodePermutationFactorials(OPENING_CODE_CARD_COUNT);
const OPENING_CODE_META_SPACE = OPENING_CODE_FIRST_DEAL_PLAYER_RADIX
  * (OPENING_CODE_LEVEL_RADIX ** BigInt(PLAYER_ORDER.length))
  * OPENING_CODE_AI_DIFFICULTY_RADIX;
const OPENING_CODE_PAYLOAD_FIXED_LENGTH = encodeCompactReplayCodeValue(
  OPENING_CODE_PERMUTATION_FACTORIALS[OPENING_CODE_CARD_COUNT] * OPENING_CODE_META_SPACE - 1n
).length;
const OPENING_CODE_FIXED_LENGTH = OPENING_CODE_PAYLOAD_FIXED_LENGTH + OPENING_CODE_CHECKSUM_LENGTH;

/**
 * 作用：
 * 把业务牌对象映射成开局码里的唯一牌序编号。
 *
 * 为什么这样写：
 * 这局游戏使用 3 副共 162 张牌，最稳的记录方式不是“按玩家分组列牌”，
 * 而是直接把完整发牌顺序压成 `0..161` 的固定编号流；这样未来既能还原 5 家手牌，也能还原逐张发牌过程。
 *
 * 输入：
 * @param {{pack?: number, suit?: string, rank?: string}} card - 当前需要编码的牌对象。
 *
 * 输出：
 * @returns {number} 唯一牌编号；牌对象无效时返回 `-1`。
 *
 * 注意：
 * - 编号顺序固定为“每副牌内按 `clubs -> diamonds -> spades -> hearts -> BJ -> RJ`”。
 * - 这里必须和 `createDeck()` 的原始牌构造顺序保持一致，否则旧日志无法稳定重放。
 */
function getOpeningCodeCardIndex(card) {
  if (!card || !Number.isInteger(card.pack) || card.pack < 0 || card.pack > 2) return -1;
  let localIndex = -1;

  if (card.suit === "joker") {
    if (card.rank === "BJ") {
      localIndex = 52;
    } else if (card.rank === "RJ") {
      localIndex = 53;
    }
  } else {
    const suitIndex = SUITS.indexOf(card.suit);
    const rankIndex = RANKS.indexOf(card.rank);
    if (suitIndex >= 0 && rankIndex >= 0) {
      localIndex = suitIndex * RANKS.length + rankIndex;
    }
  }

  if (localIndex < 0) return -1;
  return card.pack * 54 + localIndex;
}

/**
 * 作用：
 * 根据开局码里的唯一牌编号反解出可直接参与规则层的牌对象。
 *
 * 为什么这样写：
 * 未来“按开局码重开”需要把日志里的字母数字混合短码还原回真实牌堆；
 * 先在共享规则层补齐解码函数，后续无论是测试还是 UI 入口都能复用这一份还原逻辑。
 *
 * 输入：
 * @param {number} cardIndex - 开局码里的唯一牌编号。
 *
 * 输出：
 * @returns {{id:string,suit:string,rank:string,pack:number,img:string}|null} 对应牌对象；编号非法时返回 `null`。
 *
 * 注意：
 * - 返回对象会重新生成 `id` 和 `img`，不依赖历史运行态引用。
 * - 这里还原的是“牌身份”，不是某一时刻的手牌归属。
 */
function createCardFromOpeningCodeIndex(cardIndex) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= OPENING_CODE_CARD_COUNT) return null;
  const pack = Math.floor(cardIndex / 54);
  const localIndex = cardIndex % 54;

  if (localIndex === 52 || localIndex === 53) {
    const rank = localIndex === 52 ? "BJ" : "RJ";
    return {
      id: `opening-code-${pack}-joker-${rank}-${cardIndex}`,
      suit: "joker",
      rank,
      pack,
      img: getJokerImage(rank),
    };
  }

  const suitIndex = Math.floor(localIndex / RANKS.length);
  const rankIndex = localIndex % RANKS.length;
  const suit = SUITS[suitIndex];
  const rank = RANKS[rankIndex];
  if (!suit || !rank) return null;

  return {
    id: `opening-code-${pack}-${suit}-${rank}-${cardIndex}`,
    suit,
    rank,
    pack,
    img: getCardImage(suit, rank),
  };
}

/**
 * 作用：
 * 把开局元信息压成排列序号后面的附加整数。
 *
 * 为什么这样写：
 * 新开局码的主要空间要留给 162 张牌顺序本身，但首抓玩家、5 位等级和 AI 难度仍必须一起回放；
 * 先把这些小字段压成固定范围整数后，就能和排列序号一起统一走字母数字混合短码。
 *
 * 输入：
 * @param {{firstDealPlayerId?: number, playerLevels?: Record<number,string>, aiDifficulty?: string}} [options={}] - 当前开局元信息。
 *
 * 输出：
 * @returns {bigint} 当前元信息对应的压缩整数。
 *
 * 注意：
 * - 当前版本固定为 `1`，不再为旧 hex 兼容额外占位。
 * - 字段顺序必须和 `decodeOpeningCodeMetaValue(...)` 完全一致，不能私自互换。
 */
function getOpeningCodeMetaValue(options = {}) {
  const firstDealPlayerId = PLAYER_ORDER.includes(options.firstDealPlayerId) ? options.firstDealPlayerId : 1;
  const playerLevels = normalizePlayerLevels(options.playerLevels);
  const aiDifficultyIndex = getOpeningCodeAiDifficultyIndex(options.aiDifficulty);
  const firstDealPlayerIndex = PLAYER_ORDER.indexOf(firstDealPlayerId);

  let metaValue = BigInt(firstDealPlayerIndex);
  for (const playerId of PLAYER_ORDER) {
    metaValue = metaValue * OPENING_CODE_LEVEL_RADIX + BigInt(getOpeningCodeLevelIndex(playerLevels[playerId]));
  }
  metaValue = metaValue * OPENING_CODE_AI_DIFFICULTY_RADIX + BigInt(aiDifficultyIndex);
  return metaValue;
}

/**
 * 作用：
 * 把压缩后的元信息整数还原成业务可读字段。
 *
 * 为什么这样写：
 * 开局码重建时既要拿回整副牌顺序，也要同步恢复首抓玩家、5 位玩家等级和 AI 难度；
 * 把元信息解码单独收口后，主解码器可以专注于校验长度、校验码和排列序号，不会把字段拆分逻辑揉在一起。
 *
 * 输入：
 * @param {bigint} metaValue - 当前开局码里拆出来的元信息整数。
 *
 * 输出：
 * @returns {{firstDealPlayerId:number,playerLevels:Record<number,string>,aiDifficulty:string}|null} 解码结果；取值越界时返回 `null`。
 *
 * 注意：
 * - 拆分顺序必须和 `getOpeningCodeMetaValue(...)` 完全镜像。
 * - 任一索引落到非法范围都必须判错，避免脏码静默回退成错误局面。
 */
function decodeOpeningCodeMetaValue(metaValue) {
  if (typeof metaValue !== "bigint" || metaValue < 0n || metaValue >= OPENING_CODE_META_SPACE) return null;

  let remainingValue = metaValue;
  const aiDifficultyIndex = Number(remainingValue % OPENING_CODE_AI_DIFFICULTY_RADIX);
  remainingValue /= OPENING_CODE_AI_DIFFICULTY_RADIX;

  const playerLevels = {};
  for (let orderIndex = PLAYER_ORDER.length - 1; orderIndex >= 0; orderIndex -= 1) {
    const levelIndex = Number(remainingValue % OPENING_CODE_LEVEL_RADIX);
    remainingValue /= OPENING_CODE_LEVEL_RADIX;
    const playerId = PLAYER_ORDER[orderIndex];
    playerLevels[playerId] = OPENING_CODE_LEVEL_ORDER[levelIndex];
  }

  const firstDealPlayerIndex = Number(remainingValue % OPENING_CODE_FIRST_DEAL_PLAYER_RADIX);
  const firstDealPlayerId = PLAYER_ORDER[firstDealPlayerIndex];
  const aiDifficulty = OPENING_CODE_AI_DIFFICULTY_ORDER[aiDifficultyIndex];
  if (!firstDealPlayerId || !aiDifficulty) return null;
  if (PLAYER_ORDER.some((playerId) => !playerLevels[playerId])) return null;

  return {
    firstDealPlayerId,
    playerLevels,
    aiDifficulty: normalizeAiDifficulty(aiDifficulty),
  };
}

/**
 * 作用：
 * 把 162 张唯一牌序映射成排列序号。
 *
 * 为什么这样写：
 * 旧方案把每张牌都写成一个字节，空间浪费比较大；
 * 现在改成排列压缩后，只要知道“这 162 张牌在所有可能顺序里排第几”，就能在保持可逆的前提下把开局码显著缩短。
 *
 * 输入：
 * @param {number[]} cardIndexes - 当前完整牌堆顺序对应的唯一牌编号流。
 *
 * 输出：
 * @returns {bigint|null} 当前牌序对应的排列序号；牌序非法时返回 `null`。
 *
 * 注意：
 * - 输入必须覆盖全部 162 张唯一牌，不能有重复或缺失。
 * - 这里的编号顺序必须继续复用 `getOpeningCodeCardIndex(...)` 的定义。
 */
function getOpeningCodePermutationRank(cardIndexes) {
  if (!Array.isArray(cardIndexes) || cardIndexes.length !== OPENING_CODE_CARD_COUNT) return null;

  const availableIndexes = Array.from({ length: OPENING_CODE_CARD_COUNT }, (_, index) => index);
  let rankValue = 0n;

  for (let index = 0; index < cardIndexes.length; index += 1) {
    const availableIndex = availableIndexes.indexOf(cardIndexes[index]);
    if (availableIndex < 0) return null;
    rankValue += BigInt(availableIndex) * OPENING_CODE_PERMUTATION_FACTORIALS[OPENING_CODE_CARD_COUNT - 1 - index];
    availableIndexes.splice(availableIndex, 1);
  }

  return rankValue;
}

/**
 * 作用：
 * 把排列序号还原成完整的 162 张牌编号顺序。
 *
 * 为什么这样写：
 * 只要能把排列序号稳定解回唯一牌编号流，就能进一步还原出完整牌堆、5 家手牌和逐张发牌过程；
 * 把 unrank 逻辑单独收口后，开局码解码器就能直接复用，不必再混杂在主流程里手写数组操作。
 *
 * 输入：
 * @param {bigint} rankValue - 当前开局码里拆出来的排列序号。
 *
 * 输出：
 * @returns {number[]|null} 还原后的 162 张牌编号顺序；序号越界时返回 `null`。
 *
 * 注意：
 * - 这里会完整还原全部 162 张牌，不只是 155 张发牌区。
 * - 阶乘表和牌编号总数必须和编码端完全一致，否则任何码都会解错。
 */
function decodeOpeningCodePermutationRank(rankValue) {
  if (
    typeof rankValue !== "bigint"
    || rankValue < 0n
    || rankValue >= OPENING_CODE_PERMUTATION_FACTORIALS[OPENING_CODE_CARD_COUNT]
  ) {
    return null;
  }

  const availableIndexes = Array.from({ length: OPENING_CODE_CARD_COUNT }, (_, index) => index);
  const cardIndexes = [];
  let remainingRank = rankValue;

  for (let remainingCount = OPENING_CODE_CARD_COUNT; remainingCount >= 1; remainingCount -= 1) {
    const factorialValue = OPENING_CODE_PERMUTATION_FACTORIALS[remainingCount - 1];
    const availableIndex = remainingCount === 1 ? 0 : Number(remainingRank / factorialValue);
    remainingRank = remainingCount === 1 ? 0n : (remainingRank % factorialValue);
    if (availableIndex < 0 || availableIndex >= availableIndexes.length) return null;
    cardIndexes.push(availableIndexes.splice(availableIndex, 1)[0]);
  }

  return cardIndexes;
}

/**
 * 作用：
 * 为压缩后的开局码 payload 生成短校验码。
 *
 * 为什么这样写：
 * 排列序号方案几乎任何合法字符组合都能解出一副牌，如果没有额外校验，用户手动少敲或敲错一位也可能“解出另一局”；
 * 补一段固定 3 位校验码后，大多数录入错误都能在进入牌局前被挡住。
 *
 * 输入：
 * @param {string} payloadCode - 已补齐长度的开局码主体。
 *
 * 输出：
 * @returns {string} 固定 3 位的校验码；输入为空时返回空串。
 *
 * 注意：
 * - 校验码只用于检错，不参与决定真实牌序。
 * - 这里必须基于补齐后的 payload 计算，不能对去前导零的版本做哈希。
 */
function buildOpeningCodeChecksum(payloadCode) {
  const normalizedPayload = normalizeOpeningCodeInput(payloadCode);
  if (!normalizedPayload) return "";
  const checksumValue = hashReplaySeedInput(normalizedPayload) % OPENING_CODE_CHECKSUM_SPACE;
  return encodeCompactReplayCodeValue(BigInt(checksumValue), OPENING_CODE_CHECKSUM_LENGTH);
}

/**
 * 作用：
 * 把当前牌局开局信息编码成更短的字母数字混合开局码。
 *
 * 为什么这样写：
 * 调试日志需要一个“足够短、能直接复制、能完整还原开局”的载体；
 * 这次改成“排列序号 + 元信息 + 校验码”的紧凑结构后，长度能从旧的 332 位明显缩短，同时继续完整复原整副牌顺序。
 *
 * 输入：
 * @param {Array<object>} deckCards - 本局完整牌堆顺序，长度必须为 162。
 * @param {{firstDealPlayerId?: number, playerLevels?: Record<number, string>, aiDifficulty?: string}} [options={}] - 开局元信息。
 *
 * 输出：
 * @returns {string} 当前牌局的开局码；输入无效时返回空串。
 *
 * 注意：
 * - 这里记录的是“完整发牌顺序”，而不是已经分好家的 5 份手牌。
 * - 当前版本固定为 `1`；因为这轮明确不做兼容旧格式，所以版本只保留在解码结果里，不再单独占字符。
 */
function buildOpeningCode(deckCards, options = {}) {
  const cards = Array.isArray(deckCards) ? deckCards : [];
  if (cards.length !== OPENING_CODE_CARD_COUNT) return "";

  const cardIndexes = cards.map((card) => getOpeningCodeCardIndex(card));
  if (cardIndexes.some((value) => value < 0) || new Set(cardIndexes).size !== OPENING_CODE_CARD_COUNT) return "";

  const permutationRank = getOpeningCodePermutationRank(cardIndexes);
  if (permutationRank == null) return "";

  const payloadValue = permutationRank * OPENING_CODE_META_SPACE + getOpeningCodeMetaValue(options);
  const payloadCode = encodeCompactReplayCodeValue(payloadValue, OPENING_CODE_PAYLOAD_FIXED_LENGTH);
  const checksumCode = buildOpeningCodeChecksum(payloadCode);
  if (!payloadCode || !checksumCode) return "";
  return `${payloadCode}${checksumCode}`;
}

/**
 * 作用：
 * 把字母数字混合开局码还原成可读的元信息和完整牌堆顺序。
 *
 * 为什么这样写：
 * 新编码已经不再是旧的逐字节 hex 文本，而是“payload + 校验码”的紧凑结构；
 * 提前把校验、元信息解包和排列反解统一落进共享层后，PC、手游 App 和 headless 回归都能直接共用同一套回放入口。
 *
 * 输入：
 * @param {string} openingCode - 日志中的开局码文本。
 *
 * 输出：
 * @returns {{version:number,firstDealPlayerId:number,playerLevels:Record<number,string>,aiDifficulty:string,deckCards:Array<object>}|null} 解码结果；文本非法时返回 `null`。
 *
 * 注意：
 * - 编码表区分大小写，调用前不能再做大写归一化。
 * - 解码前必须先校验末尾 3 位校验码，避免错码被误解成另一副合法牌序。
 */
function decodeOpeningCode(openingCode) {
  const normalizedCode = normalizeOpeningCodeInput(openingCode);
  if (!normalizedCode || normalizedCode.length <= OPENING_CODE_CHECKSUM_LENGTH || normalizedCode.length > OPENING_CODE_FIXED_LENGTH) {
    return null;
  }

  const payloadCode = normalizedCode
    .slice(0, normalizedCode.length - OPENING_CODE_CHECKSUM_LENGTH)
    .padStart(OPENING_CODE_PAYLOAD_FIXED_LENGTH, COMPACT_REPLAY_CODE_ALPHABET[0]);
  const checksumCode = normalizedCode.slice(-OPENING_CODE_CHECKSUM_LENGTH);
  if (payloadCode.length !== OPENING_CODE_PAYLOAD_FIXED_LENGTH) return null;
  if (buildOpeningCodeChecksum(payloadCode) !== checksumCode) return null;

  const payloadValue = decodeCompactReplayCodeValue(payloadCode);
  if (payloadValue == null || payloadValue < 0n) return null;

  const maxPayloadValue = OPENING_CODE_PERMUTATION_FACTORIALS[OPENING_CODE_CARD_COUNT] * OPENING_CODE_META_SPACE;
  if (payloadValue >= maxPayloadValue) return null;

  const metaValue = payloadValue % OPENING_CODE_META_SPACE;
  const permutationRank = payloadValue / OPENING_CODE_META_SPACE;
  const decodedMeta = decodeOpeningCodeMetaValue(metaValue);
  const cardIndexes = decodeOpeningCodePermutationRank(permutationRank);
  if (!decodedMeta || !cardIndexes || cardIndexes.length !== OPENING_CODE_CARD_COUNT) return null;

  const deckCards = cardIndexes.map((cardIndex) => createCardFromOpeningCodeIndex(cardIndex));
  if (deckCards.some((card) => !card)) return null;

  return {
    version: OPENING_CODE_VERSION,
    firstDealPlayerId: decodedMeta.firstDealPlayerId,
    playerLevels: decodedMeta.playerLevels,
    aiDifficulty: decodedMeta.aiDifficulty,
    deckCards,
  };
}

const CARD_SPRITE_RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CARD_SPRITE_SUIT_ROW = {
  hearts: 0,
  diamonds: 1,
  spades: 2,
  clubs: 3,
};
const CARD_SPRITE_JOKER_COLUMN = {
  RJ: 0,
  BJ: 1,
};

/**
 * 作用：
 * 把一张业务牌对象映射到整图牌面里的网格坐标。
 *
 * 为什么这样写：
 * `poker.png` 和 `m_cards_sprite.png` 都按固定行列排布成同一套 sprite 网格，不再是逐张单文件；
 * 先把“红桃 A 在第几格、黑桃 K 在第几格、大小王在哪两格”统一算出来，
 * UI 层才能稳定用同一张图裁出对应牌面。
 *
 * 输入：
 * @param {{suit?: string, rank?: string}} card - 当前要展示的牌对象。
 * @param {{columns: number, rows: number}|null} [spriteSheet=getCardFaceSpriteSheet()] - 当前牌面使用的 sprite 配置。
 *
 * 输出：
 * @returns {{column: number, row: number, xPercent: number, yPercent: number}|null} 当前牌在 sprite 中的位置；若当前牌或配置不支持 sprite，则返回 `null`。
 *
 * 注意：
 * - 普通牌按 `A,2,3...10,J,Q,K` 排列，不是按代码里的 `2...A`。
 * - 当前只映射正面牌；牌背仍由单独的 face-down 结构负责。
 */
function getCardSpriteSheetPosition(card, spriteSheet = getCardFaceSpriteSheet()) {
  if (!card || !spriteSheet?.columns || !spriteSheet?.rows) return null;

  let column = -1;
  let row = -1;

  if (card.suit === "joker") {
    column = CARD_SPRITE_JOKER_COLUMN[card.rank] ?? -1;
    row = spriteSheet.rows - 1;
  } else {
    column = CARD_SPRITE_RANK_ORDER.indexOf(card.rank);
    row = CARD_SPRITE_SUIT_ROW[card.suit] ?? -1;
  }

  if (column < 0 || row < 0) return null;

  return {
    column,
    row,
    xPercent: spriteSheet.columns === 1 ? 0 : (column / (spriteSheet.columns - 1)) * 100,
    yPercent: spriteSheet.rows === 1 ? 0 : (row / (spriteSheet.rows - 1)) * 100,
  };
}

// 随机打乱数组顺序。
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(getSharedRandomNumber() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 获取玩家等级。
function getPlayerLevel(playerId) {
  return state.playerLevels[playerId] || "2";
}

// 获取等级点数。
function getLevelRank(level) {
  if (level == null || level === "") return null;
  const normalized = String(level);
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

// 判断等级是否为负级。
function isNegativeLevel(level) {
  return typeof level === "string" && level.startsWith("-");
}

// 返回指定玩家当前的等级点数。
function getPlayerLevelRank(playerId) {
  return getLevelRank(getPlayerLevel(playerId));
}

// 返回当前这一局使用的等级点数。
function getCurrentLevelRank() {
  return getLevelRank(state.declaration?.rank || state.levelRank || null);
}

/**
 * 作用：
 * 按结算给出的升级步数推进玩家等级。
 *
 * 为什么这样写：
 * 负级现在已经扩成 `-2 ... -K` 的完整链路，升级时既要能在负级区间里一档一档往上走，
 * 也要继续保留正级里的“必打级不可在一次结算里被跳过”规则；
 * 统一在这里收口后，打家、闲家和结果页都能共用同一套等级推进口径。
 *
 * 输入：
 * @param {string} rank - 当前玩家等级文本。
 * @param {number} delta - 本次结算希望前进的级数。
 *
 * 输出：
 * @returns {string} 结算后应落到的等级文本。
 *
 * 注意：
 * - 负级打回正级时，一次结算最多只会回到 `2`，不会继续顺带跳到更高正级。
 * - 正级仍要遵守 `5 / 10 / J / Q / K / A` 的必打级停靠规则。
 */
function shiftLevel(rank, delta) {
  let current = LEVEL_ORDER.includes(rank) ? rank : "2";
  for (let i = 0; i < delta; i += 1) {
    if (isNegativeLevel(current)) {
      const negativeIndex = NEGATIVE_LEVELS.indexOf(current);
      if (negativeIndex >= 0 && negativeIndex < NEGATIVE_LEVELS.length - 1) {
        current = NEGATIVE_LEVELS[negativeIndex + 1];
        continue;
      }
      current = "2";
      break;
    }
    const currentIndex = RANKS.indexOf(current);
    if (currentIndex < 0 || currentIndex >= RANKS.length - 1) {
      return "A";
    }
    current = RANKS[currentIndex + 1];
    if (!isNegativeLevel(current) && MANDATORY_LEVELS.has(current)) {
      break;
    }
  }
  return current;
}

// 返回降级规则使用的兜底映射。
function getPenaltyFallbackMap(mode = "trump") {
  if (mode === "vice") return VICE_PENALTY_LEVEL_FALLBACK;
  return TRUMP_PENALTY_LEVEL_FALLBACK;
}

/**
 * 作用：
 * 按级牌扣底等惩罚规则降低玩家等级。
 *
 * 为什么这样写：
 * 当前规则同时存在两套要求：
 * 1. `J / Q / K / A` 都要继续走主扣 / 副扣的特殊回退锚点；
 * 2. `2` 再被级牌扣底时，要进入 `-A -> -K -> -Q -> -J -> -10 ... -> -2` 的完整负级链；
 * 这里把两条口径放进同一套循环里，既能兼容面牌回退规则，也能让新的负级链稳定生效。
 *
 * 输入：
 * @param {string} rank - 当前玩家等级文本。
 * @param {number} [steps=1] - 本次惩罚总共需要降低的步数。
 * @param {"trump"|"vice"} [mode="trump"] - 当前惩罚属于主扣还是副扣。
 *
 * 输出：
 * @returns {string} 惩罚执行后的等级文本。
 *
 * 注意：
 * - `-2` 仍然是最低档，继续降级时必须原地停留。
 * - `A` 本身仍先按主扣 / 副扣回退到 `Q / K`，只有 `2` 再被扣时才进入负级链。
 */
function dropLevel(rank, steps = 1, mode = "trump") {
  let current = LEVEL_ORDER.includes(rank) ? rank : "2";
  const fallbackMap = getPenaltyFallbackMap(mode);
  const highestNegativeLevel = NEGATIVE_LEVELS[NEGATIVE_LEVELS.length - 1] || "-2";
  for (let i = 0; i < steps; i += 1) {
    if (current === "-2") {
      current = "-2";
      continue;
    }
    if (isNegativeLevel(current)) {
      const negativeIndex = NEGATIVE_LEVELS.indexOf(current);
      current = negativeIndex <= 0 ? "-2" : NEGATIVE_LEVELS[negativeIndex - 1];
      continue;
    }
    if (!RANKS.includes(current)) {
      current = "2";
      continue;
    }
    if (fallbackMap[current]) {
      current = fallbackMap[current];
      continue;
    }
    current = current === "2" ? highestNegativeLevel : RANKS[Math.max(0, RANKS.indexOf(current) - 1)];
  }
  return current;
}

// 同步玩家等级进度。
function syncPlayerLevels() {
  for (const player of state.players) {
    player.level = getPlayerLevel(player.id);
  }
}

// 按展示规则对手牌排序。
function sortHand(hand) {
  return [...hand].sort((a, b) => {
    return compareHandCardsForDisplay(a, b);
  });
}

// 返回手牌分组时的花色顺序。
function groupOrder(card) {
  if (isTrump(card)) return 4;
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

// 获取显示花色顺序。
function getDisplaySuitOrder(card) {
  const activeTrumpSuit = getActiveTrumpSuit();
  if (card.suit === "joker") return 5;
  if (isTrump(card) && getCurrentLevelRank() && card.rank === getCurrentLevelRank()) {
    if (activeTrumpSuit && card.suit === activeTrumpSuit) return -1;
  }
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

// 比较手牌显示顺序。
function compareHandCardsForDisplay(a, b) {
  const groupDiff = groupOrder(a) - groupOrder(b);
  if (groupDiff !== 0) return groupDiff;

  const strengthDiff = cardStrength(b) - cardStrength(a);
  if (strengthDiff !== 0) return strengthDiff;

  const suitDiff = getDisplaySuitOrder(a) - getDisplaySuitOrder(b);
  if (suitDiff !== 0) return suitDiff;

  return (a.deckIndex ?? 0) - (b.deckIndex ?? 0);
}

// 获取当前生效的主牌花色。
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

// 判断是否主牌。
function isTrump(card) {
  const currentLevelRank = getCurrentLevelRank();
  const activeTrumpSuit = getActiveTrumpSuit();
  return card.suit === "joker" || (currentLevelRank && card.rank === currentLevelRank) || (activeTrumpSuit ? card.suit === activeTrumpSuit : false);
}

// 返回牌在当前规则下的实际花色。
function effectiveSuit(card) {
  return isTrump(card) ? "trump" : card.suit;
}

// 返回主牌体系下的点数序位。
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

// 计算单张牌在牌型比较中的强度。
function getPatternUnitPower(card, suit = effectiveSuit(card)) {
  return suit === "trump" ? getTrumpRankIndex(card) : getNonTrumpRankIndex(card.rank);
}

// 计算单张牌的基础强度。
function cardStrength(card) {
  const suit = effectiveSuit(card);
  return (suit === "trump" ? 500 : 100) + getPatternUnitPower(card, suit);
}

// 返回牌面的分值。
function scoreValue(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

/**
 * 作用：
 * 计算一组牌里的总分牌分值。
 *
 * 为什么这样写：
 * 扣底上限、底牌展示和结算都依赖同一套分值口径，集中到一个函数里可以避免多处重复累加时出现规则偏差。
 *
 * 输入：
 * @param {Array<{rank: string}>} cards - 需要统计分值的一组牌
 *
 * 输出：
 * @returns {number} 这组牌按 5/10/K 规则累计后的总分
 *
 * 注意：
 * - 传入空数组或非数组时按 0 分处理
 * - 这里返回的是原始分值，不包含扣底翻倍或封顶逻辑
 */
function getCardsPointTotal(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + scoreValue(card), 0);
}

// 选出一组牌里最小的那张。
function lowestCard(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b))[0];
}

// 查找对子。
function findPairs(cards) {
  return findTuples(cards, 2);
}

// 判断是否存在必须跟出的对子。
function hasForcedPair(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()].some((count) => count === 2 || count >= 4);
}

// 获取牌分组数量。
function getCardGroupCounts(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()];
}

// 拆出必须跟出的对子单元。
function getForcedPairUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => {
    if (count < 2 || count === 3) return sum;
    return sum + Math.floor(count / 2);
  }, 0);
}

// 拆出三张组。
function getTripleUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => sum + Math.floor(count / 3), 0);
}

// 在保留三张组后拆出必须跟出的对子。
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

// 按计数结果生成对子单元。
function getPairUnitsFromCount(count) {
  if (count < 2 || count === 3) return 0;
  return Math.floor(count / 2);
}

// 查找刻子。
function findTriples(cards) {
  return findTuples(cards, 3);
}

// 查找同张组合。
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

// 返回副牌体系下的点数序位。
function getNonTrumpRankIndex(rank) {
  const currentLevelRank = getCurrentLevelRank();
  const ranks = RANKS.filter((item) => item !== currentLevelRank);
  return ranks.indexOf(rank);
}

// 判断是否精确刻子。
function isExactTriple(cards) {
  return cards.length === 3
    && cards.every((card) => card.rank === cards[0].rank && card.suit === cards[0].suit);
}

// 查找连续同张组合。
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
  const resultPowers = [];
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
            const comboEntries = run.slice(j, j + exactChainLength);
            results.push(comboEntries.flatMap((entry) => entry.cards));
            resultPowers.push(comboEntries[comboEntries.length - 1].index);
          }
        } else {
          results.push(run.flatMap((entry) => entry.cards));
          resultPowers.push(run[run.length - 1].index);
        }
      }
      runStart = i;
    }
  }

  return results
    .map((combo, index) => ({ combo, power: resultPowers[index] ?? -1 }))
    .sort((a, b) => a.power - b.power)
    .map((entry) => entry.combo);
}

// 判断一组牌是否属于同一实际花色。
function isSameSuitSet(cards) {
  if (cards.length === 0) return false;
  const suit = effectiveSuit(cards[0]);
  return cards.every((card) => effectiveSuit(card) === suit);
}

// 从牌组里移除已选中的牌。
function removePickedCards(cards, pickedCards) {
  const remaining = [...cards];
  for (const picked of pickedCards) {
    const index = remaining.findIndex((card) => card.id === picked.id);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

// 生成甩牌拆解搜索键。
function getThrowSearchKey(cards) {
  const counts = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join("|");
}

// 返回甩牌组件类型的比较权重。
function getThrowComponentTypeWeight(component) {
  const typeOrder = {
    single: 0,
    pair: 1,
    triple: 2,
    tractor: 3,
    train: 4,
    bulldozer: 5,
  };
  return typeOrder[component?.type] ?? -1;
}

// 比较两个甩牌组件的强弱。
function compareThrowComponentStrength(a, b) {
  const typeDiff = getThrowComponentTypeWeight(a) - getThrowComponentTypeWeight(b);
  if (typeDiff !== 0) return typeDiff;
  if ((a.count ?? 0) !== (b.count ?? 0)) return (a.count ?? 0) - (b.count ?? 0);
  if ((a.chainLength ?? 0) !== (b.chainLength ?? 0)) return (a.chainLength ?? 0) - (b.chainLength ?? 0);
  return (a.power ?? 0) - (b.power ?? 0);
}

// 构建甩牌组成部分。
function buildThrowComponent(componentCards) {
  const pattern = classifyPlay(componentCards);
  if (!pattern.ok || pattern.type === "throw" || pattern.type === "invalid") return null;
  return {
    ...pattern,
    cards: sortPlayedCards(componentCards),
  };
}

// 获取甩牌候选项组成部分。
function getThrowCandidateComponents(cards) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (componentCards) => {
    const component = buildThrowComponent(componentCards);
    if (!component) return;
    const key = component.cards.map((card) => card.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(component);
  };

  for (const combo of findSerialTuples(cards, 3)) addCandidate(combo);
  for (const combo of findSerialTuples(cards, 2)) addCandidate(combo);
  for (const combo of findTriples(cards)) addCandidate(combo);
  for (const combo of findPairs(cards)) addCandidate(combo);

  const groups = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  for (const group of groups.values()) {
    addCandidate([group[0]]);
  }

  return candidates.sort((a, b) => compareThrowComponentStrength(b, a));
}

// 比较两种甩牌拆解方案的优先级。
function compareThrowDecomposition(a, b) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;

  const singleCountA = a.filter((component) => component.type === "single").length;
  const singleCountB = b.filter((component) => component.type === "single").length;
  if (singleCountA !== singleCountB) return singleCountB - singleCountA;

  if (a.length !== b.length) return b.length - a.length;

  const sortedA = [...a].sort(compareThrowComponentStrength);
  const sortedB = [...b].sort(compareThrowComponentStrength);
  for (let i = 0; i < Math.min(sortedA.length, sortedB.length); i += 1) {
    const diff = compareThrowComponentStrength(sortedA[i], sortedB[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

// 搜索最优的甩牌拆解方案。
function searchBestThrowDecomposition(cards, memo = new Map()) {
  if (cards.length === 0) return [];
  const key = getThrowSearchKey(cards);
  if (memo.has(key)) return memo.get(key);

  let best = null;
  const candidates = getThrowCandidateComponents(cards);
  for (const component of candidates) {
    const remaining = removePickedCards(cards, component.cards);
    const rest = searchBestThrowDecomposition(remaining, memo);
    if (!rest) continue;
    const attempt = [component, ...rest];
    if (compareThrowDecomposition(attempt, best) > 0) {
      best = attempt;
    }
  }

  memo.set(key, best);
  return best;
}

// 将甩牌拆成可比较的组件。
function decomposeThrowComponents(cards) {
  if (!isSameSuitSet(cards)) return null;
  const components = searchBestThrowDecomposition(
    [...cards].sort((a, b) => cardStrength(b) - cardStrength(a))
  );
  if (!components) return null;
  return components.every((component) => component.ok) ? components : null;
}

// 判断是否连续同张组合出牌。
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

// 识别出牌。
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
      type: chainLength >= 3 ? "train" : "tractor",
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

/**
 * 作用：
 * 根据一手合法末手牌型，返回扣底计分所需的倍数和说明标签。
 *
 * 为什么这样写：
 * 扣底结算、日志文案和测试都需要共用同一套倍率口径；把倍率规则集中在这里可以避免不同入口各自维护一套分支逻辑。
 *
 * 输入：
 * @param {{ok?: boolean, type?: string, chainLength?: number, components?: Array<object>}} pattern - 已识别出的出牌牌型
 *
 * 输出：
 * @returns {{multiplier: number, label: string}} 当前牌型对应的扣底倍数和展示标签
 *
 * 注意：
 * - 非法牌型或缺失牌型一律按单扣 `x2` 兜底
 * - 甩牌按组件中“倍率最大的合法组合”计分；如果倍率相同，优先保留更强的大组件标签
 */
function getBottomScoreInfoFromPattern(pattern) {
  if (!pattern?.ok) {
    return {
      multiplier: 2,
      label: TEXT.rules.bottomScoreLabels.single,
    };
  }

  if (pattern.type === "throw" && Array.isArray(pattern.components) && pattern.components.length > 0) {
    const bestComponent = pattern.components
      .map((component) => getBottomScoreInfoFromPattern(component))
      .reduce((best, current) => {
        if (!best || current.multiplier > best.multiplier) return current;
        return best;
      }, null);
    if (bestComponent) {
      return {
        multiplier: bestComponent.multiplier,
        label: `${TEXT.rules.bottomScoreLabels.throw}（按${bestComponent.label}）`,
      };
    }
  }

  if (pattern.type === "pair") {
    return {
      multiplier: 4,
      label: TEXT.rules.bottomScoreLabels.pair,
    };
  }
  if (pattern.type === "triple") {
    return {
      multiplier: 6,
      label: TEXT.rules.bottomScoreLabels.triple,
    };
  }
  if (pattern.type === "tractor") {
    return {
      multiplier: 2 * (2 ** Math.max(1, pattern.chainLength || 0)),
      label: TEXT.rules.bottomScoreLabels.tractor,
    };
  }
  if (pattern.type === "train") {
    return {
      multiplier: 2 * (2 ** Math.max(1, pattern.chainLength || 0)),
      label: TEXT.rules.bottomScoreLabels.train,
    };
  }
  if (pattern.type === "bulldozer") {
    return {
      multiplier: 2 * (3 ** Math.max(1, pattern.chainLength || 0)),
      label: TEXT.rules.bottomScoreLabels.bulldozer,
    };
  }
  return {
    multiplier: 2,
    label: TEXT.rules.bottomScoreLabels.single,
  };
}

/**
 * 作用：
 * 直接根据实际出的牌，返回扣底计分用的倍数信息。
 *
 * 为什么这样写：
 * 结算阶段通常拿到的是最后获胜那手的牌本身，而不是预先缓存好的牌型对象；这里做一层轻包装，可以让调用方不用重复 `classifyPlay`。
 *
 * 输入：
 * @param {Array<object>} cards - 最后一手获胜牌型的实际牌列表
 *
 * 输出：
 * @returns {{multiplier: number, label: string}} 这手牌用于扣底计分的倍率信息
 *
 * 注意：
 * - 仅用于“最后一手已确认合法”的场景
 * - 甩牌内部会自动递归分析其组成部分
 */
function getBottomScoreInfo(cards) {
  return getBottomScoreInfoFromPattern(classifyPlay(cards));
}

// 返回甩牌组件的形状描述。
function getThrowComponentShape(component) {
  if (!component) return "";
  return `${component.type}:${component.chainLength || 0}:${component.count || 0}`;
}

// 生成甩牌形状签名。
function getThrowShapeSignature(pattern) {
  if (!pattern || pattern.type !== "throw" || !Array.isArray(pattern.components)) return "";
  return [...pattern.components]
    .map(getThrowComponentShape)
    .sort()
    .join("|");
}

// 判断牌型是否匹配指定甩牌形状。
function matchesThrowShape(pattern, leadSpec) {
  return getThrowShapeSignature(pattern) !== "" && getThrowShapeSignature(pattern) === getThrowShapeSignature(leadSpec);
}

// 判断牌型是否符合首发牌型要求。
function matchesLeadPattern(pattern, leadSpec) {
  if (!pattern?.ok || !leadSpec) return false;
  if (pattern.count !== leadSpec.count) return false;
  if (pattern.type !== leadSpec.type) return false;
  if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") {
    return pattern.chainLength === leadSpec.chainLength;
  }
  if (pattern.type === "throw") {
    return matchesThrowShape(pattern, leadSpec);
  }
  return true;
}

// 判断手牌里是否存在匹配的牌型。
function hasMatchingPattern(cards, leadSpec) {
  if (!leadSpec) return false;
  if (leadSpec.type === "single") return cards.length >= 1;
  if (leadSpec.type === "pair") return findPairs(cards).length > 0;
  if (leadSpec.type === "triple") return findTriples(cards).length > 0;
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "train") return (leadSpec.chainLength || 0) >= 3
    && findSerialTuples(cards, 2, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "throw") return getPatternCombos(cards, leadSpec).length > 0;
  return false;
}

// 枚举符合条件的牌型组合。
function getPatternCombos(cards, leadSpec) {
  if (!leadSpec) return [];
  if (leadSpec.type === "single") return cards.map((card) => [card]).sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  if (leadSpec.type === "pair") return findPairs(cards);
  if (leadSpec.type === "triple") return findTriples(cards);
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength);
  if (leadSpec.type === "train") {
    if ((leadSpec.chainLength || 0) < 3) return [];
    return findSerialTuples(cards, 2, leadSpec.chainLength);
  }
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength);
  if (leadSpec.type === "throw") {
    return enumerateCombinations(cards, leadSpec.count)
      .filter((combo) => {
        if (!isSameSuitSet(combo)) return false;
        const pattern = classifyPlay(combo);
        return pattern.ok && pattern.type === "throw" && matchesThrowShape(pattern, leadSpec);
      })
      .sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  }
  return [];
}

/**
 * 作用：
 * 估算 `n 选 k` 的组合数量，供 AI 跟牌枚举决定是否值得完整扫描。
 *
 * 为什么这样写：
 * 旧实现只用固定上限截断组合搜索，导致像“12 张主牌里找 4 张合法主拖拉机”这类
 * 实际规模不大、但合法解排位偏后的场景被误判成“没有合法候选”。
 * 先把组合规模估算集中成 helper，候选层才能统一判断该全扫还是保守截断。
 *
 * 输入：
 * @param {number} cardCount - 当前待选牌池总张数。
 * @param {number} pickCount - 本次需要从牌池里取出的张数。
 *
 * 输出：
 * @returns {number} 估算得到的组合数；无效输入时返回 `0`。
 *
 * 注意：
 * - 这里只用于决定搜索预算，不要求支持极大整数精度。
 * - 当 `pickCount` 超过 `cardCount` 时，必须返回 `0`。
 */
function estimateCombinationCount(cardCount, pickCount) {
  if (!Number.isInteger(cardCount) || !Number.isInteger(pickCount) || cardCount < 0 || pickCount < 0) return 0;
  if (pickCount > cardCount) return 0;
  if (pickCount === 0 || pickCount === cardCount) return 1;

  const normalizedPickCount = Math.min(pickCount, cardCount - pickCount);
  let result = 1;
  for (let index = 1; index <= normalizedPickCount; index += 1) {
    result = (result * (cardCount - normalizedPickCount + index)) / index;
  }
  return Math.round(result);
}

/**
 * 作用：
 * 为组合枚举计算一个按牌池规模动态放宽的扫描上限。
 *
 * 为什么这样写：
 * 固定 `240 / 360 / 520` 的组合上限对大多数局面够快，但会把部分“规模并不大”的合法跟牌漏掉。
 * 这里把“小空间直接全扫，大空间保留上限保护”的策略统一起来，避免 AI 因为搜索预算过紧而卡回合。
 *
 * 输入：
 * @param {number} cardCount - 当前待选牌池总张数。
 * @param {number} pickCount - 本次需要取出的张数。
 * @param {number} [minimumLimit=0] - 调用方要求的最低扫描预算。
 *
 * 输出：
 * @returns {number} 本次组合枚举允许返回的最大组合数。
 *
 * 注意：
 * - 小规模空间优先完整扫描，保证合法候选不会被过早截断。
 * - 大规模空间仍保留保护上限，避免跟牌搜索拖慢整局节奏。
 */
function getCombinationEnumerationLimit(cardCount, pickCount, minimumLimit = 0) {
  const fallbackLimit = pickCount <= 4 ? 240 : pickCount <= 6 ? 360 : 520;
  const guaranteedLimit = pickCount <= 4 ? 1200 : pickCount <= 6 ? 1800 : 2400;
  const estimatedCount = estimateCombinationCount(cardCount, pickCount);
  const requestedLimit = Math.max(fallbackLimit, minimumLimit || 0);
  if (estimatedCount <= 0) return requestedLimit;
  return Math.min(estimatedCount, Math.max(requestedLimit, guaranteedLimit));
}

/**
 * 作用：
 * 枚举指定牌池里的所有候选组合，并支持调用方覆盖默认上限。
 *
 * 为什么这样写：
 * 规则层、候选层和紧急兜底都要复用同一套组合搜索；
 * 给它增加可配置上限后，调用方就能按局面规模决定“扫多少”而不必各自复制递归逻辑。
 *
 * 输入：
 * @param {Array<object>} cards - 当前参与组合搜索的牌池。
 * @param {number} count - 每个候选组合需要包含的张数。
 * @param {number|null} [limitOverride=null] - 可选的搜索上限；未传时沿用默认保护上限。
 *
 * 输出：
 * @returns {Array<Array<object>>} 返回按搜索顺序收集到的候选组合列表。
 *
 * 注意：
 * - 该函数只负责组合枚举，不负责合法性校验。
 * - `limitOverride` 只影响“最多保留多少个组合”，不会改变枚举顺序。
 */
function enumerateCombinations(cards, count, limitOverride = null) {
  const results = [];
  const current = [];
  const limit = Number.isFinite(limitOverride) && limitOverride > 0
    ? Math.floor(limitOverride)
    : getCombinationEnumerationLimit(cards.length, count);

  // 递归遍历组合搜索的下一层分支。
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

// 比较同类型出牌的强弱。
function compareSameTypePlay(candidatePattern, currentPattern, leadSuit) {
  if (candidatePattern.type === "throw" && currentPattern.type === "throw") {
    const candidateComponents = [...candidatePattern.components].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    const currentComponents = [...currentPattern.components].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    for (let i = 0; i < Math.min(candidateComponents.length, currentComponents.length); i += 1) {
      const diff = compareSameTypePlay(candidateComponents[i], currentComponents[i], leadSuit);
      if (diff !== 0) return diff;
    }
    return 0;
  }
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

// 比较牌型组件的规模。
function compareComponentSize(a, b) {
  if ((a.power ?? 0) !== (b.power ?? 0)) return (a.power ?? 0) - (b.power ?? 0);
  if ((a.count ?? 0) !== (b.count ?? 0)) return (a.count ?? 0) - (b.count ?? 0);
  const typeOrder = { single: 0, pair: 1, triple: 2, tractor: 3, train: 4, bulldozer: 5 };
  return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
}

// 判断手牌里是否还有更强的同类牌型。
function handHasStrongerPattern(hand, targetPattern) {
  const suited = hand.filter((card) => effectiveSuit(card) === targetPattern.suit);
  const combos = getPatternCombos(suited, targetPattern);
  return combos.some((combo) => {
    const candidate = classifyPlay(combo);
    return compareSameTypePlay(candidate, targetPattern, targetPattern.suit) > 0;
  });
}

// 获取甩牌失败情况。
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

// 应用甩牌失败惩罚。
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

// 获取甩牌惩罚摘要。
function getThrowPenaltySummary(playerId, penalty) {
  return isDefenderTeam(playerId)
    ? TEXT.rules.throwPenaltySummaryDefender(penalty)
    : TEXT.rules.throwPenaltySummaryBanker(penalty);
}

// 校验选牌。
function validateSelection(playerId, cards) {
  const player = getPlayer(playerId);
  if (!player || cards.length === 0) {
    return { ok: false, reason: TEXT.rules.validation.selectCards };
  }
  const pattern = classifyPlay(cards);

  if (state.currentTrick.length === 0) {
    if (pattern.ok) return { ok: true };
    return { ok: false, reason: TEXT.rules.validation.leadSupported };
  }

  if (cards.length !== state.leadSpec.count) {
    return { ok: false, reason: TEXT.rules.validation.followCount(state.leadSpec.count) };
  }

  const suited = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length >= state.leadSpec.count) {
    if (!cards.every((card) => effectiveSuit(card) === state.leadSpec.suit)) {
      return { ok: false, reason: TEXT.rules.validation.sameSuitFirst };
    }

    if (state.leadSpec.type === "pair") {
      if (hasForcedPair(suited) && pattern.type !== "pair") {
        return { ok: false, reason: TEXT.rules.validation.pairMustFollow };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "triple") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.tripleMustFollow };
        }
        return { ok: true };
      }

      if (hasForcedPair(suited) && getForcedPairUnits(cards) < 1) {
        return { ok: false, reason: TEXT.rules.validation.tripleFollowPair };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.trainMustFollow };
        }
        return { ok: true };
      }

      const requiredPairs = Math.min(state.leadSpec.chainLength || 0, getForcedPairUnits(suited));
      if (requiredPairs > 0 && getForcedPairUnits(cards) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.trainFollowPairs };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "bulldozer") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.bulldozerMustFollow };
        }
        return { ok: true };
      }

      const requiredTriples = Math.min(state.leadSpec.chainLength || 0, getTripleUnits(suited));
      if (requiredTriples > 0 && getTripleUnits(cards) < requiredTriples) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerTriples };
      }

      const requiredPairs = Math.min(2, getForcedPairUnitsWithReservedTriples(suited, requiredTriples));
      if (requiredPairs > 0 && getForcedPairUnitsWithReservedTriples(cards, requiredTriples) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerPairs };
      }
      return { ok: true };
    }

    if (hasMatchingPattern(suited, state.leadSpec) && !matchesLeadPattern(pattern, state.leadSpec)) {
      return { ok: false, reason: TEXT.rules.validation.samePattern };
    }
    return { ok: true };
  }

  if (suited.length > 0) {
    const suitedIds = new Set(suited.map((card) => card.id));
    const selectedSuitedCount = cards.filter((card) => suitedIds.has(card.id)).length;
    if (selectedSuitedCount !== suited.length) {
      return { ok: false, reason: TEXT.rules.validation.exhaustSuit };
    }
    return { ok: true };
  }

  return { ok: true };
}

// 判断是否精确对子。
function isExactPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank && cards[0].suit === cards[1].suit;
}

// 比较单张。
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

/**
 * 作用：
 * 判断一张级牌在当前局面下，是否属于“级牌扣底”的有效级牌，并返回对应的降级模式。
 *
 * 为什么这样写：
 * 现在规则已经拆成“普通扣底 / 级牌扣底”两套口径：
 * 普通级别下，花色主只认主级牌、无主时所有副级牌都可扣；
 * 特殊级 `J / Q / K / A` 下，主级牌和副级牌都能触发级牌扣底。
 * 这层判断集中在一起后，结算、日志和测试都能复用同一套业务口径。
 *
 * 输入：
 * @param {{suit: string, rank: string} | null} card - 末手制胜牌型里的一张牌
 *
 * 输出：
 * @returns {"trump" | "vice" | null} 该牌命中的级牌扣底模式；不命中时返回 `null`
 *
 * 注意：
 * - 大小王不是有效级牌，这里一律返回 `null`
 * - 普通级别花色主下只认主级牌
 * - 无主时没有主级牌，所有级牌都按副级牌扣底处理
 */
function getBottomPenaltyModeForCard(card) {
  const currentLevelRank = getCurrentLevelRank();
  if (!card || !currentLevelRank || card.suit === "joker") return null;
  if (card.rank !== currentLevelRank) return null;
  if (state.trumpSuit === "notrump") return "vice";
  if (FACE_CARD_LEVELS.has(currentLevelRank)) {
    return card.suit === state.trumpSuit ? "trump" : "vice";
  }
  return card.suit === state.trumpSuit ? "trump" : null;
}

/**
 * 作用：
 * 取出一手末手牌型里真正决定“本轮最大牌”的那一组牌。
 *
 * 为什么这样写：
 * 新规则要求只有当大小王进入“本轮决定大小的最大同型牌组”时，
 * 才把这次扣底按普通扣底处理；散王或未参与最终比大小的王不应该挡掉级牌扣底。
 * 因此这里要先从实际牌型里提取“最后比大小看的是哪一组牌”。
 *
 * 输入：
 * @param {Array<object>} cards - 末手赢家实际打出的牌
 * @param {{ok?: boolean, type?: string}|null} pattern - 这手牌对应的已识别牌型
 *
 * 输出：
 * @returns {Array<object>} 真正决定本轮大小的最大同型牌组；无法识别时返回空数组
 *
 * 注意：
 * - 单张 / 对子 / 刻子本身就是决定大小的整组牌
 * - 连组牌型只看最高那一组对子/刻子
 * - 甩牌不参与级牌扣底判定，因此这里返回空数组
 */
function getBottomWinningGroup(cards, pattern) {
  if (!pattern?.ok) return [];
  if (pattern.type === "single" || pattern.type === "pair" || pattern.type === "triple") {
    return [...cards];
  }
  if (pattern.type === "tractor" || pattern.type === "train") {
    const pairs = findPairs(cards);
    return pairs.length > 0 ? pairs[pairs.length - 1] : [];
  }
  if (pattern.type === "bulldozer") {
    const triples = findTriples(cards);
    return triples.length > 0 ? triples[triples.length - 1] : [];
  }
  return [];
}

/**
 * 作用：
 * 判断这次末手牌型是否因为“最大同型牌组里含王”而只能算普通扣底。
 *
 * 为什么这样写：
 * 规则里真正会挡掉级牌扣底的，不是“这手牌里出现过王”，
 * 而是“决定本轮大小的那组最大牌本身就是王张”；
 * 把这个判断单独抽出来后，像“对主2大过散王”这种边界场景就能稳定表达。
 *
 * 输入：
 * @param {Array<object>} winningGroup - `getBottomWinningGroup` 返回的最大同型牌组
 *
 * 输出：
 * @returns {boolean} 若该最大牌组里含王，则返回 `true`
 *
 * 注意：
 * - 空数组按 `false` 处理，交由上层继续按其它条件兜底
 * - 这里只看最大同型牌组，不扫描整手其它非决定性组件
 */
function isBottomPenaltyBlockedByJokers(winningGroup) {
  return Array.isArray(winningGroup) && winningGroup.some((card) => card?.suit === "joker");
}

/**
 * 作用：
 * 根据扣底模式和牌型类型，生成结算与日志使用的级牌扣底标签。
 *
 * 为什么这样写：
 * 日志和结算文案都要复用同一套级牌扣底标签；
 * 这里统一收口后，即使未来规则调整，也不用在多个入口分别改字符串。
 *
 * 输入：
 * @param {"trump" | "vice"} mode - 当前级牌扣底对应的模式
 * @param {string} type - 当前末手牌型类型
 *
 * 输出：
 * @returns {string} 对应的级牌扣底说明文案
 *
 * 注意：
 * - 传入未知模式或未知牌型时会回退为空字符串，调用方应自行兜底
 * - 这里不负责计算降级数，只负责标签
 */
function getBottomPenaltyLabel(mode, type) {
  return TEXT.rules.bottomPenaltyLabels[mode]?.[type] || "";
}

/**
 * 作用：
 * 计算某个当前等级在级牌扣底时，真正需要执行的降级步数。
 *
 * 为什么这样写：
 * 对 `J / Q / K / A` 这类有特殊回退锚点的等级，多张级牌扣底需要先回退到锚点，再继续按牌型级数向下扣；
 * 否则高等级在多张成功扣底时会少算一步，导致结算结果与当前等级回退规则不一致。
 *
 * 输入：
 * @param {string} rank - 打家当前等级
 * @param {{levels?: number, mode?: string} | null} penalty - 当前级牌扣底信息
 *
 * 输出：
 * @returns {number} 最终应传给降级函数的总步数
 *
 * 注意：
 * - 只在存在特殊回退锚点且牌型不是单张时额外补 1 步
 * - 普通等级或单张级牌扣底保持现有降级步数不变
 */
function getBottomPenaltyDropSteps(rank, penalty) {
  const baseLevels = Math.max(0, penalty?.levels || 0);
  if (baseLevels <= 1) return baseLevels;
  const fallbackMap = getPenaltyFallbackMap(penalty?.mode || "trump");
  return fallbackMap[rank] ? baseLevels + 1 : baseLevels;
}

// 获取级牌扣底惩罚。
function getBottomPenalty() {
  if (!state.lastTrick || !isDefenderTeam(state.lastTrick.winnerId)) return null;

  const winningPlay = state.lastTrick.plays.find((play) => play.playerId === state.lastTrick.winnerId);
  if (!winningPlay || winningPlay.cards.length === 0) return null;
  const pattern = classifyPlay(winningPlay.cards);
  if (!pattern.ok) return null;
  const winningGroup = getBottomWinningGroup(winningPlay.cards, pattern);
  if (isBottomPenaltyBlockedByJokers(winningGroup)) return null;

  const penaltyModes = winningPlay.cards
    .map((card) => getBottomPenaltyModeForCard(card))
    .filter(Boolean);
  if (penaltyModes.length === 0) return null;
  const mode = penaltyModes.includes("trump") ? "trump" : "vice";

  const penaltyByType = {
    single: { levels: 1 },
    pair: { levels: 2 },
    triple: { levels: 3 },
    tractor: { levels: 4 },
    train: { levels: 6 },
    bulldozer: { levels: 6 },
  };
  const penalty = penaltyByType[pattern.type];
  if (!penalty) return null;

  return {
    levels: penalty.levels,
    label: getBottomPenaltyLabel(mode, pattern.type),
    winnerId: state.lastTrick.winnerId,
    mode,
    kind: "grade",
  };
}

// 获取扣底结果摘要。
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
