// 返回中级 AI 回牌时优先照顾的目标玩家 ID 列表。
function getIntermediateReturnTargetIds(playerId) {
  if (playerId === state.bankerId) return [];
  if (!state.friendTarget || !isFriendTeamResolved()) {
    if (isAiCertainFriend(playerId) || canAiRevealFriendNow(playerId)) {
      return [state.bankerId];
    }
    return [];
  }

  const allies = state.players
    .map((player) => player.id)
    .filter((otherId) => otherId !== playerId && areSameSide(playerId, otherId));
  if (allies.length === 0) return [];
  if (!isDefenderTeam(playerId) && allies.includes(state.bankerId)) {
    return [state.bankerId, ...allies.filter((otherId) => otherId !== state.bankerId)];
  }
  const nonBankerAllies = allies.filter((otherId) => otherId !== state.bankerId);
  return nonBankerAllies.length > 0 ? nonBankerAllies : allies;
}

// 评估某个花色对目标玩家的回牌信号强度。
function getIntermediateReturnSignal(targetId, leadSuit) {
  if (!leadSuit || leadSuit === "trump") return 0;
  let signal = state.exposedSuitVoid[targetId]?.[leadSuit] ? 1 : 0;
  if (signal > 0 && targetId === state.bankerId) {
    signal += 1;
  }
  return signal;
}

// 为中级 AI 的回牌首发计算分数。
function scoreIntermediateReturnLead(playerId, combo, player) {
  if (!player || combo.length !== 1) return 0;
  const leadCard = combo[0];
  const leadSuit = effectiveSuit(leadCard);
  if (leadSuit === "trump") return 0;

  const targetIds = getIntermediateReturnTargetIds(playerId);
  if (targetIds.length === 0) return 0;

  const returnSignals = targetIds
    .map((targetId) => ({ targetId, signal: getIntermediateReturnSignal(targetId, leadSuit) }))
    .filter((entry) => entry.signal > 0);
  if (returnSignals.length === 0) return 0;

  const sameSuitCards = player.hand.filter((card) => effectiveSuit(card) === leadSuit);
  const lowestSuitCard = sameSuitCards.length > 0 ? lowestCard(sameSuitCards) : leadCard;
  let score = returnSignals.reduce((sum, entry) => sum + entry.signal * 26, 0) - getComboPointValue(combo) * 3;
  if (lowestSuitCard?.id === leadCard.id) score += 18;
  if (targetIds[0] === state.bankerId) score += 12;
  score -= getPatternUnitPower(leadCard, leadSuit) * 2;
  return score;
}

// 判断中级 AI 是否处于早期帮庄接手和带牌节奏。
function isIntermediateEarlyFriendTempo(playerId) {
  if (playerId === state.bankerId || !state.friendTarget || state.trickNumber > 4) return false;
  if (isFriendTeamResolved()) {
    return areSameSide(playerId, state.bankerId);
  }
  return isAiCertainFriend(playerId) || canAiRevealFriendNow(playerId);
}

// 评估朋友在早期接手后的带牌节奏。
function scoreIntermediateFriendTempoLead(playerId, combo) {
  if (!isIntermediateEarlyFriendTempo(playerId) || !Array.isArray(combo) || combo.length === 0) return 0;
  const pattern = classifyPlay(combo);
  const leadSuit = effectiveSuit(combo[0]);
  let score = 0;

  if (pattern.type === "single") {
    score -= leadSuit === "trump" ? 14 : 18;
  } else if (pattern.type === "pair") {
    score += 22;
  } else if (pattern.type === "triple") {
    score += 28;
  } else if (pattern.type === "tractor") {
    score += 36;
  } else if (pattern.type === "train") {
    score += 42;
  } else if (pattern.type === "bulldozer") {
    score += 48;
  }

  if (leadSuit === "trump" && pattern.type !== "single") score -= 8;
  score -= getComboPointValue(combo) * 2;
  return score;
}

// 评估一手牌打完后的连贯性。
function scoreHandContinuity(playerId, hand) {
  if (!Array.isArray(hand) || hand.length === 0) return 0;
  const trumpCards = hand.filter((card) => isTrump(card));
  const nonTrumpHighCards = hand.filter((card) => !isTrump(card) && (card.rank === "A" || card.rank === "K"));
  const pairs = findPairs(hand);
  const triples = findTriples(hand);
  const tractors = findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "tractor");
  const trains = findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "train");
  const bulldozers = findSerialTuples(hand, 3);
  const sideSuitCount = new Set(hand.filter((card) => !isTrump(card)).map((card) => card.suit)).size;
  const voidCount = Math.max(0, SUITS.length - sideSuitCount);
  let score = 0;
  score += trumpCards.length * 8;
  score += trumpCards.filter((card) => card.suit === "joker").length * 6;
  score += nonTrumpHighCards.length * 2;
  score += pairs.length * 5;
  score += triples.length * 8;
  score += tractors.length * 10;
  score += trains.length * 14;
  score += bulldozers.length * 18;
  score += voidCount * (isDefenderTeam(playerId) ? 3 : 1);
  return score;
}

// 评估打出一组牌的资源消耗。
function scoreComboResourceUse(combo) {
  return combo.reduce((sum, card) => {
    let cardScore = isTrump(card) ? 9 : 2;
    if (card.suit === "joker") cardScore += 7;
    if (card.rank === getCurrentLevelRank()) cardScore += 4;
    if (!isTrump(card) && (card.rank === "A" || card.rank === "K")) cardScore += 3;
    return sum + cardScore;
  }, 0);
}

// 返回打出某组牌后的剩余手牌。
function getHandAfterCombo(hand, combo) {
  const removeIds = new Set(combo.map((card) => card.id));
  return hand.filter((card) => !removeIds.has(card.id));
}

// 评估首发是否不必要地拆掉完整三张组。
function scoreLeadTripleBreakPenalty(handBefore, combo) {
  if (!Array.isArray(handBefore) || !Array.isArray(combo) || combo.length === 0) return 0;
  const pattern = classifyPlay(combo);
  const comboKeyCounts = new Map();
  for (const card of combo) {
    const key = card.suit + "-" + card.rank;
    comboKeyCounts.set(key, (comboKeyCounts.get(key) || 0) + 1);
  }

  const handKeyCounts = new Map();
  for (const card of handBefore) {
    const key = card.suit + "-" + card.rank;
    handKeyCounts.set(key, (handKeyCounts.get(key) || 0) + 1);
  }

  let score = 0;
  for (const [key, handCount] of handKeyCounts.entries()) {
    if (handCount !== 3) continue;
    const used = comboKeyCounts.get(key) || 0;
    if (used === 0 && (pattern.type === "single" || pattern.type === "pair")) score -= 120;
    if (used > 0 && used < 3) score -= 220;
    if (used === 3) score += 96;
  }
  return score;
}

// 返回中级 AI 当前视角下的对手 ID 列表。
function getIntermediateEnemyIds(playerId) {
  return state.players
    .map((player) => player.id)
    .filter((otherId) => otherId !== playerId && !areAiSameSide(playerId, otherId));
}

// 评估一组牌中的主牌型压力。
function getTrumpPatternPressure(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return 0;
  const trumpCards = cards.filter((card) => effectiveSuit(card) === "trump");
  if (trumpCards.length === 0) return 0;
  const pairs = findPairs(trumpCards).length;
  const tractors = findSerialTuples(trumpCards, 2).filter((combo) => classifyPlay(combo).type === "tractor").length;
  const trains = findSerialTuples(trumpCards, 2).filter((combo) => classifyPlay(combo).type === "train").length;
  const bulldozers = findSerialTuples(trumpCards, 3).length;
  return trumpCards.length * 2 + pairs * 6 + tractors * 14 + trains * 18 + bulldozers * 22;
}

// 评估一组牌中的副牌牌型压力。
function getSidePatternPressure(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return 0;
  const sideCards = cards.filter((card) => effectiveSuit(card) !== "trump");
  if (sideCards.length === 0) return 0;
  const pairs = findPairs(sideCards).length;
  const tractors = findSerialTuples(sideCards, 2).filter((combo) => classifyPlay(combo).type === "tractor").length;
  const trains = findSerialTuples(sideCards, 2).filter((combo) => classifyPlay(combo).type === "train").length;
  return pairs * 6 + tractors * 14 + trains * 18;
}

