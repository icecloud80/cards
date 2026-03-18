// 估算 AI 当前手牌的整体强度。
function getAiHandStrength(playerId) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  return player.hand.reduce((sum, card) => {
    const trumpBonus = isTrump(card) ? 3 : 0;
    const highBonus = cardStrength(card) >= 12 ? 1 : 0;
    return sum + trumpBonus + highBonus + scoreValue(card) / 5;
  }, 0);
}

// 评估 AI 手里站队相关牌型的压力。
function getAiRevealPatternPressure(player) {
  if (!player) return 0;
  const bulldozers = findSerialTuples(player.hand, 3);
  if (bulldozers.length > 0) return 3;
  const trains = findSerialTuples(player.hand, 2).filter((combo) => classifyPlay(combo).type === "train");
  if (trains.length > 0) return 3;
  const tractors = findSerialTuples(player.hand, 2).filter((combo) => classifyPlay(combo).type === "tractor");
  if (tractors.length > 0) return 2;
  const strongTriples = findTriples(player.hand);
  if (strongTriples.length > 0) return 1;
  return 0;
}

/**
 * 作用：
 * 判断当前级别是否属于“级牌扣底优先级应明显提高”的特殊级。
 *
 * 为什么这样写：
 * 用户补充了 `J / Q / K / A` 这些特殊级里，级牌扣底往往比普通升级更关键；
 * 把这层口径收成统一 helper 后，初级 heuristic、中级 objective 和文档都能共用同一套判断。
 *
 * 输入：
 * @param {string} levelRank - 当前局面的级牌点数。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前属于级牌扣底优先级更高的特殊级。
 *
 * 注意：
 * - 这里只负责判断“是不是特殊级”，不直接决定具体出牌。
 * - 当前口径只覆盖 `J / Q / K / A`，后续若扩到 `+2 / +A` 再统一补充。
 */
function isGradeBottomPriorityLevel(levelRank) {
  return FACE_CARD_LEVELS.has(levelRank);
}

// 返回庄家前一位的守门位玩家 ID。
function getGoalkeeperId() {
  return getPreviousPlayerId(state.nextFirstDealPlayerId || PLAYER_ORDER[0]);
}

// 计算 AI 是否主动站队的意愿分数。
function getAiRevealIntentScore(playerId) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  let score = 0;
  if (getAiHandStrength(playerId) >= 18) score += 1;
  if (player.hand.filter((card) => isTrump(card)).length >= 4) score += 1;
  score += getAiRevealPatternPressure(player);
  if (state.trickNumber === 1 && playerId === getGoalkeeperId()) {
    score += 2;
  }
  return score;
}

// 统计 AI 手牌中目标牌的张数。
function getAiTargetCopiesInHand(playerId, target = state.friendTarget) {
  const player = getPlayer(playerId);
  if (!player || !target) return 0;
  return player.hand.filter((card) => card.suit === target.suit && card.rank === target.rank).length;
}

// 判断 AI 当前是否可以亮明朋友身份。
function canAiRevealFriendNow(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (currentSeen + 1 !== neededOccurrence) return false;
  if (getAiTargetCopiesInHand(playerId) <= 0) return false;
  return true;
}

// 判断 AI 当前是否应该站队。
function shouldAiRevealFriend(playerId) {
  if (!canAiRevealFriendNow(playerId)) return false;
  if (isAiCertainFriend(playerId)) return true;
  if (shouldAiDelayRevealOnOpeningLead(playerId)) return false;
  if (shouldAiDelayRevealForGradeBottom(playerId)) return false;
  return getAiRevealIntentScore(playerId) >= 2;
}

