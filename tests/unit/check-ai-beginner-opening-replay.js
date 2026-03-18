const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

const REPLAY_SEED = "ZSO1hGI883r";
const OPENING_CODE = "QX27xOXBZdU4CmSF2ri6fYNjs4ieoAtS0wZQ5o6rEFIZ9CuNcjoWcUPntWX54epprgTWp6MXob1lYdc2SJqqJckylmAMuxzi5SWNTjU69n3Mf4ZoWbaJm8lf75Tv8jKjCCknmz3eM02Wq7E7TWEYX2iiL0ZgIdCZcxKMNp4rS";

/**
 * 作用：
 * 把当前 opening replay 场景下的 5 家都切成初级托管。
 *
 * 为什么这样写：
 * 这条回归要锁住“同一开局码 + 同一回放种子 + 全员初级 AI”下的实际出牌路径，
 * 因此需要显式关闭 1 号位的人类交互，避免 shared 默认值把这局又跑成“人类 + AI”混合流程。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 直接原地改写玩家托管状态。
 *
 * 注意：
 * - 必须在 `setupGame(...)` 之后调用，因为开局会重建 `state.players`。
 * - 这里只锁定本回归场景，不改正式产品的托管入口。
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
 * 这条 replay 回归只关心固定开局后的 AI 出牌路径，不需要等待 UI 计时；
 * 直接复用 headless runner 的兼容推进方式，可以减少测试壳暴露差异带来的噪音。
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
    throw new Error("opening replay regression: failed to find banker during bottom reveal fallback");
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
 * opening replay 回归要验证的不是单个 helper，而是“整条初级托管链”；
 * 因此这里保持与真实托管同样的兜底顺序：hint -> search -> forced -> emergency。
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
    throw new Error(`opening replay regression: no managed play for player ${playerId}`);
  }
  return pickedCards;
}

/**
 * 作用：
 * 用固定 `开局码 + 回放种子` 执行一局完整的全初级 AI 对局。
 *
 * 为什么这样写：
 * 这次用户给出的异常不是随机采样，而是一条可以稳定复现的具体开局。
 * 把它单独收成 opening replay 回归后，后续每次改 beginner heuristic，
 * 都能直接校验“是否还会退回到旧的单张试探与过早低主清控”。
 *
 * 输入：
 * @param {void} - 直接使用本文件顶部固定的 replay seed 与 opening code。
 *
 * 输出：
 * @returns {{defenderPoints: number, outcome: object, logs: string[]}} 便于断言与控制台输出的对局摘要。
 *
 * 注意：
 * - 这条回归只锁当前 opening replay，不替代批量 headless 胜率统计。
 * - 如果未来这条 fixed replay 再被修好到“打家直接赢”，当前断言仍应继续兼容。
 */
function runReplayRegression() {
  const { context } = loadHeadlessGameContext({ seed: REPLAY_SEED });

  context.state.aiDifficulty = "beginner";
  const setupOk = context.setupGame({
    replaySeedInput: REPLAY_SEED,
    openingCode: OPENING_CODE,
  });
  assert.equal(setupOk, true, "opening replay regression should accept the provided opening code");

  setAllPlayersToManagedBeginnerAi(context);
  context.startDealing();

  let steps = 0;
  while (!context.state.gameOver) {
    steps += 1;
    assert.ok(steps <= 5000, `opening replay regression exceeded 5000 steps at phase ${context.state.phase}`);

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
      assert.equal(Array.isArray(buryCards), true, "opening replay regression should receive a bury hint array");
      assert.equal(buryCards.length, 7, "opening replay regression should receive exactly 7 bury cards");
      context.completeBurying(bankerId, buryCards.map((card) => card.id));
      continue;
    }

    if (context.state.phase === "callingFriend") {
      const bankerId = context.state.bankerId;
      const recommendation = bankerId === 1
        ? context.getFriendPickerRecommendation()?.target
        : context.chooseFriendTarget()?.target;
      assert.ok(recommendation, "opening replay regression should receive a friend recommendation");
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
      assert.equal(played, true, `opening replay regression should successfully play cards for player ${playerId}`);
      continue;
    }

    if (context.state.phase === "ending") {
      context.finishGame();
      continue;
    }

    throw new Error(`opening replay regression encountered unexpected phase: ${context.state.phase}`);
  }

  const bottomResult = context.getBottomResultSummary();
  const outcome = context.getOutcome(context.state.defenderPoints, {
    bottomPenalty: bottomResult?.penalty || null,
  });

  return {
    defenderPoints: context.state.defenderPoints,
    outcome,
    logs: [...context.state.allLogs],
  };
}

const result = runReplayRegression();
const joinedLogs = result.logs.join("\n");

assert.match(joinedLogs, /玩家1 出牌：♠A、♠A。/, "opening replay regression should open with the forced pair-A friend reveal lead");
assert.match(joinedLogs, /玩家2 打出了第三张黑桃 A，已站队。/, "opening replay regression should reveal the friend on the very first trick");
assert.match(joinedLogs, /玩家1 出牌：♠K。/, "opening replay regression should continue cashing the promoted friend-suit control card");
assert.match(joinedLogs, /玩家1 出牌：♣A。/, "opening replay regression should continue the side-suit control chain before low-trump clearing");
assert.ok(result.defenderPoints <= 170, `opening replay regression should improve this sample below 170 defender points, got ${result.defenderPoints}`);

console.log("Beginner opening replay regression passed:");
console.log(`- defender points: ${result.defenderPoints}`);
console.log(`- winner: ${result.outcome.winner}`);
