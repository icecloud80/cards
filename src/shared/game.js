// 生成准备阶段显示的开始提示文案。
function getReadyStartMessage() {
  return "开始游戏将从2重新开始。继续游戏可继续之前的级别。";
}

// 按新进度重置等级并准备开始新局。
function startNewProgress(autoStart = false) {
  state.playerLevels = { ...INITIAL_LEVELS };
  state.startSelection = "new";
  saveProgressToCookie();
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

// 读取已保存的等级进度并继续游戏。
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

// 按当前等级重新开始这一轮牌局。
function restartCurrentRound() {
  dom.resultOverlay.classList.remove("show");
  setupGame();
  startDealing();
}

// 初始化一局新的牌局状态。
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
  state.currentTrickBeatCount = 0;
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
  state.allLogs = [];
  state.gameOver = false;
  state.bottomRevealMessage = "";
  state.selectedFriendOccurrence = 1;
  state.selectedFriendSuit = "hearts";
  state.selectedFriendRank = "A";
  state.friendRetargetUsed = false;
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

// 返回自动找朋友时优先考虑的点数顺序。
function getFriendAutoRankPriority() {
  return getPlayerLevelRank(state.bankerId) === "A" ? ["K", "A"] : ["A", "K"];
}

// 返回自动找朋友使用的点数组合。
function getFriendAutoRankGroups() {
  return [getFriendAutoRankPriority()];
}

// 返回找朋友目标牌的兜底方案。
function getFriendTargetFallback() {
  return {
    target: buildFriendTarget({
      suit: "hearts",
      rank: "A",
      occurrence: 1,
    }),
    ownerId: 2,
  };
}

// 收集所有可用的朋友目标牌候选项。
function collectFriendTargetCandidates(banker, ranks, scoreFn) {
  const suitPriority = [...SUITS.filter((suit) => suit !== state.trumpSuit), state.trumpSuit].filter(Boolean);
  const targetCandidates = [];

  for (const rank of ranks) {
    if (rank === "RJ" || rank === "BJ") {
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
          score: scoreFn(target, banker, owners),
        });
      }
      continue;
    }

    for (const suit of suitPriority) {
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
          score: scoreFn(target, banker, owners),
        });
      }
    }
  }

  return targetCandidates;
}

// 从候选项中选出最佳朋友目标牌。
function pickBestFriendTargetFromCandidates(targetCandidates) {
  const bestCandidate = targetCandidates.sort((a, b) => b.score - a.score)[0];
  return bestCandidate
    ? {
        target: buildFriendTarget(bestCandidate.target),
        ownerId: bestCandidate.ownerId,
      }
    : null;
}

// 为新手难度的朋友目标牌候选项计算分数。
function scoreBeginnerFriendTargetCandidate(target, banker, owners) {
  const bankerSuitCards = banker.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit));
  const bankerTargetCopies = bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = bankerSuitCards.filter((card) => card.rank !== target.rank);
  const rankBonus = {
    A: 60,
    K: 48,
    RJ: 44,
    BJ: 36,
    Q: 20,
    J: 8,
    "10": 4,
  }[target.rank] || 0;
  const occurrenceBonus = target.occurrence === bankerTargetCopies + 1 ? 12 : target.occurrence === 2 ? 6 : 3;
  const suitBonus = target.suit !== "joker" && target.suit !== state.trumpSuit ? 14 : 0;
  const trumpPenalty = target.suit === state.trumpSuit ? 10 : 0;
  const jokerPenalty = target.suit === "joker" ? 8 : 0;
  const uniqueOwnerBonus = owners.length === 1 ? 10 : 3;
  const supportPenalty = bankerSupportCards.length === 0 ? 12 : bankerSupportCards.length >= 4 ? 8 : 0;
  return rankBonus + occurrenceBonus + suitBonus + uniqueOwnerBonus - trumpPenalty - jokerPenalty - supportPenalty;
}

// 选择新手难度下的朋友目标牌。
function chooseBeginnerFriendTarget() {
  const banker = getPlayer(state.bankerId);
  if (!banker) return getFriendTargetFallback();
  for (const ranks of getFriendAutoRankGroups()) {
    const candidates = collectFriendTargetCandidates(banker, ranks, scoreBeginnerFriendTargetCandidate);
    const best = pickBestFriendTargetFromCandidates(candidates);
    if (best) return best;
  }
  return getFriendTargetFallback();
}

