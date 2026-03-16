// 生成准备阶段显示的开始提示文案。
function getReadyStartMessage() {
  return "开始游戏将从2重新开始。继续游戏可继续之前的级别。";
}

/**
 * 作用：
 * 判断当前是否应该显示 PC 端准备阶段的独立开始界面。
 *
 * 为什么这样写：
 * PC 新版首页把“开始游戏 / 继续游戏 / 查看规则”从中央操作条里独立出来，
 * 用单独 helper 统一显示条件，可以避免不同渲染入口各自维护一套 ready 判断。
 *
 * 输入：
 * @param {void} - 直接读取当前平台和全局状态。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应显示 PC 开始界面。
 *
 * 注意：
 * - 仅 PC 平台显示该开始界面，mobile 继续沿用原有入口。
 * - 只要离开 `ready` 阶段，就必须立即隐藏，避免遮住正式牌局。
 */
function shouldShowPcReadyLobby() {
  return APP_PLATFORM === "pc" && state.phase === "ready" && !state.gameOver;
}

/**
 * 作用：
 * 判断当前是否应该显示 PC 顶部的更多功能菜单。
 *
 * 为什么这样写：
 * 顶部工具区改成“高频图标 + 更多菜单”后，菜单显示条件需要统一收口，
 * 否则不同按钮和渲染入口各自判断，容易出现 ready 阶段或移动端误显示。
 *
 * 输入：
 * @param {void} - 直接读取当前平台和全局状态。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应显示桌面端更多功能菜单。
 *
 * 注意：
 * - 仅 PC 平台显示该菜单。
 * - ready 阶段由独立开始界面接管入口，因此这里必须返回 `false`。
 */
function shouldShowPcToolbarMenu() {
  return APP_PLATFORM === "pc" && state.phase !== "ready" && !state.gameOver && !!state.showToolbarMenu;
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

/**
 * 作用：
 * 返回当前对局日志应展示的节奏档位名称。
 *
 * 为什么这样写：
 * AI 难度和节奏现在都属于开局配置；把节奏标签也写进日志头，
 * 后续复盘时才能区分“决策变了”还是“只是节奏更快了”。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态。
 *
 * 输出：
 * @returns {string} 当前节奏档位对应的中文标签。
 *
 * 注意：
 * - 这里复用共享层的标签 helper，不单独维护第二份映射。
 * - 未知值必须退回到默认慢档。
 */
function getAiPaceLogLabel() {
  return getAiPaceLabel(state.aiPace);
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
  appendLog(`对局节奏：${getAiPaceLogLabel()}`);
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
  state.showToolbarMenu = false;
  state.showBottomPanel = false;
  state.showRulesPanel = false;
  state.logs = [];
  state.allLogs = [];
  state.resultScreenExportLines = [];
  state.gameOver = false;
  state.bottomRevealMessage = "";
  state.bottomRevealCount = 0;
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
  state.selectedSetupOptionKey = null;
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

  render();
}

// 返回自动叫朋友时优先考虑的点数顺序。
function getFriendAutoRankPriority() {
  return getPlayerLevelRank(state.bankerId) === "A" ? ["K", "A"] : ["A", "K"];
}

// 返回自动叫朋友使用的点数组合。
function getFriendAutoRankGroups() {
  return [getFriendAutoRankPriority()];
}

// 返回叫朋友目标牌的兜底方案。
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
  }, getAiPaceDelay("callingFriendDelay"));
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
  queueDealStep(getAiPaceDelay("dealStartDelay"));
}

