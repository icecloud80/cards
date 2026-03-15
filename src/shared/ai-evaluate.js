function scoreSimulationHandContinuity(simState, playerId, hand) {
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
  score += voidCount * (isSimulationDefenderTeam(simState, playerId) ? 3 : 1);
  return score;
}

function getSimulationStructureScore(simState, playerId) {
  const player = getSimulationPlayer(simState, playerId);
  return player ? scoreSimulationHandContinuity(simState, playerId, player.hand) : 0;
}

function getSimulationControlScore(simState, playerId) {
  const player = getSimulationPlayer(simState, playerId);
  if (!player) return 0;
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const highTrumpCards = trumpCards.filter((card) => getPatternUnitPower(card, "trump") >= 15);
  return trumpCards.length * 10 + highTrumpCards.length * 8;
}

function getSimulationPointsScore(simState, playerId) {
  const player = getSimulationPlayer(simState, playerId);
  if (!player) return 0;
  const unresolvedFriend = !isSimulationFriendTeamResolved(simState);
  let ownPoints = player.roundPoints || 0;
  if (unresolvedFriend) {
    const provisionalPoints = Math.max(player.roundPoints || 0, player.capturedPoints || 0);
    const targetCopies = simState.friendTarget
      ? player.hand.filter((card) => card.suit === simState.friendTarget.suit && card.rank === simState.friendTarget.rank).length
      : 0;
    if (playerId === simState.bankerId) {
      ownPoints = provisionalPoints;
    } else {
      ownPoints = provisionalPoints * (targetCopies > 0 ? 0.6 : 0.2);
    }
  }
  const teamBonus = isSimulationDefenderTeam(simState, playerId) ? simState.defenderPoints || 0 : 0;
  return ownPoints + teamBonus;
}

function getSimulationFriendScore(simState, playerId) {
  if (!simState.friendTarget || isSimulationFriendTeamResolved(simState)) return 0;
  const player = getSimulationPlayer(simState, playerId);
  if (!player) return 0;
  const targetCopies = player.hand.filter((card) =>
    card.suit === simState.friendTarget.suit && card.rank === simState.friendTarget.rank
  ).length;
  const seen = simState.friendTarget.matchesSeen || 0;
  return targetCopies * 18 + seen * 10;
}

function getSimulationBottomScore(simState, playerId) {
  if (!isSimulationDefenderTeam(simState, playerId)) return 0;
  const cardsLeft = simState.players.reduce((sum, player) => sum + (player.hand?.length || 0), 0);
  const bottomPoints = (simState.bottomCards || []).reduce((sum, card) => sum + scoreValue(card), 0);
  return cardsLeft <= 20 ? bottomPoints : bottomPoints * 0.3;
}

function getSimulationVoidPressureScore(simState, playerId) {
  const player = getSimulationPlayer(simState, playerId);
  if (!player) return 0;
  return SUITS.reduce((sum, suit) => {
    const suitCount = player.hand.filter((card) => effectiveSuit(card) === suit).length;
    if (suitCount === 0) return sum;
    const pressureCount = PLAYER_ORDER.filter((otherId) =>
      otherId !== playerId && simState.exposedSuitVoid?.[otherId]?.[suit]
    ).length;
    return sum + pressureCount * 12;
  }, 0);
}

function getSimulationCurrentWinningPlay(simState) {
  if (!simState?.currentTrick?.length) return null;
  if (!simState.leadSpec) return simState.currentTrick[0] || null;

  if (simState.leadSpec.type === "single") {
    let winner = simState.currentTrick[0];
    for (const play of simState.currentTrick.slice(1)) {
      if (compareSingle(play.cards[0], winner.cards[0], simState.leadSpec.suit) > 0) {
        winner = play;
      }
    }
    return winner;
  }

  let best = simState.currentTrick[0];
  let bestPattern = classifyPlay(best.cards);
  for (const play of simState.currentTrick.slice(1)) {
    const pattern = classifyPlay(play.cards);
    if (!matchesLeadPattern(pattern, simState.leadSpec)) continue;
    if (compareSameTypePlay(pattern, bestPattern, simState.leadSpec.suit) > 0) {
      best = play;
      bestPattern = pattern;
    }
  }
  return best;
}

/**
 * 作用：
 * 统计当前模拟状态下全桌还剩多少手牌，用于判断是否进入残局。
 *
 * 为什么这样写：
 * `牌权续控`、`失先手代价` 和 `残局安全起手值` 都会在残局显著放大。
 * 把剩余手牌计数集中在一个 helper 里，可以避免多个评估项各自重复遍历玩家列表。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 *
 * 输出：
 * @returns {number} 返回全桌剩余手牌总数；状态缺失时返回 0。
 *
 * 注意：
 * - 这里只统计张数，不读取对手暗手牌面的具体信息。
 * - 该值主要用于阶段判断，不应直接替代更细的局势评估。
 */