// 选择中级难度下的朋友目标牌。
function chooseIntermediateFriendTarget() {
  const banker = getPlayer(state.bankerId);
  if (!banker) return getFriendTargetFallback();
  for (const ranks of getFriendAutoRankGroups()) {
    const candidates = collectFriendTargetCandidates(banker, ranks, scoreFriendTargetCandidate);
    const best = pickBestFriendTargetFromCandidates(candidates);
    if (best) return best;
  }
  return getFriendTargetFallback();
}

// 选择朋友目标牌。
function chooseFriendTarget() {
  return state.aiDifficulty === "intermediate"
    ? chooseIntermediateFriendTarget()
    : chooseBeginnerFriendTarget();
}

// 取出指定朋友花色对应的牌。
function getCardsForFriendSuit(cards, suit) {
  return cards.filter((card) => (suit === "joker" ? card.suit === "joker" : card.suit === suit));
}

// 返回手动找朋友推荐使用的点数顺序。
function getFriendRecommendationRankPriority() {
  return getFriendAutoRankPriority();
}

function getFriendTargetHigherRankCopiesOutsideBanker(target, banker = getPlayer(state.bankerId)) {
  if (!target || target.suit === "joker" || !banker) return 0;
  const rankIndex = RANKS.indexOf(target.rank);
  if (rankIndex < 0 || rankIndex >= RANKS.length - 1) return 0;
  const higherRanks = RANKS.slice(rankIndex + 1);
  return state.players
    .filter((player) => player.id !== banker.id)
    .reduce((sum, player) => (
      sum + player.hand.filter((card) => card.suit === target.suit && higherRanks.includes(card.rank)).length
    ), 0);
}

// 为朋友目标牌推荐项计算分数。
function scoreFriendRecommendationCandidate(target, meta) {
  const { ownCopies, buriedCopies, remainingSuitCards, buriedSuitCards } = meta;
  const supportCards = remainingSuitCards.filter((card) => card.rank !== target.rank);
  const targetPower = target.suit === "joker"
    ? (target.rank === "RJ" ? 200 : 190)
    : cardStrength({ suit: target.suit, rank: target.rank, deckIndex: 0, id: `friend-recommend-${target.suit}-${target.rank}` });
  const lowSupportCount = supportCards.filter((card) => cardStrength(card) < targetPower).length;
  const highSupportCount = supportCards.length - lowSupportCount;
  const rankBonus = {
    A: 56,
    K: 48,
    Q: 38,
    J: 30,
    "10": 22,
    RJ: 50,
    BJ: 42,
  }[target.rank] || 0;
  const occurrenceBonus = target.occurrence === ownCopies + 1
    ? 14
    : target.occurrence === 2
      ? 9
      : 5;
  const shortSuitBonus = remainingSuitCards.length === 0
    ? 4
    : supportCards.length === 0
      ? 18
      : supportCards.length === 1
        ? 16
        : supportCards.length === 2
          ? 8
          : 0;
  const lowSupportBonus = lowSupportCount === 1
    ? 12
    : lowSupportCount === 2
      ? 6
      : lowSupportCount === 0 && ownCopies > 0
        ? 4
        : 0;
  const buriedSuitBonus = Math.min(buriedSuitCards.length, 4) * 4;
  const buriedTargetPenalty = buriedCopies * 18;
  const highSupportPenalty = highSupportCount * 5;
  const clutterPenalty = Math.max(0, supportCards.length - 2) * 7;
  const trumpPenalty = target.suit === state.trumpSuit ? 10 : 0;
  const jokerPenalty = target.suit === "joker" ? 16 : 0;
  const overtakenPenalty = getFriendTargetHigherRankCopiesOutsideBanker(target) > 0 ? 96 : 0;
  const selfHoldBonus = ownCopies > 0 ? ownCopies * 6 : 8;
  const controlPenalty = remainingSuitCards.length === 0 ? 10 : 0;
  const score = rankBonus
    + occurrenceBonus
    + shortSuitBonus
    + lowSupportBonus
    + buriedSuitBonus
    + selfHoldBonus
    - buriedTargetPenalty
    - highSupportPenalty
    - clutterPenalty
    - trumpPenalty
    - jokerPenalty
    - overtakenPenalty
    - controlPenalty;

  const reasons = [];
  if (ownCopies > 0) {
    reasons.push(`你手里还留着 ${ownCopies} 张同牌，默认改叫${getOccurrenceLabel(target.occurrence)}来避开自己先打出`);
  }
  if (supportCards.length <= 1 && remainingSuitCards.length > 0 && target.suit !== "joker") {
    reasons.push(`这门现在只剩 ${supportCards.length} 张非目标牌，比较容易顺手把牌权送回这门`);
  }
  if (buriedSuitCards.length >= 2 && target.suit !== "joker") {
    reasons.push(`你刚扣下了 ${buriedSuitCards.length} 张这门牌，这门已经被压短了`);
  }
  if (remainingSuitCards.length === 0 && target.suit !== "joker") {
    reasons.push("这门已经空掉了，但你对它的主动控制会更少");
  }
  if (target.suit === state.trumpSuit) {
    reasons.push("这张是主牌，找人会更稳，但通常也更慢一些");
  }
  if (target.suit === "joker") {
    reasons.push("王张够硬，但朋友往往会出现得更晚");
  }
  if (reasons.length === 0) {
    reasons.push("这张高张在常见找法里更稳，适合作为默认选择");
  }

  return {
    score,
    reason: reasons.slice(0, 2).join("；"),
  };
}

