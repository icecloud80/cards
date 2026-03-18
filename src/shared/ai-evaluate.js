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

/**
 * 作用：
 * 返回模拟状态里当前局面的级牌点数。
 *
 * 为什么这样写：
 * 中级 objective 和评估器现在都需要识别 `J / Q / K / A` 这类“级牌扣底优先级更高”的特殊级；
 * 把级别读取集中到这里后，模拟态和真实态都能共用同一层口径。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 *
 * 输出：
 * @returns {string} 返回当前局面的级牌点数；缺失时回退到实时局面的级牌。
 *
 * 注意：
 * - 这里只返回点数，不负责判断升级或降级。
 * - 回退到 `getCurrentLevelRank()` 是为了兼容旧测试场景里没有单独复制 `levelRank` 的情况。
 */
function getSimulationCurrentLevelRank(simState) {
  return simState?.levelRank || getCurrentLevelRank();
}

/**
 * 作用：
 * 为中级评估器生成一份“我有没有级牌扣底潜力”的模拟态画像。
 *
 * 为什么这样写：
 * 之前级牌扣底画像只在 live heuristic 里存在，objective 和 rollout 评估器看不到这条路线；
 * 这一版把画像搬进模拟态后，中级才能在搜索链路里正式识别“值不值得提早吊主、保王、保级牌结构”。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估的玩家 ID。
 *
 * 输出：
 * @returns {{
 *   eligible: boolean,
 *   active: boolean,
 *   potential: "none" | "possible" | "strong",
 *   specialPriority: boolean,
 *   tentativeDefender: boolean,
 *   delayedRevealWindow: boolean,
 *   gradeCardCount: number,
 *   gradeStructureCount: number,
 *   trumpCount: number,
 *   highControlTrumpCount: number
 * }} 返回当前玩家在模拟态下的级牌扣底画像。
 *
 * 注意：
 * - 这里只使用当前玩家自己的手牌和公开状态，不读取任何其他玩家暗手。
 * - `active` 代表“这条路线当前值得进入 objective / 评分器”，不代表一定会作为唯一目标。
 */
function getSimulationGradeBottomProfile(simState, playerId) {
  const player = getSimulationPlayer(simState, playerId);
  if (!player || playerId === simState?.bankerId) {
    return {
      eligible: false,
      active: false,
      potential: "none",
      specialPriority: false,
      tentativeDefender: false,
      delayedRevealWindow: false,
      gradeCardCount: 0,
      gradeStructureCount: 0,
      trumpCount: 0,
      highControlTrumpCount: 0,
    };
  }

  const levelRank = getSimulationCurrentLevelRank(simState);
  const specialPriority = FACE_CARD_LEVELS.has(levelRank);
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const gradeCards = player.hand.filter((card) => !!getBottomPenaltyModeForCard(card));
  const gradeStructureCount = getStructureCombosFromHand(player.hand).filter((combo) =>
    combo.some((card) => !!getBottomPenaltyModeForCard(card))
  ).length;
  const highControlTrumpCount = trumpCards.filter((card) => {
    if (card.suit === "joker") return true;
    if (card.rank === levelRank) return false;
    return ["A", "K"].includes(card.rank);
  }).length;
  const unresolvedFriend = !!simState?.friendTarget && !isSimulationFriendTeamResolved(simState);
  const ownTargetCopies = unresolvedFriend ? getSimulationTargetCopiesInHand(simState, playerId) : 0;
  const seenCopies = simState?.friendTarget?.matchesSeen || 0;
  const neededOccurrence = simState?.friendTarget?.occurrence || 1;
  const remainingNeeded = Math.max(0, neededOccurrence - seenCopies);
  const tentativeDefender = unresolvedFriend && ownTargetCopies === 0;
  const delayedRevealWindow = unresolvedFriend
    && ownTargetCopies > 0
    && ownTargetCopies >= remainingNeeded
    && ownTargetCopies < 3
    && (simState?.trickNumber || 1) <= (specialPriority ? 7 : 6);
  const beliefLean = unresolvedFriend && playerId !== simState.bankerId
    ? getSimulationFriendBeliefLean(simState, playerId)
    : 0;

  let potential = "none";
  if (
    (gradeCards.length >= 2 && trumpCards.length >= 6 && highControlTrumpCount >= 2)
    || (specialPriority && gradeCards.length >= 1 && gradeStructureCount > 0 && trumpCards.length >= 6 && highControlTrumpCount >= 2)
  ) {
    potential = "strong";
  } else if (
    ((gradeCards.length >= 1 || gradeStructureCount > 0) && trumpCards.length >= 5 && highControlTrumpCount >= 1)
    || (specialPriority && (gradeCards.length >= 1 || gradeStructureCount > 0) && trumpCards.length >= 4 && highControlTrumpCount >= 1)
  ) {
    potential = "possible";
  }

  const resolvedDefender = isSimulationFriendTeamResolved(simState) && isSimulationDefenderTeam(simState, playerId);
  const active = potential !== "none"
    && (resolvedDefender || tentativeDefender || delayedRevealWindow || beliefLean <= -8);

  return {
    eligible: true,
    active,
    potential,
    specialPriority,
    tentativeDefender,
    delayedRevealWindow,
    gradeCardCount: gradeCards.length,
    gradeStructureCount,
    trumpCount: trumpCards.length,
    highControlTrumpCount,
  };
}

