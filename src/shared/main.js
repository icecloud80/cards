// 判断当前是否轮到玩家本人行动。
function isHumanTurnActive() {
  return !state.gameOver && state.phase === "playing" && state.currentTurnId === 1;
}

/**
 * 作用：
 * 收起 PC 顶部的更多功能菜单。
 *
 * 为什么这样写：
 * 设置菜单里的入口会同时打开别的浮层；统一收口成一个 helper 后，
 * 各个按钮点击后都能保持相同的“执行动作后顺手收起菜单”体验。
 *
 * 输入：
 * @param {void} - 直接修改全局状态。
 *
 * 输出：
 * @returns {void} 只收起菜单，不返回额外结果。
 *
 * 注意：
 * - 这里只改菜单显隐，不额外触发别的面板逻辑。
 * - 若当前项目不是 PC，调用也应保持安全无副作用。
 */
function closeToolbarMenu() {
  if (!state.showToolbarMenu) return;
  state.showToolbarMenu = false;
}

/**
 * 作用：
 * 用当前牌局的复盘信息预填复盘面板输入框。
 *
 * 为什么这样写：
 * 用户希望局中点击“复盘”时直接带出本局 `回放种子 / 开局码`，
 * 这样排查问题时不用再去翻日志手抄；统一收成 helper 后，菜单按钮和未来其他入口都能复用同一套预填规则。
 *
 * 输入：
 * @param {void} - 直接读取当前共享状态并写回复盘草稿字段。
 *
 * 输出：
 * @returns {void} 只更新草稿值和状态提示，不返回额外结果。
 *
 * 注意：
 * - 这里只在“准备打开复盘面板”时调用，避免覆盖用户已经手动改过的输入。
 * - 若当前局还没生成值，统一回退为空字符串，保持输入框可继续编辑。
 */
function primeReplayPanelDraftsFromCurrentRound() {
  const preferredReplayBundle = typeof getPreferredReplayDraftSource === "function"
    ? getPreferredReplayDraftSource()
    : null;
  state.debugReplaySeedDraft = preferredReplayBundle?.replaySeed || state.replaySeed || "";
  state.debugOpeningCodeDraft = preferredReplayBundle?.openingCode || state.openingCode || "";
  state.debugReplayStatusTone = "";
  state.debugReplayStatusText = "";
}

// 同步托管按钮的显示和状态。
function syncAutoManagedButton() {
  if (!dom.autoManagedBtn || typeof getPlayer !== "function") return;
  const mode = getAutoManageMode();
  dom.autoManagedBtn.classList.toggle("alert", mode !== "off");
  dom.autoManagedBtn.classList.toggle("persistent", mode === "persistent");
  dom.autoManagedBtn.setAttribute("aria-pressed", mode === "off" ? "false" : "true");
  dom.autoManagedBtn.setAttribute("data-mode", mode);
  dom.autoManagedBtn.title = `托管：${getAutoManageModeLabel(mode)}`;
  dom.autoManagedBtn.setAttribute("aria-label", `托管：${getAutoManageModeLabel(mode)}`);
}

/**
 * 作用：
 * 规范化当前托管模式键值。
 *
 * 为什么这样写：
 * 托管现在扩展成 `关闭 / 本局托管 / 跨局托管` 三态；
 * 统一做一次校验后，按钮循环、跨局保留和开局重置都能共享同一套合法取值。
 *
 * 输入：
 * @param {string} value - 当前要写入的托管模式键值。
 *
 * 输出：
 * @returns {"off"|"round"|"persistent"} 合法托管模式；非法输入统一回退到关闭。
 *
 * 注意：
 * - `persistent` 表示跨局保留。
 * - `round` 只在当前牌局有效，`setupGame()` 会在新局开始时重置。
 */
function normalizeAutoManageMode(value) {
  return AUTO_MANAGE_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_AUTO_MANAGE_MODE;
}

/**
 * 作用：
 * 返回当前托管模式键值。
 *
 * 为什么这样写：
 * 顶部机器人按钮、跨局重置逻辑和自动出牌流程都要读取同一份托管状态；
 * 用 helper 统一读取后，后续新增来源时不需要到处写兜底判断。
 *
 * 输入：
 * @param {void} - 直接读取共享状态。
 *
 * 输出：
 * @returns {"off"|"round"|"persistent"} 当前托管模式。
 *
 * 注意：
 * - 未初始化或旧状态值都必须安全回落到关闭。
 */