// 返回玩家手动找朋友时的推荐方案。
function getFriendPickerRecommendation() {
  const banker = getPlayer(state.bankerId);
  if (!banker) {
    const fallback = chooseFriendTarget().target;
    return {
      target: fallback,
      reason: "先按常见找法给出一个默认高张，你也可以手动改。",
    };
  }

  const rankPriority = getFriendRecommendationRankPriority();
  const suitPriority = [...SUITS.filter((suit) => suit !== state.trumpSuit), state.trumpSuit, "joker"].filter(Boolean);
  const targetCandidates = [];

  for (const suit of suitPriority) {
    const remainingSuitCards = getCardsForFriendSuit(banker.hand, suit);
    const buriedSuitCards = getCardsForFriendSuit(state.bottomCards, suit);
    const rankOptions = suit === "joker" ? ["RJ", "BJ"] : rankPriority;

    for (const rank of rankOptions) {
      const ownCopies = remainingSuitCards.filter((card) => card.rank === rank).length;
      const buriedCopies = buriedSuitCards.filter((card) => card.rank === rank).length;
      const maxOccurrence = Math.min(3, 3 - buriedCopies);

      for (let occurrence = ownCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
        const target = { suit, rank, occurrence };
        const scored = scoreFriendRecommendationCandidate(target, {
          ownCopies,
          buriedCopies,
          remainingSuitCards,
          buriedSuitCards,
        });
        targetCandidates.push({
          target,
          score: scored.score,
          reason: scored.reason,
        });
      }
    }
  }

  const best = targetCandidates.sort((a, b) => b.score - a.score)[0];
  if (best) {
    return {
      target: buildFriendTarget(best.target),
      reason: best.reason,
    };
  }

  const fallback = chooseFriendTarget().target;
  return {
    target: fallback,
    reason: "先按常见找法给出一个默认高张，你也可以手动改。",
  };
}

// 为朋友目标牌候选项计算综合分数。
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
  const overtakenPenalty = getFriendTargetHigherRankCopiesOutsideBanker(target, banker) > 0 ? 96 : 0;
  const voidSetupBonus = target.suit !== "joker" && bankerTargetCopies > 0 && bankerSupportCards.length <= 1
    ? 24
    : target.suit !== "joker" && bankerSupportCards.length === 0
      ? 14
      : 0;
  const returnRouteBonus = target.suit !== "joker" && bankerSupportCards.length <= 1
    ? Math.min(ownerSupportCards.length, 3) * 6 + Math.min(ownerHighCards.length, 2) * 5
    : 0;
  return rankBonus + occurrenceBonus + suitBonus + uniqueOwnerBonus + bankerOwnCopyBonus + returnBonus + voidSetupBonus + returnRouteBonus - trumpPenalty - jokerPenalty - supportPenalty - overtakenPenalty;
}

// 构建朋友目标牌。
function buildFriendTarget(target) {
  return {
    ...target,
    label: describeTarget(target),
    img: target.suit === "joker"
      ? getJokerImage(target.rank)
      : getCardImage(target.suit, target.rank),
  };
}