// 安排下一步发牌流程。
function queueDealStep(delay = getAiPaceDelay("dealStepDelay")) {
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
    queueDealStep(getAiPaceDelay("dealFinishDelay"));
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

/**
 * 作用：
 * 结算无人亮主时，先抓牌玩家翻底后最终定出的主花色和展示张数。
 *
 * 为什么这样写：
 * 翻底是按顺序一张张公开的，碰到级牌或王就应该立即停止继续翻牌；
 * 只有始终没翻到这些“立即定主”牌时，才需要看完整副底牌并按第一次出现的最大牌定主。
 *
 * 输入：
 * @param {number} playerId - 当前负责翻底定主的玩家 ID。
 *
 * 输出：
 * @returns {{playerId:number,suit:string,rank:string|null,count:number,cards:Array,source:string,revealCard:object|null,revealCount:number}} 翻底得到的定主结果。
 *
 * 注意：
 * - `revealCount` 代表公示阶段真正需要翻开的底牌张数。
 * - 若中途翻到王，则本局直接定为无主，后续底牌不再继续公开。
 */
function resolveBottomDeclarationForPlayer(playerId) {
  const playerLevel = getPlayerLevelRank(playerId);
  let highestCard = null;
  let highestWeight = -1;

  for (let revealIndex = 0; revealIndex < state.bottomCards.length; revealIndex += 1) {
    const card = state.bottomCards[revealIndex];
    const currentWeight = getBottomRevealWeight(card);
    if (!highestCard || currentWeight > highestWeight) {
      highestCard = card;
      highestWeight = currentWeight;
    }

    if (card.suit === "joker") {
      return {
        playerId,
        suit: "notrump",
        rank: playerLevel,
        count: 0,
        cards: [],
        source: "bottom",
        revealCard: card,
        revealCount: revealIndex + 1,
      };
    }

    if (card.rank === playerLevel && card.suit !== "joker") {
      return {
        playerId,
        suit: card.suit,
        rank: playerLevel,
        count: 0,
        cards: [],
        source: "bottom",
        revealCard: card,
        revealCount: revealIndex + 1,
      };
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
      revealCount: 0,
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
    revealCount: state.bottomCards.length,
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
    state.bottomRevealCount = bottomDeclaration.revealCount || 0;
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

  state.bottomRevealCount = 0;
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
  const suitOptions = SUITS.flatMap((suit) => {
    const cards = player.hand.filter((card) => card.suit === suit && card.rank === playerLevel);
    const options = [];
    if (cards.length >= 2) {
      options.push({
        playerId,
        suit,
        rank: playerLevel,
        count: 2,
        cards: cards.slice(0, 2),
      });
    }
    if (cards.length >= 3) {
      options.push({
        playerId,
        suit,
        rank: playerLevel,
        count: 3,
        cards: cards.slice(0, 3),
      });
    }
    return options;
  });

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

/**
 * 作用：
 * 按当前阶段返回玩家真正可以操作的亮主 / 反主候选项列表。
 *
 * 为什么这样写：
 * 亮主按钮现在需要把“所有当前合法可选项”直接列给玩家挑选，
 * 不能再只取一个最高档方案；把阶段过滤统一收口后，
 * UI、提示文案和点击逻辑都能共用同一份候选结果，避免出现“文案写能亮、实际不能点”的分叉。
 *
 * 输入：
 * @param {number} playerId - 需要查询候选项的玩家 ID。
 * @param {string} phase - 当前要按哪个阶段筛选候选项，默认读取共享状态。
 *
 * 输出：
 * @returns {object[]} 已按优先级排好序的合法候选项列表。
 *
 * 注意：
 * - 发牌阶段和最后反主阶段都只返回当前能压过现有亮主的方案。
 * - 最后反主阶段若还没轮到该玩家，必须直接返回空数组。
 */
function getAvailableSetupOptionsForPlayer(playerId, phase = state.phase) {
  const options = getDeclarationOptions(playerId);
  if (phase === "countering") {
    if (state.currentTurnId !== playerId) return [];
    return options.filter((entry) => canOverrideDeclaration(entry, state.declaration));
  }
  if (phase === "dealing") {
    return options.filter((entry) => canOverrideDeclaration(entry, state.declaration));
  }
  return [];
}

/**
 * 作用：
 * 为单个亮主 / 反主候选项生成稳定的选中键值。
 *
 * 为什么这样写：
 * 玩家现在可以在多个候选项之间来回切换；
 * 用展示牌 ID 组合生成稳定 key，既能区分 `2 张` 和 `3 张` 方案，
 * 又能在重新渲染时安全找回同一个选项。
 *
 * 输入：
 * @param {object} entry - 单个亮主或反主候选项。
 *
 * 输出：
 * @returns {string} 可直接写入 DOM 和共享状态的唯一键值；若候选项无效则返回空字符串。
 *
 * 注意：
 * - 会把展示牌 ID 排序后再拼接，避免手牌顺序变化导致 key 漂移。
 * - key 仅用于当前局内的人类操作选择，不作为长期存储字段。
 */
function getSetupOptionKey(entry) {
  if (!entry) return "";
  const cardIds = Array.isArray(entry.cards) ? entry.cards.map((card) => card.id).sort().join(",") : "";
  return `${entry.playerId || 0}:${entry.suit}:${entry.count}:${cardIds}`;
}

/**
 * 作用：
 * 把玩家当前选中的亮主 / 反主候选项写回共享状态。
 *
 * 为什么这样写：
 * 交互层现在需要支持“先看所有方案，再点其中一项，再确认亮牌”；
 * 单独做一个选择入口后，按钮文案、候选列表高亮和最终执行动作都能读取同一份状态。
 *
 * 输入：
 * @param {number} playerId - 当前要选择候选项的玩家 ID。
 * @param {string} optionKey - 目标候选项的稳定键值。
 * @param {string} phase - 当前要按哪个阶段验证候选项，默认读取共享状态。
 *
 * 输出：
 * @returns {?object} 选中成功时返回对应候选项，否则返回 `null`。
 *
 * 注意：
 * - 若传入的 key 已失效，必须自动清空选中状态，避免 UI 残留旧高亮。
 * - 这里只负责记录选择，不直接执行亮主或反主。
 */
function selectSetupOptionForPlayer(playerId, optionKey, phase = state.phase) {
  const options = getAvailableSetupOptionsForPlayer(playerId, phase);
  const selected = options.find((entry) => getSetupOptionKey(entry) === optionKey) || null;
  state.selectedSetupOptionKey = selected ? optionKey : null;
  return selected;
}

/**
 * 作用：
 * 返回玩家当前应当使用的亮主 / 反主候选项。
 *
 * 为什么这样写：
 * 候选列表需要支持“默认选最高档，但尊重玩家刚刚手动改选”的体验；
 * 这里统一处理回落逻辑，渲染层就不必重复判断“当前选中项是否还合法”。
 *
 * 输入：
 * @param {number} playerId - 需要读取当前候选项的玩家 ID。
 * @param {string} phase - 当前要按哪个阶段取候选项，默认读取共享状态。
 *
 * 输出：
 * @returns {?object} 当前选中的合法候选项；若没有则返回 `null`。
 *
 * 注意：
 * - 当旧选项失效时，会自动回退到当前列表第一项。
 * - 回退时不会主动写回状态，避免只因渲染就覆盖玩家手动选择。
 */
function getSelectedSetupOptionForPlayer(playerId, phase = state.phase) {
  const options = getAvailableSetupOptionsForPlayer(playerId, phase);
  if (options.length === 0) return null;
  const selected = state.selectedSetupOptionKey
    ? options.find((entry) => getSetupOptionKey(entry) === state.selectedSetupOptionKey) || null
    : null;
  return selected || options[0];
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
function countCommonTrumpCardsForPlayer(playerId, levelRank = getPlayerLevelRank(playerId)) {
  const player = getPlayer(playerId);
  if (!player) return 0;
  return player.hand.filter((card) => card.suit === "joker" || card.rank === levelRank).length;
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
function countTrumpCardsForDeclaration(playerId, declaration, levelRank = getPlayerLevelRank(playerId)) {
  const player = getPlayer(playerId);
  if (!player || !declaration) return 0;
  if (declaration.suit === "notrump") {
    return countCommonTrumpCardsForPlayer(playerId, levelRank);
  }
  return player.hand.filter((card) =>
    card.suit === "joker" || card.rank === levelRank || card.suit === declaration.suit
  ).length;
}

/**
 * 作用：
 * 统计指定亮主方案下的主牌控制力分值。
 *
 * 为什么这样写：
 * 中级亮主第一阶段不做完整搜索，但需要至少能区分“主牌很多”和“主牌真正有控制力”。
 * 这里用一个轻量权重，把王、级牌和主花色高张折算成可比较的分数，
 * 让中级在同档位亮主时优先选择更能控牌的方案。
 *
 * 输入：
 * @param {number} playerId - 需要评估控制力的玩家 ID。
 * @param {object} declaration - 候选亮主方案。
 * @param {string} levelRank - 该方案下生效的级牌点数。
 *
 * 输出：
 * @returns {number} 该方案对应的主牌控制力分值。
 *
 * 注意：
 * - 这里只是启发式控制力，不等价于真实胜率。
 * - 无主时只统计常主控制力，不把普通花色 A/K 算成主控。
 */
function getTrumpControlScoreForDeclaration(playerId, declaration, levelRank = getPlayerLevelRank(playerId)) {
  const player = getPlayer(playerId);
  if (!player || !declaration) return 0;

  return player.hand.reduce((sum, card) => {
    if (card.suit === "joker") {
      return sum + (card.rank === "RJ" ? 10 : 9);
    }
    if (card.rank === levelRank) {
      return sum + (declaration.suit !== "notrump" && card.suit === declaration.suit ? 8 : 7);
    }
    if (declaration.suit === "notrump" || card.suit !== declaration.suit) {
      return sum;
    }
    return sum + ({
      A: 6,
      K: 4,
      Q: 2,
      J: 1,
      "10": 1,
    }[card.rank] || 0);
  }, 0);
}

/**
 * 作用：
 * 统计指定亮主方案下仍作为副牌保留的高控制牌数量。
 *
 * 为什么这样写：
 * 中级第一阶段除了看主牌本身，还需要稍微看一下副牌的续航能力。
 * 这里把非主门中的 A / K 视为基础副牌控制资源，用来区分“主够长但副牌全碎”
 * 和“主副都还能组织”的方案。
 *
 * 输入：
 * @param {number} playerId - 需要评估副牌控制的玩家 ID。
 * @param {object} declaration - 候选亮主方案。
 * @param {string} levelRank - 该方案下生效的级牌点数。
 *
 * 输出：
 * @returns {number} 方案下保留下来的副牌 A / K 数量。
 *
 * 注意：
 * - 级牌若在该方案下变成主牌，不再计入副牌控制。
 * - 无主时，只有非级牌的 A / K 会计入这里。
 */
function countSideControlCardsForDeclaration(playerId, declaration, levelRank = getPlayerLevelRank(playerId)) {
  const player = getPlayer(playerId);
  if (!player || !declaration) return 0;
  return player.hand.filter((card) => {
    if (!["A", "K"].includes(card.rank)) return false;
    if (card.suit === "joker") return false;
    if (card.rank === levelRank) return false;
    if (declaration.suit !== "notrump" && card.suit === declaration.suit) return false;
    return true;
  }).length;
}

/**
 * 作用：
 * 统计指定亮主方案下的短门潜力或无主短板。
 *
 * 为什么这样写：
 * 中级亮主时需要简单区分“这门主适不适合做短门将吃”和“打无主会不会太失衡”。
 * 这里统一把各副门剩余数量做一次压缩统计，给中级评分器一个轻量结构信号。
 *
 * 输入：
 * @param {number} playerId - 需要评估结构的玩家 ID。
 * @param {object} declaration - 候选亮主方案。
 * @param {string} levelRank - 该方案下生效的级牌点数。
 *
 * 输出：
 * @returns {{shortSuitCount:number, voidSuitCount:number, noTrumpFragileCount:number}} 副门结构统计结果。
 *
 * 注意：
 * - 花色主时，`shortSuitCount` 与 `voidSuitCount` 越高，通常越利于后续做短门。
 * - 无主时，`noTrumpFragileCount` 越高，通常说明结构越容易断。
 */
function getSideSuitStructureForDeclaration(playerId, declaration, levelRank = getPlayerLevelRank(playerId)) {
  const player = getPlayer(playerId);
  if (!player || !declaration) {
    return {
      shortSuitCount: 0,
      voidSuitCount: 0,
      noTrumpFragileCount: 0,
    };
  }

  const sideCounts = SUITS.reduce((acc, suit) => {
    acc[suit] = 0;
    return acc;
  }, {});

  for (const card of player.hand) {
    if (card.suit === "joker") continue;
    if (card.rank === levelRank) continue;
    if (declaration.suit !== "notrump" && card.suit === declaration.suit) continue;
    sideCounts[card.suit] += 1;
  }

  const counts = Object.values(sideCounts);
  return {
    shortSuitCount: counts.filter((count) => count > 0 && count <= 2).length,
    voidSuitCount: counts.filter((count) => count === 0).length,
    noTrumpFragileCount: counts.filter((count) => count <= 1).length,
  };
}

/**
 * 作用：
 * 统计无主方案下的花色均衡性和高张覆盖情况。
 *
 * 为什么这样写：
 * 中级第一阶段要把“无主适配”从单纯常主数量，升级成“常主 + 花色覆盖 + 均衡度”的轻量判断。
 * 这样才能区分“只有王和级牌但副牌很碎”的无主，和“常主够硬且副牌分布均衡”的无主。
 *
 * 输入：
 * @param {number} playerId - 需要评估无主适配的玩家 ID。
 * @param {string} levelRank - 该方案下生效的级牌点数。
 *
 * 输出：
 * @returns {{coveredControlSuitCount:number, imbalancePenalty:number}} 无主均衡性统计结果。
 *
 * 注意：
 * - 这里只统计非常主的普通花色牌分布。
 * - `coveredControlSuitCount` 只看各花色里是否至少有一张 A 或 K。
 */
function getNoTrumpBalanceMetricsForDeclaration(playerId, levelRank = getPlayerLevelRank(playerId)) {
  const player = getPlayer(playerId);
  if (!player) {
    return {
      coveredControlSuitCount: 0,
      imbalancePenalty: 0,
    };
  }

  const suitCounts = SUITS.reduce((acc, suit) => {
    acc[suit] = 0;
    return acc;
  }, {});
  const controlSuits = new Set();

  for (const card of player.hand) {
    if (card.suit === "joker" || card.rank === levelRank) continue;
    suitCounts[card.suit] += 1;
    if (card.rank === "A" || card.rank === "K") {
      controlSuits.add(card.suit);
    }
  }

  const counts = Object.values(suitCounts);
  const maxCount = Math.max(...counts, 0);
  const minCount = Math.min(...counts, 0);
  return {
    coveredControlSuitCount: controlSuits.size,
    imbalancePenalty: Math.max(0, maxCount - minCount),
  };
}

/**
 * 作用：
 * 生成中级亮主评估使用的结构拆解。
 *
 * 为什么这样写：
 * 中级亮主的评分和 debug 解释项都依赖同一组基础特征，
 * 先把这些特征收敛成统一 breakdown，可以避免“评分逻辑”和“解释逻辑”各算一套导致脱节。
 *
 * 输入：
 * @param {number} playerId - 需要评估亮主方案的玩家 ID。
 * @param {object} declaration - 候选亮主方案。
 * @param {string} levelRank - 该方案下生效的级牌点数。
 *
 * 输出：
 * @returns {object} 中级亮主评估所需的特征拆解。
 *
 * 注意：
 * - breakdown 里的分值既服务于评分，也会直接展示在 debug 面板里。
 * - 无主与有主共用一套输出字段，未使用项会返回 0。
 */
function buildIntermediateDeclarationBreakdown(playerId, declaration, levelRank = getPlayerLevelRank(playerId)) {
  const trumpCount = countTrumpCardsForDeclaration(playerId, declaration, levelRank);
  const commonTrumpCount = countCommonTrumpCardsForPlayer(playerId, levelRank);
  const trumpControlScore = getTrumpControlScoreForDeclaration(playerId, declaration, levelRank);
  const sideControlCount = countSideControlCardsForDeclaration(playerId, declaration, levelRank);
  const structure = getSideSuitStructureForDeclaration(playerId, declaration, levelRank);
  const noTrumpBalance = getNoTrumpBalanceMetricsForDeclaration(playerId, levelRank);
  const priorityScore = getDeclarationPriority(declaration) * 4;

  return {
    priorityScore,
    trumpCount,
    commonTrumpCount,
    trumpControlScore,
    sideControlCount,
    shortSuitCount: structure.shortSuitCount,
    voidSuitCount: structure.voidSuitCount,
    noTrumpFragileCount: structure.noTrumpFragileCount,
    coveredControlSuitCount: noTrumpBalance.coveredControlSuitCount,
    imbalancePenalty: noTrumpBalance.imbalancePenalty,
  };
}

/**
 * 作用：
 * 评估中级 AI 在某个亮主方案下的整体适配分。
 *
 * 为什么这样写：
 * 中级第一阶段的目标，是让自动亮主从“只看档位”升级到“开始看这手牌适不适合这样做庄”。
 * 因此这里把主牌数量、主控、副牌控制和短门潜力压成一个轻量分值，
 * 用于在自动亮主时比较不同方案的优先级。
 *
 * 输入：
 * @param {number} playerId - 需要评估亮主方案的玩家 ID。
 * @param {object} declaration - 候选亮主方案。
 * @param {string} levelRank - 该方案下生效的级牌点数。
 *
 * 输出：
 * @returns {number} 中级自动亮主使用的启发式分值。
 *
 * 注意：
 * - 这里的分值只用于同阶段相对比较，不承诺跨阶段可解释。
 * - 无主与有主走不同加权，避免简单地把无主当作“更高档所以更好”。
 */
function scoreIntermediateDeclarationOption(playerId, declaration, levelRank = getPlayerLevelRank(playerId)) {
  const breakdown = buildIntermediateDeclarationBreakdown(playerId, declaration, levelRank);

  if (declaration.suit === "notrump") {
    return breakdown.priorityScore
      + breakdown.commonTrumpCount * 12
      + breakdown.trumpControlScore * 4
      + breakdown.sideControlCount * 4
      + breakdown.coveredControlSuitCount * 6
      - breakdown.noTrumpFragileCount * 8
      - breakdown.imbalancePenalty * 4
      + (breakdown.commonTrumpCount >= 4 ? 12 : -18);
  }

  return breakdown.priorityScore
    + breakdown.trumpCount * 9
    + breakdown.trumpControlScore * 4
    + breakdown.sideControlCount * 3
    + breakdown.shortSuitCount * 6
    + breakdown.voidSuitCount * 4
    + (declaration.count === 3 ? 12 : 0);
}

/**
 * 作用：
 * 判断中级 AI 是否应该延迟当前的两张亮主方案。
 *
 * 为什么这样写：
 * 文档里“中级第一阶段”明确要求支持低价值两张方案的延迟亮主。
 * 这里不做复杂概率计算，只用一个简单近似：
 * 当前仍在发牌、自己后面还有明显摸牌次数、而且这手两张方案评分不高时，先不急着亮。
 *
 * 输入：
 * @param {number} playerId - 需要评估是否延迟亮主的玩家 ID。
 * @param {object} declaration - 当前最优候选亮主方案。
 *
 * 输出：
 * @returns {boolean} `true` 表示中级 AI 应先继续等牌。
 *
 * 注意：
 * - 只在当前还没有人亮主时才延迟，避免错失抢亮时机。
 * - 这里只处理两张方案；三张方案默认不延迟。
 */
function shouldDelayDeclarationForIntermediate(playerId, declaration) {
  const player = getPlayer(playerId);
  if (!player || !declaration) return false;
  if (state.phase !== "dealing" || state.declaration) return false;
  if (declaration.count !== 2) return false;

  const remainingOwnDraws = Math.max(0, 31 - player.hand.length);
  if (remainingOwnDraws < 3) return false;

  const trumpCount = countTrumpCardsForDeclaration(playerId, declaration);
  const sideControlCount = countSideControlCardsForDeclaration(playerId, declaration);
  if (declaration.suit === "notrump") {
    const commonTrumpCount = countCommonTrumpCardsForPlayer(playerId);
    return commonTrumpCount <= 3 && sideControlCount <= 2;
  }
  return trumpCount <= 5 && sideControlCount <= 2;
}

/**
 * 作用：
 * 为中级及高级自动亮主流程生成候选方案及其解释项。
 *
 * 为什么这样写：
 * 亮主 debug 需要看到“为什么选这门主”，而不只是最终结果。
 * 这里把候选声明的评分、延迟标记和结构拆解统一整理出来，
 * 既能给自动流程排序，也能直接喂给调试面板展示。
 *
 * 输入：
 * @param {number} playerId - 需要自动亮主的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 已按分值排序的亮主候选项列表。
 *
 * 注意：
 * - `delaySuggested` 只代表中级当前更倾向继续等牌，不等于这手不合法。
 * - 当前高级暂时复用同一套候选构建逻辑。
 */
function buildIntermediateDeclarationCandidateEntries(playerId) {
  const options = getDeclarationOptions(playerId);
  if (options.length === 0) return [];

  return options
    .map((entry) => {
      const breakdown = buildIntermediateDeclarationBreakdown(playerId, entry);
      const score = scoreIntermediateDeclarationOption(playerId, entry);
      const delaySuggested = shouldDelayDeclarationForIntermediate(playerId, entry);
      const tags = [
        entry.suit === "notrump" ? `常主 ${breakdown.commonTrumpCount}` : `总主 ${breakdown.trumpCount}`,
        delaySuggested ? "建议继续等牌" : "可立即出手",
      ];
      return {
        entry,
        cards: cloneSetupDebugValue(entry.cards || []),
        source: entry.suit === "notrump" ? "notrump-fit" : "trump-fit",
        tags,
        score,
        heuristicScore: score,
        rolloutScore: null,
        rolloutFutureDelta: null,
        rolloutDepth: 0,
        rolloutTriggerFlags: delaySuggested ? ["低价值两张，继续等牌"] : ["当前可立即亮主"],
        delaySuggested,
        breakdown,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getDeclarationPriority(b.entry) - getDeclarationPriority(a.entry);
    });
}

/**
 * 作用：
 * 为中级及高级自动流程选出最适合的亮主方案。
 *
 * 为什么这样写：
 * 人类提示仍应保留“最高档合法方案”的直觉表达，但 AI 自动亮主需要开始比较同档位方案的质量。
 * 因此这里专门给自动流程做一层评分排序，并支持中级阶段的低价值延迟亮主。
 *
 * 输入：
 * @param {number} playerId - 需要自动亮主的玩家 ID。
 *
 * 输出：
 * @returns {?object} 自动流程最终愿意采用的亮主方案；没有则返回 `null`。
 *
 * 注意：
 * - 当前高级暂时复用这套中级自动亮主逻辑，后续再叠加更强策略。
 * - 这里只有自动流程使用，人类按钮仍可依据合法方案自行决定。
 */
function getBestAutoDeclarationForIntermediate(playerId) {
  const candidateEntries = buildIntermediateDeclarationCandidateEntries(playerId);
  const best = candidateEntries[0] || null;
  if (!best || best.delaySuggested) return null;
  return best.entry;
}

/**
 * 作用：
 * 为中级及高级自动反主流程生成候选方案及其解释项。
 *
 * 为什么这样写：
 * 反主 debug 的核心不是“它能不能反”，而是“它为什么觉得这次反主值不值”。
 * 这里把每个候选反主方案相对当前亮主的提升值一起算出来，方便同时用于自动阈值和调试面板展示。
 *
 * 输入：
 * @param {number} playerId - 需要自动反主的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 已按分值排序的反主候选项列表。
 *
 * 注意：
 * - 当前亮主的适配按当前生效级牌计算，不是按玩家自己的等级计算。
 * - `improvement` 偏低时，即使候选合法，也可能在自动流程里被直接跳过。
 */
function buildIntermediateCounterCandidateEntries(playerId) {
  const current = state.declaration;
  if (!current) return [];
  const options = getDeclarationOptions(playerId).filter((entry) => canOverrideDeclaration(entry, current));
  if (options.length === 0) return [];

  const currentBreakdown = buildIntermediateDeclarationBreakdown(playerId, current, current.rank);
  const currentScore = scoreIntermediateDeclarationOption(playerId, current, current.rank);
  return options
    .map((entry) => {
      const breakdown = buildIntermediateDeclarationBreakdown(playerId, entry);
      const declarationScore = scoreIntermediateDeclarationOption(playerId, entry);
      const improvement = declarationScore - currentScore;
      const score = scoreIntermediateCounterOption(playerId, entry, current);
      const tags = [
        `提升 ${Math.round(improvement * 100) / 100}`,
        improvement >= 18 ? "值得反主" : "提升偏小",
      ];
      return {
        entry,
        cards: cloneSetupDebugValue(entry.cards || []),
        source: entry.suit === "notrump" ? "counter-notrump-fit" : "counter-trump-fit",
        tags,
        score,
        heuristicScore: score,
        rolloutScore: null,
        rolloutFutureDelta: null,
        rolloutDepth: 0,
        rolloutTriggerFlags: improvement >= 18 ? ["提升明确，可反主"] : ["提升偏小，建议不反"],
        improvement,
        breakdown: {
          ...breakdown,
          currentScore,
          currentPriority: currentBreakdown.priorityScore,
        },
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getDeclarationPriority(b.entry) - getDeclarationPriority(a.entry);
    });
}

/**
 * 作用：
 * 评估中级 AI 是否值得用某个方案反主。
 *
 * 为什么这样写：
 * 中级第一阶段的反主目标，不是“有更大就反”，而是“反完后自己的庄位质量有没有明显提升”。
 * 这里通过比较玩家在当前亮主和新方案下的手牌适配差，再叠加新方案自身分数，
 * 让中级 AI 对低收益反主更保守。
 *
 * 输入：
 * @param {number} playerId - 需要评估反主方案的玩家 ID。
 * @param {object} declaration - 候选反主方案。
 * @param {object} current - 当前桌面的亮主方案。
 *
 * 输出：
 * @returns {number} 中级自动反主使用的启发式分值。
 *
 * 注意：
 * - 当前亮主的手牌适配按它自己的级牌来计算，因为真正生效的主体系就是那套。
 * - 这里只用于自动反主阈值，不影响人类是否能看到合法反主按钮。
 */
function scoreIntermediateCounterOption(playerId, declaration, current) {
  if (!declaration || !current) return -Infinity;
  const declarationScore = scoreIntermediateDeclarationOption(playerId, declaration, getPlayerLevelRank(playerId));
  const currentScore = scoreIntermediateDeclarationOption(playerId, current, current.rank);
  const priorityDelta = getDeclarationPriority(declaration) - getDeclarationPriority(current);
  const improvement = declarationScore - currentScore;
  return declarationScore + improvement * 1.4 + priorityDelta * 10;
}

/**
 * 作用：
 * 为中级及高级自动流程选出最适合的反主方案。
 *
 * 为什么这样写：
 * 中级第一阶段需要先把“合法反主”与“值得自动反主”区分开。
 * 这里会在所有可压住当前亮主的方案中选分最高的一手，并在分值过低时直接选择不反。
 *
 * 输入：
 * @param {number} playerId - 需要自动反主的玩家 ID。
 *
 * 输出：
 * @returns {?object} 自动流程最终愿意采用的反主方案；没有则返回 `null`。
 *
 * 注意：
 * - 当前高级暂时复用这套中级自动反主逻辑，后续再增加行为推断层。
 * - 分值阈值偏保守，目的是先过滤“能反但明显不值”的场景。
 */
function getBestAutoCounterDeclarationForIntermediate(playerId) {
  const candidateEntries = buildIntermediateCounterCandidateEntries(playerId);
  const best = candidateEntries[0];
  if (!best || best.improvement < 18 || best.score < 120) return null;
  return best.entry;
}

/**
 * 作用：
 * 为声明阶段的 debug 记录做轻量数据克隆。
 *
 * 为什么这样写：
 * 声明阶段的调试记录只需要保留纯数据快照，不需要依赖出牌搜索里的专用 clone helper。
 * 单独保留一个本地轻量版本，可以让 `game.js` 在测试环境里独立运行。
 *
 * 输入：
 * @param {any} value - 需要浅层递归复制的调试数据。
 *
 * 输出：
 * @returns {any} 不再共享引用的轻量副本。
 *
 * 注意：
 * - 这里只处理声明调试会用到的普通对象、数组和基础类型。
 * - 函数与特殊对象不会被保留，当前场景也不需要它们。
 */
function cloneSetupDebugValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSetupDebugValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, cloneSetupDebugValue(entryValue)])
  );
}

/**
 * 作用：
 * 判断两组声明展示牌是否表示同一个候选方案。
 *
 * 为什么这样写：
 * 声明阶段的候选比较只需要看展示牌的 ID 组合，不需要依赖出牌搜索里的组合 key helper。
 * 单独做一层本地比较，可以让 setup 决策逻辑在测试环境里独立运行。
 *
 * 输入：
 * @param {object[]} cardsA - 第一组候选展示牌。
 * @param {object[]} cardsB - 第二组候选展示牌。
 *
 * 输出：
 * @returns {boolean} `true` 表示两组牌可视为同一个候选方案。
 *
 * 注意：
 * - 会先按牌 ID 排序再比较，避免顺序差异影响结果。
 * - 空数组只会和另一组空数组判定相同。
 */
function areSetupCandidateCardsEqual(cardsA, cardsB) {
  const idsA = Array.isArray(cardsA) ? cardsA.map((card) => card.id).sort() : [];
  const idsB = Array.isArray(cardsB) ? cardsB.map((card) => card.id).sort() : [];
  if (idsA.length !== idsB.length) return false;
  return idsA.every((id, index) => id === idsB[index]);
}

/**
 * 作用：
 * 把亮主 / 反主候选项记录进现有 AI debug 历史。
 *
 * 为什么这样写：
 * 这次中级阶段希望直接复用现有 debug 面板，而不是再造一个单独的声明调试区。
 * 因此只要把声明阶段的候选项整理成与出牌决策相近的结构，就能无缝显示“选了什么、为什么没选别的”。
 *
 * 输入：
 * @param {number} playerId - 记录决策的 AI 玩家 ID。
 * @param {string} mode - `"declare"` 或 `"counter"`。
 * @param {Array<object>} candidateEntries - 已排序的候选方案列表。
 * @param {?object} selectedEntry - 最终采用的候选项；若为空表示本轮选择观望或不反。
 *
 * 输出：
 * @returns {void} 直接把调试快照写入共享状态。
 *
 * 注意：
 * - 仅在 debug 面板开启时记录，避免声明阶段不断追加无用历史。
 * - `selectedCards` 为空时，调试面板会显示“无”，用来表达延迟亮主或选择不反。
 */
function recordSetupDecisionSnapshot(playerId, mode, candidateEntries, selectedEntry) {
  if (!isAiDecisionDebugEnabled() || !playerId || !Array.isArray(candidateEntries) || candidateEntries.length === 0) return;
  const modeLabel = mode === "counter" ? "counter" : "declare";
  const selected = selectedEntry || null;
  const snapshot = {
    historyId: (state.aiDecisionHistorySeq || 0) + 1,
    recordedAtTrickNumber: state.trickNumber || null,
    recordedAtTurnId: state.currentTurnId || null,
    playerId,
    mode: modeLabel,
    objective: {
      primary: mode === "counter" ? "secure_banker" : "choose_trump",
      secondary: selected?.entry?.suit === "notrump" ? "no_trump_fit" : "long_trump",
    },
    evaluation: {
      total: selected?.score ?? null,
      objective: {
        primary: mode === "counter" ? "secure_banker" : "choose_trump",
        secondary: selected?.entry?.suit === "notrump" ? "no_trump_fit" : "long_trump",
      },
      breakdown: cloneSetupDebugValue(selected?.breakdown || null),
    },
    candidateEntries: candidateEntries.slice(0, 5).map((entry) => ({
      cards: cloneSetupDebugValue(entry.cards || []),
      source: entry.source || null,
      tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
      score: typeof entry.score === "number" ? entry.score : null,
      heuristicScore: typeof entry.heuristicScore === "number" ? entry.heuristicScore : null,
      rolloutScore: null,
      rolloutFutureDelta: null,
      rolloutDepth: 0,
      rolloutReachedOwnTurn: false,
      rolloutTriggerFlags: Array.isArray(entry.rolloutTriggerFlags) ? [...entry.rolloutTriggerFlags] : [],
      rolloutEvaluation: {
        total: entry.score,
        objective: {
          primary: mode === "counter" ? "secure_banker" : "choose_trump",
          secondary: entry.entry?.suit === "notrump" ? "no_trump_fit" : "long_trump",
        },
        breakdown: cloneSetupDebugValue(entry.breakdown),
      },
      rolloutFutureEvaluation: null,
    })),
    filteredCandidateEntries: [],
    selectedSource: selected?.source || null,
    selectedTags: Array.isArray(selected?.tags) ? [...selected.tags] : [mode === "counter" ? "选择不反" : "继续等牌"],
    selectedScore: typeof selected?.score === "number" ? selected.score : null,
    selectedCards: cloneSetupDebugValue(selected?.cards || []),
    selectedBreakdown: cloneSetupDebugValue(selected?.breakdown || null),
    debugStats: {
      candidateCount: candidateEntries.length,
      maxRolloutDepth: 0,
      extendedRolloutCount: 0,
    },
    decisionTimeMs: 0,
  };
  state.aiDecisionHistorySeq = snapshot.historyId;
  state.lastAiDecision = snapshot;
  state.aiDecisionHistory = [...(state.aiDecisionHistory || []), snapshot].slice(-120);
}

/**
 * 作用：
 * 判断初级 AI 是否满足自动亮主或自动反主的最小启发式条件。
 *
 * 为什么这样写：
 * 用户要求保留初级现有风格，只做很小的策略修正。
 * 因此这里不引入复杂评分器，只加两条简单门槛：
 * 1. 花色主至少要有足够主牌数量，避免短主硬坐庄。
 * 2. 亮无主 / 反无主至少要有 5 张常主，避免只有少量常主就轻率打无主。
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
 * - 花色主门槛采用“常主 + 主花色合计至少 10 张”。
 * - 亮无主门槛采用“常主至少 5 张”。
 * - 反无主除了至少 5 张常主外，还会比较当前花色主对自己是否已经明显更合适。
 */
function meetsBeginnerAutoDeclarationHeuristic(playerId, declaration, mode = "declare") {
  const player = getPlayer(playerId);
  if (!player || !declaration) return false;

  if (declaration.suit === "notrump") {
    const commonTrumpCount = countCommonTrumpCardsForPlayer(playerId);
    if (commonTrumpCount < 5) return false;
    if (mode !== "counter") return true;
    if (!state.declaration || state.declaration.suit === "notrump") return true;
    const currentTrumpCount = countTrumpCardsForDeclaration(playerId, state.declaration, state.declaration.rank);
    return currentTrumpCount - commonTrumpCount <= 1;
  }

  const trumpCount = countTrumpCardsForDeclaration(playerId, declaration);
  return trumpCount >= 10;
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
  if (state.aiDifficulty === "beginner") {
    const best = getBestDeclarationForPlayer(playerId);
    if (!best) return null;
    return meetsBeginnerAutoDeclarationHeuristic(playerId, best, "declare") ? best : null;
  }
  return getBestAutoDeclarationForIntermediate(playerId);
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
 * - 初级会额外要求反无主时至少拥有 5 张常主。
 * - 其他难度目前继续沿用原有合法最高档方案。
 */
function getAutoCounterDeclarationForPlayer(playerId) {
  if (state.aiDifficulty === "beginner") {
    const best = getCounterDeclarationForPlayer(playerId);
    if (!best) return null;
    return meetsBeginnerAutoDeclarationHeuristic(playerId, best, "counter") ? best : null;
  }
  return getBestAutoCounterDeclarationForIntermediate(playerId);
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
  state.selectedSetupOptionKey = null;
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
  const candidateEntries = state.aiDifficulty === "beginner"
    ? []
    : buildIntermediateDeclarationCandidateEntries(playerId);
  const best = state.aiDifficulty === "beginner"
    ? getAutoDeclarationForPlayer(playerId)
    : candidateEntries.find((entry) => !entry.delaySuggested)?.entry || null;
  if (state.aiDifficulty !== "beginner") {
    const selectedEntry = candidateEntries.find((entry) => best && areSetupCandidateCardsEqual(entry.cards, best.cards || [])) || null;
    recordSetupDecisionSnapshot(playerId, "declare", candidateEntries, selectedEntry);
  }
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
  const candidateEntries = !player?.isHuman && state.aiDifficulty !== "beginner"
    ? buildIntermediateCounterCandidateEntries(state.currentTurnId)
    : [];
  const option = player?.isHuman
    ? getCounterDeclarationForPlayer(state.currentTurnId)
    : (state.aiDifficulty === "beginner"
      ? getAutoCounterDeclarationForPlayer(state.currentTurnId)
      : getBestAutoCounterDeclarationForIntermediate(state.currentTurnId));
  if (!player?.isHuman && state.aiDifficulty !== "beginner") {
    const selectedEntry = candidateEntries.find((entry) => option && areSetupCandidateCardsEqual(entry.cards, option.cards || [])) || null;
    recordSetupDecisionSnapshot(state.currentTurnId, "counter", candidateEntries, selectedEntry);
  }
  if (!option) {
    state.countdown = 0;
    state.aiTimer = window.setTimeout(() => {
      passCounterForCurrentPlayer();
    }, getAiPaceDelay("counterPassDelay"));
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
  }, getAiPaceDelay("counterActionDelay"));
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
  }, getAiPaceDelay("buryDelay"));
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
    }, getAiPaceDelay("turnDelay"));
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
  }, getAiPaceDelay("centerAnnouncementDelay"));
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
      }, getAiPaceDelay("trickFinishDelay"));
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
    }, getAiPaceDelay("trickPauseDelay"));
  }
}

