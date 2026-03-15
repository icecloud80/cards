function render() {
  renderFriendPanel();
  renderHud();
  renderScorePanel();
  renderSeats();
  renderTrickSpots();
  renderHand();
  renderLastTrick();
  renderFriendPicker();
  renderLogs();
  renderDebugPanel();
  renderBottomPanel();
  renderBottomRevealCenter();
  renderResultBottomCards();
  renderCenterPanel();
  const snapshot = {
    phase: state.phase,
    gameOver: state.gameOver,
    bankerId: state.bankerId,
    currentTurnId: state.currentTurnId,
    trickNumber: state.trickNumber,
    countdown: state.countdown,
    defenderPoints: getVisibleDefenderPoints(),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      level: player.level,
      handCount: player.hand.length,
      capturedPoints: player.capturedPoints,
      role: getVisibleRole(player.id),
      exposedTrumpVoid: !!state.exposedTrumpVoid[player.id],
    })),
    declaration: state.declaration
      ? {
          suit: state.declaration.suit,
          rank: state.declaration.rank,
          count: state.declaration.count,
          cards: (state.declaration.cards || []).map((card) => ({
            suit: card.suit,
            rank: card.rank,
            img: resolveCardImage(card),
          })),
        }
      : null,
    friendTarget: state.friendTarget
      ? {
          label: state.friendTarget.label,
          occurrence: state.friendTarget.occurrence || 1,
          suit: state.friendTarget.suit,
          rank: state.friendTarget.rank,
          revealed: !!state.friendTarget.revealed,
          failed: !!state.friendTarget.failed,
          revealedBy: state.friendTarget.revealedBy || null,
        }
      : null,
  };
  window.__fiveFriendsSnapshot = snapshot;
  window.dispatchEvent(new CustomEvent("fivefriends:render", { detail: snapshot }));
}

function renderBottomPanel() {
  dom.bottomPanel.classList.toggle("hidden", !state.showBottomPanel || state.phase === "bottomReveal");
  if (state.gameOver) {
    dom.bottomNote.textContent = TEXT.bottom.ended;
  } else if (state.phase === "bottomReveal") {
    dom.bottomNote.textContent = TEXT.bottom.revealing;
  } else if (!canHumanViewBottomCards()) {
    dom.bottomNote.textContent = TEXT.bottom.hidden;
  } else if (state.phase === "burying") {
    dom.bottomNote.textContent = TEXT.bottom.burying;
  } else {
    dom.bottomNote.textContent = TEXT.bottom.score(state.bottomCards.reduce((sum, card) => sum + scoreValue(card), 0));
  }

  const canShowCards = state.gameOver || canHumanViewBottomCards();
  dom.bottomCardsMount.innerHTML = canShowCards
    ? state.bottomCards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")
    : `<div class="empty-note">${TEXT.bottom.unavailable}</div>`;
}

function renderBottomRevealCenter() {
  const showBottomReveal = state.phase === "bottomReveal";
  dom.bottomRevealCenter.classList.toggle("hidden", !showBottomReveal);
  if (!showBottomReveal) return;

  dom.bottomRevealText.textContent = state.bottomRevealMessage || TEXT.bottom.revealFallback;
  dom.bottomRevealTimer.textContent = String(Math.max(0, state.countdown || 0));
  dom.bottomRevealCards.innerHTML = state.bottomCards
    .map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML)
    .join("");
}

function renderResultBottomCards() {
  dom.resultBottomCards.innerHTML = state.bottomCards
    .map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML)
    .join("");
}

function renderFriendPanel() {
  if (!state.friendTarget) {
    dom.friendHint.textContent = state.phase === "callingFriend"
      ? TEXT.friend.hintCalling
      : TEXT.friend.hintBeforeCall;
    dom.friendLabel.textContent = TEXT.friend.pendingLabel;
    dom.friendState.textContent = state.phase === "callingFriend" ? TEXT.friend.stateCalling : TEXT.friend.stateNotStarted;
    dom.friendOwner.textContent = TEXT.friend.ownerHidden;
    dom.friendCardMount.innerHTML = "";
    return;
  }

  dom.friendHint.textContent = TEXT.friend.fixedHint;
  dom.friendLabel.textContent = state.friendTarget.label;
  dom.friendState.textContent = state.friendTarget.failed
    ? TEXT.friend.stateNoFriend
    : state.friendTarget.revealed
      ? TEXT.friend.stateRevealed
      : TEXT.friend.stateWaiting(state.friendTarget.occurrence, state.friendTarget.matchesSeen || 0);
  dom.friendOwner.textContent = state.friendTarget.failed
    ? TEXT.friend.oneVsFour
    : state.friendTarget.revealed
    ? TEXT.friend.ownerRevealed(getPlayer(state.friendTarget.revealedBy).name)
    : TEXT.friend.ownerHidden;
  dom.friendCardMount.innerHTML = "";
  dom.friendCardMount.appendChild(buildCardNode(state.friendTarget, "friend-card"));
}

