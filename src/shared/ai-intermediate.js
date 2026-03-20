// 返回中级 AI 回牌时优先照顾的目标玩家 ID 列表。
function getIntermediateReturnTargetIds(playerId) {
  return getAiKnownHandoffTargetIds(playerId);
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

/**
 * 作用：
 * 读取某位玩家已经公开打出的某门牌，用于中级的递牌推断。
 *
 * 为什么这样写：
 * 中级的“递牌”不只看断门，还会结合“某个敌人已经先打出过这门高张，但又仍有小牌”
 * 这类公开行为，粗略判断剩余高张更可能分布在同伴或后位，而不是继续压在当前敌手手里。
 *
 * 输入：
 * @param {number} playerId - 需要读取公开出牌记录的玩家 ID。
 * @param {string} suit - 需要统计的有效花色。
 *
 * 输出：
 * @returns {Array<object>} 返回该玩家公开打出的该门牌列表；没有则返回空数组。
 *
 * 注意：
 * - 这里只读取公开 `played` 记录，不读取任何暗手。
 * - 仅供中级“递牌”软信号使用，不代表完整记牌。
 */
function getIntermediatePlayedSuitCards(playerId, suit) {
  const player = getPlayer(playerId);
  if (!player || !Array.isArray(player.played) || !suit) return [];
  return player.played.filter((card) => effectiveSuit(card) === suit);
}

/**
 * 作用：
 * 为中级 AI 估计某门牌的“软递牌”信号强度。
 *
 * 为什么这样写：
 * 用户希望中级能理解一种比“同伴已公开绝门”更柔性的递牌：
 * 当敌方已经公开花掉这门的部分高张、但又仍保有小牌时，说明其余高张未必继续压在这名敌人手里，
 * 这时用小牌递过去，让同伴尝试以剩余高张接手，就是一种可解释的中级策略。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {string} leadSuit - 当前待评估的递牌花色。
 *
 * 输出：
 * @returns {number} 返回软递牌信号强度；越高表示越值得把这门当作递牌门。
 *
 * 注意：
 * - 这里只依赖公开出牌记录，不做暗手采样。
 * - 这条信号只是加分项，不会覆盖“同伴已知绝门”的强递牌信号。
 */
function getIntermediateSoftHandoffSignal(playerId, leadSuit) {
  if (!leadSuit || leadSuit === "trump") return 0;
  const targetIds = getIntermediateReturnTargetIds(playerId);
  if (targetIds.length === 0) return 0;

  const enemyIds = state.players
    .map((player) => player.id)
    .filter((otherId) => otherId !== playerId && !targetIds.includes(otherId));
  const enemySuitCards = enemyIds.flatMap((enemyId) => getIntermediatePlayedSuitCards(enemyId, leadSuit));
  if (enemySuitCards.length === 0) return 0;

  const enemyHighCount = enemySuitCards.filter((card) => ["10", "J", "Q", "K", "A"].includes(card.rank)).length;
  const enemyLowCount = enemySuitCards.filter((card) => scoreValue(card) === 0 && !["10", "J", "Q", "K", "A"].includes(card.rank)).length;
  const rememberedHighCount = getRememberedPlayedCardsForPlayer(playerId)
    .filter((card) => effectiveSuit(card) === leadSuit && !isTrump(card))
    .length;

  let signal = 0;
  if (enemyHighCount > 0) signal += 1;
  if (enemyHighCount > 0 && enemyLowCount > 0) signal += 1;
  if (rememberedHighCount > 0) signal += 1;
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
  const softSignal = getIntermediateSoftHandoffSignal(playerId, leadSuit);
  if (returnSignals.length === 0 && softSignal <= 0) return 0;

  const sameSuitCards = player.hand.filter((card) => effectiveSuit(card) === leadSuit);
  const lowestSuitCard = sameSuitCards.length > 0 ? lowestCard(sameSuitCards) : leadCard;
  const enemyIds = state.players
    .map((seat) => seat.id)
    .filter((otherId) => otherId !== playerId && !targetIds.includes(otherId));
  const enemyVoidCount = enemyIds.filter((enemyId) => state.exposedSuitVoid[enemyId]?.[leadSuit]).length;
  let score = returnSignals.reduce((sum, entry) => sum + entry.signal * 26, 0) - getComboPointValue(combo) * 3;
  score += softSignal * 18;
  if (lowestSuitCard?.id === leadCard.id) score += 18;
  if (targetIds[0] === state.bankerId) score += 12;
  if (enemyVoidCount === 0) score += 10;
  else score -= enemyVoidCount * 18;
  score -= getPatternUnitPower(leadCard, leadSuit) * 2;
  return score;
}

/**
 * 作用：
 * 为“先用高张定门，再留同门小牌递给同伴”的首发提供中级评分加成。
 *
 * 为什么这样写：
 * 当前中级已经懂得公开绝门后的直接递牌，但还不够理解用户强调的“先出 `A` 定门”协同。
 * 当朋友已站队、全桌公开上都还没有这门断门，而我方手里又同时握有这门 `A` 和后续小牌时，
 * 这手 `A` 不只是单纯的高张首发，它还承担了“告诉同伴这门高张正在被我方兑现，
 * 你后面的 `A / K` 可能已经升成大牌”的信号价值，因此应在统一评分里被显式奖励。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的首发牌组。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 * @param {object|null} [objective=null] - 当前局面的 objective；未传入时才回退到 live state 计算。
 *
 * 输出：
 * @returns {number} 返回应加到候选分上的协同奖励；越高表示越像“定门后再递牌”的有效路线。
 *
 * 注意：
 * - 只在朋友已站队后启用，且要求后续仍保留同门牌，避免把孤张 `A` 也误判成信号牌。
 * - 同伴或敌人只要有人已经公开绝这门，就回退给直接递牌或断门施压逻辑，不在这里重复加分。
 */
function scoreIntermediateControlSignalLead(playerId, combo, handBefore) {
  if (!Array.isArray(combo) || combo.length === 0 || !Array.isArray(handBefore)) return 0;
  if (!isFriendTeamResolved()) return 0;

  const leadSuit = effectiveSuit(combo[0]);
  if (leadSuit === "trump") return 0;

  const targetIds = getIntermediateReturnTargetIds(playerId);
  if (targetIds.length === 0) return 0;
  if (targetIds.some((targetId) => state.exposedSuitVoid[targetId]?.[leadSuit])) return 0;

  const enemyIds = state.players
    .map((seat) => seat.id)
    .filter((otherId) => otherId !== playerId && !targetIds.includes(otherId));
  if (enemyIds.some((enemyId) => state.exposedSuitVoid[enemyId]?.[leadSuit])) return 0;

  const topComboCard = highestCard(combo);
  if (!topComboCard || topComboCard.rank !== "A") return 0;

  const comboIds = new Set(combo.map((card) => card.id));
  const remainingSuitCards = handBefore.filter((card) =>
    effectiveSuit(card) === leadSuit && !comboIds.has(card.id)
  );
  if (remainingSuitCards.length === 0) return 0;

  const lowestRemainingCard = lowestCard(remainingSuitCards);
  const softSignal = getIntermediateSoftHandoffSignal(playerId, leadSuit);
  let score = 54;

  if (combo.length > 1) score += 8;
  if (scoreValue(lowestRemainingCard) === 0) score += 16;
  if (getPatternUnitPower(lowestRemainingCard, leadSuit) <= 9) score += 10;
  if (targetIds[0] === state.bankerId) score += 8;
  if (softSignal > 0) score += softSignal * 6;
  if (!isDefenderTeam(playerId) && hasAiDirectControlLead(getPlayer(playerId))) score -= 28;
  if (!isDefenderTeam(playerId) && shouldAiUseBankerRevealedFriendControlMode(playerId)) score += 10;

  return Math.max(0, score);
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

/**
 * 作用：
 * 按当前墩的真实出牌顺序，返回某位玩家后面仍未行动的玩家列表。
 *
 * 为什么这样写：
 * 中级的递牌/接手判断发生在跟牌过程中，而此时 `state.leaderId` 仍可能保留上一墩赢家。
 * 如果继续复用依赖 `leaderId` 的通用 helper，就会把“打家还在后位”误判成“后面没人了”，
 * 进而漏掉真正该上手的递门窗口。
 *
 * 输入：
 * @param {number} playerId - 当前准备行动或刚完成行动的玩家 ID。
 *
 * 输出：
 * @returns {Array<number>} 当前这一墩里位于其后、且尚未出牌的玩家 ID 列表。
 *
 * 注意：
 * - 这里只根据 `currentTrick[0]` 的首家和当前已出牌玩家集合计算，不依赖 `state.leaderId`。
 * - 若当前并不处于进行中的牌墩，则返回空数组。
 */
function getIntermediatePendingPlayersInCurrentTrick(playerId) {
  if (!state.leadSpec || !Array.isArray(state.currentTrick) || state.currentTrick.length === 0) return [];
  const trickLeaderId = state.currentTrick[0]?.playerId;
  if (!trickLeaderId) return [];

  const alreadyPlayed = new Set(state.currentTrick.map((play) => play.playerId));
  const pending = [];
  let nextPlayerId = getNextPlayerId(playerId);
  while (nextPlayerId !== trickLeaderId && pending.length < PLAYER_ORDER.length) {
    if (!alreadyPlayed.has(nextPlayerId)) {
      pending.push(nextPlayerId);
    }
    nextPlayerId = getNextPlayerId(nextPlayerId);
  }
  return pending;
}

/**
 * 作用：
 * 为中级 AI 评估一手首发是否符合“级牌扣底路线”的资源管理方向。
 *
 * 为什么这样写：
 * 之前中级虽然能复用 beginner 的级牌扣底 helper，但统一评分器本身并不知道
 * “吊主、保王、保级牌结构”应该被显式鼓励；这会让搜索在很多临界局面里又回到普通跑分习惯。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的首发组合。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 *
 * 输出：
 * @returns {number} 返回这手首发对级牌扣底路线的专项加减分。
 *
 * 注意：
 * - 这里只奖励“先吊可消耗主、后保王和级牌”的方向，不直接保证这手一定最佳。
 * - 特殊级 `J / Q / K / A` 会抬高好坏分差，体现级牌扣底权重更高的规则口径。
 */
function scoreIntermediateGradeBottomLead(playerId, combo, handBefore) {
  const profile = getAiGradeBottomProfile(playerId);
  if (!profile.eligible || !shouldAiPursueGradeBottom(playerId)) return 0;
  if (!Array.isArray(combo) || combo.length === 0 || !Array.isArray(handBefore)) return 0;
  if ((state.trickNumber || 1) > (profile.specialPriority ? 10 : 8)) return 0;

  const pattern = classifyPlay(combo);
  const levelRank = getCurrentLevelRank();
  const leadSuit = effectiveSuit(combo[0]);
  const protectedCount = combo.filter((card) => card.suit === "joker" || card.rank === levelRank).length;
  const controlTrumpCount = combo.filter((card) =>
    effectiveSuit(card) === "trump" && card.suit !== "joker" && ["A", "K"].includes(card.rank) && card.rank !== levelRank
  ).length;
  const expendableTrumpCount = combo.filter((card) =>
    effectiveSuit(card) === "trump" && card.suit !== "joker" && card.rank !== levelRank && !["A", "K"].includes(card.rank)
  ).length;
  let score = 0;

  if (leadSuit === "trump") {
    score += 28 + expendableTrumpCount * 22;
    if (pattern.type === "pair") score += 16;
    if (pattern.type === "tractor") score += 24;
    if (pattern.type === "train") score += 28;
    if (pattern.type === "bulldozer") score += 32;
    score -= controlTrumpCount * 18;
  } else {
    score -= 16;
    if (combo.some((card) => !!getBottomPenaltyModeForCard(card))) {
      score -= profile.specialPriority ? 52 : 34;
    }
  }

  score -= protectedCount * (profile.specialPriority ? 76 : 58);
  if (profile.specialPriority && leadSuit === "trump" && expendableTrumpCount > 0) score += 18;
  return score;
}

/**
 * 作用：
 * 为中级 AI 评估“接同伴递牌”时应否主动上手，以及该用多大的牌去接。
 *
 * 为什么这样写：
 * 用户补充的递牌策略不只包含首发方“递出去”，还包含接牌方“要不要稳稳接住”。
 * 尤其当我已经断门、后位敌人也可能断门时，只用小主试着接很容易被继续盖毙；
 * 因此这里把“同伴递牌后用更大的主，甚至王去稳接”沉到中级跟牌评分里。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的跟牌组合。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次的领先出牌。
 * @param {boolean} beats - 当前候选是否能压过现有最大。
 *
 * 输出：
 * @returns {number} 返回“接同伴递牌”的收益分；越高表示越值得主动且稳稳接住。
 *
 * 注意：
 * - 当前只对单张跟牌启用，避免把多张结构跟牌也误判成递牌接手。
 * - 这里只处理“首家是同伴、且后位仍有敌人未出”的场景；如果我已经是最后一手，就没必要额外加权。
 */
function scoreIntermediateHandoffReceive(playerId, combo, currentWinningPlay, beats) {
  if (!beats || !currentWinningPlay || !Array.isArray(combo) || combo.length !== 1) return 0;
  if (!state.leadSpec || state.leadSpec.type !== "single" || state.currentTrick.length === 0) return 0;

  const leaderPlay = state.currentTrick[0];
  if (!leaderPlay?.cards?.length || leaderPlay.playerId === playerId) return 0;
  if (!areAiSameSide(playerId, leaderPlay.playerId)) return 0;

  const pendingEnemies = getIntermediatePendingPlayersInCurrentTrick(playerId)
    .filter((otherId) => !areAiSameSide(playerId, otherId));
  if (pendingEnemies.length === 0) return 0;

  const leadCard = leaderPlay.cards[0];
  const leadSuit = effectiveSuit(leadCard);
  if (leadSuit === "trump") return 0;

  const comboCard = combo[0];
  const comboSuit = effectiveSuit(comboCard);
  const leaderLookedLikeHandoff = scoreValue(leadCard) === 0 && getPatternUnitPower(leadCard, leadSuit) <= 9;
  const allyVoidLead = state.exposedSuitVoid[playerId]?.[leadSuit];
  if (!leaderLookedLikeHandoff && !allyVoidLead) return 0;

  const pendingVoidCount = pendingEnemies.filter((enemyId) => state.exposedSuitVoid[enemyId]?.[leadSuit]).length;
  let score = 0;

  if (comboSuit === leadSuit) {
    const suitedCards = getPlayer(playerId)?.hand.filter((card) => effectiveSuit(card) === leadSuit) || [];
    if (suitedCards.length === 0) return 0;
    if (highestCard(suitedCards)?.id === comboCard.id) {
      score += 48;
      if (pendingVoidCount > 0) score += 10;
    }
    score += getPatternUnitPower(comboCard, leadSuit) * 2;
    return score;
  }

  if (comboSuit !== "trump") return 0;

  score += 72;
  score += pendingVoidCount * 54;
  score += getPatternUnitPower(comboCard, "trump") * (pendingVoidCount > 0 ? 8 : 4);
  if (comboCard.suit === "joker") score += pendingVoidCount > 0 ? 56 : 24;
  if (pendingVoidCount > 0 && comboCard.suit !== "joker") score -= 28;
  return score;
}

/**
 * 作用：
 * 为中级 AI 评估跟牌时是否成功保住了级牌扣底所需的关键资源。
 *
 * 为什么这样写：
 * 用户希望中级在这条路线里不仅会“更多吊主”，还会在跟牌时尽量把王、级牌和含级牌结构保到末局；
 * 因此这里把 `chooseAiGradeBottomPreserveDiscard(...)` 的方向正式转成评分项，而不是只靠入口短路。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的跟牌组合。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次领先出牌。
 * @param {boolean} beats - 当前候选是否能压过现有最大。
 *
 * 输出：
 * @returns {number} 返回这手跟牌对级牌扣底路线的专项加减分。
 *
 * 注意：
 * - 这里只做相对排序，不替代“规则逼着必须压”之类的硬约束。
 * - 被叫到朋友但处于延迟站队窗口时，也允许沿用同一套保资源倾向。
 */
function scoreIntermediateGradeBottomFollow(playerId, combo, currentWinningPlay, beats) {
  const profile = getAiGradeBottomProfile(playerId);
  const preserveRoute = shouldAiPursueGradeBottom(playerId);
  const delayedRevealRoute = shouldAiDelayRevealForGradeBottom(playerId);
  if (!profile.eligible || profile.potential === "none" || (!preserveRoute && !delayedRevealRoute)) return 0;
  if (!Array.isArray(combo) || combo.length === 0) return 0;

  const preserveCost = scoreGradeBottomPreserveCombo(combo);
  let score = 0;

  if (!beats) {
    score += 42;
    score -= preserveCost * 0.18;
    if (currentWinningPlay && areAiSameSide(playerId, currentWinningPlay.playerId)) {
      score += profile.specialPriority ? 24 : 16;
    }
  } else {
    score -= preserveCost * 0.42;
  }

  if (delayedRevealRoute && state.friendTarget) {
    const revealsTarget = combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
    if (revealsTarget) score -= profile.specialPriority ? 88 : 60;
  }

  if (combo.some((card) => !!getBottomPenaltyModeForCard(card))) {
    score -= profile.specialPriority ? 22 : 12;
  }

  return score;
}

/**
 * 作用：
 * 在明显的递牌接手窗口里，为中级 AI 直接挑出“该怎么稳接”的牌。
 *
 * 为什么这样写：
 * 纯评分有时会被残局 rollout 的其它目标拉回去，导致 AI 明明看到了同伴递牌，
 * 却仍然用过小的主去试探。这里把最明确的接手场景前置成直接选择器：
 * 同伴先手递小牌、我能接、后位敌人还可能继续毙时，优先用更稳的高主或王接住。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<Array<object>>} candidates - 当前所有合法跟牌候选。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次的领先出牌。
 *
 * 输出：
 * @returns {Array<object>} 若命中明确递牌接手窗口则返回推荐跟牌，否则返回空数组。
 *
 * 注意：
 * - 当前只处理单张递牌接手，不扩展到对子和结构牌。
 * - 若后位敌人已公开这门绝门，则默认按“高主优先、王优先”排序。
 */
function chooseIntermediateHandoffReceive(playerId, candidates, currentWinningPlay) {
  if (!currentWinningPlay || !Array.isArray(candidates) || candidates.length === 0) return [];
  if (!state.leadSpec || state.leadSpec.type !== "single" || state.currentTrick.length === 0) return [];

  const leaderPlay = state.currentTrick[0];
  if (!leaderPlay?.cards?.length || leaderPlay.playerId === playerId) return [];
  if (!areAiSameSide(playerId, leaderPlay.playerId)) return [];

  const leadCard = leaderPlay.cards[0];
  const leadSuit = effectiveSuit(leadCard);
  if (leadSuit === "trump") return [];

  const pendingEnemies = getIntermediatePendingPlayersInCurrentTrick(playerId)
    .filter((otherId) => !areAiSameSide(playerId, otherId));
  if (pendingEnemies.length === 0) return [];

  const leaderLookedLikeHandoff = scoreValue(leadCard) === 0 && getPatternUnitPower(leadCard, leadSuit) <= 9;
  const selfVoidOnLeadSuit = !!state.exposedSuitVoid[playerId]?.[leadSuit];
  if (!leaderLookedLikeHandoff && !selfVoidOnLeadSuit) return [];

  const beatingSingles = candidates.filter((combo) =>
    combo.length === 1 && wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay)
  );
  if (beatingSingles.length === 0) return [];

  const pendingVoidCount = pendingEnemies.filter((enemyId) => state.exposedSuitVoid[enemyId]?.[leadSuit]).length;
  const trumpBeaters = beatingSingles.filter((combo) => effectiveSuit(combo[0]) === "trump");
  if (trumpBeaters.length > 0) {
    return trumpBeaters.sort((left, right) => {
      const powerDiff = getPatternUnitPower(right[0], "trump") - getPatternUnitPower(left[0], "trump");
      if (powerDiff !== 0) return powerDiff;
      if (pendingVoidCount > 0) {
        const jokerDiff = (right[0].suit === "joker" ? 1 : 0) - (left[0].suit === "joker" ? 1 : 0);
        if (jokerDiff !== 0) return jokerDiff;
      }
      return 0;
    })[0];
  }

  const suitedBeaters = beatingSingles.filter((combo) => effectiveSuit(combo[0]) === leadSuit);
  if (suitedBeaters.length === 0) return [];
  return suitedBeaters.sort((left, right) =>
    getPatternUnitPower(right[0], leadSuit) - getPatternUnitPower(left[0], leadSuit)
  )[0];
}

/**
 * 作用：
 * 识别“朋友未站队时，前位闲家在副牌门上递高张”的接手窗口强度。
 *
 * 为什么这样写：
 * 这类局面不是传统的“同伴递牌”，而是前位闲家为了不给打家后位送手，
 * 或者为了把局面重新交给中位判断，主动打出一张看似高、但并不稳控的副牌。
 * 如果此时打家还在后位、公开高张已经出现，而我手里又有该门真正的控张，
 * 继续把这手牌当成“暂定闲家互相别抢”会错过关键上手窗口。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次领先出牌。
 *
 * 输出：
 * @returns {number} 返回递门接手信号强度；`0` 表示当前不应把这手当成递门窗口。
 *
 * 注意：
 * - 这里只处理 `single` 跟牌，且只看未站队阶段。
 * - 必须要求打家仍在后位，避免把普通前位试探误判成“应该中位接手”。
 */
function getIntermediateInvitationTakeoverSignal(playerId, currentWinningPlay) {
  if (!currentWinningPlay || !Array.isArray(currentWinningPlay.cards) || currentWinningPlay.cards.length !== 1) return 0;
  if (!state.friendTarget || isFriendTeamResolved()) return 0;
  if (!state.leadSpec || state.leadSpec.type !== "single" || state.currentTrick.length === 0) return 0;

  const leaderPlay = state.currentTrick[0];
  if (!leaderPlay?.cards?.length || leaderPlay.playerId !== currentWinningPlay.playerId) return 0;
  if (playerId === currentWinningPlay.playerId || currentWinningPlay.playerId === state.bankerId) return 0;
  if (!isAiTentativeDefender(currentWinningPlay.playerId)) return 0;

  const leadCard = currentWinningPlay.cards[0];
  const leadSuit = effectiveSuit(leadCard);
  if (leadSuit === "trump") return 0;

  const pendingPlayers = getIntermediatePendingPlayersInCurrentTrick(playerId);
  if (!pendingPlayers.includes(state.bankerId)) return 0;

  const leadPower = getPatternUnitPower(leadCard, leadSuit);
  const publicHigherCount = (Array.isArray(state.playHistory) ? state.playHistory : []).filter((card) =>
    effectiveSuit(card) === leadSuit && getPatternUnitPower(card, leadSuit) > leadPower
  ).length;
  const bankerShownHigherCount = getIntermediatePlayedSuitCards(state.bankerId, leadSuit).filter((card) =>
    getPatternUnitPower(card, leadSuit) > leadPower
  ).length;

  let signal = 0;
  if (["10", "J", "Q", "K"].includes(leadCard.rank)) signal += 1;
  if (scoreValue(leadCard) > 0) signal += 1;
  if (publicHigherCount > 0) signal += Math.min(2, publicHigherCount);
  if (bankerShownHigherCount > 0) signal += 2;
  signal += 2;
  return signal >= 4 ? signal : 0;
}

/**
 * 作用：
 * 判断某个跟牌候选是否属于“未站队递门窗口里的主动接手牌”。
 *
 * 为什么这样写：
 * 评分、rollout 风险门禁和直接选择器都需要复用同一套判定条件，
 * 单独抽成 helper 后，才能确保“能接手的牌”和“该放行的牌”口径一致。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<object>} combo - 当前待判断的跟牌候选。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次领先出牌。
 * @param {boolean} beats - 当前候选是否能压过现有最大。
 *
 * 输出：
 * @returns {boolean} `true` 表示这手牌属于应主动接手的递门窗口。
 *
 * 注意：
 * - 当前只允许同门单张接手，不扩展到将吃、对子或更大结构。
 * - 这样可以把修正范围锁在用户指出的“中位副牌 A / K 抢回主动”问题上。
 */
function isIntermediateInvitationTakeoverCandidate(playerId, combo, currentWinningPlay, beats) {
  if (!beats || !Array.isArray(combo) || combo.length !== 1 || !currentWinningPlay?.cards?.length) return false;
  const signal = getIntermediateInvitationTakeoverSignal(playerId, currentWinningPlay);
  if (signal <= 0) return false;
  const leadSuit = effectiveSuit(currentWinningPlay.cards[0]);
  return effectiveSuit(combo[0]) === leadSuit;
}

/**
 * 作用：
 * 为“未站队递门窗口里主动接手”的跟牌候选追加收益。
 *
 * 为什么这样写：
 * 用户指出的真实样本里，中位手里的 `A` 本该把前位的 `Q` 当成递门而不是高张控牌。
 * 这里显式奖励这种接手，让中级在“打家还在后位、公开高张已出现”的局面里，
 * 更愿意用同门真正控张把这一手抢下来。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的跟牌候选。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次领先出牌。
 * @param {boolean} beats - 当前候选是否能压过现有最大。
 *
 * 输出：
 * @returns {number} 返回递门接手收益分；越高表示越值得主动上手。
 *
 * 注意：
 * - 这里只奖励同门单张接手，不鼓励在这类窗口里随便烧主。
 * - 若自己没有这门更大的真控张，这里会直接返回 `0`。
 */
function scoreIntermediateInvitationTakeover(playerId, combo, currentWinningPlay, beats) {
  if (!isIntermediateInvitationTakeoverCandidate(playerId, combo, currentWinningPlay, beats)) return 0;
  const player = getPlayer(playerId);
  if (!player || !currentWinningPlay?.cards?.length) return 0;

  const leadSuit = effectiveSuit(currentWinningPlay.cards[0]);
  const signal = getIntermediateInvitationTakeoverSignal(playerId, currentWinningPlay);
  const beatingSuitCards = player.hand.filter((card) =>
    effectiveSuit(card) === leadSuit && compareSingle(card, currentWinningPlay.cards[0], leadSuit) > 0
  );
  if (beatingSuitCards.length === 0) return 0;

  const highestBeater = highestCard(beatingSuitCards);
  let score = 64 + signal * 18;
  if (highestBeater?.id === combo[0].id) score += 28;
  if (combo[0].rank === "A") score += 12;
  return score;
}

/**
 * 作用：
 * 在明确的“未站队递门窗口”里，直接为中级挑出应该上手的同门控张。
 *
 * 为什么这样写：
 * 纯评分在这类窗口里容易继续被“暂定闲家别互抢”的旧门禁拉住。
 * 这里把最明确的窗口前置成直接选择器，确保看到“前位递 `Q`、打家还在后位、
 * 我手里有同门 `A / K`”时，中级会果断接手。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<Array<object>>} candidates - 当前所有合法跟牌候选。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次领先出牌。
 *
 * 输出：
 * @returns {Array<object>} 若命中明确接手窗口则返回推荐跟牌，否则返回空数组。
 *
 * 注意：
 * - 当前只处理同门单张接手，不改动将吃或结构跟牌。
 * - 直接选择器只在信号足够明确时触发，避免把普通前位试探全都理解成递门。
 */
function chooseIntermediateInvitationTakeover(playerId, candidates, currentWinningPlay) {
  if (!currentWinningPlay || !Array.isArray(candidates) || candidates.length === 0) return [];
  if (getIntermediateInvitationTakeoverSignal(playerId, currentWinningPlay) <= 0) return [];

  const leadSuit = effectiveSuit(currentWinningPlay.cards[0]);
  const beatingSingles = candidates.filter((combo) =>
    combo.length === 1
      && effectiveSuit(combo[0]) === leadSuit
      && wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay)
  );
  if (beatingSingles.length === 0) return [];

  return beatingSingles.sort((left, right) =>
    getPatternUnitPower(right[0], leadSuit) - getPatternUnitPower(left[0], leadSuit)
  )[0];
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

/**
 * 作用：
 * 汇总当前玩家在朋友未站队阶段已经公开花掉了多少高成本试探资源。
 *
 * 为什么这样写：
 * 第 2 步要压的不只是“这一手贵”，还包括“前面已经连续贵了几手还没换来站队结果”。
 * 这里直接复用当前玩家公开 `played` 记录，把 `A / 王 / 高主 / 带分牌`
 * 的历史消耗收成一个轻量压力值，供未站队 probe veto 判断“是否已经试探过热”。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {number} 返回历史试探压力；越高表示当前玩家已经公开花掉越多高成本试探资源。
 *
 * 注意：
 * - 这里只读取该玩家自己的公开出牌记录，不依赖任何暗手信息。
 * - 分值只用于未站队阶段的相对比较，不代表真实失误次数。
 */
function getIntermediateUnresolvedProbeHistoryPressure(playerId) {
  const player = getPlayer(playerId);
  if (!player || !Array.isArray(player.played)) return 0;

  return player.played.reduce((sum, card) => {
    if (!card) return sum;
    let pressure = 0;
    if (card.suit === "joker") pressure += 18;
    if (scoreValue(card) > 0) pressure += 6 + scoreValue(card) * 0.25;
    if (effectiveSuit(card) !== "trump" && card.rank === "A") pressure += 12;
    if (effectiveSuit(card) === "trump" && getPatternUnitPower(card, "trump") >= 15) pressure += 12;
    return sum + pressure;
  }, 0);
}

/**
 * 作用：
 * 评估某手牌在“朋友未站队”阶段是否属于高成本试探，并返回资源暴露强度。
 *
 * 为什么这样写：
 * 新一轮路线图不只是压“危险带分领牌”，还要压住那些
 * “虽然未必立刻送分，但已经为了试探朋友花掉太多 A / 高主 / 王 / 结构资源”的动作。
 * 这里先把这种暴露成本收敛成一个统一分值，供 lead/follow veto 共用。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 * @param {Array<object>} combo - 当前待评估的牌组。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 *
 * 输出：
 * @returns {number} 返回试探暴露强度；`0` 表示这手不属于需要额外约束的高成本试探。
 *
 * 注意：
 * - 只在 `friendTarget` 未站队时生效。
 * - 直接亮友、直接推进打家找朋友前置张、以及显式 `grade_bottom` 优先路线，不在这里一刀切压掉。
 * - 这里只衡量“成本”，是否允许继续激进，还要看 rollout 和未来评估。
 */
function getIntermediateUnresolvedProbeExposure(playerId, combo, handBefore, objective = null) {
  if (!state.friendTarget || isFriendTeamResolved()) return 0;
  if (!Array.isArray(combo) || combo.length === 0 || !Array.isArray(handBefore)) return 0;

  const effectiveObjective = objective || getIntermediateObjective(playerId, "lead", state);
  if (effectiveObjective?.primary === "grade_bottom" || effectiveObjective?.secondary === "grade_bottom") {
    return 0;
  }

  const containsTarget = combo.some((card) =>
    card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  if (containsTarget) {
    return 0;
  }

  const pattern = classifyPlay(combo);
  const comboPoints = getComboPointValue(combo);
  const comboResourceUse = scoreComboResourceUse(combo);
  const highTrumpCount = combo.filter((card) =>
    effectiveSuit(card) === "trump" && getPatternUnitPower(card, "trump") >= 15
  ).length;
  const sideAceCount = combo.filter((card) => effectiveSuit(card) !== "trump" && card.rank === "A").length;
  const jokerCount = combo.filter((card) => card.suit === "joker").length;
  const quickHighCost = comboPoints > 0
    || highTrumpCount > 0
    || sideAceCount > 0
    || jokerCount > 0
    || (
      ["pair", "tractor", "train", "bulldozer"].includes(pattern.type)
      && comboResourceUse >= 24
      && effectiveSuit(combo[0]) === "trump"
    );
  if (!quickHighCost) {
    return 0;
  }

  const historyPressure = Math.min(getIntermediateUnresolvedProbeHistoryPressure(playerId), 36);
  const beliefLean = typeof getSimulationFriendBeliefLean === "function"
    ? getSimulationFriendBeliefLean(state, playerId)
    : 0;
  let exposure = 0;

  exposure += comboResourceUse;
  exposure += comboPoints * 1.6;
  exposure += highTrumpCount * 12;
  exposure += sideAceCount * 10;
  exposure += jokerCount * 18;

  if (pattern.type === "single" && (comboPoints > 0 || sideAceCount > 0 || highTrumpCount > 0 || jokerCount > 0)) {
    exposure += 10;
  }
  if (pattern.type === "pair" && (comboPoints > 0 || highTrumpCount > 0 || jokerCount > 0)) {
    exposure += 16;
  }
  if (["tractor", "train", "bulldozer"].includes(pattern.type) && effectiveSuit(combo[0]) === "trump") {
    exposure += 18;
  }
  if (historyPressure > 0 && beliefLean < 12) {
    exposure += historyPressure * (beliefLean > 0 ? 0.28 : 0.45);
  }
  if (historyPressure >= 18 && beliefLean < 8) {
    exposure += 6;
  }

  return exposure >= 18 ? exposure : 0;
}

/**
 * 作用：
 * 判断某个未站队高成本试探，是否已经拿到了足够明确的“可以继续激进”的依据。
 *
 * 为什么这样写：
 * 新 veto 不能把所有高张试探一刀切打死。
 * 直接亮友、安全递牌、`A` 定门后能续控，或者 rollout 已经明确给出 `turn_access_hold`、
 * 更好的 `friendBelief / probeRisk`，都应视作合理例外。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 * @param {object|null} entry - 已带 rollout 与 future evaluation 的候选条目。
 *
 * 输出：
 * @returns {boolean} 返回 `true` 表示这手即使成本高，也值得保留激进性。
 *
 * 注意：
 * - 这里只做“保留例外”的判断，不直接返回惩罚分。
 * - 例外必须依赖 rollout 或明确的找友推进信号，避免重新放开无保障试探。
 */
function shouldKeepIntermediateUnresolvedProbeAggressive(playerId, entry) {
  if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return false;
  if (!state.friendTarget || isFriendTeamResolved()) return false;

  const containsTarget = entry.cards.some((card) =>
    card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  if (containsTarget) {
    return true;
  }

  const triggerFlags = Array.isArray(entry.rolloutTriggerFlags) ? entry.rolloutTriggerFlags : [];
  const nextBreakdown = entry.rolloutEvaluation?.breakdown || {};
  const futureBreakdown = entry.rolloutFutureEvaluation?.breakdown || {};
  const nextFriendBelief = nextBreakdown.friendBelief || 0;
  const futureFriendBelief = futureBreakdown.friendBelief || nextFriendBelief;
  const nextProbeRisk = nextBreakdown.probeRisk || 0;
  const futureProbeRisk = futureBreakdown.probeRisk || nextProbeRisk;
  const futureTurnAccess = futureBreakdown.turnAccess || nextBreakdown.turnAccess || 0;
  const futureSafeLead = futureBreakdown.safeLead || nextBreakdown.safeLead || 0;
  const futureDelta = typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : 0;
  const historyPressure = getIntermediateUnresolvedProbeHistoryPressure(playerId);
  const repeatedProbePressure = historyPressure >= 18;
  const keepsAccess = triggerFlags.includes("turn_access_hold");
  const beliefImproved = futureFriendBelief - nextFriendBelief >= 4 || futureFriendBelief >= 18;
  const safeProbe = futureProbeRisk >= (repeatedProbePressure ? 16 : 12) && futureTurnAccess >= 0;
  const healthyContinuation = futureDelta >= (repeatedProbePressure ? 14 : 10) || futureSafeLead > 0;

  return keepsAccess || beliefImproved || safeProbe || healthyContinuation;
}

/**
 * 作用：
 * 为未站队阶段的高成本试探追加 veto / 降权。
 *
 * 为什么这样写：
 * 这条规则专门补路线图里的“高张试探预算 + 回手保障”。
 * 与 `dangerousPointLeadPenalty` 的区别是：
 * - 后者只盯“明显危险带分领牌”；
 * - 这里要拦的是“虽然还没危险到立刻送分，但已经不值得为了试探去花高资源”的动作。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 * @param {object|null} entry - 已带 rollout 与 future evaluation 的候选条目。
 * @param {string} [mode="lead"] - 当前评估模式，支持 `lead / follow`。
 * @param {object|null} [objective=null] - 当前局面的 objective；未传入时才回退到 live state 计算。
 *
 * 输出：
 * @returns {number} 返回应从候选总分里扣除的试探惩罚；`lead` 更硬，`follow` 更温和。
 *
 * 注意：
 * - `follow` 侧只做中等惩罚，避免误伤必要接手。
 * - 如果 rollout 已明确给出续控、找友推进或健康 probeRisk，这里会直接放行。
 */
function scoreIntermediateUnresolvedProbeVetoPenalty(playerId, entry, mode = "lead", objective = null) {
  if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return 0;
  if (!state.friendTarget || isFriendTeamResolved()) return 0;

  const player = getPlayer(playerId);
  if (!player || !Array.isArray(player.hand)) return 0;

  const effectiveObjective = objective || getIntermediateObjective(playerId, mode, state);
  const exposure = getIntermediateUnresolvedProbeExposure(playerId, entry.cards, player.hand, objective);
  if (exposure <= 0) return 0;
  if (shouldKeepIntermediateUnresolvedProbeAggressive(playerId, entry)) return 0;

  const triggerFlags = Array.isArray(entry.rolloutTriggerFlags) ? entry.rolloutTriggerFlags : [];
  const nextBreakdown = entry.rolloutEvaluation?.breakdown || {};
  const futureBreakdown = entry.rolloutFutureEvaluation?.breakdown || {};
  const futureDelta = typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : 0;
  const probeRisk = futureBreakdown.probeRisk || nextBreakdown.probeRisk || 0;
  const turnAccess = futureBreakdown.turnAccess || nextBreakdown.turnAccess || 0;
  const friendBelief = futureBreakdown.friendBelief || nextBreakdown.friendBelief || 0;
  const historyPressure = getIntermediateUnresolvedProbeHistoryPressure(playerId);
  const carriesProbeHonor = entry.cards.some((card) =>
    scoreValue(card) > 0
    || (effectiveSuit(card) !== "trump" && card.rank === "A")
    || (effectiveSuit(card) === "trump" && getPatternUnitPower(card, "trump") >= 15)
  );
  if (mode === "follow" && !triggerFlags.includes("turn_access_risk") && !triggerFlags.includes("point_run_risk") && exposure < 30) {
    return 0;
  }
  const baseMultiplier = mode === "lead" ? 1.18 : 0.6;
  let penalty = Math.round(exposure * baseMultiplier);

  if (effectiveObjective?.primary === "find_friend") penalty += mode === "lead" ? 8 : 4;
  if (effectiveObjective?.secondary === "find_friend") penalty += mode === "lead" ? 4 : 2;
  if (triggerFlags.includes("turn_access_risk")) penalty += mode === "lead" ? 16 : 8;
  if (triggerFlags.includes("point_run_risk")) penalty += mode === "lead" ? 18 : 10;
  if (turnAccess <= 0) penalty += mode === "lead" ? 12 : 6;
  if (probeRisk < 0) penalty += Math.min(mode === "lead" ? 26 : 14, Math.abs(probeRisk) * 0.5);
  if (friendBelief < 10) penalty += mode === "lead" ? 10 : 6;
  if (carriesProbeHonor) penalty += mode === "lead" ? 8 : 4;
  if (historyPressure >= 18) penalty += mode === "lead" ? 10 : 4;
  if (futureDelta < 6) penalty += mode === "lead" ? 12 : 6;

  return Math.max(0, penalty);
}

/**
 * 作用：
 * 为“打家早期按目标高张 / 过桥高张 / 找朋友小牌节奏推进”的动作提供中级评分加成。
 *
 * 为什么这样写：
 * 用户把“怎么找朋友”补成了更完整的节奏：
 * 普通级偏向 `A -> K -> 找朋友小牌`，
 * 持有两张目标高张时偏向 `AA/KK -> 找朋友小牌`，
 * `A` 级则改成 `K -> Q -> 找朋友小牌`。
 * 这条经验应显式进中级评分，而不是只停留在 beginner 入口的直觉规则里。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的首发牌组。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 *
 * 输出：
 * @returns {number} 返回应加到候选分上的正向奖励；越高表示越应优先做亮友前置清理。
 *
 * 注意：
 * - 当前只覆盖共享 call-friend 评分已支持的 `A / K` 路线。
 * - 这里只奖励“前几轮、打家首发、且目标仍未亮出”的准备动作。
 */
function scoreIntermediateFriendSetupLead(playerId, combo, handBefore) {
  if (playerId !== state.bankerId || !Array.isArray(combo) || combo.length === 0 || !Array.isArray(handBefore)) return 0;
  if (!state.friendTarget || isFriendTeamResolved()) return 0;
  if (state.friendTarget.suit === "joker" || !["A", "K"].includes(state.friendTarget.rank)) return 0;
  if ((state.trickNumber || 1) > 4) return 0;

  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (currentSeen >= neededOccurrence) return 0;

  const setupProfile = buildFriendSearchRouteProfile({ hand: handBefore }, state.friendTarget);
  if (!setupProfile) return 0;

  const isTargetLead = combo.every((card) =>
    card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  const isBridgeLead = combo.length === 1
    && setupProfile.bridgeRank
    && combo[0].suit === state.friendTarget.suit
    && combo[0].rank === setupProfile.bridgeRank;
  const isSearchLead = combo.length === 1
    && !!setupProfile.searchCard
    && combo[0].id === setupProfile.searchCard.id;
  if (!isTargetLead && !isBridgeLead && !isSearchLead) return 0;

  let bonus = 0;
  if (isTargetLead) {
    if (combo.length >= 2 && currentSeen <= neededOccurrence - 2) {
      bonus += 104;
    } else if (combo.length === 1 && currentSeen < neededOccurrence - 1) {
      bonus += 92;
    } else {
      bonus += 18;
    }
  }
  if (isBridgeLead) {
    const bridgeWindow = setupProfile.targetCopies === 0 || currentSeen >= neededOccurrence - 1;
    if (!bridgeWindow || !setupProfile.searchCard) return 0;
    bonus += state.friendTarget.rank === "K" ? 82 : 72;
  }
  if (isSearchLead) {
    const searchWindow = setupProfile.targetCopies === 0 && setupProfile.bridgeCount === 0;
    if (!searchWindow) return 0;
    bonus += 66;
  }
  if ((state.trickNumber || 1) <= 2) bonus += 16;
  if (state.friendTarget.rank === "K" && getCurrentLevelRank() === "A") bonus += 10;
  if (combo.length === 1 && effectiveSuit(combo[0]) !== "trump") bonus += 8;
  return bonus;
}

/**
 * 作用：
 * 在无主且朋友未站队时，识别打家仍握有“短而硬”的主控储备，并把首发重新拉回控牌线。
 *
 * 为什么这样写：
 * 复盘里出现过一种典型输法：
 * 打家前几墩已经清掉了大部分主，看起来“主张数不多了”，
 * 但手里其实还剩 `王 + 级牌对子` 这类足以再拿 1-2 手的短控储备。
 * 旧版中级的 `trump clear` 计划更偏向 `4+` 张主的厚主局，
 * 于是会把这种局面误判成“该转去副牌结构”，导致低副对子 / 低副单张过早送出牌权。
 * 这里专门补一条窄评分：
 * 无主、打家、朋友未站队、且自己仍握有短主硬控时，继续主控加分，低副试探降温。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的首发牌组。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 *
 * 输出：
 * @returns {number} 返回应加到候选总分上的修正值；正值鼓励继续主控，负值压低低副送手。
 *
 * 注意：
 * - 只在无主、朋友未站队、且当前仍处于前中盘时启用，避免误伤残局保底切档。
 * - 若这手本身已经命中正式的找朋友前置节奏，则直接放行，不和找朋友路线抢优先级。
 * - 这里只使用己方手牌与公开状态，不读取任何暗手信息。
 */
function scoreIntermediateNoTrumpReserveControlLead(playerId, combo, handBefore) {
  if (playerId !== state.bankerId || !Array.isArray(combo) || combo.length === 0 || !Array.isArray(handBefore)) {
    return 0;
  }
  if (state.trumpSuit !== "notrump" || !state.friendTarget || isFriendTeamResolved()) return 0;
  if (state.friendTarget.suit === "joker" || (state.trickNumber || 1) > 5) return 0;

  const friendSetupBonus = scoreIntermediateFriendSetupLead(playerId, combo, handBefore);
  if (friendSetupBonus > 0) return 0;

  const comboContainsTarget = combo.some((card) =>
    card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  if (comboContainsTarget) return 0;

  const trumpCards = handBefore.filter((card) => effectiveSuit(card) === "trump");
  if (trumpCards.length < 2) return 0;

  const jokerCount = trumpCards.filter((card) => card.suit === "joker").length;
  const trumpPairCount = findPairs(trumpCards).length;
  const highTrumpCount = trumpCards.filter((card) => getPatternUnitPower(card, "trump") >= 15).length;
  const reserveActive = jokerCount > 0 || trumpPairCount > 0 || highTrumpCount >= 2;
  if (!reserveActive) return 0;

  const pattern = classifyPlay(combo);
  const comboIsTrump = combo.every((card) => effectiveSuit(card) === "trump");
  const comboPoints = getComboPointValue(combo);
  const averagePower = combo.reduce((sum, card) => {
    const suit = effectiveSuit(card);
    return sum + getPatternUnitPower(card, suit);
  }, 0) / combo.length;

  if (comboIsTrump) {
    let bonus = 44;
    if (pattern.type === "single") bonus += 16;
    if (pattern.type === "pair") bonus += 36;
    if (pattern.type === "triple") bonus += 42;
    if (pattern.type === "tractor" || pattern.type === "train") bonus += 52;
    if (pattern.type === "bulldozer") bonus += 60;
    if (jokerCount > 0) bonus += 10;
    if (trumpPairCount > 0) bonus += 8;
    return bonus;
  }

  if (combo.every((card) => card.suit === state.friendTarget.suit)) return 0;

  let penalty = 0;
  if (pattern.type === "single") {
    penalty += comboPoints === 0 && averagePower <= 10 ? 42 : 18;
  } else if (pattern.type === "pair") {
    penalty += 72;
  } else if (pattern.type === "triple") {
    penalty += 84;
  } else if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") {
    penalty += 96;
  }
  if (comboPoints > 0) penalty += 16;
  if (jokerCount > 0) penalty += 10;
  if (trumpPairCount > 0) penalty += 12;
  return -penalty;
}

/**
 * 作用：
 * 在朋友未站队且自己并不更像朋友时，避免中级随手把最低张递给“暂定同侧”。
 *
 * 为什么这样写：
 * 这轮 `probeRisk` 会压掉一部分没有保障的高张试探；
 * 如果不补这条窄保护，少数 lead 场景会退化成“高张不敢试，就机械递最低张”，
 * 从而把牌权白送给尚未确认的潜在同伴，违反原有 public-info-only 口径。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {Array<object>} combo - 当前待评分的首发牌组。
 * @param {Array<object>} handBefore - 出牌前完整手牌。
 *
 * 输出：
 * @returns {number} 返回应扣除的惩罚；越负表示越不该做这种盲目低张递牌。
 *
 * 注意：
 * - 只在 `friend 未站队`、且当前玩家并不明显更像朋友时生效。
 * - 只处理非主、零分、单张且明显偏低的 lead，不影响公开 handoff、直接亮友或 banker 回手。
 */
function scoreIntermediateTentativeLowHandoffPenalty(playerId, combo, handBefore) {
  if (playerId === state.bankerId || !state.friendTarget || isFriendTeamResolved()) return 0;
  if (!Array.isArray(combo) || combo.length !== 1 || !Array.isArray(handBefore)) return 0;

  const card = combo[0];
  const suit = effectiveSuit(card);
  if (suit === "trump" || scoreValue(card) > 0) return 0;
  if (card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank) return 0;
  if (getPatternUnitPower(card, suit) > 9) return 0;
  if (canAiRevealFriendNow(playerId)) return 0;

  const beliefLean = typeof getSimulationFriendBeliefLean === "function"
    ? getSimulationFriendBeliefLean(state, playerId)
    : 0;
  if (beliefLean > 0) return 0;

  const sameSuitHigherCardExists = handBefore.some((entry) =>
    entry.id !== card.id
    && effectiveSuit(entry) === suit
    && getPatternUnitPower(entry, suit) > getPatternUnitPower(card, suit)
  );
  if (!sameSuitHigherCardExists) return 0;

  return -28;
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

  const noTrumpJokerFriendControlLead = chooseAiNoTrumpJokerFriendControlLead(playerId, player);
  if (noTrumpJokerFriendControlLead.length > 0) {
    if (getComboKey(noTrumpJokerFriendControlLead) === getComboKey(combo)) {
      score += 220;
    } else if (playerId === state.bankerId && state.currentTrick.length === 0) {
      score -= 120;
    }
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
  score += scoreIntermediateControlSignalLead(playerId, combo, handBefore);
  score += scoreIntermediateFriendTempoLead(playerId, combo);
  score += scoreIntermediateGradeBottomLead(playerId, combo, handBefore);
  score += scoreIntermediateTentativeLowHandoffPenalty(playerId, combo, handBefore);
  score += scoreLeadTripleBreakPenalty(handBefore, combo);
  score += scoreIntermediateTrumpClearLead(playerId, combo, handBefore);
  score += scoreIntermediateSidePatternSafety(playerId, combo, handBefore);
  score += scoreIntermediateFriendSetupLead(playerId, combo, handBefore);
  score += scoreIntermediateNoTrumpReserveControlLead(playerId, combo, handBefore);
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
  const invitationTakeover = isIntermediateInvitationTakeoverCandidate(playerId, combo, currentWinningPlay, beats);
  const comboPoints = getComboPointValue(combo);
  const tablePoints = getCurrentTrickPointValue();
  const powerMargin = beats && currentPattern ? compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) : 0;
  let score = 0;

  score += getFollowStructureScore(combo) * 0.7;
  score += scoreSameSuitSingleStructurePreservationFromHand(combo, handBefore);
  score += scoreOffSuitDiscardStructurePreservation(playerId, combo, handBefore);
  score += scoreOffSuitHighPairPreservation(playerId, combo, handBefore, currentWinningPlay);
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
    if (defensiveCooperation && !invitationTakeover) {
      if (beats) {
        score -= 90;
      } else {
        score += 20;
      }
    }
  }

  score += scoreIntermediateGradeBottomFollow(playerId, combo, currentWinningPlay, beats);

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
  score += scoreIntermediateInvitationTakeover(playerId, combo, currentWinningPlay, beats);
  score += scoreIntermediateHandoffReceive(playerId, combo, currentWinningPlay, beats);

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
    const invitationTakeover = isIntermediateInvitationTakeoverCandidate(playerId, combo, currentWinningPlay, beatsCurrent);
    if (!beatsCurrent) {
      return {
        shouldExtend: false,
        flags: ["follow_non_beating"],
      };
    }
    if (!isFriendTeamResolved()
      && isAiTentativeDefender(playerId)
      && isAiTentativeDefender(currentWinningPlay.playerId)) {
      if (invitationTakeover) {
        return {
          shouldExtend: false,
          flags: ["unresolved_invitation_takeover"],
        };
      }
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
  const gradeBottomProfile = typeof getSimulationGradeBottomProfile === "function"
    ? getSimulationGradeBottomProfile(simState, playerId)
    : { active: false, specialPriority: false };
  const trumpCount = player.hand.filter((card) => effectiveSuit(card) === "trump").length;
  const structureCount = getStructureCombosFromHand(player.hand).length;
  const flags = [];
  if (unresolvedFriend) flags.push("unresolved_friend");
  if (bottomSensitive) flags.push("late_bottom_pressure");
  if (gradeBottomProfile.active) flags.push(gradeBottomProfile.specialPriority ? "priority_grade_bottom" : "grade_bottom_pressure");
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

/**
 * 作用：
 * 为调试快照补齐候选的结构化决策 flags。
 *
 * 为什么这样写：
 * rollout 自带的 `turn_access_risk / point_run_risk` 只覆盖模拟阶段信号；
 * 这轮新增的 `unresolved_probe_risk / revealed_control_overheat` 都属于排序 veto，
 * 需要在快照层统一拼进去，
 * 这样 headless 汇总和 debug 面板才能共用同一套 flags 口径。
 *
 * 输入：
 * @param {object|null} entry - 已带评分结果的候选条目。
 *
 * 输出：
 * @returns {Array<string>} 返回去重后的决策 flags 列表。
 *
 * 注意：
 * - 这里只做调试输出整形，不参与实际排序。
 * - 新增 flags 时应优先走这里，避免不同快照字段各自拼一份。
 */
function getCandidateDecisionFlags(entry) {
  const flags = Array.isArray(entry?.rolloutTriggerFlags) ? [...entry.rolloutTriggerFlags] : [];
  if ((entry?.unresolvedProbeVetoPenalty || 0) > 0 && !flags.includes("unresolved_probe_risk")) {
    flags.push("unresolved_probe_risk");
  }
  if ((entry?.resolvedFriendControlCoolingPenalty || 0) > 0 && !flags.includes("revealed_control_overheat")) {
    flags.push("revealed_control_overheat");
  }
  return flags;
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
      riskyPointLeadVetoPenalty: typeof entry.riskyPointLeadVetoPenalty === "number"
        ? entry.riskyPointLeadVetoPenalty
        : null,
      unresolvedProbeVetoPenalty: typeof entry.unresolvedProbeVetoPenalty === "number"
        ? entry.unresolvedProbeVetoPenalty
        : null,
      resolvedFriendControlCoolingPenalty: typeof entry.resolvedFriendControlCoolingPenalty === "number"
        ? entry.resolvedFriendControlCoolingPenalty
        : null,
      rolloutScore: typeof entry.rolloutScore === "number" ? entry.rolloutScore : null,
      rolloutFutureDelta: typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : null,
      rolloutDepth: entry.rolloutDepth ?? 0,
      rolloutReachedOwnTurn: !!entry.rolloutReachedOwnTurn,
      rolloutTriggerFlags: getCandidateDecisionFlags(entry),
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
    selectedRiskyPointLeadVetoPenalty: typeof bestEntry?.riskyPointLeadVetoPenalty === "number"
      ? bestEntry.riskyPointLeadVetoPenalty
      : null,
    selectedUnresolvedProbeVetoPenalty: typeof bestEntry?.unresolvedProbeVetoPenalty === "number"
      ? bestEntry.unresolvedProbeVetoPenalty
      : null,
    selectedResolvedFriendControlCoolingPenalty: typeof bestEntry?.resolvedFriendControlCoolingPenalty === "number"
      ? bestEntry.resolvedFriendControlCoolingPenalty
      : null,
    selectedRolloutTriggerFlags: getCandidateDecisionFlags(bestEntry),
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
    && wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay)
    && !isIntermediateInvitationTakeoverCandidate(playerId, combo, currentWinningPlay, true);
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
  const controlFocusedObjectives = new Set(["keep_control", "clear_trump", "pressure_void", "protect_bottom", "grade_bottom"]);
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

/**
 * 作用：
 * 估算朋友已站队后，这手候选还在“自己继续攥控”的资源承诺强度。
 *
 * 为什么这样写：
 * `controlExit` 已能告诉我们“未来控牌是否过热”，
 * 但候选级排序还需要知道“这手牌本身到底花了多少高成本控牌资源”。
 * 把这份承诺强度单独抽出来后，lead / follow 都能共用同一口径，
 * 更稳定地区分“顺手放一张低牌”和“继续烧王 / 高主 / 高张硬控”。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 * @param {Array<object>} combo - 当前待评估的候选牌组。
 * @param {string} [mode="lead"] - 当前评估模式，支持 `lead / follow`。
 * @param {{playerId:number,cards:Array<object>}|null} [currentWinningPlay=null] - 跟牌模式下的当前领先出牌。
 *
 * 输出：
 * @returns {number} 返回这手候选的控牌资源承诺分；越高表示越像“继续自己攥高资源控牌”。
 *
 * 注意：
 * - 这里只衡量候选本身的资源承诺，不直接判断这手牌最终值不值得出。
 * - `follow` 模式会额外考虑当前是否压过领先牌，因为“主动上手硬控”和“被迫跟出”不是同一回事。
 */
function getIntermediateResolvedFriendControlCommitmentScore(
  playerId,
  combo,
  mode = "lead",
  currentWinningPlay = null
) {
  if (!Array.isArray(combo) || combo.length === 0) return 0;

  const pattern = classifyPlay(combo);
  const comboPoints = getComboPointValue(combo);
  const comboResourceUse = scoreComboResourceUse(combo);
  const comboSuit = pattern.suit || effectiveSuit(combo[0]);
  const beatsCurrent = mode === "follow" && currentWinningPlay
    ? wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay)
    : false;
  const trumpCount = combo.filter((card) => effectiveSuit(card) === "trump").length;
  const topTrumpCount = combo.filter((card) =>
    effectiveSuit(card) === "trump" && getPatternUnitPower(card, "trump") >= 15
  ).length;
  const jokerCount = combo.filter((card) => card.suit === "joker").length;
  const sideHonorCount = combo.filter((card) =>
    effectiveSuit(card) !== "trump" && ["10", "J", "Q", "K", "A"].includes(card.rank)
  ).length;
  const totalPower = combo.reduce((sum, card) => {
    const suit = effectiveSuit(card);
    return sum + getPatternUnitPower(card, suit);
  }, 0);
  let score = comboResourceUse * 3.5;

  score += comboPoints * 2.8;
  score += totalPower * (combo.length === 1 ? 16 : 9);
  score += trumpCount * 18;
  score += topTrumpCount * 32;
  score += jokerCount * 46;
  score += sideHonorCount * 12;

  if (pattern.type === "pair") score += 18;
  if (pattern.type === "triple") score += 20;
  if (pattern.type === "tractor" || pattern.type === "train") score += 30;
  if (pattern.type === "bulldozer") score += 42;

  if (mode === "follow" && currentWinningPlay) {
    if (beatsCurrent) {
      score += 34;
    } else if (comboSuit === state.leadSpec?.suit || comboSuit === effectiveSuit(currentWinningPlay.cards[0])) {
      score += 12;
    }
  }

  return score;
}

/**
 * 作用：
 * 在朋友已站队后，对“还在自己硬攥控牌”的候选追加统一降温惩罚。
 *
 * 为什么这样写：
 * 这轮剩余风险已经明显集中到 `friend=revealed` 后的 `keep_control / clear_trump / pressure_void`，
 * 纯靠 `evaluateState(...).breakdown.controlExit` 还不够把候选真正拉开。
 * 这里把 rollout 里的 `controlExit / turnAccess / pointRunRisk / safeLead` 信号
 * 和候选本身的控牌资源承诺拼起来：
 * - 如果未来已经提示“继续控会过热”，就直接压掉继续烧王 / 高主 / 高张的候选；
 * - 如果 rollout 明确说明“这手能健康续控或安全交给同侧”，再把惩罚放松。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 * @param {object|null} entry - 已带 rollout 结果的候选条目。
 * @param {string} [mode="lead"] - 当前评估模式，支持 `lead / follow`。
 * @param {object|null} [objective=null] - 当前局面的 objective。
 * @param {{playerId:number,cards:Array<object>}|null} [currentWinningPlay=null] - 跟牌模式下的当前领先出牌。
 * @param {boolean} [allyWinning=false] - 跟牌前当前领先者是否为己方。
 *
 * 输出：
 * @returns {number} 返回应从候选总分中扣除的降温惩罚；值越高表示越不该继续自己硬控。
 *
 * 注意：
 * - 只在朋友已站队后的控制型目标里生效。
 * - 没有 rollout 前瞻时宁可返回 `0`，避免把这条规则误用成纯静态拍脑袋惩罚。
 */
function scoreIntermediateResolvedFriendControlCoolingPenalty(
  playerId,
  entry,
  mode = "lead",
  objective = null,
  currentWinningPlay = null,
  allyWinning = false
) {
  if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return 0;
  if (!isFriendTeamResolved()) return 0;

  const primary = objective?.primary || null;
  const secondary = objective?.secondary || null;
  const controlFocusedObjectives = new Set(["keep_control", "clear_trump", "pressure_void", "protect_bottom", "grade_bottom"]);
  const controlFocused = controlFocusedObjectives.has(primary) || controlFocusedObjectives.has(secondary);
  if (!controlFocused) return 0;

  const triggerFlags = Array.isArray(entry.rolloutTriggerFlags) ? entry.rolloutTriggerFlags : [];
  const nextBreakdown = entry.rolloutEvaluation?.breakdown || {};
  const futureBreakdown = entry.rolloutFutureEvaluation?.breakdown || {};
  const futureDelta = typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : 0;
  const controlExit = futureBreakdown.controlExit || nextBreakdown.controlExit || 0;
  const turnAccess = futureBreakdown.turnAccess || nextBreakdown.turnAccess || 0;
  const safeLead = futureBreakdown.safeLead || nextBreakdown.safeLead || 0;
  const pointRunRisk = futureBreakdown.pointRunRisk || nextBreakdown.pointRunRisk || 0;
  const beatsCurrent = mode === "follow" && currentWinningPlay
    ? wouldAiComboBeatCurrent(playerId, entry.cards, currentWinningPlay)
    : false;
  const hasTurnAccessRisk = triggerFlags.includes("turn_access_risk");
  const hasPointRunRisk = triggerFlags.includes("point_run_risk");
  const hasNoSafeNextLead = triggerFlags.includes("no_safe_next_lead");
  const hasSafeAccessHold = triggerFlags.includes("turn_access_hold");
  const hasImmediateRisk = hasTurnAccessRisk || hasPointRunRisk || hasNoSafeNextLead;
  const controlClearlyHealthy = hasSafeAccessHold || (controlExit >= 12 && safeLead >= 6 && pointRunRisk >= -4);
  if (!hasImmediateRisk && controlClearlyHealthy) return 0;

  const pattern = classifyPlay(entry.cards);
  const comboPoints = getComboPointValue(entry.cards);
  const player = getPlayer(playerId);
  const controlSignalLead = mode === "lead"
    && player
    && typeof shouldAiUseHighControlSignalWindow === "function"
    && shouldAiUseHighControlSignalWindow(playerId, player)
    && scoreIntermediateControlSignalLead(playerId, entry.cards, player.hand) > 0;
  if (controlSignalLead && !triggerFlags.includes("late_bottom_pressure")) return 0;
  if (
    mode === "lead"
    && pattern.type === "single"
    && comboPoints === 0
    && entry.cards.every((card) => effectiveSuit(card) !== "trump")
  ) {
    return 0;
  }

  const commitment = getIntermediateResolvedFriendControlCommitmentScore(
    playerId,
    entry.cards,
    mode,
    currentWinningPlay
  );
  let penalty = Math.round(commitment * 0.55);

  if (mode === "lead") penalty += 12;
  if (mode === "follow" && beatsCurrent) penalty += 22;
  if (mode === "follow" && allyWinning) penalty += 18;
  if (mode === "follow" && !beatsCurrent) penalty += 10;
  if (primary === "clear_trump") penalty += 12;
  if (primary === "keep_control" || secondary === "keep_control") penalty += 10;
  if (primary === "pressure_void" || secondary === "pressure_void") penalty += 8;
  if (comboPoints > 0) penalty += 14;
  if (pattern.type === "pair") penalty += 12;
  if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") penalty += 18;
  if (hasTurnAccessRisk) penalty += 34;
  if (hasPointRunRisk) penalty += 38;
  if (hasTurnAccessRisk && hasPointRunRisk) penalty += 24;
  if (hasNoSafeNextLead) penalty += 28;
  if (triggerFlags.includes("late_bottom_pressure")) penalty += 18;
  if (turnAccess <= 0) penalty += 20;
  if (safeLead < 0) penalty += Math.min(28, Math.abs(safeLead) * 0.9);
  if (pointRunRisk < 0) penalty += Math.min(42, Math.abs(pointRunRisk) * 0.72);
  if (controlExit < 6) penalty += Math.min(48, Math.max(0, 6 - controlExit) * 4);
  if (futureDelta < 6) penalty += 18;

  if (hasSafeAccessHold) penalty -= 26;
  if (futureDelta >= 12) penalty -= 34;
  if (controlExit >= 12) penalty -= 34;
  if (safeLead >= 10) penalty -= 18;
  if (pointRunRisk >= 0) penalty -= 10;

  return Math.max(0, penalty);
}

/**
 * 作用：
 * 对“控制目标下仍主动领高分高张”的首发候选追加更硬的否决惩罚。
 *
 * 为什么这样写：
 * 当前 `dangerousPointLeadPenalty` 已经能在 heuristic 阶段识别高风险带分领牌，
 * 但它还不够像路线图要求的“硬否决”。
 * 真正的问题通常出现在 rollout 之后：
 * 候选虽然短期看似顺手，但未来两拍已经暴露出 `turn_access_risk / point_run_risk`，
 * 这时如果 objective 又是 `clear_trump / keep_control` 一类控制型目标，就不应该继续让高分高张领牌靠近榜首。
 * 这轮又补了 `controlExit`，用来识别“朋友已站队后是否还能安全续控或顺势把牌权交给同侧”；
 * 若未来评估已经说明控制过热，就需要再追加一层惩罚。
 *
 * 输入：
 * @param {object|null} entry - 已带有 heuristic 与 rollout 结果的首发候选条目。
 * @param {object|null} objective - 当前首发局面的目标配置。
 *
 * 输出：
 * @returns {number} 返回应从候选总分里额外扣除的否决惩罚。
 *
 * 注意：
 * - 这里只针对“已经被识别为危险带分领牌”的候选，不影响普通低分探路。
 * - 若 rollout 明确给出下一拍续控收益，例如 `turn_access_hold` 或较高 `futureDelta`，惩罚会显著降低。
 * - 该惩罚只用于首发排序，不改变合法性和规则结算。
 */
function scoreIntermediateRiskyPointLeadVetoPenalty(entry, objective = null) {
  if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return 0;
  const dangerousPointLeadPenalty = typeof entry.dangerousPointLeadPenalty === "number"
    ? entry.dangerousPointLeadPenalty
    : 0;
  if (dangerousPointLeadPenalty <= 0) return 0;

  const comboPoints = getComboPointValue(entry.cards);
  if (comboPoints <= 0) return 0;

  const primary = objective?.primary || null;
  const secondary = objective?.secondary || null;
  const controlFocusedObjectives = new Set(["keep_control", "clear_trump", "pressure_void", "protect_bottom", "grade_bottom"]);
  const controlFocused = controlFocusedObjectives.has(primary) || controlFocusedObjectives.has(secondary);
  if (!controlFocused) return 0;

  const pattern = classifyPlay(entry.cards);
  const triggerFlags = Array.isArray(entry.rolloutTriggerFlags) ? entry.rolloutTriggerFlags : [];
  const hasTurnAccessRisk = triggerFlags.includes("turn_access_risk");
  const hasPointRunRisk = triggerFlags.includes("point_run_risk");
  const hasSafeAccessHold = triggerFlags.includes("turn_access_hold");
  const futureDelta = typeof entry.rolloutFutureDelta === "number" ? entry.rolloutFutureDelta : 0;
  const futureBreakdown = entry.rolloutFutureEvaluation?.breakdown || {};
  const carriesHighPointHonor = entry.cards.some((card) => ["10", "K", "A"].includes(card.rank) && scoreValue(card) > 0);
  const explicitControlGain = hasSafeAccessHold || futureDelta >= 12;
  let penalty = Math.min(54, Math.round(dangerousPointLeadPenalty * 0.85));

  if (pattern.type === "single") penalty += 16;
  if (pattern.type === "pair") penalty += 24;
  if (carriesHighPointHonor) penalty += 18;
  if (primary === "clear_trump") penalty += 10;
  if (primary === "keep_control" || secondary === "keep_control") penalty += 8;
  if (isFriendTeamResolved()) penalty += 10;
  if (hasTurnAccessRisk) penalty += 22;
  if (hasPointRunRisk) penalty += 24;
  if (hasTurnAccessRisk && hasPointRunRisk) penalty += 18;
  if ((futureBreakdown.turnAccess || 0) <= 0) penalty += 12;
  if ((futureBreakdown.controlExit || 0) < 0) penalty += Math.min(22, Math.abs(futureBreakdown.controlExit) * 0.45);
  if ((futureBreakdown.safeLead || 0) < 0) penalty += 8;
  if ((futureBreakdown.pointRunRisk || 0) <= -12) penalty += 12;
  if ((futureBreakdown.controlExit || 0) > 0) penalty -= Math.min(18, futureBreakdown.controlExit * 0.35);
  if (!explicitControlGain) penalty += 18;
  if (explicitControlGain) penalty -= 26;

  return Math.max(0, penalty);
}

/**
 * 作用：
 * 为中级 / 高级 AI 的首发 rollout 评分返回一个可控的候选预算。
 *
 * 为什么这样写：
 * mixed 长样本里最慢的尖峰不是跟牌，而是“未站队或控牌期的复杂首发”：
 * 候选虽然只有十来手，但如果每一手都继续跑 depth-2 rollout，
 * 单次首发决策仍可能拖到几十秒。这里把首发也补成和跟牌一致的预算保护，
 * 先把最坏路径砍掉，再保留少量最关键分支做前瞻。
 *
 * 输入：
 * @param {Array<object>} candidateEntries - 已通过合法性过滤的首发候选条目。
 *
 * 输出：
 * @returns {number} 当前局面允许进入 rollout 评分的最大候选数；返回 `0` 表示本轮只走 heuristic shortlist。
 *
 * 注意：
 * - 低复杂度首发尽量不收紧，避免平白损失决策质量。
 * - 这里限制的是 rollout 数量，不影响候选合法性和基础 heuristic 排序。
 */
function getIntermediateLeadRolloutBudget(candidateEntries) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return 0;

  const candidateCount = candidateEntries.length;
  const maxComboSize = candidateEntries.reduce(
    (max, entry) => Math.max(max, Array.isArray(entry?.cards) ? entry.cards.length : 0),
    0
  );

  if (candidateCount <= 6 && maxComboSize <= 2) {
    return candidateCount;
  }
  if (maxComboSize >= 5 || candidateCount >= 18) {
    return Math.min(candidateCount, 2);
  }
  if (maxComboSize >= 4 || candidateCount >= 12) {
    return Math.min(candidateCount, 3);
  }
  if (maxComboSize >= 3 || candidateCount >= 8) {
    return Math.min(candidateCount, 4);
  }
  return candidateCount;
}

/**
 * 作用：
 * 为复杂首发场景返回一个纯 heuristic shortlist 容量。
 *
 * 为什么这样写：
 * 只收紧 rollout 预算还不够，如果继续把十几手首发全留到最终排序里，
 * 调试快照和排序成本仍会膨胀。这里给首发也补一层 shortlist 上限，
 * 让复杂首发改成“少量候选精排”，而不是继续全量展开。
 *
 * 输入：
 * @param {Array<object>} candidateEntries - 已过滤的首发候选条目。
 *
 * 输出：
 * @returns {number} 当前局面允许保留的 heuristic shortlist 数量。
 *
 * 注意：
 * - shortlist 上限可以大于 rollout 预算。
 * - 这里的上限只服务复杂首发，不影响简单局面的全量评分。
 */
function getIntermediateLeadShortlistLimit(candidateEntries) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return 0;

  const candidateCount = candidateEntries.length;
  const maxComboSize = candidateEntries.reduce(
    (max, entry) => Math.max(max, Array.isArray(entry?.cards) ? entry.cards.length : 0),
    0
  );

  if (candidateCount <= 6 && maxComboSize <= 2) {
    return candidateCount;
  }
  if (maxComboSize >= 5 || candidateCount >= 18) {
    return Math.min(candidateCount, 4);
  }
  if (maxComboSize >= 4 || candidateCount >= 12) {
    return Math.min(candidateCount, 6);
  }
  if (maxComboSize >= 3 || candidateCount >= 8) {
    return Math.min(candidateCount, 8);
  }
  return candidateCount;
}

/**
 * 作用：
 * 在首发评分前，先用便宜的 heuristic 把高价值候选缩成 rollout shortlist。
 *
 * 为什么这样写：
 * 首发的真实热点不是“候选完全爆炸”，而是十来手都值得看时每手都跑完整 rollout。
 * 这里优先保留：
 * 1. beginner 基线；
 * 2. heuristic 最高项；
 * 3. 安全续控候选；
 * 4. 低分非主探路；
 * 5. 关键主控候选；
 * 这样既能明显缩短复杂首发耗时，也尽量不丢掉最关键的分支类型。
 *
 * 输入：
 * @param {number} playerId - 当前决策玩家 ID。
 * @param {Array<object>} candidateEntries - 已过滤的首发候选条目。
 * @param {Array<object>} beginnerChoice - 初级提示链给出的基线动作。
 *
 * 输出：
 * @returns {Array<object>} 返回已经带上 `heuristicScore` 的首发 shortlist。
 *
 * 注意：
 * - 这里只做 shortlist，不直接决定最终出牌。
 * - `beginnerChoice` 需要尽量保留，避免把明显安全的保底首发裁掉。
 */
function selectIntermediateLeadRolloutEntries(playerId, candidateEntries, beginnerChoice) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return [];

  const annotatedEntries = candidateEntries
    .map((entry) => {
      const heuristicScore = scoreIntermediateLeadCandidate(playerId, entry.cards, beginnerChoice, entry);
      return {
        ...entry,
        heuristicScore,
      };
    })
    .sort((a, b) => {
      const scoreDiff = (b.heuristicScore || 0) - (a.heuristicScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a.cards).power - classifyPlay(b.cards).power;
    });

  const shortlistLimit = getIntermediateLeadShortlistLimit(annotatedEntries);
  if (shortlistLimit >= annotatedEntries.length) {
    return annotatedEntries;
  }

  const selectedEntries = [];
  const selectedKeys = new Set();
  const beginnerKey = Array.isArray(beginnerChoice) && beginnerChoice.length > 0
    ? getComboKey(beginnerChoice)
    : "";

  /**
   * 作用：
   * 把一手首发 shortlist 候选稳定加入结果集并去重。
   *
   * 为什么这样写：
   * shortlist 需要同时保留“安全基线、最佳启发式、不同分支类型”的代表项；
   * 用统一 helper 去重，能避免同一手牌被重复塞进结果里，打乱后续预算。
   *
   * 输入：
   * @param {?object} entry - 待加入 shortlist 的候选条目。
   *
   * 输出：
   * @returns {void} 只更新本地 shortlist，不返回额外结果。
   *
   * 注意：
   * - 空条目必须直接忽略。
   * - 达到 shortlist 上限后必须停止追加。
   */
  function addSelectedEntry(entry) {
    if (!entry || selectedEntries.length >= shortlistLimit) return;
    const comboKey = getComboKey(entry.cards);
    if (selectedKeys.has(comboKey)) return;
    selectedKeys.add(comboKey);
    selectedEntries.push(entry);
  }

  addSelectedEntry(annotatedEntries.find((entry) => getComboKey(entry.cards) === beginnerKey) || null);
  addSelectedEntry(annotatedEntries[0] || null);
  addSelectedEntry(annotatedEntries.find((entry) => isSafeEndgameLeadCandidate(entry)) || null);
  addSelectedEntry(annotatedEntries.find((entry) => (
    entry.cards.length > 0
    && effectiveSuit(entry.cards[0]) !== "trump"
    && getComboPointValue(entry.cards) === 0
  )) || null);
  addSelectedEntry(annotatedEntries.find((entry) => (
    entry.cards.length > 0
    && effectiveSuit(entry.cards[0]) === "trump"
  )) || null);

  for (const entry of annotatedEntries) {
    addSelectedEntry(entry);
    if (selectedEntries.length >= shortlistLimit) break;
  }

  return selectedEntries;
}

function buildScoredIntermediateLeadEntries(playerId, candidateEntries, beginnerChoice, baselineEvaluation = null) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return [];
  const baseEvaluation = baselineEvaluation || evaluateState(
    cloneSimulationState(state),
    playerId,
    getIntermediateObjective(playerId, "lead", cloneSimulationState(state))
  );
  const rolloutEntries = selectIntermediateLeadRolloutEntries(playerId, candidateEntries, beginnerChoice);
  const rolloutBudget = getIntermediateLeadRolloutBudget(rolloutEntries);
  return rolloutEntries
    .map((entry, index) => {
      const heuristicScore = typeof entry.heuristicScore === "number"
        ? entry.heuristicScore
        : scoreIntermediateLeadCandidate(playerId, entry.cards, beginnerChoice, entry);
      if (index >= rolloutBudget) {
        return {
          ...entry,
          heuristicScore,
          rolloutScore: 0,
          rolloutDelta: 0,
          rolloutCompleted: false,
          rolloutWinnerId: null,
          rolloutPoints: 0,
          rolloutNextMode: null,
          rolloutTrace: [],
          rolloutDepth: 0,
          rolloutFutureDelta: 0,
          rolloutReachedOwnTurn: false,
          rolloutFutureTrace: [],
          rolloutTriggerFlags: ["rollout_skipped_by_budget"],
          rolloutEvaluation: summarizeEvaluationForDebug(baseEvaluation),
          rolloutFutureEvaluation: null,
          structureControlPenalty: 0,
          riskyPointLeadVetoPenalty: 0,
          unresolvedProbeVetoPenalty: 0,
          resolvedFriendControlCoolingPenalty: 0,
          score: heuristicScore,
        };
      }
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
      const riskyPointLeadVetoPenalty = scoreIntermediateRiskyPointLeadVetoPenalty(rolloutEntry, baseEvaluation?.objective);
      const unresolvedProbeVetoPenalty = scoreIntermediateUnresolvedProbeVetoPenalty(
        playerId,
        rolloutEntry,
        "lead",
        baseEvaluation?.objective
      );
      const resolvedFriendControlCoolingPenalty = scoreIntermediateResolvedFriendControlCoolingPenalty(
        playerId,
        rolloutEntry,
        "lead",
        baseEvaluation?.objective
      );
      return {
        ...rolloutEntry,
        structureControlPenalty,
        riskyPointLeadVetoPenalty,
        unresolvedProbeVetoPenalty,
        resolvedFriendControlCoolingPenalty,
        score: heuristicScore
          + rollout.score
          - structureControlPenalty
          - riskyPointLeadVetoPenalty
          - unresolvedProbeVetoPenalty
          - resolvedFriendControlCoolingPenalty,
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a.cards).power - classifyPlay(b.cards).power;
    });
}