// 返回查找朋友目标牌归属的搜索顺序。
function getFriendSearchOrder(fromId = state.bankerId) {
  const order = [];
  let currentId = getNextPlayerId(fromId);
  while (currentId !== fromId) {
    order.push(currentId);
    currentId = getNextPlayerId(currentId);
  }
  return order;
}

// 推断朋友目标牌当前归属的玩家。
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

// 设置朋友目标牌。
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

// 返回默认的朋友目标牌选择。
function getDefaultFriendSelection() {
  const suggested = state.bankerId === 1
    ? getFriendPickerRecommendation().target
    : chooseFriendTarget().target;
  return {
    occurrence: suggested.occurrence || 1,
    suit: suggested.suit,
    rank: suggested.rank,
  };
}

// 开始叫朋友阶段并初始化默认选择。
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

// 确认并应用当前选择的朋友目标牌。
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

// 判断当前是否允许重新选择朋友目标牌。
function canRetargetFriendSelection() {
  return state.bankerId === 1
    && !state.gameOver
    && !!state.friendTarget
    && !state.friendRetargetUsed
    && state.phase === "playing"
    && state.trickNumber === 1
    && state.currentTrick.length === 0;
}

// 重新打开朋友选牌。
function reopenFriendSelection() {
  if (!canRetargetFriendSelection()) return false;
  clearTimers();
  state.selectedFriendOccurrence = state.friendTarget.occurrence || 1;
  state.selectedFriendSuit = state.friendTarget.suit;
  state.selectedFriendRank = state.friendTarget.rank;
  state.phase = "callingFriend";
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.friendRetargetUsed = true;
  appendLog("打家重新选择了朋友牌。");
  render();
  return true;
}

// 切换到正式出牌阶段。
function enterPlayingPhase() {
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.phase = "playing";
  appendLog(TEXT.log.enterPlaying(getPlayer(state.bankerId).name));
  render();
  startTurn();
}

// 开始发牌。
function startDealing() {
  clearTimers();
  if (state.gameOver || state.phase !== "ready") return;
  state.phase = "dealing";
  state.awaitingHumanDeclaration = false;
  appendLog(TEXT.log.startDealing);
  render();
  queueDealStep(140);
}

// 安排下一步发牌流程。
function queueDealStep(delay = 90) {
  if (state.dealTimer) {
    window.clearTimeout(state.dealTimer);
  }
  state.dealTimer = window.setTimeout(() => {
    state.dealTimer = null;
    dealOneCard();
  }, delay);
}

// 处理一次单张发牌。
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

// 获取翻底展示权重。
function getBottomRevealWeight(card) {
  if (card.rank === "RJ") return 100;
  if (card.rank === "BJ") return 99;
  return RANK_WEIGHT[card.rank] || 0;
}

// 结算玩家是否因底牌触发叫主。
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

// 完成发牌阶段。
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

// 切换到等待玩家手动叫主的状态。
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

// 开始翻底展示阶段。
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

// 完成翻底展示阶段。
function finishBottomRevealPhase() {
  if (state.phase !== "bottomReveal") return;
  clearTimers();
  startBuryingPhase();
}

// 获取亮主选项。
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

// 为玩家选出当前最优叫主方案。
function getBestDeclarationForPlayer(playerId) {
  return getDeclarationOptions(playerId)[0] || null;
}

// 获取亮主声明优先级。
function getDeclarationPriority(entry) {
  if (!entry || (entry.count !== 2 && entry.count !== 3)) return -1;
  const base = entry.count === 2 ? 20 : 30;
  if (entry.suit !== "notrump") return base;
  const jokerRank = entry.cards?.[0]?.rank;
  if (jokerRank === "BJ") return base + 1;
  if (jokerRank === "RJ") return base + 2;
  return base;
}

// 判断新叫主是否可以压过当前叫主。
function canOverrideDeclaration(candidate, current = state.declaration) {
  if (!candidate) return false;
  if (!current) return true;
  if (candidate.playerId === current.playerId) return false;
  return getDeclarationPriority(candidate) > getDeclarationPriority(current);
}

// 获取亮主展示牌组。
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

// 执行一次叫主。
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

// 在需要时触发自动叫主。
function maybeAutoDeclare(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.isHuman) return;
  const best = getBestDeclarationForPlayer(playerId);
  if (!best || !canOverrideDeclaration(best)) return;

  const willing = best.count >= 3 || Math.random() < 0.65;
  if (!willing) return;
  declareTrump(playerId, best, "auto");
}

