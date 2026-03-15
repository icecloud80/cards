// 为玩家给出当前合法出牌提示。
function getLegalHintForPlayer(playerId) {
  return getAiDifficulty() === "beginner"
    ? getBeginnerLegalHintForPlayer(playerId)
    : getIntermediateLegalHintForPlayer(playerId);
}

// 构建强制跟牌兜底方案。
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

// 查找搜索得到的合法选牌。
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

// 自动处理出牌当前回合。
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