function getAutoManageMode() {
  return normalizeAutoManageMode(state.autoManageMode);
}

/**
 * 作用：
 * 把托管模式转换成用户能直接看懂的中文标签。
 *
 * 为什么这样写：
 * 顶部机器人按钮现在只显示图标；
 * 文案需要通过 tooltip 和 aria 暴露给用户，因此必须有一份稳定、短小的中文标签。
 *
 * 输入：
 * @param {"off"|"round"|"persistent"} mode - 当前托管模式键值。
 *
 * 输出：
 * @returns {string} 对应的中文标签。
 *
 * 注意：
 * - 未知值必须回退到“关闭”。
 */
function getAutoManageModeLabel(mode = getAutoManageMode()) {
  return AUTO_MANAGE_OPTIONS.find((option) => option.value === normalizeAutoManageMode(mode))?.label || "关闭";
}

/**
 * 作用：
 * 计算顶部托管按钮下一次点击后应切换到的模式。
 *
 * 为什么这样写：
 * 用户要求托管在一个图标按钮里切换 `关闭 / 本局托管 / 跨局托管` 三个状态；
 * 固定循环顺序后，点击体验会稳定且容易记忆。
 *
 * 输入：
 * @param {"off"|"round"|"persistent"} mode - 当前托管模式。
 *
 * 输出：
 * @returns {"off"|"round"|"persistent"} 下一次点击后应切换到的模式。
 *
 * 注意：
 * - 循环顺序固定为 `关闭 -> 本局托管 -> 跨局托管 -> 关闭`。
 */
function getNextAutoManageMode(mode = getAutoManageMode()) {
  if (mode === "off") return "round";
  if (mode === "round") return "persistent";
  return "off";
}

/**
 * 作用：
 * 判断 PC 最后反主阶段是否启用了底部直选模式。
 *
 * 为什么这样写：
 * 这轮 PC 反主交互不再依赖上方“确认反主 / 不反主”按钮，
 * 而是直接在底部候选区点击 2 王、3 王或不反主完成操作；
 * 单独抽成 helper 后，点击处理和渲染条件可以保持一致。
 *
 * 输入：
 * @param {void} - 直接读取当前平台和共享状态。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前应直接执行反主或不反主。
 *
 * 注意：
 * - 这里只对 PC 生效，手游仍按原有声明阶段交互处理。
 * - 必须确认轮到玩家1，避免别的玩家回合误触发。
 */
function isPcDirectCounterChoiceMode() {
  return APP_PLATFORM === "pc" && state.phase === "countering" && state.currentTurnId === 1;
}

// 设置当前 AI 难度并刷新界面。
function setAiDifficulty(value) {
  state.aiDifficulty = normalizeAiDifficulty(value);
  if (dom.aiDifficultySelect && dom.aiDifficultySelect.value !== state.aiDifficulty) {
    dom.aiDifficultySelect.value = state.aiDifficulty;
  }
  if (typeof render === "function") {
    render();
  }
  persistNativeAppSettingsFromState();
}

/**
 * 作用：
 * 设置当前 AI 节奏档位并同步可见设置入口。
 *
 * 为什么这样写：
 * 节奏配置现在同时出现在 PC 开始界面、PC 更多菜单、手游开始页和手游设置页；
 * 统一从一个入口改共享状态，才能保证多端镜像控件始终显示同一个档位。
 *
 * 输入：
 * @param {string} value - 目标节奏档位键值。
 *
 * 输出：
 * @returns {void} 只更新共享状态并触发重渲染，不返回额外数据。
 *
 * 注意：
 * - 这里只改变后续等待节奏，不改 AI 决策逻辑本身。
 * - 非法值会自动回落到默认慢档。
 */
function setAiPace(value) {
  state.aiPace = normalizeAiPace(value);
  if (dom.aiPaceSelect && dom.aiPaceSelect.value !== state.aiPace) {
    dom.aiPaceSelect.value = state.aiPace;
  }
  if (dom.menuAiPaceSelect && dom.menuAiPaceSelect.value !== state.aiPace) {
    dom.menuAiPaceSelect.value = state.aiPace;
  }
  if (typeof render === "function") {
    render();
  }
  persistNativeAppSettingsFromState();
}

