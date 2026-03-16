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
  const lockedPointSafetyLead = chooseAiLockedPointSafetyLead(playerId, player);
  if (lockedPointSafetyLead.length > 0) return lockedPointSafetyLead;
  const gradeBottomTrumpLead = chooseAiGradeBottomTrumpLead(playerId, player);
  if (gradeBottomTrumpLead.length > 0) return gradeBottomTrumpLead;
  const safeAntiRuffLead = chooseAiSafeAntiRuffLead(playerId, player);
  if (safeAntiRuffLead.length > 0) return safeAntiRuffLead;
  const handoffLead = chooseAiHandoffLead(playerId, player);
  if (handoffLead.length > 0) return handoffLead;
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

  if (!shouldDelayReveal && revealChoice.length > 0 && (state.trickNumber === 1 || getAiRevealIntentScore(playerId) >= 3)) {
    return revealChoice;
  }

  if (!allyWinning && safeBeatingCandidates.length > 0) {
    return safeBeatingCandidates.sort((a, b) => {
      const structureDiff = getFollowStructureScore(b) - getFollowStructureScore(a);
      if (structureDiff !== 0) return structureDiff;
      const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b)
        - scoreOffSuitDiscardStructurePreservation(playerId, a);
      if (preserveDiff !== 0) return preserveDiff;
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
      const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b)
        - scoreOffSuitDiscardStructurePreservation(playerId, a);
      if (preserveDiff !== 0) return preserveDiff;
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
    const preserveDiff = scoreOffSuitDiscardStructurePreservation(playerId, b)
      - scoreOffSuitDiscardStructurePreservation(playerId, a);
    if (preserveDiff !== 0) return preserveDiff;
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
