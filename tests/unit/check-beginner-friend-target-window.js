const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

const REGRESSION_CASES = [
  {
    seed: "ZSO1hGI883r:beginner:game-01",
    expectedFriendTargetLabel: "第二张黑桃 A",
  },
  {
    seed: "ZSO1hGI883r:beginner:game-04",
    expectedFriendTargetLabel: "第一张黑桃 A",
  },
  {
    seed: "ZSO1hGI883r:beginner:game-12",
    expectedFriendTargetLabel: "第一张红桃 A",
  },
];

/**
 * 作用：
 * 把当前 headless 场景里的 5 个座位都切成托管初级 AI。
 *
 * 为什么这样写：
 * 这条回归要锁的是“同一派生 seed 下，全员初级 AI 的真实叫朋友与整局结果”，
 * 因此必须显式关闭 1 号位的人类身份，避免又走回 UI 推荐链路。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 直接原地改写玩家托管状态。
 *
 * 注意：
 * - 必须在 `setupGame(...)` 之后调用，因为开局会重建玩家数组。
 * - 这里只服务固定回归，不改正式托管入口。
 */
function setAllPlayersToManagedBeginnerAi(context) {
  for (const player of context.state.players) {
    player.isHuman = false;
    player.aiDifficulty = "beginner";
  }
}

/**
 * 作用：
 * 在 headless 回归里把翻底展示阶段稳定推进到埋底阶段。
 *
 * 为什么这样写：
 * 这些固定 seed 回归只关心 AI 的真实叫朋友与出牌路径，不需要等待 UI 读秒；
 * 直接复用 headless 的兼容推进方式，可以减少壳层差异带来的噪音。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 成功时把牌局推进到埋底或后续阶段。
 *
 * 注意：
 * - 优先调用正式阶段推进函数，缺失时才做最小手动回退。
 * - 这里只是测试辅助，不应反向改写正式阶段状态机。
 */
function advanceHeadlessBottomReveal(context) {
  if (typeof context.finishBottomRevealPhase === "function") {
    context.finishBottomRevealPhase();
    return;
  }
  if (typeof context.startBuryingPhase === "function") {
    context.startBuryingPhase();
    return;
  }
  const banker = typeof context.getPlayer === "function" ? context.getPlayer(context.state.bankerId) : null;
  if (!banker) {
    throw new Error("beginner friend-target regression: failed to find banker during bottom reveal fallback");
  }
  banker.hand.push(...(Array.isArray(context.state.bottomCards) ? context.state.bottomCards : []));
  context.state.selectedCardIds = [];
  context.state.showBottomPanel = false;
  context.state.phase = "burying";
  context.state.countdown = 60;
}

/**
 * 作用：
 * 按线上托管顺序，为当前玩家挑一手可执行的牌。
 *
 * 为什么这样写：
 * 这条回归要校验的是“完整 beginner 托管链”而不是单个 helper，
 * 因此这里保持和正式托管一致的兜底顺序：hint -> search -> forced -> emergency。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 * @param {number} playerId - 当前行动玩家 ID。
 *
 * 输出：
 * @returns {object[]} 返回当前应出的牌组。
 *
 * 注意：
 * - 若 4 层兜底都拿不到可执行牌，应直接抛错，避免测试静默通过。
 * - 这里只返回牌对象数组，真正出牌仍由调用方执行。
 */
function pickManagedPlay(context, playerId) {
  context.state.lastAiDecision = null;
  const candidates = [
    context.getLegalHintForPlayer(playerId),
    context.findLegalSelectionBySearch(playerId),
    context.buildForcedFollowFallback(playerId),
    context.findEmergencyLegalSelection(playerId),
  ];
  const pickedCards = candidates.find((cards) => Array.isArray(cards) && cards.length > 0) || [];
  if (pickedCards.length === 0) {
    throw new Error(`beginner friend-target regression: no managed play for player ${playerId}`);
  }
  return pickedCards;
}

/**
 * 作用：
 * 读取当前托管打家的朋友牌推荐。
 *
 * 为什么这样写：
 * 历史回归里既出现过 `chooseFriendTarget()` 路径，也出现过 UI 推荐入口；
 * 这里统一做一层兼容，保证测试只关心“最终推荐了哪张朋友牌”。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {object} 当前应确认的朋友牌目标。
 *
 * 注意：
 * - 优先读取正式 AI 决策入口，缺失时才回退到 picker recommendation。
 * - 若两条入口都没有值，应直接报错，避免静默确认空目标。
 */
function getManagedFriendRecommendation(context) {
  const aiDecision = typeof context.chooseFriendTarget === "function" ? context.chooseFriendTarget() : null;
  const recommendation = aiDecision?.target || context.getFriendPickerRecommendation?.()?.target || null;
  assert.ok(recommendation, "beginner friend-target regression should receive a friend recommendation");
  return recommendation;
}

