const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

const REPLAY_SEED = "ZSaiXo8zimf";
const OPENING_CODE = "50y987SRIc7bcSTqOIO1u1T5oORJzBfK3zDjd7NuHiqtj8JuqnNyCfZsNXbRp4PWwzVMOPqOumb7AzMBHfz3oTmTMcGaqFk5JOZkCEPtFQQFKq9Z8yzatPyyHZQWxsP63kJH5ReXzwk9904pBdUpliLEnqflg2OlTK6H9rFTr";

/**
 * 作用：
 * 把固定复盘场景里的 5 家都切成初级托管。
 *
 * 为什么这样写：
 * 这条回归要锁住“同一开局码 + 同一回放种子 + 全员初级 AI”下的真实行为，
 * 因此必须显式关掉默认的人类位，避免流程重新落回混合托管。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 直接原地改写玩家托管状态。
 *
 * 注意：
 * - 必须在 `setupGame(...)` 之后调用，因为开局会重建 `state.players`。
 * - 这里只服务固定 replay 回归，不改正式托管入口。
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
 * 这条 replay 只关心 AI 的扣底与找朋友路线，不需要等待 UI 计时；
 * 直接复用测试侧的最小推进方式，能减少异步壳层差异带来的噪音。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 成功时把牌局推进到埋底或后续阶段。
 *
 * 注意：
 * - 优先调用正式阶段推进函数；缺失时才做最小手动回退。
 * - 这里只是测试辅助，不应反向改写正式状态机设计。
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
    throw new Error("third-ace takeover replay: failed to find banker during bottom reveal fallback");
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
 * 这条回归验证的是完整 beginner 托管链，而不是单个 helper；
 * 因此这里保持与真流程一致的兜底顺序：hint -> search -> forced -> emergency。
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
    throw new Error(`third-ace takeover replay: no managed play for player ${playerId}`);
  }
  return pickedCards;
}

/**
 * 作用：
 * 运行固定 replay，并提取“AA10 -> 10 找友 -> 第三张 A 接手”所需的关键快照。
 *
 * 为什么这样写：
 * 这次用户给出的异常横跨扣底、叫朋友和首发三段逻辑，
 * 单测单看某个 helper 很难保证整条链路不再回退；
 * 把固定复盘直接锁成专项回归后，后续改 beginner heuristic 时就能立刻发现偏移。
 *
 * 输入：
 * @param {void} - 直接使用文件顶部固定的 replay seed 与 opening code。
 *
 * 输出：
 * @returns {{
 *   buryCards: string[],
 *   bankerDiamondsAfterBury: string[],
 *   friendTarget: { suit: string, rank: string, occurrence: number } | null,
 *   firstBankerDiamondLead: string[] | null,
 *   friendTakeoverPlay: string[] | null
 * }} 便于断言的 replay 摘要。
 *
 * 注意：
 * - 这里只锁用户反馈的具体 replay，不替代批量 headless 统计。
 * - 一旦关键快照都已拿到，会提前结束循环，减少测试耗时。
 */