function renderHud() {
  dom.phaseLabel.textContent = state.gameOver
    ? TEXT.phase.gameOver
    : state.phase === "ready"
      ? TEXT.phase.ready
    : state.phase === "dealing"
      ? TEXT.phase.dealing
      : state.phase === "bottomReveal"
        ? TEXT.phase.bottomReveal
      : state.phase === "countering"
        ? TEXT.phase.countering
      : state.phase === "burying"
        ? TEXT.phase.burying
      : state.phase === "callingFriend"
        ? TEXT.phase.callingFriend
      : state.phase === "ending"
        ? TEXT.phase.ending
      : state.phase === "pause"
        ? TEXT.phase.pause
        : TEXT.phase.playing;
  dom.leaderLabel.textContent = state.phase === "ready"
    ? TEXT.hud.readyLeader
    : state.phase === "dealing"
    ? (state.declaration
      ? TEXT.hud.currentDeclaration(getPlayer(state.declaration.playerId).name)
      : TEXT.hud.currentDeclarationNone)
    : state.phase === "bottomReveal"
      ? TEXT.hud.currentBanker(getPlayer(state.bankerId).name)
    : state.phase === "countering"
      ? TEXT.hud.currentCounter(getPlayer(state.currentTurnId).name)
    : state.phase === "burying"
      ? TEXT.hud.currentBanker(getPlayer(state.bankerId).name)
    : state.phase === "callingFriend"
      ? TEXT.hud.currentBanker(getPlayer(state.bankerId).name)
    : state.phase === "ending"
      ? TEXT.hud.endingLeader
    : TEXT.hud.currentLeader(getPlayer(state.currentTurnId).name);
  dom.trumpLabel.textContent = state.declaration
    ? (state.declaration.source === "bottom"
      ? (state.declaration.suit === "notrump"
        ? TEXT.declarations.noTrumpByBottom
        : TEXT.declarations.suitByBottom(SUIT_LABEL[state.declaration.suit]))
      : (state.declaration.suit === "notrump"
        ? TEXT.declarations.noTrumpByCount(state.declaration.count)
        : TEXT.declarations.suitByCount(SUIT_LABEL[state.declaration.suit], state.declaration.rank, state.declaration.count)))
    : TEXT.declarations.notRevealed;
  dom.bankerLabel.textContent = state.phase === "ready"
    ? TEXT.hud.bankerWaiting
    : state.phase === "dealing"
    ? (state.declaration ? `暂定 ${getPlayer(state.declaration.playerId).name}` : (state.awaitingHumanDeclaration ? TEXT.hud.bankerAwaitHuman : TEXT.hud.bankerWaiting))
    : state.phase === "bottomReveal"
      ? TEXT.hud.bottomReveal
    : state.phase === "countering"
      ? TEXT.hud.countering
    : state.phase === "burying"
      ? TEXT.hud.burying
    : state.phase === "callingFriend"
      ? TEXT.hud.callingFriend
    : TEXT.hud.bankerSeat(state.bankerId);
  dom.trickLabel.textContent = state.phase === "ready"
    ? TEXT.hud.trickWaiting
    : state.phase === "dealing"
    ? (state.awaitingHumanDeclaration ? TEXT.hud.trickAwaitingHuman : TEXT.hud.trickDealingProgress(state.dealIndex, state.dealCards.length))
    : state.phase === "bottomReveal"
      ? TEXT.hud.trickBottomReveal
    : state.phase === "countering"
      ? TEXT.hud.trickCountering
    : state.phase === "burying"
      ? TEXT.hud.trickBurying
    : state.phase === "callingFriend"
      ? TEXT.hud.trickCallingFriend
    : state.phase === "ending"
      ? TEXT.hud.trickEnding
    : TEXT.hud.trickPlaying(state.trickNumber);
}