/**
 * 作用：
 * 为中级评估器提供一项“级牌扣底路线当前值不值得押”的专项分值。
 *
 * 为什么这样写：
 * 用户希望中级不只是沿用初级的入口 heuristic，而是能把“级牌扣底”正式当成局内目标；
 * 因此这里把手里级牌、主长度、大主控制和特殊级优先级合成独立 breakdown，供 objective 直接加权。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回级牌扣底专项分；越高表示这条路线越值得当前 AI 投入。
 *
 * 注意：
 * - 这是一项“路线价值”分，不直接代表本轮能否立即完成扣底。
 * - 特殊级 `J / Q / K / A` 会显著抬高这项分值，反映“降庄级别本身就很赚”的设计口径。
 */
function getSimulationGradeBottomScore(simState, playerId) {
  const profile = getSimulationGradeBottomProfile(simState, playerId);
  if (!profile.active) return 0;

  const cardsLeft = getSimulationCardsLeft(simState);
  const controllerId = getSimulationTurnAccessControllerId(simState);
  const sameSideControl = controllerId != null && isSimulationSameSide(simState, playerId, controllerId);
  let score = profile.potential === "strong" ? 28 : 16;
  score += profile.gradeCardCount * 8;
  score += Math.min(profile.gradeStructureCount, 2) * 10;
  score += profile.highControlTrumpCount * 9;
  if (profile.specialPriority) score += 20;
  if (cardsLeft <= 20) score += 12;
  if (sameSideControl) score += 8;
  else score -= 6;
  if (profile.tentativeDefender) score += 8;
  if (profile.delayedRevealWindow) score += 6;
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
 * 评估朋友已站队后，当前控牌是否属于“可安全续控 / 可顺势让同侧接手”的健康状态。
 *
 * 为什么这样写：
 * 当前 `turnAccess / controlRisk / pointRunRisk / safeLead` 已经能描述控牌收益与失手代价，
 * 但还缺一项专门回答“这份控制是不是已经过热”的统一评分。
 * 这轮路线图要求在朋友已站队后给 `clear_trump / keep_control` 降温，
 * 因此这里补一项 `controlExit`：
 * - 奖励“同侧已稳住、并且可以由队友接手或安全退出”的状态；
 * - 惩罚“虽然眼前还在控牌，但安全起手差、失先手代价高、还继续把高张硬攥在自己手里”的状态；
 * - 若牌权已经落到敌侧，也要把这条失败直接显式化，而不是只让其它风险项间接体现。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估该分项的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回 `controlExit` 分值；正值表示控牌可健康续控或可顺势交给同侧，负值表示当前控制过热或已失控。
 *
 * 注意：
 * - 只在朋友已站队后生效，未站队阶段固定返回 0。
 * - 该项不读取对手暗手，只使用当前牌权位置、己方储备、残局安全起手和公开风险信号。
 */
function getSimulationControlExitScore(simState, playerId) {
  if (!simState || !PLAYER_ORDER.includes(playerId) || !isSimulationFriendTeamResolved(simState)) return 0;

  const controllerId = getSimulationTurnAccessControllerId(simState);
  if (controllerId == null) return 0;

  const sameSideControl = isSimulationSameSide(simState, playerId, controllerId);
  const controllerIsSelf = controllerId === playerId;
  const cardsLeft = getSimulationCardsLeft(simState);
  const lateRound = cardsLeft <= 20;
  const trickPoints = Array.isArray(simState.currentTrick)
    ? simState.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards || []), 0)
    : 0;
  const reserveScore = Math.min(getSimulationTurnAccessReserveScore(simState, playerId), 28);
  const allySupport = getSimulationAllySupportScore(simState, playerId);
  const safeLead = getSimulationSafeLeadScore(simState, playerId);
  const controlRisk = getSimulationControlRiskScore(simState, playerId);
  const pointRunRisk = getSimulationPointRunRiskScore(simState, playerId);
  let score = 0;

  if (!sameSideControl) {
    score -= 18;
    score += Math.max(-22, controlRisk * 0.45);
    score += Math.max(-24, pointRunRisk * 0.45);
    if (lateRound) score -= 8;
    return score;
  }

  if (controllerIsSelf) {
    score += 6;
    score += Math.min(10, reserveScore * 0.18);
  } else {
    score += 16;
    score += Math.min(14, Math.max(0, allySupport) * 0.3);
  }

  if (lateRound) score += 6;
  score += Math.max(-16, Math.min(18, safeLead * 0.45));
  score += Math.max(-16, pointRunRisk * 0.28);
  score += Math.max(-14, controlRisk * 0.22);

  if (controllerIsSelf && reserveScore <= 10) score -= 12;
  if (controllerIsSelf && safeLead < 0) score -= Math.min(14, Math.abs(safeLead) * 0.35);
  if (!controllerIsSelf && safeLead >= 0) score += 6;
  if (controllerIsSelf && trickPoints > 0 && (safeLead < 0 || pointRunRisk < 0)) {
    score -= 8 + trickPoints * 0.5;
  }
  if (!controllerIsSelf && trickPoints > 0 && pointRunRisk >= -6) {
    score += Math.min(8, 3 + trickPoints * 0.25);
  }

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