// 获取无主反主选项。
function getNoTrumpCounterOption(playerId) {
  return getDeclarationOptions(playerId).find((entry) => entry.suit === "notrump") || null;
}

// 为玩家计算可用的反主方案。
function getCounterDeclarationForPlayer(playerId) {
  const current = state.declaration;
  if (!current) return null;
  return getDeclarationOptions(playerId)
    .filter((entry) => canOverrideDeclaration(entry, current))
    .sort((a, b) => getDeclarationPriority(b) - getDeclarationPriority(a))[0] || null;
}

// 找到下一位需要表态反主的玩家。
function getNextCounterPlayerId(fromId) {
  let nextId = getNextPlayerId(fromId);
  while (nextId === state.declaration?.playerId) {
    nextId = getNextPlayerId(nextId);
  }
  return nextId;
}

// 开始反主回合。
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

// 执行一次反主。
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

// 处理当前玩家放弃反主。
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

// 计算埋底时应尽量保留的牌 ID。
function getBuryProtectedCardIds(cards) {
  const protectedIds = new Set();
  if (!Array.isArray(cards) || cards.length === 0) return protectedIds;

  for (const combo of findSerialTuples(cards, 3)) {
    const type = classifyPlay(combo).type;
    if (type === "bulldozer") {
      for (const card of combo) protectedIds.add(card.id);
    }
  }

  for (const combo of findSerialTuples(cards, 2)) {
    const type = classifyPlay(combo).type;
    if (type === "tractor" || type === "train") {
      for (const card of combo) protectedIds.add(card.id);
    }
  }

  return protectedIds;
}

// 计算埋底时应尽量保留的高控制力。
function getBuryControlRetentionScore(card) {
  if (!card) return 0;
  if (isTrump(card)) return 0;
  if (card.rank === "A") return 180;
  if (card.rank === "Q") return 24;
  return 0;
}

// 为玩家生成埋底建议。
function getBuryHintForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return [];
  const protectedCardIds = getBuryProtectedCardIds(player.hand);
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
          let score = (isTrump(card) ? 1000 : 0) + scoreValue(card) * 50 + cardStrength(card) + getBuryControlRetentionScore(card);
          if (protectedCardIds.has(card.id)) score += 600;
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
      const aScore = (isTrump(a) ? 1000 : 0) + scoreValue(a) * 50 + cardStrength(a) + getBuryControlRetentionScore(a) + (protectedCardIds.has(a.id) ? 600 : 0);
      const bScore = (isTrump(b) ? 1000 : 0) + scoreValue(b) * 50 + cardStrength(b) + getBuryControlRetentionScore(b) + (protectedCardIds.has(b.id) ? 600 : 0);
      return aScore - bScore;
    })
    .slice(0, 7);
}

// 完成埋底并进入下一阶段。
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

// 开始埋底阶段。
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

// 开始正式出牌阶段的首轮流程。
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

// 按 ID 获取玩家对象。
function getPlayer(id) {
  return state.players.find((player) => player.id === id);
}

// 返回下一位玩家 ID。
function getNextPlayerId(id) {
  return (id % 5) + 1;
}

// 返回上一位玩家 ID。
function getPreviousPlayerId(id) {
  return id === PLAYER_ORDER[0] ? PLAYER_ORDER[PLAYER_ORDER.length - 1] : id - 1;
}

// 返回当前对玩家可见的闲家分数。
function getVisibleDefenderPoints() {
  if (!isFriendTeamResolved()) {
    return null;
  }
  return state.defenderPoints;
}

// 判断朋友阵营是否已完全确定。
function isFriendTeamResolved() {
  return !!state.friendTarget && (state.friendTarget.revealed || state.friendTarget.failed);
}

// 重新统计闲家当前分数。
function recalcDefenderPoints() {
  return state.players.reduce((sum, player) => {
    if (!isDefenderTeam(player.id)) return sum;
    return sum + (player.roundPoints || 0);
  }, 0);
}

// 判断玩家本人当前是否可以查看底牌。
function canHumanViewBottomCards() {
  if (state.gameOver) return true;
  if (state.phase === "bottomReveal") return true;
  return state.bankerId === 1 && (state.phase === "burying" || state.phase === "callingFriend" || state.phase === "playing" || state.phase === "pause");
}

