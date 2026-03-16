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

/**
 * 作用：
 * 统计指定玩家在当前模拟状态下手里还持有多少张朋友牌。
 *
 * 为什么这样写：
 * `Friend Belief Lite` 的第一层信息就是“我自己是否握着目标牌”。
 * 这比纯看公开桌面更强，但仍然属于当前玩家可合法使用的私有信息，不涉及透视其他玩家暗手。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要统计目标牌张数的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回该玩家当前手里持有的朋友牌张数；状态缺失时返回 0。
 *
 * 注意：
 * - 这里只统计当前玩家自己的手牌，不会读取其他玩家暗手。
 * - 未叫朋友时直接返回 0，避免后续 belief helper 到处重复判空。
 */
function getSimulationTargetCopiesInHand(simState, playerId) {
  const target = simState?.friendTarget;
  const player = getSimulationPlayer(simState, playerId);
  if (!target || !player || !Array.isArray(player.hand)) return 0;
  return player.hand.filter((card) => card.suit === target.suit && card.rank === target.rank).length;
}

/**
 * 作用：
 * 返回朋友牌在当前规则下对应的“有效跟牌花色”。
 *
 * 为什么这样写：
 * `Friend Belief Lite` 需要判断某人公开断门后，是否还可能持有朋友牌。
 * 这个判断不能只看原始牌面花色，因为级牌或无主时，朋友牌的实际跟牌花色可能已经转成 `trump`。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 *
 * 输出：
 * @returns {string|null} 返回朋友牌的有效花色；没有朋友牌时返回 `null`。
 *
 * 注意：
 * - 王张朋友牌统一按 `trump` 处理。
 * - 非王张也要经过 `effectiveSuit(...)`，避免主级牌场景误判。
 */
function getSimulationFriendTargetEffectiveSuit(simState) {
  const target = simState?.friendTarget;
  if (!target) return null;
  if (target.suit === "joker") return "trump";
  return effectiveSuit({
    id: `friend-target-${target.suit}-${target.rank}`,
    suit: target.suit,
    rank: target.rank,
  });
}

/**
 * 作用：
 * 判断某位玩家在公开信息下是否仍“可能”持有朋友牌。
 *
 * 为什么这样写：
 * 轻量 belief 的重点不是猜中真实暗手，而是先排除那些已经被公开断门信息否掉的席位。
 * 这样中级在未站队阶段就不会继续对明显不可能成友的玩家投入过多策略权重。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} candidateId - 需要判断的候选玩家 ID。
 *
 * 输出：
 * @returns {boolean} 若公开信息下该玩家仍可能持有朋友牌，则返回 `true`。
 *
 * 注意：
 * - 这里只根据断门信息排除“不可能”，不会把“未排除”当成“高度确定”。
 * - 王张和转主级牌都按目标牌的有效花色判断。
 */
function canSimulationPlayerStillHoldFriendTarget(simState, candidateId) {
  if (!simState?.friendTarget || candidateId === simState.bankerId) return false;
  const targetSuit = getSimulationFriendTargetEffectiveSuit(simState);
  if (!targetSuit) return false;
  if (targetSuit === "trump") {
    return !simState.exposedTrumpVoid?.[candidateId];
  }
  return !simState.exposedSuitVoid?.[candidateId]?.[targetSuit];
}

/**
 * 作用：
 * 统计某位玩家已经公开打出的“朋友牌同门非目标牌”数量。
 *
 * 为什么这样写：
 * 在未站队阶段，如果某人已经连续公开打出这门里的低牌却始终没露出目标牌，
 * 那么他仍可能持有目标，但相对概率会下降；这是一条弱但公开可解释的行为信号。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} candidateId - 需要统计的候选玩家 ID。
 *
 * 输出：
 * @returns {number} 返回该玩家已公开打出的同门非目标牌数量。
 *
 * 注意：
 * - 这里按目标牌的有效花色统计，兼容主级牌 / 无主场景。
 * - 真正打出的目标牌会单独统计，不混进这个数量里。
 */
function getSimulationPlayedFriendSuitNonTargetCount(simState, candidateId) {
  const target = simState?.friendTarget;
  const player = getSimulationPlayer(simState, candidateId);
  const targetSuit = getSimulationFriendTargetEffectiveSuit(simState);
  if (!target || !player || !Array.isArray(player.played) || !targetSuit) return 0;
  return player.played.filter((card) => {
    if (card.suit === target.suit && card.rank === target.rank) return false;
    return effectiveSuit(card) === targetSuit;
  }).length;
}