// 结算本轮的获胜玩家。
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

/**
 * 作用：
 * 返回结算页里使用的阵营短标签。
 *
 * 为什么这样写：
 * 结果页现在需要把每位玩家的“打家 / 朋友 / 闲家”直接列出来；
 * 单独收成 helper 后，标题摘要、等级列表和后续日志扩展都能共用同一套阵营口径。
 *
 * 输入：
 * @param {number} playerId - 需要查询的玩家 ID。
 *
 * 输出：
 * @returns {string} 适合结果页展示的阵营短标签。
 *
 * 注意：
 * - 结算前如果朋友仍未站队，会先被标记为 `1 打 4`，这里自然回落成 `闲家`。
 * - 结果页刻意使用 `闲家`，避免继续沿用对普通玩家不够直观的“非打家”说法。
 */
function getResultCampLabel(playerId) {
  if (playerId === state.bankerId) return "打家";
  if (!state.friendTarget?.failed && state.hiddenFriendId === playerId) return "朋友";
  return "闲家";
}

/**
 * 作用：
 * 生成结果页标题里的结算摘要。
 *
 * 为什么这样写：
 * 用户希望在“获胜 / 失败”后立刻看到最关键的结算结果，
 * 例如“打家下台”“升 1 级”“降 1 级”；把判断集中在这里，能避免 UI 层再拼多套分支。
 *
 * 输入：
 * @param {{winner: string, bankerLevels: number, defenderLevels: number}} outcome - 本局结算结果。
 * @param {boolean} humanWon - 玩家本人是否获胜。
 * @param {string} humanLevelBefore - 玩家本人结算前等级。
 * @param {string} humanLevelAfter - 玩家本人结算后等级。
 *
 * 输出：
 * @returns {string} 直接拼到标题后的短结果摘要。
 *
 * 注意：
 * - 结算标题优先表达整局结果：`打家下台 / 闲家升级 / 打家升级 / 小光 / 大光`。
 * - 只有真人玩家自己实际降级时，才用 `降 x 级` 覆盖团队结果，避免漏掉个人损失。
 */
