function createDeck() {
  const deck = [];
  let seq = 0;
  for (let pack = 0; pack < 3; pack += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `c-${pack}-${suit}-${rank}-${seq++}`,
          suit,
          rank,
          pack,
          img: getCardImage(suit, rank),
        });
      }
    }
    deck.push({
      id: `c-${pack}-joker-BJ-${seq++}`,
      suit: "joker",
      rank: "BJ",
      pack,
      img: `${CARD_ASSET_DIR}/black_joker.svg`,
    });
    deck.push({
      id: `c-${pack}-joker-RJ-${seq++}`,
      suit: "joker",
      rank: "RJ",
      pack,
      img: `${CARD_ASSET_DIR}/red_joker.svg`,
    });
  }
  return shuffle(deck);
}

function getCardImage(suit, rank) {
  const rankName = {
    A: "ace",
    K: "king",
    Q: "queen",
    J: "jack",
  }[rank] || rank;
  return `${CARD_ASSET_DIR}/${rankName}_of_${suit}.svg`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getPlayerLevel(playerId) {
  return state.playerLevels[playerId] || "2";
}

function getLevelRank(level) {
  if (level == null || level === "") return null;
  const normalized = String(level);
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

function isNegativeLevel(level) {
  return typeof level === "string" && level.startsWith("-");
}

function getPlayerLevelRank(playerId) {
  return getLevelRank(getPlayerLevel(playerId));
}

function getCurrentLevelRank() {
  return getLevelRank(state.declaration?.rank || state.levelRank || null);
}

function shiftLevel(rank, delta) {
  let current = [...NEGATIVE_LEVELS, ...RANKS].includes(rank) ? rank : "2";
  for (let i = 0; i < delta; i += 1) {
    if (current === "-2") {
      current = "-A";
    } else if (current === "-A") {
      current = "2";
    } else {
      const currentIndex = RANKS.indexOf(current);
      if (currentIndex < 0 || currentIndex >= RANKS.length - 1) {
        return "A";
      }
      current = RANKS[currentIndex + 1];
    }
    if (!isNegativeLevel(current) && MANDATORY_LEVELS.has(current)) {
      break;
    }
  }
  return current;
}

function getPenaltyFallbackMap(mode = "trump") {
  if (mode === "vice") return VICE_PENALTY_LEVEL_FALLBACK;
  return TRUMP_PENALTY_LEVEL_FALLBACK;
}

function dropLevel(rank, steps = 1, mode = "trump") {
  let current = [...NEGATIVE_LEVELS, ...RANKS].includes(rank) ? rank : "2";
  const fallbackMap = getPenaltyFallbackMap(mode);
  for (let i = 0; i < steps; i += 1) {
    if (current === "-2") {
      current = "-2";
      continue;
    }
    if (current === "-A") {
      current = "-2";
      continue;
    }
    if (!RANKS.includes(current)) {
      current = "2";
      continue;
    }
    if (fallbackMap[current]) {
      current = fallbackMap[current];
      continue;
    }
    current = current === "2" ? "-A" : RANKS[Math.max(0, RANKS.indexOf(current) - 1)];
  }
  return current;
}

function syncPlayerLevels() {
  for (const player of state.players) {
    player.level = getPlayerLevel(player.id);
  }
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const groupDiff = groupOrder(a) - groupOrder(b);
    if (groupDiff !== 0) return groupDiff;
    return cardStrength(b) - cardStrength(a);
  });
}

function groupOrder(card) {
  if (isTrump(card)) return 4;
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

function getActiveTrumpSuit() {
  if (state.phase === "ready") {
    return null;
  }
  if (state.phase === "dealing") {
    if (!state.declaration || state.declaration.suit === "notrump") return null;
    return state.declaration.suit;
  }
  if (state.trumpSuit === "notrump") return null;
  return state.trumpSuit;
}

function isTrump(card) {
  const currentLevelRank = getCurrentLevelRank();
  const activeTrumpSuit = getActiveTrumpSuit();
  return card.suit === "joker" || (currentLevelRank && card.rank === currentLevelRank) || (activeTrumpSuit ? card.suit === activeTrumpSuit : false);
}

function effectiveSuit(card) {
  return isTrump(card) ? "trump" : card.suit;
}

function getTrumpRankIndex(card) {
  const currentLevelRank = getCurrentLevelRank();
  const plainRanks = RANKS.filter((rank) => rank !== currentLevelRank);
  if (card.rank === "RJ") return plainRanks.length + 3;
  if (card.rank === "BJ") return plainRanks.length + 2;
  const activeTrumpSuit = getActiveTrumpSuit();
  if (currentLevelRank && card.rank === currentLevelRank && activeTrumpSuit && card.suit === activeTrumpSuit) {
    return plainRanks.length + 1;
  }
  if (currentLevelRank && card.rank === currentLevelRank) {
    return plainRanks.length;
  }
  return plainRanks.indexOf(card.rank);
}

function getPatternUnitPower(card, suit = effectiveSuit(card)) {
  return suit === "trump" ? getTrumpRankIndex(card) : getNonTrumpRankIndex(card.rank);
}

function cardStrength(card) {
  const suit = effectiveSuit(card);
  return (suit === "trump" ? 500 : 100) + getPatternUnitPower(card, suit);
}

function scoreValue(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

function lowestCard(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b))[0];
}

