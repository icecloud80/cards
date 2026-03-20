const { loadHeadlessGameContext } = require("../tests/support/headless-game-context");

/**
 * 作用：
 * 生成可复现的单局 seed。
 *
 * 为什么这样写：
 * 这轮专项扫描要能把具体争议样本直接定位回某一局，
 * 因此 seed 必须稳定包含批次名、难度和局号。
 *
 * 输入：
 * @param {string} baseSeed - 本轮扫描的基础 seed。
 * @param {string} difficulty - 当前难度标签。
 * @param {number} gameIndex - 当前局号。
 *
 * 输出：
 * @returns {string} 复盘用 seed。
 *
 * 注意：
 * - 不要改成系统随机，否则样本无法稳定复跑。
 * - 局号固定补零，保证排序可读。
 */
function buildGameSeed(baseSeed, difficulty, gameIndex) {
  return `${baseSeed}:${difficulty}:game-${String(gameIndex).padStart(2, "0")}`;
}

/**
 * 作用：
 * 将牌对象压缩成稳定的日志结构。
 *
 * 为什么这样写：
 * 争议点分析只需要 `id / suit / rank`，没必要带上完整运行态对象，
 * 这样最终 JSON 更轻、更方便人工扫描。
 *
 * 输入：
 * @param {Array<object>} cards - 原始牌对象数组。
 *
 * 输出：
 * @returns {Array<{id: string, suit: string, rank: string}>} 轻量牌面数组。
 *
 * 注意：
 * - 这里只用于调试与复盘，不参与规则判定。
 * - 空输入回落为空数组。
 */
function summarizeCards(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => ({
    id: card.id,
    suit: card.suit,
    rank: card.rank,
  }));
}

/**
 * 作用：
 * 压缩牌型描述，便于总表和样本统一展示。
 *
 * 为什么这样写：
 * 甩牌、跟型和毙牌都依赖牌型标签；
 * 将核心字段单独抽出来后，样本里能一眼看出“这手被当成了什么牌型”。
 *
 * 输入：
 * @param {object|null} pattern - `classifyPlay(...)` 返回的牌型对象。
 *
 * 输出：
 * @returns {object|null} 精简后的牌型摘要。
 *
 * 注意：
 * - 甩牌会保留组件类型列表，便于看结构。
 * - 空值时显式返回 `null`。
 */
function summarizePattern(pattern) {
  if (!pattern) return null;
  return {
    ok: !!pattern.ok,
    type: pattern.type || null,
    suit: pattern.suit || null,
    count: pattern.count || 0,
    chainLength: pattern.chainLength || 0,
    power: pattern.power || 0,
    components: Array.isArray(pattern.components)
      ? pattern.components.map((component) => ({
          type: component.type || null,
          suit: component.suit || null,
          count: component.count || 0,
          chainLength: component.chainLength || 0,
          power: component.power || 0,
          cards: summarizeCards(component.cards),
        }))
      : [],
  };
}

/**
 * 作用：
 * 压缩 leadSpec，方便记录跟型场景。
 *
 * 为什么这样写：
 * 跟型争议核心在“首家出了什么结构”，
 * 所以这里把 leadSpec 统一收成能直接落进样本的一小段摘要。
 *
 * 输入：
 * @param {object|null} leadSpec - 当前轮的 leadSpec。
 *
 * 输出：
 * @returns {object|null} 精简后的 leadSpec 摘要。
 *
 * 注意：
 * - 这里只保留跟型判断需要的字段。
 * - 空值时返回 `null`。
 */
function summarizeLeadSpec(leadSpec) {
  if (!leadSpec) return null;
  return {
    type: leadSpec.type || null,
    suit: leadSpec.suit || null,
    count: leadSpec.count || 0,
    chainLength: leadSpec.chainLength || 0,
    tupleSize: leadSpec.tupleSize || 0,
    leaderId: leadSpec.leaderId || null,
  };
}

/**
 * 作用：
 * 压缩当前朋友牌定义。
 *
 * 为什么这样写：
 * 叫朋友专项要看“叫第几张、是否叫死、何时亮友/误打”，
 * 这几个字段需要稳定出现在样本里。
 *
 * 输入：
 * @param {object|null} target - 当前朋友牌定义。
 *
 * 输出：
 * @returns {object|null} 精简后的目标牌摘要。
 *
 * 注意：
 * - `matchesSeen` 和 `occurrence` 必须保留，方便校验亮友时点。
 * - 空值时返回 `null`。
 */
