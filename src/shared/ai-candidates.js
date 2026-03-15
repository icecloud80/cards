function createCandidateEntry(cards, source, tags = []) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  if (cards.some((card) => !card || !card.id)) return null;
  return {
    cards,
    source,
    tags: [...tags],
  };
}

function dedupeCandidateEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return false;
    if (entry.cards.some((card) => !card || !card.id)) return false;
    const key = getComboKey(entry.cards);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 作用：
 * 在候选层需要复用旧 helper 时，按需把某个 sourceState 临时映射到全局 state 上执行。
 *
 * 为什么这样写：
 * 当前候选生成正在从全局 state 迁移到显式 sourceState 入参。
 * 这层适配器只包住还没完成迁移的 legacy helper，避免整个候选构建流程都隐式依赖 live state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {Function} builder - 需要在该状态下执行的旧 helper。
 *
 * 输出：
 * @returns {*} 返回 builder 在对应状态下的执行结果。
 *
 * 注意：
 * - `builder` 仍可能读取全局 `state`，因此只应包裹尚未迁移的旧逻辑。
 * - 不要把整个候选生成过程都继续塞进这层适配器里，否则解耦没有意义。
 */
function runCandidateLegacyHelper(sourceState, builder) {
  if (!sourceState) return [];
  if (sourceState === state) {
    return builder();
  }
  return withSimulationState(sourceState, builder);
}

/**
 * 作用：
 * 为指定状态读取某位玩家的手牌视图。
 *
 * 为什么这样写：
 * 候选生成优先基于显式 sourceState 工作，避免直接从 live state 取玩家数据。
 *
 * 输入：
 * @param {object|null} sourceState - 候选生成使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要读取手牌的玩家 ID。
 *
 * 输出：
 * @returns {object|null} 返回对应玩家对象；不存在时返回 null。
 *
 * 注意：
 * - 该函数只读 sourceState，不负责克隆。
 * - sourceState 既可能是 live state，也可能是 simulation state。
 */
function getCandidateSourcePlayer(sourceState, playerId) {
  return getSimulationPlayer(sourceState, playerId);
}

/**
 * 作用：
 * 从指定状态读取 legacy 首发建议，作为候选层的兼容来源之一。
 *
 * 为什么这样写：
 * 当前首发启发式仍有不少逻辑留在旧链路中，先通过局部适配保留行为一致性，
 * 同时把候选主流程迁到 sourceState 驱动。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要读取建议的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回 legacy 首发建议牌组。
 *
 * 注意：
 * - 这里只是兼容入口，不代表候选层未来长期要继续依赖旧决策器。
 * - 结果可能为空数组，调用方需要自行兜底。
 */
function getLegacyLeadChoiceForState(sourceState, playerId) {
  return runCandidateLegacyHelper(sourceState, () => chooseAiLeadPlay(playerId));
}

/**
 * 作用：
 * 从指定状态读取 beginner 兜底提示，保证候选层始终保留稳定基线动作。
 *
 * 为什么这样写：
 * 候选层在逐步解耦过程中，仍需要保留现有产品行为的一致性和回归稳定性。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要读取提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回 beginner 风格的合法提示牌组。
 *
 * 注意：
 * - 该函数当前仍通过适配层调用旧 helper。
 * - 后续如果 beginner 链路也完成显式传参迁移，这里可以继续收窄。
 */
function getBeginnerLegalHintForState(sourceState, playerId) {
  return runCandidateLegacyHelper(sourceState, () => getBeginnerLegalHintForPlayer(playerId));
}

/**
 * 作用：
 * 从指定状态读取所有合法跟牌候选，作为 follow 模式的候选基础集。
 *
 * 为什么这样写：
 * 合法性判断目前仍深度依赖现有规则引擎，这一步先通过适配层复用它，
 * 避免在“候选解耦”的第一阶段重写整套规则校验。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要枚举候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<Array<object>>} 返回该玩家当前所有合法跟牌候选。
 *
 * 注意：
 * - 这里是当前阶段保守迁移的边界，后续可继续把合法性判断改成显式 state 版本。
 * - 返回的候选顺序仍沿用现有规则引擎的行为。
 */
function getLegalSelectionsForState(sourceState, playerId) {
  return runCandidateLegacyHelper(sourceState, () => getLegalSelectionsForPlayer(playerId));
}

/**
 * 作用：
 * 基于指定状态判断某组候选是否能压过当前桌面最大牌。
 *
 * 为什么这样写：
 * 候选标签里的 `beats` 需要和 sourceState 对齐，不能再偷偷读 live state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 出牌玩家 ID。
 * @param {Array<object>} cards - 待评估的候选牌组。
 *
 * 输出：
 * @returns {boolean} 返回该候选在 sourceState 下是否能压过当前最大牌。
 *
 * 注意：
 * - 这里不负责校验候选是否合法，只回答“如果打这手，是否能压住”。
 * - 逻辑故意只依赖 sourceState，避免标签和真实模拟上下文不一致。
 */
function doesSelectionBeatCurrentForState(sourceState, playerId, cards) {
  if (!sourceState?.leadSpec || !sourceState?.currentTrick?.length || !Array.isArray(cards) || cards.length === 0) {
    return false;
  }
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player) return false;
  const suited = player.hand.filter((card) => effectiveSuit(card) === sourceState.leadSpec.suit);
  if (suited.length > 0) return false;

  const pattern = classifyPlay(cards);
  if (!matchesLeadPattern(pattern, sourceState.leadSpec)) return false;

  const currentWinningPlay = getSimulationCurrentWinningPlay(sourceState);
  if (!currentWinningPlay) return false;
  const currentPattern = classifyPlay(currentWinningPlay.cards);
  if (sourceState.leadSpec.type === "single") {
    return compareSingle(cards[0], currentWinningPlay.cards[0], sourceState.leadSpec.suit) > 0;
  }
  return compareSameTypePlay(pattern, currentPattern, sourceState.leadSpec.suit) > 0;
}