function findPairs(cards) {
  return findTuples(cards, 2);
}

function hasForcedPair(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()].some((count) => count === 2 || count >= 4);
}

function getCardGroupCounts(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()];
}

function getForcedPairUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => {
    if (count < 2 || count === 3) return sum;
    return sum + Math.floor(count / 2);
  }, 0);
}

function getTripleUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => sum + Math.floor(count / 3), 0);
}

function getForcedPairUnitsWithReservedTriples(cards, reservedTriples = 0) {
  const counts = getCardGroupCounts(cards);
  let triplesLeft = reservedTriples;

  while (triplesLeft > 0) {
    const candidates = counts
      .map((count, index) => ({ count, index }))
      .filter((entry) => entry.count >= 3);
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      const pairLossA = getPairUnitsFromCount(a.count) - getPairUnitsFromCount(a.count - 3);
      const pairLossB = getPairUnitsFromCount(b.count) - getPairUnitsFromCount(b.count - 3);
      if (pairLossA !== pairLossB) return pairLossA - pairLossB;
      return a.count - b.count;
    });

    counts[candidates[0].index] -= 3;
    triplesLeft -= 1;
  }

  return counts.reduce((sum, count) => sum + getPairUnitsFromCount(count), 0);
}

function getPairUnitsFromCount(count) {
  if (count < 2 || count === 3) return 0;
  return Math.floor(count / 2);
}

function findTriples(cards) {
  return findTuples(cards, 3);
}

function findTuples(cards, tupleSize) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }
  return [...map.values()]
    .filter((group) => group.length >= tupleSize)
    .map((group) => group.slice(0, tupleSize))
    .sort((a, b) => getPatternUnitPower(a[0]) - getPatternUnitPower(b[0]));
}

function getNonTrumpRankIndex(rank) {
  const currentLevelRank = getCurrentLevelRank();
  const ranks = RANKS.filter((item) => item !== currentLevelRank);
  return ranks.indexOf(rank);
}

function isExactTriple(cards) {
  return cards.length === 3
    && cards.every((card) => card.rank === cards[0].rank && card.suit === cards[0].suit);
}

function findSerialTuples(cards, tupleSize, exactChainLength = null) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const bySuit = new Map();
  for (const group of map.values()) {
    if (group.length < tupleSize) continue;
    const tuple = group.slice(0, tupleSize);
    const suit = effectiveSuit(tuple[0]);
    const entry = {
      cards: tuple,
      suit,
      index: getPatternUnitPower(tuple[0], suit),
    };
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(entry);
  }

  const results = [];
  for (const entries of bySuit.values()) {
    entries.sort((a, b) => a.index - b.index);
    let runStart = 0;
    for (let i = 1; i <= entries.length; i += 1) {
      const consecutive = i < entries.length && entries[i].index - entries[i - 1].index === 1;
      if (consecutive) continue;
      const run = entries.slice(runStart, i);
      const need = exactChainLength || run.length;
      if (run.length >= 2 && run.length >= need) {
        if (exactChainLength) {
          for (let j = 0; j <= run.length - exactChainLength; j += 1) {
            results.push(run.slice(j, j + exactChainLength).flatMap((entry) => entry.cards));
          }
        } else {
          results.push(run.flatMap((entry) => entry.cards));
        }
      }
      runStart = i;
    }
  }

  return results.sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
}

function isSameSuitSet(cards) {
  if (cards.length === 0) return false;
  const suit = effectiveSuit(cards[0]);
  return cards.every((card) => effectiveSuit(card) === suit);
}