function summarizeFriendTarget(target) {
  if (!target) return null;
  return {
    suit: target.suit,
    rank: target.rank,
    occurrence: target.occurrence || 1,
    label: target.label,
    revealed: !!target.revealed,
    revealedBy: target.revealedBy || null,
    failed: !!target.failed,
    matchesSeen: target.matchesSeen || 0,
  };
}

/**
 * 作用：
 * 向样本数组追加一条限量样本。
 *
 * 为什么这样写：
 * 我们需要的是“少量高信号例子”，而不是把 20 局所有同类事件都塞进总表。
 *
 * 输入：
 * @param {Array<object>} list - 当前样本数组。
 * @param {object} sample - 待追加样本。
 * @param {number} [limit=5] - 最多保留多少条。
 *
 * 输出：
 * @returns {void} 原地更新样本数组。
 *
 * 注意：
 * - 达到上限后直接忽略后续样本。
 * - 这里不做复杂去重，只控制体量。
 */
function pushSample(list, sample, limit = 5) {
  if (!Array.isArray(list) || !sample || list.length >= limit) return;
  list.push(sample);
}

/**
 * 作用：
 * 读取本次 `playCards(...)` 真正落到桌面的那手牌。
 *
 * 为什么这样写：
 * 甩牌失败时，玩家“尝试出的牌”和“实际被系统强制改出的牌”不一样；
 * 如果不把真实落桌牌读出来，甩牌专项就会误判。
 *
 * 输入：
 * @param {object} state - 当前游戏状态。
 * @param {number} playerId - 本次出牌玩家。
 * @param {number} beforeTrickLength - 出牌前本轮已有几手。
 * @param {number} beforeTrickNumber - 出牌前本轮编号。
 *
 * 输出：
 * @returns {{playerId: number, cards: Array<object>}|null} 本次实际落桌记录。
 *
 * 注意：
 * - 第 5 手会在 `resolveTrick` 后清空 `currentTrick`，这时要从 `lastTrick` 里取。
 * - 若读取失败则返回 `null`，由调用方兜底。
 */
function getActualRecordedPlay(state, playerId, beforeTrickLength, beforeTrickNumber) {
  if (beforeTrickLength === 4 && state.lastTrick?.trickNumber === beforeTrickNumber) {
    return state.lastTrick.plays.find((play) => play.playerId === playerId) || null;
  }
  if (Array.isArray(state.currentTrick) && state.currentTrick.length > 0) {
    return state.currentTrick[state.currentTrick.length - 1] || null;
  }
  return null;
}

/**
 * 作用：
 * 统一当前 AI 托管出牌顺序。
 *
 * 为什么这样写：
 * 专项扫描要和真实高级 AI 出牌链完全一致，
 * 因此这里保持 `hint -> search -> forced -> emergency` 顺序不变。
 *
 * 输入：
 * @param {object} context - 当前 headless 上下文。
 * @param {number} playerId - 当前行动玩家。
 *
 * 输出：
 * @returns {{source: string, cards: Array<object>}} 第一手非空候选。
 *
 * 注意：
 * - 如果四层都没有牌，直接抛错暴露死局。
 * - 返回的是“尝试出牌”，不一定等于甩牌失败后真正落桌的牌。
 */
function pickManagedPlay(context, playerId) {
  const candidates = [
    { source: "hint", cards: context.getLegalHintForPlayer(playerId) },
    { source: "search", cards: context.findLegalSelectionBySearch(playerId) },
    { source: "forced", cards: context.buildForcedFollowFallback(playerId) },
    { source: "emergency", cards: context.findEmergencyLegalSelection(playerId) },
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate.cards) && candidate.cards.length > 0) {
      return candidate;
    }
  }

  throw new Error(`player ${playerId} has no managed play`);
}

/**
 * 作用：
 * 计算发牌阶段下一张牌对应的玩家。
 *
 * 为什么这样写：
 * 发牌时自动亮主仍会依赖当前收牌玩家，
 * 测试脚本需要沿用正式座位推进顺序。
 *
 * 输入：
 * @param {object} state - 当前游戏状态。
 *
 * 输出：
 * @returns {number} 下一张牌对应的玩家 ID。
 *
 * 注意：
 * - 这里只在发牌阶段调用。
 * - 状态异常时回退到 1 号位。
 */
