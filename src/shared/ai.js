function getAiHandStrength(playerId) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  return player.hand.reduce((sum, card) => {
    const trumpBonus = isTrump(card) ? 3 : 0;
    const highBonus = cardStrength(card) >= 12 ? 1 : 0;
    return sum + trumpBonus + highBonus + scoreValue(card) / 5;
  }, 0);
}

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

function getGoalkeeperId() {
  return getPreviousPlayerId(state.nextFirstDealPlayerId || PLAYER_ORDER[0]);
}

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

function getAiTargetCopiesInHand(playerId, target = state.friendTarget) {
  const player = getPlayer(playerId);
  if (!player || !target) return 0;
  return player.hand.filter((card) => card.suit === target.suit && card.rank === target.rank).length;
}

function canAiRevealFriendNow(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (currentSeen + 1 !== neededOccurrence) return false;
  if (getAiTargetCopiesInHand(playerId) <= 0) return false;
  return true;
}

function shouldAiRevealFriend(playerId) {
  if (!canAiRevealFriendNow(playerId)) return false;
  if (isAiCertainFriend(playerId)) return true;
  if (shouldAiDelayRevealOnOpeningLead(playerId)) return false;
  return getAiRevealIntentScore(playerId) >= 2;
}

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

function getForcedCertainFriendRevealPlay(playerId, candidates = null) {
  if (!canAiRevealFriendNow(playerId) || !isAiCertainFriend(playerId)) return [];
  const player = getPlayer(playerId);
  if (!player) return [];
  if (Array.isArray(candidates) && candidates.length > 0) {
    return chooseAiRevealCombo(candidates);
  }
  const friendCard = player.hand.find((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
  return friendCard ? [friendCard] : [];
}

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

function canPlayerBeatCurrentWinning(playerId) {
  const legalSelections = getLegalSelectionsForPlayer(playerId, 48);
  return legalSelections.some((combo) => doesSelectionBeatCurrent(playerId, combo));
}

function isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay) {
  if (!currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return false;
  return !getPendingPlayersAfter(playerId).some((pendingPlayerId) => canPlayerBeatCurrentWinning(pendingPlayerId));
}

function getTargetVirtualCard(target = state.friendTarget) {
  if (!target) return null;
  return {
    id: `target-${target.suit}-${target.rank}`,
    suit: target.suit,
    rank: target.rank,
  };
}

function isOneStepBelowFriendTarget(card, target = state.friendTarget) {
  if (!card || !target || target.suit === "joker" || card.suit !== target.suit) return false;
  const targetCard = getTargetVirtualCard(target);
  if (!targetCard) return false;
  return getPatternUnitPower(targetCard, effectiveSuit(targetCard)) - getPatternUnitPower(card, effectiveSuit(card)) === 1;
}

function shouldAiDelayRevealOnOpeningLead(playerId) {
  if (!state.friendTarget || state.trickNumber !== 1 || state.currentTrick[0]?.playerId !== state.bankerId) return false;
  if (state.currentTrick[0]?.cards.length !== 1) return false;
  const currentWinningPlay = getCurrentWinningPlay();
  if (!isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay)) return false;

  const bankerLeadCard = state.currentTrick[0].cards[0];
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;

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

function isAiProspectiveFriend(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  if (getAiTargetCopiesInHand(playerId) <= 0) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (neededOccurrence === 3 && isAiCertainFriend(playerId)) return true;
  return currentSeen >= neededOccurrence - 1;
}

function areAiSameSide(playerA, playerB) {
  if (isFriendTeamResolved()) return areSameSide(playerA, playerB);
  const aBankerSide = playerA === state.bankerId || isAiProspectiveFriend(playerA);
  const bBankerSide = playerB === state.bankerId || isAiProspectiveFriend(playerB);
  return aBankerSide && bBankerSide;
}

function chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) {
  if (!state.friendTarget || !currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return [];
  if (state.trickNumber !== 1 || state.currentTrick[0]?.playerId !== state.bankerId) return [];
  if (state.currentTrick[0]?.cards.length !== 1) return [];

  const bankerLeadCard = state.currentTrick[0].cards[0];
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  const delayForFirstTarget = neededOccurrence === 1 && isOneStepBelowFriendTarget(bankerLeadCard, state.friendTarget);
  const delayForSecondTarget = neededOccurrence === 2 && currentSeen === 1
    && bankerLeadCard.suit === state.friendTarget.suit
    && bankerLeadCard.rank === state.friendTarget.rank;
  if (!delayForFirstTarget && !delayForSecondTarget) return [];
  if (!isBankerLikelyToHoldTrickWithoutReveal(playerId, currentWinningPlay)) return [];

  const supportChoices = candidates.filter((combo) =>
    !combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank)
      && !doesSelectionBeatCurrent(state.currentTurnId, combo)
  );

  if (supportChoices.length === 0) return [];

  return supportChoices.sort((a, b) => {
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

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

function getAiPressureTargetIds(playerId) {
  if (!isDefenderTeam(playerId)) return [];
  if (!isFriendTeamResolved()) {
    return state.bankerId === playerId ? [] : [state.bankerId];
  }
  return state.players
    .map((player) => player.id)
    .filter((otherId) => otherId !== playerId && !areSameSide(playerId, otherId));
}

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

function shouldAiAimForBottom(playerId) {
  if (!isDefenderTeam(playerId)) return false;
  const ceilingWithoutBottom = state.defenderPoints + getRemainingOpenPoints();
  if (ceilingWithoutBottom < 120) return true;
  const cardsLeft = state.players.reduce((sum, player) => sum + player.hand.length, 0);
  return ceilingWithoutBottom < 140 && cardsLeft <= 20;
}

function scoreBottomPrepCombo(combo) {
  const levelRank = getCurrentLevelRank();
  return combo.reduce((sum, card) => {
    if (card.suit === "joker") return sum + 40;
    if (isTrump(card) && card.rank !== levelRank) return sum + 16;
    if (card.rank === levelRank) return sum - 18;
    return sum - scoreValue(card);
  }, 0);
}

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

function getAiDifficulty() {
  return state.aiDifficulty === "intermediate" ? "intermediate" : "beginner";
}

function getComboKey(combo) {
  return combo.map((card) => card.id).sort().join("|");
}

function addUniqueCombo(candidates, seen, combo) {
  if (!Array.isArray(combo) || combo.length === 0) return;
  const key = getComboKey(combo);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(combo);
}

function highestCard(cards) {
  return [...cards].sort((a, b) => cardStrength(b) - cardStrength(a))[0];
}

function getComboPointValue(combo) {
  return combo.reduce((sum, card) => sum + scoreValue(card), 0);
}

function getCurrentTrickPointValue() {
  return state.currentTrick.reduce((sum, play) => sum + getComboPointValue(play.cards), 0);
}

function getIntermediateReturnTargetIds(playerId) {
  if (playerId === state.bankerId) return [];
  if (!state.friendTarget || !isFriendTeamResolved()) {
    if (isAiProspectiveFriend(playerId)) {
      return [state.bankerId];
    }
    if (isDefenderTeam(playerId)) {
      return state.players
        .map((player) => player.id)
        .filter((otherId) => otherId !== playerId && otherId !== state.bankerId);
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

function getIntermediateReturnSignal(targetId, leadSuit) {
  if (!leadSuit || leadSuit === "trump") return 0;
  let signal = state.exposedSuitVoid[targetId]?.[leadSuit] ? 1 : 0;
  const targetPlayer = getPlayer(targetId);
  if (!targetPlayer) return signal;
  const hasLeadSuit = targetPlayer.hand.some((card) => effectiveSuit(card) === leadSuit);
  if (!hasLeadSuit) {
    signal += targetId === state.bankerId ? 2 : 1;
  }
  return signal;
}

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
  score -= cardStrength(leadCard) * 2;
  return score;
}

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

function scoreComboResourceUse(combo) {
  return combo.reduce((sum, card) => {
    let cardScore = isTrump(card) ? 9 : 2;
    if (card.suit === "joker") cardScore += 7;
    if (card.rank === getCurrentLevelRank()) cardScore += 4;
    if (!isTrump(card) && (card.rank === "A" || card.rank === "K")) cardScore += 3;
    return sum + cardScore;
  }, 0);
}

function getHandAfterCombo(hand, combo) {
  const removeIds = new Set(combo.map((card) => card.id));
  return hand.filter((card) => !removeIds.has(card.id));
}

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

  score += scoreIntermediateReturnLead(playerId, combo, player);

  if (combo.every((card) => effectiveSuit(card) === "trump") && !isDefenderTeam(playerId)) {
    score -= 10;
  }

  return score;
}

function chooseIntermediateLeadPlay(playerId) {
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId);
  if (forcedReveal.length > 0) return forcedReveal;
  const candidates = getIntermediateLeadCandidates(playerId);
  if (candidates.length === 0) return [];
  const beginnerChoice = getBeginnerLegalHintForPlayer(playerId);
  return candidates.sort((a, b) => {
    const scoreDiff = scoreIntermediateLeadCandidate(playerId, b, beginnerChoice) - scoreIntermediateLeadCandidate(playerId, a, beginnerChoice);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function scoreIntermediateFollowCandidate(playerId, combo, currentWinningPlay, allyWinning, beginnerChoice) {
  const player = getPlayer(playerId);
  if (!player || combo.length === 0) return Number.NEGATIVE_INFINITY;
  const handBefore = player.hand;
  const handAfter = getHandAfterCombo(handBefore, combo);
  const currentPattern = currentWinningPlay ? classifyPlay(currentWinningPlay.cards) : null;
  const pattern = classifyPlay(combo);
  const beats = !!currentWinningPlay && doesSelectionBeatCurrent(playerId, combo);
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

  if (shouldAiAimForBottom(playerId) && allyWinning && !beats) {
    score += scoreBottomPrepCombo(combo) * 2;
  }

  if (state.friendTarget && !isFriendTeamResolved()) {
    const containsTarget = combo.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
    if (containsTarget && canAiRevealFriendNow(playerId)) {
      score += state.trickNumber === 1 ? 90 : 36;
    }
  }

  return score;
}

function chooseIntermediateFollowPlay(playerId, candidates) {
  if (candidates.length === 0) return [];
  const forcedReveal = getForcedCertainFriendRevealPlay(playerId, candidates);
  if (forcedReveal.length > 0) return forcedReveal;
  const currentWinningPlay = getCurrentWinningPlay();
  const allyWinning = currentWinningPlay ? areAiSameSide(playerId, currentWinningPlay.playerId) : false;
  const revealOpportunity = canAiRevealFriendNow(playerId);
  const revealChoice = revealOpportunity ? chooseAiRevealCombo(candidates) : [];
  const supportChoice = revealOpportunity ? chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) : [];
  const beginnerChoice = getBeginnerLegalHintForPlayer(playerId);

  if (supportChoice.length > 0) return supportChoice;
  if (revealChoice.length > 0 && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  return candidates.sort((a, b) => {
    const scoreDiff = scoreIntermediateFollowCandidate(playerId, b, currentWinningPlay, allyWinning, beginnerChoice)
      - scoreIntermediateFollowCandidate(playerId, a, currentWinningPlay, allyWinning, beginnerChoice);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

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
  const voidPressureLead = chooseAiVoidPressureLead(playerId, player);
  if (voidPressureLead.length > 0) return voidPressureLead;
  return [];
}

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

function getFollowStructureScore(combo) {
  if (!state.leadSpec) return 0;
  const pattern = classifyPlay(combo);
  const suitedCount = combo.filter((card) => effectiveSuit(card) === state.leadSpec.suit).length;
  let score = suitedCount * 10;

  if (matchesLeadPattern(pattern, state.leadSpec)) {
    score += 1000;
  }

  if (state.leadSpec.type === "pair") {
    score += getForcedPairUnits(combo) * 120;
  } else if (state.leadSpec.type === "triple") {
    score += getTripleUnits(combo) * 150;
    score += getForcedPairUnits(combo) * 40;
  } else if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
    score += getForcedPairUnits(combo) * 140;
  } else if (state.leadSpec.type === "bulldozer") {
    const tripleUnits = getTripleUnits(combo);
    score += tripleUnits * 160;
    score += getForcedPairUnitsWithReservedTriples(combo, tripleUnits) * 50;
  }

  return score;
}

function getBeginnerLegalHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];

  const hand = player.hand;
  if (state.currentTrick.length === 0) {
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

function getLegalHintForPlayer(playerId) {
  return getAiDifficulty() === "intermediate"
    ? getIntermediateLegalHintForPlayer(playerId)
    : getBeginnerLegalHintForPlayer(playerId);
}

function buildForcedFollowFallback(playerId) {
  const player = getPlayer(playerId);
  if (!player || state.currentTrick.length === 0 || !state.leadSpec) return [];

  const targetCount = state.leadSpec.count;
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length >= targetCount) {
    return suited.slice(0, targetCount);
  }
  const fillers = hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id));
  return [...suited, ...fillers.slice(0, targetCount - suited.length)];
}

function findLegalSelectionBySearch(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  if (state.currentTrick.length === 0) return [];

  const targetCount = state.leadSpec.count;
  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  const pools = [];

  if (suited.length >= targetCount) {
    pools.push(suited);
  } else if (suited.length > 0) {
    pools.push([...suited, ...hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id))]);
  }

  if (!pools.some((pool) => pool.length === hand.length)) {
    pools.push(hand);
  }

  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    const combos = enumerateCombinations(pool, targetCount);
    const validCombos = combos.filter((combo) => validateSelection(playerId, combo).ok);
    if (validCombos.length > 0) {
      return validCombos.sort((a, b) => {
        const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
        if (structureDiff !== 0) return structureDiff;
        const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
        if (scoreDiff !== 0) return scoreDiff;
        return classifyPlay(a).power - classifyPlay(b).power;
      })[0];
    }
  }

  return [];
}

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
  if (forced.length === 0) return;
  playCards(player.id, forced.map((card) => card.id));
}