function getSimulationCardsLeft(simState) {
  if (!Array.isArray(simState?.players)) return 0;
  return simState.players.reduce((sum, player) => sum + (player.hand?.length || 0), 0);
}

/**
 * 作用：
 * 估计当前玩家在模拟状态下还能用多少公开可解释资源维持牌权。
 *
 * 为什么这样写：
 * `牌权续控` 和 `失先手代价` 不能只看“当前是不是自己领先”，
 * 还要看领先之后手里是否还有主牌、高主和成型结构来继续控牌。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估牌权续控储备的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回一个只基于自己手牌结构的控牌储备分值。
 *
 * 注意：
 * - 这里只使用当前玩家自己的手牌，不读取其他玩家暗手。
 * - 分值只用于相对比较，不代表真实胜率。
 */
function getSimulationTurnAccessReserveScore(simState, playerId) {
  const player = getSimulationPlayer(simState, playerId);
  if (!player || !Array.isArray(player.hand)) return 0;
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const highTrumpCards = trumpCards.filter((card) => getPatternUnitPower(card, "trump") >= 15);
  const trumpPairs = findPairs(trumpCards).length;
  const trumpTractors = findSerialTuples(trumpCards, 2).filter((combo) => classifyPlay(combo).type === "tractor").length;
  const sideAcesAndKings = player.hand.filter((card) =>
    effectiveSuit(card) !== "trump" && (card.rank === "A" || card.rank === "K")
  ).length;
  let score = 0;
  score += trumpCards.length * 4;
  score += highTrumpCards.length * 7;
  score += trumpPairs * 8;
  score += trumpTractors * 14;
  score += sideAcesAndKings * 3;
  return score;
}

/**
 * 作用：
 * 返回当前模拟状态下“谁正在掌握这手牌权”的公开可解释视角。
 *
 * 为什么这样写：
 * `牌权续控` 和 `失先手代价` 的前提是先知道当前牌权落在谁手里。
 * 这里统一处理“正在进行中的一墩”和“已经结算、准备下一拍”的两种状态，避免多个评估项各算一套。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 *
 * 输出：
 * @returns {number|null} 返回当前控制牌权的玩家 ID；无法判断时返回 null。
 *
 * 注意：
 * - 当前墩尚未结束时，以当前赢牌者视为临时牌权持有者。
 * - 当前墩为空时，以 `currentTurnId` 作为下一拍牌权入口。
 */
function getSimulationTurnAccessControllerId(simState) {
  if (!simState) return null;
  if (Array.isArray(simState.currentTrick) && simState.currentTrick.length > 0) {
    return getSimulationCurrentWinningPlay(simState)?.playerId ?? null;
  }
  return PLAYER_ORDER.includes(simState.currentTurnId) ? simState.currentTurnId : null;
}

function getSimulationTempoScore(simState, playerId) {
  if (!simState || !PLAYER_ORDER.includes(playerId)) return 0;
  if (simState.phase === "ending") {
    return isSimulationSameSide(simState, playerId, simState.currentTurnId) ? 12 : -12;
  }

  let score = 0;
  const sameSideTurn = PLAYER_ORDER.includes(simState.currentTurnId)
    && isSimulationSameSide(simState, playerId, simState.currentTurnId);

  if (!simState.currentTrick?.length) {
    if (simState.currentTurnId === playerId) score += 24;
    else if (sameSideTurn) score += 12;
    else score -= 12;
    if (simState.leaderId && isSimulationSameSide(simState, playerId, simState.leaderId)) {
      score += 6;
    }
    return score;
  }

  const winningPlay = getSimulationCurrentWinningPlay(simState);
  if (winningPlay) {
    score += isSimulationSameSide(simState, playerId, winningPlay.playerId) ? 10 : -10;
  }
  if (simState.currentTurnId === playerId) score += 6;
  else if (sameSideTurn) score += 3;
  return score;
}

/**
 * 作用：
 * 评估当前局面对玩家而言的 `牌权续控` 价值。
 *
 * 为什么这样写：
 * 之前 `turnAccess` 主要停留在 rollout 扩展标签和 future delta 上，
 * 现在需要把“当前是谁控牌、控牌后手里是否还有资源续住”正式沉到 `evaluateState` 里。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回当前局面的 `牌权续控` 分值，正值表示更有利于我方继续控牌。
 *
 * 注意：
 * - 这里只使用当前牌权位置、公开阶段信息和玩家自己的控牌储备。
 * - 该分值和 `tempo` 有关联，但更强调“这手之后还能不能继续控”。
 */
