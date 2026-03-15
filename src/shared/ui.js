// 渲染当前界面并同步对外快照。
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
    aiDifficulty: state.aiDifficulty,
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

// 渲染底牌面板。
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

/**
 * 作用：
 * 读取当前翻底阶段真正已经翻开的底牌数量。
 *
 * 为什么这样写：
 * 翻底展示既要保留所有底牌卡位，又只能公开已经翻开的那一部分；
 * 统一在这里裁剪数量，可以让渲染层和规则层只通过一个字段协作。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态。
 *
 * 输出：
 * @returns {number} 当前应当显示正面的底牌张数。
 *
 * 注意：
 * - 返回值会被限制在 `0 ~ state.bottomCards.length` 范围内。
 * - 正常翻底流程优先使用 `state.bottomRevealCount`，没有时才回退到声明对象里的记录。
 */
function getBottomRevealVisibleCount() {
  const rawCount = state.bottomRevealCount || state.declaration?.revealCount || 0;
  return Math.max(0, Math.min(state.bottomCards.length, rawCount));
}

/**
 * 作用：
 * 为展示场景创建一张只读的明牌节点。
 *
 * 为什么这样写：
 * 翻底公示区不需要按钮交互，但仍要复用现有牌面图片与主牌描边样式，
 * 单独创建展示节点可以避免把交互态按钮样式带进公示区。
 *
 * 输入：
 * @param {object} card - 要显示的牌对象。
 * @param {string} className - 追加到节点上的样式类名。
 *
 * 输出：
 * @returns {HTMLDivElement} 一张只负责展示的牌面节点。
 *
 * 注意：
 * - 该节点仅用于展示，不要绑定点击事件。
 * - `aria-label` 需要保留，方便辅助技术描述当前牌面。
 */
function buildDisplayCardNode(card, className) {
  const node = document.createElement("div");
  node.className = className;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", shortCardLabel(card));
  const image = document.createElement("img");
  image.src = resolveCardImage(card);
  image.alt = shortCardLabel(card);
  node.appendChild(image);
  return node;
}

/**
 * 作用：
 * 创建翻底公示里尚未翻开的底牌背面节点。
 *
 * 为什么这样写：
 * 用户希望公示区继续保留 7 张底牌的位置，但未翻开的牌必须显示背面，
 * 这样才能同时体现翻牌顺序和“翻到即停”的规则。
 *
 * 输入：
 * @param {string} className - 追加到节点上的样式类名。
 * @param {string} ariaLabel - 给辅助技术使用的描述文案。
 *
 * 输出：
 * @returns {HTMLDivElement} 一张仅显示牌背的只读节点。
 *
 * 注意：
 * - 这里不依赖单独的牌背图片，避免不同牌面主题下资源不齐导致缺图。
 * - 视觉样式全部交给 `.face-down` 相关 CSS 控制。
 */
function buildFaceDownDisplayCardNode(className, ariaLabel) {
  const node = document.createElement("div");
  node.className = className;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", ariaLabel);
  const core = document.createElement("span");
  core.className = "face-down-core";
  node.appendChild(core);
  return node;
}

/**
 * 作用：
 * 生成翻底公示区单个卡位节点，包含顺序号和牌面/牌背。
 *
 * 为什么这样写：
 * 顺序号和牌本体需要一起布局，单独封装成 slot 后，
 * 就能稳定地实现“前几张翻正面、后几张保留背面”的表现。
 *
 * 输入：
 * @param {object} card - 当前卡位对应的底牌。
 * @param {number} index - 当前卡位在底牌序列中的 0 基索引。
 * @param {number} revealedCount - 当前已经翻开的底牌张数。
 *
 * 输出：
 * @returns {HTMLDivElement} 可直接挂到翻底展示容器里的卡位节点。
 *
 * 注意：
 * - 顺序号采用 1 基展示，和玩家口头描述一致。
 * - 只有 `index < revealedCount` 的卡位才会显示正面。
 */