/**
 * 作用：
 * 切换当前人类玩家的托管模式，并在必要时立刻接管当前阶段动作。
 *
 * 为什么这样写：
 * 托管已经从简单开关扩展成三态模式；
 * 统一在一个入口里同时处理“写回模式、刷新玩家身份、必要时立刻自动执行当前阶段”，
 * 才能保证点击顶部机器人按钮后界面和实际行为始终一致。
 *
 * 输入：
 * @param {"off"|"round"|"persistent"} mode - 目标托管模式。
 *
 * 输出：
 * @returns {void} 只更新共享状态并按需触发自动动作，不返回额外数据。
 *
 * 注意：
 * - `persistent` 会跨局保留，`round` 只在当前局有效。
 * - 关闭托管时，如果当前正轮到玩家1出牌，需要重新启动该回合的人类倒计时。
 */
function applyAutoManagedState(mode) {
  if (typeof getPlayer !== "function") return;
  const human = getPlayer(1);
  if (!human) return;
  const normalizedMode = normalizeAutoManageMode(mode);
  const enabled = normalizedMode !== "off";

  state.autoManageMode = normalizedMode;
  human.isHuman = !enabled;
  if (enabled && state.selectedCardIds) {
    state.selectedCardIds = [];
  }
  if (typeof render === "function") {
    render();
  }
  syncAutoManagedButton();
  persistNativeAppSettingsFromState();

  if (!enabled) {
    if (typeof clearTimers === "function" && typeof startTurn === "function" && state.phase === "playing" && state.currentTurnId === 1) {
      clearTimers();
      startTurn();
    }
    return;
  }

  if (state.phase === "dealing" && state.awaitingHumanDeclaration && typeof getBestDeclarationForPlayer === "function" && typeof canOverrideDeclaration === "function" && typeof declareTrump === "function") {
    const best = getBestDeclarationForPlayer(1);
    if (best && canOverrideDeclaration(best)) {
      declareTrump(1, best, "auto");
      if (state.dealIndex >= state.dealCards.length && typeof clearTimers === "function" && typeof finishDealingPhase === "function") {
        clearTimers();
        finishDealingPhase();
      }
    }
    return;
  }

  if (state.phase === "countering" && state.currentTurnId === 1 && typeof getCounterDeclarationForPlayer === "function") {
    const counter = getCounterDeclarationForPlayer(1);
    if (counter && typeof counterDeclare === "function") {
      counterDeclare(1, counter);
    } else if (typeof passCounterForCurrentPlayer === "function") {
      passCounterForCurrentPlayer();
    }
    return;
  }

  if (state.phase === "burying" && state.bankerId === 1 && typeof getBuryHintForPlayer === "function" && typeof completeBurying === "function") {
    const buryCards = getBuryHintForPlayer(1);
    if (buryCards.length === 7) {
      completeBurying(1, buryCards.map((card) => card.id));
    }
    return;
  }

  if (state.phase === "callingFriend" && state.bankerId === 1 && typeof confirmFriendTargetSelection === "function") {
    const best = typeof chooseFriendTarget === "function" ? chooseFriendTarget()?.target : null;
    if (best) {
      confirmFriendTargetSelection(best);
    }
    return;
  }

  if (state.phase === "playing" && state.currentTurnId === 1 && typeof clearTimers === "function" && typeof autoPlayCurrentTurn === "function") {
    clearTimers();
    autoPlayCurrentTurn();
  }
}

dom.startGameBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress(true);
});

dom.startLobbyStartBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress(true);
});

dom.newProgressBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress();
});

dom.continueGameBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready" || !state.hasSavedProgress) return;
  continueSavedProgress(true);
});

dom.startLobbyContinueBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready" || !state.hasSavedProgress) return;
  continueSavedProgress(true);
});

dom.startLobbyRulesBtn?.addEventListener("click", () => {
  state.showRulesPanel = true;
  renderLogs();
});

dom.playBtn.addEventListener("click", () => {
  if (state.phase === "burying") {
    if (state.bankerId !== 1) return;
    completeBurying(1, [...state.selectedCardIds]);
    return;
  }
  if (!isHumanTurnActive()) return;
  playCards(1, [...state.selectedCardIds]);
});