function decomposeThrowComponents(cards) {
  if (!isSameSuitSet(cards)) return null;
  const remaining = [...cards].sort((a, b) => cardStrength(b) - cardStrength(a));
  const components = [];

  const takeComponent = (componentCards) => {
    for (const picked of componentCards) {
      const index = remaining.findIndex((card) => card.id === picked.id);
      if (index >= 0) remaining.splice(index, 1);
    }
    components.push({
      ...classifyPlay(componentCards),
      cards: sortPlayedCards(componentCards),
    });
  };

  while (remaining.length > 0) {
    const bulldozers = findSerialTuples(remaining, 3);
    if (bulldozers.length > 0) {
      takeComponent(bulldozers[bulldozers.length - 1]);
      continue;
    }
    const serialPairs = findSerialTuples(remaining, 2);
    if (serialPairs.length > 0) {
      takeComponent(serialPairs[serialPairs.length - 1]);
      continue;
    }
    const triples = findTriples(remaining);
    if (triples.length > 0) {
      takeComponent(triples[triples.length - 1]);
      continue;
    }
    const pairs = findPairs(remaining);
    if (pairs.length > 0) {
      takeComponent(pairs[pairs.length - 1]);
      continue;
    }
    takeComponent([remaining[0]]);
  }

  return components.every((component) => component.ok) ? components : null;
}

function isSerialTuplePlay(cards, tupleSize) {
  if (cards.length < tupleSize * 2 || cards.length % tupleSize !== 0) return false;
  const suit = effectiveSuit(cards[0]);
  if (cards.some((card) => effectiveSuit(card) !== suit)) return false;

  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const groups = [...map.values()];
  if (groups.some((group) => group.length !== tupleSize)) return false;

  const ordered = groups
    .map((group) => ({
      index: getPatternUnitPower(group[0], suit),
      key: `${group[0].suit}-${group[0].rank}`,
    }))
    .sort((a, b) => a.index - b.index);

  if (new Set(ordered.map((item) => item.key)).size !== groups.length) return false;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].index - ordered[i - 1].index !== 1) {
      return false;
    }
  }
  return true;
}

function classifyPlay(cards) {
  const sorted = sortPlayedCards(cards);
  const suit = sorted.length > 0 ? effectiveSuit(sorted[0]) : null;
  if (sorted.length === 1) {
    return { ok: true, type: "single", count: 1, suit, power: cardStrength(sorted[0]) };
  }
  if (isExactPair(sorted)) {
    return { ok: true, type: "pair", count: 2, suit, power: cardStrength(sorted[0]) };
  }
  if (isExactTriple(sorted)) {
    return { ok: true, type: "triple", count: 3, suit, power: cardStrength(sorted[0]) };
  }
  if (isSerialTuplePlay(sorted, 2)) {
    const pairs = findPairs(sorted).sort((a, b) => getPatternUnitPower(a[0], suit) - getPatternUnitPower(b[0], suit));
    const chainLength = pairs.length;
    return {
      ok: true,
      type: chainLength >= 4 ? "train" : "tractor",
      count: sorted.length,
      suit,
      chainLength,
      tupleSize: 2,
      power: getPatternUnitPower(pairs[pairs.length - 1][0], suit),
    };
  }
  if (isSerialTuplePlay(sorted, 3)) {
    const triples = findTriples(sorted).sort((a, b) => getPatternUnitPower(a[0], suit) - getPatternUnitPower(b[0], suit));
    return {
      ok: true,
      type: "bulldozer",
      count: sorted.length,
      suit,
      chainLength: triples.length,
      tupleSize: 3,
      power: getPatternUnitPower(triples[triples.length - 1][0], suit),
    };
  }
  const throwComponents = sorted.length > 1 ? decomposeThrowComponents(sorted) : null;
  if (throwComponents && throwComponents.length > 1) {
    return {
      ok: true,
      type: "throw",
      count: sorted.length,
      suit,
      components: throwComponents,
      power: Math.max(...throwComponents.map((component) => component.power ?? 0)),
    };
  }
  return { ok: false, type: "invalid", count: sorted.length, suit };
}

function matchesLeadPattern(pattern, leadSpec) {
  if (!pattern?.ok || !leadSpec) return false;
  if (pattern.count !== leadSpec.count) return false;
  if (pattern.type !== leadSpec.type) return false;
  if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") {
    return pattern.chainLength === leadSpec.chainLength;
  }
  return true;
}

function hasMatchingPattern(cards, leadSpec) {
  if (!leadSpec) return false;
  if (leadSpec.type === "single") return cards.length >= 1;
  if (leadSpec.type === "pair") return findPairs(cards).length > 0;
  if (leadSpec.type === "triple") return findTriples(cards).length > 0;
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "train") return findSerialTuples(cards, 2, leadSpec.chainLength).some((combo) => classifyPlay(combo).type === "train");
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "throw") return cards.length >= leadSpec.count;
  return false;
}