function getCurrentDealPlayerId(state) {
  const playerIds = [1, 2, 3, 4, 5];
  const startIndex = playerIds.indexOf(state?.nextFirstDealPlayerId || 1);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  return playerIds[(safeStartIndex + (state?.dealIndex || 0)) % playerIds.length];
}

/**
 * 作用：
 * 按正式托管规则推进一次反主动作。
 *
 * 为什么这样写：
 * 叫主/反主争议常会影响后面甩牌和跟牌口径，
 * 所以测试必须保持与正式 runner 相同的最后反主策略。
 *
 * 输入：
 * @param {object} context - 当前游戏上下文。
 *
 * 输出：
 * @returns {void} 直接推进状态。
 *
 * 注意：
 * - 没有可反主方案时必须走 `pass`。
 * - 这里不额外记录反主样本，专注四类争议点。
 */
function resolveManagedCounterAction(context) {
  const currentPlayerId = context.state.currentTurnId;
  const option = context.getCounterDeclarationForPlayer(currentPlayerId);
  if (!option) {
    context.passCounterForCurrentPlayer(false);
    return;
  }

  const willing = option.suit === "notrump" || option.count >= 3 || context.Math.random() < 0.72;
  if (willing) {
    context.counterDeclare(currentPlayerId, option);
    return;
  }

  context.passCounterForCurrentPlayer(false);
}

/**
 * 作用：
 * 将翻底展示推进到埋底。
 *
 * 为什么这样写：
 * 这层是 headless 兼容逻辑，避免 UI 包装差异影响专项扫描。
 *
 * 输入：
 * @param {object} context - 当前游戏上下文。
 *
 * 输出：
 * @returns {void} 直接推进阶段。
 *
 * 注意：
 * - 优先走正式函数。
 * - 回退逻辑只用于测试。
 */
function advanceBottomReveal(context) {
  if (typeof context.finishBottomRevealPhase === "function") {
    context.finishBottomRevealPhase();
    return;
  }
  if (typeof context.startBuryingPhase === "function") {
    context.startBuryingPhase();
    return;
  }

  const banker = typeof context.getPlayer === "function" ? context.getPlayer(context.state.bankerId) : null;
  if (!banker) throw new Error("cannot find banker in bottomReveal");

  banker.hand.push(...(Array.isArray(context.state.bottomCards) ? context.state.bottomCards : []));
  if (typeof context.sortHand === "function") {
    banker.hand = context.sortHand(banker.hand);
  }
  context.state.selectedCardIds = [];
  context.state.showBottomPanel = false;
  context.state.phase = "burying";
  context.state.countdown = 60;
}

/**
 * 作用：
 * 为 20 局专项扫描准备一份空汇总。
 *
 * 为什么这样写：
 * 四类争议点需要统一沉到同一份结果里，
 * 先固定结构可以避免后面样本输出越来越散。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {object} 空的专项汇总结构。
 *
 * 注意：
 * - 每类样本都有限额，防止 JSON 过大。
 * - 这里只存高信号聚合，不保存整局全量 trace。
 */
function createAggregate() {
  return {
    totals: {
      requestedGames: 20,
      completedGames: 0,
      failedGames: 0,
      totalPlays: 0,
      totalWarnings: 0,
      totalErrors: 0,
    },
    throwAudit: {
      attempts: 0,
      failures: 0,
      successes: 0,
      failureSamples: [],
      successSamples: [],
    },
    followAudit: {
      totalFollowPlays: 0,
      byLeadType: {},
      sampleByLeadType: {},
    },
    beatAudit: {
      beats: 0,
      coverBeats: 0,
      beatSamples: [],
      coverBeatSamples: [],
    },
    friendAudit: {
      calls: 0,
      calledDeadAtSelection: 0,
      byOccurrence: { 1: 0, 2: 0, 3: 0 },
      progressEvents: 0,
      revealEvents: 0,
      failEvents: 0,
      callSamples: [],
      progressSamples: [],
    },
    suspicious: {
      validationFailures: [],
      failures: [],
    },
    games: [],
  };
}