/**
 * 作用：
 * 为中级 / 高级 AI 的多张跟牌 rollout 评分返回一个可控的候选预算。
 *
 * 为什么这样写：
 * 第六轮这类 `5` 张复杂副牌跟牌里，合法候选虽然已经被候选层压到几十手，
 * 但如果仍对每一手都跑完整 rollout，单个玩家的一次跟牌就会卡到数秒以上。
 * 这里把“先 heuristic 缩候选，再 rollout 精排”收口成统一预算，
 * 可以在不改规则合法性的前提下，直接切断最坏路径里的候选爆炸。
 *
 * 输入：
 * @param {Array<object>} candidateEntries - 已通过合法性过滤的跟牌候选条目。
 *
 * 输出：
 * @returns {number} 当前局面允许进入 rollout 评分的最大候选数；返回 `0` 表示本轮只走 heuristic shortlist。
 *
 * 注意：
 * - 单张和低复杂度跟牌尽量不收紧，避免平白损失决策质量。
 * - 这里限制的是 rollout 评分数，不影响合法候选生成与前置短路规则。
 */
function getIntermediateFollowRolloutBudget(candidateEntries) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return 0;

  const candidateCount = candidateEntries.length;
  const maxComboSize = candidateEntries.reduce(
    (max, entry) => Math.max(max, Array.isArray(entry?.cards) ? entry.cards.length : 0),
    0
  );

  if (candidateCount <= 6 && maxComboSize <= 2) {
    return candidateCount;
  }
  if (maxComboSize >= 5 || candidateCount >= 20) {
    return 0;
  }
  if (maxComboSize >= 4 || candidateCount >= 14) {
    return Math.min(candidateCount, 2);
  }
  if (maxComboSize >= 3 || candidateCount >= 10) {
    return Math.min(candidateCount, 4);
  }
  return candidateCount;
}