// 评估中级 AI 是否适合执行清主计划。
function getIntermediateTrumpControlPlan(playerId, handBefore) {
  const playerTrumpCards = handBefore.filter((card) => effectiveSuit(card) === "trump");
  const enemyIds = getIntermediateEnemyIds(playerId);
  const knownEnemyTrumpVoidCount = enemyIds.filter((enemyId) => state.exposedTrumpVoid[enemyId]).length;
  if (playerTrumpCards.length < 4) {
    return {
      active: false,
      playerTrumpCards,
      totalEnemyTrump: 0,
      ownTrumpPressure: getTrumpPatternPressure(handBefore),
      enemyTrumpPressure: 0,
      sidePatternPressure: getSidePatternPressure(handBefore),
      knownEnemyTrumpVoidCount,
    };
  }

  const ownTrumpPressure = getTrumpPatternPressure(handBefore);
  const sidePatternPressure = getSidePatternPressure(handBefore);
  const active = playerTrumpCards.length >= 4
    && ownTrumpPressure >= 18
    && (playerTrumpCards.length >= 6 || ownTrumpPressure >= sidePatternPressure - 6);

  return {
    active,
    playerTrumpCards,
    totalEnemyTrump: 0,
    ownTrumpPressure,
    enemyTrumpPressure: 0,
    sidePatternPressure,
    knownEnemyTrumpVoidCount,
  };
}

// 为中级 AI 的清主首发计算分数。
function scoreIntermediateTrumpClearLead(playerId, combo, handBefore) {
  if (!Array.isArray(combo) || combo.length === 0) return 0;
  if (!combo.every((card) => effectiveSuit(card) === "trump")) return 0;

  const {
    active,
    playerTrumpCards,
    ownTrumpPressure,
    sidePatternPressure,
    knownEnemyTrumpVoidCount,
  } = getIntermediateTrumpControlPlan(playerId, handBefore);
  if (!active) return 0;

  const pattern = classifyPlay(combo);
  const trumpTractors = findSerialTuples(playerTrumpCards, 2).filter((entry) => classifyPlay(entry).type === "tractor");
  const trumpTrains = findSerialTuples(playerTrumpCards, 2).filter((entry) => classifyPlay(entry).type === "train");
  const trumpBulldozers = findSerialTuples(playerTrumpCards, 3);
  let score = 0;

  score += 40;
  if (ownTrumpPressure >= 18) score += 18;
  if (playerTrumpCards.length >= 4) score += 22;
  if (playerTrumpCards.length >= 6) score += 12;
  score += knownEnemyTrumpVoidCount * 8;
  if (pattern.type === "pair") score += 26;
  if (pattern.type === "tractor") score += 46;
  if (pattern.type === "train") score += 54;
  if (pattern.type === "bulldozer") score += 62;
  if (pattern.type === "single") score -= 10;
  if (pattern.type === "pair" && (trumpTractors.length > 0 || trumpTrains.length > 0 || trumpBulldozers.length > 0)) {
    score -= 36;
  }
  if (pattern.type === "single" && (findPairs(playerTrumpCards).length > 0 || trumpTractors.length > 0 || trumpTrains.length > 0 || trumpBulldozers.length > 0)) {
    score -= 48;
  }
  if (sidePatternPressure > 0) score += Math.min(sidePatternPressure, 28);
  return score;
}

// 评估副牌牌型打出的安全性。
function scoreIntermediateSidePatternSafety(playerId, combo, handBefore) {
  if (!Array.isArray(combo) || combo.length === 0) return 0;
  const pattern = classifyPlay(combo);
  if (pattern.suit === "trump") return 0;
  const { active, enemyTrumpPressure, sidePatternPressure } = getIntermediateTrumpControlPlan(playerId, handBefore);
  if (!active) {
    return 0;
  }
  if (pattern.type === "single") {
    return -42;
  }
  if (!["pair", "tractor", "train"].includes(pattern.type)) return 0;
  return -(30 + Math.min(enemyTrumpPressure, 24) + Math.min(sidePatternPressure, 18));
}

/**
 * 作用：
 * 评估一手“带分首发”是否属于高风险试探，并返回应施加的惩罚。
 *
 * 为什么这样写：
 * 里程碑 3 要把“危险带分领牌”从经验口径沉到正式评分里。
 * 对中级来说，像高分主单、高分主对这类动作，如果打出去后既可能送分又可能失先手，
 * 就应该在启发式阶段先显著降权，而不是完全依赖 rollout 事后补救。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的首发牌组。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 *
 * 输出：
 * @returns {number} 返回应扣除的风险惩罚分；越大表示越不该这样带分试探。
 *
 * 注意：
 * - 这里只基于公开信息和己方手牌结构做保守惩罚，不读取对手暗手。
 * - 该函数重点约束“高分主单 / 高分主对”和高风险带分副牌单张，不替代 rollout 对真实得失分的判断。
 */
function scoreIntermediateDangerousPointLeadPenalty(playerId, combo, handBefore) {
  if (!Array.isArray(combo) || combo.length === 0 || !Array.isArray(handBefore)) return 0;
  const comboPoints = getComboPointValue(combo);
  if (comboPoints <= 0) return 0;

  const pattern = classifyPlay(combo);
  const leadSuit = effectiveSuit(combo[0]);
  const cardsLeft = state.players.reduce((sum, player) => sum + (player.hand?.length || 0), 0);
  const lateRound = cardsLeft <= 20;
  const handAfter = getHandAfterCombo(handBefore, combo);
  const trumpBefore = handBefore.filter((card) => effectiveSuit(card) === "trump");
  const trumpAfter = handAfter.filter((card) => effectiveSuit(card) === "trump");
  const potentialTrumpResponders = getIntermediateEnemyIds(playerId).filter((enemyId) => !state.exposedTrumpVoid?.[enemyId]).length;
  const averageLeadPower = combo.reduce((sum, card) => sum + getPatternUnitPower(card, leadSuit), 0) / combo.length;
  let penalty = 0;

  if (leadSuit === "trump") {
    if (!["single", "pair"].includes(pattern.type)) return 0;
    penalty += comboPoints * 6;
    if (pattern.type === "single") penalty += 10;
    if (pattern.type === "pair") penalty += 24;
    if (averageLeadPower >= 14) penalty += 12;
    if (trumpBefore.length <= 4) penalty += 10;
    if (trumpAfter.length <= 2) penalty += 16;
    if (potentialTrumpResponders >= 2) penalty += 14;
    if (lateRound) penalty += 14;
    if (playerId === state.bankerId || (isFriendTeamResolved() && areSameSide(playerId, state.bankerId))) {
      penalty += 8;
    }
    return penalty;
  }

  if (pattern.type === "single" && comboPoints >= 10) {
    penalty += comboPoints * 3;
    if (lateRound) penalty += 10;
    if (isAiDangerousBankerRuffSuit(playerId, leadSuit)) penalty += 18;
  }

  return penalty;
}

// 收集中级 AI 可用的首发候选牌组。
function getIntermediateLeadCandidates(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.hand.length === 0) return [];
  const hand = player.hand;
  const seen = new Set();
  const candidates = [];
  addUniqueCombo(candidates, seen, chooseAiLeadPlay(playerId));

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