function renderScorePanel() {
  const visibleDefenderPoints = getVisibleDefenderPoints();
  dom.defenderScore.textContent = visibleDefenderPoints === null ? "--" : String(visibleDefenderPoints);
  dom.toggleLastTrickBtn.textContent = state.showLastTrick ? TEXT.buttons.toggleLastTrickClose : TEXT.buttons.toggleLastTrickOpen;
  if (dom.toggleCardFaceBtn) {
    dom.toggleCardFaceBtn.textContent = TEXT.buttons.cardFace(getCurrentCardFaceOption().label);
    dom.toggleCardFaceBtn.disabled = CARD_FACE_OPTIONS.length <= 1;
  }
  dom.turnTimer.textContent = (state.phase === "ready" || (state.phase === "dealing" && !state.awaitingHumanDeclaration) || state.phase === "callingFriend" || state.phase === "ending")
    ? "--"
    : String(Math.max(0, state.countdown));
  dom.timerHint.textContent = state.gameOver
    ? TEXT.scorePanel.ended
    : state.phase === "ready"
      ? getReadyStartMessage()
    : state.phase === "dealing"
      ? (state.awaitingHumanDeclaration
        ? TEXT.scorePanel.dealingAwaitHuman
        : TEXT.scorePanel.dealing)
      : state.phase === "bottomReveal"
        ? TEXT.scorePanel.bottomReveal(state.bottomRevealMessage)
      : state.phase === "countering"
        ? TEXT.scorePanel.countering(state.currentTurnId)
      : state.phase === "burying"
        ? (state.bankerId === 1 ? TEXT.scorePanel.buryingSelf : TEXT.scorePanel.buryingOther)
      : state.phase === "callingFriend"
        ? (state.bankerId === 1 ? TEXT.scorePanel.callingFriendSelf : TEXT.scorePanel.callingFriendOther)
      : state.phase === "ending"
        ? TEXT.scorePanel.ending
      : !state.friendTarget?.revealed
        ? TEXT.scorePanel.unresolvedFriend
        : state.phase === "pause"
          ? TEXT.scorePanel.pause
          : TEXT.scorePanel.currentTurn(state.currentTurnId);
  dom.toggleBottomBtn.disabled = !canHumanViewBottomCards();
  if (typeof syncAutoManagedButton === "function") {
    syncAutoManagedButton();
  }
}

function renderSeats() {
  for (const player of state.players) {
    const seat = document.getElementById(`playerSeat-${player.id}`);
    const role = getVisibleRole(player.id);
    const avatar = PLAYER_AVATARS[player.id];
    const showNoTrumpBadge = ["playing", "pause", "ending"].includes(state.phase)
      && player.hand.length > 0
      && !!state.exposedTrumpVoid[player.id];
    seat.classList.toggle("current-turn", player.id === state.currentTurnId && state.phase === "playing" && !state.gameOver);
    seat.classList.toggle("role-banker", role.kind === "banker");
    seat.innerHTML = `
      <div class="seat-top">
        <div class="avatar"><img src="${avatar.src}" alt="${avatar.label}" /></div>
        <div class="seat-copy">
          <div class="title">${player.name}</div>
          <div class="seat-meta">${player.isHuman ? TEXT.seat.selfControlled : TEXT.seat.aiControlled}</div>
          <div class="seat-level-row">
            <div class="seat-level">${TEXT.seat.levelLabel(player.level)}</div>
            ${showNoTrumpBadge ? `<span class="seat-no-trump" aria-label="${TEXT.cards.noTrumpBadgeAria}">🈚️</span>` : ""}
          </div>
        </div>
      </div>
      <div class="role-badge ${role.kind}">${role.label}</div>
      <div class="seat-stats">
        <div class="seat-metric">
          <span class="stat-label">${TEXT.seat.handCountLabel}</span>
          <strong class="seat-count">${player.hand.length}</strong>
        </div>
        <div class="seat-metric">
          <span class="stat-label">${TEXT.seat.personalScoreLabel}</span>
          <strong class="seat-score">${player.capturedPoints}</strong>
        </div>
      </div>
    `;
  }
}

function getVisibleRole(playerId) {
  if (state.phase === "ready") {
    return { kind: "unknown", label: TEXT.roles.ready };
  }
  if (state.phase === "dealing") {
    if (state.declaration && playerId === state.declaration.playerId) {
      return { kind: "banker", label: TEXT.roles.dealingBanker };
    }
    return { kind: "unknown", label: TEXT.roles.dealingWaiting };
  }
  if (state.phase === "countering") {
    if (state.declaration && playerId === state.declaration.playerId) {
      return { kind: "banker", label: TEXT.roles.counteringBanker };
    }
    return { kind: "unknown", label: TEXT.roles.counteringWaiting };
  }
  if (state.phase === "burying") {
    if (playerId === state.bankerId) {
      return { kind: "banker", label: TEXT.roles.buryingBanker };
    }
    return { kind: "unknown", label: TEXT.roles.buryingWaiting };
  }
  if (state.phase === "callingFriend") {
    if (playerId === state.bankerId) {
      return { kind: "banker", label: TEXT.roles.callingBanker };
    }
    return { kind: "unknown", label: TEXT.roles.callingWaiting };
  }
  if (playerId === state.bankerId) return { kind: "banker", label: TEXT.roles.banker };
  if (state.friendTarget?.failed) return { kind: "defender", label: TEXT.roles.defender };
  if (state.friendTarget?.revealed && playerId === state.friendTarget.revealedBy) {
    return { kind: "friend", label: TEXT.roles.friend };
  }
  if (state.friendTarget?.revealed) return { kind: "defender", label: TEXT.roles.defender };
  return { kind: "unknown", label: TEXT.roles.unknown };
}