function getResultHeadlineDetail(outcome, humanWon, humanLevelBefore, humanLevelAfter) {
  const levelDelta = getLevelDelta(humanLevelBefore, humanLevelAfter);
  if (!humanWon && levelDelta < 0) return `降${Math.abs(levelDelta)}级`;
  if (outcome.winner === "defender") {
    if (outcome.defenderLevels > 0) return `闲家升${outcome.defenderLevels}级`;
    return "打家下台";
  }
  if (outcome.bankerLevels >= 3) return `大光 - 打家升${outcome.bankerLevels}级`;
  if (outcome.bankerLevels === 2) return `小光 - 打家升${outcome.bankerLevels}级`;
  if (outcome.bankerLevels > 0) return `打家升${outcome.bankerLevels}级`;
  return "守级";
}

/**
 * 作用：
 * 判断结果页里某位玩家是否需要额外显示“升级 / 降级”标签。
 *
 * 为什么这样写：
 * 逐人等级列表除了展示 `LvX -> LvY`，还要把“虽然数字没变，但这次结果本质上是升级”
 * 这类保级位情况显式标出来；集中判断后，列表渲染会更简单也更稳定。
 *
 * 输入：
 * @param {number} playerId - 目标玩家 ID。
 * @param {{winner: string, bankerLevels: number, defenderLevels: number}} outcome - 本局结算结果。
 * @param {Record<number, string>} levelsBefore - 各玩家结算前等级。
 * @param {Record<number, string>} levelsAfter - 各玩家结算后等级。
 *
 * 输出：
 * @returns {string} 需要展示的结果标签；不需要时返回空字符串。
 *
 * 注意：
 * - 实际等级变化优先级最高，先根据 `Lv` 前后值判断。
 * - 保级位卡住升级时，仍返回 `升级`，让玩家知道这局结算结果没有丢。
 */