function getSimulationTurnAccessScore(simState, playerId) {
  if (!simState || !PLAYER_ORDER.includes(playerId)) return 0;
  const cardsLeft = getSimulationCardsLeft(simState);
  const lateRound = cardsLeft <= 20;
  const unresolvedFriend = !!simState.friendTarget && !isSimulationFriendTeamResolved(simState);
  const controllerId = getSimulationTurnAccessControllerId(simState);
  const sameSideControl = controllerId != null && isSimulationSameSide(simState, playerId, controllerId);
  const reserveScore = Math.min(getSimulationTurnAccessReserveScore(simState, playerId), 44);
  let score = sameSideControl ? 20 : -18;

  if (!simState.currentTrick?.length && simState.currentTurnId === playerId) {
    score += 12;
  } else if (!simState.currentTrick?.length && controllerId != null) {
    score += isSimulationSameSide(simState, playerId, controllerId) ? 6 : -6;
  }

  score += sameSideControl ? reserveScore * 0.7 : reserveScore * 0.18;
  if (lateRound) score += sameSideControl ? 12 : -12;
  if (unresolvedFriend) score *= 0.55;
  return score;
}

/**
 * 作用：
 * 评估当前局面下“一旦失去先手会有多痛”的代价。
 *
 * 为什么这样写：
 * 中级第二版评估需要把“不是所有赢墩都值得抢”真正沉到评分器里。
 * 如果当前局面已经被对手控住，或者一旦掉控就会同时影响末局保底和当前分墩，就应该给显式惩罚。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回失先手代价分值；值越负表示掉控越痛。
 *
 * 注意：
 * - 这里依赖的风险信号只来自当前牌权位置、当前墩分数、底牌分数和自己的控牌储备。
 * - 该项是“代价”项，因此正常情况下会返回 0 或负值。
 */
function getSimulationControlRiskScore(simState, playerId) {
  if (!simState || !PLAYER_ORDER.includes(playerId)) return 0;
  const controllerId = getSimulationTurnAccessControllerId(simState);
  if (controllerId == null) return 0;

  const sameSideControl = isSimulationSameSide(simState, playerId, controllerId);
  const cardsLeft = getSimulationCardsLeft(simState);
  const lateRound = cardsLeft <= 20;
  const trickPoints = Array.isArray(simState.currentTrick)
    ? simState.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards || []), 0)
    : 0;
  const bottomPoints = (simState.bottomCards || []).reduce((sum, card) => sum + scoreValue(card), 0);
  const reserveScore = Math.min(getSimulationTurnAccessReserveScore(simState, playerId), 36);
  let risk = 0;

  if (!sameSideControl) {
    risk += 14;
    risk += trickPoints * 2.8;
    risk += lateRound ? bottomPoints * 0.9 : bottomPoints * 0.2;
    risk += Math.max(0, 22 - reserveScore) * 1.2;
    if (!simState.currentTrick?.length) risk += 8;
    return -risk;
  }

  if (!simState.currentTrick?.length && simState.currentTurnId === playerId && lateRound && reserveScore < 12) {
    return -(12 - reserveScore) * 1.2;
  }

  return 0;
}

/**
 * 作用：
 * 评估当前残局轮到自己首发时，是否存在足够安全的下一拍起手。
 *
 * 为什么这样写：
 * rollout 里虽然已经会打 `endgame_safe_lead_check / no_safe_next_lead`，
 * 但如果 `evaluateState` 不直接认识“这拍能否安全起手”，future delta 仍然不够稳定。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估残局起手安全性的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回残局安全起手分值；无安全起手时返回明显负分。
 *
 * 注意：
 * - 只在残局且当前轮到自己首发时生效，避免把候选层成本扩散到普通局面。
 * - 内部只评估当前玩家自己的候选，不会读取对手暗手。
 */
function getSimulationSafeLeadScore(simState, playerId) {
  if (!simState || !PLAYER_ORDER.includes(playerId)) return 0;
  const cardsLeft = getSimulationCardsLeft(simState);
  const lateRound = cardsLeft <= 20;
  const immediateOwnLead = !simState.currentTrick?.length && simState.currentTurnId === playerId;
  const unresolvedFriend = !!simState.friendTarget && !isSimulationFriendTeamResolved(simState);
  if (!lateRound || !immediateOwnLead || typeof getEndgameSafeLeadSummaryForState !== "function") {
    return 0;
  }
  if (unresolvedFriend) return 0;

  const leadSummary = getEndgameSafeLeadSummaryForState(simState, playerId);
  if (!leadSummary?.bestEntry) return -24;
  if (!leadSummary.safeEntry) {
    const fallbackScore = Math.max(-20, Math.min(leadSummary.bestEntry.heuristicScore || 0, 12));
    return -30 + fallbackScore * 0.35;
  }

  let score = 18;
  score += Math.min(leadSummary.safeLeadCount || 0, 3) * 7;
  score += Math.max(-6, Math.min(leadSummary.safeEntry.heuristicScore || 0, 28)) * 0.5;
  if (getComboKey(leadSummary.safeEntry.cards) === getComboKey(leadSummary.bestEntry.cards)) {
    score += 8;
  }
  return score;
}