/**
 * 作用：
 * 记录一条跟型样本并顺带累计统计。
 *
 * 为什么这样写：
 * 跟型场景数量多，但我们只需要每种 leadType 留几个代表样本；
 * 统一从一个 helper 里走，方便后续调整输出口径。
 *
 * 输入：
 * @param {object} followAudit - 汇总里的跟型部分。
 * @param {object} sample - 本次跟牌样本。
 *
 * 输出：
 * @returns {void} 原地更新汇总结构。
 *
 * 注意：
 * - `leadType` 缺失时回落到 `unknown`。
 * - 每个 leadType 最多保留 3 个样本。
 */
function recordFollowSample(followAudit, sample) {
  const leadType = sample.leadSpec?.type || "unknown";
  if (!followAudit.byLeadType[leadType]) {
    followAudit.byLeadType[leadType] = {
      count: 0,
      exactPatternWindow: 0,
      shortageWindow: 0,
      validationFailures: 0,
    };
  }
  if (!followAudit.sampleByLeadType[leadType]) {
    followAudit.sampleByLeadType[leadType] = [];
  }

  followAudit.totalFollowPlays += 1;
  followAudit.byLeadType[leadType].count += 1;
  if (sample.exactPatternWindow) followAudit.byLeadType[leadType].exactPatternWindow += 1;
  if (sample.shortageWindow) followAudit.byLeadType[leadType].shortageWindow += 1;
  if (!sample.validationOk) followAudit.byLeadType[leadType].validationFailures += 1;
  pushSample(followAudit.sampleByLeadType[leadType], sample, 3);
}

/**
 * 作用：
 * 运行一局并记录四类争议点专项数据。
 *
 * 为什么这样写：
 * 用户要看的不是纯胜负，而是最容易引起规则争议的局面是否正常；
 * 因此这里在完整托管流程里插入结构化采样点。
 *
 * 输入：
 * @param {string} seed - 当前局的 seed。
 * @param {number} gameIndex - 当前局号。
 *
 * 输出：
 * @returns {object} 当前局的专项摘要。
 *
 * 注意：
 * - 所有玩家都强制设成高级 AI。
 * - 合法性仍以当前规则引擎 `validateSelection` 为准。
 */