/**
 * 作用：
 * 基于指定状态的手牌结构生成中级首发候选，而不是直接读取 live state。
 *
 * 为什么这样写：
 * 首发结构候选其实主要依赖玩家当前手牌，先把这部分改成纯 sourceState 计算，
 * 能显著减少候选层对全局 state 的隐式耦合。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成首发候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<Array<object>>} 返回该玩家在 sourceState 下的首发候选列表。
 *
 * 注意：
 * - 会保留一手 legacy 首发建议，保证当前产品行为不突然跳变。
 * - 这里只产出候选，不负责打分排序。
 */
function getIntermediateLeadCandidatesForState(sourceState, playerId) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player || player.hand.length === 0) return [];
  const hand = player.hand;
  const seen = new Set();
  const candidates = [];

  addUniqueCombo(candidates, seen, getLegacyLeadChoiceForState(sourceState, playerId));

  const patternGroups = [
    findSerialTuples(hand, 3),
    findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "train"),
    findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "tractor"),
    findTriples(hand),
    findPairs(hand),
  ];
  for (const combos of patternGroups) {
    if (combos.length === 0) continue;
    addUniqueCombo(candidates, seen, combos[0]);
    addUniqueCombo(candidates, seen, combos[combos.length - 1]);
  }

  const suitBuckets = new Map();
  for (const card of hand) {
    const suit = effectiveSuit(card);
    if (!suitBuckets.has(suit)) suitBuckets.set(suit, []);
    suitBuckets.get(suit).push(card);
  }

  for (const cards of suitBuckets.values()) {
    addUniqueCombo(candidates, seen, [lowestCard(cards)]);
    addUniqueCombo(candidates, seen, [highestCard(cards)]);
    addUniqueCombo(candidates, seen, chooseStrongLeadFromCards(cards));
  }

  return candidates;
}

/**
 * 作用：
 * 生成指定状态下的首发候选条目。
 *
 * 为什么这样写：
 * 这一步让首发候选的主体逻辑直接吃 sourceState，只有 legacy 候选和 beginner 基线走适配器，
 * 从而把候选层逐步从全局 state 中剥离出来。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成首发候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回带来源和标签的首发候选条目列表。
 *
 * 注意：
 * - 返回值会在函数末尾去重并限制数量。
 * - 这里的标签只描述候选本身，不参与胜负判断。
 */
function generateLeadCandidates(sourceState, playerId) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player || player.hand.length === 0) return [];

  const entries = [];
  const heuristicLead = getLegacyLeadChoiceForState(sourceState, playerId);
  if (heuristicLead.length > 0) {
    entries.push(createCandidateEntry(heuristicLead, "heuristic", ["legacy", "special"]));
  }

  const structuralCandidates = getIntermediateLeadCandidatesForState(sourceState, playerId);
  for (const combo of structuralCandidates) {
    const pattern = classifyPlay(combo);
    entries.push(createCandidateEntry(combo, "structure", [pattern.type, pattern.suit || effectiveSuit(combo[0])]));
  }

  const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries).slice(0, 20);
}

/**
 * 作用：
 * 生成指定状态下的跟牌候选条目。
 *
 * 为什么这样写：
 * 跟牌候选的合法集暂时仍由旧规则引擎提供，但候选标签和压制判断已经改为显式读取 sourceState，
 * 这样后续继续迁移合法性判断时，候选条目层不需要再返工一次。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成跟牌候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回带来源和标签的跟牌候选条目列表。
 *
 * 注意：
 * - `matched` 和 `beats` 都必须基于 sourceState 计算，不能混入 live state。
 * - 这里仍保留 beginner 基线候选，保证候选层有稳定保底。
 */
function generateFollowCandidates(sourceState, playerId) {
  const candidates = getLegalSelectionsForState(sourceState, playerId);
  const leadSpec = sourceState?.leadSpec || null;
  const entries = candidates.map((combo) => {
    const pattern = classifyPlay(combo);
    const tags = [pattern.type, pattern.suit || effectiveSuit(combo[0])];
    if (doesSelectionBeatCurrentForState(sourceState, playerId, combo)) tags.push("beats");
    if (leadSpec && matchesLeadPattern(pattern, leadSpec)) tags.push("matched");
    return createCandidateEntry(combo, "legal", tags);
  });

  const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries).slice(0, 24);
}

/**
 * 作用：
 * 按指定模式统一生成候选条目。
 *
 * 为什么这样写：
 * 中级搜索主流程已经统一到 mode 入口，这里保持同样的切面，方便后续继续把 candidate pipeline 做成纯函数。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成候选的玩家 ID。
 * @param {string} mode - 当前是 `lead` 还是 `follow`。
 *
 * 输出：
 * @returns {Array<object>} 返回该模式下的候选条目列表。
 *
 * 注意：
 * - 未识别的 mode 会按 `lead` 处理，保持现有行为简单稳定。
 * - 这里只负责产出候选，不负责评分和排序。
 */
function generateCandidatePlays(sourceState, playerId, mode) {
  return mode === "follow"
    ? generateFollowCandidates(sourceState, playerId)
    : generateLeadCandidates(sourceState, playerId);
}
