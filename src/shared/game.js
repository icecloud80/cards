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

function getAiDifficultyLogLabel() {
  return AI_DIFFICULTY_OPTIONS.find((option) => option.value === state.aiDifficulty)?.label || "初级";
}

function getPlatformLogLabel() {
  return APP_PLATFORM === "mobile" ? "手机" : "PC";
}

function getLogTimestamp() {
  return new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getPlayerLevelsLogText() {
  return PLAYER_ORDER.map((playerId) => `玩家${playerId} Lv:${getPlayerLevel(playerId)}`).join(" · ");
}

function appendSessionHeaderLogs() {
  appendLog(`游戏版本：${APP_VERSION_LABEL}`);
  appendLog(`AI难度：${getAiDifficultyLogLabel()}`);
  appendLog(`时间：${getLogTimestamp()}`);
  appendLog(`设备：${getPlatformLogLabel()}`);
  appendLog(`玩家等级：${getPlayerLevelsLogText()}`);
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
  state.playHistory = [];
  state.lastAiDecision = null;
  state.aiDecisionHistory = [];
  state.aiDecisionHistorySeq = 0;
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
  state.selectedDebugDecisionOffsets = createDebugDecisionOffsets();
  state.currentTurnId = state.nextFirstDealPlayerId || 1;
  state.leaderId = state.currentTurnId;
  dom.resultOverlay.classList.remove("show");
  updateResultCountdownLabel();

  const deck = createDeck();
  state.dealCards = deck.splice(0, 31 * 5);
  state.bottomCards = deck.splice(0, 7);

  appendSessionHeaderLogs();
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

// 统计指定目标牌在底牌中已知被压下的张数。
function getKnownBuriedTargetCopies(target) {
  if (!target || !Array.isArray(state.bottomCards)) return 0;
  return state.bottomCards.filter((card) => card.suit === target.suit && card.rank === target.rank).length;
}

// 统计按当前可见信息，目标牌更大一级的同花色牌还可能剩在外面的张数。
function getVisiblePossibleHigherRankCopiesOutsideBanker(target, banker = getPlayer(state.bankerId)) {
  if (!target || target.suit === "joker" || !banker) return 0;
  const rankIndex = RANKS.indexOf(target.rank);
  if (rankIndex < 0 || rankIndex >= RANKS.length - 1) return 0;
  const higherRanks = RANKS.slice(rankIndex + 1);
  return higherRanks.reduce((sum, rank) => {
    const ownCopies = banker.hand.filter((card) => card.suit === target.suit && card.rank === rank).length;
    const buriedCopies = getKnownBuriedTargetCopies({ suit: target.suit, rank });
    return sum + Math.max(0, 3 - ownCopies - buriedCopies);
  }, 0);
}

// 收集所有可用的朋友目标牌候选项。
function collectFriendTargetCandidates(banker, ranks, scoreFn) {
  const suitPriority = [...SUITS.filter((suit) => suit !== state.trumpSuit), state.trumpSuit].filter(Boolean);
  const targetCandidates = [];

  for (const rank of ranks) {
    if (rank === "RJ" || rank === "BJ") {
      const bankerCopies = banker.hand.filter((card) => card.suit === "joker" && card.rank === rank).length;
      const buriedCopies = getKnownBuriedTargetCopies({ suit: "joker", rank });
      const maxOccurrence = Math.min(3, 3 - buriedCopies);
      for (let occurrence = bankerCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
        const target = { suit: "joker", rank, occurrence };
        targetCandidates.push({
          target,
          ownerId: null,
          score: scoreFn(target, banker, { buriedCopies }),
        });
      }
      continue;
    }

    for (const suit of suitPriority) {
      const bankerCopies = banker.hand.filter((card) => card.suit === suit && card.rank === rank).length;
      const buriedCopies = getKnownBuriedTargetCopies({ suit, rank });
      const maxOccurrence = Math.min(3, 3 - buriedCopies);
      for (let occurrence = bankerCopies + 1; occurrence <= maxOccurrence; occurrence += 1) {
        const target = { suit, rank, occurrence };
        targetCandidates.push({
          target,
          ownerId: null,
          score: scoreFn(target, banker, { buriedCopies }),
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
function scoreBeginnerFriendTargetCandidate(target, banker, meta = {}) {
  const bankerSuitCards = banker.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit));
  const bankerTargetCopies = bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = bankerSuitCards.filter((card) => card.rank !== target.rank);
  const buriedCopies = meta.buriedCopies || 0;
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
  const buriedPenalty = buriedCopies * 18;
  const higherRankRiskPenalty = getVisiblePossibleHigherRankCopiesOutsideBanker(target, banker) > 0 ? 24 : 0;
  const supportPenalty = bankerSupportCards.length === 0 ? 12 : bankerSupportCards.length >= 4 ? 8 : 0;
  return rankBonus + occurrenceBonus + suitBonus - trumpPenalty - jokerPenalty - buriedPenalty - higherRankRiskPenalty - supportPenalty;
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
  return state.aiDifficulty === "beginner"
    ? chooseBeginnerFriendTarget()
    : chooseIntermediateFriendTarget();
}

// 取出指定朋友花色对应的牌。
function getCardsForFriendSuit(cards, suit) {
  return cards.filter((card) => (suit === "joker" ? card.suit === "joker" : card.suit === suit));
}

// 返回手动找朋友推荐使用的点数顺序。
function getFriendRecommendationRankPriority() {
  return getFriendAutoRankPriority();
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
  const overtakenPenalty = getVisiblePossibleHigherRankCopiesOutsideBanker(target) > 0 ? 96 : 0;
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
function scoreFriendTargetCandidate(target, banker, meta = {}) {
  const bankerSuitCards = banker.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : card.suit === target.suit));
  const bankerTargetCopies = bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = bankerSuitCards.filter((card) => card.rank !== target.rank);
  const buriedCopies = meta.buriedCopies || 0;
  const targetPower = target.suit === "joker"
    ? (target.rank === "RJ" ? 200 : 190)
    : cardStrength({ suit: target.suit, rank: target.rank, deckIndex: 0, id: `friend-target-${target.suit}-${target.rank}` });
  const bankerReturnCards = bankerSupportCards.filter((card) => cardStrength(card) < targetPower).length;
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
  const bankerOwnCopyBonus = bankerTargetCopies > 0 ? 8 : 0;
  const returnBonus = Math.min(bankerReturnCards, 3) * 7;
  const supportPenalty = bankerSupportCards.length === 0 ? 18 : 0;
  const overtakenPenalty = getVisiblePossibleHigherRankCopiesOutsideBanker(target, banker) > 0 ? 96 : 0;
  const buriedPenalty = buriedCopies * 22;
  const voidSetupBonus = target.suit !== "joker" && bankerTargetCopies > 0 && bankerSupportCards.length <= 1
    ? 24
    : target.suit !== "joker" && bankerSupportCards.length === 0
      ? 14
      : 0;
  const returnRouteBonus = target.suit !== "joker" && bankerSupportCards.length <= 1
    ? Math.min(bankerReturnCards, 3) * 5
    : 0;
  return rankBonus + occurrenceBonus + suitBonus + bankerOwnCopyBonus + returnBonus + voidSetupBonus + returnRouteBonus - trumpPenalty - jokerPenalty - buriedPenalty - supportPenalty - overtakenPenalty;
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

/**
 * 作用：
 * 统计玩家当前手牌中的常主数量。
 *
 * 为什么这样写：
 * 初级 AI 在判断是否适合反无主时，不能只看自己有没有两王或三王，
 * 还要确认手里是否已经有足够数量的稳定主力。这里把级牌和王统一视为“常主”，
 * 便于用一个简单阈值控制初级 AI 的无主反主意愿。
 *
 * 输入：
 * @param {number} playerId - 需要统计常主数量的玩家 ID。
 *
 * 输出：
 * @returns {number} 玩家当前手里常主的张数。
 *
 * 注意：
 * - 常主只包括级牌和大小王，不包括普通主花色牌。
 * - 这里使用玩家自己的等级牌来判定级牌，和亮主规则保持一致。
 */
function countCommonTrumpCardsForPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  const playerLevelRank = getPlayerLevelRank(playerId);
  return player.hand.filter((card) => card.suit === "joker" || card.rank === playerLevelRank).length;
}

/**
 * 作用：
 * 统计指定亮主方案下，玩家当前手牌会成为主牌的总张数。
 *
 * 为什么这样写：
 * 初级 AI 的小幅优化重点，是避免用明显过短的主花色过早坐庄。
 * 由于亮主阶段主牌尚未真正确定，这里需要按候选方案临时重算主牌数量，
 * 而不能直接依赖 live state 中已经落地的 `trumpSuit`。
 *
 * 输入：
 * @param {number} playerId - 需要评估亮主方案的玩家 ID。
 * @param {object} declaration - 候选亮主方案，可能是花色主或无主。
 *
 * 输出：
 * @returns {number} 在该候选方案下，玩家当前会拥有的主牌总数。
 *
 * 注意：
 * - 无主时，这个函数返回的实际上就是常主数量。
 * - 花色主时，主级牌同时满足“级牌”和“主花色牌”条件，但只能计一次。
 */
function countTrumpCardsForDeclaration(playerId, declaration) {
  const player = getPlayer(playerId);
  if (!player || !declaration) return 0;
  const playerLevelRank = getPlayerLevelRank(playerId);
  if (declaration.suit === "notrump") {
    return countCommonTrumpCardsForPlayer(playerId);
  }
  return player.hand.filter((card) =>
    card.suit === "joker" || card.rank === playerLevelRank || card.suit === declaration.suit
  ).length;
}

/**
 * 作用：
 * 判断初级 AI 是否满足自动亮主或自动反主的最小启发式条件。
 *
 * 为什么这样写：
 * 用户要求保留初级现有风格，只做很小的策略修正。
 * 因此这里不引入复杂评分器，只加两条简单门槛：
 * 1. 花色主至少要有足够主牌数量，避免短主硬坐庄。
 * 2. 反无主至少要有 4 张常主，避免只有两王就轻率反无主。
 *
 * 输入：
 * @param {number} playerId - 需要评估自动决策的玩家 ID。
 * @param {object} declaration - 候选亮主或反主方案。
 * @param {string} mode - `"declare"` 表示自动亮主，`"counter"` 表示自动反主。
 *
 * 输出：
 * @returns {boolean} `true` 表示初级 AI 可以继续考虑这个方案。
 *
 * 注意：
 * - 只对初级 AI 的自动行为生效，不影响人类玩家的合法按钮与提示。
 * - 花色主门槛采用“主牌数大于 7 或达到当前手牌的 1/4”。
 * - 反无主门槛采用“常主至少 4 张”。
 */
function meetsBeginnerAutoDeclarationHeuristic(playerId, declaration, mode = "declare") {
  const player = getPlayer(playerId);
  if (!player || !declaration) return false;

  if (declaration.suit === "notrump") {
    if (mode !== "counter") return true;
    return countCommonTrumpCardsForPlayer(playerId) >= 4;
  }

  const trumpCount = countTrumpCardsForDeclaration(playerId, declaration);
  const handCount = player.hand.length;
  return trumpCount > 7 || trumpCount >= Math.ceil(handCount / 4);
}

/**
 * 作用：
 * 返回自动流程下应该采用的亮主方案。
 *
 * 为什么这样写：
 * 合法亮主方案和 AI 是否愿意自动亮主是两层概念。
 * 这里单独做一层自动决策筛选，可以把初级启发式收在 AI 侧，
 * 同时保留人类玩家的全部合法操作与原有 UI 提示。
 *
 * 输入：
 * @param {number} playerId - 需要自动亮主的玩家 ID。
 *
 * 输出：
 * @returns {?object} 自动流程愿意采用的亮主方案；没有则返回 `null`。
 *
 * 注意：
 * - 初级会额外应用轻量 heuristic。
 * - 其他难度目前继续沿用原有“取最高档”的逻辑。
 */
function getAutoDeclarationForPlayer(playerId) {
  const best = getBestDeclarationForPlayer(playerId);
  if (!best) return null;
  if (state.aiDifficulty !== "beginner") return best;
  return meetsBeginnerAutoDeclarationHeuristic(playerId, best, "declare") ? best : null;
}

/**
 * 作用：
 * 返回自动流程下应该采用的反主方案。
 *
 * 为什么这样写：
 * 反主阶段的人类提示仍应展示所有合法选择，但 AI 自动反主应允许保留更保守的初级阈值。
 * 因此把“合法反主”和“自动反主意愿”拆开，避免策略门槛污染规则层。
 *
 * 输入：
 * @param {number} playerId - 需要自动反主的玩家 ID。
 *
 * 输出：
 * @returns {?object} 自动流程愿意采用的反主方案；没有则返回 `null`。
 *
 * 注意：
 * - 初级会额外要求反无主时至少拥有 4 张常主。
 * - 其他难度目前继续沿用原有合法最高档方案。
 */
function getAutoCounterDeclarationForPlayer(playerId) {
  const best = getCounterDeclarationForPlayer(playerId);
  if (!best) return null;
  if (state.aiDifficulty !== "beginner") return best;
  return meetsBeginnerAutoDeclarationHeuristic(playerId, best, "counter") ? best : null;
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
  const best = getAutoDeclarationForPlayer(playerId);
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
  const option = player?.isHuman
    ? getCounterDeclarationForPlayer(state.currentTurnId)
    : getAutoCounterDeclarationForPlayer(state.currentTurnId);
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
  const suitCounts = SUITS.reduce((acc, suit) => {
    acc[suit] = player.hand.filter((card) => !isTrump(card) && card.suit === suit).length;
    return acc;
  }, {});
  const reserveSuitEntry = state.aiDifficulty !== "beginner"
    ? (SUITS
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
      })[0] || null)
    : null;
  const reserveSuit = reserveSuitEntry?.suit || null;
  const reserveCardId = reserveSuitEntry?.highest?.id || null;
  const getScore = (card) => {
    let score = (isTrump(card) ? 1000 : 0) + scoreValue(card) * 50 + cardStrength(card) + getBuryControlRetentionScore(card);
    if (protectedCardIds.has(card.id)) score += 600;
    if (!isTrump(card) && state.aiDifficulty !== "beginner") {
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
  const sortedHand = [...player.hand].sort((a, b) => getScore(a) - getScore(b));
  return getBestBurySelectionWithinPointLimit(sortedHand, getScore) || sortedHand.slice(0, 7);
}

/**
 * 作用：
 * 在“必须选 7 张且总分不超过上限”的约束下，找到最适合埋底的一组牌。
 *
 * 为什么这样写：
 * 纯贪心会因为几张低价值分牌而把底牌分堆到 25 分以上。这里用小规模动态规划同时考虑“埋底代价”和“总分上限”，让 AI 与超时自动扣底都稳定遵守新规则。
 *
 * 输入：
 * @param {Array<object>} cards - 当前可供埋底的候选手牌，通常已按埋底代价从低到高排序
 * @param {(card: object) => number} getScore - 评估某张牌更适合埋底还是保留的代价函数
 *
 * 输出：
 * @returns {Array<object>} 一组合法的 7 张底牌；若找不到则返回空数组
 *
 * 注意：
 * - 只控制“原始分牌总分不超过上限”，不处理末手翻倍结算
 * - 同等代价下优先保留总分更低的组合，给后续扣底空间留余量
 */
function getBestBurySelectionWithinPointLimit(cards, getScore) {
  const targetCount = 7;
  const dp = Array.from({ length: targetCount + 1 }, () => Array(MAX_BURY_POINT_TOTAL + 1).fill(null));
  dp[0][0] = { score: 0, cards: [] };

  for (const card of cards) {
    const pointValue = scoreValue(card);
    const buryScore = getScore(card);
    for (let count = targetCount - 1; count >= 0; count -= 1) {
      for (let points = MAX_BURY_POINT_TOTAL - pointValue; points >= 0; points -= 1) {
        const previous = dp[count][points];
        if (!previous) continue;
        const nextPoints = points + pointValue;
        const nextScore = previous.score + buryScore;
        const currentBest = dp[count + 1][nextPoints];
        if (
          !currentBest
          || nextScore < currentBest.score
          || (nextScore === currentBest.score && nextPoints < getCardsPointTotal(currentBest.cards))
        ) {
          dp[count + 1][nextPoints] = {
            score: nextScore,
            cards: [...previous.cards, card],
          };
        }
      }
    }
  }

  let best = null;
  for (let points = 0; points <= MAX_BURY_POINT_TOTAL; points += 1) {
    const candidate = dp[targetCount][points];
    if (!candidate) continue;
    if (
      !best
      || candidate.score < best.score
      || (candidate.score === best.score && points < getCardsPointTotal(best.cards))
    ) {
      best = candidate;
    }
  }
  return best ? best.cards : [];
}

/**
 * 作用：
 * 校验当前所选埋底牌是否满足数量和总分上限规则。
 *
 * 为什么这样写：
 * 玩家手动扣底、AI 自动扣底和超时自动扣底都需要共用同一份规则，集中校验可以避免不同入口出现不一致行为。
 *
 * 输入：
 * @param {Array<object>} cards - 当前准备埋到底牌区的 7 张牌
 *
 * 输出：
 * @returns {{ok: boolean, reason: string, points: number}} 校验结果、失败原因和当前总分
 *
 * 注意：
 * - 这里只校验埋底专属规则，不负责检查是否来自当前玩家手牌
 * - 数量不足时直接复用“继续选牌”的交互，不在这里返回额外文案
 */
function validateBurySelection(cards) {
  const points = getCardsPointTotal(cards);
  if (!Array.isArray(cards) || cards.length !== 7) {
    return { ok: false, reason: TEXT.buttons.buryPickSeven, points };
  }
  if (points > MAX_BURY_POINT_TOTAL) {
    return {
      ok: false,
      reason: TEXT.rules.validation.buryPointLimit(points, MAX_BURY_POINT_TOTAL),
      points,
    };
  }
  return { ok: true, reason: "", points };
}

// 完成埋底并进入下一阶段。
function completeBurying(playerId, cardIds) {
  if (state.phase !== "burying" || playerId !== state.bankerId) return;
  const player = getPlayer(playerId);
  const cards = cardIds
    .map((id) => player.hand.find((card) => card.id === id))
    .filter(Boolean);
  const validation = validateBurySelection(cards);
  if (!validation.ok) return;

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

// 返回末手场景下可直接整手打出的合法首发。
function getFinalTrickLegalLeadCards(playerId) {
  const player = getPlayer(playerId);
  if (!player || state.currentTrick.length !== 0 || player.hand.length === 0) return [];
  const hand = [...player.hand];
  const pattern = classifyPlay(hand);
  if (!pattern.ok) return [];
  if (!state.players.every((otherPlayer) => otherPlayer.hand.length === hand.length)) return [];
  return hand;
}

// 判断是否为末手且整手本身就是合法首发牌型。
function isFinalTrickLegalLead(playerId) {
  const player = getPlayer(playerId);
  if (!player) return false;
  return getFinalTrickLegalLeadCards(playerId).length === player.hand.length;
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
  if (!Array.isArray(state.playHistory)) {
    state.playHistory = [];
  }
  state.playHistory.push(...playedCards.map((card) => ({ ...card })));
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
      const winningPlay = state.lastTrick.plays.find((play) => play.playerId === winnerId);
      const bottomScoreInfo = getBottomScoreInfo(winningPlay?.cards || []);
      const bottomBasePoints = Math.min(
        getCardsPointTotal(state.bottomCards),
        25
      );
      const bottomPoints = bottomBasePoints * bottomScoreInfo.multiplier;
      if (bottomPoints > 0) {
        winner.roundPoints += bottomPoints;
        if (!isFriendTeamResolved()) {
          winner.capturedPoints += bottomPoints;
        }
        if (isFriendTeamResolved()) {
          state.defenderPoints += bottomPoints;
        }
        appendLog(TEXT.log.finalBottomScore(
          bottomBasePoints,
          bottomScoreInfo.multiplier,
          bottomPoints,
          bottomScoreInfo.label
        ));
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

function formatAiDecisionLogNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return String(Math.round(value * 100) / 100);
}

function formatAiDecisionExportEntry(entry, index) {
  if (!entry) return `${index + 1}. （空记录）`;
  const playerName = getPlayer(entry.playerId)?.name || `玩家${entry.playerId || "?"}`;
  const modeLabel = entry.mode === "follow" ? "跟牌" : "首发";
  const trickLabel = entry.recordedAtTrickNumber ? `第 ${entry.recordedAtTrickNumber} 轮` : "轮次未知";
  const turnLabel = entry.recordedAtTurnId ? `行动位 玩家${entry.recordedAtTurnId}` : "行动位未知";
  const primary = entry.objective?.primary || "--";
  const secondary = entry.objective?.secondary || "--";
  const selectedCards = Array.isArray(entry.selectedCards) && entry.selectedCards.length > 0
    ? entry.selectedCards.map(shortCardLabel).join("、")
    : "无";
  const stats = entry.debugStats || {};
  const topCandidates = Array.isArray(entry.candidateEntries)
    ? entry.candidateEntries.slice(0, 3).map((candidate, candidateIndex) => {
      const cards = Array.isArray(candidate.cards) && candidate.cards.length > 0
        ? candidate.cards.map(shortCardLabel).join("、")
        : "无";
      const flags = Array.isArray(candidate.rolloutTriggerFlags) && candidate.rolloutTriggerFlags.length > 0
        ? candidate.rolloutTriggerFlags.join(" / ")
        : "无";
      return `  - 候选${candidateIndex + 1}: ${cards} | 总分 ${formatAiDecisionLogNumber(candidate.score)} | 启发式 ${formatAiDecisionLogNumber(candidate.heuristicScore)} | rollout ${formatAiDecisionLogNumber(candidate.rolloutScore)} | future ${formatAiDecisionLogNumber(candidate.rolloutFutureDelta)} | 深度 ${candidate.rolloutDepth ?? 0} | 触发 ${flags}`;
    })
    : [];

  return [
    `${index + 1}. ${trickLabel} · ${turnLabel} · ${playerName} ${modeLabel}`,
    `   目标：${primary} / ${secondary}`,
    `   选择：${selectedCards}`,
    `   结果：总分 ${formatAiDecisionLogNumber(entry.selectedScore)} · 来源 ${entry.selectedSource || "--"} · 标签 ${(entry.selectedTags || []).join(" / ") || "无"}`,
    `   调试：耗时 ${formatAiDecisionLogNumber(entry.decisionTimeMs)}ms · 候选 ${stats.candidateCount ?? 0} 个 · 最深 ${stats.maxRolloutDepth ?? 0} 层 · 双层前瞻 ${stats.extendedRolloutCount ?? 0} 个`,
    ...topCandidates,
  ].join("\n");
}

function getAiDecisionHistoryExportLines() {
  if (!Array.isArray(state.aiDecisionHistory) || state.aiDecisionHistory.length === 0) {
    return ["（无记录）"];
  }
  return state.aiDecisionHistory.map((entry, index) => formatAiDecisionExportEntry(entry, index));
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
  if (isAiDecisionDebugEnabled()) {
    lines.push("");
    lines.push("AI 决策记录：");
    lines.push(...getAiDecisionHistoryExportLines());
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