function getResultLevelChangeLabel(playerId, outcome, levelsBefore, levelsAfter) {
  const levelDelta = getLevelDelta(levelsBefore[playerId], levelsAfter[playerId]);
  if (levelDelta > 0) return "升级";
  if (levelDelta < 0) return "降级";
  const isBankerSide = getResultCampLabel(playerId) !== "闲家";
  if (isBankerSide && outcome.winner === "banker" && outcome.bankerLevels > 0) {
    return "升级";
  }
  if (!isBankerSide && outcome.winner === "defender" && outcome.defenderLevels > 0) {
    return "升级";
  }
  return "";
}

/**
 * 作用：
 * 生成结果页和日志导出共用的逐人等级结算文本行。
 *
 * 为什么这样写：
 * 最终结果弹窗和对局日志都需要展示同一套“玩家名 - 阵营 - LvX -> LvY【结果】”摘要；
 * 先收敛成纯文本行，后续无论渲染 HTML 还是导出纯文本都不会出现两套格式漂移。
 *
 * 输入：
 * @param {{winner: string, bankerLevels: number, defenderLevels: number}} outcome - 本局结算结果。
 * @param {Record<number, string>} levelsBefore - 各玩家结算前等级。
 * @param {Record<number, string>} levelsAfter - 各玩家结算后等级。
 *
 * 输出：
 * @returns {string[]} 逐人等级结算文本行数组。
 *
 * 注意：
 * - 返回值不包含列表序号，方便 HTML 与纯文本导出分别决定外层包装。
 * - 结果标签继续沿用 `【升级】/【降级】`，保证和结果弹窗可视文案一致。
 */