function renderTrickSpots() {
  for (const player of state.players) {
    const spot = document.getElementById(`trickSpot-${player.id}`);
    const play = state.currentTrick.find((entry) => entry.playerId === player.id);
    const declarationCards = (state.phase === "dealing" || state.phase === "countering") && state.declaration && state.declaration.playerId === player.id
      ? getDeclarationCards(state.declaration)
      : [];
    const visibleCards = play?.cards || declarationCards;
    const zoomEnabled = !player.isHuman && visibleCards.length > 4;
    const cardsHtml = play
      ? play.cards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")
      : declarationCards.length > 0
        ? declarationCards.map((card) => buildCardNode(card, "played-card trump").outerHTML).join("")
        : "";
    const zoomHtml = zoomEnabled
      ? `
        <div class="spot-zoom" aria-hidden="true">
          ${visibleCards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")}
        </div>
      `
      : "";
    const emptyText = state.phase === "ready"
      ? TEXT.trickSpot.ready
      : (state.phase === "dealing" || state.phase === "countering")
      ? TEXT.trickSpot.dealing
      : state.phase === "bottomReveal"
        ? TEXT.trickSpot.bottomReveal
      : state.phase === "burying"
        ? TEXT.trickSpot.burying
      : state.phase === "callingFriend"
        ? TEXT.trickSpot.callingFriend
      : TEXT.trickSpot.default;
    spot.classList.toggle("current-turn", player.id === state.currentTurnId && state.phase === "playing" && !state.gameOver);
    spot.classList.toggle("zoomable", zoomEnabled);
    if (!zoomEnabled) {
      spot.classList.remove("show-zoom");
    }
    spot.innerHTML = `
      <div class="label">${player.id === 1 ? TEXT.trickSpot.self : TEXT.trickSpot.other(player.name)}</div>
      <div class="spot-row">
        ${cardsHtml || `<div class="empty-note">${emptyText}</div>`}
        ${zoomHtml}
      </div>
    `;
    spot.onclick = zoomEnabled
      ? (event) => {
        if (event.target.closest(".played-card")) return;
        for (const otherSpot of state.players.map((entry) => document.getElementById(`trickSpot-${entry.id}`))) {
          if (otherSpot && otherSpot !== spot) {
            otherSpot.classList.remove("show-zoom");
          }
        }
        spot.classList.toggle("show-zoom");
      }
      : null;
  }
}

function renderHand() {
  const human = getPlayer(1);
  if (state.phase === "ready") {
    dom.handSummary.textContent = `${getReadyStartMessage()} 你当前是 Lv:${human.level}。`;
  } else if (state.phase === "dealing") {
    const humanOptions = getDeclarationOptions(1);
    dom.handSummary.textContent = state.awaitingHumanDeclaration
      ? (humanOptions.length > 0
        ? TEXT.hand.dealingAwaitHuman(human.hand.length, Math.max(0, state.countdown), humanOptions.map((entry) => formatDeclaration(entry)))
        : TEXT.hand.dealingAwaitHumanNoOption(human.hand.length))
      : (humanOptions.length > 0
        ? TEXT.hand.dealingCanDeclare(human.hand.length, humanOptions.map((entry) => formatDeclaration(entry)))
        : TEXT.hand.dealingNoDeclare(human.hand.length, getLevelRank(human.level)));
  } else if (state.phase === "countering") {
    const counterOption = getCounterDeclarationForPlayer(1);
    dom.handSummary.textContent = counterOption
      ? TEXT.hand.counteringCan(human.hand.length, formatDeclaration(counterOption))
      : TEXT.hand.counteringCannot(human.hand.length);
  } else if (state.phase === "bottomReveal") {
    dom.handSummary.textContent = TEXT.hand.bottomReveal(human.hand.length);
  } else if (state.phase === "burying") {
    dom.handSummary.textContent = state.bankerId === 1
      ? TEXT.hand.buryingSelf(human.hand.length)
      : TEXT.hand.buryingOther(human.hand.length);
  } else if (state.phase === "callingFriend") {
    dom.handSummary.textContent = state.bankerId === 1
      ? TEXT.hand.callingFriendSelf(human.hand.length)
      : TEXT.hand.callingFriendOther(human.hand.length);
  } else {
    dom.handSummary.textContent = TEXT.hand.playing(human.hand.length);
  }
  const isSetupPhase = state.phase === "dealing" || state.phase === "countering" || state.phase === "burying";
  const specialLabel = isSetupPhase
    ? (state.declaration ? TEXT.hand.setupSpecialLabelWithTrump : TEXT.hand.setupSpecialLabelWithoutTrump)
    : TEXT.hand.specialLabelNormal;
  const setupLevelRank = getLevelRank(human.level);
  const groups = [
    { key: "trump", label: specialLabel, red: true },
    { key: "clubs", label: SUIT_LABEL.clubs, red: false },
    { key: "diamonds", label: SUIT_LABEL.diamonds, red: true },
    { key: "spades", label: SUIT_LABEL.spades, red: false },
    { key: "hearts", label: SUIT_LABEL.hearts, red: true },
  ];

  dom.handGroups.innerHTML = "";
  for (const group of groups) {
    const cards = human.hand.filter((card) => {
      if (group.key === "trump") {
        if (isSetupPhase && !state.declaration) {
          return card.suit === "joker" || card.rank === setupLevelRank;
        }
        return isTrump(card);
      }
      if (isSetupPhase && !state.declaration) {
        return card.suit === group.key && card.rank !== setupLevelRank;
      }
      return !isTrump(card) && card.suit === group.key;
    }).sort(compareHandCardsForDisplay);
    if (cards.length === 0) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "hand-group";
    const chip = document.createElement("div");
    chip.className = `group-chip${group.red ? " red" : ""}`;
    chip.textContent = group.label;
    wrapper.appendChild(chip);

    const row = document.createElement("div");
    row.className = "cards-row";
    for (const card of cards) {
      const button = buildCardNode(card, `card-btn${state.selectedCardIds.includes(card.id) ? " selected" : ""}${isTrump(card) ? " trump" : ""}`);
      button.type = "button";
      const canInteract = (state.phase === "playing" && isHumanTurnActive()) || (state.phase === "burying" && state.bankerId === 1);
      button.disabled = !canInteract;
      if (canInteract) {
        const eventName = APP_PLATFORM === "mobile" ? "pointerup" : "click";
        button.addEventListener(eventName, (event) => {
          event.preventDefault();
          toggleSelection(card.id);
        });
      }
      row.appendChild(button);
    }
    wrapper.appendChild(row);
    dom.handGroups.appendChild(wrapper);
  }
}

