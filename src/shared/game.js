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

/**
 * 作用：
 * 规范化 `setupGame()` 支持的多种开局参数形式。
 *
 * 为什么这样写：
 * 现在开局既可能来自普通新局，也可能来自“按回放种子重开”或“按开局码重开”；
 * 统一在一个 helper 里归一化后，现有无参调用、传 seed 的旧调用和新的对象式调用都能共存，不必拆成多套初始化入口。
 *
 * 输入：
 * @param {string|number|{replaySeedInput?: string|number, openingCode?: string}|null|undefined} setupInput - 本次开局请求的输入。
 *
 * 输出：
 * @returns {{replaySeedInput: string|number|null|undefined, openingCode: string}} 归一化后的开局配置。
 *
 * 注意：
 * - 纯字符串/数字沿用旧语义，继续视为 replay seed。
 * - 开局码会在这里顺手做 trim，但不会改动大小写；新编码区分大小写。
 */
function normalizeSetupGameOptions(setupInput) {
  if (setupInput && typeof setupInput === "object" && !Array.isArray(setupInput)) {
    return {
      replaySeedInput: setupInput.replaySeedInput,
      openingCode: normalizeOpeningCodeInput(setupInput.openingCode),
    };
  }
  return {
    replaySeedInput: setupInput,
    openingCode: "",
  };
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

/**
 * 作用：
 * 重置当前这局牌并立刻重新发牌，但保留现有等级进度。
 *
 * 为什么这样写：
 * 用户需要一个“本局重来”的快捷入口，既能把当前发牌、叫主和出牌过程全部清空，
 * 又不能把长期升级进度误重置回 `2`；复用 `setupGame() + startDealing()` 后，
 * 可以继续沿用当前首抓人、共享洗牌流程和各平台一致的开局状态机。
 *
 * 输入：
 * @param {void} - 直接读取并重置当前共享状态。
 *
 * 输出：
 * @returns {void} 只重建本局牌面并进入发牌阶段，不返回额外结果。
 *
 * 注意：
 * - 这里只重置当前牌局，不重置 `state.playerLevels`。
 * - 结果弹窗若仍打开，必须先收起，避免旧结算遮住新发牌流程。
 */
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
  appendLog(`首抓玩家：${getPlayer(state.nextFirstDealPlayerId || 1)?.name || "玩家1"}`);
  appendLog(`玩家等级：${getPlayerLevelsLogText()}`);
}

/**
 * 作用：
 * 初始化一局新的牌局状态，并为这一局分配可回放的 seed 与开局码。
 *
 * 为什么这样写：
 * 现在调试需要“从日志完全复原开局”，因此开局时不能只做旧式随机洗牌；
 * 必须在同一个入口里同时初始化共享状态、回放随机源和完整牌序编码，保证日志与真实发牌始终来自同一份底层数据。
 *
 * 输入：
 * @param {string|number|null|undefined} [replaySeedInput] - 可选的显式回放 seed；不传时按当前环境自动分配。
 *
 * 输出：
 * @returns {void} 只重置本局状态并触发首轮渲染，不返回额外结果。
 *
 * 注意：
 * - 这里初始化出的 seed 会影响洗牌、AI 自动亮主/反主意愿和节奏随机。
 * - 若未来支持“按开局码重开”，仍应复用这个入口，而不是额外造第二套初始化逻辑。
 */
