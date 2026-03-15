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
function scoreIntermediateLeadCandidate(playerId, combo, beginnerChoice) {
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
  score += scoreRememberedStructurePromotion(playerId, combo);

  if (combo.every((card) => effectiveSuit(card) === "trump") && !isDefenderTeam(playerId)) {
    score -= 10;
  }

  return score;
}

function selectBestIntermediateLeadCandidate(playerId, candidateEntries, beginnerChoice) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return null;
  return buildScoredIntermediateLeadEntries(playerId, candidateEntries, beginnerChoice)[0] || null;
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
  const bottomSensitive = lateRound && isSimulationDefenderTeam(simState, playerId);
  const trumpCount = player.hand.filter((card) => effectiveSuit(card) === "trump").length;
  const structureCount = getStructureCombosFromHand(player.hand).length;
  const flags = [];
  if (unresolvedFriend) flags.push("unresolved_friend");
  if (bottomSensitive) flags.push("late_bottom_pressure");
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

function summarizeCandidateDebugStats(candidateEntries) {
  const entries = Array.isArray(candidateEntries) ? candidateEntries : [];
  const maxRolloutDepth = entries.reduce((max, entry) => Math.max(max, entry.rolloutDepth || 0), 0);
  const extendedRolloutCount = entries.filter((entry) => entry.rolloutDepth >= 2).length;
  const completedRolloutCount = entries.filter((entry) => entry.rolloutCompleted).length;
  return {
    candidateCount: entries.length,
    completedRolloutCount,
    extendedRolloutCount,
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
      rolloutScore: typeof entry.rolloutScore === "number" ? entry.rolloutScore : null,
      rolloutFutureDelta: typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : null,
      rolloutDepth: entry.rolloutDepth ?? 0,
      rolloutReachedOwnTurn: !!entry.rolloutReachedOwnTurn,
      rolloutTriggerFlags: Array.isArray(entry.rolloutTriggerFlags) ? [...entry.rolloutTriggerFlags] : [],
      rolloutEvaluation: cloneDebugValue(entry.rolloutEvaluation),
      rolloutFutureEvaluation: cloneDebugValue(entry.rolloutFutureEvaluation),
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
    selectedSource: bestEntry?.source || null,
    selectedTags: Array.isArray(bestEntry?.tags) ? [...bestEntry.tags] : [],
    selectedScore: typeof bestEntry?.score === "number" ? bestEntry.score : null,
    selectedCards: cloneCardsForSimulation(bestEntry?.cards || []),
    selectedBreakdown: cloneDebugValue(bestEntry?.rolloutEvaluation) || summarizeEvaluationForDebug(bundle.evaluation),
    debugStats: summarizeCandidateDebugStats(scoredEntries),
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
    const futureRollout = simulateUntilNextOwnTurn(rollout.resultState, playerId);
    futureTrace = futureRollout.trace || [];
    reachedOwnTurn = !!futureRollout.reachedOwnTurn;
    if (futureRollout.reachedOwnTurn) {
      depth = 2;
      const futureMode = getIntermediateRolloutMode(futureRollout.resultState, playerId, nextMode);
      const futureObjective = getIntermediateObjective(playerId, futureMode, futureRollout.resultState);
      const futureEvaluation = evaluateState(futureRollout.resultState, playerId, futureObjective);
      futureDelta = futureEvaluation.total - (baselineEvaluation?.total || 0);
      score += futureDelta * 0.08;
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

function buildScoredIntermediateLeadEntries(playerId, candidateEntries, beginnerChoice, baselineEvaluation = null) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return [];
  const baseEvaluation = baselineEvaluation || evaluateState(
    cloneSimulationState(state),
    playerId,
    getIntermediateObjective(playerId, "lead", cloneSimulationState(state))
  );
  return candidateEntries
    .map((entry) => {
      const heuristicScore = scoreIntermediateLeadCandidate(playerId, entry.cards, beginnerChoice);
      const rollout = getIntermediateRolloutSummary(playerId, entry.cards, baseEvaluation, "lead");
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

function buildIntermediateCandidateEntriesFromLiveCandidates(sourceState, playerId, liveCandidates) {
  return withCandidateSourceState(sourceState, () => dedupeCandidateEntries(liveCandidates.map((cards) => {
    const pattern = classifyPlay(cards);
    const tags = [pattern.type, pattern.suit || effectiveSuit(cards[0])];
    if (doesSelectionBeatCurrent(playerId, cards)) tags.push("beats");
    if (matchesLeadPattern(pattern, state.leadSpec)) tags.push("matched");
    return createCandidateEntry(cards, "legal", tags);
  })));
}

function buildIntermediateDecisionBundleForState(playerId, mode, sourceState = state, liveCandidates = null) {
  const simState = cloneSimulationState(sourceState);
  const objective = getIntermediateObjective(playerId, mode, simState);
  const candidateEntries = mode === "follow" && Array.isArray(liveCandidates)
    ? buildIntermediateCandidateEntriesFromLiveCandidates(sourceState, playerId, liveCandidates)
    : generateCandidatePlays(sourceState, playerId, mode);
  const evaluation = evaluateState(simState, playerId, objective);
  return {
    playerId,
    mode,
    sourceState,
    objective,
    evaluation,
    candidateEntries,
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

// 为初级 AI 生成合法出牌提示。
function getBeginnerLegalHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];

  const hand = player.hand;
  if (state.currentTrick.length === 0) {
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
  }

  const candidates = getLegalSelectionsForPlayer(playerId);
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId, candidates);
  if (forcedReveal.length > 0) return forcedReveal;
  const aiChoice = chooseAiFollowPlay(playerId, candidates);
  if (aiChoice.length > 0) return aiChoice;

  if (state.leadSpec.type === "single") {
    const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
    return suited.length > 0 ? [lowestCard(suited)] : [lowestCard(hand)];
  }

  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
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
    const searched = findLegalSelectionBySearch(playerId);
    if (searched.length > 0) return searched;
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
  const searched = findLegalSelectionBySearch(playerId);
  if (searched.length > 0) return searched;
  return hand.slice(0, state.leadSpec.count);
}

// 为中级 AI 生成合法出牌提示。
function getIntermediateLegalHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  if (state.currentTrick.length === 0) {
    const forcedReveal = getForcedCertainFriendRevealPlay(playerId);
    if (forcedReveal.length > 0) return forcedReveal;
    const leadChoice = chooseIntermediateLeadPlay(playerId);
    return leadChoice.length > 0 ? leadChoice : getBeginnerLegalHintForPlayer(playerId);
  }
  const candidates = getLegalSelectionsForPlayer(playerId);
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId, candidates);
  if (forcedReveal.length > 0) return forcedReveal;
  if (candidates.length > 0) {
    const followChoice = chooseIntermediateFollowPlay(playerId, candidates);
    if (followChoice.length > 0) return followChoice;
  }
  return getBeginnerLegalHintForPlayer(playerId);
}