function buildCardNode(card, className) {
  const node = document.createElement("button");
  node.className = className;
  node.setAttribute("aria-label", shortCardLabel(card));
  const image = document.createElement("img");
  image.src = resolveCardImage(card);
  image.alt = shortCardLabel(card);
  node.appendChild(image);
  return node;
}

function toggleSelection(cardId) {
  if (!isHumanTurnActive() && !(state.phase === "burying" && state.bankerId === 1)) return;
  if (state.selectedCardIds.includes(cardId)) {
    state.selectedCardIds = state.selectedCardIds.filter((id) => id !== cardId);
  } else {
    state.selectedCardIds = [...state.selectedCardIds, cardId];
  }
  renderHand();
  renderCenterPanel();
  updateActionHint();
}

function updateActionHint() {
  if (state.phase === "ready") {
    dom.actionHint.textContent = "开始游戏将从2重新开始。继续游戏可继续之前的级别。";
    return;
  }
  if (state.phase === "dealing") {
    const best = getBestDeclarationForPlayer(1);
    if (state.awaitingHumanDeclaration) {
      dom.actionHint.textContent = best && canOverrideDeclaration(best)
        ? TEXT.actionHint.dealingAwaitHuman(Math.max(0, state.countdown), formatDeclaration(best))
        : TEXT.actionHint.dealingAwaitHumanNoOption;
      return;
    }
    if (best && canOverrideDeclaration(best)) {
      dom.actionHint.textContent = TEXT.actionHint.dealingCanDeclare(formatDeclaration(best));
      return;
    }
    dom.actionHint.textContent = TEXT.actionHint.dealing;
    return;
  }

  if (state.phase === "bottomReveal") {
    dom.actionHint.textContent = TEXT.actionHint.bottomReveal;
    return;
  }

  if (state.phase === "countering") {
    const counterOption = getCounterDeclarationForPlayer(1);
    if (state.currentTurnId !== 1) {
      dom.actionHint.textContent = TEXT.actionHint.counteringWait(state.currentTurnId);
      return;
    }
    dom.actionHint.textContent = counterOption
      ? TEXT.actionHint.counteringCan(formatDeclaration(counterOption))
      : TEXT.actionHint.counteringCannot;
    return;
  }

  if (state.phase === "burying") {
    if (state.bankerId !== 1) {
      dom.actionHint.textContent = TEXT.actionHint.buryingWait;
      return;
    }
    dom.actionHint.textContent = state.selectedCardIds.length === 7
      ? TEXT.actionHint.buryingReady
      : TEXT.actionHint.buryingPicking(state.selectedCardIds.length);
    return;
  }

  if (state.phase === "callingFriend") {
    dom.actionHint.textContent = state.bankerId === 1
      ? TEXT.actionHint.callingFriendSelf
      : TEXT.actionHint.callingFriendOther;
    return;
  }

  if (state.phase === "ending") {
    dom.actionHint.textContent = TEXT.actionHint.ending;
    return;
  }

  const selected = state.selectedCardIds
    .map((id) => getPlayer(1).hand.find((card) => card.id === id))
    .filter(Boolean);
  if (doesSelectionBeatCurrent(1, selected)) {
    dom.actionHint.textContent = TEXT.actionHint.beatReady(selected.map(shortCardLabel));
    return;
  }
  if (selected.length === 0) {
    dom.actionHint.textContent = TEXT.actionHint.playingIdle;
    return;
  }
  const validation = validateSelection(1, selected);
  dom.actionHint.textContent = validation.ok
    ? TEXT.actionHint.selectionValid(selected.map(shortCardLabel))
    : validation.reason;
}