function runGame(seed, gameIndex) {
  const { context, capture } = loadHeadlessGameContext({ seed });
  context.state.aiDifficulty = "advanced";
  context.setupGame();
  for (const player of context.state.players) {
    player.isHuman = false;
    player.aiDifficulty = "advanced";
  }

  const gameAudit = {
    gameIndex,
    seed,
    completed: false,
    winner: null,
    defenderPoints: 0,
    totalPlays: 0,
    totalFollowPlays: 0,
    throwAttempts: 0,
    throwFailures: 0,
    beats: 0,
    coverBeats: 0,
    followByLeadType: {},
    friendProgressEvents: 0,
    friendRevealEvents: 0,
    friendFailEvents: 0,
    friendReveal: false,
    friendFail: false,
    warnings: [],
    errors: [],
  };

  const samples = {
    throwFailure: [],
    throwSuccess: [],
    beat: [],
    coverBeat: [],
    friendCall: [],
    friendProgress: [],
    followByLeadType: {},
    validationFailures: [],
  };

  const friendCallTarget = [];
  let steps = 0;
  context.startDealing();

  while (!context.state.gameOver) {
    steps += 1;
    if (steps > 4000) {
      throw new Error(`exceeded 4000 steps at phase ${context.state.phase}`);
    }

    if (context.state.phase === "dealing") {
      if (context.state.awaitingHumanDeclaration) {
        const bestDeclaration = context.getBestDeclarationForPlayer(1);
        if (bestDeclaration && context.canOverrideDeclaration(bestDeclaration)) {
          context.declareTrump(1, bestDeclaration, "auto");
        }
        context.finishDealingPhase();
        continue;
      }

      const dealingPlayerId = getCurrentDealPlayerId(context.state);
      context.state.aiDifficulty = "advanced";
      context.state.players[dealingPlayerId - 1].aiDifficulty = "advanced";
      const previousIndex = context.state.dealIndex;
      context.dealOneCard();
      if (context.state.dealIndex === previousIndex && context.state.phase === "dealing") {
        throw new Error("dealing phase did not advance");
      }
      continue;
    }

    if (context.state.phase === "bottomReveal") {
      advanceBottomReveal(context);
      continue;
    }

    if (context.state.phase === "countering") {
      resolveManagedCounterAction(context);
      continue;
    }

    if (context.state.phase === "burying") {
      const bankerId = context.state.bankerId;
      const buryCards = context.getBuryHintForPlayer(bankerId);
      if (!Array.isArray(buryCards) || buryCards.length !== 7) {
        throw new Error(`invalid bury count ${buryCards?.length}`);
      }
      context.completeBurying(bankerId, buryCards.map((card) => card.id));
      continue;
    }

    if (context.state.phase === "callingFriend") {
      const bankerId = context.state.bankerId;
      const recommendation = bankerId === 1
        ? context.getFriendPickerRecommendation()?.target
        : context.chooseFriendTarget()?.target;
      if (!recommendation) {
        throw new Error(`banker ${bankerId} has no friend target recommendation`);
      }
      context.confirmFriendTargetSelection(recommendation);

      const target = summarizeFriendTarget(context.state.friendTarget);
      const calledDeadAtSelection = typeof context.isFriendTargetCalledDeadAtSelection === "function"
        ? context.isFriendTargetCalledDeadAtSelection(context.state.friendTarget)
        : false;
      friendCallTarget.push({
        bankerId,
        target,
        calledDeadAtSelection,
        revealOccurrence: typeof context.getFriendTargetRevealOccurrence === "function"
          ? context.getFriendTargetRevealOccurrence(context.state.friendTarget)
          : (target?.occurrence || 1),
      });
      continue;
    }

    if (context.state.phase === "playing") {
      const playerId = context.state.currentTurnId;
      const isLead = context.state.currentTrick.length === 0;
      const beforeTrickLength = context.state.currentTrick.length;
      const beforeTrickNumber = context.state.trickNumber;
      const leadSpecBefore = context.state.leadSpec ? { ...context.state.leadSpec } : null;
      const currentWinningPlayBefore = beforeTrickLength > 0 && typeof context.getCurrentWinningPlay === "function"
        ? context.getCurrentWinningPlay()
        : null;
      const currentBeatCountBefore = context.state.currentTrickBeatCount || 0;
      const friendBefore = context.state.friendTarget ? { ...context.state.friendTarget } : null;

      const choice = pickManagedPlay(context, playerId);
      gameAudit.totalPlays += 1;
      const selectedPattern = context.classifyPlay(choice.cards);
      const throwFailure = isLead && typeof context.getThrowFailure === "function"
        ? context.getThrowFailure(playerId, selectedPattern)
        : null;
      const validation = typeof context.validateSelection === "function"
        ? context.validateSelection(playerId, choice.cards)
        : { ok: true };

      if (!validation.ok) {
        pushSample(samples.validationFailures, {
          gameIndex,
          seed,
          trickNumber: beforeTrickNumber,
          playerId,
          source: choice.source,
          reason: validation.reason || "unknown",
          selectedCards: summarizeCards(choice.cards),
          selectedPattern: summarizePattern(selectedPattern),
          leadSpec: summarizeLeadSpec(leadSpecBefore),
        }, 5);
      }

      if (isLead && selectedPattern?.type === "throw") {
        gameAudit.throwAttempts += 1;
      }

      let followSample = null;
      if (!isLead) {
        const player = context.getPlayer(playerId);
        const suited = player?.hand?.filter((card) => context.effectiveSuit(card) === leadSpecBefore?.suit) || [];
        const exactPatternWindow = suited.length >= (leadSpecBefore?.count || 0)
          && typeof context.hasMatchingPattern === "function"
          && context.hasMatchingPattern(suited, leadSpecBefore);
        const leadType = leadSpecBefore?.type || "unknown";
        if (!gameAudit.followByLeadType[leadType]) {
          gameAudit.followByLeadType[leadType] = {
            count: 0,
            exactPatternWindow: 0,
            shortageWindow: 0,
            validationFailures: 0,
          };
        }
        gameAudit.totalFollowPlays += 1;
        gameAudit.followByLeadType[leadType].count += 1;
        if (exactPatternWindow) gameAudit.followByLeadType[leadType].exactPatternWindow += 1;
        if (suited.length < (leadSpecBefore?.count || 0)) gameAudit.followByLeadType[leadType].shortageWindow += 1;
        if (!validation.ok) gameAudit.followByLeadType[leadType].validationFailures += 1;
        followSample = {
          gameIndex,
          seed,
          trickNumber: beforeTrickNumber,
          playerId,
          leadSpec: summarizeLeadSpec(leadSpecBefore),
          suitedCountBefore: suited.length,
          selectedCards: summarizeCards(choice.cards),
          selectedPattern: summarizePattern(selectedPattern),
          validationOk: !!validation.ok,
          validationReason: validation.reason || null,
          exactPatternWindow,
          shortageWindow: suited.length < (leadSpecBefore?.count || 0),
        };
      }

      const beatPlay = currentWinningPlayBefore && typeof context.doesSelectionBeatCurrent === "function"
        ? context.doesSelectionBeatCurrent(playerId, choice.cards)
        : false;

      const played = context.playCards(playerId, choice.cards.map((card) => card.id), {
        skipStartTurn: true,
        skipResolveDelay: true,
      });
      if (!played) {
        throw new Error(`playCards rejected choice for player ${playerId}`);
      }

      const actualPlay = getActualRecordedPlay(context.state, playerId, beforeTrickLength, beforeTrickNumber);
      const actualCards = actualPlay?.cards || choice.cards;
      const actualPattern = context.classifyPlay(actualCards);

      if (followSample) {
        followSample.actualCards = summarizeCards(actualCards);
        followSample.actualPattern = summarizePattern(actualPattern);
        recordFollowSample({ ...{} }, {}); // no-op guard against accidental lint drift
      }

      if (followSample) {
        if (!samples.followByLeadType[followSample.leadSpec?.type || "unknown"]) {
          samples.followByLeadType[followSample.leadSpec?.type || "unknown"] = [];
        }
        pushSample(samples.followByLeadType[followSample.leadSpec?.type || "unknown"], followSample, 3);
      }

      if (isLead && selectedPattern?.type === "throw") {
        if (throwFailure) {
          gameAudit.throwFailures += 1;
          pushSample(samples.throwFailure, {
            gameIndex,
            seed,
            trickNumber: beforeTrickNumber,
            playerId,
            selectedCards: summarizeCards(choice.cards),
            selectedPattern: summarizePattern(selectedPattern),
            forcedCards: summarizeCards(actualCards),
            forcedPattern: summarizePattern(actualPattern),
            failedComponent: summarizePattern(throwFailure.failedComponent),
          }, 5);
        } else {
          pushSample(samples.throwSuccess, {
            gameIndex,
            seed,
            trickNumber: beforeTrickNumber,
            playerId,
            selectedCards: summarizeCards(actualCards),
            pattern: summarizePattern(actualPattern),
          }, 5);
        }
      }

      if (beatPlay) {
        if (currentBeatCountBefore > 0) {
          gameAudit.coverBeats += 1;
          pushSample(samples.coverBeat, {
            gameIndex,
            seed,
            trickNumber: beforeTrickNumber,
            playerId,
            leadSpec: summarizeLeadSpec(leadSpecBefore),
            winningBefore: {
              playerId: currentWinningPlayBefore.playerId,
              cards: summarizeCards(currentWinningPlayBefore.cards),
              pattern: summarizePattern(context.classifyPlay(currentWinningPlayBefore.cards)),
            },
            played: {
              cards: summarizeCards(actualCards),
              pattern: summarizePattern(actualPattern),
            },
          }, 5);
        } else {
          gameAudit.beats += 1;
          pushSample(samples.beat, {
            gameIndex,
            seed,
            trickNumber: beforeTrickNumber,
            playerId,
            leadSpec: summarizeLeadSpec(leadSpecBefore),
            winningBefore: {
              playerId: currentWinningPlayBefore.playerId,
              cards: summarizeCards(currentWinningPlayBefore.cards),
              pattern: summarizePattern(context.classifyPlay(currentWinningPlayBefore.cards)),
            },
            played: {
              cards: summarizeCards(actualCards),
              pattern: summarizePattern(actualPattern),
            },
          }, 5);
        }
      }

      if (friendBefore && !friendBefore.revealed && !friendBefore.failed) {
        const matchCount = actualCards.filter((card) => (
          card.suit === friendBefore.suit && card.rank === friendBefore.rank
        )).length;
        if (matchCount > 0) {
          const friendAfter = context.state.friendTarget ? { ...context.state.friendTarget } : null;
          const revealOccurrence = typeof context.getFriendTargetRevealOccurrence === "function"
            ? context.getFriendTargetRevealOccurrence(friendBefore)
            : (friendBefore.occurrence || 1);
          const outcome = friendAfter?.failed ? "failed" : (friendAfter?.revealed ? "revealed" : "progress");
          gameAudit.friendProgressEvents += 1;
          if (outcome === "revealed") gameAudit.friendReveal = true;
          if (outcome === "failed") gameAudit.friendFail = true;
          if (outcome === "revealed") gameAudit.friendRevealEvents += 1;
          if (outcome === "failed") gameAudit.friendFailEvents += 1;
          pushSample(samples.friendProgress, {
            gameIndex,
            seed,
            trickNumber: beforeTrickNumber,
            playerId,
            bankerId: context.state.bankerId,
            target: summarizeFriendTarget(friendBefore),
            revealOccurrence,
            matchCount,
            beforeMatchesSeen: friendBefore.matchesSeen || 0,
            afterMatchesSeen: friendAfter?.matchesSeen || 0,
            outcome,
            playedCards: summarizeCards(actualCards),
          }, 5);
        }
      }
      continue;
    }

    if (context.state.phase === "ending") {
      context.finishGame();
      continue;
    }

    throw new Error(`unhandled phase ${context.state.phase}`);
  }

  const outcome = context.getOutcome(context.state.defenderPoints, {
    bottomPenalty: context.getBottomResultSummary()?.penalty || null,
  });
  gameAudit.completed = true;
  gameAudit.winner = outcome.winner;
  gameAudit.defenderPoints = context.state.defenderPoints;
  gameAudit.warnings = [...capture.warnings];
  gameAudit.errors = [...capture.errors];
  gameAudit.friendCall = friendCallTarget[0] || null;

  return {
    gameAudit,
    samples,
  };
}