// 为中级 AI 的首发候选牌组计算分数。
function scoreIntermediateLeadCandidate(playerId, combo, beginnerChoice, candidateEntry = null) {
  const player = getPlayer(playerId);
  if (!player || combo.length === 0) return Number.NEGATIVE_INFINITY;
  const handBefore = player.hand;
  const handAfter = getHandAfterCombo(handBefore, combo);
  const pattern = classifyPlay(combo);
  const comboPoints = getComboPointValue(combo);
  let score = 0;

  score += scoreHandContinuity(playerId, handAfter) - scoreHandContinuity(playerId, handBefore) * 0.15;
  score -= scoreComboResourceUse(combo);
  score -= comboPoints * 2;
  score += pattern.type === "bulldozer" ? 16 : pattern.type === "train" ? 12 : pattern.type === "tractor" ? 8 : pattern.type === "triple" ? 4 : 0;

  if (beginnerChoice.length > 0 && getComboKey(beginnerChoice) === getComboKey(combo)) {
    score += 24;
  }

  if (playerId === state.bankerId && state.friendTarget && !isFriendTeamResolved()) {
    const targetSuit = state.friendTarget.suit;
    const targetRank = state.friendTarget.rank;
    const remainingBeforeReveal = (state.friendTarget.occurrence || 1) - (state.friendTarget.matchesSeen || 0);
    const containsTarget = combo.some((card) => card.suit === targetSuit && card.rank === targetRank);
    const sameSuitSearch = combo.every((card) => card.suit === targetSuit) && !containsTarget;
    if (containsTarget && remainingBeforeReveal > 1) score += 36;
    if (sameSuitSearch) score += 24;
    if (containsTarget && remainingBeforeReveal <= 1) score -= 8;
  }

  if (isDefenderTeam(playerId)) {
    const leadSuit = effectiveSuit(combo[0]);
    if (leadSuit !== "trump") {
      const pressureTargets = getAiPressureTargetIds(playerId);
      const voidCount = pressureTargets.filter((targetId) => state.exposedSuitVoid[targetId]?.[leadSuit]).length;
      score += voidCount * 18;
    }
  }

  if (effectiveSuit(combo[0]) !== "trump" && isAiDangerousBankerRuffSuit(playerId, effectiveSuit(combo[0]))) {
    score -= 90;
  }

  score += scoreIntermediateReturnLead(playerId, combo, player);
  score += scoreIntermediateFriendTempoLead(playerId, combo);
  score += scoreLeadTripleBreakPenalty(handBefore, combo);
  score += scoreIntermediateTrumpClearLead(playerId, combo, handBefore);
  score += scoreIntermediateSidePatternSafety(playerId, combo, handBefore);
  const dangerousPointLeadPenalty = scoreIntermediateDangerousPointLeadPenalty(playerId, combo, handBefore);
  if (candidateEntry && typeof candidateEntry === "object") {
    candidateEntry.dangerousPointLeadPenalty = dangerousPointLeadPenalty;
  }
  score -= dangerousPointLeadPenalty;
  score += scoreRememberedStructurePromotion(playerId, combo);

  const throwAssessment = candidateEntry?.throwAssessment || assessThrowCandidateForState(state, playerId, combo);
  if (throwAssessment) {
    score -= throwAssessment.scorePenalty || 0;
  }

  if (combo.every((card) => effectiveSuit(card) === "trump") && !isDefenderTeam(playerId)) {
    score -= 10;
  }

  return score;
}

function selectBestIntermediateLeadCandidate(playerId, candidateEntries, beginnerChoice) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return null;
  return buildScoredIntermediateLeadEntries(playerId, candidateEntries, beginnerChoice)[0] || null;
}

/**
 * 作用：
 * 判断某个首发候选在残局续控检查里是否可视为“相对安全的下一拍起手”。
 *
 * 为什么这样写：
 * 里程碑 1 剩余项需要回答“抢回先手后下一拍能不能稳住”。
 * 这里不做完整搜索，只用轻量规则把明显危险的单吊和高风险甩牌排除掉，供 rollout 扩展判断使用。
 *
 * 输入：
 * @param {object|null} entry - 候选条目，允许携带 heuristicScore 和 throwAssessment。
 *
 * 输出：
 * @returns {boolean} 若该候选可视为相对安全的残局起手，则返回 true。
 *
 * 注意：
 * - 这只是 rollout 扩展触发里的轻量判定，不等于最终 AI 正式评分。
 * - 高风险甩牌和明显偏弱的单张默认不算“安全起手”。
 */
function isSafeEndgameLeadCandidate(entry) {
  if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return false;
  const pattern = classifyPlay(entry.cards);
  const heuristicScore = typeof entry.heuristicScore === "number" ? entry.heuristicScore : Number.NEGATIVE_INFINITY;
  if (entry.throwAssessment?.level === "risky") return false;
  if (pattern.type === "throw") return entry.throwAssessment?.level === "safe";
  if (pattern.type !== "single") return heuristicScore >= -8;
  if (effectiveSuit(entry.cards[0]) === "trump") return heuristicScore >= 6;
  return heuristicScore >= 18 && getComboPointValue(entry.cards) === 0;
}

/**
 * 作用：
 * 在指定状态下为“下一拍安全起手检查”选出一手轻量启发式首发。
 *
 * 为什么这样写：
 * rollout 扩展阶段不能再递归调用完整中级搜索，否则容易出现深层递归和成本失控。
 * 这里复用现有候选与启发式评分，但不再叠加 rollout，只做一层快速判断。
 *
 * 输入：
 * @param {object|null} sourceState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估下一拍起手的玩家 ID。
 *
 * 输出：
 * @returns {{bestEntry: object|null, safeEntry: object|null, safeLeadCount: number, scoredEntries: Array<object>}} 返回最佳启发式首发与安全起手摘要。
 *
 * 注意：
 * - 这里要求 `sourceState` 已经处于“当前玩家首发”的时点。
 * - 评分使用的是 `scoreIntermediateLeadCandidate` 的启发式部分，不包含额外 rollout。
 */
function getEndgameSafeLeadSummaryForState(sourceState, playerId) {
  const candidateResult = generateCandidateResultForState(sourceState, playerId, "lead");
  if (!Array.isArray(candidateResult.entries) || candidateResult.entries.length === 0) {
    return {
      bestEntry: null,
      safeEntry: null,
      safeLeadCount: 0,
      scoredEntries: [],
    };
  }

  return runCandidateLegacyHelper(sourceState, () => {
    const beginnerChoice = getBeginnerLegalHintForPlayer(playerId);
    const scoredEntries = candidateResult.entries
      .map((entry) => ({
        ...entry,
        heuristicScore: scoreIntermediateLeadCandidate(playerId, entry.cards, beginnerChoice, entry),
      }))
      .sort((a, b) => {
        const scoreDiff = (b.heuristicScore || 0) - (a.heuristicScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return classifyPlay(a.cards).power - classifyPlay(b.cards).power;
      });
    const safeEntries = scoredEntries.filter((entry) => isSafeEndgameLeadCandidate(entry));
    return {
      bestEntry: scoredEntries[0] || null,
      safeEntry: safeEntries[0] || null,
      safeLeadCount: safeEntries.length,
      scoredEntries,
    };
  });
}

// 为中级 AI 的跟牌候选方案计算分数。
function scoreIntermediateFollowCandidate(playerId, combo, currentWinningPlay, allyWinning, beginnerChoice) {
  const player = getPlayer(playerId);
  if (!player || combo.length === 0) return Number.NEGATIVE_INFINITY;
  const handBefore = player.hand;
  const handAfter = getHandAfterCombo(handBefore, combo);
  const leadSuitCards = state.leadSpec ? handBefore.filter((card) => effectiveSuit(card) === state.leadSpec.suit) : [];
  const currentPattern = currentWinningPlay ? classifyPlay(currentWinningPlay.cards) : null;
  const pattern = classifyPlay(combo);
  const comboSuit = pattern.suit || effectiveSuit(combo[0]);
  const voidOnLeadSuit = !!state.leadSpec && leadSuitCards.length === 0;
  const trumpEscape = voidOnLeadSuit && comboSuit === "trump";
  const beats = !!currentWinningPlay && wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay);
  const comboPoints = getComboPointValue(combo);
  const tablePoints = getCurrentTrickPointValue();
  const powerMargin = beats && currentPattern ? compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) : 0;
  let score = 0;

  score += getFollowStructureScore(combo) * 0.7;
  score += scoreHandContinuity(playerId, handAfter) - scoreHandContinuity(playerId, handBefore) * 0.1;
  score -= scoreComboResourceUse(combo) * (allyWinning ? 1.1 : 0.8);

  if (beginnerChoice.length > 0 && getComboKey(beginnerChoice) === getComboKey(combo)) {
    score += 18;
  }

  if (!allyWinning && beats) {
    score += 110 + (tablePoints + comboPoints) * 9;
    score -= Math.max(0, powerMargin - 1) * 6;
  } else if (!allyWinning) {
    score -= (tablePoints + comboPoints) * 8;
  }

  if (allyWinning && !beats) {
    score += comboPoints * 8;
  } else if (allyWinning && beats) {
    score -= 120 + tablePoints * 6;
  }

  if (!isFriendTeamResolved() && currentWinningPlay) {
    const defensiveCooperation = isAiTentativeDefender(playerId) && isAiTentativeDefender(currentWinningPlay.playerId);
    if (defensiveCooperation) {
      if (beats) {
        score -= 90;
      } else {
        score += 20;
      }
    }
  }

  if (shouldAiAimForBottom(playerId) && allyWinning && !beats) {
    score += scoreBottomPrepCombo(combo) * 2;
  }

  if (state.friendTarget && !isFriendTeamResolved()) {
    const containsTarget = combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
    if (containsTarget && canAiRevealFriendNow(playerId)) {
      if (beats) {
        score += state.trickNumber <= 4 ? 150 : 54;
      } else if (currentWinningPlay?.playerId === state.bankerId) {
        score -= state.trickNumber <= 4 ? 180 : 72;
      } else {
        score += state.trickNumber === 1 ? 90 : 36;
      }
    }
  }

  if (trumpEscape) {
    const trumpCommitment = combo.reduce((sum, card) => {
      let cardScore = 16;
      if (card.suit === "joker") cardScore += 20;
      if (card.rank === getCurrentLevelRank()) cardScore += 12;
      if (getPatternUnitPower(card, "trump") >= 14) cardScore += 8;
      return sum + cardScore;
    }, 0);

    if (!beats) {
      score -= trumpCommitment * 4;
      if (pattern.type === "pair") score -= 160;
      if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") score -= 220;
      if (currentPattern?.suit === "trump") {
        score -= pattern.type === "pair" ? 320 : 240;
      }
    } else if (allyWinning) {
      score -= trumpCommitment * 1.8 + 90;
    }
  }

  if (trumpEscape && beats && currentPattern?.suit === "trump") {
    const currentHasJoker = currentWinningPlay.cards.some((card) => card.suit === "joker");
    const comboHasJoker = combo.some((card) => card.suit === "joker");
    if (currentHasJoker && !comboHasJoker) {
      score -= pattern.type === "pair" ? 320 : 220;
    }
  }

  score += scoreRememberedStructurePromotion(playerId, combo) * 0.85;

  return score;
}