// 判断是否显示给玩家查看底牌的按钮。
function shouldShowHumanBottomButton() {
  return state.bankerId === 1 && canHumanViewBottomCards() && !state.gameOver && state.phase !== "bottomReveal";
}

// 开始回合。
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

// 清理所有进行中的计时器。
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

// 返回开始界面并重置阶段状态。
function goToMainMenu() {
  dom.resultOverlay.classList.remove("show");
  state.startSelection = null;
  setupGame();
}

// 开始下一位牌局。
function beginNextGame(autoStart = false) {
  dom.resultOverlay.classList.remove("show");
  setupGame();
  if (autoStart) {
    startDealing();
  }
}

// 启动结算倒计时。
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

// 清理中央公告。
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

// 将中央公告加入后续处理队列。
function queueCenterAnnouncement(message, tone = "default") {
  if (!message) return;
  state.centerAnnouncementQueue.push({ message, tone });
  if (state.centerAnnouncement) return;
  showNextCenterAnnouncement();
}

// 显示下一条中央播报消息。
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

// 判断某位玩家当前是否是玩家本人可见的盟友。
function isVisibleAllyOfHuman(playerId) {
  if (playerId === 1) return true;
  if (!state.friendTarget?.revealed) return false;
  const humanOnBankerTeam = state.bankerId === 1 || state.friendTarget.revealedBy === 1;
  if (humanOnBankerTeam) {
    return playerId === state.bankerId || playerId === state.friendTarget.revealedBy;
  }
  return isDefenderTeam(playerId);
}

// 判断两名玩家是否属于同一阵营。
function areSameSide(playerA, playerB) {
  if (playerA === playerB) return true;
  if (!isFriendTeamResolved()) {
    return playerA === state.bankerId && playerB === state.bankerId;
  }
  return isDefenderTeam(playerA) === isDefenderTeam(playerB);
}

// 处理一次出牌。
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
  if (beatPlay) {
    const announcement = state.currentTrickBeatCount > 0
      ? TEXT.log.coverBeatAnnouncement(player.name)
      : TEXT.log.beatAnnouncement(player.name);
    queueCenterAnnouncement(announcement, "strong");
    state.currentTrickBeatCount += 1;
  }
  const playAnnouncement = throwFailure || (pattern.type === "throw" && state.currentTrick.length > 1)
    ? ""
    : getPlayAnnouncement(playerId, pattern, {
      leadTrump: leadTrumpAnnouncement,
      isLead: state.currentTrick.length === 1,
    });
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

// 按展示规则整理已出的牌。
function sortPlayedCards(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b));
}