/**
 * 作用：
 * 为复杂跟牌场景返回一个纯 heuristic shortlist 容量。
 *
 * 为什么这样写：
 * 当 rollout 预算被压到 `0` 或极小值时，仍需要保留少量高质量候选参与最终排序，
 * 否则会从“完整评分爆炸”直接退回成“只看一手牌”，行为会过于生硬。
 * 这里单独保留一个 shortlist 上限，让复杂跟牌改为“少量 heuristic 精排”，而不是“完全不比”。
 *
 * 输入：
 * @param {Array<object>} candidateEntries - 已过滤的跟牌候选条目。
 *
 * 输出：
 * @returns {number} 当前局面允许保留的 heuristic shortlist 数量。
 *
 * 注意：
 * - shortlist 上限可以大于 rollout 预算。
 * - 这里的数量只用于复杂跟牌，不改变合法候选生成数量。
 */
function getIntermediateFollowShortlistLimit(candidateEntries) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return 0;

  const candidateCount = candidateEntries.length;
  const maxComboSize = candidateEntries.reduce(
    (max, entry) => Math.max(max, Array.isArray(entry?.cards) ? entry.cards.length : 0),
    0
  );

  if (candidateCount <= 6 && maxComboSize <= 2) {
    return candidateCount;
  }
  if (maxComboSize >= 5 || candidateCount >= 20) {
    return Math.min(candidateCount, 4);
  }
  if (maxComboSize >= 4 || candidateCount >= 14) {
    return Math.min(candidateCount, 6);
  }
  if (maxComboSize >= 3 || candidateCount >= 10) {
    return Math.min(candidateCount, 8);
  }
  return candidateCount;
}

