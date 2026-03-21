const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

const REPLAY_SEED = "ZSh8Z8LxkTU";
const OPENING_CODE = "7D2LfvsbVQIVQgwPAftG5aeA8sqGvSiVRHUpYgMYZ7dUBiPp1855xqMq3YS3iM6OK5nNJ8LW12MDa6xIOTF6xip5WF8WABS9FSaYrkEaCJPSnqX3SRD3whFCETVrQs38WNa6KeZZrMJhW5AZK8EArxK6Stl2Xhag4GqU75pdT";
const EXPECTED_SUIT = "diamonds";
const EXPECTED_RANK = "A";

/**
 * 作用：
 * 把当前 headless 场景里的 5 个座位统一切到指定难度的托管 AI。
 *
 * 为什么这样写：
 * 这条回归要锁的是“同一复盘码下，各难度自动叫朋友与默认推荐是否还会误选主牌 A”；
 * 因此需要确保埋底与叫朋友阶段都走正式 AI 链路，而不是混入人类分支或旧默认值。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 * @param {"beginner"|"intermediate"|"advanced"} difficulty - 本次要验证的 AI 难度。
 *
 * 输出：
 * @returns {void} 直接原地改写玩家身份与难度配置。
 *
 * 注意：
 * - 必须在 `setupGame(...)` 之后调用，因为开局会重建玩家数组。
 * - 这里只服务回归测试，不改变正式托管入口。
 */
function setAllPlayersToManagedDifficulty(context, difficulty) {
  context.state.aiDifficulty = difficulty;
  for (const player of context.state.players) {
    player.isHuman = false;
    player.aiDifficulty = difficulty;
  }
}

/**
 * 作用：
 * 在 headless 回归里把翻底公示阶段稳定推进到埋底阶段。
 *
 * 为什么这样写：
 * 这条回归只关心“扣底后叫朋友会选哪张牌”，
 * 不需要等待 UI 读秒；直接用最小兼容推进方式即可把状态机收口到埋底链路。
 *
 * 输入：
 * @param {object} context - 当前 headless 游戏上下文。
 *
 * 输出：
 * @returns {void} 成功时把牌局推进到埋底或后续阶段。
 *
 * 注意：
 * - 若未来 headless 暴露了正式阶段推进函数，应优先改用正式入口。
 * - 这里只做测试辅助，不应反向改写正式实现。
 */
function advanceBottomReveal(context) {
  const banker = context.getPlayer(context.state.bankerId);
  if (!banker) {
    throw new Error("friend-target trump-ace regression: failed to find banker during bottom reveal");
  }
  banker.hand.push(...(Array.isArray(context.state.bottomCards) ? context.state.bottomCards : []));
  context.state.selectedCardIds = [];
  context.state.showBottomPanel = false;
  context.state.phase = "burying";
  context.state.countdown = 60;
}

/**
 * 作用：
 * 把固定复盘码推进到叫朋友阶段，并读取当前默认推荐与自动选择结果。
 *
 * 为什么这样写：
 * 用户提供的问题并不是单个 helper 的纯函数 bug，
 * 而是“开局码 -> 扣底 -> 叫朋友”整条共享链路在真实牌面下把主牌 `A` 顶成了默认选择；
 * 因此这里直接跑到 `callingFriend` 状态，再同时锁住 picker recommendation 与 AI 自动选择。
 *
 * 输入：
 * @param {"beginner"|"intermediate"|"advanced"} difficulty - 本次要验证的 AI 难度。
 *
 * 输出：
 * @returns {{difficulty: string, trumpSuit: string, recommendation: object, autoChoice: object}} 当前样本的关键叫朋友快照。
 *
 * 注意：
 * - 这里只锁叫朋友决策，不替代更细的首发 / 跟牌策略回归。
 * - 若 5000 步内仍未进入 `callingFriend`，必须直接失败，避免静默跳过。
 */