function getResultLevelSummaryRows(outcome, levelsBefore, levelsAfter) {
  return state.players.map((player) => {
    const resultLabel = getResultLevelChangeLabel(player.id, outcome, levelsBefore, levelsAfter);
    const resultSuffix = resultLabel ? `${resultLabel}` : "";
    return `${player.name} - ${getResultCampLabel(player.id)} - Lv${levelsBefore[player.id]} -> Lv${levelsAfter[player.id]}${resultSuffix}`;
  });
}

/**
 * 作用：
 * 返回结果页阵营胶囊使用的样式键值。
 *
 * 为什么这样写：
 * 级别结算现在要把阵营做成独立胶囊，不同阵营需要稳定映射到固定配色；
 * 单独抽成 helper 后，HTML 结构和样式命名都能保持简单。
 *
 * 输入：
 * @param {number} playerId - 当前玩家 ID。
 *
 * 输出：
 * @returns {string} 可直接拼到 className 上的样式键值。
 *
 * 注意：
 * - 这里只返回 `banker / friend / defender` 三种样式键，不直接返回中文。
 * - 未站队朋友在结算时会被并入 `defender`。
 */
function getResultCampTone(playerId) {
  const campLabel = getResultCampLabel(playerId);
  if (campLabel === "打家") return "banker";
  if (campLabel === "朋友") return "friend";
  return "defender";
}