/**
 * 作用：
 * 将单局专项结果合并进批量汇总。
 *
 * 为什么这样写：
 * 20 局总表和逐类样本需要同步累加，
 * 独立一个归并函数会更容易保证口径一致。
 *
 * 输入：
 * @param {object} aggregate - 批量汇总对象。
 * @param {object} result - 单局专项结果。
 *
 * 输出：
 * @returns {void} 原地更新汇总对象。
 *
 * 注意：
 * - 每类样本都继续控制总量上限。
 * - 这里只做汇总，不重复推导规则结论。
 */
function mergeResult(aggregate, result) {
  const { gameAudit, samples } = result;
  aggregate.games.push(gameAudit);

  if (!gameAudit.completed) {
    aggregate.totals.failedGames += 1;
    return;
  }

  aggregate.totals.completedGames += 1;
  aggregate.totals.totalPlays += gameAudit.totalPlays || 0;
  aggregate.totals.totalWarnings += (gameAudit.warnings || []).length;
  aggregate.totals.totalErrors += (gameAudit.errors || []).length;

  aggregate.throwAudit.attempts += gameAudit.throwAttempts || 0;
  aggregate.throwAudit.failures += gameAudit.throwFailures || 0;
  aggregate.throwAudit.successes += Math.max(0, (gameAudit.throwAttempts || 0) - (gameAudit.throwFailures || 0));
  for (const sample of samples.throwFailure || []) pushSample(aggregate.throwAudit.failureSamples, sample, 5);
  for (const sample of samples.throwSuccess || []) pushSample(aggregate.throwAudit.successSamples, sample, 5);

  aggregate.beatAudit.beats += gameAudit.beats || 0;
  aggregate.beatAudit.coverBeats += gameAudit.coverBeats || 0;
  for (const sample of samples.beat || []) pushSample(aggregate.beatAudit.beatSamples, sample, 5);
  for (const sample of samples.coverBeat || []) pushSample(aggregate.beatAudit.coverBeatSamples, sample, 5);

  if (gameAudit.friendCall) {
    aggregate.friendAudit.calls += 1;
    const occurrenceKey = String(gameAudit.friendCall.target?.occurrence || 1);
    aggregate.friendAudit.byOccurrence[occurrenceKey] = (aggregate.friendAudit.byOccurrence[occurrenceKey] || 0) + 1;
    if (gameAudit.friendCall.calledDeadAtSelection) {
      aggregate.friendAudit.calledDeadAtSelection += 1;
    }
    pushSample(aggregate.friendAudit.callSamples, gameAudit.friendCall, 5);
  }

  aggregate.friendAudit.progressEvents += gameAudit.friendProgressEvents || 0;
  aggregate.friendAudit.revealEvents += gameAudit.friendRevealEvents || 0;
  aggregate.friendAudit.failEvents += gameAudit.friendFailEvents || 0;
  for (const sample of samples.friendProgress || []) {
    pushSample(aggregate.friendAudit.progressSamples, sample, 5);
  }

  aggregate.followAudit.totalFollowPlays += gameAudit.totalFollowPlays || 0;
  for (const [leadType, counts] of Object.entries(gameAudit.followByLeadType || {})) {
    if (!aggregate.followAudit.byLeadType[leadType]) {
      aggregate.followAudit.byLeadType[leadType] = {
        count: 0,
        exactPatternWindow: 0,
        shortageWindow: 0,
        validationFailures: 0,
      };
    }
    if (!aggregate.followAudit.sampleByLeadType[leadType]) {
      aggregate.followAudit.sampleByLeadType[leadType] = [];
    }
    aggregate.followAudit.byLeadType[leadType].count += counts.count || 0;
    aggregate.followAudit.byLeadType[leadType].exactPatternWindow += counts.exactPatternWindow || 0;
    aggregate.followAudit.byLeadType[leadType].shortageWindow += counts.shortageWindow || 0;
    aggregate.followAudit.byLeadType[leadType].validationFailures += counts.validationFailures || 0;
  }
  for (const [leadType, entries] of Object.entries(samples.followByLeadType || {})) {
    if (!aggregate.followAudit.sampleByLeadType[leadType]) {
      aggregate.followAudit.sampleByLeadType[leadType] = [];
    }
    for (const sample of entries) {
      pushSample(aggregate.followAudit.sampleByLeadType[leadType], sample, 3);
    }
  }

  for (const sample of samples.validationFailures || []) {
    pushSample(aggregate.suspicious.validationFailures, sample, 5);
  }
}