dom.beatBtn.addEventListener("click", () => {
  if (!isHumanTurnActive()) return;
  const selected = state.selectedCardIds
    .map((id) => getPlayer(1).hand.find((card) => card.id === id))
    .filter(Boolean);
  if (!doesSelectionBeatCurrent(1, selected)) return;
  playCards(1, [...state.selectedCardIds]);
});

dom.autoManagedBtn?.addEventListener("click", () => {
  if (typeof getPlayer !== "function") return;
  const human = getPlayer(1);
  if (!human || state.gameOver || state.phase === "ready") return;
  applyAutoManagedState(getNextAutoManageMode());
});

dom.aiDifficultySelect?.addEventListener("change", () => {
  setAiDifficulty(dom.aiDifficultySelect.value);
});

dom.aiPaceSelect?.addEventListener("change", () => {
  setAiPace(dom.aiPaceSelect.value);
});

dom.menuAiPaceSelect?.addEventListener("change", () => {
  setAiPace(dom.menuAiPaceSelect.value);
});

/**
 * 作用：
 * 绑定一组节奏按钮里的点击事件，并把点击结果同步到共享节奏状态。
 *
 * 为什么这样写：
 * PC 顶部更多菜单和开始界面都改成了四档按钮组；
 * 统一用事件代理处理后，两处控件只要约定 `data-ai-pace-value` 就能共用同一套逻辑。
 *
 * 输入：
 * @param {?HTMLElement} container - 当前按钮组容器。
 *
 * 输出：
 * @returns {void} 只绑定点击事件，不返回额外结果。
 *
 * 注意：
 * - 容器不存在时必须安全跳过，避免影响其他平台。
 * - 这里只负责节奏状态，不处理视觉激活态；视觉由 `render` 同步。
 */
function bindAiPaceButtons(container) {
  if (!container) return;
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-pace-value]");
    if (!button) return;
    setAiPace(button.dataset.aiPaceValue);
  });
}

bindAiPaceButtons(dom.aiPaceButtons);
bindAiPaceButtons(dom.menuAiPaceButtons);

dom.hintBtn.addEventListener("click", () => {
  if (state.selectedCardIds.length > 0) {
    state.selectedCardIds = [];
    renderHand();
    renderCenterPanel();
    updateActionHint();
    return;
  }
  if (state.phase === "burying") {
    if (state.bankerId !== 1) return;
    const hint = getBuryHintForPlayer(1);
    state.selectedCardIds = hint.map((card) => card.id);
    renderHand();
    renderCenterPanel();
    updateActionHint();
    return;
  }
  if (!isHumanTurnActive()) return;
  const hint = getLegalHintForPlayer(1);
  state.selectedCardIds = hint.map((card) => card.id);
  renderHand();
  renderCenterPanel();
  updateActionHint();
});

dom.setupOptions?.addEventListener("click", (event) => {
  const passButton = event.target.closest("button[data-setup-pass]");
  if (passButton) {
    if (state.gameOver) return;
    if (passButton.dataset.setupPass === "counter") {
      if (!isPcDirectCounterChoiceMode()) return;
      passCounterForCurrentPlayer();
      return;
    }
    if (passButton.dataset.setupPass === "declare") {
      passDeclarationForPlayer(1);
    }
    return;
  }

  const button = event.target.closest("button[data-setup-option-key]");
  if (!button || state.gameOver || (state.phase !== "dealing" && state.phase !== "countering")) return;
  const selected = getAvailableSetupOptionsForPlayer(1, state.phase)
    .find((entry) => getSetupOptionKey(entry) === button.dataset.setupOptionKey) || null;
  if (!selected) return;
  if (state.phase === "dealing") {
    if (!declareTrump(1, selected, "manual")) return;
    if (state.dealIndex >= state.dealCards.length) {
      clearTimers();
      finishDealingPhase();
    }
    return;
  }
  if (isPcDirectCounterChoiceMode()) {
    counterDeclare(1, selected);
    return;
  }
  selectSetupOptionForPlayer(1, button.dataset.setupOptionKey, state.phase);
  renderCenterPanel();
  updateActionHint();
});

