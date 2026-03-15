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

// 评估 AI 手里亮朋友相关牌型的压力。
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

// 计算 AI 是否主动亮朋友的意愿分数。
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

// 判断 AI 当前是否应该亮朋友。
function shouldAiRevealFriend(playerId) {
  if (!canAiRevealFriendNow(playerId)) return false;
  if (isAiCertainFriend(playerId)) return true;
  if (shouldAiDelayRevealOnOpeningLead(playerId)) return false;
  return getAiRevealIntentScore(playerId) >= 2;
}

// 从候选牌组中挑选最适合亮朋友的出牌。
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

// 为必然成友的 AI 返回强制亮朋友的出牌。
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

// 判断某位玩家是否有牌可以压过当前领先牌。
function canPlayerBeatCurrentWinning(playerId) {
  const legalSelections = getLegalSelectionsForPlayer(playerId, 48);
  return legalSelections.some((combo) => wouldAiComboBeatCurrent(playerId, combo));
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

// 判断庄家在不亮朋友时是否大概率守住这一墩。
function isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay) {
  if (!currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return false;
  return !getPendingPlayersAfter(playerId).some((pendingPlayerId) => canPlayerBeatCurrentWinning(pendingPlayerId));
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

// 判断 AI 是否应在庄家领单时延后亮朋友。
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

  if (!isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay)) return false;

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
  const playerCopies = getAiTargetCopiesInHand(playerId);
  if (playerCopies <= 0) return false;

  const bankerCopies = getAiTargetCopiesInHand(state.bankerId);
  const otherCopies = state.players
    .filter((player) => player.id !== playerId && player.id !== state.bankerId)
    .reduce((sum, player) => sum + getAiTargetCopiesInHand(player.id), 0);

  return currentSeen + bankerCopies + otherCopies < neededOccurrence && currentSeen + bankerCopies + playerCopies >= neededOccurrence;
}

// 判断 AI 当前是否属于潜在朋友阵营。
function isAiProspectiveFriend(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  if (getAiTargetCopiesInHand(playerId) <= 0) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (neededOccurrence === 3 && isAiCertainFriend(playerId)) return true;
  return currentSeen >= neededOccurrence - 1;
}

// 判断 AI 当前是否可视为暂定闲家。
function isAiTentativeDefender(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  return getAiTargetCopiesInHand(playerId) === 0 && !isAiProspectiveFriend(playerId);
}

// 判断两名 AI 当前是否属于同一阵营。
function areAiSameSide(playerA, playerB) {
  if (isFriendTeamResolved()) return areSameSide(playerA, playerB);
  const aBankerSide = playerA === state.bankerId || isAiProspectiveFriend(playerA);
  const bBankerSide = playerB === state.bankerId || isAiProspectiveFriend(playerB);
  if (aBankerSide || bBankerSide) return aBankerSide && bBankerSide;
  return isAiTentativeDefender(playerA) && isAiTentativeDefender(playerB);
}

// 为亮朋友前的配合出牌选择方案。
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
  if (!isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay)) return [];

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

// 统计牌桌上仍未结算的分数总和。
function getRemainingOpenPoints() {
  const handPoints = state.players.reduce(
    (sum, player) => sum + player.hand.reduce((cardSum, card) => cardSum + scoreValue(card), 0),
    0
  );
  const trickPoints = state.currentTrick.reduce(
    (sum, play) => sum + play.cards.reduce((cardSum, card) => cardSum + scoreValue(card), 0),
    0
  );
  return handPoints + trickPoints;
}

// 判断 AI 当前是否应该争取扣底。
function shouldAiAimForBottom(playerId) {
  if (!isDefenderTeam(playerId)) return false;
  const ceilingWithoutBottom = state.defenderPoints + getRemainingOpenPoints();
  if (ceilingWithoutBottom < 120) return true;
  const cardsLeft = state.players.reduce((sum, player) => sum + player.hand.length, 0);
  return ceilingWithoutBottom < 140 && cardsLeft <= 20;
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
  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    for (const combo of enumerateCombinations(pool, targetCount)) {
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
  return state.aiDifficulty === "intermediate" ? "intermediate" : "beginner";
}

// 生成牌组的唯一键值。
function getComboKey(combo) {
  return combo.map((card) => card.id).sort().join("|");
}

// 将未出现过的牌组加入候选列表。
function addUniqueCombo(candidates, seen, combo) {
  if (!Array.isArray(combo) || combo.length === 0) return;
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

// 计算当前这一墩的总分值。
function getCurrentTrickPointValue() {
  return state.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards), 0);
}