function runThirdAceTakeoverReplayRegression() {
  const { context } = loadHeadlessGameContext({ seed: REPLAY_SEED });

  context.state.aiDifficulty = "beginner";
  const setupOk = context.setupGame({
    replaySeedInput: REPLAY_SEED,
    openingCode: OPENING_CODE,
  });
  assert.equal(setupOk, true, "third-ace takeover replay should accept the provided opening code");

  setAllPlayersToManagedBeginnerAi(context);
  context.startDealing();

  const snapshot = {
    buryCards: [],
    bankerDiamondsAfterBury: [],
    friendTarget: null,
    firstBankerDiamondLead: null,
    friendTakeoverPlay: null,
  };

  let steps = 0;
  while (!context.state.gameOver) {
    steps += 1;
    assert.ok(steps <= 5000, `third-ace takeover replay exceeded 5000 steps at phase ${context.state.phase}`);

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
      snapshot.buryCards = buryCards.map((card) => `${card.suit}-${card.rank}`);
      context.completeBurying(bankerId, buryCards.map((card) => card.id));
      const banker = context.getPlayer(bankerId);
      snapshot.bankerDiamondsAfterBury = banker.hand
        .filter((card) => card.suit === "diamonds")
        .map((card) => `${card.suit}-${card.rank}`);
      continue;
    }

    if (context.state.phase === "callingFriend") {
      const bankerId = context.state.bankerId;
      const recommendation = bankerId === 1
        ? context.getFriendPickerRecommendation()?.target
        : context.chooseFriendTarget()?.target;
      assert.ok(recommendation, "third-ace takeover replay should receive a friend recommendation");
      snapshot.friendTarget = recommendation
        ? { suit: recommendation.suit, rank: recommendation.rank, occurrence: recommendation.occurrence || 1 }
        : null;
      context.confirmFriendTargetSelection(recommendation);
      continue;
    }

    if (context.state.phase === "playing") {
      const playerId = context.state.currentTurnId;
      const pickedCards = pickManagedPlay(context, playerId);

      if (
        playerId === context.state.bankerId
        && context.state.currentTrick.length === 0
        && snapshot.firstBankerDiamondLead === null
        && pickedCards.every((card) => card.suit === "diamonds")
      ) {
        snapshot.firstBankerDiamondLead = pickedCards.map((card) => `${card.suit}-${card.rank}`);
      }

      if (
        snapshot.firstBankerDiamondLead
        && context.state.currentTrick[0]?.playerId === context.state.bankerId
        && context.state.currentTrick[0]?.cards.every((card) => card.suit === "diamonds")
        && playerId === 4
        && pickedCards.some((card) => card.suit === "diamonds" && card.rank === "A")
      ) {
        snapshot.friendTakeoverPlay = pickedCards.map((card) => `${card.suit}-${card.rank}`);
      }

      const played = context.playCards(playerId, pickedCards.map((card) => card.id), {
        skipStartTurn: true,
        skipResolveDelay: true,
      });
      assert.equal(played, true, `third-ace takeover replay should successfully play cards for player ${playerId}`);

      if (
        snapshot.firstBankerDiamondLead
        && snapshot.friendTakeoverPlay
        && snapshot.buryCards.length > 0
        && snapshot.bankerDiamondsAfterBury.length > 0
        && snapshot.friendTarget
      ) {
        break;
      }
      continue;
    }

    if (context.state.phase === "ending") {
      context.finishGame();
      continue;
    }

    throw new Error(`third-ace takeover replay encountered unexpected phase: ${context.state.phase}`);
  }

  return snapshot;
}

const result = runThirdAceTakeoverReplayRegression();
const normalizedBuryCards = Array.from(result.buryCards || []);
const normalizedBankerDiamondsAfterBury = Array.from(result.bankerDiamondsAfterBury || []);
const normalizedFriendTarget = result.friendTarget
  ? {
    suit: result.friendTarget.suit,
    rank: result.friendTarget.rank,
    occurrence: result.friendTarget.occurrence,
  }
  : null;
const normalizedFirstBankerDiamondLead = Array.from(result.firstBankerDiamondLead || []);
const normalizedFriendTakeoverPlay = Array.from(result.friendTakeoverPlay || []);

assert.deepEqual(
  normalizedBankerDiamondsAfterBury,
  ["diamonds-A", "diamonds-A", "diamonds-10"],
  "third-ace takeover replay should leave banker with exactly AA10 in diamonds after burying"
);
assert.ok(
  normalizedBuryCards.includes("diamonds-4"),
  "third-ace takeover replay should bury diamonds 4 so the banker keeps AA10"
);
assert.equal(
  normalizedBuryCards.includes("diamonds-10"),
  false,
  "third-ace takeover replay should no longer bury diamonds 10"
);
assert.deepEqual(
  normalizedFriendTarget,
  { suit: "diamonds", rank: "A", occurrence: 3 },
  "third-ace takeover replay should still call the third diamonds A"
);
assert.deepEqual(
  normalizedFirstBankerDiamondLead,
  ["diamonds-10"],
  "third-ace takeover replay should use diamonds 10 to search for friend before cashing AA"
);
assert.deepEqual(
  normalizedFriendTakeoverPlay,
  ["diamonds-A"],
  "third-ace takeover replay should let the friend use the third diamonds A to take over"
);

console.log("Beginner third-ace takeover replay regression passed:");
console.log(`- bury: ${result.buryCards.join(", ")}`);
console.log(`- banker diamonds after bury: ${result.bankerDiamondsAfterBury.join(", ")}`);
console.log(`- first banker diamond lead: ${result.firstBankerDiamondLead.join(", ")}`);
console.log(`- friend takeover play: ${result.friendTakeoverPlay.join(", ")}`);