function selectBestIntermediateFollowCandidate(playerId, candidateEntries, currentWinningPlay, allyWinning, beginnerChoice) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return null;
  return buildScoredIntermediateFollowEntries(
    playerId,
    candidateEntries,
    currentWinningPlay,
    allyWinning,
    beginnerChoice
  )[0] || null;
}

function getIntermediateRolloutMode(simState, playerId, fallbackMode = "lead") {
  if (!simState || simState.phase === "ending") return fallbackMode;
  if (simState.currentTrick.length === 0 && simState.currentTurnId === playerId) return "lead";
  return "follow";
}

function getIntermediateRolloutExtensionSignals(playerId, simState, mode = "lead", combo = [], currentWinningPlay = null) {
  const player = getSimulationPlayer(simState, playerId);
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    return {
      shouldExtend: false,
      flags: [],
    };
  }

  if (mode === "follow" && currentWinningPlay) {
    const beatsCurrent = wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay);
    if (!beatsCurrent) {
      return {
        shouldExtend: false,
        flags: ["follow_non_beating"],
      };
    }
    if (!isFriendTeamResolved()
      && isAiTentativeDefender(playerId)
      && isAiTentativeDefender(currentWinningPlay.playerId)) {
      return {
        shouldExtend: false,
        flags: ["tentative_defender_hold"],
      };
    }
  }

  const unresolvedFriend = !!simState.friendTarget && !isSimulationFriendTeamResolved(simState);
  const lateRound = simState.players.reduce((sum, seat) => sum + (seat.hand?.length || 0), 0) <= 20;
  const immediateOwnLead = !simState.currentTrick?.length && simState.currentTurnId === playerId;
  const bottomSensitive = lateRound && isSimulationDefenderTeam(simState, playerId);
  const trumpCount = player.hand.filter((card) => effectiveSuit(card) === "trump").length;
  const structureCount = getStructureCombosFromHand(player.hand).length;
  const flags = [];
  if (unresolvedFriend) flags.push("unresolved_friend");
  if (bottomSensitive) flags.push("late_bottom_pressure");
  if (lateRound && immediateOwnLead) flags.push("endgame_safe_lead_check");
  if (trumpCount >= 5) flags.push("heavy_trump_control");
  if (structureCount >= 2) flags.push("multi_structure_hand");
  return {
    shouldExtend: flags.length > 0,
    flags,
  };
}

function getDecisionTimestamp() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function summarizeEvaluationForDebug(evaluation) {
  return evaluation
    ? {
        total: evaluation.total,
        breakdown: { ...(evaluation.breakdown || {}) },
        objective: evaluation.objective
          ? {
              primary: evaluation.objective.primary,
              secondary: evaluation.objective.secondary,
            }
          : null,
      }
    : null;
}