function getSimulationFriendRiskScore(simState, playerId) {
  if (!simState?.friendTarget || isSimulationFriendTeamResolved(simState)) return 0;
  const player = getSimulationPlayer(simState, playerId);
  if (!player) return 0;

  const targetCopies = player.hand.filter((card) =>
    card.suit === simState.friendTarget.suit && card.rank === simState.friendTarget.rank
  ).length;
  const remainingToReveal = Math.max(0, (simState.friendTarget.occurrence || 1) - (simState.friendTarget.matchesSeen || 0));
  let score = 0;

  if (playerId === simState.bankerId) {
    score -= targetCopies * 20;
    if (remainingToReveal > 0 && targetCopies >= remainingToReveal) {
      score -= 28;
    }
    return score;
  }

  if (targetCopies > 0) {
    score += Math.min(targetCopies, remainingToReveal || targetCopies) * 10;
  } else {
    score += 4;
  }
  return score;
}

function getSimulationBottomRiskScore(simState, playerId) {
  if (!simState?.players?.length) return 0;
  const cardsLeft = simState.players.reduce((sum, player) => sum + (player.hand?.length || 0), 0);
  if (cardsLeft > 20) return 0;

  const bottomPoints = (simState.bottomCards || []).reduce((sum, card) => sum + scoreValue(card), 0);
  if (bottomPoints <= 0) return 0;

  const currentControllerId = simState.currentTrick?.length > 0
    ? getSimulationCurrentWinningPlay(simState)?.playerId
    : simState.currentTurnId;
  const sameSideControl = currentControllerId != null && isSimulationSameSide(simState, playerId, currentControllerId);
  const controlReserve = getSimulationControlScore(simState, playerId);

  let score = sameSideControl ? bottomPoints * 0.9 : -bottomPoints * 0.9;
  score += sameSideControl ? Math.min(controlReserve, 24) * 0.35 : Math.min(controlReserve, 24) * 0.15;
  return score;
}

/**
 * 作用：
 * 用统一评分项评估模拟状态，对中级搜索输出可解释 breakdown。
 *
 * 为什么这样写：
 * 中级第二版的重点不是继续堆更多 rollout 标签，而是让 `evaluateState` 自己看懂
 * `牌权续控 / 失先手代价 / 残局安全起手值` 这类核心局势信号，这样 `delta / futureDelta` 才会稳定反映真实价值。
 *
 * 输入：
 * @param {object} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要站在其视角下评分的玩家 ID。
 * @param {object} [objective=getIntermediateObjective(playerId, "lead", simState)] - 当前局面的目标权重配置。
 *
 * 输出：
 * @returns {{total: number, breakdown: object, objective: object}} 返回总分、分项明细和使用的目标权重。
 *
 * 注意：
 * - breakdown 的每一项都应保持“可解释”，方便 debug 面板直接展示。
 * - 新增评估项后，需要同步在 objective 权重里给出默认权重，否则会被按 1 参与总分。
 */
function evaluateState(simState, playerId, objective = getIntermediateObjective(playerId, "lead", simState)) {
  const breakdown = {
    structure: getSimulationStructureScore(simState, playerId),
    control: getSimulationControlScore(simState, playerId),
    points: getSimulationPointsScore(simState, playerId),
    friend: getSimulationFriendScore(simState, playerId),
    bottom: getSimulationBottomScore(simState, playerId),
    voidPressure: getSimulationVoidPressureScore(simState, playerId),
    tempo: getSimulationTempoScore(simState, playerId),
    turnAccess: getSimulationTurnAccessScore(simState, playerId),
    controlRisk: getSimulationControlRiskScore(simState, playerId),
    safeLead: getSimulationSafeLeadScore(simState, playerId),
    friendRisk: getSimulationFriendRiskScore(simState, playerId),
    bottomRisk: getSimulationBottomRiskScore(simState, playerId),
  };

  const weights = objective?.weights || {};
  const total = Object.entries(breakdown).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 1), 0);

  return {
    total,
    breakdown,
    objective,
  };
}
