function getReadyStartMessage() {
  return "开始游戏将从2重新开始。继续游戏可继续之前的级别。";
}

function startNewProgress(autoStart = false) {
  state.playerLevels = { ...INITIAL_LEVELS };
  state.startSelection = "new";
  saveProgressToCookie();
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

function continueSavedProgress(autoStart = false) {
  const savedLevels = loadProgressFromCookie();
  if (!savedLevels) {
    state.hasSavedProgress = false;
    state.startSelection = null;
    render();
    return;
  }
  state.playerLevels = savedLevels;
  state.hasSavedProgress = true;
  state.startSelection = "continue";
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

function setupGame() {
  clearTimers();
  clearCenterAnnouncement(true);
  refreshSavedProgressAvailability();
  state.bankerId = PLAYER_ORDER.includes(state.bankerId) ? state.bankerId : 1;
  state.levelRank = null;
  state.players = PLAYER_ORDER.map((id) => ({
    id,
    name: `玩家${id}`,
    isHuman: id === 1,
    hand: [],
    played: [],
    capturedPoints: 0,
    roundPoints: 0,
    level: getPlayerLevel(id),
  }));
  state.trumpSuit = "hearts";
  state.hiddenFriendId = null;
  state.friendTarget = null;
  state.defenderPoints = 0;
  state.currentTurnId = 1;
  state.leaderId = 1;
  state.trickNumber = 1;
  state.currentTrick = [];
  state.leadSpec = null;
  state.lastTrick = null;
  state.bottomCards = [];
  state.selectedCardIds = [];
  state.countdown = 30;
  state.dealCards = [];
  state.dealIndex = 0;
  state.declaration = null;
  state.counterPasses = 0;
  state.phase = "ready";
  state.showLastTrick = false;
  state.showLogPanel = true;
  state.showDebugPanel = false;
  state.showBottomPanel = false;
  state.showRulesPanel = false;
  state.logs = [];
  state.gameOver = false;
  state.bottomRevealMessage = "";
  state.selectedFriendOccurrence = 1;
  state.selectedFriendSuit = "hearts";
  state.selectedFriendRank = "A";
  state.resultCountdownValue = 30;
  state.exposedTrumpVoid = PLAYER_ORDER.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {});
  state.exposedSuitVoid = PLAYER_ORDER.reduce((acc, id) => {
    acc[id] = { clubs: false, diamonds: false, spades: false, hearts: false };
    return acc;
  }, {});
  state.awaitingHumanDeclaration = false;
  state.selectedDebugPlayerId = PLAYER_ORDER.includes(state.selectedDebugPlayerId) && state.selectedDebugPlayerId !== 1
    ? state.selectedDebugPlayerId
    : 2;
  state.currentTurnId = state.nextFirstDealPlayerId || 1;
  state.leaderId = state.currentTurnId;
  dom.resultOverlay.classList.remove("show");
  updateResultCountdownLabel();

  const deck = createDeck();
  state.dealCards = deck.splice(0, 31 * 5);
  state.bottomCards = deck.splice(0, 7);

  appendLog(getReadyStartMessage());

  render();
}

function chooseFriendTarget() {
  const banker = getPlayer(state.bankerId);
  if (!banker) {
    return {
      target: buildFriendTarget({
        suit: "hearts",
        rank: "A",
        occurrence: 1,
      }),
      ownerId: 2,
    };
  }

  const rankPriority = getPlayerLevelRank(state.bankerId) === "A"
    ? ["K", "A", "Q", "J", "10"]
    : ["A", "K", "Q", "J", "10"];
  const suitPriority = [...SUITS.filter((suit) => suit !== state.trumpSuit), state.trumpSuit].filter(Boolean);
  const targetCandidates = [];

  for (const suit of suitPriority) {
    for (const rank of rankPriority) {
      const bankerCopies = banker.hand.filter((card) => card.suit === suit && card.rank === rank).length;
      const owners = state.players
        .filter((player) => player.id !== state.bankerId)
        .filter((player) => player.hand.some((card) => card.rank === rank && card.suit === suit));
      if (owners.length === 0) continue;
      const otherCopies = state.players
        .filter((player) => player.id !== state.bankerId)
        .reduce((sum, player) => sum + player.hand.filter((card) => card.rank === rank && card.suit === suit).length, 0);
      const maxOccurrence = Math.min(3, bankerCopies + otherCopies);
      for (let occurrence = bankerCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
        const target = { suit, rank, occurrence };
        targetCandidates.push({
          target,
          ownerId: owners[0].id,
          score: scoreFriendTargetCandidate(target, banker, owners),
        });
      }
    }
  }

  for (const rank of ["RJ", "BJ"]) {
    const bankerCopies = banker.hand.filter((card) => card.suit === "joker" && card.rank === rank).length;
    const owners = state.players
      .filter((player) => player.id !== state.bankerId)
      .filter((player) => player.hand.some((card) => card.suit === "joker" && card.rank === rank));
    if (owners.length === 0) continue;
    const otherCopies = state.players
      .filter((player) => player.id !== state.bankerId)
      .reduce((sum, player) => sum + player.hand.filter((card) => card.suit === "joker" && card.rank === rank).length, 0);
    const maxOccurrence = Math.min(3, bankerCopies + otherCopies);
    for (let occurrence = bankerCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
      const target = { suit: "joker", rank, occurrence };
      targetCandidates.push({
        target,
        ownerId: owners[0].id,
        score: scoreFriendTargetCandidate(target, banker, owners),
      });
    }
  }

  const bestCandidate = targetCandidates.sort((a, b) => b.score - a.score)[0];
  if (bestCandidate) {
    return {
      target: buildFriendTarget(bestCandidate.target),
      ownerId: bestCandidate.ownerId,
    };
  }

  return {
    target: buildFriendTarget({
      suit: "hearts",
      rank: "A",
      occurrence: 1,
    }),
    ownerId: 2,
  };
}

function scoreFriendTargetCandidate(target, banker, owners) {
  const bankerSuitCards = banker.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit));
  const bankerTargetCopies = bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = bankerSuitCards.filter((card) => card.rank !== target.rank);
  const targetPower = target.suit === "joker"
    ? (target.rank === "RJ" ? 200 : 190)
    : cardStrength({ suit: target.suit, rank: target.rank, deckIndex: 0, id: `friend-target-${target.suit}-${target.rank}` });
  const bankerReturnCards = bankerSupportCards.filter((card) => cardStrength(card) < targetPower).length;
  const ownerSupportCards = owners.flatMap((player) =>
    player.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit) && card.rank !== target.rank)
  );
  const ownerHighCards = owners.flatMap((player) =>
    player.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit) && cardStrength(card) >= targetPower)
  );
  const rankBonus = {
    A: 60,
    K: 48,
    Q: 40,
    J: 34,
    "10": 24,
    RJ: 52,
    BJ: 44,
  }[target.rank] || 0;
  const occurrenceBonus = target.occurrence === 2 ? 12 : target.occurrence === 3 ? 8 : 0;
  const suitBonus = target.suit !== "joker" && target.suit !== state.trumpSuit ? 18 : 0;
  const trumpPenalty = target.suit === state.trumpSuit ? 10 : 0;
  const jokerPenalty = target.suit === "joker" ? 14 : 0;
  const uniqueOwnerBonus = owners.length === 1 ? 10 : 3;
  const bankerOwnCopyBonus = bankerTargetCopies > 0 ? 8 : 0;
  const returnBonus = Math.min(bankerReturnCards, 3) * 7 + Math.min(ownerSupportCards.length, 3) * 5 + Math.min(ownerHighCards.length, 2) * 4;
  const supportPenalty = bankerSupportCards.length === 0 ? 18 : 0;
  const voidSetupBonus = target.suit !== "joker" && bankerTargetCopies > 0 && bankerSupportCards.length <= 1
    ? 24
    : target.suit !== "joker" && bankerSupportCards.length === 0
      ? 14
      : 0;
  const returnRouteBonus = target.suit !== "joker" && bankerSupportCards.length <= 1
    ? Math.min(ownerSupportCards.length, 3) * 6 + Math.min(ownerHighCards.length, 2) * 5
    : 0;
  return rankBonus + occurrenceBonus + suitBonus + uniqueOwnerBonus + bankerOwnCopyBonus + returnBonus + voidSetupBonus + returnRouteBonus - trumpPenalty - jokerPenalty - supportPenalty;
}

