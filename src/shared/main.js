function isHumanTurnActive() {
  return !state.gameOver && state.phase === "playing" && state.currentTurnId === 1;
}

dom.startGameBtn.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready" || !state.startSelection) return;
  startDealing();
});

dom.newProgressBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  startNewProgress();
});

dom.continueGameBtn?.addEventListener("click", () => {
  if (state.gameOver || state.phase !== "ready") return;
  continueSavedProgress();
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
  const best = chooseFriendTarget()?.target;
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

dom.closeResultBtn?.addEventListener("click", () => {
  goToMainMenu();
});

makeFloatingPanel(dom.logPanel, dom.logPanelDrag);
makeFloatingPanel(dom.bottomPanel, dom.bottomPanelDrag);
makeFloatingPanel(dom.rulesPanel, dom.rulesPanelDrag);
for (const element of getLayoutElements()) {
  makeLayoutEditable(element);
}
applySavedLayoutState();
dom.versionBadge.textContent = APP_VERSION_LABEL;

setupGame();
