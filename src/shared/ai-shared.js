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
