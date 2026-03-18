const assert = require("node:assert/strict");

const { loadHeadlessGameContext } = require("../support/headless-game-context");

/**
 * 作用：
 * 运行“开局码与回放种子写入日志 / 结果导出”的共享回归。
 *
 * 为什么这样写：
 * 这次改动的价值不只是生成两串文本，而是要保证：
 * 1. 每局开局都会分配更短但稳定可复现的 replay seed；
 * 2. 开局码能用更短的字母数字混合文本完整覆盖 162 张牌顺序并可 round-trip 解码；
 * 3. 局内信息栏不会直接泄露这两项复盘信息；
 * 4. 结果日志导出里仍然能看到这两项调试信息。
 *
 * 输入：
 * @param {void} - 直接创建 headless 上下文并执行断言。
 *
 * 输出：
 * @returns {{replaySeed: string, openingCodeLength: number, secondReplaySeed: string}} 便于控制台打印的摘要。
 *
 * 注意：
 * - 这里固定使用 headless 默认 seed，验证同一基础 seed 下生成的短 seed 仍稳定可复现。
 * - 同一上下文里第二次 `setupGame()` 必须自动拿到新的短 seed，避免“重置本局”仍然重复写旧随机链路。
 */
function runSuite() {
  const { context } = loadHeadlessGameContext({ seed: "opening-code-log" });

  context.setupGame();

  assert.equal(context.state.replaySeed, "1pDzIe11lsb", "headless 默认回放 seed 应稳定压缩成新的固定短码");
  assert.equal(context.state.replaySeed.length, 11, "headless 默认回放 seed 应压缩成固定 11 位");
  assert.match(context.state.replaySeed, /^[0-9A-Za-z]+$/, "默认回放 seed 应只包含数字和字母");
  assert.equal(context.state.openingCode.length, 169, "开局码应固定压缩为 169 位字母数字混合文本");
  assert.match(context.state.openingCode, /^[0-9A-Za-z]+$/, "开局码应只包含数字和字母");

  const encodedDeck = [...context.state.dealCards, ...context.state.bottomCards];
  const rebuiltOpeningCode = context.buildOpeningCode(encodedDeck, {
    firstDealPlayerId: context.state.nextFirstDealPlayerId,
    playerLevels: context.state.playerLevels,
    aiDifficulty: context.state.aiDifficulty,
  });
  assert.equal(rebuiltOpeningCode, context.state.openingCode, "直接用当前完整牌序重编码时应得到相同开局码");

  const decodedOpening = context.decodeOpeningCode(context.state.openingCode);
  assert.ok(decodedOpening, "开局码应能被成功解码");
  assert.equal(decodedOpening.version, 1, "当前开局码版本应固定为 1");
  assert.equal(decodedOpening.firstDealPlayerId, context.state.nextFirstDealPlayerId, "开局码应保留首抓玩家");
  assert.deepEqual(
    decodedOpening.playerLevels,
    context.state.playerLevels,
    "开局码应保留 5 位玩家等级"
  );
  assert.equal(decodedOpening.aiDifficulty, context.state.aiDifficulty, "开局码应保留当前 AI 难度");
  assert.equal(decodedOpening.deckCards.length, 162, "解码结果应还原完整 162 张牌");
  assert.equal(
    context.buildOpeningCode(decodedOpening.deckCards, {
      firstDealPlayerId: decodedOpening.firstDealPlayerId,
      playerLevels: decodedOpening.playerLevels,
      aiDifficulty: decodedOpening.aiDifficulty,
    }),
    context.state.openingCode,
    "开局码解码后再编码应保持完全一致"
  );
  assert.equal(
    context.decodeOpeningCode(
      `${context.state.openingCode.slice(0, -1)}${context.state.openingCode.endsWith("0") ? "1" : "0"}`
    ),
    null,
    "单字符篡改后的开局码应被校验码拦截"
  );

  assert.equal(
    context.state.allLogs.some((entry) => entry.startsWith("回放种子：")),
    false,
    "局内信息栏日志不应直接显示回放种子"
  );
  assert.equal(
    context.state.allLogs.some((entry) => entry.startsWith("开局码：")),
    false,
    "局内信息栏日志不应直接显示开局码"
  );

  const resultLogText = context.getResultLogText();
  assert.match(resultLogText, /复盘信息：/, "结果日志应追加独立的复盘信息段落");
  assert.match(
    resultLogText,
    new RegExp(`回放种子：${context.state.replaySeed}`),
    "结果日志应包含本局回放种子"
  );
  assert.match(resultLogText, new RegExp(`开局码：${context.state.openingCode}`), "结果日志应包含完整开局码");

  const firstReplaySeed = context.state.replaySeed;
  context.setupGame();
  assert.equal(context.state.replaySeed, "1pDyMZW7Y60", "同一上下文第二次开局应稳定生成下一条默认短 seed");
  assert.equal(context.state.replaySeed.length, 11, "同一上下文第二次开局也应继续使用短 seed");
  assert.equal(context.state.replaySeed === firstReplaySeed, false, "同一上下文第二次开局应自动拿到新的默认回放 seed");

  return {
    replaySeed: firstReplaySeed,
    openingCodeLength: context.state.openingCode.length,
    secondReplaySeed: context.state.replaySeed,
  };
}

const output = runSuite();

console.log("Opening code log regression passed:");
console.log(`- first replay seed: ${output.replaySeed}`);
console.log(`- opening code length: ${output.openingCodeLength}`);
console.log(`- second replay seed: ${output.secondReplaySeed}`);