function renderLastTrick() {
  dom.lastTrickPanel.classList.toggle("hidden", !state.showLastTrick);
  if (!state.lastTrick) {
    dom.lastTrickMeta.textContent = TEXT.lastTrick.empty;
    dom.lastTrickCards.innerHTML = "";
    return;
  }
  dom.lastTrickMeta.textContent = TEXT.lastTrick.meta(state.lastTrick.trickNumber, getPlayer(state.lastTrick.winnerId).name, state.lastTrick.points);
  dom.lastTrickCards.innerHTML = state.lastTrick.plays
    .map((play) => `
      <div style="margin-top:10px;">
        <div class="subtle">${getPlayer(play.playerId).name}</div>
        <div class="spot-row" style="min-height:70px; margin-top:6px;">
          ${play.cards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")}
        </div>
      </div>
    `)
    .join("");
}

function getFriendPickerRanksForSuit(suit) {
  if (suit === "joker") {
    return [
      { value: "RJ", label: TEXT.cards.bigJoker },
      { value: "BJ", label: TEXT.cards.smallJoker },
    ];
  }
  return [...RANKS]
    .reverse()
    .map((rank) => ({ value: rank, label: rank }));
}

function renderFriendPicker() {
  const visible = state.phase === "callingFriend" && state.bankerId === 1 && !state.gameOver;
  dom.friendPickerPanel.classList.toggle("hidden", !visible);
  if (!visible) return;

  const suitOptions = TEXT.friendPicker.suitOptions;
  const occurrenceOptions = TEXT.friendPicker.occurrenceOptions;
  const suitGlyphMap = {
    hearts: { glyph: "♥", tone: "red" },
    spades: { glyph: "♠", tone: "black" },
    diamonds: { glyph: "♦", tone: "red" },
    clubs: { glyph: "♣", tone: "black" },
    joker: { glyph: "王", tone: "gold" },
  };
  const rankOptions = getFriendPickerRanksForSuit(state.selectedFriendSuit);
  if (!rankOptions.some((entry) => entry.value === state.selectedFriendRank)) {
    state.selectedFriendRank = rankOptions[0]?.value || "A";
  }
  const previewTarget = buildFriendTarget({
    occurrence: state.selectedFriendOccurrence,
    suit: state.selectedFriendSuit,
    rank: state.selectedFriendRank,
  });

  dom.friendPickerHint.textContent = TEXT.friend.pickerHint;
  dom.friendOccurrenceOptions.innerHTML = occurrenceOptions
    .map((option) => `<button type="button" class="tiny-btn${state.selectedFriendOccurrence === option.value ? " alert" : ""}" data-friend-occurrence="${option.value}">${option.label}</button>`)
    .join("");
  dom.friendSuitOptions.innerHTML = suitOptions
    .map((option) => {
      const glyph = suitGlyphMap[option.value] || { glyph: option.label, tone: "black" };
      return `<button type="button" class="tiny-btn friend-suit-btn${state.selectedFriendSuit === option.value ? " alert" : ""}" data-friend-suit="${option.value}" aria-label="${option.label}">
        <span class="friend-picker-suit-glyph ${glyph.tone}">${glyph.glyph}</span>
      </button>`;
    })
    .join("");
  dom.friendRankOptions.innerHTML = rankOptions
    .map((option) => `<button type="button" class="tiny-btn friend-rank-btn${state.selectedFriendRank === option.value ? " alert" : ""}" data-friend-rank="${option.value}">${option.label}</button>`)
    .join("");
  dom.friendPickerPreview.innerHTML = `
    <div class="subtle">${TEXT.friend.pickerPreview(previewTarget.label)}</div>
    <div>${buildCardNode(previewTarget, "friend-card").outerHTML}</div>
  `;
}

