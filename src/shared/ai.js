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

function shouldAiRevealFriend(playerId) {
  if (!state.friendTarget || isFriendTeamResolved() || playerId === state.bankerId) return false;
  const player = getPlayer(playerId);
  if (!player) return false;
  const neededOccurrence = state.friendTarget.occurrence || 1;
  const currentSeen = state.friendTarget.matchesSeen || 0;
  if (currentSeen + 1 !== neededOccurrence) return false;
  const hasTarget = player.hand.some((card) => card.suit === state.friendTarget.suit && card.rank === state.friendTarget.rank);
  if (!hasTarget) return false;
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

function chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) {
  if (!state.friendTarget || !currentWinningPlay || currentWinningPlay.playerId !== state.bankerId) return [];
  if (state.trickNumber !== 1 || state.currentTrick[0]?.playerId !== state.bankerId) return [];
  if (state.currentTrick[0]?.cards.length !== 1) return [];

  const bankerLeadCard = state.currentTrick[0].cards[0];
  if (!isOneStepBelowFriendTarget(bankerLeadCard, state.friendTarget)) return [];
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

function chooseAiLeadPlay(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
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
  const currentWinningPlay = getCurrentWinningPlay();
  const allyWinning = currentWinningPlay ? areSameSide(playerId, currentWinningPlay.playerId) : false;
  const beatingCandidates = candidates.filter((combo) => doesSelectionBeatCurrent(playerId, combo));
  const revealChoice = shouldAiRevealFriend(playerId) ? chooseAiRevealCombo(candidates) : [];
  const supportChoice = revealChoice.length > 0 ? chooseAiSupportBeforeReveal(playerId, candidates, currentWinningPlay) : [];

  if (supportChoice.length > 0) {
    return supportChoice;
  }

  if (revealChoice.length > 0 && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  if (!allyWinning && beatingCandidates.length > 0) {
    return beatingCandidates.sort((a, b) => {
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
      const scoreDiff = b.reduce((sum, card) => sum + scoreValue(card), 0) - a.reduce((sum, card) => sum + scoreValue(card), 0);
      if (scoreDiff !== 0) return scoreDiff;
      return classifyPlay(a).power - classifyPlay(b).power;
    })[0];
  }

  if (revealChoice.length > 0) {
    return revealChoice;
  }

  return candidates.sort((a, b) => {
    const scoreDiff = a.reduce((sum, card) => sum + scoreValue(card), 0) - b.reduce((sum, card) => sum + scoreValue(card), 0);
    if (scoreDiff !== 0) return scoreDiff;
    return classifyPlay(a).power - classifyPlay(b).power;
  })[0];
}

function getLegalHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];

  const hand = player.hand;
  if (state.currentTrick.length === 0) {
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
  return hand.slice(0, state.leadSpec.count);
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
    const validCombo = combos.find((combo) => validateSelection(playerId, combo).ok);
    if (validCombo) return validCombo;
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
  if (fallback.length === 0) return;
  playCards(player.id, fallback.map((card) => card.id));
}