/**
 * 作用：
 * 统计某位玩家已经公开打出的朋友牌副本数。
 *
 * 为什么这样写：
 * 当叫的是第二张或第三张时，之前已经公开打出的目标牌副本会显著改变“谁更像朋友”。
 * 这条信息完全来自公开行为，适合用作 `Friend Belief Lite` 的核心输入之一。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} candidateId - 需要统计的候选玩家 ID。
 *
 * 输出：
 * @returns {number} 返回该玩家已经公开打出的目标牌副本数。
 *
 * 注意：
 * - 这里只看该玩家自己的公开出牌记录，不依赖全知来源。
 * - 未叫朋友时返回 0。
 */
function getSimulationPlayedTargetCopyCount(simState, candidateId) {
  const target = simState?.friendTarget;
  const player = getSimulationPlayer(simState, candidateId);
  if (!target || !player || !Array.isArray(player.played)) return 0;
  return player.played.filter((card) => card.suit === target.suit && card.rank === target.rank).length;
}

/**
 * 作用：
 * 为 `Friend Belief Lite` 计算某位候选玩家的公开可解释成友分。
 *
 * 为什么这样写：
 * 当前中级在未站队阶段还没有真正的概率态，只能靠若干硬门槛判断。
 * 这里先把“自己手里是否持有目标牌”“公开断门是否已经排除”“是否曾公开打出前置副本”
 * 和“是否已经连续打掉同门低牌”合成一个轻量分数，作为后续 objective 与评估器的共同输入。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} observerId - 当前正在做判断的玩家 ID。
 * @param {number} candidateId - 需要估计成友可能性的候选玩家 ID。
 *
 * 输出：
 * @returns {number} 返回候选玩家的成友分；越高表示越像朋友。
 *
 * 注意：
 * - 这里只允许 `observerId` 使用自己的暗手信息；对其他玩家只使用公开信息。
 * - 分值只用于同一局面内相对比较，不代表真实概率。
 */
function scoreSimulationFriendBeliefCandidate(simState, observerId, candidateId) {
  if (!simState?.friendTarget || candidateId === simState.bankerId) return Number.NEGATIVE_INFINITY;
  const neededOccurrence = simState.friendTarget.occurrence || 1;
  const seenCopies = simState.friendTarget.matchesSeen || 0;
  const remainingNeeded = Math.max(0, neededOccurrence - seenCopies);
  const ownTargetCopies = candidateId === observerId ? getSimulationTargetCopiesInHand(simState, candidateId) : 0;
  const playedTargetCopies = getSimulationPlayedTargetCopyCount(simState, candidateId);
  const playedNonTargetSuitCards = getSimulationPlayedFriendSuitNonTargetCount(simState, candidateId);
  let score = 18;

  if (!canSimulationPlayerStillHoldFriendTarget(simState, candidateId)) {
    score -= 54;
  } else {
    score += 8;
  }

  if (candidateId === observerId) {
    score += ownTargetCopies * 42;
    if (remainingNeeded > 0 && ownTargetCopies >= remainingNeeded) score += 34;
    if (neededOccurrence >= 2 && seenCopies + ownTargetCopies >= neededOccurrence && seenCopies + ownTargetCopies >= 3) {
      score += 48;
    }
  }

  if (playedTargetCopies > 0) {
    score += playedTargetCopies * 26;
  }

  if (playedNonTargetSuitCards > 0) {
    score -= Math.min(18, playedNonTargetSuitCards * 4);
  }

  return score;
}

/**
 * 作用：
 * 构造当前玩家视角下的 `Friend Belief Lite` 摘要。
 *
 * 为什么这样写：
 * 中级现阶段不需要完整 beliefState，但需要一份稳定、可解释的轻量画像：
 * 1. 谁当前最像朋友。
 * 2. 我自己更像朋友还是更像闲家。
 * 3. 这个判断是否已经足够清晰，可以让 objective 提前切换打法。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} observerId - 当前正在做判断的玩家 ID。
 *
 * 输出：
 * @returns {{likelyFriendId: number|null, confidenceGap: number, selfLean: number, orderedCandidates: Array<object>}} 返回轻量 belief 摘要。
 *
 * 注意：
 * - `selfLean` 为正表示“我更像朋友”，为负表示“我更像闲家”。
 * - `confidenceGap` 越大表示当前最像朋友的人越明确。
 */