dom.declareBtn.addEventListener("click", () => {
  if (state.gameOver) return;
  if (state.phase === "countering") {
    if (state.currentTurnId !== 1) return;
    const selectedOption = getSelectedSetupOptionForPlayer(1, "countering");
    if (!selectedOption) return;
    counterDeclare(1, selectedOption);
  }
});

dom.passCounterBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "countering" || state.currentTurnId !== 1) return;
  passCounterForCurrentPlayer();
});

dom.friendSuitOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-friend-suit]");
  if (!button || state.phase !== "callingFriend" || state.bankerId !== 1) return;
  state.selectedFriendSuit = button.dataset.friendSuit;
  const rankOptions = getFriendPickerRanksForSuit(state.selectedFriendSuit);
  state.selectedFriendRank = rankOptions[0]?.value || "A";
  renderFriendPicker();
});

dom.friendRankOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-friend-rank]");
  if (!button || state.phase !== "callingFriend" || state.bankerId !== 1) return;
  state.selectedFriendRank = button.dataset.friendRank;
  renderFriendPicker();
});

dom.friendOccurrenceOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-friend-occurrence]");
  if (!button || state.phase !== "callingFriend" || state.bankerId !== 1) return;
  state.selectedFriendOccurrence = Number(button.dataset.friendOccurrence);
  renderFriendPicker();
});

/**
 * 作用：
 * 在顶部朋友牌仍处于一次性重改窗口时，重新打开叫朋友编辑面板。
 *
 * 为什么这样写：
 * 这轮 PC 交互要求玩家确认后还能在读秒内点顶部朋友牌再改一次；
 * 统一封装成一个 handler 后，鼠标点击和键盘回车都能复用同一套入口。
 *
 * 输入：
 * @param {void} - 直接读取共享状态并尝试重开编辑面板。
 *
 * 输出：
 * @returns {boolean} `true` 表示本次成功重开；否则返回 `false`。
 *
 * 注意：
 * - 只允许成功一次，之后顶部朋友牌应恢复为纯展示态。
 * - 不满足窗口条件时必须静默失败，避免误打断正常出牌流程。
 */
function reopenFriendPickerFromTopbar() {
  if (typeof reopenFriendSelection !== "function") return false;
  return reopenFriendSelection();
}

dom.friendCardMount?.addEventListener("click", () => {
  reopenFriendPickerFromTopbar();
});

dom.friendCardMount?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const reopened = reopenFriendPickerFromTopbar();
  if (reopened) {
    event.preventDefault();
  }
});

dom.confirmFriendBtn.addEventListener("click", () => {
  if (state.phase !== "callingFriend" || state.bankerId !== 1) return;
  confirmFriendTargetSelection();
});

dom.autoFriendBtn?.addEventListener("click", () => {
  if (state.phase !== "callingFriend" || state.bankerId !== 1) return;
  const best = typeof getFriendPickerRecommendation === "function"
    ? getFriendPickerRecommendation()?.target
    : chooseFriendTarget()?.target;
  if (!best) return;
  state.selectedFriendOccurrence = best.occurrence || 1;
  state.selectedFriendSuit = best.suit;
  state.selectedFriendRank = best.rank;
  confirmFriendTargetSelection(best);
});

dom.closeBottomRevealBtn.addEventListener("click", () => {
  finishBottomRevealPhase();
});

dom.closeBottomRevealPanelBtn?.addEventListener("click", () => {
  finishBottomRevealPhase();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".trick-spot.zoomable")) return;
  for (const playerId of PLAYER_ORDER) {
    document.getElementById(`trickSpot-${playerId}`)?.classList.remove("show-zoom");
  }
  if (dom.toolbarMenuPanel && !event.target.closest("#toolbarMenuPanel") && !event.target.closest("#toggleRulesBtn")) {
    closeToolbarMenu();
    renderToolbarMenu?.();
    renderScorePanel?.();
  }
});

dom.toggleLastTrickBtn.addEventListener("click", () => {
  closeToolbarMenu();
  state.showLogPanel = false;
  state.showLastTrick = !state.showLastTrick;
  renderLastTrick();
  renderLogs();
  renderToolbarMenu?.();
  renderScorePanel();
});

dom.closeLastTrickBtn.addEventListener("click", () => {
  state.showLastTrick = false;
  dom.lastTrickPanel.classList.add("hidden");
  renderLastTrick();
  renderScorePanel();
});