function buildFriendTarget(target) {
  return {
    ...target,
    label: describeTarget(target),
    img: target.suit === "joker"
      ? getJokerImage(target.rank)
      : getCardImage(target.suit, target.rank),
  };
}

function getFriendSearchOrder(fromId = state.bankerId) {
  const order = [];
  let currentId = getNextPlayerId(fromId);
  while (currentId !== fromId) {
    order.push(currentId);
    currentId = getNextPlayerId(currentId);
  }
  return order;
}

function resolveFriendOwnerId(target, bankerId = state.bankerId) {
  for (const playerId of getFriendSearchOrder(bankerId)) {
    const player = getPlayer(playerId);
    if (!player) continue;
    if (player.hand.some((card) => card.rank === target.rank && card.suit === target.suit)) {
      return playerId;
    }
  }
  return null;
}

function setFriendTarget(target) {
  state.friendTarget = {
    ...buildFriendTarget(target),
    occurrence: target.occurrence ?? 1,
    matchesSeen: 0,
    failed: false,
    revealed: false,
    revealedBy: null,
  };
  state.hiddenFriendId = null;
}

function getDefaultFriendSelection() {
  const suggested = chooseFriendTarget().target;
  return {
    occurrence: suggested.occurrence || 1,
    suit: suggested.suit,
    rank: suggested.rank,
  };
}

function startCallingFriendPhase() {
  clearTimers();
  const banker = getPlayer(state.bankerId);
  const defaults = getDefaultFriendSelection();
  state.selectedFriendOccurrence = defaults.occurrence;
  state.selectedFriendSuit = defaults.suit;
  state.selectedFriendRank = defaults.rank;
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.phase = "callingFriend";
  appendLog(TEXT.log.startCallingFriend(banker.name));
  render();

  if (banker.isHuman) return;

  state.aiTimer = window.setTimeout(() => {
    confirmFriendTargetSelection(defaults);
  }, 900);
}

function confirmFriendTargetSelection(selection = {
  occurrence: state.selectedFriendOccurrence,
  suit: state.selectedFriendSuit,
  rank: state.selectedFriendRank,
}) {
  if (state.phase !== "callingFriend") return;
  if (!selection?.suit || !selection?.rank) return;
  setFriendTarget(selection);
  appendLog(TEXT.log.friendCalled(state.friendTarget.label));
  enterPlayingPhase();
}

function enterPlayingPhase() {
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.phase = "playing";
  appendLog(TEXT.log.enterPlaying(getPlayer(state.bankerId).name));
  render();
  startTurn();
}

function startDealing() {
  clearTimers();
  if (state.gameOver || state.phase !== "ready") return;
  state.phase = "dealing";
  state.awaitingHumanDeclaration = false;
  appendLog(TEXT.log.startDealing);
  render();
  queueDealStep(140);
}

function queueDealStep(delay = 90) {
  if (state.dealTimer) {
    window.clearTimeout(state.dealTimer);
  }
  state.dealTimer = window.setTimeout(() => {
    state.dealTimer = null;
    dealOneCard();
  }, delay);
}

function dealOneCard() {
  if (state.gameOver || state.phase !== "dealing") return;

  if (state.dealIndex >= state.dealCards.length) {
    finishDealingPhase();
    return;
  }

  const startIndex = PLAYER_ORDER.indexOf(state.nextFirstDealPlayerId || 1);
  const playerId = PLAYER_ORDER[(Math.max(0, startIndex) + state.dealIndex) % PLAYER_ORDER.length];
  const player = getPlayer(playerId);
  const card = state.dealCards[state.dealIndex];
  state.dealIndex += 1;
  player.hand.push(card);

  maybeAutoDeclare(playerId);
  render();

  if (state.dealIndex >= state.dealCards.length) {
    queueDealStep(220);
    return;
  }
  queueDealStep();
}