function renderLogs() {
  dom.logPanel.classList.toggle("hidden", !state.showLogPanel);
  dom.bottomPanel.classList.toggle("hidden", !state.showBottomPanel);
  dom.rulesPanel.classList.toggle("hidden", !state.showRulesPanel);
  dom.logList.innerHTML = state.logs.map((item) => `<li>${item}</li>`).join("");
}

function renderDebugPanel() {
  if (!dom.debugPanel || !dom.toggleDebugBtn || !dom.debugPlayerTabs || !dom.debugHandMeta || !dom.debugHandCards) return;

  const isPc = APP_PLATFORM === "pc";
  const visible = isPc && !!state.showDebugPanel;
  const selectedPlayerId = PLAYER_ORDER.includes(state.selectedDebugPlayerId) && state.selectedDebugPlayerId !== 1
    ? state.selectedDebugPlayerId
    : 2;
  const player = getPlayer(selectedPlayerId);

  dom.toggleDebugBtn.hidden = !isPc;
  dom.toggleDebugBtn.classList.toggle("alert", visible);
  dom.toggleDebugBtn.textContent = TEXT.buttons.debug;
  dom.debugPanel.classList.toggle("hidden", !visible);

  dom.debugPlayerTabs.innerHTML = PLAYER_ORDER
    .filter((playerId) => playerId !== 1)
    .map((playerId) => `<button type="button" class="tiny-btn${selectedPlayerId === playerId ? " alert" : ""}" data-debug-player="${playerId}">玩家${playerId}</button>`)
    .join("");

  if (!player) {
    dom.debugHandMeta.textContent = TEXT.debug.empty;
    dom.debugHandCards.innerHTML = `<div class="empty-note">${TEXT.debug.empty}</div>`;
    return;
  }

  const isSetupPhase = state.phase === "dealing" || state.phase === "countering" || state.phase === "burying";
  const specialLabel = isSetupPhase
    ? (state.declaration ? TEXT.hand.setupSpecialLabelWithTrump : TEXT.hand.setupSpecialLabelWithoutTrump)
    : TEXT.hand.specialLabelNormal;
  const setupLevelRank = getLevelRank(player.level);
  const groups = [
    { key: "trump", label: specialLabel, red: true },
    { key: "clubs", label: SUIT_LABEL.clubs, red: false },
    { key: "diamonds", label: SUIT_LABEL.diamonds, red: true },
    { key: "spades", label: SUIT_LABEL.spades, red: false },
    { key: "hearts", label: SUIT_LABEL.hearts, red: true },
  ];

  dom.debugHandMeta.textContent = TEXT.debug.handCount(player.name, player.hand.length);
  dom.debugHandCards.innerHTML = groups
    .map((group) => {
      const cards = player.hand.filter((card) => {
        if (group.key === "trump") {
          if (isSetupPhase && !state.declaration) {
            return card.suit === "joker" || card.rank === setupLevelRank;
          }
          return isTrump(card);
        }
        if (isSetupPhase && !state.declaration) {
          return card.suit === group.key && card.rank !== setupLevelRank;
        }
        return !isTrump(card) && card.suit === group.key;
      }).sort(compareHandCardsForDisplay);
      if (cards.length === 0) return "";
      return `
        <div class="debug-hand-group">
          <div class="group-chip${group.red ? " red" : ""}">${group.label}</div>
          <div class="debug-cards-row">
            ${cards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")}
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("") || `<div class="empty-note">${TEXT.debug.empty}</div>`;
}

function renderCenterPanel() {
  const humanDeclaration = getBestDeclarationForPlayer(1);
  const humanCounter = getCounterDeclarationForPlayer(1);
  const isOpeningPhase = state.phase === "dealing" || state.phase === "countering";
  const canDeclareNow = state.phase === "dealing"
    ? canOverrideDeclaration(humanDeclaration)
    : state.phase === "countering"
      ? state.currentTurnId === 1 && !!humanCounter
      : false;
  const selected = state.selectedCardIds
    .map((id) => getPlayer(1).hand.find((card) => card.id === id))
    .filter(Boolean);
  const selectionValid = state.phase === "burying"
    ? selected.length === 7
    : selected.length > 0 && validateSelection(1, selected).ok;
  const selectedBeat = state.phase === "playing" && selectionValid && doesSelectionBeatCurrent(1, selected);
  const humanCanBury = state.phase === "burying" && state.bankerId === 1;
  const friendCallingPhase = state.phase === "callingFriend";
  dom.centerTag.textContent = state.gameOver
    ? TEXT.phase.gameOver
    : state.phase === "ready"
      ? TEXT.phase.ready
    : state.phase === "dealing"
      ? TEXT.phase.centerDealing
    : state.phase === "bottomReveal"
      ? TEXT.phase.centerBottomReveal
    : state.phase === "countering"
      ? TEXT.phase.countering
    : state.phase === "burying"
      ? TEXT.phase.centerBurying
    : state.phase === "callingFriend"
      ? TEXT.phase.centerCallingFriend
    : state.phase === "ending"
      ? TEXT.phase.gameOver
    : state.phase === "pause"
      ? TEXT.phase.centerPause
      : `${getPlayer(state.currentTurnId).name} 行动中`;
  dom.focusAnnouncement.textContent = state.centerAnnouncement?.message || "";
  dom.focusAnnouncement.classList.toggle("show", !!state.centerAnnouncement);
  dom.focusAnnouncement.classList.toggle("strong", state.centerAnnouncement?.tone === "strong");
  dom.focusAnnouncement.classList.toggle("ally", state.centerAnnouncement?.tone === "ally");
  dom.focusAnnouncement.classList.toggle("friend", state.centerAnnouncement?.tone === "friend");
  updateActionHint();
  const humanTurn = isHumanTurnActive();
  dom.beatBtn.hidden = state.phase !== "playing" || !selectedBeat;
  dom.beatBtn.disabled = !humanTurn || !selectedBeat;
  if (dom.autoManagedBtn) {
    dom.autoManagedBtn.hidden = state.phase === "ready";
    dom.autoManagedBtn.disabled = state.gameOver || state.phase === "ready";
    dom.autoManagedBtn.textContent = TEXT.buttons.autoManage;
  }
  if (dom.toggleDebugBtn) {
    dom.toggleDebugBtn.textContent = TEXT.buttons.debug;
  }
  dom.hintBtn.hidden = isOpeningPhase || state.phase === "ready" || state.phase === "bottomReveal" || friendCallingPhase || (state.phase === "burying" && !humanCanBury);
  dom.playBtn.hidden = isOpeningPhase || state.phase === "ready" || state.phase === "bottomReveal" || friendCallingPhase || (state.phase === "burying" && !humanCanBury);
  dom.playBtn.textContent = state.phase === "burying" ? TEXT.buttons.bury : TEXT.buttons.play;
  dom.playBtn.disabled = state.phase === "burying"
    ? state.gameOver || state.bankerId !== 1 || !selectionValid
    : !humanTurn || !selectionValid;
  dom.hintBtn.disabled = state.selectedCardIds.length > 0
    ? false
    : state.phase === "burying"
      ? state.bankerId !== 1
      : !humanTurn;
  dom.hintBtn.textContent = state.selectedCardIds.length > 0
    ? TEXT.buttons.cancelSelection
    : state.phase === "burying"
      ? TEXT.buttons.buryPickSeven
      : TEXT.buttons.select;
  if (state.phase === "countering") {
    dom.declareBtn.textContent = humanCounter
      ? (humanCounter.suit === "notrump"
        ? getNoTrumpCounterLabel(humanCounter)
        : `反${getActionSuitLabel(humanCounter)} ${humanCounter.count}张`)
      : TEXT.buttons.counter;
  } else if (state.phase === "dealing") {
    if (humanDeclaration) {
      dom.declareBtn.textContent = humanDeclaration.suit === "notrump"
        ? (state.declaration ? `抢亮${getNoTrumpDeclarationLabel(humanDeclaration)}无主` : `亮${getNoTrumpDeclarationLabel(humanDeclaration)}无主`)
        : (state.declaration
          ? `抢亮${getActionSuitLabel(humanDeclaration)} ${humanDeclaration.count}张`
          : `亮${getActionSuitLabel(humanDeclaration)} ${humanDeclaration.count}张`);
    } else {
      dom.declareBtn.textContent = state.declaration ? TEXT.buttons.redeclare : TEXT.buttons.declare;
    }
  } else {
    dom.declareBtn.textContent = TEXT.buttons.declare;
  }
  dom.declareBtn.hidden = !isOpeningPhase;
  dom.declareBtn.disabled = state.gameOver || !canDeclareNow;
  dom.declareBtn.classList.toggle("primary", canDeclareNow);
  dom.passCounterBtn.disabled = state.gameOver || state.phase !== "countering" || state.currentTurnId !== 1;
  dom.passCounterBtn.hidden = state.phase !== "countering" || state.currentTurnId !== 1;
  dom.newProgressBtn.hidden = true;
  dom.newProgressBtn.disabled = true;
  dom.newProgressBtn.classList.remove("primary");
  dom.continueGameBtn.hidden = state.phase !== "ready";
  dom.continueGameBtn.disabled = state.gameOver || state.phase !== "ready" || !state.hasSavedProgress;
  dom.continueGameBtn.classList.toggle("primary", false);
  dom.continueGameBtn.textContent = "继续游戏";
  dom.startGameBtn.hidden = state.phase !== "ready";
  dom.startGameBtn.disabled = state.gameOver || state.phase !== "ready";
  dom.startGameBtn.textContent = "开始游戏";
}