function getPatternCombos(cards, leadSpec) {
  if (!leadSpec) return [];
  if (leadSpec.type === "single") return cards.map((card) => [card]).sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  if (leadSpec.type === "pair") return findPairs(cards);
  if (leadSpec.type === "triple") return findTriples(cards);
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength);
  if (leadSpec.type === "train") return findSerialTuples(cards, 2, leadSpec.chainLength).filter((combo) => classifyPlay(combo).type === "train");
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength);
  if (leadSpec.type === "throw") {
    return enumerateCombinations(cards, leadSpec.count)
      .filter((combo) => isSameSuitSet(combo) && classifyPlay(combo).ok)
      .sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  }
  return [];
}

function enumerateCombinations(cards, count) {
  const results = [];
  const current = [];
  const limit = count <= 4 ? 240 : count <= 6 ? 360 : 520;

  function walk(start) {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < cards.length; i += 1) {
      current.push(cards[i]);
      walk(i + 1);
      current.pop();
      if (results.length >= limit) return;
    }
  }

  walk(0);
  return results;
}

function compareSameTypePlay(candidatePattern, currentPattern, leadSuit) {
  const candidateTrump = candidatePattern.suit === "trump";
  const currentTrump = currentPattern.suit === "trump";
  if (candidateTrump && !currentTrump) return 1;
  if (!candidateTrump && currentTrump) return -1;
  if (!candidateTrump && !currentTrump) {
    if (candidatePattern.suit === leadSuit && currentPattern.suit !== leadSuit) return 1;
    if (candidatePattern.suit !== leadSuit && currentPattern.suit === leadSuit) return -1;
  }
  return candidatePattern.power - currentPattern.power;
}

function compareComponentSize(a, b) {
  if ((a.power ?? 0) !== (b.power ?? 0)) return (a.power ?? 0) - (b.power ?? 0);
  if ((a.count ?? 0) !== (b.count ?? 0)) return (a.count ?? 0) - (b.count ?? 0);
  const typeOrder = { single: 0, pair: 1, triple: 2, tractor: 3, train: 4, bulldozer: 5 };
  return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
}

function handHasStrongerPattern(hand, targetPattern) {
  const suited = hand.filter((card) => effectiveSuit(card) === targetPattern.suit);
  const combos = getPatternCombos(suited, targetPattern);
  return combos.some((combo) => {
    const candidate = classifyPlay(combo);
    return compareSameTypePlay(candidate, targetPattern, targetPattern.suit) > 0;
  });
}

function getThrowFailure(playerId, pattern) {
  if (!pattern?.ok || pattern.type !== "throw" || state.currentTrick.length !== 0) return null;
  const vulnerableComponents = pattern.components.filter((component) =>
    state.players.some((player) =>
      player.id !== playerId && handHasStrongerPattern(player.hand, component)
    )
  );
  if (vulnerableComponents.length === 0) return null;
  const forcedComponent = [...vulnerableComponents].sort(compareComponentSize)[0];
  return {
    forcedCards: forcedComponent.cards,
    failedComponent: forcedComponent,
  };
}

function applyThrowFailurePenalty(playerId) {
  const penalty = 10;
  const player = getPlayer(playerId);
  if (!player) return penalty;
  player.roundPoints -= penalty;
  if (!isFriendTeamResolved()) {
    player.capturedPoints -= penalty;
  }
  if (isFriendTeamResolved() && isDefenderTeam(playerId)) {
    state.defenderPoints -= penalty;
  } else if (isFriendTeamResolved()) {
    state.defenderPoints += penalty;
  }
  return penalty;
}

function getThrowPenaltySummary(playerId, penalty) {
  return isDefenderTeam(playerId)
    ? TEXT.rules.throwPenaltySummaryDefender(penalty)
    : TEXT.rules.throwPenaltySummaryBanker(penalty);
}

