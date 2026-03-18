// 为玩家给出当前合法出牌提示。
function getLegalHintForPlayer(playerId) {
  return getAiDifficulty() === "beginner"
    ? getBeginnerLegalHintForPlayer(playerId)
    : getIntermediateLegalHintForPlayer(playerId);
}

/**
 * 作用：
 * 按指定状态的 leadSpec 计算一组跟牌候选的结构分。
 *
 * 为什么这样写：
 * 搜索兜底、紧急兜底和 simulation hint 都需要一套不依赖全局 `state` 的跟牌排序口径，
 * 否则 sourceState 与 live state 不一致时，兜底行为会和真实上下文错位。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {Array<object>} combo - 待评分的跟牌候选。
 *
 * 输出：
 * @returns {number} 返回该候选在 sourceState 下的结构分，分数越高越优先。
 *
 * 注意：
 * - 没有 leadSpec 时返回 0，交由后续排序项兜底。
 * - 这里只用于提示与兜底排序，不直接决定正式 AI 评分。
 */
function getFollowStructureScoreForState(sourceState, combo) {
  const leadSpec = sourceState?.leadSpec || null;
  if (!leadSpec) return 0;
  const pattern = classifyPlay(combo);
  const suitedCount = combo.filter((card) => effectiveSuit(card) === leadSpec.suit).length;
  let score = suitedCount * 10;

  if (matchesLeadPattern(pattern, leadSpec)) {
    score += 1000;
  }

  if (leadSpec.type === "pair") {
    score += getForcedPairUnits(combo) * 120;
  } else if (leadSpec.type === "triple") {
    score += getTripleUnits(combo) * 150;
    score += getForcedPairUnits(combo) * 40;
  } else if (leadSpec.type === "tractor" || leadSpec.type === "train") {
    score += getForcedPairUnits(combo) * 140;
  } else if (leadSpec.type === "bulldozer") {
    const tripleUnits = getTripleUnits(combo);
    score += tripleUnits * 160;
    score += getForcedPairUnitsWithReservedTriples(combo, tripleUnits) * 50;
  }

  return score;
}

/**
 * 作用：
 * 按指定状态对紧急合法候选做稳定排序。
 *
 * 为什么这样写：
 * 旧版排序直接读取 live state，会让 simulation 和 sourceState 场景下的提示退回到隐式全局依赖。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {Array<Array<object>>} combos - 待排序的合法候选集合。
 *
 * 输出：
 * @returns {Array<Array<object>>} 返回按优先级排序后的候选集合。
 *
 * 注意：
 * - 该函数会原地使用 `sort`，调用方如果需要保留原数组，应先传入副本。
 * - 排序规则保持与旧逻辑尽量一致，避免产品行为突变。
 */
function rankEmergencyLegalSelectionsForState(sourceState, playerId, combos) {
  const handBefore = getSimulationPlayer(sourceState, playerId)?.hand || [];
  return combos.sort((a, b) => {
    const structureDiff = getFollowStructureScoreForState(sourceState, b) - getFollowStructureScoreForState(sourceState, a);
    if (structureDiff !== 0) return structureDiff;
    const sameSuitPreserveDiff = scoreSameSuitSingleStructurePreservationFromHand(b, handBefore, sourceState?.leadSpec)
      - scoreSameSuitSingleStructurePreservationFromHand(a, handBefore, sourceState?.leadSpec);
    if (sameSuitPreserveDiff !== 0) return sameSuitPreserveDiff;
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0)
      - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  });
}

function rankEmergencyLegalSelections(playerId, combos) {
  return rankEmergencyLegalSelectionsForState(state, playerId, combos);
}

/**
 * 作用：
 * 在指定状态下生成“最后兜底”的合法跟牌选择。
 *
 * 为什么这样写：
 * 自动出牌和 simulation 都需要一个不依赖 live state 的兜底方案，
 * 否则在 sourceState 场景里，最后一层保护仍会退回全局态。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要兜底选牌的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回按 sourceState 算出的兜底合法选牌。
 *
 * 注意：
 * - 首发场景只返回最小单张，保持旧行为简单稳定。
 * - 跟牌场景优先返回合法组合；实在没有再返回空数组。
 */