function buildSimulationFriendBeliefProfile(simState, observerId) {
  if (!simState?.friendTarget || isSimulationFriendTeamResolved(simState)) {
    return {
      likelyFriendId: null,
      confidenceGap: 0,
      selfLean: 0,
      orderedCandidates: [],
    };
  }

  const orderedCandidates = simState.players
    .map((player) => ({
      playerId: player.id,
      score: scoreSimulationFriendBeliefCandidate(simState, observerId, player.id),
    }))
    .filter((entry) => entry.playerId !== simState.bankerId && Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);

  const likelyFriendId = orderedCandidates[0]?.playerId ?? null;
  const topScore = orderedCandidates[0]?.score ?? 0;
  const secondScore = orderedCandidates[1]?.score ?? 0;
  const selfEntry = orderedCandidates.find((entry) => entry.playerId === observerId) || null;
  const comparisonScore = likelyFriendId === observerId ? secondScore : topScore;
  return {
    likelyFriendId,
    confidenceGap: Math.max(0, topScore - secondScore),
    selfLean: selfEntry ? selfEntry.score - comparisonScore : 0,
    orderedCandidates,
  };
}

/**
 * 作用：
 * 返回当前玩家在未站队阶段“更像朋友还是更像闲家”的轻量倾向值。
 *
 * 为什么这样写：
 * objective 层真正需要的不是完整概率表，而是一个足够稳定的方向信号，
 * 用来决定当前这名非打家 AI 应继续偏“找朋友/帮庄”，还是提前偏“施压/控牌”。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估倾向值的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回倾向值；正值表示更像朋友，负值表示更像闲家。
 *
 * 注意：
 * - 打家自己不需要这项倾向判断，因此固定返回 0。
 * - 已站队后也不再使用这项倾向值。
 */
function getSimulationFriendBeliefLean(simState, playerId) {
  if (!simState?.friendTarget || isSimulationFriendTeamResolved(simState) || playerId === simState.bankerId) return 0;
  return buildSimulationFriendBeliefProfile(simState, playerId).selfLean;
}

/**
 * 作用：
 * 为统一评估器提供一项“成友可信度”分值。
 *
 * 为什么这样写：
 * `Friend Belief Lite` 不只是为了改 objective，也需要在 breakdown 里留下可解释信号。
 * 这里不再只看“方向是否清晰”，而是更偏向衡量“我有多像朋友”，
 * 这样分值方向就更符合后续调权重时的直觉。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回 belief 分值；越高表示当前玩家越像朋友。
 *
 * 注意：
 * - 负值表示当前玩家更像闲家，不适合继续按朋友路线投入过多权重。
 * - 打家和已站队阶段不使用这项分值，避免与真实阵营信息重复。
 */
function getSimulationFriendBeliefScore(simState, playerId) {
  if (!simState?.friendTarget || isSimulationFriendTeamResolved(simState)) return 0;
  if (playerId === simState.bankerId) {
    const belief = buildSimulationFriendBeliefProfile(simState, playerId);
    return Math.min(20, belief.confidenceGap * 0.45);
  }
  const beliefLean = getSimulationFriendBeliefLean(simState, playerId);
  if (beliefLean > 0) {
    return Math.min(28, 4 + beliefLean * 0.55);
  }
  if (beliefLean < 0) {
    return Math.max(-18, beliefLean * 0.35);
  }
  return 0;
}