/**
 * 作用：
 * 生成结果页单个玩家的等级结算行 HTML。
 *
 * 为什么这样写：
 * 这一块已经从“纯文本列表”升级成带阵营胶囊、等级箭头和结果状态的卡片行；
 * 用单独 helper 生成每一行，可以避免主模板里堆大量字符串分支。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 * @param {{winner: string, bankerLevels: number, defenderLevels: number}} outcome - 本局结算结果。
 * @param {Record<number, string>} levelsBefore - 各玩家结算前等级。
 * @param {Record<number, string>} levelsAfter - 各玩家结算后等级。
 *
 * 输出：
 * @returns {string} 单行结算卡片的 HTML 字符串。
 *
 * 注意：
 * - 玩家名、阵营和等级变化必须全部保留，不能为了视觉压缩而省字段。
 * - `result-level-tag` 允许为空，此时整行只保留等级箭头，不强行塞“平级”。
 */
function buildResultLevelRowHtml(player, outcome, levelsBefore, levelsAfter) {
  const campLabel = getResultCampLabel(player.id);
  const campTone = getResultCampTone(player.id);
  const resultLabel = getResultLevelChangeLabel(player.id, outcome, levelsBefore, levelsAfter);
  const rowTone = resultLabel === "升级" ? "up" : resultLabel === "降级" ? "down" : "steady";
  const resultTag = resultLabel ? `<span class="result-level-tag">${resultLabel}</span>` : "";
  return `
    <li class="result-level-item ${rowTone}">
      <div class="result-level-main">
        <div class="result-level-player">${player.name}</div>
        <div class="result-level-chips">
          <span class="result-camp-chip ${campTone}">${campLabel}</span>
          ${resultTag}
        </div>
      </div>
      <div class="result-level-change">
        <span class="result-level-value before">Lv${levelsBefore[player.id]}</span>
        <span class="result-level-arrow" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path d="M4 10h9"></path>
            <path d="M10 5l5 5-5 5"></path>
          </svg>
        </span>
        <span class="result-level-value after">Lv${levelsAfter[player.id]}</span>
      </div>
    </li>
  `;
}