function getBottomRevealWeight(card) {
  if (card.rank === "RJ") return 100;
  if (card.rank === "BJ") return 99;
  return RANK_WEIGHT[card.rank] || 0;
}

function resolveBottomDeclarationForPlayer(playerId) {
  const playerLevel = getPlayerLevelRank(playerId);
  let highestCard = null;

  for (const card of state.bottomCards) {
    if (card.rank === playerLevel && card.suit !== "joker") {
      return {
        playerId,
        suit: card.suit,
        rank: playerLevel,
        count: 0,
        cards: [],
        source: "bottom",
        revealCard: card,
      };
    }

    if (!highestCard || getBottomRevealWeight(card) > getBottomRevealWeight(highestCard)) {
      highestCard = card;
    }
  }

  if (!highestCard) {
    return {
      playerId,
      suit: "notrump",
      rank: playerLevel,
      count: 0,
      cards: [],
      source: "bottom",
      revealCard: null,
    };
  }

  return {
    playerId,
    suit: highestCard.suit === "joker" ? "notrump" : highestCard.suit,
    rank: playerLevel,
    count: 0,
    cards: [],
    source: "bottom",
    revealCard: highestCard,
  };
}

function finishDealingPhase() {
  if (state.phase !== "dealing") return;

  if (!state.declaration) {
    const humanDeclaration = getBestDeclarationForPlayer(1);
    if (humanDeclaration && !state.awaitingHumanDeclaration) {
      startAwaitingHumanDeclaration();
      return;
    }
    state.awaitingHumanDeclaration = false;
    const firstDealPlayerId = state.nextFirstDealPlayerId || 1;
    const bottomDeclaration = resolveBottomDeclarationForPlayer(firstDealPlayerId);
    state.declaration = bottomDeclaration;
    state.trumpSuit = bottomDeclaration.suit;
    state.bankerId = firstDealPlayerId;
    state.levelRank = getPlayerLevelRank(firstDealPlayerId);
    if (bottomDeclaration.suit === "notrump") {
      state.bottomRevealMessage = `无人亮主，由先抓牌的${getPlayer(firstDealPlayerId).name}翻底定主。底牌翻到${bottomDeclaration.revealCard ? describeCard(bottomDeclaration.revealCard) : TEXT.cards.bigJoker}，本局定为无主，王和级牌都算主，${getPlayer(firstDealPlayerId).name}做打家。`;
    } else if (bottomDeclaration.revealCard?.rank === state.levelRank) {
      state.bottomRevealMessage = `无人亮主，由先抓牌的${getPlayer(firstDealPlayerId).name}翻底定主。底牌翻到级牌${describeCard(bottomDeclaration.revealCard)}，定${SUIT_LABEL[bottomDeclaration.suit]}为主，${getPlayer(firstDealPlayerId).name}做打家。`;
    } else {
      state.bottomRevealMessage = `无人亮主，由先抓牌的${getPlayer(firstDealPlayerId).name}翻底定主。底牌未翻到级牌，按最大首见牌${describeCard(bottomDeclaration.revealCard)}定${SUIT_LABEL[bottomDeclaration.suit]}为主，${getPlayer(firstDealPlayerId).name}做打家。`;
    }
    appendLog(state.bottomRevealMessage);
    startBottomRevealPhase();
    return;
  }

  state.trumpSuit = state.declaration.suit;
  state.bankerId = state.declaration.playerId;
  state.phase = "countering";
  state.counterPasses = 0;
  state.currentTurnId = getNextCounterPlayerId(state.declaration.playerId);

  appendLog(TEXT.log.counterPhaseStart(getPlayer(state.bankerId).name, formatDeclaration(state.declaration)));
  appendLog(TEXT.log.counterPhaseIntro);
  render();
  startCounterTurn();
}

function startAwaitingHumanDeclaration() {
  clearTimers();
  state.awaitingHumanDeclaration = true;
  state.countdown = 15;
  appendLog(TEXT.log.awaitingHumanDeclaration);
  render();
  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    renderCenterPanel();
    if (state.countdown <= 0) {
      clearTimers();
      finishDealingPhase();
    }
  }, 1000);
}

function startBottomRevealPhase() {
  clearTimers();
  state.phase = "bottomReveal";
  state.showBottomPanel = true;
  state.countdown = 30;
  queueCenterAnnouncement(TEXT.log.bottomRevealAnnouncement(getPlayer(state.bankerId).name), "friend");
  render();
  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    renderBottomRevealCenter();
    if (state.countdown <= 0) {
      finishBottomRevealPhase();
    }
  }, 1000);
}

function finishBottomRevealPhase() {
  if (state.phase !== "bottomReveal") return;
  clearTimers();
  startBuryingPhase();
}

function getDeclarationOptions(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  const playerLevel = getPlayerLevelRank(playerId);
  const suitOptions = SUITS.map((suit) => {
    const cards = player.hand.filter((card) => card.suit === suit && card.rank === playerLevel);
    return {
      playerId,
      suit,
      rank: playerLevel,
      count: cards.length,
      cards,
    };
  })
    .filter((entry) => entry.count === 2 || entry.count === 3);

  const jokerOptions = ["BJ", "RJ"].flatMap((rank) => {
    const cards = player.hand.filter((card) => card.suit === "joker" && card.rank === rank);
    const options = [];
    if (cards.length >= 2) {
      options.push({
        playerId,
        suit: "notrump",
        rank: playerLevel,
        count: 2,
        cards: cards.slice(0, 2),
      });
    }
    if (cards.length >= 3) {
      options.push({
        playerId,
        suit: "notrump",
        rank: playerLevel,
        count: 3,
        cards: cards.slice(0, 3),
      });
    }
    return options;
  });

  return [...suitOptions, ...jokerOptions].sort((a, b) => getDeclarationPriority(b) - getDeclarationPriority(a));
}