/**
 * 作用：
 * 运行 20 局专项扫描并输出结果。
 *
 * 为什么这样写：
 * 用户要的是针对四类争议点的专项深查，
 * 因此这里逐局执行、逐类聚合，并在结尾输出一份精简总表。
 *
 * 输入：
 * @param {void} - 基础配置直接写在脚本内。
 *
 * 输出：
 * @returns {void} 在 stdout 输出逐局进度和最终 JSON。
 *
 * 注意：
 * - 单局失败不会中断整批。
 * - 终端用 `DEEP_AUDIT_JSON_START/END` 包裹最终 JSON，方便提取。
 */
function main() {
  const baseSeed = "advanced-deep-audit-20260320";
  const aggregate = createAggregate();

  for (let index = 1; index <= 20; index += 1) {
    const seed = buildGameSeed(baseSeed, "advanced", index);
    try {
      const result = runGame(seed, index);
      mergeResult(aggregate, result);
      console.log(
        `[game ${String(index).padStart(2, "0")}] ok `
        + `throw=${result.gameAudit.throwAttempts}/${result.gameAudit.throwFailures} `
        + `beat=${result.gameAudit.beats} cover=${result.gameAudit.coverBeats} `
        + `friendReveal=${result.gameAudit.friendReveal} friendFail=${result.gameAudit.friendFail}`
      );
    } catch (error) {
      aggregate.totals.failedGames += 1;
      const failure = {
        gameIndex: index,
        seed,
        error: error instanceof Error ? error.message : String(error),
      };
      aggregate.games.push({
        gameIndex: index,
        seed,
        completed: false,
        error: failure.error,
      });
      pushSample(aggregate.suspicious.failures, failure, 5);
      console.log(`[game ${String(index).padStart(2, "0")}] fail error=${failure.error}`);
    }
  }

  console.log("DEEP_AUDIT_JSON_START");
  console.log(JSON.stringify(aggregate, null, 2));
  console.log("DEEP_AUDIT_JSON_END");
}

main();