/**
 * 作用：
 * 生成结果页里的逐人等级结算列表 HTML。
 *
 * 为什么这样写：
 * 用户希望结果页把每位玩家的阵营和等级变化一行一行列清楚，
 * 而不是继续藏在正文长句里；统一从这里生成，可以保证 PC / mobile 两端结果层完全一致。
 *
 * 输入：
 * @param {{winner: string, bankerLevels: number, defenderLevels: number}} outcome - 本局结算结果。
 * @param {Record<number, string>} levelsBefore - 各玩家结算前等级。
 * @param {Record<number, string>} levelsAfter - 各玩家结算后等级。
 *
 * 输出：
 * @returns {string} 可直接写入结果列表容器的 HTML。
 *
 * 注意：
 * - 行内文案统一使用 `玩家名 - 阵营 - LvX -> LvY` 格式，便于快速扫读。
 * - 若没有任何玩家数据，仍返回空字符串，避免插入空列表壳子。
 */
function buildResultLevelListHtml(outcome, levelsBefore, levelsAfter) {
  const rows = state.players.map((player) => buildResultLevelRowHtml(player, outcome, levelsBefore, levelsAfter));
  if (rows.length === 0) return "";
  return `
    <div class="result-level-head">
      <div class="result-level-title">级别结算</div>
      <div class="result-level-caption">按玩家顺序查看本局阵营与等级变化</div>
    </div>
    <ul class="result-level-list">${rows.join("")}</ul>
  `;
}

/**
 * 作用：
 * 生成导出到对局日志末尾的最终胜负界面摘要。
 *
 * 为什么这样写：
 * 用户希望复盘日志最后能直接看到结算弹窗里真正展示出来的内容，
 * 包括标题、正文、逐人等级结算和底牌亮出；集中在这里拼装，可以保证日志与 UI 永远同步。
 *
 * 输入：
 * @param {string} resultTitle - 结果弹窗标题。
 * @param {string} resultBody - 结果弹窗正文。
 * @param {{winner: string, bankerLevels: number, defenderLevels: number}} outcome - 本局结算结果。
 * @param {Record<number, string>} levelsBefore - 各玩家结算前等级。
 * @param {Record<number, string>} levelsAfter - 各玩家结算后等级。
 *
 * 输出：
 * @returns {string[]} 可直接追加到日志末尾的多行纯文本。
 *
 * 注意：
 * - 底牌展示沿用最终结算页亮出的真实顺序，不做额外排序。
 * - 即使没有底牌或等级变化，也保留标题结构，避免日志末尾缺块。
 */
function buildResultScreenExportLines(resultTitle, resultBody, outcome, levelsBefore, levelsAfter) {
  const lines = [
    "最终胜负界面：",
    `- 标题：${resultTitle || "未结算"}`,
  ];
  if (resultBody) {
    lines.push(`- 正文：${resultBody}`);
  }
  const levelRows = getResultLevelSummaryRows(outcome, levelsBefore, levelsAfter);
  if (levelRows.length > 0) {
    lines.push("- 级别结算：");
    lines.push(...levelRows.map((row, index) => `  ${index + 1}. ${row}`));
  }
  const bottomCardsText = Array.isArray(state.bottomCards) && state.bottomCards.length > 0
    ? state.bottomCards.map(shortCardLabel).join("、")
    : "无";
  lines.push(`- 底牌展示：${bottomCardsText}`);
  return lines;
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
  const playerLevelsBefore = Object.fromEntries(
    PLAYER_ORDER.map((playerId) => [playerId, getPlayerLevel(playerId)])
  );
  const humanLevelBefore = playerLevelsBefore[1];
  applyLevelSettlement(outcome, bottomResult?.penalty || null);
  const playerLevelsAfter = Object.fromEntries(
    PLAYER_ORDER.map((playerId) => [playerId, getPlayerLevel(playerId)])
  );
  const humanLevelAfter = playerLevelsAfter[1];
  dom.resultCard.classList.toggle("win", humanWon);
  dom.resultCard.classList.toggle("loss", !humanWon);
  const resultTitle = `${humanWon ? TEXT.outcome.winTitle : TEXT.outcome.lossTitle} - ${getResultHeadlineDetail(
    outcome,
    humanWon,
    humanLevelBefore,
    humanLevelAfter
  )}`;
  dom.resultTitle.textContent = resultTitle;
  if (dom.resultSubinfo) {
    dom.resultSubinfo.innerHTML = buildResultLevelListHtml(
      outcome,
      playerLevelsBefore,
      playerLevelsAfter
    );
  }
  const resultBody = `${outcome.body}${getBottomResultText(bottomResult)}`;
  dom.resultBody.textContent = resultBody;
  state.resultScreenExportLines = buildResultScreenExportLines(
    resultTitle,
    resultBody,
    outcome,
    playerLevelsBefore,
    playerLevelsAfter
  );
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
    const bankerPenaltyDropSteps = getBottomPenaltyDropSteps(bankerLevelBeforePenalty, bankerPenalty);
    state.playerLevels[state.bankerId] = dropLevel(
      bankerLevelBeforePenalty,
      bankerPenaltyDropSteps,
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
  if (Array.isArray(state.resultScreenExportLines) && state.resultScreenExportLines.length > 0) {
    lines.push("");
    lines.push(...state.resultScreenExportLines);
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