function getBestDeclarationForPlayer(playerId) {
  return getDeclarationOptions(playerId)[0] || null;
}

function getDeclarationPriority(entry) {
  if (!entry || (entry.count !== 2 && entry.count !== 3)) return -1;
  const base = entry.count === 2 ? 20 : 30;
  if (entry.suit !== "notrump") return base;
  const jokerRank = entry.cards?.[0]?.rank;
  if (jokerRank === "BJ") return base + 1;
  if (jokerRank === "RJ") return base + 2;
  return base;
}

function canOverrideDeclaration(candidate, current = state.declaration) {
  if (!candidate) return false;
  if (!current) return true;
  if (candidate.playerId === current.playerId) return false;
  return getDeclarationPriority(candidate) > getDeclarationPriority(current);
}

function getDeclarationCards(entry = state.declaration) {
  if (!entry) return [];
  const player = getPlayer(entry.playerId);
  if (!player) return [];
  if (entry.suit === "notrump") {
    if (entry.cards?.length) {
      const wantedIds = new Set(entry.cards.map((card) => card.id));
      return player.hand.filter((card) => wantedIds.has(card.id)).slice(0, entry.count);
    }
    return [...player.hand]
      .filter((card) => card.suit === "joker")
      .sort((a, b) => cardStrength(b) - cardStrength(a))
      .slice(0, entry.count);
  }
  return player.hand
    .filter((card) => card.suit === entry.suit && card.rank === entry.rank)
    .slice(0, entry.count);
}

function declareTrump(playerId, declaration, source = "manual") {
  if (!declaration || !canOverrideDeclaration(declaration)) return false;

  const player = getPlayer(playerId);
  const previous = state.declaration;
  const declarationLevelRank = declaration.suit === "notrump"
    ? getPlayerLevelRank(playerId)
    : declaration.rank;
  state.awaitingHumanDeclaration = false;
  state.declaration = {
    playerId,
    suit: declaration.suit,
    rank: declarationLevelRank,
    count: declaration.count,
    cards: getDeclarationCards(declaration),
  };
  state.levelRank = declarationLevelRank;
  state.trumpSuit = declaration.suit;
  state.bankerId = playerId;

  if (!previous) {
    appendLog(TEXT.log.declare(player.name, formatDeclaration(state.declaration)));
  } else {
    appendLog(TEXT.log.redeclare(player.name, formatDeclaration(state.declaration)));
  }

  render();
  return true;
}

function maybeAutoDeclare(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.isHuman) return;
  const best = getBestDeclarationForPlayer(playerId);
  if (!best || !canOverrideDeclaration(best)) return;

  const willing = best.count >= 3 || Math.random() < 0.65;
  if (!willing) return;
  declareTrump(playerId, best, "auto");
}

function getNoTrumpCounterOption(playerId) {
  return getDeclarationOptions(playerId).find((entry) => entry.suit === "notrump") || null;
}

function getCounterDeclarationForPlayer(playerId) {
  const current = state.declaration;
  if (!current) return null;
  return getDeclarationOptions(playerId)
    .filter((entry) => canOverrideDeclaration(entry, current))
    .sort((a, b) => getDeclarationPriority(b) - getDeclarationPriority(a))[0] || null;
}

function getNextCounterPlayerId(fromId) {
  let nextId = getNextPlayerId(fromId);
  while (nextId === state.declaration?.playerId) {
    nextId = getNextPlayerId(nextId);
  }
  return nextId;
}

function startCounterTurn() {
  clearTimers();
  if (state.gameOver || state.phase !== "countering") return;

  const player = getPlayer(state.currentTurnId);
  const option = getCounterDeclarationForPlayer(state.currentTurnId);
  if (!option) {
    state.countdown = 0;
    state.aiTimer = window.setTimeout(() => {
      passCounterForCurrentPlayer();
    }, 450);
    render();
    return;
  }

  state.countdown = 30;
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      passCounterForCurrentPlayer(true);
    }
  }, 1000);

  if (!player || player.isHuman) return;

  state.aiTimer = window.setTimeout(() => {
    if (option && (option.suit === "notrump" || option.count >= 3 || Math.random() < 0.72)) {
      counterDeclare(player.id, option);
      return;
    }
    passCounterForCurrentPlayer();
  }, 1000 + Math.random() * 900);
}

function counterDeclare(playerId, declaration) {
  if (state.phase !== "countering" || playerId !== state.currentTurnId) return;
  if (!declaration || !canOverrideDeclaration(declaration)) return;
  clearTimers();
  declareTrump(playerId, declaration, "counter");
  state.counterPasses = 0;
  appendLog(TEXT.log.counterDeclared(getPlayer(playerId).name, playerId === 1));
  state.currentTurnId = getNextCounterPlayerId(playerId);
  render();
  startCounterTurn();
}

function passCounterForCurrentPlayer(isTimeout = false) {
  if (state.phase !== "countering") return;
  const player = getPlayer(state.currentTurnId);
  clearTimers();
  state.counterPasses += 1;
  appendLog(TEXT.log.counterPass(player.name, isTimeout));
  if (state.counterPasses >= PLAYER_ORDER.length - 1) {
    appendLog(TEXT.log.counterEnd);
    startBuryingPhase();
    return;
  }
  state.currentTurnId = getNextCounterPlayerId(state.currentTurnId);
  render();
  startCounterTurn();
}

function getBuryHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  if (state.aiDifficulty === "intermediate") {
    const suitCounts = SUITS.reduce((acc, suit) => {
      acc[suit] = player.hand.filter((card) => !isTrump(card) && card.suit === suit).length;
      return acc;
    }, {});
    const reserveSuitEntry = SUITS
      .map((suit) => {
        const cards = player.hand
          .filter((card) => !isTrump(card) && card.suit === suit)
          .sort((a, b) => cardStrength(b) - cardStrength(a));
        const highest = cards[0] || null;
        return {
          suit,
          count: cards.length,
          highest,
          strength: highest ? cardStrength(highest) + scoreValue(highest) * 8 : -1,
        };
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => {
        if (a.count !== b.count) return a.count - b.count;
        return b.strength - a.strength;
      })[0] || null;
    const reserveSuit = reserveSuitEntry?.suit || null;
    const reserveCardId = reserveSuitEntry?.highest?.id || null;

    return [...player.hand]
      .sort((a, b) => {
        const getScore = (card) => {
          let score = (isTrump(card) ? 1000 : 0) + scoreValue(card) * 50 + cardStrength(card);
          if (!isTrump(card)) {
            score += suitCounts[card.suit] * 14;
            if (card.suit === reserveSuit) {
              score -= 110;
              if (card.id === reserveCardId) score += 260;
            } else {
              score += Math.max(0, suitCounts[card.suit] - 2) * 12;
            }
          }
          return score;
        };
        return getScore(a) - getScore(b);
      })
      .slice(0, 7);
  }
  return [...player.hand]
    .sort((a, b) => {
      const aScore = (isTrump(a) ? 1000 : 0) + scoreValue(a) * 50 + cardStrength(a);
      const bScore = (isTrump(b) ? 1000 : 0) + scoreValue(b) * 50 + cardStrength(b);
      return aScore - bScore;
    })
    .slice(0, 7);
}

function completeBurying(playerId, cardIds) {
  if (state.phase !== "burying" || playerId !== state.bankerId) return;
  const player = getPlayer(playerId);
  const cards = cardIds
    .map((id) => player.hand.find((card) => card.id === id))
    .filter(Boolean);
  if (cards.length !== 7) return;

  for (const cardId of cardIds) {
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      player.hand.splice(index, 1);
    }
  }
  player.hand = sortHand(player.hand);
  state.bottomCards = sortHand(cards);
  state.selectedCardIds = [];
  state.showBottomPanel = false;
  appendLog(TEXT.log.buryComplete(player.name));
  beginPlayingPhase();
}

function startBuryingPhase() {
  clearTimers();
  const banker = getPlayer(state.bankerId);
  banker.hand.push(...state.bottomCards);
  banker.hand = sortHand(banker.hand);
  state.selectedCardIds = [];
  state.showBottomPanel = false;
  state.phase = "burying";
  state.countdown = 60;

  appendLog(TEXT.log.takeBottom(banker.name));
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      const buryCards = getBuryHintForPlayer(banker.id);
      completeBurying(banker.id, buryCards.map((card) => card.id));
    }
  }, 1000);

  if (banker.isHuman) return;

  state.aiTimer = window.setTimeout(() => {
    const buryCards = getBuryHintForPlayer(banker.id);
    completeBurying(banker.id, buryCards.map((card) => card.id));
  }, 1200);
}

function beginPlayingPhase() {
  for (const player of state.players) {
    player.hand = sortHand(player.hand);
  }

  state.counterPasses = 0;
  state.trumpSuit = state.declaration ? state.declaration.suit : state.trumpSuit;
  state.bankerId = state.declaration ? state.declaration.playerId : state.bankerId;
  state.friendTarget = null;
  state.hiddenFriendId = null;
  startCallingFriendPhase();
}

function getPlayer(id) {
  return state.players.find((player) => player.id === id);
}

function getNextPlayerId(id) {
  return (id % 5) + 1;
}

function getPreviousPlayerId(id) {
  return id === PLAYER_ORDER[0] ? PLAYER_ORDER[PLAYER_ORDER.length - 1] : id - 1;
}

function getVisibleDefenderPoints() {
  if (!isFriendTeamResolved()) {
    return null;
  }
  return state.defenderPoints;
}

function isFriendTeamResolved() {
  return !!state.friendTarget && (state.friendTarget.revealed || state.friendTarget.failed);
}

function recalcDefenderPoints() {
  return state.players.reduce((sum, player) => {
    if (!isDefenderTeam(player.id)) return sum;
    return sum + (player.roundPoints || 0);
  }, 0);
}

function canHumanViewBottomCards() {
  if (state.gameOver) return true;
  if (state.phase === "bottomReveal") return true;
  return state.bankerId === 1 && (state.phase === "burying" || state.phase === "callingFriend" || state.phase === "playing" || state.phase === "pause");
}

function shouldShowHumanBottomButton() {
  return state.bankerId === 1 && canHumanViewBottomCards() && !state.gameOver && state.phase !== "bottomReveal";
}

function startTurn() {
  clearTimers();
  if (state.gameOver) return;

  state.countdown = 15;
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      autoPlayCurrentTurn();
    }
  }, 1000);

  const player = getPlayer(state.currentTurnId);
  if (!player.isHuman) {
    state.aiTimer = window.setTimeout(() => {
      autoPlayCurrentTurn();
    }, 900 + Math.random() * 700);
  }
}

function clearTimers() {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
  if (state.aiTimer) {
    window.clearTimeout(state.aiTimer);
    state.aiTimer = null;
  }
  if (state.dealTimer) {
    window.clearTimeout(state.dealTimer);
    state.dealTimer = null;
  }
  if (state.trickPauseTimer) {
    window.clearTimeout(state.trickPauseTimer);
    state.trickPauseTimer = null;
  }
  if (state.resultCountdownTimer) {
    window.clearInterval(state.resultCountdownTimer);
    state.resultCountdownTimer = null;
  }
}

function goToMainMenu() {
  dom.resultOverlay.classList.remove("show");
  state.startSelection = null;
  setupGame();
}