function setupGame(setupInput) {
  const setupOptions = normalizeSetupGameOptions(setupInput);
  const openingRestore = setupOptions.openingCode ? decodeOpeningCode(setupOptions.openingCode) : null;
  if (setupOptions.openingCode && !openingRestore) return false;

  clearTimers();
  clearCenterAnnouncement(true);
  refreshSavedProgressAvailability();
  if (state.autoManageMode !== "persistent") {
    state.autoManageMode = DEFAULT_AUTO_MANAGE_MODE;
  }
  if (openingRestore) {
    state.playerLevels = normalizePlayerLevels(openingRestore.playerLevels);
    state.nextFirstDealPlayerId = openingRestore.firstDealPlayerId;
    state.aiDifficulty = normalizeAiDifficulty(openingRestore.aiDifficulty);
  }
  state.bankerId = PLAYER_ORDER.includes(state.bankerId) ? state.bankerId : 1;
  state.levelRank = null;
  state.players = PLAYER_ORDER.map((id) => ({
    id,
    name: `玩家${id}`,
    isHuman: id === 1 ? state.autoManageMode === "off" : false,
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
  state.replaySeed = "";
  state.roundRandom = null;
  state.openingCode = "";
  state.countdown = 30;
  state.dealCards = [];
  state.dealIndex = 0;
  state.declaration = null;
  state.counterPasses = 0;
  state.phase = "ready";
  state.showLastTrick = false;
  state.showLogPanel = false;
  state.showDebugPanel = false;
  state.showReplayPanel = false;
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
  state.friendRetargetCountdown = 0;
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

  initializeRoundReplaySeed(setupOptions.replaySeedInput);
  const deck = openingRestore
    ? openingRestore.deckCards.map((card) => ({ ...card }))
    : createDeck();
  const openingDeck = deck.slice();
  state.dealCards = deck.splice(0, 31 * 5);
  state.bottomCards = deck.splice(0, 7);
  state.openingCode = openingRestore
    ? setupOptions.openingCode
    : buildOpeningCode(openingDeck, {
        firstDealPlayerId: state.nextFirstDealPlayerId || 1,
        playerLevels: state.playerLevels,
        aiDifficulty: state.aiDifficulty,
      });

  appendSessionHeaderLogs();

  render();
  return true;
}

/**
 * 作用：
 * 把一组 `回放种子 + 开局码` 组装成可跨端复制的复盘码文本。
 *
 * 为什么这样写：
 * 手游端需要一键把当前局发给 PC 端继续复盘；
 * 统一固定成 `seed + openingCode` 后，移动端复制、桌面端粘贴和 QA 口头沟通都能共享同一份短格式。
 *
 * 输入：
 * @param {string|number|null|undefined} replaySeedInput - 当前局要导出的回放种子。
 * @param {string|null|undefined} openingCodeInput - 当前局要导出的开局码。
 *
 * 输出：
 * @returns {string} 规范化后的复盘码；任一关键字段缺失时返回空串。
 *
 * 注意：
 * - `开局码` 必须保留原始大小写；新编码大小写会参与实际解码。
 * - 这里只负责拼文本，不校验调用方是否真的处于对局中。
 */
function buildReplayClipboardBundle(replaySeedInput, openingCodeInput) {
  const normalizedSeed = normalizeReplaySeedInput(replaySeedInput);
  const normalizedOpeningCode = normalizeOpeningCodeInput(openingCodeInput);
  if (!normalizedSeed || !normalizedOpeningCode) return "";
  return `${normalizedSeed} + ${normalizedOpeningCode}`;
}

/**
 * 作用：
 * 从剪贴板文本或日志片段里解析出 `回放种子 + 开局码`。
 *
 * 为什么这样写：
 * PC 端“点此粘贴”既要兼容手游复制出来的紧凑格式，
 * 也希望顺手兼容结果日志里的 `回放种子：... / 开局码：...` 两行文本，减少 QA 二次整理。
 *
 * 输入：
 * @param {string} rawText - 剪贴板里读取到的原始文本。
 *
 * 输出：
 * @returns {{replaySeed: string, openingCode: string}|null} 成功时返回解析后的两项；失败时返回 `null`。
 *
 * 注意：
 * - 解析阶段会顺手校验 `开局码` 是否能被当前版本解码，避免把脏文本写进草稿框。
 * - `回放种子` 允许包含冒号、短横线等常见日志字符，但最终仍会做首尾 trim。
 */
function parseReplayClipboardBundle(rawText) {
  const normalizedText = String(rawText || "").trim();
  if (!normalizedText) return null;

  const labeledSeedMatch = normalizedText.match(/回放种子[:：]\s*([^\n\r]+)/);
  const labeledOpeningCodeMatch = normalizedText.match(/开局码[:：]\s*([0-9A-Za-z]+)/);
  const compactMatch = normalizedText.match(/^([\s\S]*?)\s*\+\s*([0-9A-Za-z]+)\s*$/);

  const normalizedSeed = normalizeReplaySeedInput(
    labeledSeedMatch?.[1] || compactMatch?.[1] || ""
  );
  const normalizedOpeningCode = normalizeOpeningCodeInput(
    labeledOpeningCodeMatch?.[1] || compactMatch?.[2] || ""
  );

  if (!normalizedSeed || !normalizedOpeningCode) return null;
  if (!decodeOpeningCode(normalizedOpeningCode)) return null;
  return {
    replaySeed: normalizedSeed,
    openingCode: normalizedOpeningCode,
  };
}

/**
 * 作用：
 * 把一段纯文本写入系统剪贴板。
 *
 * 为什么这样写：
 * 结果日志复制和新的复盘码复制都要走同一套浏览器能力；
 * 把 `Clipboard API` 和老浏览器 `textarea + execCommand` 兜底收口后，业务入口就不用重复维护两套复制代码。
 *
 * 输入：
 * @param {string} text - 当前要写入剪贴板的文本。
 *
 * 输出：
 * @returns {Promise<void>} 写入成功时正常结束；失败时抛出异常给调用方处理。
 *
 * 注意：
 * - 空文本不应继续写入，直接返回即可。
 * - fallback 只覆盖复制，不额外承担读取剪贴板能力。
 */
async function writeTextToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
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

/**
 * 作用：
 * 从系统剪贴板读取纯文本。
 *
 * 为什么这样写：
 * PC 端“点此粘贴”要在用户点击后直接把手游复制出来的复盘码带回输入框；
 * 单独收成 helper 后，面板按钮和未来快捷键都能共享同一套权限与异常处理边界。
 *
 * 输入：
 * @param {void} - 无额外输入，直接读取浏览器剪贴板。
 *
 * 输出：
 * @returns {Promise<string>} 当前剪贴板里的纯文本。
 *
 * 注意：
 * - 读取剪贴板通常要求安全上下文和用户手势；拿不到权限时由调用方决定提示文案。
 * - 当前没有可靠的旧浏览器读取兜底，因此缺 API 时直接抛错。
 */
async function readTextFromClipboard() {
  if (!navigator.clipboard?.readText) {
    throw new Error("clipboard-read-unavailable");
  }
  return navigator.clipboard.readText();
}

/**
 * 作用：
 * 把当前牌局的复盘码复制到系统剪贴板。
 *
 * 为什么这样写：
 * 手游端菜单只需要知道“这局能不能复制、复制后得到什么提示”，
 * 不应该关心底层复盘码格式或剪贴板 fallback；统一业务入口后，PC / mobile 都能复用同一套导出规范。
 *
 * 输入：
 * @param {void} - 直接读取当前共享状态里的 `回放种子 / 开局码`。
 *
 * 输出：
 * @returns {Promise<{ok: boolean, text: string, message: string, reason?: string}>} 当前复制动作的结果摘要。
 *
 * 注意：
 * - 只有当前局同时拥有 `回放种子` 和 `开局码` 时才允许复制。
 * - 失败信息只返回短 reason，具体 UI 呈现由调用方决定。
 */
async function copyCurrentReplayBundleToClipboard() {
  const bundleText = buildReplayClipboardBundle(state.replaySeed, state.openingCode);
  if (!bundleText) {
    return {
      ok: false,
      text: "",
      reason: "missing",
      message: TEXT.debug.replayCodeUnavailable,
    };
  }
  try {
    await writeTextToClipboard(bundleText);
    return {
      ok: true,
      text: bundleText,
      message: TEXT.debug.replayCodeCopied,
    };
  } catch (error) {
    return {
      ok: false,
      text: "",
      reason: "write_failed",
      message: TEXT.debug.replayClipboardWriteFailed,
    };
  }
}

/**
 * 作用：
 * 读取剪贴板里的复盘码，并把结果写回复盘面板草稿。
 *
 * 为什么这样写：
 * PC 端复盘面板现在要支持“从手游复制、桌面点一下直接回填”的闭环；
 * 把读取、解析、状态提示和草稿写回收成一个 helper 后，面板按钮只需触发这条业务动作即可。
 *
 * 输入：
 * @param {void} - 无额外输入，直接从剪贴板读取文本。
 *
 * 输出：
 * @returns {Promise<{ok: boolean, replaySeed?: string, openingCode?: string, message: string, reason?: string}>} 粘贴结果摘要。
 *
 * 注意：
 * - 成功时只回填草稿，不自动开局，避免误把当前对局直接覆盖掉。
 * - 失败时会把复盘面板保持打开并写入错误提示，方便用户继续手动处理。
 */
async function pasteReplayBundleFromClipboardToReplayDrafts() {
  state.showReplayPanel = true;
  try {
    const clipboardText = await readTextFromClipboard();
    const parsedBundle = parseReplayClipboardBundle(clipboardText);
    if (!parsedBundle) {
      state.debugReplayStatusTone = "error";
      state.debugReplayStatusText = TEXT.debug.replayBundleInvalid;
      renderReplayPanel?.();
      return {
        ok: false,
        reason: "invalid",
        message: TEXT.debug.replayBundleInvalid,
      };
    }

    state.debugReplaySeedDraft = parsedBundle.replaySeed;
    state.debugOpeningCodeDraft = parsedBundle.openingCode;
    state.debugReplayStatusTone = "success";
    state.debugReplayStatusText = TEXT.debug.replayBundlePasted(parsedBundle.replaySeed);
    renderReplayPanel?.();
    return {
      ok: true,
      replaySeed: parsedBundle.replaySeed,
      openingCode: parsedBundle.openingCode,
      message: TEXT.debug.replayBundlePasted(parsedBundle.replaySeed),
    };
  } catch (error) {
    state.debugReplayStatusTone = "error";
    state.debugReplayStatusText = TEXT.debug.replayClipboardReadFailed;
    renderReplayPanel?.();
    return {
      ok: false,
      reason: "read_failed",
      message: TEXT.debug.replayClipboardReadFailed,
    };
  }
}

/**
 * 作用：
 * 在设置菜单的复盘面板里按回放种子重建当前局的初始状态。
 *
 * 为什么这样写：
 * 复盘 UI 需要一个不会直接暴露底层初始化细节的业务入口；
 * 收口成 helper 后，按钮点击、未来快捷键和测试都能复用同一套“按 seed 重开”逻辑。
 *
 * 输入：
 * @param {string} replaySeedInput - 用户在复盘面板输入的回放种子。
 *
 * 输出：
 * @returns {boolean} `true` 表示已经成功重建并开始发牌；`false` 表示输入无效。
 *
 * 注意：
 * - 成功后会直接开始发牌，避免 PC 重新落回开始页。
 * - 成功后会重新打开 debug 面板，方便继续观察恢复结果。
 */
function applyDebugReplaySeedReplay(replaySeedInput) {
  const normalizedSeed = normalizeReplaySeedInput(replaySeedInput);
  if (!normalizedSeed) {
    state.debugReplayStatusTone = "error";
    state.debugReplayStatusText = TEXT.debug.replaySeedRequired;
    state.showReplayPanel = true;
    renderReplayPanel?.();
    return false;
  }
  state.debugReplaySeedDraft = normalizedSeed;
  setupGame(normalizedSeed);
  startDealing();
  state.showReplayPanel = true;
  state.debugReplayStatusTone = "success";
  state.debugReplayStatusText = TEXT.debug.replaySeedApplied(normalizedSeed);
  render();
  return true;
}

/**
 * 作用：
 * 在设置菜单的复盘面板里按开局码重建当前局的初始状态，并可选带入回放种子。
 *
 * 为什么这样写：
 * 开局码负责精确复原完整牌序，回放种子负责继续约束后续随机链路；
 * 把两者组合收成一个 helper 后，复盘面板可以一次性完成“贴码 -> 重建并开始发牌”的整条调试动作。
 *
 * 输入：
 * @param {string} openingCodeInput - 用户输入的开局码。
 * @param {string} [replaySeedInput=""] - 可选的回放种子；不传时沿用自动分配。
 *
 * 输出：
 * @returns {boolean} `true` 表示恢复成功并开始发牌；`false` 表示开局码无效或为空。
 *
 * 注意：
 * - 成功后会直接开始发牌，避免 PC 重新落回开始页。
 * - 若只提供开局码，不保证后续 AI 随机路径与原局完全一致；要尽量靠近原局，需要同时填回放种子。
 */
function applyDebugOpeningCodeReplay(openingCodeInput, replaySeedInput = "") {
  const normalizedOpeningCode = normalizeOpeningCodeInput(openingCodeInput);
  if (!normalizedOpeningCode) {
    state.debugReplayStatusTone = "error";
    state.debugReplayStatusText = TEXT.debug.openingCodeRequired;
    state.showReplayPanel = true;
    renderReplayPanel?.();
    return false;
  }
  if (!decodeOpeningCode(normalizedOpeningCode)) {
    state.debugReplayStatusTone = "error";
    state.debugReplayStatusText = TEXT.debug.replayInvalidOpeningCode;
    state.showReplayPanel = true;
    renderReplayPanel?.();
    return false;
  }

  const normalizedSeed = normalizeReplaySeedInput(replaySeedInput);
  state.debugOpeningCodeDraft = normalizedOpeningCode;
  if (normalizedSeed) {
    state.debugReplaySeedDraft = normalizedSeed;
  }
  setupGame({
    replaySeedInput: normalizedSeed || undefined,
    openingCode: normalizedOpeningCode,
  });
  startDealing();
  state.showReplayPanel = true;
  state.debugReplayStatusTone = "success";
  state.debugReplayStatusText = TEXT.debug.openingCodeApplied(normalizedOpeningCode, normalizedSeed);
  render();
  return true;
}

// 返回自动叫朋友时优先考虑的点数顺序。
function getFriendAutoRankPriority() {
  return getPlayerLevelRank(state.bankerId) === "A" ? ["K"] : ["A", "K"];
}

// 返回自动叫朋友使用的点数组合。
function getFriendAutoRankGroups() {
  return [getFriendAutoRankPriority(), ["RJ", "BJ"]];
}

// 返回叫朋友目标牌的兜底方案。
function getFriendTargetFallback() {
  const defaultRank = getPlayerLevelRank(state.bankerId) === "A" ? "K" : "A";
  return {
    target: buildFriendTarget({
      suit: "hearts",
      rank: defaultRank,
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

/**
 * 作用：
 * 返回当前朋友牌在同门里可用的“过桥高张”点数。
 *
 * 为什么这样写：
 * 用户补充的找朋友路线本质上是：
 * 普通级优先围绕 `A -> K -> 找朋友牌`，
 * `A` 级时则改成 `K -> Q -> 找朋友牌`。
 * 这里把“目标牌下方一档、但朋友通常不该立刻压住的过桥牌”单独抽成 helper，
 * 让叫朋友评分和打家首发都能共享同一口径。
 *
 * 输入：
 * @param {string} rank - 当前待寻找的朋友牌点数。
 *
 * 输出：
 * @returns {string|null} 返回可作为过桥高张的点数；没有对应点数时返回 `null`。
 *
 * 注意：
 * - 当前只覆盖用户明确要求的 `A -> K` 与 `K -> Q` 两档。
 * - 这里只是找朋友 heuristic，不影响规则合法性。
 */
function getFriendSearchBridgeRank(rank) {
  if (rank === "A") return "K";
  if (rank === "K") return "Q";
  return null;
}

/**
 * 作用：
 * 为指定朋友牌候选构造一份“短门 + 过桥高张 + 找朋友小牌”的画像。
 *
 * 为什么这样写：
 * 这轮新增 heuristic 不只是看“是否有目标大牌”，
 * 还要看这一门能不能被整理成：
 * `目标高张 / 过桥高张 / 找朋友小牌`
 * 这样的可执行节奏。
 * 把这些信息统一收口后，初级和中级的叫朋友评分、以及打家后续首发节奏都可以直接复用。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 * @param {object|null} target - 当前待评估的朋友牌定义。
 *
 * 输出：
 * @returns {object|null} 返回同门画像；无效输入时返回 `null`。
 *
 * 注意：
 * - 同门牌一律按 `effectiveSuit(card) === target.suit` 统计，避免把 `A` 级时已转主的 `A` 误算进副牌 `K` 路线。
 * - `searchCard` 会优先挑小零分牌；若没有，再回退到最低成本的分牌或普通牌。
 */
function buildFriendSearchRouteProfile(banker, target) {
  if (!banker || !target || target.suit === "joker") return null;

  const suitCards = banker.hand
    .filter((card) => target.suit === state.trumpSuit ? card.suit === target.suit : effectiveSuit(card) === target.suit)
    .sort((left, right) => cardStrength(left) - cardStrength(right));
  const bridgeRank = getFriendSearchBridgeRank(target.rank);
  const targetCards = suitCards.filter((card) => card.rank === target.rank);
  const bridgeCards = bridgeRank
    ? suitCards.filter((card) => card.rank === bridgeRank)
    : [];
  const searchCards = suitCards.filter((card) =>
    card.rank !== target.rank && (!bridgeRank || card.rank !== bridgeRank)
  );
  const searchCard = searchCards.find((card) => ["2", "3", "4", "5"].includes(card.rank))
    || searchCards.find((card) => scoreValue(card) === 0)
    || searchCards[0]
    || null;
  const pairCount = findPairs(suitCards).length;
  const tripleCount = findTriples(suitCards).length;
  const serialPairStructureCount = findSerialTuples(suitCards, 2)
    .filter((combo) => {
      const pattern = classifyPlay(combo);
      return pattern.type === "tractor" || pattern.type === "train";
    })
    .length;
  const pointCount = suitCards.reduce((sum, card) => sum + scoreValue(card), 0);
  const searchPointCount = searchCards.reduce((sum, card) => sum + scoreValue(card), 0);
  return {
    suitCards,
    suitCount: suitCards.length,
    targetCards,
    targetCopies: targetCards.length,
    bridgeRank,
    bridgeCards,
    bridgeCount: bridgeCards.length,
    searchCards,
    searchCount: searchCards.length,
    searchCard,
    zeroSearchCount: searchCards.filter((card) => scoreValue(card) === 0).length,
    smallSearchCount: searchCards.filter((card) => ["2", "3", "4", "5", "6", "7", "8", "9"].includes(card.rank)).length,
    pointCount,
    searchPointCount,
    pairCount,
    tripleCount,
    serialPairStructureCount,
    heavyStructureCount: tripleCount + serialPairStructureCount,
  };
}

/**
 * 作用：
 * 判断当前打家是否已经没有干净的副牌找朋友路线，应改看王张 fallback。
 *
 * 为什么这样写：
 * 用户特别指出：
 * 如果每一门副牌都带着拖拉机、刻子或太多分，继续硬在副牌里找朋友往往会把好牌型拆烂；
 * 这时更像人类的默认打法，是改叫第一张大王，再通过吊主让朋友上手。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前更适合走王找朋友 fallback。
 *
 * 注意：
 * - 这里只判断“副牌路线是否普遍过脏”，不保证王找朋友一定最优。
 * - 空门不算干净路线，必须真的有一门可执行的副牌节奏，才会压住 joker fallback。
 */
function shouldPreferJokerFriendFallback(banker) {
  if (!banker) return false;
  const primaryRank = getFriendAutoRankPriority()[0] || "A";
  const cleanSideSuitCount = SUITS
    .filter((suit) => suit !== state.trumpSuit)
    .map((suit) => buildFriendSearchRouteProfile(banker, { suit, rank: primaryRank, occurrence: 1 }))
    .filter((profile) => !!profile && profile.suitCount > 0)
    .filter((profile) => {
      const hasRoute = profile.searchCount > 0 || profile.targetCopies > 0 || profile.bridgeCount > 0;
      const overloaded = profile.heavyStructureCount > 0
        || profile.pairCount >= 2
        || (profile.pairCount >= 1 && profile.pointCount >= 10)
        || profile.pointCount >= 20;
      return hasRoute && !overloaded;
    })
    .length;
  return cleanSideSuitCount === 0;
}

// 统计按当前可见信息，目标牌更大一级的同花色牌还可能剩在外面的张数。
function getVisiblePossibleHigherRankCopiesOutsideBanker(target, banker = getPlayer(state.bankerId)) {
  if (!target || target.suit === "joker" || !banker) return 0;
  const rankIndex = RANKS.indexOf(target.rank);
  if (rankIndex < 0 || rankIndex >= RANKS.length - 1) return 0;
  const higherRanks = RANKS.slice(rankIndex + 1).filter((rank) => {
    const virtualCard = {
      suit: target.suit,
      rank,
      deckIndex: 0,
      id: `friend-higher-${target.suit}-${rank}`,
    };
    return effectiveSuit(virtualCard) === target.suit;
  });
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
      if (rank === getPlayerLevelRank(state.bankerId)) continue;
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
  const bankerSuitCards = banker.hand.filter((card) =>
    target.suit === "joker"
      ? card.suit === "joker"
      : target.suit === state.trumpSuit
        ? card.suit === target.suit
        : effectiveSuit(card) === target.suit
  );
  const bankerTargetCopies = bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = bankerSuitCards.filter((card) => card.rank !== target.rank);
  const buriedCopies = meta.buriedCopies || 0;
  const routeProfile = target.suit !== "joker" ? buildFriendSearchRouteProfile(banker, target) : null;
  const preferJokerFallback = shouldPreferJokerFriendFallback(banker);
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
  const jokerPenalty = target.suit === "joker" && !preferJokerFallback ? 8 : 0;
  const buriedPenalty = buriedCopies * 18;
  const higherRankRiskPenalty = getVisiblePossibleHigherRankCopiesOutsideBanker(target, banker) > 0 ? 24 : 0;
  const supportPenalty = bankerSupportCards.length === 0 ? 12 : bankerSupportCards.length >= 4 ? 8 : 0;
  let routeBonus = 0;
  let structurePenalty = 0;
  let pointPenalty = 0;
  if (routeProfile) {
    if (routeProfile.targetCopies >= 2 && routeProfile.searchCard) {
      routeBonus += 42;
    } else if (routeProfile.targetCopies >= 1 && routeProfile.bridgeCount > 0 && routeProfile.searchCard) {
      routeBonus += 36;
    } else if (routeProfile.targetCopies >= 1 && routeProfile.searchCard) {
      routeBonus += 24;
    } else if (routeProfile.targetCopies === 0 && routeProfile.bridgeCount > 0 && routeProfile.searchCard) {
      routeBonus += 18;
    }
    if (routeProfile.searchCard && scoreValue(routeProfile.searchCard) === 0) routeBonus += 10;
    structurePenalty += routeProfile.heavyStructureCount * 22 + Math.max(0, routeProfile.pairCount - 1) * 8;
    pointPenalty += routeProfile.searchPointCount * 3;
  }
  const jokerFallbackBonus = target.suit === "joker" && preferJokerFallback
    ? (target.rank === "RJ" ? 88 : 56)
    : 0;
  return rankBonus
    + occurrenceBonus
    + suitBonus
    + routeBonus
    + jokerFallbackBonus
    - trumpPenalty
    - jokerPenalty
    - buriedPenalty
    - higherRankRiskPenalty
    - supportPenalty
    - structurePenalty
    - pointPenalty;
}

/**
 * 作用：
 * 判断一门 `A` 在当前局面下是否仍属于副牌 `A` 候选。
 *
 * 为什么这样写：
 * 初级 AI 的新规则明确要求优先找“副牌 A”做朋友牌。
 * 这里单独把判定收口，避免在选朋友和埋底两条链路里重复散写“这张 A 现在算不算主”的条件。
 *
 * 输入：
 * @param {string} suit - 候选花色。
 *
 * 输出：
 * @returns {boolean} `true` 表示这门 `A` 当前仍可按副牌 `A` 处理。
 *
 * 注意：
 * - 级别为 `A` 时，所有 `A` 都会转成常主；这时这里应返回 `false`。
 * - 这里只服务初级 AI 的短门找朋友 heuristic，不影响人类可选项。
 */
function isBeginnerSideAceSuit(suit) {
  if (!suit) return false;
  if (suit === state.trumpSuit) return false;
  return getPlayerLevelRank(state.bankerId) !== "A";
}

/**
 * 作用：
 * 按“副牌 A + 单张回手”规则，为初级 AI 收集短门找朋友候选。
 *
 * 为什么这样写：
 * 这轮把初级 AI 的短门思路进一步收紧成“尽量把找朋友这门做成单张回手口”：
 * 1. 优先找最短的副牌 `A`。
 * 2. 埋底时默认只保留 `A + 1 张同门单牌回手`，不再默认额外保 `K`。
 * 这样打家更容易先把这门走空，后续通过毙牌重新拿回控制权，而不是把同门高张都攥在手里。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 * @param {{countKnownBuriedCopies?: boolean}} options - 是否把已知底牌里的同门 `A` 计入外部剩余张数。
 *
 * 输出：
 * @returns {Array<object>} 短门候选列表，按“门信息 + 建议保留牌”组织。
 *
 * 注意：
 * - 埋底阶段会临时把原始底牌并回手里，因此那一刻不能把 `state.bottomCards` 当成“已经埋下”的信息。
 * - 这里只收集“副牌 A”候选；若完全没有可用副牌 `A`，调用方再回落到旧 heuristic。
 */
function collectBeginnerShortSuitFriendCandidates(banker, options = {}) {
  if (!banker) return [];
  const countKnownBuriedCopies = options.countKnownBuriedCopies === true;
  return SUITS
    .filter((suit) => isBeginnerSideAceSuit(suit))
    .map((suit) => {
      const suitCards = banker.hand
        .filter((card) => !isTrump(card) && card.suit === suit)
        .sort((a, b) => cardStrength(a) - cardStrength(b));
      if (suitCards.length === 0) return null;

      const aceCards = suitCards.filter((card) => card.rank === "A");
      if (aceCards.length === 0 || aceCards.length >= 3) return null;

      const buriedCopies = countKnownBuriedCopies
        ? getKnownBuriedTargetCopies({ suit, rank: "A" })
        : 0;
      const outsideCopies = Math.max(0, 3 - buriedCopies - aceCards.length);
      if (outsideCopies <= 0) return null;

      const nonTargetCards = suitCards.filter((card) => card.rank !== "A");
      const returnCard = suitCards.find((card) => card.rank !== "A" && card.rank !== "K")
        || nonTargetCards[0]
        || null;
      const reservedCards = [...aceCards];
      if (returnCard) reservedCards.push(returnCard);
      const reservedCardIds = new Set(reservedCards.map((card) => card.id));
      const extraCards = suitCards.filter((card) => !reservedCardIds.has(card.id));
      const singleReturnReady = nonTargetCards.length === 1 && !!returnCard;
      const returnCardStrength = returnCard ? cardStrength(returnCard) : Number.POSITIVE_INFINITY;

      return {
        suit,
        suitCards,
        aceCards,
        nonTargetCards,
        returnCard,
        reservedCards,
        reservedCardIds,
        totalCount: suitCards.length,
        extraCount: extraCards.length,
        singleReturnReady,
        returnCardStrength,
        occurrence: aceCards.length + 1,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.singleReturnReady !== right.singleReturnReady) return left.singleReturnReady ? -1 : 1;
      if (left.totalCount !== right.totalCount) return left.totalCount - right.totalCount;
      if (left.nonTargetCards.length !== right.nonTargetCards.length) return left.nonTargetCards.length - right.nonTargetCards.length;
      if (!!left.returnCard !== !!right.returnCard) return left.returnCard ? -1 : 1;
      if (left.returnCardStrength !== right.returnCardStrength) return left.returnCardStrength - right.returnCardStrength;
      if (left.extraCount !== right.extraCount) return left.extraCount - right.extraCount;
      return SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit);
    });
}

/**
 * 作用：
 * 为初级 AI 选出“副牌 A 短门找朋友”的主计划。
 *
 * 为什么这样写：
 * 叫朋友和埋底都需要知道“哪一门是初级这局打算公开传递的短门”。
 * 用统一 helper 选出主计划后，两个入口才能稳定保持同一方向。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 * @param {{countKnownBuriedCopies?: boolean}} options - 是否把已知底牌中的同门 `A` 计入外部剩余张数。
 *
 * 输出：
 * @returns {object|null} 最优的短门找朋友计划；没有可用副牌 `A` 时返回 `null`。
 *
 * 注意：
 * - 这是初级专用 heuristic；中高级仍走各自原有链路。
 * - 返回值里的 `reservedCardIds` 会被埋底策略直接复用。
 */
function getBeginnerShortSuitFriendPlan(banker, options = {}) {
  return collectBeginnerShortSuitFriendCandidates(banker, options)[0] || null;
}

/**
 * 作用：
 * 为初级 AI 的“短门目标高张”候选计算一份纯 heuristic 评分拆解。
 *
 * 为什么这样写：
 * 用户明确要求初级 AI 不做开局模拟，因此这里继续坚持“短门高张”主思路，
 * 只把旧规则补成可比较的多候选：
 * 1. 普通级默认比较 `A` 路线，`A` 级则改比较 `K` 路线；
 * 2. 同一短门允许比较第二张 / 第三张目标高张；
 * 3. 没有自持目标高张的短门，也允许作为“首张”候选进入比较；
 * 3. 分值只看当前明手与底牌已知信息，不窥视未来出牌。
 *
 * 输入：
 * @param {object} target - 当前待评估的朋友牌定义。
 * @param {object|null} banker - 当前打家对象。
 * @param {{buriedCopies?: number}} [meta={}] - 已预先统计好的底牌同牌张数。
 *
 * 输出：
 * @returns {{
 *   total: number,
 *   ownCopies: number,
 *   suitCount: number,
 *   supportCount: number,
 *   zeroPointSupportCount: number,
 *   smallSupportCount: number,
 *   highHonorSupportCount: number,
 *   buriedCopies: number,
 *   minSuitCount: number,
 *   shortSuitBonus: number,
 *   supportRouteBonus: number,
 *   occurrenceShapeBonus: number,
 *   ownCopyAdjustment: number,
 *   longSuitPenalty: number,
 *   returnCard: (string|null)
 * }} 返回总分与关键启发式拆解。
 *
 * 注意：
 * - 这里只服务初级副牌目标高张候选，不负责主牌 / 王张找友。
 * - 若完全没有同门手牌，这里会返回极低分，交给上层自然淘汰。
 */
function buildBeginnerExpandedShortSuitFriendScoreBreakdown(target, banker, meta = {}) {
  if (!target || !banker) {
    return {
      total: Number.NEGATIVE_INFINITY,
      ownCopies: 0,
      suitCount: 0,
      supportCount: 0,
      zeroPointSupportCount: 0,
      smallSupportCount: 0,
      highHonorSupportCount: 0,
      buriedCopies: 0,
      minSuitCount: 0,
      shortSuitBonus: 0,
      supportRouteBonus: 0,
      routePlanBonus: 0,
      occurrenceShapeBonus: 0,
      ownCopyAdjustment: 0,
      longSuitPenalty: 0,
      shortSuitPriorityPenalty: 0,
      clutterPenalty: 0,
      dirtySuitPenalty: 0,
      structurePenalty: 0,
      pointPenalty: 0,
      bridgeCount: 0,
      returnCard: null,
    };
  }

  const routeProfile = buildFriendSearchRouteProfile(banker, target);
  const suitCards = routeProfile?.suitCards || banker.hand
    .filter((card) => effectiveSuit(card) === target.suit)
    .sort((left, right) => cardStrength(left) - cardStrength(right));
  const supportCards = routeProfile?.searchCards || suitCards.filter((card) => {
    if (card.rank === target.rank) return false;
    return card.rank !== getFriendSearchBridgeRank(target.rank);
  });
  const ownCopies = routeProfile?.targetCopies || suitCards.filter((card) => card.rank === target.rank).length;
  const buriedCopies = typeof meta.buriedCopies === "number" ? meta.buriedCopies : getKnownBuriedTargetCopies(target);
  const zeroPointSupportCount = supportCards.filter((card) => scoreValue(card) === 0).length;
  const smallSupportCount = supportCards.filter((card) => ["2", "3", "4", "5", "6", "7", "8", "9"].includes(card.rank)).length;
  const highHonorSupportCount = supportCards.filter((card) => ["K", "Q", "J"].includes(card.rank)).length;
  const returnCard = routeProfile?.searchCard
    || supportCards.find((card) => ["2", "3", "4", "5"].includes(card.rank))
    || supportCards.find((card) => scoreValue(card) === 0)
    || supportCards[0]
    || null;
  const candidateSideSuits = SUITS
    .filter((suit) => suit !== state.trumpSuit)
    .map((suit) => buildFriendSearchRouteProfile(banker, { suit, rank: target.rank, occurrence: 1 }))
    .filter((profile) => !!profile && profile.suitCount > 0)
    .filter((profile) => profile.targetCopies > 0 || profile.bridgeCount > 0 || profile.smallSearchCount > 0)
    .map((profile) => profile.suitCount)
    .filter((count) => count > 0)
    .sort((left, right) => left - right);
  const minSuitCount = SUITS
    .filter((suit) => suit !== state.trumpSuit)
    .length > 0
    ? (candidateSideSuits[0] || suitCards.length)
    : suitCards.length;
  const suitCount = suitCards.length;
  const bridgeCount = routeProfile?.bridgeCount || 0;
  const supportCount = supportCards.length;
  const plannedRouteCount = ownCopies + Math.min(bridgeCount, 1) + (returnCard ? 1 : 0);
  const clutterCount = Math.max(0, suitCount - plannedRouteCount);
  const shortSuitPriorityPenalty = Math.max(0, suitCount - minSuitCount) * 18;

  let shortSuitBonus = 0;
  if (suitCount <= minSuitCount) shortSuitBonus += 34;
  else if (suitCount === minSuitCount + 1) shortSuitBonus += 14;
  else if (suitCount === minSuitCount + 2) shortSuitBonus += 2;
  shortSuitBonus -= Math.max(0, suitCount - minSuitCount) * 12;
  shortSuitBonus -= clutterCount * 18;

  let supportRouteBonus = smallSupportCount * 14 + zeroPointSupportCount * 4 - highHonorSupportCount * 6;
  supportRouteBonus += bridgeCount > 0 ? 10 + Math.min(bridgeCount - 1, 1) * 4 : 0;
  if (returnCard) {
    supportRouteBonus += ["2", "3", "4", "5"].includes(returnCard.rank)
      ? 14
      : scoreValue(returnCard) === 0
        ? 8
        : 2;
  }
  if (supportCount === 1 && returnCard) {
    supportRouteBonus += 12;
  }
  supportRouteBonus -= Math.max(0, clutterCount - 1) * 8;

  let routePlanBonus = 0;
  if (ownCopies >= 2 && returnCard) {
    routePlanBonus += supportCount <= 1 ? 72 : 56;
  } else if (ownCopies >= 1 && bridgeCount > 0 && returnCard) {
    routePlanBonus += supportCount <= 1 ? 48 : 40;
  } else if (ownCopies >= 1 && returnCard) {
    routePlanBonus += supportCount <= 1 ? 40 : 30;
  } else if (ownCopies === 0 && bridgeCount > 0 && returnCard) {
    routePlanBonus += supportCount <= 1 ? 48 : 38;
  } else if (ownCopies === 0 && returnCard) {
    routePlanBonus += supportCount <= 1 ? 18 : 8;
  }
  if (target.rank === "K" && getPlayerLevelRank(state.bankerId) === "A" && bridgeCount > 0) {
    routePlanBonus += 24;
  }
  if (bridgeCount > 0 && target.occurrence === 1) {
    routePlanBonus += 8;
  }

  let occurrenceShapeBonus = 0;
  if (ownCopies === 1 && target.occurrence === 3) {
    occurrenceShapeBonus += supportCount >= 3 && suitCount >= 4 ? 10 : -12;
  } else if (ownCopies === 1 && target.occurrence === 2) {
    occurrenceShapeBonus += bridgeCount > 0 ? 16 : suitCount >= 6 ? 16 : 4;
  }

  let ownCopyAdjustment = 0;
  if (ownCopies === 0) {
    ownCopyAdjustment += returnCard && supportCount <= 1 ? 16 : supportCount >= 2 ? 10 : 0;
    ownCopyAdjustment -= Math.max(0, 2 - smallSupportCount) * 12;
    if (supportCount >= 5 && smallSupportCount <= 1) ownCopyAdjustment -= 28;
    if (smallSupportCount >= 3) {
      ownCopyAdjustment += target.occurrence === 1 ? 20 : target.occurrence === 2 ? 4 : -4;
    }
    if (bridgeCount > 0 && returnCard) {
      ownCopyAdjustment += target.occurrence === 1 ? (suitCount <= 2 ? 28 : 20) : target.occurrence === 2 ? 8 : -4;
    }
    if (bridgeCount === 0 && returnCard && supportCount === 1) {
      ownCopyAdjustment += target.occurrence === 1 ? 8 : 0;
    }
  } else if (ownCopies === 1) {
    ownCopyAdjustment += 12 + (bridgeCount > 0 && supportCount <= 1 ? 10 : 0);
  } else if (ownCopies >= 2) {
    ownCopyAdjustment += supportCount <= 1 ? 12 : 0;
    ownCopyAdjustment -= 18 + Math.max(0, supportCount - 2) * 4;
  }

  let longSuitPenalty = buriedCopies * 12;
  if (ownCopies === 0 && suitCount >= 6) {
    longSuitPenalty += 28 + Math.max(0, suitCount - 6) * 8;
  }
  if (ownCopies >= 2 && suitCount >= 6) {
    longSuitPenalty += 14;
  }
  const clutterPenalty = clutterCount * 10;
  const dirtySuitPenalty = routeProfile && ownCopies === 0
    ? routeProfile.pairCount * 10 + (routeProfile.suitCount >= 3 ? Math.max(0, routeProfile.pointCount - 5) * 3 : 0)
    : 0;
  const structurePenalty = routeProfile
    ? routeProfile.heavyStructureCount * 24 + Math.max(0, routeProfile.pairCount - 1) * 8
    : 0;
  const pointPenalty = routeProfile ? Math.max(0, routeProfile.searchPointCount - 5) * 4 : 0;

  return {
    total: 220
      + shortSuitBonus
      + supportRouteBonus
      + routePlanBonus
      + occurrenceShapeBonus
      + ownCopyAdjustment
      - longSuitPenalty
      - shortSuitPriorityPenalty
      - clutterPenalty
      - dirtySuitPenalty
      - structurePenalty
      - pointPenalty,
    ownCopies,
    suitCount,
    supportCount,
    zeroPointSupportCount,
    smallSupportCount,
    highHonorSupportCount,
    buriedCopies,
    minSuitCount,
    shortSuitBonus,
    supportRouteBonus,
    routePlanBonus,
    occurrenceShapeBonus,
    ownCopyAdjustment,
    longSuitPenalty,
    shortSuitPriorityPenalty,
    clutterPenalty,
    dirtySuitPenalty,
    structurePenalty,
    pointPenalty,
    bridgeCount,
    returnCard: returnCard ? shortCardLabel(returnCard) : null,
  };
}

/**
 * 作用：
 * 判断初级 AI 当前是否应该进入“第一张大王”兜底找朋友。
 *
 * 为什么这样写：
 * 用户这轮明确要求初级常规仍锁在 `副牌 A/K + 找友小牌`，
 * 但同时保留一个极窄兜底：
 * 只有当每一门副牌都已经带着明显结构、分数或拥堵，确实做不出干净短门时，
 * 才允许初级退到“第一张大王”。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应允许初级进入王张兜底。
 *
 * 注意：
 * - 这里只放行“所有副牌都真过脏”的极端场景，避免重新回到宽泛王张找友。
 * - 若打家手里压根没有大王，也应返回 `false`，交回副牌高张链路继续处理。
 */
function shouldBeginnerUseStrictJokerFriendFallback(banker) {
  if (!banker) return false;
  const bankerRedJokerCopies = banker.hand.filter((card) => card.suit === "joker" && card.rank === "RJ").length;
  if (bankerRedJokerCopies > 0) return false;
  if (!shouldPreferJokerFriendFallback(banker)) return false;

  const primaryRank = getFriendAutoRankPriority()[0] || "A";
  const sideSuitProfiles = SUITS
    .filter((suit) => suit !== state.trumpSuit)
    .map((suit) => buildFriendSearchRouteProfile(banker, { suit, rank: primaryRank, occurrence: 1 }))
    .filter((profile) => !!profile && profile.suitCount > 0);
  if (sideSuitProfiles.length === 0) return false;

  const hasCleanShortSuitRoute = sideSuitProfiles.some((profile) => {
    const routeWindowCount = profile.targetCopies + profile.bridgeCount + (profile.searchCard ? 1 : 0);
    return profile.suitCount <= 3
      && routeWindowCount >= 2
      && profile.heavyStructureCount === 0
      && profile.pairCount === 0
      && profile.pointCount <= 5
      && profile.searchPointCount <= 5;
  });
  if (hasCleanShortSuitRoute) return false;

  return sideSuitProfiles.every((profile) => {
    const routeWindowCount = profile.targetCopies + profile.bridgeCount + (profile.searchCard ? 1 : 0);
    const hasHeavyShape = profile.heavyStructureCount > 0
      || profile.pairCount >= 2
      || (profile.pairCount >= 1 && profile.pointCount >= 10);
    const hasPointBurden = profile.pointCount >= 10 || profile.searchPointCount >= 10;
    const hasLongHonorClutter = profile.suitCount >= 4 && routeWindowCount >= 3;
    const lacksCleanSearchCard = !profile.searchCard;
    return hasHeavyShape || hasPointBurden || hasLongHonorClutter || lacksCleanSearchCard;
  });
}

/**
 * 作用：
 * 为初级 AI 构造“所有副牌都真过脏时”的大王兜底候选。
 *
 * 为什么这样写：
 * 当前 beginner 常规应优先坚持副牌高张路线；
 * 只有在严格命中“每一门副牌都不适合整理成短门”时，才允许把第一张大王抬出来，
 * 保持用户要求的“收紧但不彻底删掉极端兜底”。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 *
 * 输出：
 * @returns {Array<object>} 已按启发式得分排序的大王兜底候选。
 *
 * 注意：
 * - 这里只生成王张候选，不覆盖普通副牌 `A/K` 比较。
 * - 预期绝大多数局面都会返回空数组。
 */
function buildBeginnerStrictJokerFriendFallbackEntries(banker) {
  if (!shouldBeginnerUseStrictJokerFriendFallback(banker)) return [];
  if (getKnownBuriedTargetCopies({ suit: "joker", rank: "RJ" }) >= 3) return [];

  const target = { suit: "joker", rank: "RJ", occurrence: 1 };
  const friendTarget = buildFriendTarget(target);
  const score = scoreBeginnerFriendTargetCandidate(target, banker, {
    buriedCopies: getKnownBuriedTargetCopies(target),
  });
  return [{
    target: friendTarget,
    ownerId: null,
    label: friendTarget.label,
    cards: [],
    source: "strict-joker-fallback",
    tags: ["副牌全过脏", "第一张大王", "极窄兜底"],
    score,
    heuristicScore: score,
    rolloutScore: null,
    rolloutFutureDelta: null,
    rolloutDepth: 0,
    rolloutTriggerFlags: ["all_side_suits_overloaded", "red_joker_fallback"],
    breakdown: null,
  }];
}

// 取出指定朋友花色对应的牌。
function getCardsForFriendSuit(cards, suit) {
  return cards.filter((card) => (suit === "joker" ? card.suit === "joker" : card.suit === suit));
}

// 返回手动叫朋友推荐使用的点数顺序。
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
    reasons.push("这张是主牌，叫这张通常更稳，但朋友往往也会来得更慢一些");
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

// 返回玩家手动叫朋友时的推荐方案。
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

/**
 * 作用：
 * 为中级 / 高级 AI 拆解“短门叫朋友、方便回手”的专项评分。
 *
 * 为什么这样写：
 * 旧版中级叫朋友虽然会看“同门还有多少可回手牌”，
 * 但没有把“短门更容易叫到朋友，也更容易在同门里做回手”单独抬权；
 * 用户给出的 `方片 K + 5 叫方片 A` 这类案例说明，
 * 如果不显式区分“短门好回手”和“长门只是同门牌多”，AI 会错误偏向长门第二张 `A`。
 *
 * 输入：
 * @param {object} target - 当前候选的朋友牌定义。
 * @param {object} banker - 当前打家对象。
 * @param {{bankerSuitCards?: Array<object>, bankerTargetCopies?: number, bankerSupportCards?: Array<object>, buriedCopies?: number}} [meta={}] - 已预先统计好的同门信息。
 *
 * 输出：
 * @returns {object} 返回完整评分拆解，供中级 / 高级选朋友与 debug 日志共用。
 *
 * 注意：
 * - 这里只读取打家明手与已知底牌，不依赖任何暗手信息。
 * - 这条拆解只补“短门叫朋友”覆盖，不取代原有 rank / 自持 / 被压风险判断。
 */
function buildIntermediateFriendTargetScoreBreakdown(target, banker, meta = {}) {
  const routeProfile = target.suit !== "joker" ? buildFriendSearchRouteProfile(banker, target) : null;
  const bankerSuitCards = Array.isArray(meta.bankerSuitCards)
    ? meta.bankerSuitCards
    : routeProfile?.suitCards
      || banker.hand.filter((card) => (target.suit === "joker" ? card.suit === "joker" : effectiveSuit(card) === target.suit));
  const bankerTargetCopies = typeof meta.bankerTargetCopies === "number"
    ? meta.bankerTargetCopies
    : bankerSuitCards.filter((card) => card.rank === target.rank).length;
  const bankerSupportCards = Array.isArray(meta.bankerSupportCards)
    ? meta.bankerSupportCards
    : bankerSuitCards.filter((card) => card.rank !== target.rank);
  const buriedCopies = meta.buriedCopies || 0;
  const targetPower = target.suit === "joker"
    ? (target.rank === "RJ" ? 200 : 190)
    : cardStrength({ suit: target.suit, rank: target.rank, deckIndex: 0, id: `friend-target-${target.suit}-${target.rank}` });
  const bankerReturnCards = bankerSupportCards.filter((card) => cardStrength(card) < targetPower).length;
  const zeroPointSupportCount = bankerSupportCards.filter((card) => scoreValue(card) === 0 && cardStrength(card) < targetPower).length;
  const supportCount = bankerSupportCards.length;
  const suitCount = bankerSuitCards.length;
  const isSideSuitTarget = target.suit !== "joker" && target.suit !== state.trumpSuit;
  const hasHonorProbeCard = bankerSupportCards.some((card) => ["10", "J", "Q", "K"].includes(card.rank));
  const hasStructuredReturnRoute = bankerTargetCopies > 0 || supportCount > 1 || hasHonorProbeCard;
  const preferJokerFallback = shouldPreferJokerFriendFallback(banker);
  const rankBonus = {
    A: 60,
    K: 48,
    Q: 40,
    J: 34,
    "10": 24,
    RJ: 52,
    BJ: 44,
  }[target.rank] || 0;
  const occurrenceBonus = bankerTargetCopies > 0
    ? (target.occurrence === bankerTargetCopies + 1 ? 12 : target.occurrence === 3 ? 8 : 0)
    : target.occurrence === 1
      ? 12
      : target.occurrence === 2
        ? 2
        : 0;
  const suitBonus = target.suit !== "joker" && target.suit !== state.trumpSuit ? 18 : 0;
  const trumpPenalty = target.suit === state.trumpSuit ? 10 : 0;
  const jokerPenalty = target.suit === "joker" && !preferJokerFallback ? 14 : 0;
  const bankerOwnCopyBonus = bankerTargetCopies > 0 ? 8 : 0;
  const returnBonus = Math.min(bankerReturnCards, 3) * 7;
  const supportPenalty = supportCount === 0 ? 18 : 0;
  const overtakenPenalty = getVisiblePossibleHigherRankCopiesOutsideBanker(target, banker) > 0 ? 96 : 0;
  const buriedPenalty = buriedCopies * 22;
  const voidSetupBonus = target.suit !== "joker" && bankerTargetCopies > 0 && supportCount <= 1
    ? 24
    : target.suit !== "joker" && supportCount === 0
      ? 14
      : 0;
  const returnRouteBonus = target.suit !== "joker" && supportCount <= 1
    ? Math.min(bankerReturnCards, 3) * 5
    : 0;
  const shortSuitBonus = isSideSuitTarget
    ? (supportCount === 1 ? (hasStructuredReturnRoute ? 22 : 10) : supportCount === 2 ? 14 : 0)
    : 0;
  const lowSupportBonus = isSideSuitTarget
    ? (zeroPointSupportCount === 1
      ? (hasStructuredReturnRoute ? 8 : 0)
      : zeroPointSupportCount >= 2
        ? 4
        : 0)
    : 0;
  const shortProbeSetupBonus = isSideSuitTarget
    && target.rank === "A"
    && bankerTargetCopies === 0
    && supportCount > 0
    && supportCount <= 2
    && zeroPointSupportCount > 0
    && hasHonorProbeCard
    ? 18
    : 0;
  const aLevelSideKingBonus = isSideSuitTarget
    && target.rank === "K"
    && getPlayerLevelRank(state.bankerId) === "A"
    ? 18
    : 0;
  let routePlanBonus = 0;
  if (routeProfile) {
    if (routeProfile.targetCopies >= 2 && routeProfile.searchCard) {
      routePlanBonus += 58;
    } else if (routeProfile.targetCopies >= 1 && routeProfile.bridgeCount > 0 && routeProfile.searchCard) {
      routePlanBonus += 46;
    } else if (routeProfile.targetCopies >= 1 && routeProfile.searchCard) {
      routePlanBonus += 28;
    } else if (routeProfile.targetCopies === 0 && routeProfile.bridgeCount > 0 && routeProfile.searchCard) {
      routePlanBonus += 42;
    }
    if (routeProfile.searchCard && scoreValue(routeProfile.searchCard) === 0) routePlanBonus += 10;
    if (routeProfile.bridgeCount > 0 && target.occurrence === 1) routePlanBonus += 8;
    if (routeProfile.searchCard && ["2", "3", "4", "5"].includes(routeProfile.searchCard.rank)) {
      routePlanBonus += 18;
    } else if (routeProfile.searchCard && ["10", "J", "Q", "K", "A"].includes(routeProfile.searchCard.rank)) {
      routePlanBonus -= 14;
    }
  }
  const jokerFallbackBonus = target.suit === "joker" && preferJokerFallback
    ? (target.rank === "RJ" ? 132 : 92)
    : 0;
  const jokerFallbackPressurePenalty = preferJokerFallback && target.suit !== "joker" ? 28 : 0;
  const clutterPenalty = isSideSuitTarget ? Math.max(0, supportCount - 2) * 16 : 0;
  const ownLongSuitPenalty = isSideSuitTarget && bankerTargetCopies > 0 && supportCount >= 4
    ? 10 + Math.max(0, supportCount - 4) * 6
    : 0;
  const structurePenalty = routeProfile
    ? routeProfile.heavyStructureCount * 26 + Math.max(0, routeProfile.pairCount - 1) * 10
    : 0;
  const pointPenalty = routeProfile ? Math.max(0, routeProfile.searchPointCount - 5) * 4 : 0;
  const total = rankBonus
    + occurrenceBonus
    + suitBonus
    + bankerOwnCopyBonus
    + returnBonus
    + voidSetupBonus
    + returnRouteBonus
    + shortSuitBonus
    + lowSupportBonus
    + shortProbeSetupBonus
    + aLevelSideKingBonus
    + routePlanBonus
    + jokerFallbackBonus
    - trumpPenalty
    - jokerPenalty
    - buriedPenalty
    - supportPenalty
    - overtakenPenalty
    - clutterPenalty
    - ownLongSuitPenalty
    - structurePenalty
    - pointPenalty
    - jokerFallbackPressurePenalty;

  return {
    total,
    targetPower,
    bankerTargetCopies,
    bankerReturnCards,
    zeroPointSupportCount,
    supportCount,
    suitCount,
    rankBonus,
    occurrenceBonus,
    suitBonus,
    trumpPenalty,
    jokerPenalty,
    bankerOwnCopyBonus,
    returnBonus,
    supportPenalty,
    overtakenPenalty,
    buriedPenalty,
    voidSetupBonus,
    returnRouteBonus,
    shortSuitBonus,
    lowSupportBonus,
    shortProbeSetupBonus,
    aLevelSideKingBonus,
    routePlanBonus,
    jokerFallbackBonus,
    jokerFallbackPressurePenalty,
    clutterPenalty,
    ownLongSuitPenalty,
    structurePenalty,
    pointPenalty,
    bridgeCount: routeProfile?.bridgeCount || 0,
  };
}

// 为朋友目标牌候选项计算综合分数。
function scoreFriendTargetCandidate(target, banker, meta = {}) {
  return buildIntermediateFriendTargetScoreBreakdown(target, banker, meta).total;
}

/**
 * 作用：
 * 构造中级 / 高级叫朋友候选列表，供自动选择和日志导出共用。
 *
 * 为什么这样写：
 * 用户希望直接从结果日志里看出“为什么选了这张朋友牌、别的候选差在哪”；
 * 因此这里把叫朋友候选也整理成和出牌 / 亮主相似的可导出结构，
 * 同时让中级 / 高级都复用同一套“短门叫朋友”评分。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 *
 * 输出：
 * @returns {Array<object>} 已按分值排序的叫朋友候选列表。
 *
 * 注意：
 * - 当前高级暂时复用中级叫朋友逻辑。
 * - 每个候选都会带上短门 / 回手 / 长门惩罚等解释字段，方便问题局复盘。
 */
function buildIntermediateFriendTargetCandidateEntries(banker) {
  if (!banker) return [];
  const candidates = getFriendAutoRankGroups()
    .flatMap((ranks) => collectFriendTargetCandidates(banker, ranks, scoreFriendTargetCandidate));
  if (candidates.length === 0) return [];

  return candidates
    .map((candidate) => {
      const breakdown = buildIntermediateFriendTargetScoreBreakdown(candidate.target, banker, {
        buriedCopies: getKnownBuriedTargetCopies(candidate.target),
      });
      const friendTarget = buildFriendTarget(candidate.target);
      const tags = [
        candidate.target.suit === state.trumpSuit ? "主牌" : candidate.target.suit === "joker" ? "王" : "副牌",
        breakdown.supportCount <= 2 && candidate.target.suit !== "joker" ? `短门 ${breakdown.suitCount}` : `同门 ${breakdown.suitCount}`,
        breakdown.bankerTargetCopies > 0 ? `自持 ${breakdown.bankerTargetCopies}` : "首张",
      ];
      if (breakdown.bridgeCount > 0 && candidate.target.suit !== "joker") {
        tags.push(`过桥 ${breakdown.bridgeCount}`);
      }
      if (breakdown.zeroPointSupportCount > 0 && candidate.target.suit !== "joker") {
        tags.push(`零分回手 ${breakdown.zeroPointSupportCount}`);
      }
      if (breakdown.shortProbeSetupBonus > 0 || breakdown.routePlanBonus > 0) {
        tags.push("高张定门 + 找友节奏");
      }
      if (breakdown.jokerFallbackBonus > 0) {
        tags.push("副牌过脏改叫王");
      }
      if (breakdown.clutterPenalty > 0) {
        tags.push(`长门惩罚 ${breakdown.clutterPenalty}`);
      }
      return {
        target: friendTarget,
        ownerId: candidate.ownerId,
        label: friendTarget.label,
        cards: [],
        source: breakdown.shortSuitBonus > 0 || breakdown.shortProbeSetupBonus > 0 || breakdown.routePlanBonus > 0 || breakdown.jokerFallbackBonus > 0
          ? "short-suit-friend"
          : "heuristic",
        tags,
        score: breakdown.total,
        heuristicScore: breakdown.total,
        rolloutScore: null,
        rolloutFutureDelta: null,
        rolloutDepth: 0,
        rolloutTriggerFlags: [
          `同门 ${breakdown.suitCount} 张`,
          `非目标 ${breakdown.supportCount} 张`,
          `回手 ${breakdown.bankerReturnCards} 张`,
          `长门罚 ${breakdown.clutterPenalty}`,
        ],
        breakdown,
      };
    })
    .sort((left, right) => right.score - left.score);
}

/**
 * 作用：
 * 为初级 AI 构造“短门目标高张多候选”叫朋友列表。
 *
 * 为什么这样写：
 * 旧版初级一旦命中“短门 A”规则，就会沿着单条固定计划直接选牌，
 * 因而看不到“同门第二张 / 第三张目标高张”以及“另一门首张目标高张”之间的张次差异。
 * 这里仍坚持“短门高张”主思路，但会把所有可行副牌目标高张列成候选，
 * 再按当前明手结构、回手小牌和张次形状做纯 heuristic 排序。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 *
 * 输出：
 * @returns {Array<object>} 已按纯 heuristic 得分排序的候选列表。
 *
 * 注意：
 * - 普通级覆盖副牌 `A`，`A` 级则自动切到副牌 `K`。
 * - 不做任何模拟或未来搜索，保证初级 AI 只基于当前可见牌型判断。
 */
function buildBeginnerExpandedShortSuitFriendCandidateEntries(banker) {
  if (!banker) return [];
  const primaryRank = getFriendAutoRankPriority()[0] || "A";

  return collectFriendTargetCandidates(
    banker,
    [primaryRank],
    (target, activeBanker, meta) => buildBeginnerExpandedShortSuitFriendScoreBreakdown(target, activeBanker, meta).total,
  )
    .filter((candidate) => candidate.target.suit !== state.trumpSuit && candidate.target.suit !== "joker")
    .map((candidate) => {
      const target = candidate.target;
      const friendTarget = buildFriendTarget(target);
      const breakdown = buildBeginnerExpandedShortSuitFriendScoreBreakdown(target, banker, {
        buriedCopies: getKnownBuriedTargetCopies(target),
      });
      return {
        target: friendTarget,
        ownerId: candidate.ownerId,
        label: friendTarget.label,
        cards: [],
        source: "short-suit-window",
        tags: [
          `短门 ${breakdown.suitCount}`,
          breakdown.ownCopies > 0 ? `自持 ${breakdown.ownCopies}` : "首张",
          `${getOccurrenceLabel(target.occurrence)} ${target.rank}`,
          breakdown.smallSupportCount >= 2 ? `小牌 ${breakdown.smallSupportCount}` : `支撑 ${breakdown.supportCount}`,
          breakdown.bridgeCount > 0 ? `过桥 ${breakdown.bridgeCount}` : "直接找友",
          breakdown.returnCard ? `回手 ${breakdown.returnCard}` : "无回手",
        ],
        score: breakdown.total,
        heuristicScore: breakdown.total,
        rolloutScore: null,
        rolloutFutureDelta: null,
        rolloutDepth: 0,
        rolloutTriggerFlags: [
          `同门 ${breakdown.suitCount} 张`,
          `零分支撑 ${breakdown.zeroPointSupportCount}`,
          `小牌支撑 ${breakdown.smallSupportCount}`,
          `高张支撑 ${breakdown.highHonorSupportCount}`,
        ],
        breakdown,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.label.localeCompare(right.label, "zh-Hans-CN");
    });
}

/**
 * 作用：
 * 构造 beginner “短门找朋友”调试候选列表。
 *
 * 为什么这样写：
 * beginner 已有一条显式的“副牌 A + 单张回手”规则；
 * 这里把该规则对应的短门计划也做成候选列表，方便在日志里直接看到它到底优先了哪门。
 *
 * 输入：
 * @param {object|null} banker - 当前打家对象。
 *
 * 输出：
 * @returns {Array<object>} 已按 beginner 短门规则排序的候选列表。
 *
 * 注意：
 * - 这里只覆盖 beginner 显式短门计划；若没有可用副牌 `A`，调用方需回退到旧 heuristic。
 * - 候选分值只用于本地排序和日志展示，不参与其他难度。
 */
function buildBeginnerShortSuitFriendCandidateEntries(banker) {
  if (!banker) return [];

  return collectBeginnerShortSuitFriendCandidates(banker, { countKnownBuriedCopies: true })
    .map((plan) => {
      const friendTarget = buildFriendTarget({
        suit: plan.suit,
        rank: "A",
        occurrence: plan.occurrence,
      });
      const score = 280
        + (plan.singleReturnReady ? 28 : 0)
        - plan.totalCount * 18
        - plan.extraCount * 10
        - Math.min(plan.returnCardStrength, 220) * 0.02;
      return {
        target: friendTarget,
        ownerId: null,
        label: friendTarget.label,
        cards: [],
        source: "short-suit-plan",
        tags: [
          `短门 ${plan.totalCount}`,
          plan.singleReturnReady ? "单张回手" : "保留回手",
          `${getOccurrenceLabel(plan.occurrence)} A`,
        ],
        score,
        heuristicScore: score,
        rolloutScore: null,
        rolloutFutureDelta: null,
        rolloutDepth: 0,
        rolloutTriggerFlags: [
          `同门 ${plan.totalCount} 张`,
          `非 A ${plan.nonTargetCards.length} 张`,
          `回手 ${plan.returnCard ? shortCardLabel(plan.returnCard) : "无"}`,
        ],
        breakdown: {
          suit: plan.suit,
          totalCount: plan.totalCount,
          nonTargetCount: plan.nonTargetCards.length,
          singleReturnReady: plan.singleReturnReady,
          returnCard: plan.returnCard ? shortCardLabel(plan.returnCard) : null,
        },
      };
    })
    .sort((left, right) => right.score - left.score);
}

/**
 * 作用：
 * 为当前打家生成“叫朋友”自动决策与调试候选。
 *
 * 为什么这样写：
 * 叫朋友阶段现在既要真正给 AI 自动选朋友牌，
 * 也要把同一批候选完整写入结果日志；统一通过一条决策构造链，
 * 才能保证“自动选择”和“日志解释”完全对应。
 *
 * 输入：
 * @param {number} [playerId=state.bankerId] - 需要自动叫朋友的打家玩家 ID。
 * @param {"beginner"|"intermediate"|"advanced"} [difficulty=state.aiDifficulty] - 需要使用的 AI 难度。
 *
 * 输出：
 * @returns {{target: object, ownerId: (number|null), candidateEntries: Array<object>, selectedEntry: object}} 返回最终选择和候选列表。
 *
 * 注意：
 * - 当前高级暂时复用中级候选构造逻辑。
 * - 没有合法候选时会回退到统一兜底方案，并生成一条可导出的 fallback 记录。
 */
function buildAiFriendTargetDecision(playerId = state.bankerId, difficulty = state.aiDifficulty) {
  const banker = getPlayer(playerId);
  if (!banker) {
    const fallback = getFriendTargetFallback();
    const fallbackEntry = {
      target: fallback.target,
      ownerId: fallback.ownerId,
      label: fallback.target.label,
      cards: [],
      source: "fallback",
      tags: ["默认兜底"],
      score: 0,
      heuristicScore: 0,
      rolloutScore: null,
      rolloutFutureDelta: null,
      rolloutDepth: 0,
      rolloutTriggerFlags: ["无可用候选，使用固定兜底"],
      breakdown: null,
    };
    return {
      target: fallback.target,
      ownerId: fallback.ownerId,
      candidateEntries: [fallbackEntry],
      selectedEntry: fallbackEntry,
    };
  }

  if (difficulty === "beginner") {
    const strictJokerFallbackEntries = buildBeginnerStrictJokerFriendFallbackEntries(banker);
    if (strictJokerFallbackEntries.length > 0) {
      return {
        target: strictJokerFallbackEntries[0].target,
        ownerId: strictJokerFallbackEntries[0].ownerId,
        candidateEntries: strictJokerFallbackEntries,
        selectedEntry: strictJokerFallbackEntries[0],
      };
    }
    const expandedShortSuitEntries = buildBeginnerExpandedShortSuitFriendCandidateEntries(banker);
    if (expandedShortSuitEntries.length > 0) {
      return {
        target: expandedShortSuitEntries[0].target,
        ownerId: expandedShortSuitEntries[0].ownerId,
        candidateEntries: expandedShortSuitEntries,
        selectedEntry: expandedShortSuitEntries[0],
      };
    }
    const shortSuitEntries = buildBeginnerShortSuitFriendCandidateEntries(banker);
    if (shortSuitEntries.length > 0) {
      return {
        target: shortSuitEntries[0].target,
        ownerId: shortSuitEntries[0].ownerId,
        candidateEntries: shortSuitEntries,
        selectedEntry: shortSuitEntries[0],
      };
    }
    const beginnerRankGroups = [getFriendAutoRankPriority()];
    const candidates = beginnerRankGroups
      .flatMap((ranks) => collectFriendTargetCandidates(banker, ranks, scoreBeginnerFriendTargetCandidate))
      .filter((candidate) => candidate.target.suit !== "joker")
      .map((candidate) => {
        const friendTarget = buildFriendTarget(candidate.target);
        return {
          target: friendTarget,
          ownerId: candidate.ownerId,
          label: friendTarget.label,
          cards: [],
          source: "heuristic",
          tags: [
            candidate.target.suit === state.trumpSuit ? "主牌" : "副牌",
            candidate.target.occurrence > 1 ? `${getOccurrenceLabel(candidate.target.occurrence)} ${candidate.target.rank}` : "首张",
            "基础启发式",
          ],
          score: candidate.score,
          heuristicScore: candidate.score,
          rolloutScore: null,
          rolloutFutureDelta: null,
          rolloutDepth: 0,
          rolloutTriggerFlags: [
            `同门 ${banker.hand.filter((card) => card.suit === candidate.target.suit).length} 张`,
            `分值 ${Math.round(candidate.score * 100) / 100}`,
          ],
          breakdown: null,
        };
      })
      .sort((left, right) => right.score - left.score);
    if (candidates.length > 0) {
      return {
        target: candidates[0].target,
        ownerId: candidates[0].ownerId,
        candidateEntries: candidates,
        selectedEntry: candidates[0],
      };
    }
  }

  const candidateEntries = buildIntermediateFriendTargetCandidateEntries(banker);
  if (candidateEntries.length > 0) {
    return {
      target: candidateEntries[0].target,
      ownerId: candidateEntries[0].ownerId,
      candidateEntries,
      selectedEntry: candidateEntries[0],
    };
  }

  const fallback = getFriendTargetFallback();
  const fallbackEntry = {
    target: fallback.target,
    ownerId: fallback.ownerId,
    label: fallback.target.label,
    cards: [],
    source: "fallback",
    tags: ["默认兜底"],
    score: 0,
    heuristicScore: 0,
    rolloutScore: null,
    rolloutFutureDelta: null,
    rolloutDepth: 0,
    rolloutTriggerFlags: ["无可用候选，使用固定兜底"],
    breakdown: null,
  };
  return {
    target: fallback.target,
    ownerId: fallback.ownerId,
    candidateEntries: [fallbackEntry],
    selectedEntry: fallbackEntry,
  };
}

// 选择新手难度下的朋友目标牌。
function chooseBeginnerFriendTarget() {
  const decision = buildAiFriendTargetDecision(state.bankerId, "beginner");
  return {
    target: decision.target,
    ownerId: decision.ownerId,
  };
}

// 选择中级难度下的朋友目标牌。
function chooseIntermediateFriendTarget() {
  const decision = buildAiFriendTargetDecision(state.bankerId, state.aiDifficulty);
  return {
    target: decision.target,
    ownerId: decision.ownerId,
  };
}

// 选择朋友目标牌。
function chooseFriendTarget() {
  return state.aiDifficulty === "beginner"
    ? chooseBeginnerFriendTarget()
    : chooseIntermediateFriendTarget();
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
    revealedTrickNumber: null,
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

/**
 * 作用：
 * 返回当前“叫朋友后可再修改一次”窗口还剩多少秒。
 *
 * 为什么这样写：
 * 这轮 PC 交互要求把 30 秒窗口同时用于：
 * 1. 叫朋友面板里的推荐按钮读秒；
 * 2. 首轮正式出牌前的顶部朋友牌二次编辑入口；
 * 统一通过一个 helper 读秒，UI 和计时逻辑才能保持同一口径。
 *
 * 输入：
 * @param {void} - 直接读取共享状态中的剩余秒数。
 *
 * 输出：
 * @returns {number} 当前窗口剩余秒数；没有窗口时返回 `0`。
 *
 * 注意：
 * - 返回值必须是非负整数，避免 UI 出现 `-1 秒`。
 * - 这里只返回剩余秒数，不负责判断当前是否允许重新编辑。
 */
function getFriendRetargetCountdownSeconds() {
  return Math.max(0, Number(state.friendRetargetCountdown) || 0);
}

/**
 * 作用：
 * 判断当前是否处于“首轮首手前、且还能再改一次朋友牌”的窗口。
 *
 * 为什么这样写：
 * 玩家要求确认叫朋友后，仍可在读秒内点顶部朋友牌再改一次；
 * 这个判断会同时被顶部点击入口、首轮计时和按钮文案复用，需要集中收口。
 *
 * 输入：
 * @param {void} - 直接读取当前对局状态。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前仍在一次性重改窗口内。
 *
 * 注意：
 * - 只允许打家本人使用，因此这里只对 `玩家1` 生效。
 * - 一旦已经出过首轮第一手，或已经使用过一次重改机会，就必须立即失效。
 */
function hasFriendRetargetWindow() {
  return state.bankerId === 1
    && !state.gameOver
    && !!state.friendTarget
    && !state.friendRetargetUsed
    && state.trickNumber === 1
    && state.currentTurnId === state.bankerId
    && state.currentTrick.length === 0
    && getFriendRetargetCountdownSeconds() > 0;
}

/**
 * 作用：
 * 清理“叫朋友后可再修改一次”的独立读秒窗口。
 *
 * 为什么这样写：
 * 这个窗口会跨越 `callingFriend -> playing` 两个阶段；
 * 不能和普通回合倒计时混在一起清理，否则一进入首轮就会把修改机会误删掉。
 *
 * 输入：
 * @param {void} - 直接操作共享状态里的独立计时器和剩余秒数。
 *
 * 输出：
 * @returns {void} 只清理读秒窗口，不返回额外结果。
 *
 * 注意：
 * - 这里不会改 `friendRetargetUsed`，避免把“已经用过一次”的状态误重置。
 * - 调用后剩余秒数必须归零，保证 UI 不再继续显示旧读秒。
 */
function clearFriendRetargetWindow() {
  if (state.friendRetargetTimer) {
    window.clearInterval(state.friendRetargetTimer);
    state.friendRetargetTimer = null;
  }
  state.friendRetargetCountdown = 0;
}

/**
 * 作用：
 * 启动或续接“叫朋友 30 秒确认 / 可改一次”读秒窗口。
 *
 * 为什么这样写：
 * 用户现在既要在叫朋友面板里看到推荐按钮倒计时，
 * 又要在确认后把同一个读秒延续到顶部朋友牌的二次编辑入口；
 * 因此需要一条独立于普通回合计时器的窗口计时链路。
 *
 * 输入：
 * @param {number} seconds - 本次窗口应保留的剩余秒数。
 *
 * 输出：
 * @returns {void} 只更新共享状态和计时器，不返回额外结果。
 *
 * 注意：
 * - 人类打家首次进入 `callingFriend` 时应传入固定的 `30` 秒。
 * - 重新打开编辑面板时必须续接剩余秒数，不能重新涨回 30 秒。
 */
function startFriendRetargetWindow(seconds = FRIEND_RETARGET_WINDOW_SECONDS) {
  clearFriendRetargetWindow();
  state.friendRetargetCountdown = Math.max(0, Math.ceil(Number(seconds) || 0));
  render();
  if (state.friendRetargetCountdown <= 0) return;

  state.friendRetargetTimer = window.setInterval(() => {
    const shouldAutoPlayFromRetargetWindow = state.phase === "playing"
      && state.bankerId === 1
      && !!state.friendTarget
      && !state.friendRetargetUsed
      && state.trickNumber === 1
      && state.currentTurnId === state.bankerId
      && state.currentTrick.length === 0
      && getFriendRetargetCountdownSeconds() > 0;
    state.friendRetargetCountdown = Math.max(0, state.friendRetargetCountdown - 1);
    if (shouldAutoPlayFromRetargetWindow) {
      state.countdown = state.friendRetargetCountdown;
    }
    render();
    if (state.friendRetargetCountdown > 0) return;

    clearFriendRetargetWindow();
    if (state.phase === "callingFriend" && state.bankerId === 1) {
      confirmFriendTargetSelection();
      return;
    }
    if (shouldAutoPlayFromRetargetWindow) {
      clearTimers();
      autoPlayCurrentTurn();
    }
  }, 1000);
}

// 开始叫朋友阶段并初始化默认选择。
function startCallingFriendPhase() {
  clearTimers();
  const banker = getPlayer(state.bankerId);
  const autoFriendDecision = banker && !banker.isHuman
    ? buildAiFriendTargetDecision(banker.id, state.aiDifficulty)
    : null;
  const defaultTarget = autoFriendDecision?.target || getDefaultFriendSelection();
  const defaults = {
    occurrence: defaultTarget.occurrence || 1,
    suit: defaultTarget.suit,
    rank: defaultTarget.rank,
  };
  state.selectedFriendOccurrence = defaults.occurrence;
  state.selectedFriendSuit = defaults.suit;
  state.selectedFriendRank = defaults.rank;
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.phase = "callingFriend";
  appendLog(TEXT.log.startCallingFriend(banker.name));
  render();

  if (banker.isHuman) {
    startFriendRetargetWindow(FRIEND_RETARGET_WINDOW_SECONDS);
    return;
  }

  recordFriendDecisionSnapshot(banker.id, autoFriendDecision);
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
  const shouldKeepRetargetWindow = state.bankerId === 1
    && !state.friendRetargetUsed
    && getFriendRetargetCountdownSeconds() > 0;
  setFriendTarget(selection);
  appendLog(TEXT.log.friendCalled(state.friendTarget.label));
  if (!shouldKeepRetargetWindow) {
    clearFriendRetargetWindow();
  }
  enterPlayingPhase();
}

// 判断当前是否允许重新选择朋友目标牌。
function canRetargetFriendSelection() {
  return state.phase === "playing" && hasFriendRetargetWindow();
}

// 重新打开朋友选牌。
function reopenFriendSelection() {
  if (!canRetargetFriendSelection()) return false;
  const remainingSeconds = getFriendRetargetCountdownSeconds();
  clearTimers({ preserveFriendRetarget: true });
  state.selectedFriendOccurrence = state.friendTarget.occurrence || 1;
  state.selectedFriendSuit = state.friendTarget.suit;
  state.selectedFriendRank = state.friendTarget.rank;
  state.phase = "callingFriend";
  state.currentTurnId = state.bankerId;
  state.leaderId = state.bankerId;
  state.friendRetargetUsed = true;
  appendLog("打家重新选择了朋友牌。");
  if (remainingSeconds > 0) {
    startFriendRetargetWindow(remainingSeconds);
  }
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
  persistNativeRecentReplayFromState();
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
    if (resolveFinalPlayerOneDeclarationWindow()) {
      return;
    }
    if (state.declaration) {
      state.bottomRevealCount = 0;
    } else {
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

/**
 * 作用：
 * 在发牌结束且当前还没人亮主时，统一处理玩家1最后一次补亮机会。
 *
 * 为什么这样写：
 * 正式对局里，玩家1若仍是人类，需要进入 15 秒补亮窗口；
 * 但若玩家1已经切成托管 AI，就不应该再先进入“等待人类补亮”的状态。
 * 把这段收口单独抽出来后，浏览器运行态与 headless 回归都能复用同一条判断，
 * 避免只在某个入口里额外打补丁。
 *
 * 输入：
 * @param {void} - 直接读取当前 `state` 和玩家1信息。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前已经切入“等待人类补亮”窗口，应立即结束本次发牌收口；
 * 否则返回 `false`，由调用方继续走“自动补亮后进反主”或“无人亮主后翻底定主”流程。
 *
 * 注意：
 * - 只负责“发牌刚结束、尚无人亮主”的补亮收口，不处理最后反主阶段。
 * - 当补亮等待已经超时再次回到这里时，必须清掉 `awaitingHumanDeclaration`，让流程继续翻底。
 */
function resolveFinalPlayerOneDeclarationWindow() {
  const playerOne = getPlayer(1);
  const finalDeclaration = getBestDeclarationForPlayer(1);
  if (!finalDeclaration) {
    state.awaitingHumanDeclaration = false;
    return false;
  }

  if (state.awaitingHumanDeclaration) {
    state.awaitingHumanDeclaration = false;
    return false;
  }

  if (playerOne?.isHuman !== false) {
    startAwaitingHumanDeclaration();
    return true;
  }

  if (canOverrideDeclaration(finalDeclaration)) {
    declareTrump(1, finalDeclaration, "auto");
  }
  return false;
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

/**
 * 作用：
 * 处理玩家1在补亮等待窗口里主动选择“不亮”的操作。
 *
 * 为什么这样写：
 * 之前补亮阶段只能等待 15 秒超时或直接亮主，缺少一个明确的“我决定不亮”入口；
 * 把这条跳过动作收成独立 helper 后，PC 和 mobile 都可以复用同一条流程，
 * 并且能在点击后立刻进入翻底定主，而不是继续被迫等倒计时走完。
 *
 * 输入：
 * @param {number} playerId - 当前尝试执行“不亮”的玩家 ID。
 *
 * 输出：
 * @returns {boolean} `true` 表示本次点击已成功结束补亮等待；否则返回 `false`。
 *
 * 注意：
 * - 只允许在 `dealing + awaitingHumanDeclaration` 且玩家1本人操作时生效。
 * - 这里不会生成新的亮主声明，而是直接沿用原有“无人亮主 -> 翻底定主”流程。
 */
function passDeclarationForPlayer(playerId) {
  if (state.gameOver || state.phase !== "dealing" || !state.awaitingHumanDeclaration || playerId !== 1) {
    return false;
  }

  clearTimers();
  appendLog(TEXT.log.passDeclare(getPlayer(playerId).name));
  finishDealingPhase();
  return true;
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
 * 把任意阶段的 AI 调试快照写入共享历史。
 *
 * 为什么这样写：
 * 亮主 / 反主、扣底、叫朋友和正式出牌现在都要复用同一套结果日志导出；
 * 单独收口这层提交逻辑后，各阶段只需要关心“快照长什么样”，不用重复维护历史写入细节。
 *
 * 输入：
 * @param {object|null} snapshot - 当前阶段准备写入的 AI 调试快照。
 *
 * 输出：
 * @returns {void} 只更新共享状态中的最近一条与历史列表，不返回额外结果。
 *
 * 注意：
 * - 只在 debug 面板开启时真正写入，避免普通对局持续堆日志。
 * - 历史长度继续固定裁到最近 120 条，保持结果导出可控。
 */
function commitAiDecisionSnapshot(snapshot) {
  if (!snapshot || !snapshot.playerId || !isAiDecisionDebugEnabled()) return;
  state.aiDecisionHistorySeq = snapshot.historyId || ((state.aiDecisionHistorySeq || 0) + 1);
  state.lastAiDecision = snapshot;
  state.aiDecisionHistory = [...(state.aiDecisionHistory || []), snapshot].slice(-120);
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
      label: entry.label || null,
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
    selectedLabel: selected?.label || null,
    selectedCards: cloneSetupDebugValue(selected?.cards || []),
    selectedBreakdown: cloneSetupDebugValue(selected?.breakdown || null),
    debugStats: {
      candidateCount: candidateEntries.length,
      maxRolloutDepth: 0,
      extendedRolloutCount: 0,
    },
    decisionTimeMs: 0,
  };
  commitAiDecisionSnapshot(snapshot);
}

/**
 * 作用：
 * 把 AI 的叫朋友候选和最终选择记录进 debug 历史。
 *
 * 为什么这样写：
 * 这次问题局最关键的缺口就是结果日志里看不到“叫朋友为什么选了这张”；
 * 因此需要把叫朋友阶段也整理成与亮主 / 出牌同一口径的快照，方便直接导出前 3 个候选对比。
 *
 * 输入：
 * @param {number} playerId - 当前准备叫朋友的打家玩家 ID。
 * @param {{candidateEntries?: Array<object>, selectedEntry?: object}} decision - 叫朋友决策与候选摘要。
 *
 * 输出：
 * @returns {void} 直接把叫朋友快照写入共享调试历史。
 *
 * 注意：
 * - 只记录 AI 自动叫朋友，不覆盖人类手动选择。
 * - `selectedLabel` 直接使用“第一张 / 第二张 ...”文案，避免日志里丢失张次信息。
 */
function recordFriendDecisionSnapshot(playerId, decision) {
  if (!isAiDecisionDebugEnabled() || !playerId || !decision?.selectedEntry) return;
  const candidateEntries = Array.isArray(decision.candidateEntries) ? decision.candidateEntries : [];
  const selected = decision.selectedEntry;
  const objective = {
    primary: "call_friend",
    secondary: selected.source === "short-suit-plan" || selected.source === "short-suit-friend"
      ? "short_suit_return"
      : "rank_priority",
  };
  const snapshot = {
    historyId: (state.aiDecisionHistorySeq || 0) + 1,
    recordedAtTrickNumber: state.trickNumber || null,
    recordedAtTurnId: playerId,
    playerId,
    mode: "call_friend",
    objective,
    evaluation: {
      total: typeof selected.score === "number" ? selected.score : null,
      objective,
      breakdown: cloneSetupDebugValue(selected.breakdown || null),
    },
    candidateEntries: candidateEntries.slice(0, 5).map((entry) => ({
      label: entry.label || null,
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
        objective,
        breakdown: cloneSetupDebugValue(entry.breakdown || null),
      },
      rolloutFutureEvaluation: null,
    })),
    filteredCandidateEntries: [],
    selectedSource: selected.source || null,
    selectedTags: Array.isArray(selected.tags) ? [...selected.tags] : [],
    selectedScore: typeof selected.score === "number" ? selected.score : null,
    selectedLabel: selected.label || null,
    selectedCards: cloneSetupDebugValue(selected.cards || []),
    selectedBreakdown: cloneSetupDebugValue(selected.breakdown || null),
    debugStats: {
      candidateCount: candidateEntries.length,
      maxRolloutDepth: 0,
      extendedRolloutCount: 0,
    },
    decisionTimeMs: 0,
  };
  commitAiDecisionSnapshot(snapshot);
}

/**
 * 作用：
 * 把 AI 自动扣底结果记录进 debug 历史。
 *
 * 为什么这样写：
 * 结果日志过去只看得到亮主和出牌，看不到 AI 到底埋了哪 7 张底；
 * 补上这条快照后，至少能在问题局里把“扣底是否已为找朋友 / 保底路线服务”直接导出来。
 *
 * 输入：
 * @param {number} playerId - 当前自动扣底的打家玩家 ID。
 * @param {Array<object>} cards - 当前准备扣下的 7 张底牌。
 *
 * 输出：
 * @returns {void} 直接把扣底快照写入共享调试历史。
 *
 * 注意：
 * - 当前只导出最终扣底结果，不额外枚举多个备选 7 张组合。
 * - 分值使用“底牌原始分越低越好”的简单口径，主要服务日志可读性。
 */
function recordBuryDecisionSnapshot(playerId, cards) {
  if (!isAiDecisionDebugEnabled() || !playerId || !Array.isArray(cards) || cards.length === 0) return;
  const pointTotal = getCardsPointTotal(cards);
  const objective = {
    primary: "bury_bottom",
    secondary: state.aiDifficulty === "beginner" ? "short_suit_reserve" : "point_limit",
  };
  const score = -pointTotal;
  const snapshot = {
    historyId: (state.aiDecisionHistorySeq || 0) + 1,
    recordedAtTrickNumber: state.trickNumber || null,
    recordedAtTurnId: playerId,
    playerId,
    mode: "bury",
    objective,
    evaluation: {
      total: score,
      objective,
      breakdown: {
        pointTotal,
        cardCount: cards.length,
      },
    },
    candidateEntries: [{
      label: null,
      cards: cloneSetupDebugValue(cards),
      source: "heuristic",
      tags: [`底牌分 ${pointTotal}`],
      score,
      heuristicScore: score,
      rolloutScore: null,
      rolloutFutureDelta: null,
      rolloutDepth: 0,
      rolloutReachedOwnTurn: false,
      rolloutTriggerFlags: [`总分 ${pointTotal}`, `数量 ${cards.length}`],
      rolloutEvaluation: {
        total: score,
        objective,
        breakdown: {
          pointTotal,
          cardCount: cards.length,
        },
      },
      rolloutFutureEvaluation: null,
    }],
    filteredCandidateEntries: [],
    selectedSource: "heuristic",
    selectedTags: [`底牌分 ${pointTotal}`],
    selectedScore: score,
    selectedLabel: null,
    selectedCards: cloneSetupDebugValue(cards),
    selectedBreakdown: {
      pointTotal,
      cardCount: cards.length,
    },
    debugStats: {
      candidateCount: 1,
      maxRolloutDepth: 0,
      extendedRolloutCount: 0,
    },
    decisionTimeMs: 0,
  };
  commitAiDecisionSnapshot(snapshot);
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

  const willing = best.count >= 3 || getSharedRandomNumber() < 0.65;
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
    if (option && (option.suit === "notrump" || option.count >= 3 || getSharedRandomNumber() < 0.72)) {
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
  const beginnerShortSuitPlan = state.aiDifficulty === "beginner"
    ? getBeginnerShortSuitFriendPlan(player, { countKnownBuriedCopies: false })
    : null;
  const beginnerReserveSuit = beginnerShortSuitPlan?.suit || null;
  const beginnerReservedCardIds = beginnerShortSuitPlan?.reservedCardIds || new Set();
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
    if (state.aiDifficulty === "beginner" && !isTrump(card) && beginnerReserveSuit) {
      if (beginnerReservedCardIds.has(card.id)) {
        score += 1800;
      } else if (card.suit === beginnerReserveSuit) {
        score -= 150;
      } else {
        score -= 80;
        score -= Math.min(suitCounts[card.suit] || 0, 5) * 8;
        if (card.rank === "A") score -= 170;
      }
    }
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

  const buryCards = getBuryHintForPlayer(banker.id);
  recordBuryDecisionSnapshot(banker.id, buryCards);
  state.aiTimer = window.setTimeout(() => {
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

/**
 * 作用：
 * 启动当前行动玩家的回合计时与自动出牌流程。
 *
 * 为什么这样写：
 * 正常回合默认是 15 秒，但 PC 的“叫朋友后可改一次”窗口需要把首轮首手临时接管成同一套 30 秒读秒；
 * 因此这里要先判断是否仍在改牌窗口内，再决定走普通回合计时还是沿用朋友重改窗口。
 *
 * 输入：
 * @param {void} - 直接读取当前行动玩家和共享对局状态。
 *
 * 输出：
 * @returns {void} 只启动对应计时流程，不返回额外结果。
 *
 * 注意：
 * - 仍在朋友重改窗口内时，不应再额外启动 15 秒回合倒计时，避免两套读秒打架。
 * - AI 玩家仍继续使用既有的自动出牌延迟，不走朋友重改窗口。
 */
function startTurn() {
  const shouldUseFriendRetargetWindow = hasFriendRetargetWindow();
  clearTimers({ preserveFriendRetarget: shouldUseFriendRetargetWindow });
  if (state.gameOver) return;

  if (shouldUseFriendRetargetWindow) {
    state.countdown = getFriendRetargetCountdownSeconds();
    render();
    return;
  }

  state.countdown = 15;
  render();

  state.countdownTimer = window.setInterval(() => {
    state.countdown -= 1;
    renderScorePanel();
    if (state.countdown <= 0) {
      clearTimers();
      if (typeof autoPlayCurrentTurn === "function") {
        autoPlayCurrentTurn();
      }
    }
  }, 1000);

  const player = getPlayer(state.currentTurnId);
  if (!player.isHuman) {
    state.aiTimer = window.setTimeout(() => {
      if (typeof autoPlayCurrentTurn === "function") {
        autoPlayCurrentTurn();
      }
    }, getAiPaceDelay("turnDelay"));
  }
}

/**
 * 作用：
 * 清理当前牌局里所有共用计时器。
 *
 * 为什么这样写：
 * 发牌、反主、出牌、暂停和结果页都共用这条清理链路；
 * 但“叫朋友后可改一次”的独立窗口需要在个别场景跨阶段保留，
 * 因此这里补上可选参数，让调用方决定是否保留那条窗口计时器。
 *
 * 输入：
 * @param {{preserveFriendRetarget?: boolean}} [options={}] - 是否保留朋友重改窗口计时器。
 *
 * 输出：
 * @returns {void} 只清理计时器状态，不返回额外结果。
 *
 * 注意：
 * - 默认会连朋友重改窗口一起清理，避免旧读秒残留到下一阶段。
 * - 只有从 `callingFriend` 进入首轮首手，或首轮重新打开编辑面板时，才应保留该窗口。
 */
function clearTimers(options = {}) {
  const preserveFriendRetarget = !!options.preserveFriendRetarget;
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
  if (!preserveFriendRetarget) {
    clearFriendRetargetWindow();
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
      state.friendTarget.revealedTrickNumber = state.trickNumber || 1;
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
  return LEVEL_ORDER.indexOf(after) - LEVEL_ORDER.indexOf(before);
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
 * 结果页现在要把每位玩家压成真正的一行，避免五人局时结算弹窗被拉得过高；
 * 用单独 helper 生成每一行，可以同时控制字段顺序和紧凑结构，不让 PC / mobile 再各自发散。
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
 * - `result-level-tag` 允许为空，此时整行只保留阵营胶囊和等级变化，不强行塞“平级”。
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
        <span class="result-level-player">${player.name}</span>
        <span class="result-camp-chip ${campTone}">${campLabel}</span>
        ${resultTag}
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

/**
 * 作用：
 * 把 AI 决策快照里的 mode 转成结果日志可读标签。
 *
 * 为什么这样写：
 * 旧版导出把除了 `follow` 之外的所有阶段都统称成“首发”，
 * 导致亮主 / 反主 / 扣底 / 叫朋友在结果日志里很难区分；
 * 这里集中映射后，所有阶段都能用统一口径导出。
 *
 * 输入：
 * @param {string} mode - 当前快照记录的 mode。
 *
 * 输出：
 * @returns {string} 适合结果日志展示的中文阶段标签。
 *
 * 注意：
 * - 未识别的 mode 仍回退到“首发”，避免旧快照导出失败。
 * - 这里只负责展示文案，不改变底层 mode 枚举。
 */
function getAiDecisionModeLabel(mode) {
  if (mode === "follow") return "跟牌";
  if (mode === "declare") return "亮主";
  if (mode === "counter") return "反主";
  if (mode === "call_friend") return "叫朋友";
  if (mode === "bury") return "扣底";
  return "首发";
}

/**
 * 作用：
 * 为结果日志导出格式化单条 AI 决策里的“选择 / 候选”展示文本。
 *
 * 为什么这样写：
 * 出牌阶段可以直接显示牌组，但叫朋友需要保留“第一张 / 第二张”这类张次信息；
 * 因此这里优先读取显式 label，再回退到牌面列表，避免不同阶段混成同一种输出。
 *
 * 输入：
 * @param {{label?: string, cards?: Array<object>}} entry - 当前待展示的决策或候选条目。
 *
 * 输出：
 * @returns {string} 适合结果日志直接展示的选择文本。
 *
 * 注意：
 * - 没有 label 且没有牌面时返回 `无`。
 * - 这里只处理展示，不负责生成 label。
 */
function formatAiDecisionChoiceLabel(entry) {
  if (entry?.label) return entry.label;
  const cards = Array.isArray(entry?.cards) && entry.cards.length > 0
    ? entry.cards.map(shortCardLabel).join("、")
    : "无";
  return cards;
}

function formatAiDecisionExportEntry(entry, index) {
  if (!entry) return `${index + 1}. （空记录）`;
  const playerName = getPlayer(entry.playerId)?.name || `玩家${entry.playerId || "?"}`;
  const modeLabel = getAiDecisionModeLabel(entry.mode);
  const trickLabel = entry.recordedAtTrickNumber ? `第 ${entry.recordedAtTrickNumber} 轮` : "轮次未知";
  const turnLabel = entry.recordedAtTurnId ? `行动位 玩家${entry.recordedAtTurnId}` : "行动位未知";
  const primary = entry.objective?.primary || "--";
  const secondary = entry.objective?.secondary || "--";
  const selectedCards = formatAiDecisionChoiceLabel({
    label: entry.selectedLabel,
    cards: entry.selectedCards,
  });
  const stats = entry.debugStats || {};
  const topCandidates = Array.isArray(entry.candidateEntries)
    ? entry.candidateEntries.slice(0, 3).map((candidate, candidateIndex) => {
      const cards = formatAiDecisionChoiceLabel(candidate);
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

/**
 * 作用：
 * 生成结果日志导出里使用的复盘信息段落。
 *
 * 为什么这样写：
 * 用户要求 `开局码 / 回放种子` 不再出现在局内信息栏里，
 * 但导出日志仍然需要保留这两项，方便把问题局发给别人后直接复盘；
 * 单独收成一个导出 helper 后，既能和信息栏解耦，也能保持结果日志结构稳定。
 *
 * 输入：
 * @param {void} - 直接读取当前共享状态。
 *
 * 输出：
 * @returns {string[]} 结果日志里的复盘信息行列表。
 *
 * 注意：
 * - 这里不再走 `appendLog`，避免污染局内信息栏。
 * - 若当前值为空，也要明确写出“未生成”，避免导出日志里出现空洞字段。
 */
function getReplayInfoExportLines() {
  return [
    "复盘信息：",
    `回放种子：${state.replaySeed || "未生成"}`,
    `开局码：${state.openingCode || "未生成"}`,
  ];
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
  lines.push("");
  lines.push(...getReplayInfoExportLines());
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
    await writeTextToClipboard(text);
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