function summarizeCandidateDebugStats(candidateEntries, filteredCandidateEntries = []) {
  const entries = Array.isArray(candidateEntries) ? candidateEntries : [];
  const filteredEntries = Array.isArray(filteredCandidateEntries) ? filteredCandidateEntries : [];
  const maxRolloutDepth = entries.reduce((max, entry) => Math.max(max, entry.rolloutDepth || 0), 0);
  const extendedRolloutCount = entries.filter((entry) => entry.rolloutDepth >= 2).length;
  const completedRolloutCount = entries.filter((entry) => entry.rolloutCompleted).length;
  const turnAccessRiskCount = entries.filter((entry) =>
    Array.isArray(entry.rolloutTriggerFlags) && entry.rolloutTriggerFlags.includes("turn_access_risk")
  ).length;
  const pointRunRiskCount = entries.filter((entry) =>
    Array.isArray(entry.rolloutTriggerFlags) && entry.rolloutTriggerFlags.includes("point_run_risk")
  ).length;
  const filteredReasonCounts = filteredEntries.reduce((acc, entry) => {
    const key = entry?.filterReason || "filtered";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    candidateCount: entries.length,
    filteredCandidateCount: filteredEntries.length,
    filteredReasonCounts,
    completedRolloutCount,
    extendedRolloutCount,
    turnAccessRiskCount,
    pointRunRiskCount,
    maxRolloutDepth,
  };
}

function cloneDebugValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function createAiDecisionSnapshot(bundle, scoredEntries, bestEntry, decisionTimeMs) {
  const candidateEntries = Array.isArray(scoredEntries)
    ? scoredEntries.slice(0, 8).map((entry) => ({
      cards: cloneCardsForSimulation(entry.cards),
      source: entry.source || null,
      tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
      score: typeof entry.score === "number" ? entry.score : null,
      heuristicScore: typeof entry.heuristicScore === "number" ? entry.heuristicScore : null,
      dangerousPointLeadPenalty: typeof entry.dangerousPointLeadPenalty === "number"
        ? entry.dangerousPointLeadPenalty
        : null,
      structureControlPenalty: typeof entry.structureControlPenalty === "number"
        ? entry.structureControlPenalty
        : null,
      rolloutScore: typeof entry.rolloutScore === "number" ? entry.rolloutScore : null,
      rolloutFutureDelta: typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : null,
      rolloutDepth: entry.rolloutDepth ?? 0,
      rolloutReachedOwnTurn: !!entry.rolloutReachedOwnTurn,
      rolloutTriggerFlags: Array.isArray(entry.rolloutTriggerFlags) ? [...entry.rolloutTriggerFlags] : [],
      throwRiskLevel: entry.throwAssessment?.level || null,
      throwRiskPenalty: typeof entry.throwAssessment?.scorePenalty === "number" ? entry.throwAssessment.scorePenalty : null,
      throwUnresolvedThreatCount: typeof entry.throwAssessment?.unresolvedThreatCount === "number"
        ? entry.throwAssessment.unresolvedThreatCount
        : null,
      rolloutEvaluation: cloneDebugValue(entry.rolloutEvaluation),
      rolloutFutureEvaluation: cloneDebugValue(entry.rolloutFutureEvaluation),
    }))
    : [];
  const filteredCandidateEntries = Array.isArray(bundle.filteredCandidateEntries)
    ? bundle.filteredCandidateEntries.slice(0, 8).map((entry) => ({
      cards: cloneCardsForSimulation(entry.cards),
      source: entry.source || null,
      tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
      filterReason: entry.filterReason || null,
      detailReason: entry.detailReason || null,
    }))
    : [];
  return {
    historyId: (state.aiDecisionHistorySeq || 0) + 1,
    recordedAtTrickNumber: state.trickNumber || null,
    recordedAtTurnId: state.currentTurnId || null,
    playerId: bundle.playerId,
    mode: bundle.mode,
    objective: cloneDebugValue(bundle.objective),
    evaluation: summarizeEvaluationForDebug(bundle.evaluation),
    candidateEntries,
    filteredCandidateEntries,
    selectedSource: bestEntry?.source || null,
    selectedTags: Array.isArray(bestEntry?.tags) ? [...bestEntry.tags] : [],
    selectedScore: typeof bestEntry?.score === "number" ? bestEntry.score : null,
    selectedDangerousPointLeadPenalty: typeof bestEntry?.dangerousPointLeadPenalty === "number"
      ? bestEntry.dangerousPointLeadPenalty
      : null,
    selectedStructureControlPenalty: typeof bestEntry?.structureControlPenalty === "number"
      ? bestEntry.structureControlPenalty
      : null,
    selectedRolloutTriggerFlags: Array.isArray(bestEntry?.rolloutTriggerFlags) ? [...bestEntry.rolloutTriggerFlags] : [],
    selectedCards: cloneCardsForSimulation(bestEntry?.cards || []),
    selectedBreakdown: cloneDebugValue(bestEntry?.rolloutEvaluation) || summarizeEvaluationForDebug(bundle.evaluation),
    debugStats: summarizeCandidateDebugStats(scoredEntries, bundle.filteredCandidateEntries),
    decisionTimeMs,
  };
}

function recordAiDecisionSnapshot(snapshot) {
  if (!snapshot || !snapshot.playerId || !isAiDecisionDebugEnabled()) return;
  state.aiDecisionHistorySeq = snapshot.historyId || ((state.aiDecisionHistorySeq || 0) + 1);
  state.lastAiDecision = snapshot;
  state.aiDecisionHistory = [...(state.aiDecisionHistory || []), snapshot].slice(-120);
}

function getIntermediateRolloutSummary(playerId, combo, baselineEvaluation, fallbackMode) {
  const rolloutValidation = validateCandidateForState(cloneSimulationState(state), playerId, combo, fallbackMode);
  if (!rolloutValidation.ok) {
    return {
      score: Number.NEGATIVE_INFINITY,
      delta: 0,
      futureDelta: 0,
      completed: false,
      nextMode: fallbackMode,
      winnerId: null,
      points: 0,
      trace: [],
      depth: 0,
      reachedOwnTurn: false,
      futureTrace: [],
      triggerFlags: ["candidate_invalid_before_rollout", rolloutValidation.filterReason || "filtered"],
      nextEvaluation: summarizeEvaluationForDebug(baselineEvaluation),
      futureEvaluation: null,
    };
  }
  const rollout = simulateCandidateToEndOfCurrentTrick(cloneSimulationState(state), playerId, combo);
  const currentWinningPlay = fallbackMode === "follow" ? getCurrentWinningPlay() : null;
  const tentativeDefenderOvertake = fallbackMode === "follow"
    && currentWinningPlay
    && !isFriendTeamResolved()
    && isAiTentativeDefender(playerId)
    && isAiTentativeDefender(currentWinningPlay.playerId)
    && wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay);
  if (!rollout.completed) {
    return {
      score: 0,
      delta: 0,
      futureDelta: 0,
      completed: false,
      nextMode: fallbackMode,
      winnerId: null,
      points: 0,
      trace: rollout.trace || [],
      depth: 0,
      reachedOwnTurn: false,
      futureTrace: [],
      triggerFlags: ["rollout_incomplete"],
      nextEvaluation: summarizeEvaluationForDebug(baselineEvaluation),
      futureEvaluation: null,
    };
  }

  const nextMode = getIntermediateRolloutMode(rollout.resultState, playerId, fallbackMode);
  const nextObjective = getIntermediateObjective(playerId, nextMode, rollout.resultState);
  const nextEvaluation = evaluateState(rollout.resultState, playerId, nextObjective);
  const delta = nextEvaluation.total - (baselineEvaluation?.total || 0);
  const sameSideWin = rollout.winnerId ? isSimulationSameSide(rollout.resultState, playerId, rollout.winnerId) : false;
  let score = delta * 0.35;
  let depth = 1;
  let futureDelta = 0;
  let reachedOwnTurn = false;
  let futureTrace = [];

  if (rollout.winnerId === playerId) {
    score += 16;
  } else if (sameSideWin) {
    score += 8;
  } else if (rollout.winnerId) {
    score -= 10;
  }

  if (rollout.points > 0 && rollout.winnerId) {
    score += sameSideWin ? rollout.points * 1.5 : -rollout.points * 1.5;
  }

  if (tentativeDefenderOvertake) {
    score -= 42;
  }

  const extensionSignals = getIntermediateRolloutExtensionSignals(
    playerId,
    rollout.resultState,
    fallbackMode,
    combo,
    currentWinningPlay
  );

  if (extensionSignals.shouldExtend) {
    const canCheckImmediateNextLead = rollout.resultState.currentTurnId === playerId
      && !rollout.resultState.currentTrick?.length;
    const futureRollout = canCheckImmediateNextLead
      ? (() => {
        const leadSummary = getEndgameSafeLeadSummaryForState(rollout.resultState, playerId);
        const selectedLeadEntry = leadSummary.safeEntry || leadSummary.bestEntry || null;
        if (!selectedLeadEntry) {
          return {
            reachedOwnTurn: true,
            resultState: cloneSimulationState(rollout.resultState),
            trace: [],
            futureTrace: [],
            steps: 0,
            nextTurnId: rollout.resultState.currentTurnId,
            trickNumber: rollout.resultState.trickNumber,
            nextLeadSummary: leadSummary,
            nextLeadWinnerId: null,
            nextLeadSameSideWin: false,
          };
        }
        const nextLeadRollout = simulateCandidateToEndOfCurrentTrick(
          cloneSimulationState(rollout.resultState),
          playerId,
          selectedLeadEntry.cards
        );
        const postLeadTurnRollout = simulateUntilNextOwnTurn(nextLeadRollout.resultState, playerId);
        return {
          reachedOwnTurn: !!postLeadTurnRollout.reachedOwnTurn,
          resultState: postLeadTurnRollout.resultState,
          trace: postLeadTurnRollout.trace || [],
          futureTrace: nextLeadRollout.trace || [],
          steps: (postLeadTurnRollout.steps || 0) + 1,
          nextTurnId: postLeadTurnRollout.nextTurnId,
          trickNumber: postLeadTurnRollout.trickNumber,
          nextLeadSummary: leadSummary,
          nextLeadWinnerId: nextLeadRollout.winnerId || null,
          nextLeadSameSideWin: nextLeadRollout.winnerId
            ? isSimulationSameSide(nextLeadRollout.resultState, playerId, nextLeadRollout.winnerId)
            : false,
        };
      })()
      : simulateUntilNextOwnTurn(rollout.resultState, playerId);
    futureTrace = futureRollout.trace || [];
    reachedOwnTurn = !!futureRollout.reachedOwnTurn;
    const completedNextLeadAccessCheck = canCheckImmediateNextLead && !!futureRollout.nextLeadSummary;
    if (futureRollout.reachedOwnTurn || completedNextLeadAccessCheck) {
      depth = 2;
      const futureMode = getIntermediateRolloutMode(futureRollout.resultState, playerId, nextMode);
      const futureObjective = getIntermediateObjective(playerId, futureMode, futureRollout.resultState);
      const futureEvaluation = evaluateState(futureRollout.resultState, playerId, futureObjective);
      futureDelta = futureEvaluation.total - (baselineEvaluation?.total || 0);
      score += futureDelta * 0.08;
      const triggerFlags = tentativeDefenderOvertake
        ? [...extensionSignals.flags, "tentative_defender_overtake_penalty"]
        : [...extensionSignals.flags];
      if (canCheckImmediateNextLead) {
        futureTrace = [
          ...(futureRollout.futureTrace || []),
          ...(futureRollout.trace || []),
        ];
        if ((futureRollout.nextLeadSummary?.safeLeadCount || 0) === 0) {
          triggerFlags.push("no_safe_next_lead");
          score -= 18;
        }
        if (futureRollout.nextLeadWinnerId && !futureRollout.nextLeadSameSideWin) {
          triggerFlags.push("turn_access_risk");
          score -= 26;
        } else if (futureRollout.nextLeadWinnerId === playerId) {
          triggerFlags.push("turn_access_hold");
          score += 10;
        }
      }
      if ((futureEvaluation?.breakdown?.pointRunRisk || 0) <= -24) {
        triggerFlags.push("point_run_risk");
        score -= 14;
      }
      return {
        score,
        delta,
        futureDelta,
        completed: true,
        nextMode,
        winnerId: rollout.winnerId,
        points: rollout.points || 0,
        trace: rollout.trace || [],
        depth,
        reachedOwnTurn,
        futureTrace,
        triggerFlags,
        nextEvaluation: summarizeEvaluationForDebug(nextEvaluation),
        futureEvaluation: summarizeEvaluationForDebug(futureEvaluation),
      };
    }
  }

  return {
    score,
    delta,
    futureDelta,
    completed: true,
    nextMode,
    winnerId: rollout.winnerId,
    points: rollout.points || 0,
    trace: rollout.trace || [],
    depth,
    reachedOwnTurn,
    futureTrace,
    triggerFlags: tentativeDefenderOvertake
      ? [...extensionSignals.flags, "tentative_defender_overtake_penalty"]
      : extensionSignals.flags,
    nextEvaluation: summarizeEvaluationForDebug(nextEvaluation),
    futureEvaluation: null,
  };
}