function beginNextGame(autoStart = false) {
  dom.resultOverlay.classList.remove("show");
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

function startResultCountdown() {
  state.resultCountdownValue = 30;
  updateResultCountdownLabel();
  if (state.resultCountdownTimer) {
    window.clearInterval(state.resultCountdownTimer);
  }
  state.resultCountdownTimer = window.setInterval(() => {
    state.resultCountdownValue -= 1;
    if (state.resultCountdownValue <= 0) {
      state.resultCountdownValue = 0;
      updateResultCountdownLabel();
      window.clearInterval(state.resultCountdownTimer);
      state.resultCountdownTimer = null;
      beginNextGame(true);
      return;
    }
    updateResultCountdownLabel();
  }, 1000);
}

function clearCenterAnnouncement(resetQueue = false) {
  if (state.centerAnnouncementTimer) {
    window.clearTimeout(state.centerAnnouncementTimer);
    state.centerAnnouncementTimer = null;
  }
  state.centerAnnouncement = null;
  if (resetQueue) {
    state.centerAnnouncementQueue = [];
  }
}

function queueCenterAnnouncement(message, tone = "default") {
  if (!message) return;
  state.centerAnnouncementQueue.push({ message, tone });
  if (state.centerAnnouncement) return;
  showNextCenterAnnouncement();
}

function showNextCenterAnnouncement() {
  if (state.centerAnnouncementQueue.length === 0) {
    clearCenterAnnouncement();
    renderCenterPanel();
    return;
  }
  const next = state.centerAnnouncementQueue.shift();
  state.centerAnnouncement = next;
  renderCenterPanel();
  state.centerAnnouncementTimer = window.setTimeout(() => {
    state.centerAnnouncementTimer = null;
    state.centerAnnouncement = null;
    renderCenterPanel();
    if (state.centerAnnouncementQueue.length > 0) {
      showNextCenterAnnouncement();
    }
  }, 3000);
}

function isVisibleAllyOfHuman(playerId) {
  if (playerId === 1) return true;
  if (!state.friendTarget?.revealed) return false;
  const humanOnBankerTeam = state.bankerId === 1 || state.friendTarget.revealedBy === 1;
  if (humanOnBankerTeam) {
    return playerId === state.bankerId || playerId === state.friendTarget.revealedBy;
  }
  return isDefenderTeam(playerId);
}

function areSameSide(playerA, playerB) {
  if (playerA === playerB) return true;
  if (!isFriendTeamResolved()) {
    return playerA === state.bankerId && playerB === state.bankerId;
  }
  return isDefenderTeam(playerA) === isDefenderTeam(playerB);
}

function playCards(playerId, cardIds, options = {}) {
  const player = getPlayer(playerId);
  if (!player || state.gameOver) return false;

  let cards = cardIds.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean);
  let pattern = classifyPlay(cards);
  const throwFailure = getThrowFailure(playerId, pattern);
  if (throwFailure) {
    cards = throwFailure.forcedCards;
    pattern = classifyPlay(cards);
  }
  const currentWinningPlay = state.currentTrick.length > 0 ? getCurrentWinningPlay() : null;
  const beatPlay = !!currentWinningPlay && doesSelectionBeatCurrent(playerId, cards);
  const beatAnnouncementKey = beatPlay ? getBeatAnnouncementKey(currentWinningPlay) : null;
  const validation = validateSelection(playerId, cards);
  if (!validation.ok) {
    if (player.isHuman) {
      dom.actionHint.textContent = validation.reason;
    }
    return false;
  }

  clearTimers();
  state.selectedCardIds = [];
  const resolvedCardIds = cards.map((card) => card.id);

  for (const cardId of resolvedCardIds) {
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      player.hand.splice(index, 1);
    }
  }
  player.hand = sortHand(player.hand);

  const playedCards = sortPlayedCards(cards);
  const exposedTrumpVoid = state.currentTrick.length > 0
    && state.leadSpec?.suit === "trump"
    && playedCards.some((card) => effectiveSuit(card) !== "trump")
    && !player.hand.some((card) => isTrump(card));
  if (exposedTrumpVoid) {
    state.exposedTrumpVoid[playerId] = true;
  }
  const exposedLeadSuitVoid = state.currentTrick.length > 0
    && state.leadSpec?.suit
    && state.leadSpec.suit !== "trump"
    && playedCards.some((card) => effectiveSuit(card) !== state.leadSpec.suit)
    && !player.hand.some((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (exposedLeadSuitVoid && state.exposedSuitVoid[playerId]) {
    state.exposedSuitVoid[playerId][state.leadSpec.suit] = true;
  }
  state.currentTrick.push({ playerId, cards: playedCards });
  player.played = playedCards;
  let leadTrumpAnnouncement = false;

  if (state.currentTrick.length === 1) {
    const leadPattern = pattern;
    state.leadSpec = { ...leadPattern, leaderId: playerId };
    if (leadPattern.suit === "trump") {
      leadTrumpAnnouncement = true;
    }
  }

  const friendProgressAnnouncement = getFriendProgressAnnouncement(playerId, playedCards);
  const friendReveal = maybeRevealFriend(playerId, playedCards);
  if (throwFailure) {
    const penalty = applyThrowFailurePenalty(playerId);
    appendLog(TEXT.log.throwFailure(player.name, playedCards.map(shortCardLabel), penalty, getThrowPenaltySummary(playerId, penalty)));
    queueCenterAnnouncement(TEXT.log.throwFailureAnnouncement(player.name, penalty), "strong");
  } else {
    appendLog(TEXT.log.play(player.name, playedCards.map(shortCardLabel)));
  }
  if (friendReveal?.message) {
    queueCenterAnnouncement(friendReveal.message, friendReveal.tone || "default");
  } else if (friendProgressAnnouncement?.message) {
    queueCenterAnnouncement(friendProgressAnnouncement.message, friendProgressAnnouncement.tone || "default");
  }
  if (beatAnnouncementKey) {
    queueCenterAnnouncement(TEXT.log[beatAnnouncementKey](player.name), "strong");
  }
  const playAnnouncement = throwFailure || (pattern.type === "throw" && state.currentTrick.length > 1)
    ? ""
    : getPlayAnnouncement(playerId, pattern, { leadTrump: leadTrumpAnnouncement });
  if (playAnnouncement) {
    queueCenterAnnouncement(playAnnouncement, leadTrumpAnnouncement && isVisibleAllyOfHuman(playerId) ? "ally" : "default");
  }

  if (state.currentTrick.length === 5) {
    resolveTrick(options);
    return true;
  }

  state.currentTurnId = getNextPlayerId(playerId);
  render();
  if (!options.skipStartTurn) {
    startTurn();
  }
  return true;
}

function sortPlayedCards(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b));
}