function captureFriendTargetSnapshot(difficulty) {
  const { context } = loadHeadlessGameContext({ seed: `${REPLAY_SEED}:${difficulty}:trump-ace` });
  const setupOk = context.setupGame({ replaySeedInput: REPLAY_SEED, openingCode: OPENING_CODE });
  assert.equal(setupOk, true, `friend-target trump-ace regression should set up ${difficulty} replay bundle`);

  setAllPlayersToManagedDifficulty(context, difficulty);
  context.startDealing();

  let steps = 0;
  while (steps < 5000) {
    steps += 1;
    const phase = context.state.phase;

    if (phase === "dealing") {
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

    if (phase === "bottomReveal") {
      advanceBottomReveal(context);
      continue;
    }

    if (phase === "countering") {
      const playerId = context.state.currentTurnId;
      const counterOption = context.getCounterDeclarationForPlayer(playerId);
      if (counterOption) {
        context.counterDeclare(playerId, counterOption);
      } else {
        context.passCounterForCurrentPlayer(false);
      }
      continue;
    }

    if (phase === "burying") {
      const bankerId = context.state.bankerId;
      const buryCards = context.getBuryHintForPlayer(bankerId);
      assert.equal(Array.isArray(buryCards), true, "friend-target trump-ace regression should receive a bury hint array");
      assert.equal(buryCards.length, 7, "friend-target trump-ace regression should receive exactly 7 bury cards");
      context.completeBurying(bankerId, buryCards.map((card) => card.id));
      continue;
    }

    if (phase === "callingFriend") {
      const recommendation = context.getFriendPickerRecommendation?.()?.target || null;
      const autoChoice = context.chooseFriendTarget?.()?.target || null;
      assert.ok(recommendation, `friend-target trump-ace regression should expose a picker recommendation for ${difficulty}`);
      assert.ok(autoChoice, `friend-target trump-ace regression should expose an auto friend target for ${difficulty}`);
      return {
        difficulty,
        trumpSuit: context.state.trumpSuit,
        recommendation,
        autoChoice,
      };
    }

    throw new Error(`friend-target trump-ace regression encountered unexpected phase: ${phase}`);
  }

  throw new Error(`friend-target trump-ace regression exceeded 5000 steps for ${difficulty}`);
}

/**
 * 作用：
 * 断言固定复盘码下的默认推荐与自动叫朋友都已经避开主牌 `A` 误选。
 *
 * 为什么这样写：
 * 这次用户给出的异常是“同一牌面下把主牌 `A` 顶成了朋友牌”；
 * 这里直接锁住“必须回到副牌 `方块 A`，且不能再落回主牌 `A`”这条边界；
 * 张次仍继续交给各难度自己的 heuristic 比较，避免把本次修复错误地收窄成某一条固定 occurrence。
 *
 * 输入：
 * @param {{difficulty: string, trumpSuit: string, recommendation: object, autoChoice: object}} snapshot - 当前难度的叫朋友快照。
 *
 * 输出：
 * @returns {void} 只做断言，不返回额外结果。
 *
 * 注意：
 * - 同时锁 picker recommendation 与 AI 自动选择，避免 human 默认值和 AI 分叉。
 * - 这里也顺手断言“推荐牌不能等于主花色”，让失败信息更直观。
 */
function assertExpectedFriendTargetSnapshot(snapshot) {
  assert.equal(
    snapshot.recommendation.suit,
    EXPECTED_SUIT,
    `${snapshot.difficulty}: picker recommendation should switch back to a side-suit target`
  );
  assert.equal(
    snapshot.recommendation.rank,
    EXPECTED_RANK,
    `${snapshot.difficulty}: picker recommendation should continue targeting side-suit A`
  );
  assert.equal(
    snapshot.autoChoice.suit,
    EXPECTED_SUIT,
    `${snapshot.difficulty}: auto friend target should switch back to a side-suit target`
  );
  assert.equal(
    snapshot.autoChoice.rank,
    EXPECTED_RANK,
    `${snapshot.difficulty}: auto friend target should continue targeting side-suit A`
  );
  assert.notEqual(
    snapshot.recommendation.suit,
    snapshot.trumpSuit,
    `${snapshot.difficulty}: picker recommendation should no longer point at the trump suit`
  );
  assert.notEqual(
    snapshot.autoChoice.suit,
    snapshot.trumpSuit,
    `${snapshot.difficulty}: auto friend target should no longer point at the trump suit`
  );
  assert.ok(
    snapshot.recommendation.occurrence >= 2,
    `${snapshot.difficulty}: picker recommendation should still avoid calling the first copy already held by the banker`
  );
  assert.ok(
    snapshot.autoChoice.occurrence >= 2,
    `${snapshot.difficulty}: auto friend target should still avoid calling the first copy already held by the banker`
  );
}

const beginnerSnapshot = captureFriendTargetSnapshot("beginner");
const intermediateSnapshot = captureFriendTargetSnapshot("intermediate");
const advancedSnapshot = captureFriendTargetSnapshot("advanced");

assertExpectedFriendTargetSnapshot(beginnerSnapshot);
assertExpectedFriendTargetSnapshot(intermediateSnapshot);
assertExpectedFriendTargetSnapshot(advancedSnapshot);

console.log("Friend-target trump-ace regression passed:");
console.log(`- beginner: ${beginnerSnapshot.autoChoice.label}`);
console.log(`- intermediate: ${intermediateSnapshot.autoChoice.label}`);
console.log(`- advanced: ${advancedSnapshot.autoChoice.label}`);