/**
 * 作用：
 * 在跟牌评分前，先用便宜的 heuristic 把高价值候选缩成 rollout shortlist。
 *
 * 为什么这样写：
 * 真正耗时的不是“枚举出候选”，而是后面的每候选 rollout。
 * 先在这里保留：
 * 1. heuristic 最高的主候选；
 * 2. 最值得考虑的“能压住”候选；
 * 3. 最值得考虑的“先不压”候选；
 * 再把 shortlist 交给 rollout，就能显著降低复杂跟牌的卡顿风险，同时保住关键分支。
 *
 * 输入：
 * @param {number} playerId - 当前决策玩家 ID。
 * @param {Array<object>} candidateEntries - 已过滤的跟牌候选条目。
 * @param {?object} currentWinningPlay - 当前桌面的领先出牌。
 * @param {boolean} allyWinning - 当前领先者是否为己方。
 * @param {Array<object>} beginnerChoice - 初级提示链给出的基线动作。
 *
 * 输出：
 * @returns {Array<object>} 返回已经带上 `heuristicScore` 的 rollout shortlist。
 *
 * 注意：
 * - 这里只做 shortlist，不直接决定最终出牌。
 * - `beginnerChoice` 必须尽量保留，避免明显安全兜底手被 shortlist 意外丢掉。
 */