function maybeRevealFriend(playerId, cards) {
  if (!state.friendTarget) return null;
  if (state.friendTarget.revealed || state.friendTarget.failed) return null;
  const matchedCards = cards.filter(
    (card) => card.rank === state.friendTarget.rank && card.suit === state.friendTarget.suit
  );
  if (matchedCards.length === 0) return null;

  for (const _card of matchedCards) {
    const nextOccurrence = (state.friendTarget.matchesSeen || 0) + 1;
    state.friendTarget.matchesSeen = nextOccurrence;

    if (nextOccurrence === state.friendTarget.occurrence) {
      if (playerId === state.bankerId) {
        state.friendTarget.failed = true;
        state.hiddenFriendId = null;
        state.defenderPoints = recalcDefenderPoints();
        for (const seatPlayer of state.players) {
          seatPlayer.capturedPoints = 0;
        }
        appendLog(TEXT.log.friendMisplayed(getPlayer(playerId).name, describeTarget(state.friendTarget)));
        return {
          message: `${getPlayer(playerId).name} 误出朋友牌 · 1打4`,
          tone: "strong",
        };
      }
      state.friendTarget.revealed = true;
      state.friendTarget.revealedBy = playerId;
      state.hiddenFriendId = playerId;
      state.defenderPoints = recalcDefenderPoints();
      for (const seatPlayer of state.players) {
        seatPlayer.capturedPoints = 0;
        }
      appendLog(TEXT.log.friendRevealed(getPlayer(playerId).name, describeTarget(state.friendTarget)));
      appendLog(TEXT.log.teamsRevealed(state.defenderPoints));
      return {
        message: `${getPlayer(playerId).name} 站队了`,
        tone: "friend",
      };
    }
  }
  return null;
}

function resolveTrick(options = {}) {
  const winnerId = pickTrickWinner();
  const winner = getPlayer(winnerId);
  const trickPoints = state.currentTrick.reduce(
    (sum, play) => sum + play.cards.reduce((cardSum, card) => cardSum + scoreValue(card), 0),
    0
  );

  winner.roundPoints += trickPoints;
  if (!isFriendTeamResolved()) {
    winner.capturedPoints += trickPoints;
  }
  if (isFriendTeamResolved() && isDefenderTeam(winnerId)) {
    state.defenderPoints += trickPoints;
  }

  state.lastTrick = {
    plays: state.currentTrick.map((play) => ({ ...play })),
    winnerId,
    points: trickPoints,
    trickNumber: state.trickNumber,
  };

  appendLog(TEXT.log.trickWon(getPlayer(winnerId).name, state.trickNumber, trickPoints));
  queueCenterAnnouncement(
    getTrickOutcomeAnnouncement(winnerId),
    isVisibleAllyOfHuman(winnerId) ? "ally" : "strong"
  );

  const everyoneEmpty = state.players.every((player) => player.hand.length === 0);
  if (everyoneEmpty) {
    const defenderWinningFinal = isFriendTeamResolved() ? isDefenderTeam(winnerId) : winnerId !== state.bankerId;
    if (defenderWinningFinal) {
      const bottomBasePoints = Math.min(
        state.bottomCards.reduce((sum, card) => sum + scoreValue(card), 0),
        25
      );
      const bottomPoints = bottomBasePoints * 2;
      if (bottomPoints > 0) {
        winner.roundPoints += bottomPoints;
        if (!isFriendTeamResolved()) {
          winner.capturedPoints += bottomPoints;
        }
        if (isFriendTeamResolved()) {
          state.defenderPoints += bottomPoints;
        }
        appendLog(TEXT.log.finalBottomScore(bottomPoints));
      }
      const bottomPenalty = getBottomPenalty();
      if (bottomPenalty) {
        appendLog(TEXT.log.finalBottomPenalty(bottomPenalty.label, bottomPenalty.levels));
      }
    }
    state.phase = "ending";
    state.currentTurnId = winnerId;
    render();
    if (options.skipResolveDelay) {
      finishGame();
    } else {
      state.trickPauseTimer = window.setTimeout(() => {
        state.trickPauseTimer = null;
        finishGame();
      }, 1800);
    }
    return;
  }

  state.phase = "pause";
  state.currentTurnId = winnerId;
  render();

  const advanceToNextTrick = () => {
    state.currentTrick = [];
    state.leadSpec = null;
    for (const player of state.players) {
      player.played = [];
    }
    state.trickNumber += 1;
    state.phase = "playing";
    render();
    startTurn();
  };

  if (options.skipResolveDelay) {
    advanceToNextTrick();
  } else {
    state.trickPauseTimer = window.setTimeout(() => {
      state.trickPauseTimer = null;
      advanceToNextTrick();
    }, 2400);
  }
}

function pickTrickWinner() {
  if (!state.leadSpec) return state.leaderId;
  if (state.leadSpec.type === "single") {
    let winner = state.currentTrick[0];
    for (const play of state.currentTrick.slice(1)) {
      if (compareSingle(play.cards[0], winner.cards[0], state.leadSpec.suit) > 0) {
        winner = play;
      }
    }
    return winner.playerId;
  }

  let best = state.currentTrick[0];
  let bestPattern = classifyPlay(best.cards);
  for (const play of state.currentTrick.slice(1)) {
    const pattern = classifyPlay(play.cards);
    if (!matchesLeadPattern(pattern, state.leadSpec)) continue;
    if (compareSameTypePlay(pattern, bestPattern, state.leadSpec.suit) > 0) {
      best = play;
      bestPattern = pattern;
    }
  }
  return best.playerId;
}