function findEmergencyLegalSelectionForState(sourceState, playerId) {
  const player = getSimulationPlayer(sourceState, playerId);
  if (!player) return [];
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  if (hand.length === 0) return [];

  if (!sourceState?.currentTrick?.length) {
    return [hand[0]];
  }

  const leadSpec = sourceState?.leadSpec || null;
  if (!leadSpec) return [];
  const targetCount = leadSpec.count;
  if (hand.length < targetCount) {
    return validateFollowSelectionForState(sourceState, playerId, hand).ok ? hand : [];
  }
  if (hand.length === targetCount && validateFollowSelectionForState(sourceState, playerId, hand).ok) {
    return hand;
  }

  const validCombos = enumerateCombinations(hand, targetCount)
    .filter((combo) => validateFollowSelectionForState(sourceState, playerId, combo).ok);
  if (validCombos.length === 0) return [];
  return rankEmergencyLegalSelectionsForState(sourceState, playerId, validCombos)[0];
}

function findEmergencyLegalSelection(playerId) {
  return findEmergencyLegalSelectionForState(state, playerId);
}

/**
 * 作用：
 * 在指定状态下构建“必须出牌时”的强制跟牌兜底方案。
 *
 * 为什么这样写：
 * simulation hint 和 sourceState 提示都需要一个显式状态版本，
 * 以免最后一步兜底时又退回去读取 live state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要兜底选牌的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回在 sourceState 下构造出的最低风险跟牌兜底方案。
 *
 * 注意：
 * - 这里只保证“尽量合法跟出”，不保证最优。
 * - 如果缺少 leadSpec 或当前墩为空，会直接返回空数组。
 */
function buildForcedFollowFallbackForState(sourceState, playerId) {
  const player = getSimulationPlayer(sourceState, playerId);
  const leadSpec = sourceState?.leadSpec || null;
  if (!player || !sourceState?.currentTrick?.length || !leadSpec) return [];

  const targetCount = leadSpec.count;
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const suited = hand.filter((card) => effectiveSuit(card) === leadSpec.suit);
  if (suited.length >= targetCount) {
    return suited.slice(0, targetCount);
  }
  const fillers = hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id));
  return [...suited, ...fillers.slice(0, targetCount - suited.length)];
}

function buildForcedFollowFallback(playerId) {
  return buildForcedFollowFallbackForState(state, playerId);
}

/**
 * 作用：
 * 在指定状态下查找一手更像“人类会选”的合法跟牌。
 *
 * 为什么这样写：
 * 候选层已经有显式 sourceState 的合法候选集合，这里直接复用它做搜索兜底，
 * 比重新枚举并读取 live state 更稳定，也能让 simulation 与实际提示链共用同一口径。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要搜索合法选牌的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回排序最优的一手合法跟牌；找不到则返回空数组。
 *
 * 注意：
 * - 这里只服务于提示和兜底，不替代正式 AI 的完整评分流程。
 * - 候选排序与旧逻辑尽量保持一致，以减少行为漂移。
 */
function findLegalSelectionBySearchForState(sourceState, playerId) {
  if (!getSimulationPlayer(sourceState, playerId) || !sourceState?.currentTrick?.length) return [];
  const validCombos = getLegalSelectionsForState(sourceState, playerId);
  if (validCombos.length === 0) return [];
  const handBefore = getSimulationPlayer(sourceState, playerId)?.hand || [];
  return validCombos.sort((a, b) => {
    const structureDiff = getFollowStructureScoreForState(sourceState, b) - getFollowStructureScoreForState(sourceState, a);
    if (structureDiff !== 0) return structureDiff;
    const sameSuitPreserveDiff = scoreSameSuitSingleStructurePreservationFromHand(b, handBefore, sourceState?.leadSpec)
      - scoreSameSuitSingleStructurePreservationFromHand(a, handBefore, sourceState?.leadSpec);
    if (sameSuitPreserveDiff !== 0) return sameSuitPreserveDiff;
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function findLegalSelectionBySearch(playerId) {
  return findLegalSelectionBySearchForState(state, playerId);
}

// 自动处理出牌当前回合。
function autoPlayCurrentTurn() {
  const player = getPlayer(state.currentTurnId);
  if (!player || state.gameOver) return;
  const chosen = getLegalHintForPlayer(player.id);
  if (chosen.length > 0 && playCards(player.id, chosen.map((card) => card.id))) {
    return;
  }
  const fallback = findLegalSelectionBySearch(player.id);
  if (fallback.length > 0 && playCards(player.id, fallback.map((card) => card.id))) {
    return;
  }
  const forced = buildForcedFollowFallback(player.id);
  if (forced.length > 0 && playCards(player.id, forced.map((card) => card.id))) {
    return;
  }
  const emergency = findEmergencyLegalSelection(player.id);
  if (emergency.length > 0 && playCards(player.id, emergency.map((card) => card.id))) {
    return;
  }
  console.warn("AI autoplay stalled without a legal selection", {
    playerId: player.id,
    handCount: player.hand.length,
    trickCount: state.currentTrick.length,
    leadSpec: state.leadSpec,
  });
}