/**
 * 作用：
 * 评估朋友未站队阶段，当前局面对“高张试探是否过热”的风险。
 *
 * 为什么这样写：
 * 这轮路线图要补的是“未站队阶段高张试探预算 + 回手保障”。
 * `probeRisk` 不直接判断某张牌该不该出，而是统一衡量当前模拟结果是否已经
 * “为了试探朋友付出了太多高张 / 主控 / 带分资源，却没有换来更好的找友进展或回手保障”。
 * 这样 rollout 之后的 `evaluateState(...)` 就能把这类局面显式算成负面结果，
 * 而不是只靠若干局部 heuristic 零散兜底。
 *
 * 输入：
 * @param {object|null} simState - 当前模拟或真实牌局状态。
 * @param {number} playerId - 需要评估该分项的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回 `probeRisk` 分值；正值表示当前试探成本可接受，负值表示试探过热。
 *
 * 注意：
 * - 只在 `friendTarget` 未站队时生效；朋友已站队后固定返回 `0`。
 * - 这里只看当前公开局势、玩家自己的保留资源和轻量 belief，不读取他人暗手。
 * - `probeRisk` 与 `friendRisk` 不同：前者关注“试探成本是否值得”，后者关注“找朋友本身是否危险”。
 */
function getSimulationProbeRiskScore(simState, playerId) {
  if (!simState?.friendTarget || isSimulationFriendTeamResolved(simState)) return 0;
  const player = getSimulationPlayer(simState, playerId);
  if (!player || !Array.isArray(player.hand)) return 0;

  const beliefLean = getSimulationFriendBeliefLean(simState, playerId);
  const controllerId = getSimulationTurnAccessControllerId(simState);
  const sameSideControl = controllerId != null && isSimulationSameSide(simState, playerId, controllerId);
  const reserveScore = Math.min(getSimulationTurnAccessReserveScore(simState, playerId), 34);
  const targetCopies = getSimulationTargetCopiesInHand(simState, playerId);
  const trickPoints = Array.isArray(simState.currentTrick)
    ? simState.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards || []), 0)
    : 0;
  const pointCardsInHand = player.hand.filter((card) => scoreValue(card) > 0).length;
  const sideAcesInHand = player.hand.filter((card) => effectiveSuit(card) !== "trump" && card.rank === "A").length;
  const topTrumpCount = player.hand.filter((card) =>
    effectiveSuit(card) === "trump" && getPatternUnitPower(card, "trump") >= 15
  ).length;
  let score = 0;

  score += Math.min(12, reserveScore * 0.25);
  score += Math.min(8, pointCardsInHand * 2);
  score += Math.min(14, sideAcesInHand * 8);
  score += Math.min(16, topTrumpCount * 8);

  if (sameSideControl) score += 4;

  if (beliefLean > 0) score += Math.min(18, beliefLean * 0.35);
  else if (beliefLean < 0) score += Math.max(-16, beliefLean * 0.25);

  if (playerId !== simState.bankerId && targetCopies > 0) {
    score += 8 + Math.min(10, targetCopies * 5);
  }

  if (!sameSideControl && trickPoints > 0 && reserveScore <= 2 && sideAcesInHand === 0 && topTrumpCount === 0) {
    score -= 6 + trickPoints * 0.25;
  }

  if (reserveScore < 6 && beliefLean < 8 && sideAcesInHand === 0 && topTrumpCount === 0 && targetCopies === 0) {
    score -= (6 - reserveScore) * 2;
  }

  if (pointCardsInHand === 0 && sideAcesInHand === 0 && topTrumpCount === 0 && targetCopies === 0 && beliefLean < 8) {
    score -= 10;
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
  const gradeBottomProfile = getSimulationGradeBottomProfile(simState, playerId);

  let score = sameSideControl ? bottomPoints * 0.9 : -bottomPoints * 0.9;
  score += sameSideControl ? Math.min(controlReserve, 24) * 0.35 : Math.min(controlReserve, 24) * 0.15;
  if (gradeBottomProfile.active) {
    score += sameSideControl
      ? (gradeBottomProfile.specialPriority ? 18 : 10)
      : (gradeBottomProfile.specialPriority ? -18 : -10);
  }
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
  const gradeBottomProfile = getSimulationGradeBottomProfile(simState, playerId);
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
    if (gradeBottomProfile.active) {
      risk += gradeBottomProfile.specialPriority ? 12 : 6;
    }
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
    probeRisk: getSimulationProbeRiskScore(simState, playerId),
    allySupport: getSimulationAllySupportScore(simState, playerId),
    bottom: getSimulationBottomScore(simState, playerId),
    gradeBottom: getSimulationGradeBottomScore(simState, playerId),
    voidPressure: getSimulationVoidPressureScore(simState, playerId),
    tempo: getSimulationTempoScore(simState, playerId),
    turnAccess: getSimulationTurnAccessScore(simState, playerId),
    controlExit: getSimulationControlExitScore(simState, playerId),
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
