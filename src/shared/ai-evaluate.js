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

function evaluateState(simState, playerId, objective = getIntermediateObjective(playerId, "lead", simState)) {
  const breakdown = {
    structure: getSimulationStructureScore(simState, playerId),
    control: getSimulationControlScore(simState, playerId),
    points: getSimulationPointsScore(simState, playerId),
    friend: getSimulationFriendScore(simState, playerId),
    bottom: getSimulationBottomScore(simState, playerId),
    voidPressure: getSimulationVoidPressureScore(simState, playerId),
    tempo: getSimulationTempoScore(simState, playerId),
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
