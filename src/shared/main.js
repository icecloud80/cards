// 判断当前是否轮到玩家本人行动。
function isHumanTurnActive() {
  return !state.gameOver && state.phase === "playing" && state.currentTurnId === 1;
}

// 同步托管按钮的显示和状态。
function syncAutoManagedButton() {
  if (!dom.autoManagedBtn || typeof getPlayer !== "function") return;
  const human = getPlayer(1);
  const managed = !!human && !human.isHuman;
  dom.autoManagedBtn.classList.toggle("alert", managed);
  dom.autoManagedBtn.setAttribute("aria-pressed", managed ? "true" : "false");
}

// 规范化 AI 难度取值。
function normalizeAiDifficulty(value) {
  return AI_DIFFICULTY_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_AI_DIFFICULTY;
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
}

// 应用托管状态。
function applyAutoManagedState(enabled) {
  if (typeof getPlayer !== "function") return;
  const human = getPlayer(1);
  if (!human) return;

  human.isHuman = !enabled;
  if (enabled && state.selectedCardIds) {
    state.selectedCardIds = [];
  }
  if (typeof render === "function") {
    render();
  }
  syncAutoManagedButton();

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

dom.newProgressBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress();
});

dom.continueGameBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready" || !state.hasSavedProgress) return;
  continueSavedProgress(true);
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
  applyAutoManagedState(human.isHuman);
});

dom.aiDifficultySelect?.addEventListener("change", () => {
  setAiDifficulty(dom.aiDifficultySelect.value);
});

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

dom.declareBtn.addEventListener("click", () => {
  if (state.gameOver) return;
  if (state.phase === "dealing") {
    const best = getBestDeclarationForPlayer(1);
    if (!best || !canOverrideDeclaration(best)) return;
    if (!declareTrump(1, best, "manual")) return;
    if (state.dealIndex >= state.dealCards.length) {
      clearTimers();
      finishDealingPhase();
    }
    return;
  }
  if (state.phase === "countering") {
    if (state.currentTurnId !== 1) return;
    const counter = getCounterDeclarationForPlayer(1);
    if (!counter) return;
    counterDeclare(1, counter);
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

document.addEventListener("click", (event) => {
  if (event.target.closest(".trick-spot.zoomable")) return;
  for (const playerId of PLAYER_ORDER) {
    document.getElementById(`trickSpot-${playerId}`)?.classList.remove("show-zoom");
  }
});

dom.toggleLastTrickBtn.addEventListener("click", () => {
  state.showLastTrick = !state.showLastTrick;
  renderLastTrick();
  renderScorePanel();
});

dom.closeLastTrickBtn.addEventListener("click", () => {
  state.showLastTrick = false;
  dom.lastTrickPanel.classList.add("hidden");
  renderLastTrick();
  renderScorePanel();
});

dom.toggleLogBtn.addEventListener("click", () => {
  state.showLogPanel = !state.showLogPanel;
  renderLogs();
});

dom.toggleDebugBtn?.addEventListener("click", () => {
  state.showDebugPanel = !state.showDebugPanel;
  renderDebugPanel();
});

dom.toggleBottomBtn.addEventListener("click", () => {
  if (!canHumanViewBottomCards()) return;
  state.showBottomPanel = !state.showBottomPanel;
  renderBottomPanel();
});

dom.toggleRulesBtn.addEventListener("click", () => {
  state.showRulesPanel = !state.showRulesPanel;
  renderLogs();
});

dom.toggleCardFaceBtn?.addEventListener("click", () => {
  if (CARD_FACE_OPTIONS.length <= 1) return;
  const nextFace = getNextCardFaceOption();
  state.cardFaceKey = nextFace.key;
  saveCardFaceKey(nextFace.key);
  render();
});

dom.layoutEditBtn.addEventListener("click", () => {
  setLayoutEditMode(!state.layoutEditMode);
});

dom.closeLogBtn.addEventListener("click", () => {
  state.showLogPanel = false;
  renderLogs();
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

dom.closeDebugBtn?.addEventListener("click", () => {
  state.showDebugPanel = false;
  renderDebugPanel();
});

dom.closeBottomBtn.addEventListener("click", () => {
  state.showBottomPanel = false;
  renderLogs();
});

dom.closeRulesBtn.addEventListener("click", () => {
  state.showRulesPanel = false;
  renderLogs();
});

dom.newGameBtn.addEventListener("click", startNewProgress);

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

makeFloatingPanel(dom.logPanel, dom.logPanelDrag);
makeFloatingPanel(dom.debugPanel, dom.debugPanelDrag);
makeFloatingPanel(dom.bottomPanel, dom.bottomPanelDrag);
makeFloatingPanel(dom.rulesPanel, dom.rulesPanelDrag);
for (const element of getLayoutElements()) {
  makeLayoutEditable(element);
}
applySavedLayoutState();
dom.versionBadge.textContent = APP_VERSION_LABEL;

setupGame();