function getSimulationFriendScore(simState, playerId) {
  if (!simState.friendTarget || isSimulationFriendTeamResolved(simState)) return 0;
  const player = getSimulationPlayer(simState, playerId);
  if (!player) return 0;
  const targetCopies = player.hand.filter((card) =>
    card.suit === simState.friendTarget.suit && card.rank === simState.friendTarget.rank
  ).length;
  const seen = simState.friendTarget.matchesSeen || 0;
  const beliefLean = getSimulationFriendBeliefLean(simState, playerId);
  let score = targetCopies * 18 + seen * 10;
  if (playerId !== simState.bankerId) {
    if (beliefLean > 0) score += Math.min(18, beliefLean * 0.35);
    else if (beliefLean < 0) score += Math.max(-12, beliefLean * 0.22);
  }
  return score;
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

/**
 * 作用：
 * 评估当前局面对“已知队友协同”是否友好。
 *
 * 为什么这样写：
 * 朋友已站队后，中级 AI 不能只是把 `find_friend` 权重降下来，
 * 还需要显式看懂“当前牌权是否落在已知队友手里”“是否值得继续让同侧维持节奏”。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估协同价值的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回队友协同分；正值表示当前局面更利于已知队友协同。
 *
 * 注意：
 * - 只有在朋友已站队后才生效，未站队阶段返回 0。
 * - 该项强调“已知同侧谁在控牌”，不读取任何对手暗手。
 */
function getSimulationAllySupportScore(simState, playerId) {
  if (!simState || !PLAYER_ORDER.includes(playerId) || !isSimulationFriendTeamResolved(simState)) return 0;
  const allies = simState.players
    .map((player) => player.id)
    .filter((otherId) => otherId !== playerId && isSimulationSameSide(simState, playerId, otherId));
  if (allies.length === 0) return 0;

  const controllerId = getSimulationTurnAccessControllerId(simState);
  const trickPoints = Array.isArray(simState.currentTrick)
    ? simState.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards || []), 0)
    : 0;
  let score = 0;

  if (controllerId != null) {
    if (allies.includes(controllerId)) score += 20 + trickPoints * 0.4;
    else if (controllerId === playerId) score += 8 + trickPoints * 0.15;
    else score -= 16 + trickPoints * 0.35;
  }

  if (!simState.currentTrick?.length) {
    if (allies.includes(simState.currentTurnId)) score += 10;
    else if (simState.currentTurnId === playerId) score += 4;
    else score -= 6;
  }

  if (allies.includes(simState.leaderId)) score += 5;
  if (simState.hiddenFriendId && allies.includes(simState.hiddenFriendId)) score += 4;
  return score;
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
 * 这里统一处理“正在进行中的一轮”和“已经结算、准备下一拍”的两种状态，避免多个评估项各算一套。
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
 * 中级第二版评估需要把“不是所有赢轮都值得抢”真正沉到评分器里。
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
  const belief = buildSimulationFriendBeliefProfile(simState, playerId);
  const beliefLean = getSimulationFriendBeliefLean(simState, playerId);
  let score = 0;

  if (playerId === simState.bankerId) {
    score -= targetCopies * 20;
    if (remainingToReveal > 0 && targetCopies >= remainingToReveal) {
      score -= 28;
    }
    if (belief.confidenceGap >= 14) score += Math.min(14, belief.confidenceGap * 0.3);
    return score;
  }

  if (targetCopies > 0) {
    score += Math.min(targetCopies, remainingToReveal || targetCopies) * 10;
  }
  if (beliefLean > 0) score += Math.min(18, beliefLean * 0.4);
  else if (beliefLean < 0) score += Math.max(-18, beliefLean * 0.35);
  else score += 2;
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
 * 评估当前局面下“失先手后对手继续连拿分墩”的风险。
 *
 * 为什么这样写：
 * `controlRisk` 已经表达了“掉控本身很痛”，但里程碑 3 还需要把
 * “掉控后会不会连续跑分”单独做成可解释分项，避免这类风险被埋在综合负分里。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估连续跑分风险的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回连续跑分风险分值；越负表示越容易被对手连续拿分。
 *
 * 注意：
 * - 这里只使用当前牌权位置、当前墩分数、公开底牌分和己方控牌储备，不读取对手暗手。
 * - 该项与 `controlRisk` 配套使用，但更强调“掉控后的分数后果”。
 */
function getSimulationPointRunRiskScore(simState, playerId) {
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
  const reserveScore = Math.min(getSimulationTurnAccessReserveScore(simState, playerId), 28);
  const unresolvedFriend = !!simState.friendTarget && !isSimulationFriendTeamResolved(simState);
  const visibleRunPressure = trickPoints > 0 || (lateRound && bottomPoints > 0) || (simState.defenderPoints || 0) >= 40;
  let risk = 0;

  if (!visibleRunPressure) return 0;

  if (!sameSideControl) {
    risk += trickPoints * 3.1;
    if (lateRound) risk += bottomPoints * 0.7;
    if (!simState.currentTrick?.length) risk += 10;
    if (!unresolvedFriend && playerId === simState.bankerId) {
      risk += Math.min(simState.defenderPoints || 0, 80) * 0.18;
    }
    risk += Math.max(0, 18 - reserveScore) * 1.4;
    if (unresolvedFriend) risk *= 0.4;
    return -risk;
  }

  if (trickPoints > 0) {
    return Math.min(trickPoints * 0.55, 12);
  }
  return 0;
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
    friendBelief: getSimulationFriendBeliefScore(simState, playerId),
    allySupport: getSimulationAllySupportScore(simState, playerId),
    bottom: getSimulationBottomScore(simState, playerId),
    voidPressure: getSimulationVoidPressureScore(simState, playerId),
    tempo: getSimulationTempoScore(simState, playerId),
    turnAccess: getSimulationTurnAccessScore(simState, playerId),
    controlRisk: getSimulationControlRiskScore(simState, playerId),
    pointRunRisk: getSimulationPointRunRiskScore(simState, playerId),
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