function selectIntermediateFollowRolloutEntries(
  playerId,
  candidateEntries,
  currentWinningPlay,
  allyWinning,
  beginnerChoice
) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) return [];

  const annotatedEntries = candidateEntries
    .map((entry) => ({
      ...entry,
      heuristicScore: scoreIntermediateFollowCandidate(
        playerId,
        entry.cards,
        currentWinningPlay,
        allyWinning,
        beginnerChoice
      ),
    }))
    .sort((a, b) => {
      const scoreDiff = b.heuristicScore - a.heuristicScore;
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a.cards).power - classifyPlay(b.cards).power;
    });

  const shortlistLimit = getIntermediateFollowShortlistLimit(annotatedEntries);
  if (shortlistLimit >= annotatedEntries.length) {
    return annotatedEntries;
  }

  const selectedEntries = [];
  const selectedKeys = new Set();
  const beginnerKey = Array.isArray(beginnerChoice) && beginnerChoice.length > 0
    ? getComboKey(beginnerChoice)
    : "";

  /**
   * 作用：
   * 把一手 shortlist 候选稳定加入结果集并去重。
   *
   * 为什么这样写：
   * shortlist 既要保留 heuristic 最高项，也要额外插入“能压 / 不压 / beginner 基线”这类保底分支；
   * 用统一 helper 去重，能避免同一手牌被重复塞进结果里，打乱后续预算。
   *
   * 输入：
   * @param {?object} entry - 待加入 shortlist 的候选条目。
   *
   * 输出：
   * @returns {void} 只更新本地 shortlist，不返回额外结果。
   *
   * 注意：
   * - 空条目必须直接忽略。
   * - 达到 rollout 预算后必须立即停止追加。
   */
  function addSelectedEntry(entry) {
    if (!entry || selectedEntries.length >= shortlistLimit) return;
    const comboKey = getComboKey(entry.cards);
    if (selectedKeys.has(comboKey)) return;
    selectedKeys.add(comboKey);
    selectedEntries.push(entry);
  }

  addSelectedEntry(annotatedEntries.find((entry) => getComboKey(entry.cards) === beginnerKey) || null);
  addSelectedEntry(annotatedEntries[0] || null);
  addSelectedEntry(
    annotatedEntries.find((entry) => currentWinningPlay && wouldAiComboBeatCurrent(playerId, entry.cards, currentWinningPlay)) || null
  );
  addSelectedEntry(
    annotatedEntries.find((entry) => !currentWinningPlay || !wouldAiComboBeatCurrent(playerId, entry.cards, currentWinningPlay)) || null
  );

  for (const entry of annotatedEntries) {
    addSelectedEntry(entry);
    if (selectedEntries.length >= shortlistLimit) break;
  }

  return selectedEntries;
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
  const rolloutEntries = selectIntermediateFollowRolloutEntries(
    playerId,
    candidateEntries,
    currentWinningPlay,
    allyWinning,
    beginnerChoice
  );
  const rolloutBudget = getIntermediateFollowRolloutBudget(rolloutEntries);
  return rolloutEntries
    .map((entry, index) => {
      const heuristicScore = typeof entry.heuristicScore === "number"
        ? entry.heuristicScore
        : scoreIntermediateFollowCandidate(
          playerId,
          entry.cards,
          currentWinningPlay,
          allyWinning,
          beginnerChoice
        );
      if (index >= rolloutBudget) {
        const unresolvedProbeVetoPenalty = scoreIntermediateUnresolvedProbeVetoPenalty(playerId, {
          ...entry,
          heuristicScore,
          rolloutScore: 0,
          rolloutFutureDelta: 0,
          rolloutTriggerFlags: ["rollout_skipped_by_budget"],
          rolloutEvaluation: summarizeEvaluationForDebug(baseEvaluation),
          rolloutFutureEvaluation: null,
        }, "follow", baseEvaluation?.objective);
        return {
          ...entry,
          heuristicScore,
          rolloutScore: 0,
          rolloutDelta: 0,
          rolloutCompleted: false,
          rolloutWinnerId: null,
          rolloutPoints: 0,
          rolloutNextMode: null,
          rolloutTrace: [],
          rolloutDepth: 0,
          rolloutFutureDelta: 0,
          rolloutReachedOwnTurn: false,
          rolloutFutureTrace: [],
          rolloutTriggerFlags: ["rollout_skipped_by_budget"],
          rolloutEvaluation: summarizeEvaluationForDebug(baseEvaluation),
          rolloutFutureEvaluation: null,
          unresolvedProbeVetoPenalty,
          score: heuristicScore - unresolvedProbeVetoPenalty,
        };
      }
      const rollout = getIntermediateRolloutSummary(playerId, entry.cards, baseEvaluation, "follow");
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
      const unresolvedProbeVetoPenalty = scoreIntermediateUnresolvedProbeVetoPenalty(
        playerId,
        rolloutEntry,
        "follow",
        baseEvaluation?.objective
      );
      const resolvedFriendControlCoolingPenalty = scoreIntermediateResolvedFriendControlCoolingPenalty(
        playerId,
        rolloutEntry,
        "follow",
        baseEvaluation?.objective,
        currentWinningPlay,
        allyWinning
      );
      return {
        ...rolloutEntry,
        unresolvedProbeVetoPenalty,
        resolvedFriendControlCoolingPenalty,
        score: heuristicScore + rollout.score - unresolvedProbeVetoPenalty - resolvedFriendControlCoolingPenalty,
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
  const resolvedRevealSupportChoice = chooseAiResolvedFriendRevealSupportFollow(playerId, candidates, currentWinningPlay);
  if (resolvedRevealSupportChoice.length > 0) return resolvedRevealSupportChoice;
  if (!shouldDelayReveal && revealChoice.length > 0 && (revealBeats || currentWinningPlay?.playerId !== state.bankerId)
    && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }
  const invitationTakeoverChoice = chooseIntermediateInvitationTakeover(playerId, candidates, currentWinningPlay);
  if (invitationTakeoverChoice.length > 0) return invitationTakeoverChoice;
  const pairFollowTriplePreserveDiscard = chooseAiPairFollowTriplePreserveDiscard(playerId, candidates, currentWinningPlay);
  if (pairFollowTriplePreserveDiscard.length > 0) return pairFollowTriplePreserveDiscard;
  const highPairPreserveDiscard = chooseAiHighPairPreserveDiscard(playerId, candidates, currentWinningPlay);
  if (highPairPreserveDiscard.length > 0) return highPairPreserveDiscard;
  const handoffReceiveChoice = chooseIntermediateHandoffReceive(playerId, candidates, currentWinningPlay);
  if (handoffReceiveChoice.length > 0) return handoffReceiveChoice;

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
  const friendSetupLead = chooseAiBankerFriendSetupLead(playerId, player);
  if (friendSetupLead.length > 0) return friendSetupLead;
  const revealedFriendControlLead = chooseAiBankerRevealedFriendControlLead(playerId, player);
  if (revealedFriendControlLead.length > 0) return revealedFriendControlLead;
  const noTrumpJokerFriendControlLead = chooseAiNoTrumpJokerFriendControlLead(playerId, player);
  if (noTrumpJokerFriendControlLead.length > 0) return noTrumpJokerFriendControlLead;
  const noTrumpPowerLead = chooseAiNoTrumpBankerPowerLead(playerId, player);
  if (noTrumpPowerLead.length > 0) return noTrumpPowerLead;
  const bankerSoloFallbackLead = chooseAiBankerSoloFallbackLead(playerId, player);
  if (bankerSoloFallbackLead.length > 0) return bankerSoloFallbackLead;
  if (
    playerId === state.bankerId
    && state.friendTarget
    && !isFriendTeamResolved()
    && state.friendTarget.suit !== "joker"
    && !shouldAiDeferNoTrumpFriendProbe(playerId, player)
    && !shouldAiUseBankerSoloFallback(playerId)
  ) {
    const targetCopies = player.hand.filter(
      (card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
    );
    const currentSeen = state.friendTarget.matchesSeen || 0;
    const remainingBeforeReveal = getFriendTargetRevealOccurrence() - currentSeen;
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
  const lockedPointSafetyLead = chooseAiLockedPointSafetyLead(playerId, player);
  if (lockedPointSafetyLead.length > 0) return lockedPointSafetyLead;
  const gradeBottomTrumpLead = chooseAiGradeBottomTrumpLead(playerId, player);
  if (gradeBottomTrumpLead.length > 0) return gradeBottomTrumpLead;
  const safeAntiRuffLead = chooseAiSafeAntiRuffLead(playerId, player);
  if (safeAntiRuffLead.length > 0) return safeAntiRuffLead;
  const highControlSignalLead = chooseAiHighControlSignalLead(playerId, player);
  if (highControlSignalLead.length > 0) return highControlSignalLead;
  const handoffLead = chooseAiHandoffLead(playerId, player);
  if (handoffLead.length > 0) return handoffLead;
  const voidPressureLead = chooseAiVoidPressureLead(playerId, player);
  if (voidPressureLead.length > 0) return voidPressureLead;
  return [];
}

// 选择 AI 当前的跟牌出牌。
function chooseAiFollowPlay(playerId, candidates) {
  if (candidates.length === 0) return [];
  const player = getPlayer(playerId);
  const handBefore = Array.isArray(player?.hand) ? player.hand : [];
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId, candidates);
  if (forcedReveal.length > 0) return forcedReveal;
  const currentWinningPlay = getCurrentWinningPlay();
  const allyWinning = currentWinningPlay ? areAiSameSide(playerId, currentWinningPlay.playerId) : false;
  const beatingCandidates = candidates.filter((combo) => doesSelectionBeatCurrent(playerId, combo));
  const revealOpportunity = canAiRevealFriendNow(playerId);
  const shouldDelayReveal = revealOpportunity
    && (shouldAiDelayRevealOnOpeningLead(playerId) || shouldAiDelayRevealForGradeBottom(playerId));
  const revealChoice = revealOpportunity ? chooseAiRevealCombo(candidates) : [];
  const supportChoice = revealOpportunity ? chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) : [];
  const safeBeatingCandidates = shouldDelayReveal
    ? beatingCandidates.filter((combo) =>
      !combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank)
    )
    : beatingCandidates;

  if (supportChoice.length > 0) {
    return supportChoice;
  }

  const resolvedRevealSupportChoice = chooseAiResolvedFriendRevealSupportFollow(playerId, candidates, currentWinningPlay);
  if (resolvedRevealSupportChoice.length > 0) {
    return resolvedRevealSupportChoice;
  }

  if (!shouldDelayReveal && revealChoice.length > 0 && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  const pairFollowTriplePreserveDiscard = chooseAiPairFollowTriplePreserveDiscard(playerId, candidates, currentWinningPlay);
  if (pairFollowTriplePreserveDiscard.length > 0) {
    return pairFollowTriplePreserveDiscard;
  }

  const highPairPreserveDiscard = chooseAiHighPairPreserveDiscard(playerId, candidates, currentWinningPlay);
  if (highPairPreserveDiscard.length > 0) {
    return highPairPreserveDiscard;
  }

  if (!allyWinning && safeBeatingCandidates.length > 0) {
    return safeBeatingCandidates.sort((a, b) => {
      const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
      if (structureDiff !== 0) return structureDiff;
      const sameSuitPreserveDiff = scoreSameSuitSingleStructurePreservationFromHand(b, handBefore)
        - scoreSameSuitSingleStructurePreservationFromHand(a, handBefore);
      if (sameSuitPreserveDiff !== 0) return sameSuitPreserveDiff;
      const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b)
        - scoreOffSuitDiscardStructurePreservation(playerId, a);
      if (preserveDiff !== 0) return preserveDiff;
      const highPairDiff = scoreOffSuitHighPairPreservation(playerId, b, null, currentWinningPlay)
        - scoreOffSuitHighPairPreservation(playerId, a, null, currentWinningPlay);
      if (highPairDiff !== 0) return highPairDiff;
      const aPattern = classifyPlay(a);
      const bPattern = classifyPlay(b);
      const powerDiff = aPattern.power - bPattern.power;
      if (powerDiff !== 0) return powerDiff;
      return a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    })[0];
  }

  const gradeBottomPreserveDiscard = chooseAiGradeBottomPreserveDiscard(playerId, candidates, currentWinningPlay);
  if (gradeBottomPreserveDiscard.length > 0) {
    return gradeBottomPreserveDiscard;
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
      const sameSuitPreserveDiff = scoreSameSuitSingleStructurePreservationFromHand(b, handBefore)
        - scoreSameSuitSingleStructurePreservationFromHand(a, handBefore);
      if (sameSuitPreserveDiff !== 0) return sameSuitPreserveDiff;
      const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b)
        - scoreOffSuitDiscardStructurePreservation(playerId, a);
      if (preserveDiff !== 0) return preserveDiff;
      const highPairDiff = scoreOffSuitHighPairPreservation(playerId, b, null, currentWinningPlay)
        - scoreOffSuitHighPairPreservation(playerId, a, null, currentWinningPlay);
      if (highPairDiff !== 0) return highPairDiff;
      const scoreDiff = b.reduce((sum, card) => sum + scoreValue(card), 0) - a.reduce((sum, card) => sum + scoreValue(card), 0);
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a).power - classifyPlay(b).power;
    })[0];
  }

  if (!shouldDelayReveal && revealChoice.length > 0) {
    return revealChoice;
  }

  return candidates.sort((a, b) => {
    const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
    if (structureDiff !== 0) return structureDiff;
    const sameSuitPreserveDiff = scoreSameSuitSingleStructurePreservationFromHand(b, handBefore)
      - scoreSameSuitSingleStructurePreservationFromHand(a, handBefore);
    if (sameSuitPreserveDiff !== 0) return sameSuitPreserveDiff;
    const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b)
      - scoreOffSuitDiscardStructurePreservation(playerId, a);
    if (preserveDiff !== 0) return preserveDiff;
    const highPairDiff = scoreOffSuitHighPairPreservation(playerId, b, null, currentWinningPlay)
      - scoreOffSuitHighPairPreservation(playerId, a, null, currentWinningPlay);
    if (highPairDiff !== 0) return highPairDiff;
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
    }
  }

  if (state.leadSpec.type === "pair") {
    score += getForcedPairUnits(combo) * (followsLeadSuit ? 120 : comboSuit === "trump" ? 18 : 0);
  } else if (state.leadSpec.type === "triple") {
    score += getTripleUnits(combo) * (followsLeadSuit ? 150 : comboSuit === "trump" ? 24 : 0);
    score += getForcedPairUnits(combo) * (followsLeadSuit ? 40 : comboSuit === "trump" ? 10 : 0);
  } else if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
    score += getForcedPairUnits(combo) * (followsLeadSuit ? 140 : comboSuit === "trump" ? 20 : 0);
  } else if (state.leadSpec.type === "bulldozer") {
    const tripleUnits = getTripleUnits(combo);
    score += tripleUnits * (followsLeadSuit ? 160 : comboSuit === "trump" ? 26 : 0);
    score += getForcedPairUnitsWithReservedTriples(combo, tripleUnits) * (followsLeadSuit ? 50 : comboSuit === "trump" ? 12 : 0);
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
