const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

/**
 * 作用：
 * 运行负级链与开局码等级编码的专项回归。
 *
 * 为什么这样写：
 * 这次需求的核心不是单纯把 `A` 改成另一个回退值，
 * 而是要让 `A` 继续走主扣 / 副扣锚点，同时把 `2` 之后的负级链统一改成 `-A -> -K -> -Q -> -J -> -10 ... -> -2`，
 * 同时保证升级、最低档保护和开局码 round-trip 都继续成立；
 * 把这些断言收进同一套回归后，后续再改等级规则时更容易发现断链点。
 *
 * 输入：
 * @param {void} - 直接创建 headless 上下文并执行断言。
 *
 * 输出：
 * @returns {{negativeLevelCount:number, aceDropTarget:string, openingCodeLength:number}} 便于打印的人类可读摘要。
 *
 * 注意：
 * - 这里既覆盖主扣也覆盖副扣，确保 `A` 的锚点回退和 `2` 进入负级链两条规则能同时成立。
 * - 开局码断言要直接验证 `playerLevels` round-trip，避免只测出牌牌序而漏掉元信息编码。
 */
function runSuite() {
  const { context } = loadHeadlessGameContext({ seed: "negative-level-order-regression" });

  assert.deepEqual(
    [...context.NEGATIVE_LEVELS],
    ["-2", "-3", "-4", "-5", "-6", "-7", "-8", "-9", "-10", "-J", "-Q", "-K", "-A"],
    "负级链应扩成从 -2 到 -A 的完整顺序"
  );
  assert.equal(context.dropLevel("A", 1, "trump"), "Q", "A 主扣 1 级后应先回到 Q");
  assert.equal(context.dropLevel("A", 1, "vice"), "K", "A 副扣 1 级后应先回到 K");
  assert.equal(context.dropLevel("2", 1, "trump"), "-A", "2 被扣 1 级后应先进入 -A");
  assert.equal(context.dropLevel("2", 2, "vice"), "-K", "2 连扣 2 级后应继续按 -A -> -K 顺序回退");
  assert.equal(context.dropLevel("A", 20, "trump"), "-2", "A 连续降级后应以 -2 为最低档");
  assert.equal(context.dropLevel("-A", 1, "vice"), "-K", "负级内部继续降级时应沿完整负级链顺序回退");
  assert.equal(context.shiftLevel("-2", 1), "-3", "负级升级时应在负级链内逐档回升");
  assert.equal(context.shiftLevel("-K", 1), "-A", "负级升级到最高档时应先回到 -A");
  assert.equal(context.shiftLevel("-A", 1), "2", "负级回到正级时单次结算最多只能先回到 2");

  context.setupGame();
  const customLevels = {
    1: "-A",
    2: "-10",
    3: "-2",
    4: "A",
    5: "5",
  };
  const openingCode = context.buildOpeningCode(
    [...context.state.dealCards, ...context.state.bottomCards],
    {
      firstDealPlayerId: context.state.nextFirstDealPlayerId,
      playerLevels: customLevels,
      aiDifficulty: context.state.aiDifficulty,
    }
  );
  const decodedOpening = context.decodeOpeningCode(openingCode);

  assert.ok(openingCode, "带完整负级链的开局码应能成功编码");
  assert.ok(decodedOpening, "带完整负级链的开局码应能成功解码");
  assert.deepEqual(
    { ...decodedOpening.playerLevels },
    customLevels,
    "开局码应保留新的完整负级链等级信息"
  );

  return {
    negativeLevelCount: context.NEGATIVE_LEVELS.length,
    aceDropTarget: context.dropLevel("A", 1, "trump"),
    openingCodeLength: openingCode.length,
  };
}

const output = runSuite();

console.log("Negative level order regression passed:");
console.log(`- negative levels: ${output.negativeLevelCount}`);
console.log(`- A trump fallback target: ${output.aceDropTarget}`);
console.log(`- opening code length: ${output.openingCodeLength}`);