dom.toggleLogBtn.addEventListener("click", () => {
  closeToolbarMenu();
  state.showLastTrick = false;
  renderLastTrick();
  state.showLogPanel = !state.showLogPanel;
  renderLogs();
  renderScorePanel();
});

dom.toggleDebugBtn?.addEventListener("click", () => {
  state.showDebugPanel = !state.showDebugPanel;
  closeToolbarMenu();
  renderDebugPanel();
  renderToolbarMenu?.();
  renderScorePanel?.();
});

dom.menuReplayBtn?.addEventListener("click", () => {
  const shouldOpenReplayPanel = !state.showReplayPanel;
  if (shouldOpenReplayPanel) {
    primeReplayPanelDraftsFromCurrentRound();
  }
  state.showReplayPanel = shouldOpenReplayPanel;
  closeToolbarMenu();
  renderReplayPanel?.();
  renderToolbarMenu?.();
  renderScorePanel?.();
});

dom.toggleBottomBtn.addEventListener("click", () => {
  if (!canHumanViewBottomCards()) return;
  state.showBottomPanel = !state.showBottomPanel;
  closeToolbarMenu();
  renderBottomPanel();
  renderToolbarMenu?.();
  renderScorePanel?.();
});

dom.toggleRulesBtn.addEventListener("click", () => {
  state.showLogPanel = false;
  state.showLastTrick = false;
  state.showToolbarMenu = !state.showToolbarMenu;
  renderLastTrick();
  renderLogs();
  renderToolbarMenu?.();
  renderScorePanel?.();
});

dom.menuRulesBtn?.addEventListener("click", () => {
  state.showRulesPanel = !state.showRulesPanel;
  closeToolbarMenu();
  renderLogs();
  renderToolbarMenu?.();
  renderScorePanel?.();
});

dom.toggleCardFaceBtn?.addEventListener("click", () => {
  if (CARD_FACE_OPTIONS.length <= 1) return;
  const nextFace = getNextCardFaceOption();
  state.cardFaceKey = nextFace.key;
  saveCardFaceKey(nextFace.key);
  closeToolbarMenu();
  render();
});

dom.layoutEditBtn.addEventListener("click", () => {
  setLayoutEditMode(!state.layoutEditMode);
  renderToolbarMenu?.();
  renderScorePanel?.();
});

dom.closeLogBtn.addEventListener("click", () => {
  state.showLogPanel = false;
  renderLogs();
  renderScorePanel();
});

dom.debugPlayerTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-debug-player]");
  if (!button) return;
  state.selectedDebugPlayerId = Number(button.dataset.debugPlayer);
  state.selectedDebugDecisionOffsets[state.selectedDebugPlayerId] = 0;
  renderDebugPanel();
});

dom.debugDecisionPrevBtn?.addEventListener("click", () => {
  const playerId = state.selectedDebugPlayerId;
  if (!PLAYER_ORDER.includes(playerId) || playerId === 1) return;
  const historyCount = (state.aiDecisionHistory || []).filter((entry) => entry.playerId === playerId).length;
  if (historyCount <= 0) return;
  const currentOffset = state.selectedDebugDecisionOffsets[playerId] || 0;
  state.selectedDebugDecisionOffsets[playerId] = Math.min(historyCount - 1, currentOffset + 1);
  renderDebugPanel();
});

dom.debugDecisionNextBtn?.addEventListener("click", () => {
  const playerId = state.selectedDebugPlayerId;
  if (!PLAYER_ORDER.includes(playerId) || playerId === 1) return;
  const currentOffset = state.selectedDebugDecisionOffsets[playerId] || 0;
  state.selectedDebugDecisionOffsets[playerId] = Math.max(0, currentOffset - 1);
  renderDebugPanel();
});

dom.replaySeedInput?.addEventListener("input", (event) => {
  state.debugReplaySeedDraft = event.target.value;
});

dom.replayOpeningCodeInput?.addEventListener("input", (event) => {
  state.debugOpeningCodeDraft = event.target.value;
});

dom.replaySeedApplyBtn?.addEventListener("click", () => {
  applyDebugReplaySeedReplay(state.debugReplaySeedDraft);
});