/**
 * 作用：
 * 对“结构首发但 rollout 明确提示会掉控”的候选追加惩罚。
 *
 * 为什么这样写：
 * 里程碑 3 的收口问题之一，是结构牌型本身的正向奖励在某些局面仍然过高，
 * 会压过 `turn_access_risk / point_run_risk` 带来的负面价值。
 * 这里把这类惩罚放到 rollout 之后，确保它基于真实前瞻信号而不是静态猜测。
 *
 * 输入：
 * @param {object|null} entry - 已经带有 rollout 结果的首发候选条目。
 * @param {object|null} objective - 当前首发局面的目标配置。
 *
 * 输出：
 * @returns {number} 返回应从候选总分里额外扣除的续控风险惩罚。
 *
 * 注意：
 * - 这里只惩罚 `triple / train / tractor / bulldozer` 这类结构首发，不影响普通单张试探逻辑。
 * - 惩罚依赖 rollout flags 与 future evaluation，不能提前挪回纯 heuristic 阶段。
 */
function scoreIntermediateStructureControlPenalty(entry, objective = null) {
  if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return 0;
  const pattern = classifyPlay(entry.cards);
  if (!["triple", "train", "tractor", "bulldozer"].includes(pattern.type)) return 0;

  const triggerFlags = Array.isArray(entry.rolloutTriggerFlags) ? entry.rolloutTriggerFlags : [];
  const hasTurnAccessRisk = triggerFlags.includes("turn_access_risk");
  const hasPointRunRisk = triggerFlags.includes("point_run_risk");
  if (!hasTurnAccessRisk && !hasPointRunRisk) return 0;

  const primary = objective?.primary || null;
  const secondary = objective?.secondary || null;
  const controlFocusedObjectives = new Set(["keep_control", "clear_trump", "pressure_void", "protect_bottom"]);
  const controlFocused = controlFocusedObjectives.has(primary) || controlFocusedObjectives.has(secondary);
  const futureBreakdown = entry.rolloutFutureEvaluation?.breakdown || {};
  let penalty = 0;

  if (pattern.type === "triple") penalty += 14;
  if (pattern.type === "train") penalty += 18;
  if (pattern.type === "tractor") penalty += 22;
  if (pattern.type === "bulldozer") penalty += 30;

  if (hasTurnAccessRisk) penalty += 18;
  if (hasPointRunRisk) penalty += 16;
  if (hasTurnAccessRisk && hasPointRunRisk) penalty += 12;
  if (controlFocused) penalty += 14;
  if (isFriendTeamResolved() && primary !== "find_friend") penalty += 8;
  if ((futureBreakdown.safeLead || 0) < 0) penalty += 8;
  if ((futureBreakdown.turnAccess || 0) < 0) penalty += 8;
  if ((futureBreakdown.pointRunRisk || 0) <= -24) penalty += 10;

  return penalty;
}

function buildScoredIntermediateLeadEntries(playerId, candidateEntries, beginnerChoice, baselineEvaluation = null) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return [];
  const baseEvaluation = baselineEvaluation || evaluateState(
    cloneSimulationState(state),
    playerId,
    getIntermediateObjective(playerId, "lead", cloneSimulationState(state))
  );
  return candidateEntries
    .map((entry) => {
      const heuristicScore = scoreIntermediateLeadCandidate(playerId, entry.cards, beginnerChoice, entry);
      const rollout = getIntermediateRolloutSummary(playerId, entry.cards, baseEvaluation, "lead");
      const rolloutEntry = {
        ...entry,
        heuristicScore,
        rolloutScore: rollout.score,
        rolloutDelta: rollout.delta,
        rolloutCompleted: rollout.completed,
        rolloutWinnerId: rollout.winnerId,
        rolloutPoints: rollout.points,
        rolloutNextMode: rollout.nextMode,
        rolloutTrace: rollout.trace,
        rolloutDepth: rollout.depth,
        rolloutFutureDelta: rollout.futureDelta,
        rolloutReachedOwnTurn: rollout.reachedOwnTurn,
        rolloutFutureTrace: rollout.futureTrace,
        rolloutTriggerFlags: rollout.triggerFlags,
        rolloutEvaluation: rollout.nextEvaluation,
        rolloutFutureEvaluation: rollout.futureEvaluation,
      };
      const structureControlPenalty = scoreIntermediateStructureControlPenalty(rolloutEntry, baseEvaluation?.objective);
      return {
        ...rolloutEntry,
        structureControlPenalty,
        score: heuristicScore + rollout.score - structureControlPenalty,
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a.cards).power - classifyPlay(b.cards).power;
    });
}

function buildScoredIntermediateFollowEntries(
  playerId,
  candidateEntries,
  currentWinningPlay,
  allyWinning,
  beginnerChoice,
  baselineEvaluation = null
) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return [];
  const baseEvaluation = baselineEvaluation || evaluateState(
    cloneSimulationState(state),
    playerId,
    getIntermediateObjective(playerId, "follow", cloneSimulationState(state))
  );
  return candidateEntries
    .map((entry) => {
      const heuristicScore = scoreIntermediateFollowCandidate(
        playerId,
        entry.cards,
        currentWinningPlay,
        allyWinning,
        beginnerChoice
      );
      const rollout = getIntermediateRolloutSummary(playerId, entry.cards, baseEvaluation, "follow");
      return {
        ...entry,
        heuristicScore,
        rolloutScore: rollout.score,
        rolloutDelta: rollout.delta,
        rolloutCompleted: rollout.completed,
        rolloutWinnerId: rollout.winnerId,
        rolloutPoints: rollout.points,
        rolloutNextMode: rollout.nextMode,
        rolloutTrace: rollout.trace,
        rolloutDepth: rollout.depth,
        rolloutFutureDelta: rollout.futureDelta,
        rolloutReachedOwnTurn: rollout.reachedOwnTurn,
        rolloutFutureTrace: rollout.futureTrace,
        rolloutTriggerFlags: rollout.triggerFlags,
        rolloutEvaluation: rollout.nextEvaluation,
        rolloutFutureEvaluation: rollout.futureEvaluation,
        score: heuristicScore + rollout.score,
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a.cards).power - classifyPlay(b.cards).power;
    });
}

function buildIntermediateDecisionBundle(playerId, mode, liveCandidates = null) {
  return buildIntermediateDecisionBundleForState(playerId, mode, state, liveCandidates);
}

/**
 * 作用：
 * 把外部已枚举好的 liveCandidates 转成中级决策可消费的候选条目。
 *
 * 为什么这样写：
 * 跟牌候选有时已经在调用方完成合法性枚举，这里只补齐 source、tags 等元数据，
 * 同时保证这些标签按传入的 sourceState 计算，而不是继续偷读 live state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前决策使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要构建候选条目的玩家 ID。
 * @param {Array<Array<object>>} liveCandidates - 调用方传入的合法候选牌组集合。
 *
 * 输出：
 * @returns {Array<object>} 返回去重后的候选条目列表。
 *
 * 注意：
 * - 这里不会重新校验合法性，默认 `liveCandidates` 已经合法。
 * - `beats` 与 `matched` 必须基于 sourceState 计算，否则 debug 信息会和真实 rollout 上下文错位。
 */
function buildIntermediateCandidateEntriesFromLiveCandidates(sourceState, playerId, liveCandidates) {
  const rawEntries = dedupeCandidateEntries(liveCandidates.map((cards) => {
    const pattern = classifyPlay(cards);
    const tags = [getCandidatePatternTag(pattern), pattern.suit || effectiveSuit(cards[0])];
    return createCandidateEntry(cards, "legal", tags);
  }));
  return filterCandidateEntriesForState(sourceState, playerId, "follow", rawEntries);
}