function getCurrentWinningPlay() {
  if (state.currentTrick.length === 0) return null;
  const winnerId = pickTrickWinner();
  return state.currentTrick.find((play) => play.playerId === winnerId) || null;
}

function getBeatHintForPlayer(playerId) {
  if (!state.leadSpec || state.currentTrick.length === 0) return [];
  const player = getPlayer(playerId);
  if (!player) return [];

  const suited = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length > 0) return [];

  const trumpCards = player.hand.filter((card) => effectiveSuit(card) === "trump");
  if (trumpCards.length < state.leadSpec.count) return [];

  const currentWinningPlay = getCurrentWinningPlay();
  if (!currentWinningPlay) return [];
  const currentPattern = classifyPlay(currentWinningPlay.cards);

  const combos = getPatternCombos(trumpCards, state.leadSpec);

  const beatingCombo = combos.find((combo) => {
    const pattern = classifyPlay(combo);
    return compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) > 0;
  });

  return beatingCombo || [];
}

function doesSelectionBeatCurrent(playerId, cards) {
  if (!state.leadSpec || state.currentTrick.length === 0 || cards.length === 0) return false;
  const player = getPlayer(playerId);
  if (!player) return false;
  const hand = player.hand;
  const suited = hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length > 0) return false;

  const pattern = classifyPlay(cards);
  if (!matchesLeadPattern(pattern, state.leadSpec)) return false;

  const currentWinningPlay = getCurrentWinningPlay();
  if (!currentWinningPlay) return false;
  const currentPattern = classifyPlay(currentWinningPlay.cards);
  return compareSameTypePlay(pattern, currentPattern, state.leadSpec.suit) > 0;
}

function getBeatAnnouncementKey(currentWinningPlay = getCurrentWinningPlay()) {
  if (!state.leadSpec || !currentWinningPlay) return null;
  return currentWinningPlay.playerId === state.leadSpec.leaderId ? "beatAnnouncement" : "coverBeatAnnouncement";
}

function isDefenderTeam(playerId) {
  if (playerId === state.bankerId) return false;
  if (state.friendTarget?.failed) return true;
  if (!state.friendTarget?.revealed) return false;
  return playerId !== state.hiddenFriendId;
}

function didHumanSideWin(outcome) {
  const humanOnBankerTeam = state.bankerId === 1
    || (state.friendTarget?.revealed && state.friendTarget.revealedBy === 1);
  return humanOnBankerTeam ? outcome.winner === "banker" : outcome.winner === "defender";
}

function finishGame() {
  state.gameOver = true;
  clearTimers();
  if (state.friendTarget && !isFriendTeamResolved()) {
    state.friendTarget.failed = true;
    state.hiddenFriendId = null;
    state.defenderPoints = recalcDefenderPoints();
    appendLog(TEXT.log.unrevealedFriendFinish);
  }
  const bottomResult = getBottomResultSummary();
  state.nextFirstDealPlayerId = bottomResult?.nextLeadPlayerId || state.bankerId;
  const outcome = getOutcome(state.defenderPoints, { bottomPenalty: bottomResult?.penalty || null });
  const humanWon = didHumanSideWin(outcome);
  applyLevelSettlement(outcome, bottomResult?.penalty || null);
  dom.resultCard.classList.toggle("win", humanWon);
  dom.resultCard.classList.toggle("loss", !humanWon);
  dom.resultTitle.textContent = humanWon ? TEXT.outcome.winTitle : TEXT.outcome.lossTitle;
  dom.resultBody.textContent = `${outcome.body}${getBottomResultText(bottomResult)}${getLevelSettlementSummary(outcome)}`;
  dom.resultOverlay.classList.add("show");
  startResultCountdown();
  render();
}

function getBankerTeamIds() {
  if (state.friendTarget?.failed) return [state.bankerId];
  return [...new Set([state.bankerId, state.hiddenFriendId].filter(Boolean))];
}

function getDefenderIds() {
  return state.players
    .map((player) => player.id)
    .filter((playerId) => isDefenderTeam(playerId));
}

function canPlayerUpgradeWithOutcome(playerId, outcome) {
  const level = getPlayerLevel(playerId);
  if (!MANDATORY_LEVELS.has(level)) return true;
  return outcome.winner === "banker" && playerId === state.bankerId;
}

function applyLevelSettlement(outcome, bankerPenalty = null) {
  if (outcome.bankerLevels > 0) {
    for (const playerId of getBankerTeamIds()) {
      if (!canPlayerUpgradeWithOutcome(playerId, outcome)) continue;
      state.playerLevels[playerId] = shiftLevel(getPlayerLevel(playerId), outcome.bankerLevels);
    }
  }
  if (outcome.defenderLevels > 0) {
    for (const playerId of getDefenderIds()) {
      if (!canPlayerUpgradeWithOutcome(playerId, outcome)) continue;
      state.playerLevels[playerId] = shiftLevel(getPlayerLevel(playerId), outcome.defenderLevels);
    }
  }
  if (bankerPenalty?.levels > 0) {
    const bankerLevelBeforePenalty = getPlayerLevel(state.bankerId);
    state.playerLevels[state.bankerId] = dropLevel(
      bankerLevelBeforePenalty,
      bankerPenalty.levels,
      bankerPenalty.mode || "trump"
    );
    if (state.hiddenFriendId && FACE_CARD_LEVELS.has(bankerLevelBeforePenalty)) {
      state.playerLevels[state.hiddenFriendId] = dropLevel(
        getPlayerLevel(state.hiddenFriendId),
        1,
        bankerPenalty.mode || "trump"
      );
    }
  }
  syncPlayerLevels();
  state.levelRank = null;
  saveProgressToCookie();
}

function appendLog(message) {
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, 5);
}