/**
 * 作用：
 * 用固定派生 seed 跑完一局全初级 AI 对局，并记录最终叫朋友结果。
 *
 * 为什么这样写：
 * 这轮用户明确要求“初级收紧王张找友”，
 * 因此这里直接锁真实整局里最终确认的朋友牌标签，确保 setup -> 埋底 -> 叫朋友
 * 这一整条 beginner 链路不会再轻易漂到 `大王 / 小王` 路线。
 *
 * 输入：
 * @param {{seed: string, expectedFriendTargetLabel: string}} regressionCase - 当前固定样本。
 *
 * 输出：
 * @returns {{seed: string, friendTargetLabel: string, defenderPoints: number, winner: string}} 当前样本的核心结果摘要。
 *
 * 注意：
 * - 这条回归只锁“整局实际会叫哪张朋友牌”，不替代更细的出牌策略场景测试。
 * - 当前重点是守住“不要回退到王张找友”，不是强行把这些样本都锁成打家赢。
 * - 胜负和闲家得分会继续打印在控制台里，便于人工复盘，但这里不再把它们绑成硬断言。
 */
function runBeginnerFriendTargetWindowRegressionCase(regressionCase) {
  const { context } = loadHeadlessGameContext({ seed: regressionCase.seed });

  context.state.aiDifficulty = "beginner";
  const setupOk = context.setupGame();
  assert.equal(setupOk, true, `beginner friend-target regression should set up seed ${regressionCase.seed}`);

  setAllPlayersToManagedBeginnerAi(context);
  context.startDealing();

  let friendTargetLabel = null;
  let steps = 0;
  while (!context.state.gameOver) {
    steps += 1;
    assert.ok(steps <= 5000, `beginner friend-target regression exceeded 5000 steps at phase ${context.state.phase}`);

    if (context.state.phase === "dealing") {
      if (context.state.awaitingHumanDeclaration) {
        const bestDeclaration = context.getBestDeclarationForPlayer(1);
        if (bestDeclaration && context.canOverrideDeclaration(bestDeclaration)) {
          context.declareTrump(1, bestDeclaration, "auto");
        }
        context.finishDealingPhase();
        continue;
      }
      context.dealOneCard();
      continue;
    }

    if (context.state.phase === "bottomReveal") {
      advanceHeadlessBottomReveal(context);
      continue;
    }

    if (context.state.phase === "countering") {
      const playerId = context.state.currentTurnId;
      const counterOption = context.getCounterDeclarationForPlayer(playerId);
      const willingToCounter = counterOption
        && (counterOption.suit === "notrump" || counterOption.count >= 3 || context.Math.random() < 0.72);
      if (counterOption && willingToCounter) {
        context.counterDeclare(playerId, counterOption);
      } else {
        context.passCounterForCurrentPlayer(false);
      }
      continue;
    }

    if (context.state.phase === "burying") {
      const bankerId = context.state.bankerId;
      const buryCards = context.getBuryHintForPlayer(bankerId);
      assert.equal(Array.isArray(buryCards), true, "beginner friend-target regression should receive a bury hint array");
      assert.equal(buryCards.length, 7, "beginner friend-target regression should receive exactly 7 bury cards");
      context.completeBurying(bankerId, buryCards.map((card) => card.id));
      continue;
    }

    if (context.state.phase === "callingFriend") {
      const recommendation = getManagedFriendRecommendation(context);
      friendTargetLabel = recommendation.label;
      context.confirmFriendTargetSelection(recommendation);
      continue;
    }

    if (context.state.phase === "playing") {
      const playerId = context.state.currentTurnId;
      const pickedCards = pickManagedPlay(context, playerId);
      const played = context.playCards(playerId, pickedCards.map((card) => card.id), {
        skipStartTurn: true,
        skipResolveDelay: true,
      });
      assert.equal(played, true, `beginner friend-target regression should successfully play cards for player ${playerId}`);
      continue;
    }

    if (context.state.phase === "ending") {
      context.finishGame();
      continue;
    }

    throw new Error(`beginner friend-target regression encountered unexpected phase: ${context.state.phase}`);
  }

  const bottomResult = context.getBottomResultSummary();
  const outcome = context.getOutcome(context.state.defenderPoints, {
    bottomPenalty: bottomResult?.penalty || null,
  });

  return {
    seed: regressionCase.seed,
    friendTargetLabel,
    defenderPoints: context.state.defenderPoints,
    winner: outcome.winner,
  };
}

const results = REGRESSION_CASES.map((regressionCase) => runBeginnerFriendTargetWindowRegressionCase(regressionCase));

for (const [index, result] of results.entries()) {
  const regressionCase = REGRESSION_CASES[index];
  assert.equal(
    result.friendTargetLabel,
    regressionCase.expectedFriendTargetLabel,
    `beginner friend-target regression should keep ${regressionCase.seed} on ${regressionCase.expectedFriendTargetLabel}`,
  );
}

console.log("Beginner friend-target window regression passed:");
for (const result of results) {
  console.log(`- ${result.seed}: ${result.friendTargetLabel}, defender points ${result.defenderPoints}, winner ${result.winner}`);
}