function buildIntermediateDecisionBundleForState(playerId, mode, sourceState = state, liveCandidates = null) {
  const simState = cloneSimulationState(sourceState);
  const objective = getIntermediateObjective(playerId, mode, simState);
  const candidateResult = mode === "follow" && Array.isArray(liveCandidates)
    ? buildIntermediateCandidateEntriesFromLiveCandidates(sourceState, playerId, liveCandidates)
    : generateCandidateResultForState(sourceState, playerId, mode);
  const evaluation = evaluateState(simState, playerId, objective);
  return {
    playerId,
    mode,
    sourceState,
    objective,
    evaluation,
    candidateEntries: candidateResult.entries,
    filteredCandidateEntries: candidateResult.filteredEntries,
  };
}

function chooseIntermediatePlay(playerId, mode, liveCandidates = null) {
  const decisionStartedAt = getDecisionTimestamp();
  const bundle = buildIntermediateDecisionBundle(playerId, mode, liveCandidates);
  const beginnerChoice = getBeginnerLegalHintForPlayer(playerId);

  if (mode === "lead") {
    const forcedReveal = getForcedCertainFriendRevealPlay(playerId);
    if (forcedReveal.length > 0) return forcedReveal;
    const scoredEntries = buildScoredIntermediateLeadEntries(
      playerId,
      bundle.candidateEntries,
      beginnerChoice,
      bundle.evaluation
    );
    const bestEntry = scoredEntries[0] || null;
    recordAiDecisionSnapshot(createAiDecisionSnapshot(
      bundle,
      scoredEntries,
      bestEntry,
      Math.round((getDecisionTimestamp() - decisionStartedAt) * 100) / 100
    ));
    return bestEntry?.cards || [];
  }

  const candidates = Array.isArray(liveCandidates) ? liveCandidates : bundle.candidateEntries.map((entry) => entry.cards);
  if (candidates.length === 0) return [];
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId, candidates);
  if (forcedReveal.length > 0) return forcedReveal;
  const currentWinningPlay = getCurrentWinningPlay();
  const allyWinning = currentWinningPlay ? areAiSameSide(playerId, currentWinningPlay.playerId) : false;
  const revealOpportunity = canAiRevealFriendNow(playerId);
  const shouldDelayReveal = revealOpportunity && shouldAiDelayRevealOnOpeningLead(playerId);
  const revealChoice = revealOpportunity ? chooseAiRevealCombo(candidates) : [];
  const revealBeats = revealChoice.length > 0 && currentWinningPlay
    ? wouldAiComboBeatCurrent(playerId, revealChoice, currentWinningPlay)
    : false;
  const supportChoice = revealOpportunity ? chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) : [];

  if (supportChoice.length > 0) return supportChoice;
  if (!shouldDelayReveal && revealChoice.length > 0 && (revealBeats || currentWinningPlay?.playerId !== state.bankerId)
    && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  const scoredEntries = buildScoredIntermediateFollowEntries(
    playerId,
    bundle.candidateEntries,
    currentWinningPlay,
    allyWinning,
    beginnerChoice,
    bundle.evaluation
  );
  const bestEntry = scoredEntries[0] || null;
  recordAiDecisionSnapshot(createAiDecisionSnapshot(
    bundle,
    scoredEntries,
    bestEntry,
    Math.round((getDecisionTimestamp() - decisionStartedAt) * 100) / 100
  ));
  return bestEntry?.cards || [];
}

// 选择中级 AI 的首发出牌。
function chooseIntermediateLeadPlay(playerId) {
  const finalLead = getFinalTrickLegalLeadCards(playerId);
  if (finalLead.length > 0) {
    return finalLead;
  }
  return chooseIntermediatePlay(playerId, "lead");
}

// 选择中级 AI 的跟牌出牌。
function chooseIntermediateFollowPlay(playerId, candidates) {
  return chooseIntermediatePlay(playerId, "follow", candidates);
}

// 选择 AI 当前的首发出牌。
function chooseAiLeadPlay(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId);
  if (forcedReveal.length > 0) return forcedReveal;
  const noTrumpPowerLead = chooseAiNoTrumpBankerPowerLead(playerId, player);
  if (noTrumpPowerLead.length > 0) return noTrumpPowerLead;
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
  const safeAntiRuffLead = chooseAiSafeAntiRuffLead(playerId, player);
  if (safeAntiRuffLead.length > 0) return safeAntiRuffLead;
  const voidPressureLead = chooseAiVoidPressureLead(playerId, player);
  if (voidPressureLead.length > 0) return voidPressureLead;
  return [];
}

// 选择 AI 当前的跟牌出牌。
function chooseAiFollowPlay(playerId, candidates) {
  if (candidates.length === 0) return [];
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId, candidates);
  if (forcedReveal.length > 0) return forcedReveal;
  const currentWinningPlay = getCurrentWinningPlay();
  const allyWinning = currentWinningPlay ? areAiSameSide(playerId, currentWinningPlay.playerId) : false;
  const beatingCandidates = candidates.filter((combo) => doesSelectionBeatCurrent(playerId, combo));
  const revealOpportunity = canAiRevealFriendNow(playerId);
  const revealChoice = revealOpportunity ? chooseAiRevealCombo(candidates) : [];
  const supportChoice = revealOpportunity ? chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) : [];

  if (supportChoice.length > 0) {
    return supportChoice;
  }

  if (revealChoice.length > 0 && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  if (!allyWinning && beatingCandidates.length > 0) {
    return beatingCandidates.sort((a, b) => {
      const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
      if (structureDiff !== 0) return structureDiff;
      const aPattern = classifyPlay(a);
      const bPattern = classifyPlay(b);
      const powerDiff = aPattern.power - bPattern.power;
      if (powerDiff !== 0) return powerDiff;
      return a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    })[0];
  }

  const bottomPrepDiscard = chooseAiBottomPrepDiscard(playerId, candidates, currentWinningPlay);
  if (bottomPrepDiscard.length > 0) {
    return bottomPrepDiscard;
  }

  if (allyWinning) {
    const nonBeating = candidates.filter((combo) => !doesSelectionBeatCurrent(playerId, combo));
    const feedChoices = nonBeating.length > 0 ? nonBeating : candidates;
    return feedChoices.sort((a, b) => {
      const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
      if (structureDiff !== 0) return structureDiff;
      const scoreDiff = b.reduce((sum, card) => sum + scoreValue(card), 0) - a.reduce((sum, card) => sum + scoreValue(card), 0);
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a).power - classifyPlay(b).power;
    })[0];
  }

  if (revealChoice.length > 0) {
    return revealChoice;
  }

  return candidates.sort((a, b) => {
    const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
    if (structureDiff !== 0) return structureDiff;
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

// 获取跟牌结构评分。
function getFollowStructureScore(combo) {
  if (!state.leadSpec) return 0;
  const pattern = classifyPlay(combo);
  const comboSuit = pattern.suit || effectiveSuit(combo[0]);
  const followsLeadSuit = comboSuit === state.leadSpec.suit;
  const suitedCount = combo.filter((card) => effectiveSuit(card) === state.leadSpec.suit).length;
  let score = suitedCount * 10;

  if (matchesLeadPattern(pattern, state.leadSpec)) {
    if (followsLeadSuit) {
      score += 1000;
    } else if (comboSuit === "trump") {
      score += 120;
    } else {
      score += 40;
    }
  }

  if (state.leadSpec.type === "pair") {
    score += getForcedPairUnits(combo) * (followsLeadSuit ? 120 : comboSuit === "trump" ? 18 : 6);
  } else if (state.leadSpec.type === "triple") {
    score += getTripleUnits(combo) * (followsLeadSuit ? 150 : comboSuit === "trump" ? 24 : 8);
    score += getForcedPairUnits(combo) * (followsLeadSuit ? 40 : comboSuit === "trump" ? 10 : 4);
  } else if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
    score += getForcedPairUnits(combo) * (followsLeadSuit ? 140 : comboSuit === "trump" ? 20 : 8);
  } else if (state.leadSpec.type === "bulldozer") {
    const tripleUnits = getTripleUnits(combo);
    score += tripleUnits * (followsLeadSuit ? 160 : comboSuit === "trump" ? 26 : 10);
    score += getForcedPairUnitsWithReservedTriples(combo, tripleUnits) * (followsLeadSuit ? 50 : comboSuit === "trump" ? 12 : 5);
  }

  return score;
}

/**
 * 作用：
 * 在指定状态下生成初级 AI 的跟牌提示主体。
 *
 * 为什么这样写：
 * 里程碑 2 需要把提示层也切到显式 `sourceState`，这样候选层、提示层、模拟层才能共用同一套状态接口，
 * 避免 sourceState 与 live state 不一致时，提示逻辑又悄悄回退到全局 `state`。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回在 sourceState 下的初级跟牌提示。
 *
 * 注意：
 * - 这里只处理“当前墩非空”的跟牌主体；首发仍通过局部适配保留现有行为。
 * - 特殊亮友、基础跟牌结构和搜索兜底都会按 sourceState 计算。
 */
function getBeginnerFollowHintForState(sourceState, playerId) {
  const player = getSimulationPlayer(sourceState, playerId);
  const leadSpec = sourceState?.leadSpec || null;
  if (!player || !leadSpec || !sourceState?.currentTrick?.length) return [];

  const hand = player.hand;
  const candidates = getLegalSelectionsForState(sourceState, playerId);
  const forcedReveal = runCandidateLegacyHelper(sourceState, () => getForcedCertainFriendRevealPlay(playerId, candidates));
  if (forcedReveal.length > 0) return forcedReveal;
  const aiChoice = runCandidateLegacyHelper(sourceState, () => chooseAiFollowPlay(playerId, candidates));
  if (aiChoice.length > 0) return aiChoice;

  if (leadSpec.type === "single") {
    const suitedSingleCards = hand.filter((card) => effectiveSuit(card) === leadSpec.suit);
    return suitedSingleCards.length > 0 ? [lowestCard(suitedSingleCards)] : [lowestCard(hand)];
  }

  const suited = hand.filter((card) => effectiveSuit(card) === leadSpec.suit);
  if (suited.length >= leadSpec.count) {
    if (leadSpec.type === "pair") {
      const suitedPairs = findPairs(suited);
      if (hasForcedPair(suited) && suitedPairs.length > 0) return suitedPairs[0];
    }
    if (leadSpec.type === "triple") {
      const suitedTriples = findTriples(suited);
      if (suitedTriples.length > 0) return suitedTriples[0];
      const searchedTriple = findLegalSelectionBySearchForState(sourceState, playerId);
      if (searchedTriple.length > 0) return searchedTriple;
    }
    if (leadSpec.type === "tractor" || leadSpec.type === "train" || leadSpec.type === "bulldozer" || leadSpec.type === "throw") {
      const combos = getPatternCombos(suited, leadSpec);
      if (combos.length > 0) return combos[0];
      const searchedStructure = findLegalSelectionBySearchForState(sourceState, playerId);
      if (searchedStructure.length > 0) return searchedStructure;
    }
    return suited.slice(-leadSpec.count);
  }

  if (suited.length > 0) {
    const searchedPartialSuit = findLegalSelectionBySearchForState(sourceState, playerId);
    if (searchedPartialSuit.length > 0) return searchedPartialSuit;
    const fillers = hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id));
    return [...suited, ...fillers.slice(0, leadSpec.count - suited.length)];
  }

  const trumpCards = hand.filter((card) => effectiveSuit(card) === "trump");
  if (leadSpec.type === "pair") {
    const trumpPairs = findPairs(trumpCards);
    if (trumpPairs.length > 0) return trumpPairs[0];
  }
  if (leadSpec.type === "triple") {
    const trumpTriples = findTriples(trumpCards);
    if (trumpTriples.length > 0) return trumpTriples[0];
  }
  if (leadSpec.type === "tractor" || leadSpec.type === "train" || leadSpec.type === "bulldozer" || leadSpec.type === "throw") {
    const trumpCombos = getPatternCombos(trumpCards, leadSpec);
    if (trumpCombos.length > 0) return trumpCombos[0];
  }
  const searchedTrump = findLegalSelectionBySearchForState(sourceState, playerId);
  if (searchedTrump.length > 0) return searchedTrump;
  return hand.slice(0, leadSpec.count);
}