dom.replayPasteBtn?.addEventListener("click", async () => {
  await pasteReplayBundleFromClipboardToReplayDrafts();
});

dom.replayOpeningCodeApplyBtn?.addEventListener("click", () => {
  applyDebugOpeningCodeReplay(state.debugOpeningCodeDraft, state.debugReplaySeedDraft);
});

dom.closeDebugBtn?.addEventListener("click", () => {
  state.showDebugPanel = false;
  renderDebugPanel();
});

dom.closeReplayBtn?.addEventListener("click", () => {
  state.showReplayPanel = false;
  renderReplayPanel?.();
});

dom.closeBottomBtn.addEventListener("click", () => {
  state.showBottomPanel = false;
  renderLogs();
});

dom.closeRulesBtn.addEventListener("click", () => {
  state.showRulesPanel = false;
  renderLogs();
});

dom.newGameBtn?.addEventListener("click", restartCurrentRound);

dom.menuHomeBtn?.addEventListener("click", () => {
  closeToolbarMenu();
  goToMainMenu();
});

dom.restartBtn.addEventListener("click", () => {
  beginNextGame(true);
});

dom.copyResultLogBtn?.addEventListener("click", () => {
  copyResultLog();
});

dom.downloadResultLogBtn?.addEventListener("click", () => {
  downloadResultLog();
});

dom.closeResultBtn?.addEventListener("click", () => {
  goToMainMenu();
});

if (APP_PLATFORM !== "pc") {
  makeFloatingPanel(dom.logPanel, dom.logPanelDrag);
}
makeFloatingPanel(dom.debugPanel, dom.debugPanelDrag);
makeFloatingPanel(dom.replayPanel, dom.replayPanelDrag);
makeFloatingPanel(dom.bottomPanel, dom.bottomPanelDrag);
makeFloatingPanel(dom.rulesPanel, dom.rulesPanelDrag);
for (const element of getLayoutElements()) {
  makeLayoutEditable(element);
}
applySavedLayoutState();
dom.versionBadge.textContent = APP_VERSION_LABEL;

/**
 * 作用：
 * 以“先同步起盘、再异步吸收原生存储”的顺序启动运行态。
 *
 * 为什么这样写：
 * 现有 Web 与测试都依赖 `setupGame()` 在脚本加载末尾同步执行；
 * 这轮 App 存储又需要异步读取 `Preferences`，因此最稳妥的做法是先保持旧的同步启动不变，
 * 再在原生壳里补一轮轻量 hydration，把设置、等级进度和最近一局复盘输入吸收到当前状态里。
 *
 * 输入：
 * @param {void} - 直接复用共享状态、渲染函数和原生存储 helper。
 *
 * 输出：
 * @returns {void} 启动流程进入运行态后结束，不返回额外数据。
 *
 * 注意：
 * - Web 环境必须保持原有同步启动语义。
 * - 原生 hydration 失败时只告警并保留当前默认牌局，不能阻断页面启动。
 */
function bootstrapRuntimeState() {
  setupGame();
  if (!isNativeAppRuntime() || typeof hydrateNativeAppStorageState !== "function") return;
  state.appStorageHydrationPromise = hydrateNativeAppStorageState()
    .then(() => {
      if (state.nativeAppSettingsSnapshot) {
        state.cardFaceKey = normalizeCardFaceKey(state.nativeAppSettingsSnapshot.cardFaceKey);
        state.aiDifficulty = normalizeAiDifficulty(state.nativeAppSettingsSnapshot.aiDifficulty);
        state.aiPace = normalizeAiPace(state.nativeAppSettingsSnapshot.aiPace);
        state.autoManageMode = normalizeAutoManageMode(state.nativeAppSettingsSnapshot.autoManageMode);
      }
      if (state.nativeProgressSnapshot?.playerLevels) {
        state.playerLevels = normalizePlayerLevels(state.nativeProgressSnapshot.playerLevels);
      }
      refreshSavedProgressAvailability();
      setupGame();
      if (typeof render === "function") {
        render();
      }
    })
    .catch((error) => {
      console.warn?.("Failed to hydrate native app storage state", error);
      state.appStorageHydrated = true;
      refreshSavedProgressAvailability();
      if (typeof render === "function") {
        render();
      }
    });
}

bootstrapRuntimeState();