// 按当前条件决定是否揭示朋友。
function maybeRevealFriend(playerId, cards) {
  if (!state.friendTarget) return null;
  if (state.friendTarget.revealed || state.friendTarget.failed) return null;
  const matchedCards = cards.filter(
    (card) => isFriendTargetMatchCard(card)
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

// 确定一轮。
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
    state.currentTrickBeatCount = 0;
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

// 结算本墩的获胜玩家。
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

// 获取当前最大出牌。
function getCurrentWinningPlay() {
  if (state.currentTrick.length === 0) return null;
  const winnerId = pickTrickWinner();
  return state.currentTrick.find((play) => play.playerId === winnerId) || null;
}

// 为玩家生成压牌提示。
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

// 判断当前所选牌是否能压过牌桌最大牌。
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

// 判断是否闲家队伍。
function isDefenderTeam(playerId) {
  if (playerId === state.bankerId) return false;
  if (state.friendTarget?.failed) return true;
  if (!state.friendTarget?.revealed) return false;
  return playerId !== state.hiddenFriendId;
}

// 判断玩家本人一方是否赢下本局。
function didHumanSideWin(outcome) {
  const humanOnBankerTeam = state.bankerId === 1
    || (state.friendTarget?.revealed && state.friendTarget.revealedBy === 1);
  return humanOnBankerTeam ? outcome.winner === "banker" : outcome.winner === "defender";
}

// 获取等级变化量。
function getLevelDelta(before, after) {
  const order = [...NEGATIVE_LEVELS, ...RANKS];
  return order.indexOf(after) - order.indexOf(before);
}

// 获取结算风格标签。
function getResultFlavorTag(outcome, bottomResult = null) {
  if (outcome.winner === "banker") {
    if (outcome.bankerLevels >= 3) return "大光";
    if (outcome.bankerLevels === 2) return "小光";
  }
  if (bottomResult?.penalty?.levels > 0) {
    return "扣底";
  }
  return "";
}

// 获取结算摘要标签。
function getResultSummaryTags(outcome, humanWon, humanLevelBefore, humanLevelAfter, bottomResult = null) {
  const tags = [humanWon ? "获胜" : "失败"];
  const flavor = getResultFlavorTag(outcome, bottomResult);
  if (flavor) {
    tags.push(flavor);
  }
  const levelDelta = getLevelDelta(humanLevelBefore, humanLevelAfter);
  if (levelDelta > 0) {
    tags.push(`升${levelDelta}级`);
  } else if (levelDelta < 0) {
    tags.push(`降${Math.abs(levelDelta)}级`);
  }
  return tags;
}

// 完成牌局。
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
  const humanLevelBefore = getPlayerLevel(1);
  applyLevelSettlement(outcome, bottomResult?.penalty || null);
  const humanLevelAfter = getPlayerLevel(1);
  dom.resultCard.classList.toggle("win", humanWon);
  dom.resultCard.classList.toggle("loss", !humanWon);
  dom.resultTitle.textContent = humanWon ? TEXT.outcome.winTitle : TEXT.outcome.lossTitle;
  if (dom.resultSubinfo) {
    dom.resultSubinfo.innerHTML = getResultSummaryTags(
      outcome,
      humanWon,
      humanLevelBefore,
      humanLevelAfter,
      bottomResult
    ).map((item) => `<span class="result-chip">${item}</span>`).join("");
  }
  dom.resultBody.textContent = `${outcome.body}${getBottomResultText(bottomResult)}${getLevelSettlementSummary(outcome)}`;
  dom.resultOverlay.classList.add("show");
  startResultCountdown();
  render();
}

// 返回庄家阵营的玩家 ID 列表。
function getBankerTeamIds() {
  if (state.friendTarget?.failed) return [state.bankerId];
  return [...new Set([state.bankerId, state.hiddenFriendId].filter(Boolean))];
}

// 返回闲家阵营的玩家 ID 列表。
function getDefenderIds() {
  return state.players
    .map((player) => player.id)
    .filter((playerId) => isDefenderTeam(playerId));
}

// 判断某位玩家在当前结算结果下是否可以升级。
function canPlayerUpgradeWithOutcome(playerId, outcome) {
  const level = getPlayerLevel(playerId);
  if (!MANDATORY_LEVELS.has(level)) return true;
  return outcome.winner === "banker" && playerId === state.bankerId;
}

// 应用等级结算。
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

// 追加播报。
function appendLog(message) {
  if (!message) return;
  state.allLogs.push(message);
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, 5);
}

function getResultLogText() {
  const lines = [
    "五人找朋友升级 对局日志",
    `结果：${dom.resultTitle?.textContent?.trim() || "未结算"}`,
  ];
  const summary = dom.resultBody?.textContent?.trim();
  if (summary) {
    lines.push(`结算：${summary}`);
  }
  lines.push("");
  lines.push("全局播报：");
  if (state.allLogs.length === 0) {
    lines.push("（无日志）");
  } else {
    lines.push(...state.allLogs.map((entry, index) => `${index + 1}. ${entry}`));
  }
  return lines.join("\n");
}

function getResultLogFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `five-friends-log-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;
}

function setResultLogButtonFeedback(button, idleLabel, nextLabel) {
  if (!button) return;
  button.textContent = nextLabel;
  window.setTimeout(() => {
    button.textContent = idleLabel;
  }, 1600);
}

async function copyResultLog() {
  const text = getResultLogText();
  if (!text) return;
  const idleLabel = dom.copyResultLogBtn?.dataset.idleLabel || "复制日志";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setResultLogButtonFeedback(dom.copyResultLogBtn, idleLabel, "已复制");
  } catch (error) {
    setResultLogButtonFeedback(dom.copyResultLogBtn, idleLabel, "复制失败");
  }
}

function downloadResultLog() {
  const text = getResultLogText();
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getResultLogFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  const idleLabel = dom.downloadResultLogBtn?.dataset.idleLabel || "下载日志";
  setResultLogButtonFeedback(dom.downloadResultLogBtn, idleLabel, "已下载");
}