/**
 * 作用：
 * 在指定状态下生成初级 AI 的合法出牌提示。
 *
 * 为什么这样写：
 * 候选层和模拟层都已经开始转向显式 `sourceState`，提示层如果继续只读全局 `state`，
 * 就会重新引入里程碑 2 想要消掉的状态耦合。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回在 sourceState 下的初级提示牌组。
 *
 * 注意：
 * - 首发分支当前仍通过局部适配保留既有特殊规则与 lead 启发式。
 * - 跟牌主体已经切换为 sourceState 驱动。
 */
function getBeginnerLegalHintForState(sourceState, playerId) {
  const player = getSimulationPlayer(sourceState, playerId);
  if (!player) return [];

  if (!sourceState?.currentTrick?.length) {
    return runCandidateLegacyHelper(sourceState, () => {
      const hand = getPlayer(playerId)?.hand || [];
      const finalLead = getFinalTrickLegalLeadCards(playerId);
      if (finalLead.length > 0) {
        return finalLead;
      }
      const forcedReveal = getForcedCertainFriendRevealPlay(playerId);
      if (forcedReveal.length > 0) return forcedReveal;
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
    });
  }

  return getBeginnerFollowHintForState(sourceState, playerId);
}

/**
 * 作用：
 * 为当前 live state 生成初级 AI 的合法出牌提示。
 *
 * 为什么这样写：
 * 用户交互层仍以 live state 为主入口，但内部逻辑统一转发到 stateful helper，
 * 方便候选层、模拟层和主流程共享同一套 sourceState 语义。
 *
 * 输入：
 * @param {number} playerId - 需要生成提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回当前 live state 下的初级提示牌组。
 *
 * 注意：
 * - 这是兼容旧调用点的 wrapper，不应再承载新的核心逻辑。
 * - 真正的状态敏感逻辑都应写进 `getBeginnerLegalHintForState`。
 */
function getBeginnerLegalHintForPlayer(playerId) {
  return getBeginnerLegalHintForState(state, playerId);
}

/**
 * 作用：
 * 在指定状态下生成中级 AI 的合法出牌提示。
 *
 * 为什么这样写：
 * 中级搜索已经有 sourceState 候选与 rollout，提示入口也需要切到同一套状态接口，
 * 否则模拟链和真实决策链看到的候选环境会不一致。
 *
 * 输入：
 * @param {object|null} sourceState - 当前提示使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回在 sourceState 下的中级提示牌组。
 *
 * 注意：
 * - 中级 lead/follow 决策主体当前仍复用既有选择器，但会被包在 sourceState 适配层内执行。
 * - 当中级链路没给出结果时，会回落到 stateful 的 beginner hint。
 */
function getIntermediateLegalHintForState(sourceState, playerId) {
  const player = getSimulationPlayer(sourceState, playerId);
  if (!player) return [];

  if (!sourceState?.currentTrick?.length) {
    const forcedLeadReveal = runCandidateLegacyHelper(sourceState, () => getForcedCertainFriendRevealPlay(playerId));
    if (forcedLeadReveal.length > 0) return forcedLeadReveal;
    const leadChoice = runCandidateLegacyHelper(sourceState, () => chooseIntermediateLeadPlay(playerId));
    return leadChoice.length > 0 ? leadChoice : getBeginnerLegalHintForState(sourceState, playerId);
  }

  const candidates = getLegalSelectionsForState(sourceState, playerId);
  const forcedFollowReveal = runCandidateLegacyHelper(sourceState, () => getForcedCertainFriendRevealPlay(playerId, candidates));
  if (forcedFollowReveal.length > 0) return forcedFollowReveal;
  if (candidates.length > 0) {
    const followChoice = runCandidateLegacyHelper(sourceState, () => chooseIntermediateFollowPlay(playerId, candidates));
    if (followChoice.length > 0) return followChoice;
  }
  return getBeginnerLegalHintForState(sourceState, playerId);
}

/**
 * 作用：
 * 为当前 live state 生成中级 AI 的合法出牌提示。
 *
 * 为什么这样写：
 * 保留旧调用入口不变，同时把真正的状态敏感逻辑统一到 `getIntermediateLegalHintForState`。
 *
 * 输入：
 * @param {number} playerId - 需要生成提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回当前 live state 下的中级提示牌组。
 *
 * 注意：
 * - 这是兼容层 wrapper，不应再继续堆积核心策略逻辑。
 * - 后续如果中级主决策也完成纯 state 化，这里只需要保留简单转发。
 */
function getIntermediateLegalHintForPlayer(playerId) {
  return getIntermediateLegalHintForState(state, playerId);
}