function validateSelection(playerId, cards) {
  const player = getPlayer(playerId);
  if (!player || cards.length === 0) {
    return { ok: false, reason: TEXT.rules.validation.selectCards };
  }
  const pattern = classifyPlay(cards);

  if (state.currentTrick.length === 0) {
    if (pattern.ok) return { ok: true };
    return { ok: false, reason: TEXT.rules.validation.leadSupported };
  }

  if (cards.length !== state.leadSpec.count) {
    return { ok: false, reason: TEXT.rules.validation.followCount(state.leadSpec.count) };
  }

  const suited = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length >= state.leadSpec.count) {
    if (!cards.every((card) => effectiveSuit(card) === state.leadSpec.suit)) {
      return { ok: false, reason: TEXT.rules.validation.sameSuitFirst };
    }

    if (state.leadSpec.type === "pair") {
      if (hasForcedPair(suited) && pattern.type !== "pair") {
        return { ok: false, reason: TEXT.rules.validation.pairMustFollow };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "triple") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.tripleMustFollow };
        }
        return { ok: true };
      }

      if (hasForcedPair(suited) && getForcedPairUnits(cards) < 1) {
        return { ok: false, reason: TEXT.rules.validation.tripleFollowPair };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.trainMustFollow };
        }
        return { ok: true };
      }

      const requiredPairs = Math.min(state.leadSpec.chainLength || 0, getForcedPairUnits(suited));
      if (requiredPairs > 0 && getForcedPairUnits(cards) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.trainFollowPairs };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "bulldozer") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.bulldozerMustFollow };
        }
        return { ok: true };
      }

      const requiredTriples = Math.min(state.leadSpec.chainLength || 0, getTripleUnits(suited));
      if (requiredTriples > 0 && getTripleUnits(cards) < requiredTriples) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerTriples };
      }

      const requiredPairs = Math.min(2, getForcedPairUnitsWithReservedTriples(suited, requiredTriples));
      if (requiredPairs > 0 && getForcedPairUnitsWithReservedTriples(cards, requiredTriples) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerPairs };
      }
      return { ok: true };
    }

    if (hasMatchingPattern(suited, state.leadSpec) && !matchesLeadPattern(pattern, state.leadSpec)) {
      return { ok: false, reason: TEXT.rules.validation.samePattern };
    }
    return { ok: true };
  }

  if (suited.length > 0) {
    const suitedIds = new Set(suited.map((card) => card.id));
    const selectedSuitedCount = cards.filter((card) => suitedIds.has(card.id)).length;
    if (selectedSuitedCount !== suited.length) {
      return { ok: false, reason: TEXT.rules.validation.exhaustSuit };
    }
    return { ok: true };
  }

  return { ok: true };
}

function isExactPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank && cards[0].suit === cards[1].suit;
}

function compareSingle(candidate, current, leadSuit) {
  const candidateSuit = effectiveSuit(candidate);
  const currentSuit = effectiveSuit(current);
  const candidateTrump = candidateSuit === "trump";
  const currentTrump = currentSuit === "trump";
  if (candidateTrump && !currentTrump) return 1;
  if (!candidateTrump && currentTrump) return -1;
  if (!candidateTrump && !currentTrump) {
    if (candidateSuit === leadSuit && currentSuit !== leadSuit) return 1;
    if (candidateSuit !== leadSuit && currentSuit === leadSuit) return -1;
  }
  return getPatternUnitPower(candidate, candidateSuit) - getPatternUnitPower(current, currentSuit);
}

function isBottomPenaltyTrumpCard(card) {
  return !!card && isTrump(card) && card.suit !== "joker";
}

function getBottomPenalty() {
  if (!state.lastTrick || !isDefenderTeam(state.lastTrick.winnerId)) return null;

  const winningPlay = state.lastTrick.plays.find((play) => play.playerId === state.lastTrick.winnerId);
  if (!winningPlay || winningPlay.cards.length === 0) return null;
  if (!winningPlay.cards.every((card) => isBottomPenaltyTrumpCard(card))) return null;

  const pattern = classifyPlay(winningPlay.cards);
  if (!pattern.ok) return null;

  const penaltyByType = {
    single: { levels: 1, label: TEXT.rules.bottomPenaltyLabels.single },
    pair: { levels: 2, label: TEXT.rules.bottomPenaltyLabels.pair },
    triple: { levels: 3, label: TEXT.rules.bottomPenaltyLabels.triple },
    tractor: { levels: 4, label: TEXT.rules.bottomPenaltyLabels.tractor },
    train: { levels: 6, label: TEXT.rules.bottomPenaltyLabels.train },
    bulldozer: { levels: 6, label: TEXT.rules.bottomPenaltyLabels.bulldozer },
  };
  const penalty = penaltyByType[pattern.type];
  if (!penalty) return null;

  return {
    levels: penalty.levels,
    label: penalty.label,
    winnerId: state.lastTrick.winnerId,
    mode: "trump",
  };
}

function getBottomResultSummary() {
  if (!state.lastTrick) return null;
  const bottomPlayer = getPlayer(state.lastTrick.winnerId);
  if (!bottomPlayer) return null;
  const defenderBottom = isDefenderTeam(state.lastTrick.winnerId);
  const penalty = getBottomPenalty();
  return {
    playerId: bottomPlayer.id,
    playerName: bottomPlayer.name,
    defenderBottom,
    penalty,
    nextLeadPlayerId: bottomPlayer.id,
  };
}