function buildBottomRevealSlotNode(card, index, revealedCount) {
  const slot = document.createElement("div");
  slot.className = "bottom-reveal-slot";

  const orderBadge = document.createElement("span");
  orderBadge.className = "bottom-reveal-order";
  orderBadge.textContent = String(index + 1);
  slot.appendChild(orderBadge);

  const cardNode = index < revealedCount
    ? buildDisplayCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`)
    : buildFaceDownDisplayCardNode("played-card face-down", `第 ${index + 1} 张底牌尚未翻开`);
  slot.appendChild(cardNode);

  return slot;
}

/**
 * 作用：
 * 渲染翻底定主阶段的中央提示区。
 *
 * 为什么这样写：
 * 翻底公示既要同步结算文案和倒计时，也要把“已翻开”和“未翻开”的底牌状态一起呈现给玩家。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态并写入 DOM。
 *
 * 输出：
 * @returns {void} 只更新界面，不返回额外结果。
 *
 * 注意：
 * - 离开 `bottomReveal` 阶段后应立即隐藏整个公示区。
 * - 渲染时必须保留底牌原始顺序，不能排序。
 */
function renderBottomRevealCenter() {
  const showBottomReveal = state.phase === "bottomReveal";
  dom.bottomRevealCenter.classList.toggle("hidden", !showBottomReveal);
  if (!showBottomReveal) return;

  dom.bottomRevealText.textContent = state.bottomRevealMessage || TEXT.bottom.revealFallback;
  dom.bottomRevealTimer.textContent = String(Math.max(0, state.countdown || 0));
  dom.bottomRevealCards.innerHTML = "";
  const revealedCount = getBottomRevealVisibleCount();
  for (let index = 0; index < state.bottomCards.length; index += 1) {
    dom.bottomRevealCards.appendChild(buildBottomRevealSlotNode(state.bottomCards[index], index, revealedCount));
  }
}

// 渲染结算结果底牌。
function renderResultBottomCards() {
  dom.resultBottomCards.innerHTML = state.bottomCards
    .map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML)
    .join("");
}

// 渲染朋友面板。
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

// 渲染顶部信息栏和阶段信息。
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

// 渲染分数面板。
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
  const showBottomButton = typeof shouldShowHumanBottomButton === "function" ? shouldShowHumanBottomButton() : canHumanViewBottomCards();
  dom.toggleBottomBtn.hidden = !showBottomButton;
  dom.toggleBottomBtn.disabled = !showBottomButton;
  dom.toggleBottomBtn.classList.toggle("alert", showBottomButton);
  if (typeof syncAutoManagedButton === "function") {
    syncAutoManagedButton();
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("fivefriends:scorepanel"));
  }
}

// 渲染五个玩家座位信息。
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

// 返回当前对玩家可见的身份文案。
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

// 渲染当前一墩中各玩家的出牌位置。
function renderTrickSpots() {
  // 当前墩的实时赢家，用来在桌面出牌区打“大”角标。
  const winningPlay = state.phase === "playing" && typeof getCurrentWinningPlay === "function"
    ? getCurrentWinningPlay()
    : null;
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
    // 桌面端沿用和手机版一致的两枚角标：右上“大”、左下“无”。
    const showNoTrumpBadge = APP_PLATFORM !== "mobile"
      && ["playing", "pause", "ending"].includes(state.phase)
      && player.hand.length > 0
      && !!state.exposedTrumpVoid[player.id];
    const winningBadge = APP_PLATFORM !== "mobile" && winningPlay?.playerId === player.id
      ? '<span class="spot-winning-badge" aria-label="本轮当前最大">大</span>'
      : "";
    const noTrumpBadge = showNoTrumpBadge
      ? '<span class="spot-no-trump-badge" aria-label="无主牌">无</span>'
      : "";
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
      ${winningBadge}
      ${noTrumpBadge}
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

// 渲染手牌。
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
    wrapper.dataset.groupKey = group.key;
    const chip = document.createElement("div");
    chip.className = `group-chip${group.red ? " red" : ""}`;
    chip.textContent = group.label;
    wrapper.appendChild(chip);

    const row = document.createElement("div");
    row.className = "cards-row";
    row.dataset.cardCount = String(cards.length);
    const extraCards = Math.max(0, cards.length - 13);
    const overlap = Math.min(16, 8 + extraCards * 0.7);
    row.style.setProperty("--mobile-card-overlap", overlap.toFixed(1));
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

// 创建单张牌对应的 DOM 节点。
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

// 切换一张牌的选中状态。
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

// 更新当前操作提示文案。
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
    if (state.selectedCardIds.length !== 7) {
      dom.actionHint.textContent = TEXT.actionHint.buryingPicking(state.selectedCardIds.length);
      return;
    }
    const selected = state.selectedCardIds
      .map((id) => getPlayer(1).hand.find((card) => card.id === id))
      .filter(Boolean);
    const buryValidation = validateBurySelection(selected);
    dom.actionHint.textContent = buryValidation.ok
      ? TEXT.actionHint.buryingReady
      : buryValidation.reason;
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

// 渲染上一墩回顾内容。
function renderLastTrick() {
  dom.lastTrickPanel.classList.toggle("hidden", !state.showLastTrick);
  if (!state.lastTrick) {
    dom.lastTrickMeta.textContent = TEXT.lastTrick.empty;
    dom.lastTrickCards.innerHTML = "";
    return;
  }
  dom.lastTrickMeta.textContent = TEXT.lastTrick.meta(state.lastTrick.trickNumber, getPlayer(state.lastTrick.winnerId).name, state.lastTrick.points);
  dom.lastTrickCards.innerHTML = state.lastTrick.plays
    .map((play) => {
      const player = getPlayer(play.playerId);
      const role = getVisibleRole(play.playerId);
      const roleBadge = role?.label
        ? `<span class="role-badge ${role.kind || "unknown"}">${role.label}</span>`
        : "";
      return `
      <div class="last-trick-entry" style="margin-top:10px;">
        <div class="last-trick-entry-head">
          <div class="subtle last-trick-entry-name">${player.name}</div>
          ${roleBadge}
        </div>
        <div class="spot-row" style="min-height:70px; margin-top:6px;">
          ${play.cards.map((card) => buildCardNode(card, `played-card${isTrump(card) ? " trump" : ""}`).outerHTML).join("")}
        </div>
      </div>
    `;
    })
    .join("");
}

// 获取花色对应的叫朋友点数选项。
function getFriendPickerRanksForSuit(suit) {
  if (suit === "joker") {
    return [
      { value: "RJ", label: TEXT.cards.bigJoker },
      { value: "BJ", label: TEXT.cards.smallJoker },
    ];
  }
  const levelRank = getCurrentLevelRank();
  return [...RANKS]
    .reverse()
    .filter((rank) => !(levelRank && rank === levelRank && suit !== state.trumpSuit))
    .map((rank) => ({ value: rank, label: rank }));
}

// 渲染朋友选择器。
function renderFriendPicker() {
  const visible = state.phase === "callingFriend" && state.bankerId === 1 && !state.gameOver;
  dom.friendPickerPanel.classList.toggle("hidden", !visible);
  if (!visible) return;

  const recommendation = typeof getFriendPickerRecommendation === "function"
    ? getFriendPickerRecommendation()
    : null;
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

  dom.friendPickerHint.textContent = recommendation
    ? `已按你扣下的牌和当前剩余手牌，默认推荐 ${recommendation.target.label}。${recommendation.reason}`
    : TEXT.friend.pickerHint;
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
  if (dom.autoFriendBtn) {
    dom.autoFriendBtn.textContent = recommendation ? `用推荐：${recommendation.target.label}` : "用推荐";
  }
}

// 渲染信息日志列表。
function renderLogs() {
  dom.logPanel.classList.toggle("hidden", !state.showLogPanel);
  dom.bottomPanel.classList.toggle("hidden", !state.showBottomPanel);
  dom.rulesPanel.classList.toggle("hidden", !state.showRulesPanel);
  dom.logList.innerHTML = state.logs.map((item) => `<li>${item}</li>`).join("");
}

// 渲染调试面板。
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
    if (dom.debugDecisionMeta) dom.debugDecisionMeta.textContent = TEXT.debug.noDecision;
    if (dom.debugDecisionPrevBtn) {
      dom.debugDecisionPrevBtn.textContent = TEXT.debug.decisionPrev;
      dom.debugDecisionPrevBtn.disabled = true;
    }
    if (dom.debugDecisionNextBtn) {
      dom.debugDecisionNextBtn.textContent = TEXT.debug.decisionNext;
      dom.debugDecisionNextBtn.disabled = true;
    }
    if (dom.debugDecisionIndex) dom.debugDecisionIndex.textContent = TEXT.debug.decisionHistoryIndex(0, 0);
    if (dom.debugDecisionCards) dom.debugDecisionCards.innerHTML = `<div class="empty-note">${TEXT.debug.noDecision}</div>`;
    if (dom.debugDecisionList) dom.debugDecisionList.innerHTML = "";
    dom.debugHandCards.innerHTML = `<div class="empty-note">${TEXT.debug.empty}</div>`;
    return;
  }

  renderDebugDecisionPanel(player);

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

function formatDebugCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return "无";
  return cards.map((card) => shortCardLabel(card)).join("、");
}

function formatDebugNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return String(Math.round(value * 100) / 100);
}

function getDebugDecisionHistoryForPlayer(playerId) {
  return (state.aiDecisionHistory || []).filter((entry) => entry.playerId === playerId);
}

function renderDebugDecisionPanel(player) {
  if (!dom.debugDecisionMeta || !dom.debugDecisionCards || !dom.debugDecisionList) return;

  const decisions = getDebugDecisionHistoryForPlayer(player.id);
  const maxOffset = Math.max(0, decisions.length - 1);
  const rawOffset = state.selectedDebugDecisionOffsets?.[player.id] || 0;
  const offset = Math.min(Math.max(rawOffset, 0), maxOffset);
  if (state.selectedDebugDecisionOffsets) {
    state.selectedDebugDecisionOffsets[player.id] = offset;
  }
  const decision = decisions[decisions.length - 1 - offset] || null;
  if (dom.debugDecisionPrevBtn) {
    dom.debugDecisionPrevBtn.textContent = TEXT.debug.decisionPrev;
    dom.debugDecisionPrevBtn.disabled = decisions.length === 0 || offset >= maxOffset;
  }
  if (dom.debugDecisionNextBtn) {
    dom.debugDecisionNextBtn.textContent = TEXT.debug.decisionNext;
    dom.debugDecisionNextBtn.disabled = decisions.length === 0 || offset <= 0;
  }
  if (dom.debugDecisionIndex) {
    dom.debugDecisionIndex.textContent = decisions.length === 0
      ? TEXT.debug.decisionHistoryIndex(0, 0)
      : TEXT.debug.decisionHistoryIndex(offset + 1, decisions.length);
  }
  if (!decision) {
    dom.debugDecisionMeta.textContent = TEXT.debug.noDecision;
    dom.debugDecisionCards.innerHTML = `<div class="empty-note">${TEXT.debug.noDecision}</div>`;
    dom.debugDecisionList.innerHTML = "";
    return;
  }

  const primary = decision.objective?.primary || "--";
  const secondary = decision.objective?.secondary || "--";
  const selectedCards = formatDebugCards(decision.selectedCards);
  const stats = decision.debugStats || {};
  const candidateEntries = Array.isArray(decision.candidateEntries) ? decision.candidateEntries.slice(0, 5) : [];

  dom.debugDecisionMeta.textContent = TEXT.debug.latestDecision(
    player.name,
    decision.mode,
    primary,
    secondary,
    decision.recordedAtTrickNumber
  );
  dom.debugDecisionCards.innerHTML = `
    <div class="debug-decision-summary">
      <div class="debug-summary-line">${TEXT.debug.selectedCards(selectedCards)}</div>
      <div class="debug-summary-line subtle">${TEXT.debug.decisionStats(
        formatDebugNumber(decision.decisionTimeMs),
        stats.candidateCount ?? 0,
        stats.maxRolloutDepth ?? 0,
        stats.extendedRolloutCount ?? 0
      )}</div>
    </div>
  `;

  dom.debugDecisionList.innerHTML = candidateEntries.map((entry, index) => {
    const tags = Array.isArray(entry.tags) && entry.tags.length > 0 ? entry.tags.join(" / ") : "";
    const triggerFlags = Array.isArray(entry.rolloutTriggerFlags) && entry.rolloutTriggerFlags.length > 0
      ? entry.rolloutTriggerFlags.join(" / ")
      : "无特殊触发";
    const rolloutEval = entry.rolloutEvaluation;
    const futureEval = entry.rolloutFutureEvaluation;
    const selected = decision.selectedCards && getComboKey(decision.selectedCards) === getComboKey(entry.cards);
    return `
      <div class="debug-candidate${selected ? " selected" : ""}">
        <div class="debug-candidate-head">
          <strong>${TEXT.debug.candidateTitle(index + 1, formatDebugNumber(entry.score))}</strong>
          ${selected ? '<span class="group-chip red">已选</span>' : ""}
        </div>
        <div class="subtle">${TEXT.debug.candidateMeta(entry.source || "--", tags)}</div>
        <div class="debug-summary-line">${formatDebugCards(entry.cards)}</div>
        <div class="subtle">${TEXT.debug.candidateScores(
          formatDebugNumber(entry.heuristicScore),
          formatDebugNumber(entry.rolloutScore),
          formatDebugNumber(entry.rolloutFutureDelta)
        )}</div>
        <div class="subtle">${TEXT.debug.candidateRollout(entry.rolloutDepth ?? 0, triggerFlags)}</div>
        <div class="debug-breakdown-row">
          <span>${TEXT.debug.evaluationSummary(
            formatDebugNumber(rolloutEval?.total),
            rolloutEval?.objective?.primary || "--",
            rolloutEval?.objective?.secondary || "--"
          )}</span>
        </div>
        <div class="debug-breakdown-grid">
          ${Object.entries(rolloutEval?.breakdown || {}).map(([key, value]) => `<span>${key}: ${formatDebugNumber(value)}</span>`).join("")}
        </div>
        ${futureEval ? `
          <div class="debug-breakdown-row subtle">
            <span>${TEXT.debug.evaluationSummary(
              formatDebugNumber(futureEval.total),
              futureEval.objective?.primary || "--",
              futureEval.objective?.secondary || "--"
            )}</span>
          </div>
        ` : ""}
      </div>
    `;
  }).join("") || `<div class="empty-note">${TEXT.debug.noDecision}</div>`;
}

// 渲染中央操作面板内容。
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
    ? validateBurySelection(selected).ok
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
  const showPassCounterBtn = state.phase === "countering" && state.currentTurnId === 1 && !!humanCounter;
  dom.passCounterBtn.disabled = state.gameOver || !showPassCounterBtn;
  dom.passCounterBtn.hidden = !showPassCounterBtn;
  if (dom.setupOptions) {
    dom.setupOptions.hidden = true;
  }
  if (dom.aiDifficultySelect) {
    dom.aiDifficultySelect.value = AI_DIFFICULTY_OPTIONS.some((option) => option.value === state.aiDifficulty)
      ? state.aiDifficulty
      : DEFAULT_AI_DIFFICULTY;
    dom.aiDifficultySelect.disabled = state.gameOver || state.phase !== "ready";
  }
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