// 从候选牌组中挑选最适合站队的出牌。
function chooseAiRevealCombo(candidates) {
  const revealChoices = candidates.filter((combo) =>
    combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank)
  );
  if (revealChoices.length === 0) return [];
  return revealChoices.sort((a, b) => {
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

// 为必然成友的 AI 返回强制站队的出牌。
function getForcedCertainFriendRevealPlay(playerId, candidates = null) {
  if (!canAiRevealFriendNow(playerId) || !isAiCertainFriend(playerId)) return [];
  if (shouldAiDelayRevealOnOpeningLead(playerId)) return [];
  const player = getPlayer(playerId);
  if (!player) return [];
  if (Array.isArray(candidates) && candidates.length > 0) {
    return chooseAiRevealCombo(candidates);
  }
  const friendCard = player.hand.find((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
  return friendCard ? [friendCard] : [];
}

// 返回某位玩家之后还未出牌的玩家列表。
function getPendingPlayersAfter(playerId) {
  if (!state.leadSpec || state.currentTrick.length === 0) return [];
  const pending = [];
  let nextPlayerId = getNextPlayerId(playerId);
  while (nextPlayerId !== state.leaderId && pending.length < PLAYER_ORDER.length) {
    pending.push(nextPlayerId);
    nextPlayerId = getNextPlayerId(nextPlayerId);
  }
  return pending;
}

// 判断 AI 的牌组能否压过当前最大牌。
function wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay = getCurrentWinningPlay()) {
  if (!state.leadSpec || !currentWinningPlay || !Array.isArray(combo) || combo.length === 0) return false;
  const pattern = classifyPlay(combo);
  if (!matchesLeadPattern(pattern, state.leadSpec)) return false;
  const currentPattern = classifyPlay(currentWinningPlay.cards);
  if (state.leadSpec.type === "single") {
    return compareSingle(combo[0], currentWinningPlay.cards[0], state.leadSpec.suit) > 0;
  }
  return compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) > 0;
}

// 判断打家在不站队时是否大概率守住这一轮。
function isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay) {
  if (!currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return false;
  return getPendingPlayersAfter(playerId).length === 0;
}

// 按朋友目标构造一张用于比较的虚拟牌。
function getTargetVirtualCard(target = state.friendTarget) {
  if (!target) return null;
  return {
    id: `target-${target.suit}-${target.rank}`,
    suit: target.suit,
    rank: target.rank,
  };
}

// 判断这张牌是否恰好比目标朋友牌低一档。
function isOneStepBelowFriendTarget(card, target = state.friendTarget) {
  if (!card || !target || target.suit === "joker" || card.suit !== target.suit) return false;
  const targetCard = getTargetVirtualCard(target);
  if (!targetCard) return false;
  return getPatternUnitPower(targetCard, effectiveSuit(targetCard)) - getPatternUnitPower(card, effectiveSuit(card)) === 1;
}

function doesBankerOpeningLeadBlockFriendTakeover(target = state.friendTarget) {
  if (!target || !state.currentTrick[0]?.cards?.length) return false;
  const bankerLeadCard = state.currentTrick[0].cards[0];
  const targetCard = getTargetVirtualCard(target);
  if (!targetCard) return false;
  const leadSuit = effectiveSuit(bankerLeadCard);
  const targetSuit = effectiveSuit(targetCard);
  if (leadSuit !== targetSuit) return false;
  return getPatternUnitPower(bankerLeadCard, leadSuit) >= getPatternUnitPower(targetCard, targetSuit);
}

// 判断 AI 是否应在庄家领单时延后站队。
function shouldAiDelayRevealOnOpeningLead(playerId) {
  if (!state.friendTarget || state.currentTrick[0]?.playerId !== state.bankerId) return false;
  if (state.currentTrick[0]?.cards.length !== 1) return false;
  const currentWinningPlay = getCurrentWinningPlay();

  const bankerLeadCard = state.currentTrick[0].cards[0];
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  const revealOpportunity = currentSeen + 1 === neededOccurrence;

  if (revealOpportunity && doesBankerOpeningLeadBlockFriendTakeover(state.friendTarget)) {
    return true;
  }

  if (neededOccurrence === 1 && isOneStepBelowFriendTarget(bankerLeadCard, state.friendTarget)) {
    return true;
  }

  if (neededOccurrence === 2 && currentSeen === 1
    && bankerLeadCard.suit === state.friendTarget.suit
    && bankerLeadCard.rank === state.friendTarget.rank) {
    return true;
  }

  return false;
}

// 判断 AI 是否已经可以确定自己是朋友。
function isAiCertainFriend(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  const ownCopies = getAiTargetCopiesInHand(playerId);
  if (ownCopies <= 0 || neededOccurrence <= 1) return false;
  return currentSeen + ownCopies >= neededOccurrence && currentSeen + ownCopies >= 3;
}

// 判断 AI 当前是否属于潜在朋友阵营。
function isAiProspectiveFriend(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  const ownCopies = getAiTargetCopiesInHand(playerId);
  if (ownCopies <= 0) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  return currentSeen + ownCopies >= neededOccurrence;
}

// 判断 AI 当前是否可视为暂定闲家。
function isAiTentativeDefender(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  return getAiTargetCopiesInHand(playerId) === 0;
}

// 判断两名 AI 当前是否属于同一阵营。
function areAiSameSide(playerA, playerB) {
  if (isFriendTeamResolved()) return areSameSide(playerA, playerB);
  return playerA === playerB;
}

// 为站队前的配合出牌选择方案。
function chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) {
  if (!state.friendTarget || !currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return [];
  if (state.currentTrick[0]?.playerId !== state.bankerId) return [];
  if (state.currentTrick[0]?.cards.length !== 1) return [];
  const player = getPlayer(playerId);
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) return [];

  const bankerLeadCard = state.currentTrick[0].cards[0];
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  const revealOpportunity = currentSeen + 1 === neededOccurrence;
  const delayForFirstTarget = neededOccurrence === 1 && isOneStepBelowFriendTarget(bankerLeadCard, state.friendTarget);
  const delayForSecondTarget = neededOccurrence === 2 && currentSeen === 1
    && bankerLeadCard.suit === state.friendTarget.suit
    && bankerLeadCard.rank === state.friendTarget.rank;
  const blockedTakeover = revealOpportunity && doesBankerOpeningLeadBlockFriendTakeover(state.friendTarget);
  if (!delayForFirstTarget && !delayForSecondTarget && !blockedTakeover) return [];

  const supportChoices = candidates.filter((combo) =>
    !combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank)
      && !wouldAiComboBeatCurrent(playerId, combo, currentWinningPlay)
  );

  if (supportChoices.length === 0) return [];

  return supportChoices.sort((a, b) => {
    const preserveDiff = scoreSameSuitSingleStructurePreservationFromHand(b, player.hand)
      - scoreSameSuitSingleStructurePreservationFromHand(a, player.hand);
    if (preserveDiff !== 0) return preserveDiff;
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

// 从一组牌中选出进攻性最强的首发。
function chooseStrongLeadFromCards(cards) {
  if (cards.length === 0) return [];
  const bulldozers = findSerialTuples(cards, 3);
  if (bulldozers.length > 0) return bulldozers[bulldozers.length - 1];
  const trains = findSerialTuples(cards, 2).filter((combo) => classifyPlay(combo).type === "train");
  if (trains.length > 0) return trains[trains.length - 1];
  const tractors = findSerialTuples(cards, 2).filter((combo) => classifyPlay(combo).type === "tractor");
  if (tractors.length > 0) return tractors[tractors.length - 1];
  const triples = findTriples(cards);
  if (triples.length > 0) return triples[triples.length - 1];
  const pairs = findPairs(cards);
  if (pairs.length > 0) return pairs[pairs.length - 1];
  return [...cards].sort((a, b) => cardStrength(b) - cardStrength(a)).slice(0, 1);
}

/**
 * 作用：
 * 返回朋友正式亮相时记录的轮次。
 *
 * 为什么这样写：
 * 这轮要在“朋友刚亮后的 2-3 轮”切到打家控局模式，
 * 因此需要一份稳定的亮相轮次来源，避免每个 heuristic 自己猜测当前是否还在窗口内。
 *
 * 输入：
 * @param {void} - 直接读取当前全局朋友状态。
 *
 * 输出：
 * @returns {number|null} 朋友亮相轮次；不存在时返回 `null`。
 *
 * 注意：
 * - 只有真正亮相的朋友才会写入，`failed` 或未亮相都返回 `null`。
 * - 老局数据或旧测试若没有该字段，上层必须自己兜底。
 */
function getAiFriendRevealTrickNumber() {
  if (!state.friendTarget?.revealed) return null;
  return Number.isInteger(state.friendTarget.revealedTrickNumber)
    ? state.friendTarget.revealedTrickNumber
    : null;
}

/**
 * 作用：
 * 判断当前是否处于“朋友刚亮后应优先控局”的短窗口。
 *
 * 为什么这样写：
 * 数据显示打家并不是不会赢，而是经常在朋友亮相后没有立刻切到清主与续控模式；
 * 这里把这段时间抽成统一窗口，供首发和后续保守 fallback 共用。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前仍处于亮友后控局窗口。
 *
 * 注意：
 * - 只对打家方启用，闲家不走这条模式。
 * - 窗口默认覆盖朋友亮相后的当前轮到后续 3 轮，避免只触发 1 手太短。
 */
function shouldAiUseBankerRevealedFriendControlMode(playerId) {
  const revealedTrickNumber = getAiFriendRevealTrickNumber();
  if (revealedTrickNumber == null || !isFriendTeamResolved()) return false;
  if (!areSameSide(playerId, state.bankerId)) return false;
  const currentTrickNumber = state.trickNumber || 1;
  return currentTrickNumber <= revealedTrickNumber + 3;
}

/**
 * 作用：
 * 判断无主打家当前是否应先打控制线，而不是急着探朋友门。
 *
 * 为什么这样写：
 * 最近样本里，无主打家经常一上来就继续摸朋友门，结果还没形成稳定控轮就把节奏送掉；
 * 这条规则让它在前几轮先评估自己是不是已经有足够主控资源，若有则先打控制线。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应延后探朋友门。
 *
 * 注意：
 * - 只在无主、朋友未亮、打家首发的前中盘启用。
 * - 若朋友牌已经接近“叫死”，仍允许保留原本的探朋友逻辑，不强行拦截。
 */
function shouldAiDeferNoTrumpFriendProbe(playerId, player) {
  if (!player || playerId !== state.bankerId || state.trumpSuit !== "notrump") return false;
  if (!state.friendTarget || isFriendTeamResolved() || state.currentTrick.length !== 0) return false;
  if ((state.trickNumber || 1) > 4) return false;

  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  const remainingBeforeReveal = neededOccurrence - currentSeen;
  if (remainingBeforeReveal <= 1) return false;

  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const controlTrumpCount = trumpCards.filter((card) => card.suit === "joker" || ["A", "K"].includes(card.rank)).length;
  const trumpStructures = getStructureCombosFromHand(trumpCards)
    .filter((combo) => ["pair", "tractor", "train", "bulldozer"].includes(classifyPlay(combo).type));
  return controlTrumpCount >= 2 || trumpStructures.length > 0 || trumpCards.length >= 6;
}

/**
 * 作用：
 * 判断打家在朋友长期未亮时，是否应切到“solo banker survival”保守模式。
 *
 * 为什么这样写：
 * 样本里有不少局面是朋友到第 5-6 轮后仍未亮，打家却还在按双人协同脚本找朋友，
 * 结果实际体感更像 1 打 4。这里让打家在拖太久时先保住控轮和保底。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应按晚亮友 fallback 打。
 *
 * 注意：
 * - 当前只让打家自己切 fallback，不假设未亮友方也会同步理解这个模式。
 * - 一旦朋友已经亮相或失败，这条 fallback 立即失效。
 */
function shouldAiUseBankerSoloFallback(playerId) {
  if (playerId !== state.bankerId || !state.friendTarget || isFriendTeamResolved()) return false;
  return (state.trickNumber || 1) >= 6;
}

/**
 * 作用：
 * 为“朋友刚亮后”的打家方提供更明确的控局首发。
 *
 * 为什么这样写：
 * 这条 heuristic 对应“亮友后 2-3 轮优先清主、续控、保分”。
 * 如果这段窗口内还继续弱门试探，打家经常会把已经到手的双人节奏重新送回给闲家。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中控局模式则返回建议首发，否则返回空数组。
 *
 * 注意：
 * - 先尝试可消耗主；若主控资源不够明确，再考虑“高张定门再递牌”的协同窗口。
 * - 这里只负责“亮友后立刻切档”，不取代常规末局保底逻辑。
 */
function chooseAiBankerRevealedFriendControlLead(playerId, player) {
  if (!player || state.currentTrick.length !== 0 || !shouldAiUseBankerRevealedFriendControlMode(playerId)) {
    return [];
  }

  const levelRank = getCurrentLevelRank();
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const expendableTrumpCards = trumpCards.filter((card) => card.suit !== "joker" && card.rank !== levelRank);
  if (expendableTrumpCards.length > 0) {
    return chooseStrongLeadFromCards(expendableTrumpCards);
  }
  if (trumpCards.length > 0) {
    return chooseStrongLeadFromCards(trumpCards);
  }

  const highControlSignalLead = chooseAiHighControlSignalLead(playerId, player);
  if (highControlSignalLead.length > 0) return highControlSignalLead;

  const handoffLead = chooseAiHandoffLead(playerId, player);
  if (handoffLead.length > 0) return handoffLead;

  const pressureLead = chooseAiVoidPressureLead(playerId, player);
  if (pressureLead.length > 0) return pressureLead;

  const safeZeroPointSideCards = player.hand.filter((card) => !isTrump(card) && scoreValue(card) === 0);
  if (safeZeroPointSideCards.length > 0) {
    return chooseStrongLeadFromCards(safeZeroPointSideCards);
  }

  const safeSideCards = player.hand.filter((card) => !isTrump(card));
  if (safeSideCards.length > 0) {
    return [lowestCard(safeSideCards)];
  }

  return [];
}

/**
 * 作用：
 * 为“朋友迟迟未亮”的打家提供更保守的 fallback 首发。
 *
 * 为什么这样写：
 * 当牌局已经来到第 5-6 轮，朋友仍未亮时，打家继续机械找朋友往往是在透支自己的保底质量。
 * 这里让它先转成“我先自己活下去”的模式，减少再去摸目标门和再去送分。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中晚亮友 fallback 则返回建议首发，否则返回空数组。
 *
 * 注意：
 * - 优先走主和零分安全牌，尽量不先手找朋友门。
 * - 若没有更安全的选择，才回退到普通低成本单张。
 */
function chooseAiBankerSoloFallbackLead(playerId, player) {
  if (!player || state.currentTrick.length !== 0 || !shouldAiUseBankerSoloFallback(playerId)) return [];

  const levelRank = getCurrentLevelRank();
  const targetSuit = state.friendTarget?.suit;
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const expendableTrumpCards = trumpCards.filter((card) =>
    card.suit !== "joker" && card.rank !== levelRank && scoreValue(card) === 0
  );
  if (expendableTrumpCards.length > 0) {
    return chooseStrongLeadFromCards(expendableTrumpCards);
  }
  if (trumpCards.length > 0) {
    const nonCriticalTrumpCards = trumpCards.filter((card) => card.suit !== "joker");
    if (nonCriticalTrumpCards.length > 0) {
      return chooseStrongLeadFromCards(nonCriticalTrumpCards);
    }
  }

  const safeSideCards = player.hand.filter((card) =>
    !isTrump(card) && scoreValue(card) === 0 && (!targetSuit || card.suit !== targetSuit)
  );
  if (safeSideCards.length > 0) {
    return [lowestCard(safeSideCards)];
  }

  const nonTargetSideCards = player.hand.filter((card) => !isTrump(card) && (!targetSuit || card.suit !== targetSuit));
  if (nonTargetSideCards.length > 0) {
    return [lowestCard(nonTargetSideCards)];
  }

  return [];
}

/**
 * 作用：
 * 为初级非打家生成一份“我有没有级牌扣底潜力”的轻量画像。
 *
 * 为什么这样写：
 * 这一轮要把“开局先判断自己是否值得走级牌扣底路线”落成可执行 heuristic，
 * 但初级 AI 不能引入复杂搜索；因此这里只基于自手的级牌、主长度和大主控制力做粗粒度分层。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {{
 *   eligible: boolean,
 *   potential: "none" | "possible" | "strong",
 *   gradeCardCount: number,
 *   gradeStructureCount: number,
 *   trumpCount: number,
 *   highControlTrumpCount: number,
 *   specialPriority: boolean
 * }} 当前玩家是否适合把级牌扣底当作轻量副目标。
 *
 * 注意：
 * - 当前只对 `beginner / intermediate` 启用，避免把这套轻量画像直接扩散到高级的完整记牌逻辑里。
 * - 这里只判断“有无路线”，不代表 AI 已经保证能把这条路线完整执行到底。
 */
function getAiGradeBottomProfile(playerId) {
  const player = getPlayer(playerId);
  const difficulty = getAiDifficulty();
  if (!player || playerId === state.bankerId || !["beginner", "intermediate"].includes(difficulty)) {
    return {
      eligible: false,
      potential: "none",
      gradeCardCount: 0,
      gradeStructureCount: 0,
      trumpCount: 0,
      highControlTrumpCount: 0,
      specialPriority: false,
    };
  }

  const levelRank = getCurrentLevelRank();
  const specialPriority = isGradeBottomPriorityLevel(levelRank);
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  const gradeCards = player.hand.filter((card) => !!getBottomPenaltyModeForCard(card));
  const gradeStructures = getStructureCombosFromHand(player.hand).filter((combo) =>
    combo.some((card) => !!getBottomPenaltyModeForCard(card))
  );
  const highControlTrumpCards = trumpCards.filter((card) => {
    if (card.suit === "joker") return true;
    if (card.rank === levelRank) return false;
    return ["A", "K"].includes(card.rank);
  });

  let potential = "none";
  const canStrongGradeBottom = gradeCards.length >= 2 && trumpCards.length >= 6 && highControlTrumpCards.length >= 2;
  const canStrongSpecialGradeBottom = specialPriority
    && gradeCards.length >= 1
    && gradeStructures.length > 0
    && trumpCards.length >= 6
    && highControlTrumpCards.length >= 2;
  const canPossibleGradeBottom = (gradeCards.length >= 1 || gradeStructures.length > 0)
    && trumpCards.length >= 5
    && highControlTrumpCards.length >= 1;
  const canPossibleSpecialGradeBottom = specialPriority
    && (gradeCards.length >= 1 || gradeStructures.length > 0)
    && trumpCards.length >= 4
    && highControlTrumpCards.length >= 1;

  if (canStrongGradeBottom || (difficulty === "intermediate" && canStrongSpecialGradeBottom)) {
    potential = "strong";
  } else if (canPossibleGradeBottom || (difficulty === "intermediate" && canPossibleSpecialGradeBottom)) {
    potential = "possible";
  }

  return {
    eligible: true,
    potential,
    gradeCardCount: gradeCards.length,
    gradeStructureCount: gradeStructures.length,
    trumpCount: trumpCards.length,
    highControlTrumpCount: highControlTrumpCards.length,
    specialPriority,
  };
}

/**
 * 作用：
 * 判断初级 AI 当前是否值得把“级牌扣底”当成局内轻量目标。
 *
 * 为什么这样写：
 * 用户希望“没被叫到朋友时可以更主动争取级牌扣底”，
 * 同时“被叫到朋友但不是叫死时，也可以短暂犹豫是否立刻站队”；
 * 因此这里把“适合走这条路线”的局面统一折成一个布尔判断，供首发和跟牌共用。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前局面值得保留级牌扣底路线。
 *
 * 注意：
 * - 未站队时只对“暂定闲家”开放积极追求，避免持有朋友牌的人一开局就过度自信。
 * - 如果已经被叫到朋友但并不是叫死，允许在前中盘短暂保留这条路线，避免过早站队把末手空间彻底打碎。
 * - 已站队后只有确定闲家一侧才继续保留该目标。
 */
function shouldAiPursueGradeBottom(playerId) {
  const profile = getAiGradeBottomProfile(playerId);
  if (profile.potential === "none") return false;
  if (isFriendTeamResolved()) return isDefenderTeam(playerId);
  if (isAiTentativeDefender(playerId)) return true;
  if (!canAiRevealFriendNow(playerId) || isAiCertainFriend(playerId)) return false;
  if ((state.trickNumber || 1) > 6) return false;
  return profile.potential === "strong" || profile.specialPriority;
}

/**
 * 作用：
 * 判断初级 AI 是否应因“保留级牌扣底路线”而暂缓立即站队。
 *
 * 为什么这样写：
 * 这条规则不是要让朋友永远不站，而是在“不是叫死、且自己确实有级牌扣底潜力”时，
 * 降低立刻翻牌明身份的意愿，给后续末手路线多留一点空间。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应短暂延迟站队。
 *
 * 注意：
 * - 只在前中盘启用，避免残局还为了藏身份错过明显该站的时机。
 * - 如果这一墩已经挂了较多公开分数，则不为了藏身份硬吃亏。
 */
function shouldAiDelayRevealForGradeBottom(playerId) {
  const profile = getAiGradeBottomProfile(playerId);
  if (profile.potential === "none") return false;
  if (!canAiRevealFriendNow(playerId) || isAiCertainFriend(playerId)) return false;
  if ((state.trickNumber || 1) > (profile.specialPriority ? 7 : 6)) return false;
  if (getCurrentTrickPointValue() >= (profile.specialPriority ? 25 : 20)) return false;
  return true;
}

/**
 * 作用：
 * 为初级闲家选择一手“更愿意先吊主、但尽量不拆大王和级牌”的首发。
 *
 * 为什么这样写：
 * 当玩家自己判断“我可能有级牌扣底路线”时，开局到中盘更应该多给打家抽主压力，
 * 但又不能把末手要保留的大小王和级牌先手打空，所以这里只优先使用可消耗的普通主牌去吊主。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中该启发式则返回建议的主牌首发，否则返回空数组。
 *
 * 注意：
 * - 只在前中盘启用，避免末局为了机械吊主反而错过更关键的控轮次。
 * - 若手里只剩王或级牌主，则宁可不触发，也不强迫拆掉关键末手资源。
 */
function chooseAiGradeBottomTrumpLead(playerId, player) {
  if (!player || state.currentTrick.length !== 0 || !shouldAiPursueGradeBottom(playerId)) return [];
  const profile = getAiGradeBottomProfile(playerId);
  if ((state.trickNumber || 1) > (profile.specialPriority ? 10 : 8)) return [];
  if (profile.trumpCount < (profile.specialPriority ? 4 : 5)) return [];

  const levelRank = getCurrentLevelRank();
  const expendableTrumpCards = player.hand.filter((card) =>
    effectiveSuit(card) === "trump" && card.suit !== "joker" && card.rank !== levelRank
  );
  if (expendableTrumpCards.length === 0) return [];

  const preservedControlTrumpCards = expendableTrumpCards.filter((card) => !["A", "K"].includes(card.rank));
  return chooseStrongLeadFromCards(
    preservedControlTrumpCards.length > 0 ? preservedControlTrumpCards : expendableTrumpCards
  );
}

/**
 * 作用：
 * 评估一组跟牌在“保留级牌扣底资源”视角下的代价。
 *
 * 为什么这样写：
 * 现有“抢扣底准备”逻辑会倾向提前甩王，让同侧更容易扣底；
 * 但当玩家自己在走级牌扣底路线时，恰好需要相反的偏好，即尽量保住王、级牌和高主控制牌。
 *
 * 输入：
 * @param {Array<object>} combo - 候选跟牌组合。
 *
 * 输出：
 * @returns {number} 数值越低，表示越适合作为“保留级牌扣底资源”的垫牌。
 *
 * 注意：
 * - 这里只处理“我要尽量留资源”的排序，不直接判断这一手是否合法。
 * - 高分副牌同样会加代价，避免为了保结构去无脑丢大分。
 */
function scoreGradeBottomPreserveCombo(combo) {
  const levelRank = getCurrentLevelRank();
  return combo.reduce((sum, card) => {
    let cost = scoreValue(card) * 4;
    if (card.suit === "joker") cost += 140;
    else if (card.rank === levelRank) cost += 110;
    else if (isTrump(card) && ["A", "K"].includes(card.rank)) cost += 70;
    else if (isTrump(card)) cost += 25;
    cost += Math.max(0, cardStrength(card) - 10);
    return sum + cost;
  }, 0);
}

/**
 * 作用：
 * 在“我要保级牌扣底资源”时，为初级 AI 选择更克制的非压制跟牌。
 *
 * 为什么这样写：
 * 这条 heuristic 主要覆盖两种情况：
 * 一是确定在闲家侧、当前同侧已稳住时，尽量别把自己的王和级牌先垫掉；
 * 二是被叫到朋友但决定暂缓站队时，优先用非朋友牌的小牌跟过去。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<Array<object>>} candidates - 当前所有合法候选。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次的领先出牌。
 *
 * 输出：
 * @returns {Array<object>} 若命中该启发式则返回建议跟牌，否则返回空数组。
 *
 * 注意：
 * - 若当前并不是同侧领先，只有在“为了延迟站队”时才允许走这条保守分支。
 * - 这里只挑非压制候选；如果规则已经逼到必须压过，则由上层继续回退。
 */
function chooseAiGradeBottomPreserveDiscard(playerId, candidates, currentWinningPlay) {
  const preserveForBottom = shouldAiPursueGradeBottom(playerId);
  const preserveForDelayedReveal = shouldAiDelayRevealForGradeBottom(playerId);
  if (!currentWinningPlay || (!preserveForBottom && !preserveForDelayedReveal)) return [];
  if (!preserveForDelayedReveal && !areAiSameSide(playerId, currentWinningPlay.playerId)) return [];

  const nonBeating = candidates.filter((combo) => !doesSelectionBeatCurrent(playerId, combo));
  if (nonBeating.length === 0) return [];

  return nonBeating.sort((a, b) => {
    const scoreDiff = scoreGradeBottomPreserveCombo(a) - scoreGradeBottomPreserveCombo(b);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

// 返回当前出牌顺序中庄家之后的玩家列表。
function getPlayersAfterBankerInLeadOrder(leaderId) {
  if (!PLAYER_ORDER.includes(leaderId) || leaderId === state.bankerId) return [];
  const order = [];
  let currentId = getNextPlayerId(leaderId);
  while (currentId !== leaderId && order.length < PLAYER_ORDER.length) {
    order.push(currentId);
    currentId = getNextPlayerId(currentId);
  }
  const bankerIndex = order.indexOf(state.bankerId);
  return bankerIndex >= 0 ? order.slice(bankerIndex + 1) : [];
}

// 判断某花色是否会给庄家留下危险将吃机会。
function isAiDangerousBankerRuffSuit(playerId, suit) {
  if (!suit || suit === "trump" || playerId === state.bankerId) return false;
  if (areAiSameSide(playerId, state.bankerId)) return false;
  if (!state.exposedSuitVoid[state.bankerId]?.[suit]) return false;
  const trailingPlayers = getPlayersAfterBankerInLeadOrder(playerId);
  const hasCoverAlly = trailingPlayers.some((otherId) =>
    areAiSameSide(playerId, otherId) && state.exposedSuitVoid[otherId]?.[suit]
  );
  return !hasCoverAlly;
}

// 选择一手尽量避免给庄家将吃机会的安全首发。
function chooseAiSafeAntiRuffLead(playerId, player) {
  if (!player || playerId === state.bankerId) return [];
  const dangerousSuits = SUITS.filter((suit) => isAiDangerousBankerRuffSuit(playerId, suit));
  if (dangerousSuits.length === 0) return [];

  const options = [];
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  if (trumpCards.length > 0) {
    options.push(chooseStrongLeadFromCards(trumpCards));
  }

  for (const suit of SUITS) {
    if (dangerousSuits.includes(suit)) continue;
    const suitCards = player.hand.filter((card) => effectiveSuit(card) === suit);
    if (suitCards.length === 0) continue;
    options.push(chooseStrongLeadFromCards(suitCards));
  }

  const validOptions = options.filter((combo) => combo.length > 0);
  if (validOptions.length === 0) return [];
  return validOptions.sort((a, b) => classifyPlay(b).power - classifyPlay(a).power)[0];
}

/**
 * 作用：
 * 返回当前玩家在公开信息下可以明确“递牌”给到的同伴目标列表。
 *
 * 为什么这样写：
 * “递牌”不是单纯看谁和我是同侧，还要结合未站队阶段的已知信息。
 * 对朋友未明阶段，只有“我自己已经确定/即将成友”时，才适合把牌递回给打家；
 * 对阵营已明阶段，则优先返回已经确认同侧、且最值得优先接手的目标。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 *
 * 输出：
 * @returns {Array<number>} 返回按优先级排序的递牌目标玩家 ID 列表。
 *
 * 注意：
 * - 未站队阶段不会把“猜测中的朋友”当成确定接手点，避免初级 AI 误递给错误目标。
 * - 阵营已明且打家与自己同侧时，默认优先递回打家，兼容“朋友回打家绝门”的常见套路。
 */
function getAiKnownHandoffTargetIds(playerId) {
  if (playerId === state.bankerId) {
    if (!isFriendTeamResolved()) return [];
  } else if (!state.friendTarget || !isFriendTeamResolved()) {
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

/**
 * 作用：
 * 判断当前玩家是否仍握有足够明确的控牌资源，不必优先考虑“递牌”。
 *
 * 为什么这样写：
 * 用户新增的“递牌”前提是“手里没有可以确切保证出牌权的牌”。
 * 初级 AI 不能做复杂搜索，因此这里只用一组保守的公开可解释条件，
 * 粗略识别“我现在更像该自己控牌，而不是把牌递出去”的局面。
 *
 * 输入：
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前更适合自己控牌，不应优先触发递牌。
 *
 * 注意：
 * - 这里只做保守门槛，不代表这些资源一定 100% 保证拿回牌权。
 * - 目的是避免初级 AI 一有同伴绝门信息就机械递牌，反而放掉明显的主控手。
 */
function hasAiDirectControlLead(player) {
  if (!player || !Array.isArray(player.hand)) return false;
  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  if (trumpCards.some((card) => card.suit === "joker")) return true;
  if (trumpCards.length >= 5) return true;
  if (findPairs(trumpCards).length > 0) return true;
  if (findSerialTuples(trumpCards, 2).some((combo) => ["tractor", "train"].includes(classifyPlay(combo).type))) {
    return true;
  }
  return findSerialTuples(trumpCards, 3).length > 0;
}

/**
 * 作用：
 * 判断当前玩家是否处于“先用高张定门，再留小牌递给同伴”的协同窗口。
 *
 * 为什么这样写：
 * 用户补充的打法不只适用于闲家侧。
 * 朋友已站队后，如果我方当前没有更稳的主控线路，而某门又还没有出现任何公开绝门，
 * 那么先把这门 `A` 打出来，可以同时做到“稳拿当前一手”和“向同伴传递这门高张正在被我方兑现”的信号，
 * 后面再用同门小牌递回去，就比一上来直接递小牌更像人类协同。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前允许启用“高张定门”窗口。
 *
 * 注意：
 * - 只依赖公开站队和公开断门信息，不读取任何暗手。
 * - 打家侧会更保守：若自己已经握有明显主控资源，仍应优先清主，不在这里抢跑。
 */
function shouldAiUseHighControlSignalWindow(playerId, player) {
  if (!player || state.currentTrick.length !== 0 || !isFriendTeamResolved()) return false;
  const targetIds = getAiKnownHandoffTargetIds(playerId);
  if (targetIds.length === 0) return false;
  if (isDefenderTeam(playerId)) return true;
  if (!areSameSide(playerId, state.bankerId)) return false;
  return !hasAiDirectControlLead(player);
}

/**
 * 作用：
 * 为初级 AI 选择一手“先出高张保控制，再为后续递牌留门”的首发。
 *
 * 为什么这样写：
 * 用户补充了一个比“公开绝门递牌”更靠前的 beginner heuristic：
 * 当朋友已站队、自己手里有这门 `A`，且公开信息还没有显示敌我任何人绝这门时，
 * 不应立刻把小牌递出去，而应先把 `A` 或以 `A` 为顶张的大结构牌打出来，先稳定拿一手控制权，
 * 同时给同伴传递“这门高张正在被我方兑现，后续你的 `A / K` 可能已经升成大牌”的直白信号。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 命中“高张开路”窗口时返回建议首发，否则返回空数组。
 *
 * 注意：
 * - 闲家侧默认更积极；打家侧只有在没有明显主控资源时才会走这条协同线。
 * - 仍然只使用公开绝门信息；若敌方任何一人已经公开绝这门，就回退给其它 heuristic 处理。
 */
function chooseAiHighControlSignalLead(playerId, player) {
  if (!shouldAiUseHighControlSignalWindow(playerId, player)) return [];

  const targetIds = getAiKnownHandoffTargetIds(playerId);
  const enemyIds = state.players
    .map((seat) => seat.id)
    .filter((otherId) => otherId !== playerId && !targetIds.includes(otherId));

  const options = SUITS
    .map((suit) => {
      const suitCards = player.hand.filter((card) => effectiveSuit(card) === suit);
      if (suitCards.length < 2) return null;
      if (targetIds.some((targetId) => state.exposedSuitVoid[targetId]?.[suit])) return null;
      if (enemyIds.some((enemyId) => state.exposedSuitVoid[enemyId]?.[suit])) return null;

      const topSuitCard = highestCard(suitCards);
      if (!topSuitCard || topSuitCard.rank !== "A") return null;

      const combo = chooseStrongLeadFromCards(suitCards);
      if (combo.length === 0) return null;

      const comboTopCard = highestCard(combo);
      if (!comboTopCard || comboTopCard.rank !== "A") return null;

      const comboIds = new Set(combo.map((card) => card.id));
      const remainingCards = suitCards.filter((card) => !comboIds.has(card.id));
      if (remainingCards.length === 0) return null;

      const lowestRemainingCard = lowestCard(remainingCards);
      let score = 72;
      score += combo.length * 18;
      score += classifyPlay(combo).power;
      if (scoreValue(lowestRemainingCard) === 0) score += 14;
      if (targetIds.length > 1) score += 6;
      score -= cardStrength(lowestRemainingCard);
      return {
        combo,
        score,
      };
    })
    .filter(Boolean);

  if (options.length === 0) return [];
  return options.sort((left, right) => right.score - left.score)[0].combo;
}

/**
 * 作用：
 * 为初级 AI 选择一手基于公开绝门信息的“递牌”首发。
 *
 * 为什么这样写：
 * 这条 heuristic 用来表达“当我自己没有把握稳控时，把牌权递给同伴”。
 * 它和 `Pressure Void` 相反：不是去打敌人的绝门，而是主动打同伴的绝门，
 * 让同伴用毙牌或高张接手；同时只在敌方公开上尚未显示也绝门时启用，避免把接手权白送给对手。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中安全递牌条件则返回建议首发，否则返回空数组。
 *
 * 注意：
 * - 初级只使用公开断门信息，不根据完整已出牌做高张分布推断。
 * - 默认只递零分或低成本的小牌；孤张分牌不会为了递牌直接裸送。
 */
function chooseAiHandoffLead(playerId, player) {
  if (!player || state.currentTrick.length !== 0) return [];
  if (hasAiDirectControlLead(player)) return [];

  const targetIds = getAiKnownHandoffTargetIds(playerId);
  if (targetIds.length === 0) return [];
  const enemyIds = state.players
    .map((seat) => seat.id)
    .filter((otherId) => otherId !== playerId && !targetIds.includes(otherId));

  const options = SUITS
    .map((suit) => {
      const suitCards = player.hand.filter((card) => effectiveSuit(card) === suit);
      if (suitCards.length === 0) return null;
      const handoffCount = targetIds.filter((targetId) => state.exposedSuitVoid[targetId]?.[suit]).length;
      if (handoffCount === 0) return null;

      const enemyVoidCount = enemyIds.filter((enemyId) => state.exposedSuitVoid[enemyId]?.[suit]).length;
      if (enemyVoidCount > 0) return null;

      const lowestSuitCard = lowestCard(suitCards);
      if (scoreValue(lowestSuitCard) > 0 && suitCards.length === 1) return null;

      let score = handoffCount * 34;
      if (targetIds[0] === state.bankerId) score += 10;
      if (scoreValue(lowestSuitCard) === 0) score += 12;
      if (suitCards.length === 1) score += 8;
      score -= getPatternUnitPower(lowestSuitCard, suit) * 2;
      return {
        combo: [lowestSuitCard],
        score,
      };
    })
    .filter(Boolean);

  if (options.length === 0) return [];
  return options.sort((left, right) => right.score - left.score)[0].combo;
}

// 返回 AI 断门施压时优先针对的目标玩家 ID 列表。
function getAiPressureTargetIds(playerId) {
  if (!isDefenderTeam(playerId)) return [];
  if (!isFriendTeamResolved()) {
    return state.bankerId === playerId ? [] : [state.bankerId];
  }
  return state.players
    .map((player) => player.id)
    .filter((otherId) => otherId !== playerId && !areSameSide(playerId, otherId));
}

// 选择一手针对断门信息施压的首发。
function chooseAiVoidPressureLead(playerId, player) {
  const targetIds = getAiPressureTargetIds(playerId);
  if (targetIds.length === 0) return [];

  const options = SUITS
    .map((suit) => {
      const cards = player.hand.filter((card) => effectiveSuit(card) === suit);
      if (cards.length === 0) return null;
      const voidCount = targetIds.filter((targetId) => state.exposedSuitVoid[targetId]?.[suit]).length;
      if (voidCount === 0) return null;
      return {
        suit,
        voidCount,
        combo: chooseStrongLeadFromCards(cards),
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.combo.length > 0);

  if (options.length === 0) return [];

  return options.sort((a, b) => {
    if (a.voidCount !== b.voidCount) return b.voidCount - a.voidCount;
    return classifyPlay(b.combo).power - classifyPlay(a.combo).power;
  })[0].combo;
}

/**
 * 作用：
 * 在“闲家已经不可能靠常规分数到 120”时，为打家方选择更保守的首发。
 *
 * 为什么这样写：
 * 一旦公开分数已经表明闲家后面分全拿也不够 120，打家方就不该再主动用高分牌或大主去冒险抢节奏，
 * 这时更合理的做法是优先出低风险、低分值的牌，把局面推进到保底与防扣底。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中“分数锁定”条件则返回一手保守首发，否则返回空数组。
 *
 * 注意：
 * - 这里只在阵营已明后启用，避免未站队阶段误判分数归属。
 * - 该启发式只负责“降低主动送分风险”，不替代末局保底和扣底逻辑。
 */
function chooseAiLockedPointSafetyLead(playerId, player) {
  if (!player || state.currentTrick.length !== 0) return [];
  const scoreMemory = getVisibleScoreMemoryForPlayer(playerId);
  if (scoreMemory.playerSide !== "banker" || !scoreMemory.bankerSideLockedByPoints) return [];

  const zeroPointSideSingles = player.hand.filter((card) => !isTrump(card) && scoreValue(card) === 0);
  if (zeroPointSideSingles.length > 0) {
    return [lowestCard(zeroPointSideSingles)];
  }

  const lowSideSingles = player.hand.filter((card) => !isTrump(card));
  if (lowSideSingles.length > 0) {
    return [lowestCard(lowSideSingles)];
  }

  const zeroPointCards = player.hand.filter((card) => scoreValue(card) === 0);
  if (zeroPointCards.length > 0) {
    return [lowestCard(zeroPointCards)];
  }

  return [];
}

// 判断 AI 当前是否应该争取扣底。
function shouldAiAimForBottom(playerId) {
  if (!isDefenderTeam(playerId)) return false;
  const scoreMemory = getVisibleScoreMemoryForPlayer(playerId);
  if (scoreMemory.playerSide === "defender" && scoreMemory.defenderCanStillReach120 === false) {
    return true;
  }
  const cardsLeft = state.players.reduce((sum, player) => sum + player.hand.length, 0);
  const visiblePoints = state.defenderPoints + getCurrentTrickPointValue();
  if (visiblePoints < 60 && cardsLeft <= 25) return true;
  if (visiblePoints < 90 && cardsLeft <= 15) return true;
  return visiblePoints < 110 && cardsLeft <= 10;
}

// 为扣底准备阶段的垫牌组合计算分数。
function scoreBottomPrepCombo(combo) {
  const levelRank = getCurrentLevelRank();
  return combo.reduce((sum, card) => {
    if (card.suit === "joker") return sum + 40;
    if (isTrump(card) && card.rank !== levelRank) return sum + 16;
    if (card.rank === levelRank) return sum - 18;
    return sum - scoreValue(card);
  }, 0);
}

// 选择为扣底做准备时最合适的垫牌方案。
function chooseAiBottomPrepDiscard(playerId, candidates, currentWinningPlay) {
  if (!currentWinningPlay || !shouldAiAimForBottom(playerId) || !areSameSide(playerId, currentWinningPlay.playerId)) {
    return [];
  }
  const nonBeating = candidates.filter((combo) => !doesSelectionBeatCurrent(playerId, combo));
  if (nonBeating.length === 0) return [];
  return nonBeating.sort((a, b) => {
    const scoreDiff = scoreBottomPrepCombo(b) - scoreBottomPrepCombo(a);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

// 为无主庄家选择保留朋友牌后的强势首发。
function chooseAiNoTrumpBankerPowerLead(playerId, player) {
  if (state.trumpSuit !== "notrump" || playerId !== state.bankerId || !state.friendTarget || isFriendTeamResolved()) {
    return [];
  }
  const targetCards = player.hand.filter(
    (card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  const reservedIds = new Set(targetCards.map((card) => card.id));
  const available = player.hand.filter((card) => !reservedIds.has(card.id));
  if (available.length === 0) return [];

  const trumpCards = available.filter((card) => isTrump(card));
  if (trumpCards.length > 0) {
    return chooseStrongLeadFromCards(trumpCards);
  }

  const highSideCards = available.filter((card) => !isTrump(card) && (card.rank === "A" || card.rank === "K"));
  if (highSideCards.length > 0) {
    return chooseStrongLeadFromCards(highSideCards);
  }

  return [];
}

/**
 * 作用：
 * 为打家提取“找朋友这门单张回手”的默认首发牌。
 *
 * 为什么这样写：
 * 这轮初级短门策略改成“默认把找朋友这门做成单张回手口”。
 * 当打家在这门只剩 1 张非目标牌时，先把它打出去，通常比先兑现自己手里的 `A`
 * 更容易尽快把该门走空，后续靠毙牌把牌权重新拿回来。
 *
 * 输入：
 * @param {object|null} player - 当前打家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中“单张回手”条件则返回该单张，否则返回空数组。
 *
 * 注意：
 * - 这里只处理副牌 `A` 线，不覆盖王找朋友或其它高张找朋友。
 * - 只有当同门非目标牌恰好剩 `1` 张时才触发，避免把整门牌都无脑先手甩空。
 */
function chooseAiBankerFriendReturnLead(player) {
  if (!player || !state.friendTarget || state.friendTarget.suit === "joker" || state.friendTarget.rank !== "A") {
    return [];
  }
  const friendSuitCards = player.hand
    .filter((card) => card.suit === state.friendTarget.suit && !isTrump(card))
    .sort((left, right) => cardStrength(left) - cardStrength(right));
  const nonTargetCards = friendSuitCards.filter((card) => card.rank !== state.friendTarget.rank);
  return nonTargetCards.length === 1 ? [nonTargetCards[0]] : [];
}

/**
 * 作用：
 * 为打家提供“短门单张回手优先，其次才兑现前置副本”的早期首发启发。
 *
 * 为什么这样写：
 * 当打家叫的是第二张或第三张 `A` 时，短门的关键不是“手里还剩多少高张”，
 * 而是能不能尽快把这一门做成可回手、可毙牌的空门。
 * 因此这里先尝试把唯一的同门单牌回手走掉；如果没有这种单张回手口，
 * 再回退到旧规则，优先兑现自己手里的前置 `A`。
 *
 * 输入：
 * @param {number} playerId - 当前准备首发的玩家 ID。
 * @param {object|null} player - 当前玩家对象。
 *
 * 输出：
 * @returns {Array<object>} 若命中该启发式则返回建议首发，否则返回空数组。
 *
 * 注意：
 * - 当前先只对 `A` 生效，避免把 `K/Q` 之类不够稳的高张也一律套进来。
 * - 只在出牌早期、且当前确实是打家首发时触发，避免中后盘无脑清空目标门。
 */
function chooseAiBankerFriendSetupLead(playerId, player) {
  if (!player || playerId !== state.bankerId || !state.friendTarget || isFriendTeamResolved()) return [];
  if (state.currentTrick.length !== 0 || state.currentTurnId !== playerId) return [];
  if (state.friendTarget.suit === "joker" || state.friendTarget.rank !== "A") return [];
  if ((state.trickNumber || 1) > 4) return [];
  if (shouldAiDeferNoTrumpFriendProbe(playerId, player)) return [];
  if (shouldAiUseBankerSoloFallback(playerId)) return [];

  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (neededOccurrence <= 1 || currentSeen >= neededOccurrence - 1) return [];

  const returnLead = chooseAiBankerFriendReturnLead(player);
  if (returnLead.length > 0) return returnLead;

  const targetCopies = player.hand.filter(
    (card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank
  );
  if (targetCopies.length <= 0) return [];

  return [targetCopies.sort((left, right) => cardStrength(left) - cardStrength(right))[0]];
}

/**
 * 作用：
 * 把“直接匹配首家牌型”的结构候选优先加入合法跟牌列表。
 *
 * 为什么这样写：
 * 跟主拖拉机、跟火车这类场景，本来就应该先尝试完整匹配牌型；
 * 如果一上来就暴力枚举 `n 选 k`，在主牌很多时容易被组合上限截断，合法结构反而排不到前面。
 *
 * 输入：
 * @param {Array<Array<object>>} results - 当前已收集到的合法候选列表。
 * @param {Set<string>} seen - 已去重的候选 key 集合。
 * @param {number} playerId - 当前出牌玩家 ID。
 * @param {Array<object>} suitedCards - 当前与首家同门的牌池。
 * @param {number} limit - 允许保留的最大合法候选数。
 *
 * 输出：
 * @returns {boolean} 若已达到 `limit` 并可提前结束，则返回 `true`。
 *
 * 注意：
 * - 这里只负责“优先塞入结构候选”，不替代后续组合枚举。
 * - 仍会用 `validateSelection` 复验，避免 helper 与规则层口径漂移。
 */
function seedDirectPatternSelections(results, seen, playerId, suitedCards, limit) {
  if (!state.leadSpec || !Array.isArray(suitedCards) || suitedCards.length < state.leadSpec.count) return false;

  const directPatternCombos = getPatternCombos(suitedCards, state.leadSpec);
  for (const combo of directPatternCombos) {
    if (!validateSelection(playerId, combo).ok) continue;
    const key = combo.map((card) => card.id).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(combo);
    if (results.length >= limit) return true;
  }
  return false;
}

// 枚举玩家当前所有合法跟牌选择。
function getLegalSelectionsForPlayer(playerId, limit = 72) {
  const player = getPlayer(playerId);
  if (!player || state.currentTrick.length === 0) return [];
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const targetCount = state.leadSpec.count;
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  const pools = [];
  if (suited.length >= targetCount) {
    pools.push(suited);
  } else if (suited.length > 0) {
    pools.push([...suited, ...hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id))]);
  }
  pools.push(hand);

  const seen = new Set();
  const results = [];
  if (seedDirectPatternSelections(results, seen, playerId, suited, limit)) {
    return results;
  }
  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    const combinationLimit = getCombinationEnumerationLimit(pool.length, targetCount, limit * 16);
    for (const combo of enumerateCombinations(pool, targetCount, combinationLimit)) {
      if (!validateSelection(playerId, combo).ok) continue;
      const key = combo.map((card) => card.id).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(combo);
      if (results.length >= limit) return results;
    }
  }
  return results;
}

// 返回当前 AI 难度档位。
function getAiDifficulty() {
  return AI_DIFFICULTY_OPTIONS.some((option) => option.value === state.aiDifficulty)
    ? state.aiDifficulty
    : DEFAULT_AI_DIFFICULTY;
}

function isAdvancedAiDifficulty() {
  return getAiDifficulty() === "advanced";
}

function getAiPlayedHistoryCards() {
  return Array.isArray(state.playHistory) ? state.playHistory : [];
}

let cachedTotalDeckPointValue = null;

/**
 * 作用：
 * 返回当前三副牌整局理论上的总分数。
 *
 * 为什么这样写：
 * 这轮要让初级 AI 基于“公开已跑分 + 剩余可争分”判断后面是否还够赢，
 * 因此需要一份稳定的全局总分基线，而不是每个 heuristic 各自硬编码。
 *
 * 输入：
 * @param {void} - 无额外输入，直接基于当前规则牌堆计算。
 *
 * 输出：
 * @returns {number} 当前牌堆总分，默认三副牌应为 300 分。
 *
 * 注意：
 * - 这里缓存结果，避免每次决策都重复创建整副牌。
 * - 如果以后牌堆规格改动，这里会跟着 `createDeck()` 自动同步。
 */
function getTotalDeckPointValue() {
  if (typeof cachedTotalDeckPointValue === "number") {
    return cachedTotalDeckPointValue;
  }
  cachedTotalDeckPointValue = createDeck().reduce((sum, card) => sum + scoreValue(card), 0);
  return cachedTotalDeckPointValue;
}

/**
 * 作用：
 * 汇总当前局面对 AI 公开可见的得分记忆。
 *
 * 为什么这样写：
 * 用户希望初级 AI 除了记住绝门外，还能记住“打家/朋友收了多少、闲家收了多少”，
 * 这样它才能判断后面剩余分数是否还足够翻盘，并据此切换“继续抢分”或“改抢扣底”。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 *
 * 输出：
 * @returns {{
 *   totalPoints: number,
 *   collectedPoints: number,
 *   remainingPointPool: number,
 *   unresolvedTeams: boolean,
 *   bankerKnownPoints: number,
 *   bankerTeamPoints: number | null,
 *   defenderPoints: number | null,
 *   defenderPointsNeeded: number | null,
 *   defenderCanStillReach120: boolean | null,
 *   bankerSideLockedByPoints: boolean | null,
 *   playerSide: "banker" | "defender" | "unknown"
 * }} 当前 AI 可直接依赖的公开分数摘要。
 *
 * 注意：
 * - 未站队前不推断隐藏朋友的分数归属，所以 `bankerTeamPoints / defenderPoints` 会保留为 `null`。
 * - `remainingPointPool` 只扣除已结算到 `roundPoints` 的分；当前桌面这一墩的分仍视为“可争取”。
 */
function getVisibleScoreMemoryForPlayer(playerId) {
  const totalPoints = getTotalDeckPointValue();
  const collectedPoints = state.players.reduce((sum, player) => sum + (player.roundPoints || 0), 0);
  const remainingPointPool = Math.max(0, totalPoints - collectedPoints);
  const unresolvedTeams = !isFriendTeamResolved();
  const bankerKnownPoints = getPlayer(state.bankerId)?.roundPoints || 0;
  const playerSide = unresolvedTeams
    ? (playerId === state.bankerId ? "banker" : "unknown")
    : (isDefenderTeam(playerId) ? "defender" : "banker");

  if (unresolvedTeams) {
    return {
      totalPoints,
      collectedPoints,
      remainingPointPool,
      unresolvedTeams,
      bankerKnownPoints,
      bankerTeamPoints: null,
      defenderPoints: null,
      defenderPointsNeeded: null,
      defenderCanStillReach120: null,
      bankerSideLockedByPoints: null,
      playerSide,
    };
  }

  const defenderPoints = state.defenderPoints;
  const bankerTeamPoints = Math.max(0, collectedPoints - defenderPoints);
  const defenderPointsNeeded = Math.max(0, 120 - defenderPoints);
  const defenderCanStillReach120 = defenderPoints + remainingPointPool >= 120;

  return {
    totalPoints,
    collectedPoints,
    remainingPointPool,
    unresolvedTeams,
    bankerKnownPoints,
    bankerTeamPoints,
    defenderPoints,
    defenderPointsNeeded,
    defenderCanStillReach120,
    bankerSideLockedByPoints: !defenderCanStillReach120,
    playerSide,
  };
}

function getStructureCombosFromHand(hand) {
  if (!Array.isArray(hand) || hand.length === 0) return [];
  const seen = new Set();
  const combos = [];
  const groups = [
    findSerialTuples(hand, 3),
    findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "train"),
    findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "tractor"),
    findTriples(hand),
    findPairs(hand),
  ];

  for (const entries of groups) {
    for (const combo of entries) {
      const key = combo.map((card) => card.id).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(combo);
    }
  }

  return combos;
}

/**
 * 作用：
 * 估算一手牌里“副牌结构资源”还剩多少。
 *
 * 为什么这样写：
 * 用户补充的规则点不是“缺门后永远不能出对子”，而是“贴副时不要把宝贵的副牌结构白白送掉”。
 * 这里把副牌对子、刻子、拖拉机、火车、推土机统一折算成一个库存分，便于跟牌排序时比较
 * “这手贴出去以后，手里还剩多少可继续利用的副牌结构”。
 *
 * 输入：
 * @param {Array<object>} hand - 当前评估使用的整手牌。
 *
 * 输出：
 * @returns {number} 返回当前副牌结构库存分；数值越高表示副牌结构越完整。
 *
 * 注意：
 * - 这里只统计有效花色不是 `trump` 的结构，主牌结构不走这条保护逻辑。
 * - 这是启发式库存分，不等于真实胜率或完整残局价值。
 */
function getSideStructureInventoryScore(hand) {
  if (!Array.isArray(hand) || hand.length === 0) return 0;
  const sideCards = hand.filter((card) => effectiveSuit(card) !== "trump");
  if (sideCards.length === 0) return 0;
  const pairs = findPairs(sideCards).length;
  const triples = findTriples(sideCards).length;
  const tractors = findSerialTuples(sideCards, 2).filter((combo) => classifyPlay(combo).type === "tractor").length;
  const trains = findSerialTuples(sideCards, 2).filter((combo) => classifyPlay(combo).type === "train").length;
  const bulldozers = findSerialTuples(sideCards, 3).length;
  return pairs * 42 + triples * 60 + tractors * 88 + trains * 104 + bulldozers * 128;
}

/**
 * 作用：
 * 估算指定有效花色在当前手牌里的结构库存分。
 *
 * 为什么这样写：
 * 这轮要同时修“延迟站队时乱拆同门拖拉机”和“普通跟单张时只顾丢零分牌”两类问题；
 * 先把单门的对子、刻子、拖拉机、火车、推土机都折算成同一套库存分，
 * 后面的延迟站队 shortcut、中级评分和搜索兜底才能共用一条“这手会不会把同门结构拆坏”的判断。
 *
 * 输入：
 * @param {Array<object>} hand - 当前评估使用的整手牌。
 * @param {string} suit - 需要统计的有效花色；可以是普通花色或 `trump`。
 *
 * 输出：
 * @returns {number} 返回这门当前保有的结构库存分；数值越高表示这门结构越完整。
 *
 * 注意：
 * - 这里按 `effectiveSuit(...)` 统计，确保主级牌和王会正确并入 `trump`。
 * - 这是启发式库存分，不等于真实残局胜率。
 */
function getSuitStructureInventoryScore(hand, suit) {
  if (!Array.isArray(hand) || hand.length === 0 || !suit) return 0;
  const suitedCards = hand.filter((card) => effectiveSuit(card) === suit);
  if (suitedCards.length === 0) return 0;
  const pairs = findPairs(suitedCards).length;
  const triples = findTriples(suitedCards).length;
  const tractors = findSerialTuples(suitedCards, 2).filter((combo) => classifyPlay(combo).type === "tractor").length;
  const trains = findSerialTuples(suitedCards, 2).filter((combo) => classifyPlay(combo).type === "train").length;
  const bulldozers = findSerialTuples(suitedCards, 3).length;
  return pairs * 42 + triples * 60 + tractors * 88 + trains * 104 + bulldozers * 128;
}

/**
 * 作用：
 * 评估“仍能按首门跟单张”时，这手牌是否拆掉了该门本来可保留的对子或拖拉机结构。
 *
 * 为什么这样写：
 * 用户反馈的异常不是“AI 不会跟单张”，而是“明明能用同门散牌跟，却为了省几点或只看零分，
 * 把 `8899` 这类同门现成结构拆掉了”。
 * 这条修正把“同门结构损耗”显式收口成统一惩罚，避免延迟站队 shortcut、beginner 跟牌排序、
 * intermediate 评分和搜索兜底各自散写一套不一致的补丁。
 *
 * 输入：
 * @param {Array<object>} combo - 当前待评估的跟牌组合。
 * @param {Array<object>} handBefore - 出这手牌前的完整手牌。
 * @param {object|null} [leadSpec=state.leadSpec] - 当前首家牌型描述；为空时回退读取全局 `state.leadSpec`。
 *
 * 输出：
 * @returns {number} 返回同门结构保留修正分；负数表示这手牌拆掉了本该优先保住的同门结构。
 *
 * 注意：
 * - 只在“首家出单张、自己仍有首门、且这手也在跟首门单张”时启用。
 * - 这里只衡量结构损耗，不负责决定是否该亮友或是否该抢分。
 */
function scoreSameSuitSingleStructurePreservationFromHand(combo, handBefore, leadSpec = state.leadSpec) {
  if (!leadSpec || leadSpec.type !== "single" || !Array.isArray(combo) || combo.length !== 1) return 0;
  if (!Array.isArray(handBefore) || handBefore.length === 0) return 0;

  const card = combo[0];
  if (!card || effectiveSuit(card) !== leadSpec.suit) return 0;

  const leadSuitCards = handBefore.filter((entry) => effectiveSuit(entry) === leadSpec.suit);
  if (leadSuitCards.length <= 1) return 0;

  const handAfter = getHandAfterCombo(handBefore, combo);
  const structureLoss = getSuitStructureInventoryScore(handBefore, leadSpec.suit)
    - getSuitStructureInventoryScore(handAfter, leadSpec.suit);
  if (structureLoss <= 0) return 0;
  return -structureLoss;
}

/**
 * 作用：
 * 评估“缺门贴副”时，这手牌是否不必要地消耗了副牌结构资源。
 *
 * 为什么这样写：
 * 当玩家已经没有首门、又没有选择用主成型毙牌时，规则上并不要求继续拿别门对子或连对去“贴同型”。
 * 如果排序器继续奖励这种出法，AI 就会把后续很可能还要用的副牌对子、连对提前贴掉。
 * 这里把这种误判显式变成一条负分规则，优先保住未来可回手、可续牌的副牌结构。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<object>} combo - 当前待评估的合法跟牌组合。
 * @param {Array<object>|null} handBefore - 出这手牌前的完整手牌；为空时回退读取当前玩家手牌。
 * @param {object|null} leadSpec - 当前首家牌型描述；为空时回退读取全局 `state.leadSpec`。
 *
 * 输出：
 * @returns {number} 返回结构保留修正分；负数表示这手贴牌消耗了不该轻易送掉的副牌结构。
 *
 * 注意：
 * - 只在“当前组合既不是跟同门，也不是主牌结构”时启用。
 * - 这条规则不会阻止 AI 合法毙牌；若当前组合本身是主牌结构，应交给上层继续判断是否值得上主。
 */
function scoreOffSuitDiscardStructurePreservation(playerId, combo, handBefore = null, leadSpec = state.leadSpec) {
  if (!leadSpec || !Array.isArray(combo) || combo.length === 0) return 0;
  const player = getPlayer(playerId);
  const sourceHand = Array.isArray(handBefore) ? handBefore : player?.hand;
  if (!Array.isArray(sourceHand) || sourceHand.length === 0) return 0;

  const pattern = classifyPlay(combo);
  const comboSuit = pattern.suit || effectiveSuit(combo[0]);
  if (comboSuit === leadSpec.suit || comboSuit === "trump") return 0;

  const handAfter = getHandAfterCombo(sourceHand, combo);
  const structureLoss = getSideStructureInventoryScore(sourceHand) - getSideStructureInventoryScore(handAfter);
  if (structureLoss <= 0) return 0;
  return -structureLoss;
}

/**
 * 作用：
 * 评估当前跟牌是否在“缺首门贴牌”时，不必要地拆掉了本来可用于控轮的大对。
 *
 * 为什么这样写：
 * 用户明确补充了一个跟牌口径：
 * 当自己已经缺首门，只是在贴牌或考虑是否用单张去压时，
 * `10 / J / Q / K / A`、级牌、王这类大对的长期控牌价值，往往高于一张 `5` 之类的小分牌。
 * 因此这里把“拆掉大对去贴牌 / 去抢一手不稳的单张”显式打成负分，避免初级和中级都继续走出“贴大对而留 5”的反直觉选择。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<object>} combo - 当前待评估的合法跟牌组合。
 * @param {Array<object>|null} handBefore - 出这手牌前的完整手牌；为空时回退读取当前玩家手牌。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次的领先出牌；为空时回退读取 live state。
 * @param {object|null} leadSpec - 当前首家牌型描述；为空时回退读取全局 `state.leadSpec`。
 *
 * 输出：
 * @returns {number} 返回大对保留修正分；负数表示这手牌拆掉了应尽量保住的大对。
 *
 * 注意：
 * - 只在“首家出单张、自己已经缺首门”的单张贴牌场景启用。
 * - 这里只保护“正好两张”的大对；三张拆一张后仍剩对子，不按这条规则重罚。
 */
function scoreOffSuitHighPairPreservation(playerId, combo, handBefore = null, currentWinningPlay = null, leadSpec = state.leadSpec) {
  if (!leadSpec || leadSpec.type !== "single" || !Array.isArray(combo) || combo.length !== 1) return 0;
  const player = getPlayer(playerId);
  const sourceHand = Array.isArray(handBefore) ? handBefore : player?.hand;
  if (!Array.isArray(sourceHand) || sourceHand.length === 0) return 0;

  const leadSuitCards = sourceHand.filter((card) => effectiveSuit(card) === leadSpec.suit);
  if (leadSuitCards.length > 0) return 0;

  const card = combo[0];
  const sameCopies = sourceHand.filter((entry) => entry.suit === card.suit && entry.rank === card.rank);
  if (sameCopies.length !== 2) return 0;

  const isHighPair = card.suit === "joker"
    || card.rank === getCurrentLevelRank()
    || ["10", "J", "Q", "K", "A"].includes(card.rank);
  if (!isHighPair) return 0;

  const comboSuit = effectiveSuit(card);
  const winningPlay = currentWinningPlay || getCurrentWinningPlay();
  let score = comboSuit === "trump" ? -240 : -180;
  if (winningPlay && wouldAiComboBeatCurrent(playerId, combo, winningPlay)) {
    score -= comboSuit === "trump" ? 120 : 70;
  }
  return score;
}

/**
 * 作用：
 * 在“缺首门跟单张”场景里，主动挑出一手更应该被贴掉的低分牌，避免 AI 拆掉大对。
 *
 * 为什么这样写：
 * 仅靠排序惩罚还不够，因为旧的 beginner / legacy intermediate 会先看“我能不能压”，
 * 一旦存在能压的单张主牌，就可能直接跳过所有不压的贴牌候选。
 * 这里补一层显式短路：当唯一值得出的控制资源是“大对的一半”，但手里还有 `5` 这类可接受的低分贴牌时，优先把低分牌送出去。
 *
 * 输入：
 * @param {number} playerId - 当前准备跟牌的玩家 ID。
 * @param {Array<Array<object>>} candidates - 当前所有合法候选。
 * @param {{playerId:number,cards:Array<object>}|null} currentWinningPlay - 当前轮次的领先出牌；为空时回退读取 live state。
 *
 * 输出：
 * @returns {Array<object>} 命中“大对保留”窗口时返回推荐贴牌，否则返回空数组。
 *
 * 注意：
 * - 只处理单张跟牌，不处理对子、拖拉机等必须按型出的场景。
 * - 这里允许贴 `5` 分，但不会主动把 `10 / K` 这类更大分牌当成默认替代品。
 */
function chooseAiHighPairPreserveDiscard(playerId, candidates, currentWinningPlay = null) {
  if (!Array.isArray(candidates) || candidates.length === 0 || !state.leadSpec || state.leadSpec.type !== "single") return [];
  const player = getPlayer(playerId);
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) return [];

  const leadSuitCards = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (leadSuitCards.length > 0) return [];

  const winningPlay = currentWinningPlay || getCurrentWinningPlay();
  if (!winningPlay) return [];

  const riskyPairBeats = candidates.filter((combo) =>
    combo.length === 1
    && wouldAiComboBeatCurrent(playerId, combo, winningPlay)
    && scoreOffSuitHighPairPreservation(playerId, combo, player.hand, winningPlay) < 0
  );
  if (riskyPairBeats.length === 0) return [];

  // 只有当“所有能压住的候选都会拆掉受保护的大对”时，才提前退回贴牌。
  // 若仍存在不拆高对的安全毙牌，就让后续正常评分继续比较“该不该毙、该用多大的主”。
  const safeBeatingChoices = candidates.filter((combo) =>
    combo.length === 1
    && wouldAiComboBeatCurrent(playerId, combo, winningPlay)
    && scoreOffSuitHighPairPreservation(playerId, combo, player.hand, winningPlay) === 0
  );
  if (safeBeatingChoices.length > 0) return [];

  const allyWinning = areAiSameSide(playerId, winningPlay.playerId);
  const safePointDiscards = candidates.filter((combo) =>
    combo.length === 1
    && !wouldAiComboBeatCurrent(playerId, combo, winningPlay)
    && getComboPointValue(combo) <= 5
    && scoreOffSuitHighPairPreservation(playerId, combo, player.hand, winningPlay) === 0
  );
  if (safePointDiscards.length === 0) return [];

  return safePointDiscards.sort((a, b) => {
    const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b, player.hand)
      - scoreOffSuitDiscardStructurePreservation(playerId, a, player.hand);
    if (preserveDiff !== 0) return preserveDiff;
    const pointDiff = allyWinning
      ? getComboPointValue(b) - getComboPointValue(a)
      : getComboPointValue(a) - getComboPointValue(b);
    if (pointDiff !== 0) return pointDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function isMemorableHighCard(card) {
  return !!card && (isTrump(card) || ["10", "J", "Q", "K", "A", "BJ", "RJ"].includes(card.rank));
}

function isIntermediateRememberedCardForPlayer(playerId, card) {
  if (!isMemorableHighCard(card)) return false;
  const player = getPlayer(playerId);
  if (!player) return false;
  const cardSuit = effectiveSuit(card);
  const cardPower = getPatternUnitPower(card, cardSuit);
  return getStructureCombosFromHand(player.hand).some((combo) => {
    const comboSuit = effectiveSuit(combo[0]);
    if (comboSuit !== cardSuit) return false;
    const comboTopPower = combo.reduce((max, entry) => Math.max(max, getPatternUnitPower(entry, comboSuit)), -Infinity);
    return cardPower > comboTopPower;
  });
}

function getRememberedPlayedCardsForPlayer(playerId) {
  const historyCards = getAiPlayedHistoryCards();
  const difficulty = getAiDifficulty();
  if (difficulty === "advanced") return historyCards;
  if (difficulty !== "intermediate") return [];
  return historyCards.filter((card) => isIntermediateRememberedCardForPlayer(playerId, card));
}

function isStructurePatternType(type) {
  return ["pair", "triple", "tractor", "train", "bulldozer"].includes(type);
}

function scoreRememberedStructurePromotion(playerId, combo) {
  if (!Array.isArray(combo) || combo.length === 0) return 0;
  const difficulty = getAiDifficulty();
  if (difficulty === "beginner") return 0;
  const pattern = classifyPlay(combo);
  if (!isStructurePatternType(pattern.type)) return 0;

  const suit = effectiveSuit(combo[0]);
  const comboTopPower = combo.reduce((max, card) => Math.max(max, getPatternUnitPower(card, suit)), -Infinity);
  const rememberedHigherCards = getRememberedPlayedCardsForPlayer(playerId)
    .filter((card) => effectiveSuit(card) === suit && getPatternUnitPower(card, suit) > comboTopPower);
  if (rememberedHigherCards.length === 0) return 0;

  const typeBonus = {
    pair: 18,
    triple: 22,
    tractor: 28,
    train: 32,
    bulldozer: 36,
  }[pattern.type] || 0;
  let score = Math.min(rememberedHigherCards.length, 6) * typeBonus;
  if (difficulty === "advanced") {
    score += Math.min(rememberedHigherCards.length, 6) * 6;
  }
  return score;
}

// 生成牌组的唯一键值。
function getComboKey(combo) {
  return combo.map((card) => card.id).sort().join("|");
}

// 将未出现过的牌组加入候选列表。
function addUniqueCombo(candidates, seen, combo) {
  if (!Array.isArray(combo) || combo.length === 0) return;
  if (combo.some((card) => !card || !card.id)) return;
  const key = getComboKey(combo);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(combo);
}

// 选出一组牌里最大的那张。
function highestCard(cards) {
  return [...cards].sort((a, b) => cardStrength(b) - cardStrength(a))[0];
}

// 计算一组牌包含的分值总和。
function getComboPointValue(combo) {
  return combo.reduce((sum, card) => sum + scoreValue(card), 0);
}

// 计算当前这一轮的总分值。
function getCurrentTrickPointValue() {
  return state.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards), 0);
}
