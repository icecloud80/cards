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
  const ownPoints = (player.roundPoints || 0) + (unresolvedFriend ? (player.capturedPoints || 0) : 0);
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

function evaluateState(simState, playerId, objective = getIntermediateObjective(playerId, "lead", simState)) {
  const breakdown = {
    structure: getSimulationStructureScore(simState, playerId),
    control: getSimulationControlScore(simState, playerId),
    points: getSimulationPointsScore(simState, playerId),
    friend: getSimulationFriendScore(simState, playerId),
    bottom: getSimulationBottomScore(simState, playerId),
    voidPressure: getSimulationVoidPressureScore(simState, playerId),
  };

  const weights = objective?.weights || {};
  const total = Object.entries(breakdown).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 1), 0);

  return {
    total,
    breakdown,
    objective,
  };
}
