// 渲染当前界面并同步对外快照。
function render() {
  renderFriendPanel();
  renderHud();
  renderScorePanel();
  renderToolbarMenu();
  renderStartLobby();
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
    aiPace: state.aiPace,
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

/**
 * 作用：
 * 把身份状态映射成桌面端使用的图标徽标数据。
 *
 * 为什么这样写：
 * 玩家面板、手牌头部和出牌区都会共享同一组 `打 / 朋 / 闲` 图标；
 * 先统一成纯数据，再分别生成 DOM 或 HTML，可以避免同一套映射被重复写多次。
 *
 * 输入：
 * @param {{kind: string, label: string}} role - 当前对玩家可见的身份信息。
 *
 * 输出：
 * @returns {{glyph: string, title: string, kind: string}|null} 当前身份对应的徽标数据；若不应展示则返回 `null`。
 *
 * 注意：
 * - `unknown` 必须返回 `null`，这样界面才能直接留空。
 * - 返回结果只描述徽标本身，不包含任何布局信息。
 */
function getCompactRoleBadgeState(role) {
  const badgeMap = {
    banker: { glyph: "打", title: TEXT.roles.banker },
    friend: { glyph: "朋", title: TEXT.roles.friend },
    defender: { glyph: "闲", title: TEXT.roles.defender },
  };
  const entry = badgeMap[role?.kind];
  return entry ? { ...entry, kind: role.kind } : null;
}

/**
 * 作用：
 * 把身份状态压缩成桌面端使用的圆形图标徽标。
 *
 * 为什么这样写：
 * 这轮 PC 精修要求左侧玩家面板和中央出牌区都减少文案密度；
 * 统一用一个 helper 产出 `打 / 朋 / 闲` 这类图标徽标，能保证两处视觉语言一致，
 * 同时让“阵营待明确”在需要时直接留空。
 *
 * 输入：
 * @param {{kind: string, label: string}} role - 当前对玩家可见的身份信息。
 * @param {string} className - 徽标基础类名，用来区分座位区和出牌区样式。
 *
 * 输出：
 * @returns {string} 可直接插入 DOM 的徽标 HTML；若当前身份不应展示则返回空字符串。
 *
 * 注意：
 * - `unknown` 必须返回空字符串，避免继续显示“阵营待明确”。
 * - 这里只负责徽标，不负责外层布局。
 */
function buildCompactRoleBadgeMarkup(role, className) {
  const entry = getCompactRoleBadgeState(role);
  if (!entry) return "";
  return `<span class="${className} ${entry.kind}" title="${entry.title}" aria-label="${entry.title}">${entry.glyph}</span>`;
}

/**
 * 作用：
 * 计算桌面端玩家面板里给玩家1展示的短状态文案。
 *
 * 为什么这样写：
 * 这轮 PC 方案要求玩家1 的左侧面板比其他玩家更大，并且显示不同于普通座位卡的信息；
 * 把“当前轮到我 / 正在扣底 / 等待开局”这类状态统一收口成 helper，
 * 就能让玩家1卡片和其他 UI 区域共用同一份阶段判断，而不是在模板里拼很多三元表达式。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 *
 * 输出：
 * @returns {string} 适合放在玩家1面板副标题中的短状态文案。
 *
 * 注意：
 * - 这里只给 PC 玩家1 面板使用，mobile 不依赖这套状态文案。
 * - 文案必须保持短句，避免重新把长说明堆回玩家面板。
 */
function getPcSeatStatusText(player) {
  if (state.gameOver || state.phase === "ending") {
    return "本局结束";
  }
  if (state.phase === "ready") {
    return "等待开始";
  }
  if (state.phase === "dealing") {
    return player.id === state.declaration?.playerId ? "当前亮主" : "发牌中";
  }
  if (state.phase === "countering") {
    return player.id === state.currentTurnId ? "等待反主" : "反主确认中";
  }
  if (state.phase === "bottomReveal") {
    return "翻底展示";
  }
  if (state.phase === "burying") {
    return player.id === state.bankerId ? "整理底牌" : "等待开打";
  }
  if (state.phase === "callingFriend") {
    return player.id === state.bankerId ? "找朋友中" : "等待找朋友";
  }
  if (state.phase === "pause") {
    return "本轮结算";
  }
  if (state.phase === "playing") {
    return player.id === state.currentTurnId ? "当前出牌" : `第 ${state.trickNumber} 轮`;
  }
  return "等待行动";
}

/**
 * 作用：
 * 生成桌面端左侧玩家面板使用的 HTML 结构。
 *
 * 为什么这样写：
 * 这轮 PC 改版把所有玩家面板都移到左侧，并要求玩家1 的盒子更大、信息也与其他玩家不同；
 * 单独抽成 PC helper 后，可以保证 mobile 继续沿用旧结构，
 * 同时把“普通座位卡”和“玩家1专属卡”的差异集中在一处维护。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 * @param {{kind: string, label: string}} role - 当前可见身份信息。
 * @param {{src: string, label: string}} avatar - 当前玩家头像资源。
 *
 * 输出：
 * @returns {string} 供桌面端左侧玩家面板直接使用的 HTML 片段。
 *
 * 注意：
 * - 未明确阵营必须继续留空，不回退成解释性文案。
 * - 玩家1 面板只显示短状态，不重新展示手牌或个人分数。
 */
function buildPcSeatMarkup(player, role, avatar) {
  const roleBadge = buildCompactRoleBadgeMarkup(role, "seat-role-icon");
  if (player.id === 1) {
    return `
      <div class="seat-top seat-top-self">
        <div class="avatar"><img src="${avatar.src}" alt="${avatar.label}" /></div>
        <div class="seat-copy">
          <div class="seat-self-head">
            <div class="title">${player.name}</div>
            <span class="seat-self-tag">自己</span>
          </div>
          <div class="seat-self-status">${getPcSeatStatusText(player)}</div>
          <div class="seat-level-row">
            <div class="seat-level">${TEXT.seat.levelLabel(player.level)}</div>
            ${roleBadge}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="seat-top">
      <div class="avatar"><img src="${avatar.src}" alt="${avatar.label}" /></div>
      <div class="seat-copy">
        <div class="title">${player.name}</div>
        <div class="seat-level-row">
          <div class="seat-level">${TEXT.seat.levelLabel(player.level)}</div>
          ${roleBadge}
        </div>
      </div>
    </div>
  `;
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
 * 为当前牌对象创建具体的牌面内容节点。
 *
 * 为什么这样写：
 * 现在 PC 既可能使用逐张 SVG，也可能切到 `poker.png` 这种整图 sprite；
 * 把两种渲染分支都收口成同一个 helper 后，
 * 手牌、出牌区、底牌和朋友预览就能共用同一套牌面装载逻辑。
 *
 * 输入：
 * @param {object} card - 要展示的牌对象。
 *
 * 输出：
 * @returns {HTMLElement} 可直接插入按钮或展示容器中的牌面节点。
 *
 * 注意：
 * - sprite 节点本身只负责视觉展示，语义描述交给外层容器的 `aria-label`。
 * - 如果当前 sprite 配置无法匹配到具体牌格，必须回退到原先的单张图片方案。
 */
function createCardFaceContent(card) {
  const spriteSheet = getCardFaceSpriteSheet();
  const spritePosition = getCardSpriteSheetPosition(card, spriteSheet);
  if (spriteSheet && spritePosition) {
    const sprite = document.createElement("span");
    sprite.className = "card-face-sprite";
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.display = "block";
    sprite.style.width = "100%";
    sprite.style.height = "100%";
    sprite.style.backgroundImage = `url("${spriteSheet.src}")`;
    sprite.style.backgroundRepeat = "no-repeat";
    sprite.style.backgroundSize = `${spriteSheet.columns * 100}% ${spriteSheet.rows * 100}%`;
    sprite.style.backgroundPosition = `${spritePosition.xPercent}% ${spritePosition.yPercent}%`;
    sprite.style.boxShadow = "0 10px 18px rgba(0, 0, 0, 0.14)";
    return sprite;
  }

  const image = document.createElement("img");
  image.src = resolveCardImage(card);
  image.alt = shortCardLabel(card);
  return image;
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
  node.appendChild(createCardFaceContent(card));
  return node;
}

/**
 * 作用：
 * 为当前牌面主题创建一张只读的牌背内容节点。
 *
 * 为什么这样写：
 * 用户要求翻底定主阶段的未翻开底牌也走 `poker.png` 里的统一牌背，
 * 这样翻底公示区就不会再和正面牌风格脱节；同时保留回退逻辑，
 * 可以保证将来换回逐张资源目录时仍有稳定的牌背表现。
 *
 * 输入：
 * @param {void} - 直接读取当前牌面配置。
 *
 * 输出：
 * @returns {{content: HTMLElement, usesSprite: boolean}} 当前牌背节点和是否使用 sprite 的标记。
 *
 * 注意：
 * - 当前默认取 sprite 最后一行第 3 列的牌背样式。
 * - 若当前牌面不支持 sprite，则回退到旧的几何牌背。
 */
function createCardBackContent() {
  const spriteSheet = getCardFaceSpriteSheet();
  if (spriteSheet?.columns >= 3 && spriteSheet?.rows >= 1) {
    const sprite = document.createElement("span");
    sprite.className = "card-face-sprite";
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.display = "block";
    sprite.style.width = "100%";
    sprite.style.height = "100%";
    sprite.style.backgroundImage = `url("${spriteSheet.src}")`;
    sprite.style.backgroundRepeat = "no-repeat";
    sprite.style.backgroundSize = `${spriteSheet.columns * 100}% ${spriteSheet.rows * 100}%`;
    sprite.style.backgroundPosition = `${(2 / (spriteSheet.columns - 1)) * 100}% 100%`;
    sprite.style.boxShadow = "0 10px 18px rgba(0, 0, 0, 0.14)";
    return { content: sprite, usesSprite: true };
  }

  const core = document.createElement("span");
  core.className = "face-down-core";
  return { content: core, usesSprite: false };
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
  const back = createCardBackContent();
  if (back.usesSprite) {
    node.classList.add("sprite-back");
  }
  node.appendChild(back.content);
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
    dom.friendState.textContent = state.phase === "callingFriend" ? "待选择" : "未开始";
    dom.friendOwner.textContent = "--/--";
    dom.friendCardMount.innerHTML = "";
    return;
  }

  dom.friendHint.textContent = TEXT.friend.fixedHint;
  dom.friendLabel.textContent = state.friendTarget.label;
  dom.friendState.textContent = state.friendTarget.failed
    ? "1打4"
    : state.friendTarget.revealed
      ? "已站队"
      : "待站队";
  dom.friendOwner.textContent = state.friendTarget.failed
    ? "0/0"
    : `${state.friendTarget.revealed
      ? (state.friendTarget.occurrence || 1)
      : Math.min(state.friendTarget.matchesSeen || 0, state.friendTarget.occurrence || 1)}/${state.friendTarget.occurrence || 1}`;
  dom.friendCardMount.innerHTML = "";
  dom.friendCardMount.appendChild(buildCardNode(state.friendTarget, "friend-card"));
}

/**
 * 作用：
 * 为顶部状态条生成更短的“主”状态摘要。
 *
 * 为什么这样写：
 * 顶部现在承担的是快速读状态，不适合继续使用完整说明句；
 * 单独抽成短摘要后，可以在不影响其他文案入口的前提下，把顶部压成更接近手游的读取密度。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态。
 *
 * 输出：
 * @returns {string} 适合顶部状态条显示的短主牌摘要。
 *
 * 注意：
 * - 这里只服务顶部状态条，不替代规则说明文案。
 * - 无主时优先显示 `无主`，花色主时优先显示 `花色 + 级牌`。
 */
function getCompactTopbarTrumpLabel() {
  if (!state.declaration) return "未亮主";
  const levelText = state.declaration.rank ? ` ${state.declaration.rank}` : "";
  if (state.declaration.suit === "notrump") {
    return `无主${levelText}`;
  }
  const suitLabel = SUIT_LABEL[state.declaration.suit] || "";
  return `${suitLabel}${levelText}`;
}

/**
 * 作用：
 * 渲染顶部 `主` 状态块里的可视主牌徽章。
 *
 * 为什么这样写：
 * 用户希望 `主` 和 `朋` 一样带有更直观的视觉锚点；
 * 单独做一个小徽章后，顶部不必依赖更多解释文字，也能快速识别当前主牌。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态并写入 DOM。
 *
 * 输出：
 * @returns {void} 只更新主牌徽章，不返回额外结果。
 *
 * 注意：
 * - 未亮主时显示 `--`。
 * - 无主时显示 `无`，花色主时优先显示花色符号。
 */
function renderTopbarTrumpBadge() {
  if (!dom.topbarTrumpBadge) return;

  if (!state.declaration) {
    dom.topbarTrumpBadge.textContent = "--";
    dom.topbarTrumpBadge.classList.remove("red");
    return;
  }

  if (state.declaration.suit === "notrump") {
    dom.topbarTrumpBadge.textContent = "无";
    dom.topbarTrumpBadge.classList.remove("red");
    return;
  }

  const symbol = SUIT_SYMBOL[state.declaration.suit] || SUIT_LABEL[state.declaration.suit] || "--";
  dom.topbarTrumpBadge.textContent = symbol;
  dom.topbarTrumpBadge.classList.toggle("red", state.declaration.suit === "hearts" || state.declaration.suit === "diamonds");
}

/**
 * 作用：
 * 为顶部状态条生成更短的“主”副标题。
 *
 * 为什么这样写：
 * 顶部第二行只需要告诉玩家当前由谁做庄或处于哪个短阶段，
 * 继续沿用旧 HUD 的完整句式会让顶部重新变重。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态。
 *
 * 输出：
 * @returns {string} 适合顶部状态条显示的短副标题。
 *
 * 注意：
 * - `ready` 阶段不展开说明，只返回等待状态。
 * - 正式出牌阶段优先显示当前打家。
 */
function getCompactTopbarBankerLabel() {
  if (state.phase === "ready") return "待定";
  if (state.phase === "dealing") {
    return state.declaration ? `打 ${getPlayer(state.declaration.playerId).name}` : "待亮主";
  }
  if (state.phase === "bottomReveal") return "翻底定主";
  if (state.phase === "countering") return `玩家${state.currentTurnId}反主`;
  if (state.phase === "burying") return playerIdLabel(state.bankerId, "扣底中");
  if (state.phase === "callingFriend") return playerIdLabel(state.bankerId, "找朋友");
  return `打 ${getPlayer(state.bankerId).name}`;
}

/**
 * 作用：
 * 为顶部状态条生成更短的“局”副标题。
 *
 * 为什么这样写：
 * 顶部 `局` 状态需要告诉玩家当前回合焦点，但不能像旧版那样展开成解释句；
 * 在这里统一返回短状态，可以让顶部持续保持紧凑。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态。
 *
 * 输出：
 * @returns {string} 适合顶部状态条显示的短局面副标题。
 *
 * 注意：
 * - `ready` 阶段只显示等待。
 * - 正式出牌阶段优先显示当前行动玩家。
 */
function getCompactTopbarRoundLabel() {
  if (state.gameOver) return "本局结束";
  if (state.phase === "ready") return "等待开局";
  if (state.phase === "dealing") return state.awaitingHumanDeclaration ? "等待补亮" : "发牌中";
  if (state.phase === "bottomReveal") return "翻底公示";
  if (state.phase === "countering") return `玩家${state.currentTurnId}反主`;
  if (state.phase === "burying") return state.bankerId === 1 ? "你在扣底" : "打家扣底";
  if (state.phase === "callingFriend") return state.bankerId === 1 ? "你在找朋友" : "打家找朋友";
  if (state.phase === "ending") return "结算中";
  if (state.phase === "pause") return "本轮暂停";
  return `玩家${state.currentTurnId}行动`;
}

/**
 * 作用：
 * 生成“玩家 + 状态”的紧凑标签。
 *
 * 为什么这样写：
 * 顶部副标题需要频繁拼出 `玩家X + 某短状态`；
 * 统一封装后可以减少模板字符串重复，并保持不同阶段口径一致。
 *
 * 输入：
 * @param {number} playerId - 要显示的玩家编号。
 * @param {string} suffix - 跟在玩家编号后的短状态。
 *
 * 输出：
 * @returns {string} 例如 `玩家2扣底中` 的短标签。
 *
 * 注意：
 * - `suffix` 需要传入已经压缩过的短状态。
 * - 不负责校验玩家编号是否存在，调用方需保证传入合法编号。
 */
function playerIdLabel(playerId, suffix) {
  return `玩家${playerId}${suffix}`;
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
  dom.trumpLabel.textContent = getCompactTopbarTrumpLabel();
  renderTopbarTrumpBadge();
  dom.bankerLabel.textContent = getCompactTopbarBankerLabel();
  dom.trickLabel.textContent = state.phase === "playing" || state.phase === "pause"
    ? `第${state.trickNumber}轮`
    : state.phase === "dealing"
      ? `发牌 ${state.dealIndex}/${state.dealCards.length}`
      : state.phase === "ready"
        ? "未开始"
        : state.phase === "ending"
          ? "本局结束"
          : TEXT.hud.trickPlaying(state.trickNumber).replace(/\s/g, "");
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
  dom.timerHint.textContent = getCompactTopbarRoundLabel();
  const showBottomButton = typeof shouldShowHumanBottomButton === "function" ? shouldShowHumanBottomButton() : canHumanViewBottomCards();
  dom.toggleBottomBtn.hidden = !showBottomButton;
  dom.toggleBottomBtn.disabled = !showBottomButton;
  dom.toggleBottomBtn.classList.toggle("alert", showBottomButton);
  if (typeof syncAutoManagedButton === "function") {
    syncAutoManagedButton();
  }
  if (dom.toggleRulesBtn) {
    dom.toggleRulesBtn.classList.toggle("alert", typeof shouldShowPcToolbarMenu === "function" && shouldShowPcToolbarMenu());
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("fivefriends:scorepanel"));
  }
}

/**
 * 作用：
 * 渲染 PC 顶部的更多功能菜单。
 *
 * 为什么这样写：
 * 这轮改版把低频入口从顶部按钮条移进菜单，需要单独同步菜单显隐和各入口文案状态，
 * 才能在不改玩法逻辑的前提下收窄顶部噪音。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态并写入 DOM。
 *
 * 输出：
 * @returns {void} 只更新菜单显示，不返回额外结果。
 *
 * 注意：
 * - 仅在 `shouldShowPcToolbarMenu()` 为真时显示。
 * - 菜单入口文案需要反映当前面板的开关状态，避免用户不知道当前是否已展开。
 */
function renderToolbarMenu() {
  if (!dom.toolbarMenuPanel || typeof shouldShowPcToolbarMenu !== "function") return;
  const visible = shouldShowPcToolbarMenu();
  dom.toolbarMenuPanel.classList.toggle("hidden", !visible);
  if (!visible) return;

  if (dom.menuRulesBtn) {
    dom.menuRulesBtn.textContent = state.showRulesPanel ? "收起规则" : "规则帮助";
  }
  if (dom.toggleBottomBtn) {
    dom.toggleBottomBtn.textContent = state.showBottomPanel ? "收起底牌" : "查看底牌";
  }
  if (dom.toggleDebugBtn) {
    dom.toggleDebugBtn.textContent = state.showDebugPanel ? "收起调试" : "调试信息";
  }
  if (dom.toggleCardFaceBtn) {
    dom.toggleCardFaceBtn.textContent = `牌面：${getCurrentCardFaceOption().label}`;
  }
  if (dom.layoutEditBtn) {
    dom.layoutEditBtn.textContent = state.layoutEditMode ? "完成布局" : "布局编辑";
    dom.layoutEditBtn.classList.toggle("alert", state.layoutEditMode);
  }
}

/**
 * 作用：
 * 在 PC 的准备阶段渲染独立开始界面。
 *
 * 为什么这样写：
 * 新版桌面端把 ready 阶段做成更接近手游的入口卡片，
 * 让“开始游戏 / 继续游戏 / 查看规则”从局内操作条里抽离出来，进入牌局前更聚焦。
 *
 * 输入：
 * @param {void} - 直接读取当前全局状态并写入 DOM。
 *
 * 输出：
 * @returns {void} 只更新开始界面显示，不返回额外结果。
 *
 * 注意：
 * - 仅在 `shouldShowPcReadyLobby()` 为真时显示。
 * - 没有存档进度时，继续游戏按钮必须置灰。
 */
function renderStartLobby() {
  if (!dom.startLobbyPanel || typeof shouldShowPcReadyLobby !== "function") return;
  const showStartLobby = shouldShowPcReadyLobby();
  dom.startLobbyPanel.classList.toggle("hidden", !showStartLobby);
  if (!showStartLobby) return;

  dom.startLobbyStatus.textContent = state.hasSavedProgress
    ? "已检测到上次等级进度，可以直接继续当前牌局路线。"
    : "当前没有可继续的进度，开始游戏会从默认等级重新开局。";
  dom.startLobbyStartBtn.disabled = false;
  dom.startLobbyContinueBtn.disabled = !state.hasSavedProgress;
}

/**
 * 作用：
 * 生成手游沿用的玩家面板标记结构。
 *
 * 为什么这样写：
 * 这轮 PC 精修把玩家面板压成了“等级 + 阵营图标”的紧凑结构，
 * 但手游仍然依赖原先的 `role-badge / seat-stats / seat-meta` DOM 结构来承接样式；
 * 单独保留一份 mobile 旧结构，才能保证共享渲染层继续兼容两端。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 * @param {{kind: string, label: string}} role - 当前可见身份信息。
 * @param {{src: string, label: string}} avatar - 当前玩家头像资源。
 *
 * 输出：
 * @returns {string} 供手游玩家面板直接使用的 HTML 片段。
 *
 * 注意：
 * - 这里只给 mobile 使用，PC 必须走新的紧凑版结构。
 * - 继续保留手牌数和个人分数，避免影响手游现有阅读顺序。
 */
function buildLegacyMobileSeatMarkup(player, role, avatar) {
  return `
    <div class="seat-top">
      <div class="avatar"><img src="${avatar.src}" alt="${avatar.label}" /></div>
      <div class="seat-copy">
        <div class="title">${player.name}</div>
        <div class="seat-meta">${player.isHuman ? TEXT.seat.selfControlled : TEXT.seat.aiControlled}</div>
        <div class="seat-level-row">
          <div class="seat-level">${TEXT.seat.levelLabel(player.level)}</div>
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

// 渲染五个玩家座位信息。
function renderSeats() {
  for (const player of state.players) {
    const seat = document.getElementById(`playerSeat-${player.id}`);
    const role = getVisibleRole(player.id);
    const avatar = PLAYER_AVATARS[player.id];
    seat.classList.toggle("current-turn", player.id === state.currentTurnId && state.phase === "playing" && !state.gameOver);
    if (APP_PLATFORM === "mobile") {
      seat.classList.toggle("role-banker", role.kind === "banker");
      seat.innerHTML = buildLegacyMobileSeatMarkup(player, role, avatar);
      continue;
    }
    seat.classList.toggle("seat-role-banker", role.kind === "banker");
    seat.classList.toggle("seat-role-friend", role.kind === "friend");
    seat.classList.toggle("seat-role-defender", role.kind === "defender");
    seat.innerHTML = buildPcSeatMarkup(player, role, avatar);
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

/**
 * 作用：
 * 生成桌面出牌区头部使用的紧凑状态标签。
 *
 * 为什么这样写：
 * 新 PC 方案要求出牌区头部只保留必要状态，避免把等级、手牌数和个人分数重新堆回去；
 * 现在出牌区右侧不再保留独立指标列，托管状态会和身份短签并排显示在标题行；
 * 这里继续保留 helper，方便后续若要补别的极简标签时仍有统一出口。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 * @param {{kind: string, label: string}} role - 当前玩家的可见身份信息。
 * @param {boolean} isWinning - 当前玩家是否是本轮实时最大。
 *
 * 输出：
 * @returns {string} 可直接插入到出牌区头部指标区的 HTML 字符串。
 *
 * 注意：
 * - 当前 PC 方案默认返回空字符串，避免重新出现独立的右侧胶囊列。
 * - 朋友、打家和托管统一通过标题行短签体现；“当前最大”统一交给角标，避免重复出现两个“大”。
 */
function buildTrickSpotMetricChips(player, role, isWinning) {
  return "";
}

/**
 * 作用：
 * 返回桌面端出牌区头部使用的简短玩家标题。
 *
 * 为什么这样写：
 * 这轮 PC 精修希望其他玩家卡片只保留“玩家名”本身，不再在标题里重复“出牌区”三个字；
 * 单独抽成 helper 后，mobile 仍可继续沿用旧的完整标题，不会被桌面端文案同步影响。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 *
 * 输出：
 * @returns {string} 适合桌面端出牌区头部显示的短标题。
 *
 * 注意：
 * - 这里只给 PC 使用，mobile 继续使用旧标题文案。
 * - 玩家1 仍保留“我的本轮”语义，方便和其他玩家区分。
 */
function getPcTrickSpotTitle(player) {
  return player.id === 1 ? "我的本轮" : player.name;
}

/**
 * 作用：
 * 生成桌面端出牌区里用背景色区分的阵营短签。
 *
 * 为什么这样写：
 * 用户希望 PC 出牌区像手游一样，直接用带底色的 `打 / 朋` 短签表达关键身份，
 * 而不是再通过一整行解释性副标题说明；统一从 helper 出 HTML，
 * 可以让桌面端只改一处就同步所有出牌区头部。
 *
 * 输入：
 * @param {{kind: string, label: string}} role - 当前玩家可见身份。
 *
 * 输出：
 * @returns {string} 可直接插入桌面端出牌区标题行的身份短签 HTML。
 *
 * 注意：
 * - 这里只显示 `打` 和 `朋` 两种高优先级短签，其他身份保持留空。
 * - `unknown` 必须返回空字符串，避免重新出现“阵营待明确”。
 */
function buildPcTrickSpotRoleTag(role) {
  if (role?.kind === "banker") {
    return '<span class="spot-role-chip banker">打</span>';
  }
  if (role?.kind === "friend") {
    return '<span class="spot-role-chip friend">朋</span>';
  }
  return "";
}

/**
 * 作用：
 * 生成桌面端出牌区标题行右侧的全部短签。
 *
 * 为什么这样写：
 * 用户希望把 `托管` 胶囊直接并到玩家身份旁边，
 * 这样出牌区头部只保留一组紧凑标签，不再分裂成“身份在左、托管在右”的两套视觉焦点。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 * @param {{kind: string, label: string}} role - 当前玩家可见身份。
 *
 * 输出：
 * @returns {string} 可直接插入标题行的紧凑短签 HTML。
 *
 * 注意：
 * - 这里只给 PC 出牌区使用，mobile 仍保留自己的旧标签结构。
 * - `托管` 只在玩家1进入托管时显示，避免错误地挂到其他 AI 身上。
 */
function buildPcTrickSpotHeaderTags(player, role) {
  const tags = [];
  const roleTag = buildPcTrickSpotRoleTag(role);

  if (roleTag) {
    tags.push(roleTag);
  }

  if (player.id === 1 && !player.isHuman) {
    tags.push('<span class="spot-role-chip managed">托管</span>');
  }

  return tags.join("");
}

/**
 * 作用：
 * 返回桌面端出牌区在无牌可展示时应保留的空态文案。
 *
 * 为什么这样写：
 * 这轮 PC 方案希望中央出牌区比之前更安静，不再长期显示“本轮尚未出牌”这类占位说明；
 * 单独封装后，mobile 依然可以保留原本的说明，而桌面端只在确实需要阶段提示时返回文本。
 *
 * 输入：
 * @param {string} phase - 当前牌局阶段。
 *
 * 输出：
 * @returns {string} 桌面端无牌时要显示的短文案；不需要提示时返回空字符串。
 *
 * 注意：
 * - 正式出牌阶段默认返回空字符串，让卡面区域保持留白。
 * - 这里只给 PC 使用，mobile 继续使用完整阶段说明。
 */
function getPcTrickSpotEmptyText(phase) {
  if (phase === "playing" || phase === "pause" || phase === "ending") {
    return "";
  }
  return "";
}

/**
 * 作用：
 * 生成手游沿用的出牌区标题行结构。
 *
 * 为什么这样写：
 * `index2.html` 里仍有一层后处理脚本，会在 `.label` 结构上补阵营、托管和角标；
 * 这轮 PC 把出牌区头部换成了 `.spot-head`，如果手游继续吃到新结构，就会直接丢样式和后处理能力。
 *
 * 输入：
 * @param {object} player - 当前玩家对象。
 * @param {{kind: string, label: string}} role - 当前可见身份信息。
 *
 * 输出：
 * @returns {string} 手游出牌区旧版标题行 HTML。
 *
 * 注意：
 * - 只给 mobile 使用，PC 必须走新的头部结构。
 * - 这里保留旧的角色短签，方便手游页面自己的脚本继续覆盖和增强。
 */
function buildLegacyMobileTrickSpotLabel(player, role) {
  const roleLabel = role.kind === "banker"
    ? role.label || "打家"
    : role.kind === "friend"
      ? role.label || "朋友"
      : "";
  const managedLabel = player.id === 1 && !player.isHuman
    ? '<span class="mobile-spot-role managed">托管中</span>'
    : "";
  return `
    <div class="label">
      <span>${player.id === 1 ? TEXT.trickSpot.self : TEXT.trickSpot.other(player.name)}</span>
      ${roleLabel ? `<span class="spot-role${role.kind === "friend" ? " friend" : ""}">${roleLabel}</span>` : ""}
      ${managedLabel}
    </div>
  `;
}

// 渲染当前一轮中各玩家的出牌位置。
function renderTrickSpots() {
  // 当前墩的实时赢家，用来在桌面出牌区打“大”角标。
  const winningPlay = state.phase === "playing" && typeof getCurrentWinningPlay === "function"
    ? getCurrentWinningPlay()
    : null;
  for (const player of state.players) {
    const spot = document.getElementById(`trickSpot-${player.id}`);
    const play = state.currentTrick.find((entry) => entry.playerId === player.id);
    const role = getVisibleRole(player.id);
    const isWinning = winningPlay?.playerId === player.id;
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
    const winningBadge = APP_PLATFORM !== "mobile" && isWinning
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
    if (APP_PLATFORM === "mobile") {
      spot.innerHTML = `
        ${buildLegacyMobileTrickSpotLabel(player, role)}
        <div class="spot-row">
          ${cardsHtml || `<div class="empty-note">${emptyText}</div>`}
          ${zoomHtml}
        </div>
      `;
      spot.onclick = null;
      continue;
    }
    const metricChips = buildTrickSpotMetricChips(player, role, isWinning);
    spot.innerHTML = `
      <div class="spot-head">
        <div class="spot-player">
          <div class="spot-info">
            <div class="spot-name-row">
              <span class="spot-name">${getPcTrickSpotTitle(player)}</span>
              ${buildPcTrickSpotHeaderTags(player, role)}
            </div>
          </div>
        </div>
        ${metricChips ? `<div class="spot-metrics">${metricChips}</div>` : ""}
      </div>
      <div class="spot-row">
        ${cardsHtml || (getPcTrickSpotEmptyText(state.phase)
          ? `<div class="spot-body-note">${getPcTrickSpotEmptyText(state.phase)}</div>`
          : "")}
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

/**
 * 作用：
 * 计算当前主玩家手牌区应展示的分组结果。
 *
 * 为什么这样写：
 * mobile 仍旧按分组展示手牌，而 PC 改成“左侧统计列 + 单条牌轨”；
 * 先把同一份分组数据算出来，两个平台就能共享规则判断，而不用复制过滤逻辑。
 *
 * 输入：
 * @param {object} human - 当前主玩家对象。
 *
 * 输出：
 * @returns {Array<{key: string, label: string, red: boolean, cards: object[]}>} 当前手牌区的展示分组。
 *
 * 注意：
 * - 发牌前未定主时，`主牌` 组仍要兼容大小王和级牌兜底。
 * - 这里只产出数据，不直接关心 DOM 结构。
 */
function getDisplayHandGroups(human) {
  const isSetupPhase = state.phase === "dealing" || state.phase === "countering" || state.phase === "burying";
  const specialLabel = isSetupPhase
    ? (state.declaration ? TEXT.hand.setupSpecialLabelWithTrump : TEXT.hand.setupSpecialLabelWithoutTrump)
    : TEXT.hand.specialLabelNormal;
  const setupLevelRank = getLevelRank(human.level);
  return [
    { key: "trump", label: specialLabel, red: true },
    { key: "clubs", label: SUIT_LABEL.clubs, red: false },
    { key: "diamonds", label: SUIT_LABEL.diamonds, red: true },
    { key: "spades", label: SUIT_LABEL.spades, red: false },
    { key: "hearts", label: SUIT_LABEL.hearts, red: true },
  ].map((group) => ({
    ...group,
    cards: human.hand.filter((card) => {
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
    }).sort(compareHandCardsForDisplay),
  }));
}

/**
 * 作用：
 * 把桌面端手牌渲染成“左侧统计列 + 一条连续牌轨”。
 *
 * 为什么这样写：
 * 这轮 PC 调整需要让静态模板和实机都采用同一套阅读路径，
 * 也就是左侧快速看分组统计，右侧直接在一条连续牌轨上选牌；
 * 单独封装成 helper 后，mobile 还能继续使用原来的分组 DOM，不会被桌面端结构带乱。
 *
 * 输入：
 * @param {object} human - 当前主玩家对象。
 * @param {Array<{key: string, label: string, red: boolean, cards: object[]}>} groups - 已经计算好的展示分组。
 *
 * 输出：
 * @returns {void} 直接更新桌面端手牌统计列和连续牌轨。
 *
 * 注意：
 * - 这里只服务于 PC 分支，mobile 不调用。
 * - 左侧统计列只展示有牌的分组，避免空组浪费空间。
 */
function renderPcHandGroups(human, groups) {
  dom.handGroups.innerHTML = "";

  const visibleGroups = groups.filter((group) => group.cards.length > 0);
  renderPcHandStatsRail(visibleGroups, human.hand.length);

  const allCards = visibleGroups.flatMap((group) => group.cards);
  if (allCards.length === 0) {
    dom.handGroups.innerHTML = `<div class="empty-note">${TEXT.bottom.unavailable}</div>`;
    return;
  }

  const row = document.createElement("div");
  row.className = "cards-row hand-cards-track";
  row.dataset.cardCount = String(allCards.length);
  row.style.setProperty("--pc-card-overlap", `${getPcSingleLaneHandOverlap(human.hand.length).toFixed(1)}px`);

  for (const card of allCards) {
    const button = buildCardNode(card, `card-btn${state.selectedCardIds.includes(card.id) ? " selected" : ""}${isTrump(card) ? " trump" : ""}`);
    button.type = "button";
    const canInteract = (state.phase === "playing" && isHumanTurnActive()) || (state.phase === "burying" && state.bankerId === 1);
    button.disabled = !canInteract;
    if (canInteract) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        toggleSelection(card.id);
      });
    }
    row.appendChild(button);
  }

  dom.handGroups.appendChild(row);
}

/**
 * 作用：
 * 让桌面端手牌区的花色统计和各组首张牌精确对齐。
 *
 * 为什么这样写：
 * 用户希望 `主牌 / 梅花 / 方块...` 这些统计字样紧贴在对应牌段下方，
 * 而不是像之前那样按整段宽度平均分布；统一在这里按连续牌轨的真实起点计算，
 * 静态模板和运行态就能保持同一套视觉锚点。
 *
 * 输入：
 * @param {Array<{key: string, label: string, red: boolean, cards: object[]}>} visibleGroups - 当前手牌里实际有牌的分组。
 * @param {number} totalHandCount - 当前整手牌张数。
 *
 * 输出：
 * @returns {void} 直接更新桌面端底部统计列。
 *
 * 注意：
 * - 这里的起点必须和 `.cards-row` 左内边距保持一致，否则标签会和牌错位。
 * - 只给 PC 连续牌轨使用，mobile 继续沿用原来的分组标签结构。
 */
function renderPcHandStatsRail(visibleGroups, totalHandCount) {
  if (!dom.handStatsRail) return;

  dom.handStatsRail.innerHTML = "";
  if (visibleGroups.length === 0) return;

  const cardWidth = 58;
  const trackInset = 16;
  const overlap = getPcSingleLaneHandOverlap(totalHandCount);
  const step = cardWidth - overlap;
  let startIndex = 0;

  for (const group of visibleGroups) {
    const chip = document.createElement("div");
    chip.className = `group-chip${group.red ? " red" : ""}`;
    chip.innerHTML = `<span>${group.label}</span><span class="group-chip-count">${group.cards.length}</span>`;
    chip.style.left = `${trackInset + startIndex * step}px`;
    dom.handStatsRail.appendChild(chip);
    startIndex += group.cards.length;
  }
}

// 渲染手牌。
function renderHand() {
  const human = getPlayer(1);
  if (APP_PLATFORM === "mobile") {
    if (state.phase === "ready") {
      dom.handSummary.textContent = `${getReadyStartMessage()} 你当前是 Lv:${human.level}。`;
    } else if (state.phase === "dealing") {
      const humanOptions = getAvailableSetupOptionsForPlayer(1, "dealing");
      dom.handSummary.textContent = state.awaitingHumanDeclaration
        ? (humanOptions.length > 0
          ? TEXT.hand.dealingAwaitHuman(human.hand.length, Math.max(0, state.countdown), humanOptions.map((entry) => formatDeclaration(entry)))
          : TEXT.hand.dealingAwaitHumanNoOption(human.hand.length))
        : (humanOptions.length > 0
          ? TEXT.hand.dealingCanDeclare(human.hand.length, humanOptions.map((entry) => formatDeclaration(entry)))
          : TEXT.hand.dealingNoDeclare(human.hand.length, getLevelRank(human.level)));
    } else if (state.phase === "countering") {
      const counterOptions = getAvailableSetupOptionsForPlayer(1, "countering");
      dom.handSummary.textContent = counterOptions.length > 0
        ? TEXT.hand.counteringCan(human.hand.length, counterOptions.map((entry) => formatDeclaration(entry)))
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
  }
  const groups = getDisplayHandGroups(human);
  if (APP_PLATFORM === "pc") {
    renderPcHandGroups(human, groups);
    return;
  }

  dom.handGroups.innerHTML = "";
  for (const group of groups) {
    const cards = group.cards;
    if (cards.length === 0) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "hand-group";
    wrapper.dataset.groupKey = group.key;
    const chip = document.createElement("div");
    chip.className = `group-chip${group.red ? " red" : ""}`;
    chip.innerHTML = `<span>${group.label}</span><span class="group-chip-count">${cards.length}</span>`;
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
        button.addEventListener("pointerup", (event) => {
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

/**
 * 作用：
 * 根据当前组内张数和整手牌张数，计算桌面端手牌的重叠量。
 *
 * 为什么这样写：
 * PC 新方案要求底部手牌区彻底取消滚动条，并且在拿起底牌后也尽量把 31 张牌压进同一视野；
 * 重叠量只看单组张数会在“拿底牌后主牌变多”的场景下压不住宽度，
 * 所以这里同时参考整手牌张数，保证常态下牌面更清楚、长牌时再主动加大重叠。
 *
 * 输入：
 * @param {number} groupCardCount - 当前花色分组内的牌张数。
 * @param {number} totalHandCount - 当前整手牌张数。
 *
 * 输出：
 * @returns {number} 应写入 `--pc-card-overlap` 的像素值。
 *
 * 注意：
 * - 返回值越大，牌与牌之间重叠越多。
 * - 必须限制上下界，避免少牌时过度挤压，也避免多牌时完全看不清牌面。
 */
function getPcHandOverlap(groupCardCount, totalHandCount) {
  const groupPressure = Math.max(0, groupCardCount - 7);
  const totalPressure = Math.max(0, totalHandCount - 24);
  const overlap = 14 + groupPressure * 2.2 + totalPressure * 0.55;
  return Math.max(14, Math.min(34, overlap));
}

/**
 * 作用：
 * 计算桌面端连续牌轨模式下的手牌重叠量。
 *
 * 为什么这样写：
 * 新版 PC 手里所有牌现在排成一条连续牌轨，不再按花色拆成多行；
 * 这时重叠量主要受整手牌张数影响，用单独 helper 能避免沿用旧分组算法后把 31 张压得过狠。
 *
 * 输入：
 * @param {number} totalHandCount - 当前整手牌张数。
 *
 * 输出：
 * @returns {number} 应写入连续牌轨 `--pc-card-overlap` 的像素值。
 *
 * 注意：
 * - 返回值越大，牌与牌之间重叠越多。
 * - 这里优先保证左上角点数可读，所以不能压到过大的遮挡量。
 */
function getPcSingleLaneHandOverlap(totalHandCount) {
  const totalPressure = Math.max(0, totalHandCount - 24);
  const overlap = 16 + totalPressure * 0.92;
  return Math.max(16, Math.min(26, overlap));
}

// 创建单张牌对应的 DOM 节点。
function buildCardNode(card, className) {
  const node = document.createElement("button");
  node.className = className;
  node.setAttribute("aria-label", shortCardLabel(card));
  node.appendChild(createCardFaceContent(card));
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
    const options = getAvailableSetupOptionsForPlayer(1, "dealing");
    const optionLabels = options.map((entry) => formatDeclaration(entry));
    if (state.awaitingHumanDeclaration) {
      dom.actionHint.textContent = optionLabels.length > 0
        ? TEXT.actionHint.dealingAwaitHuman(Math.max(0, state.countdown), optionLabels)
        : TEXT.actionHint.dealingAwaitHumanNoOption;
      return;
    }
    if (optionLabels.length > 0) {
      dom.actionHint.textContent = TEXT.actionHint.dealingCanDeclare(optionLabels);
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
    const counterOptions = getAvailableSetupOptionsForPlayer(1, "countering");
    if (state.currentTurnId !== 1) {
      dom.actionHint.textContent = TEXT.actionHint.counteringWait(state.currentTurnId);
      return;
    }
    dom.actionHint.textContent = counterOptions.length > 0
      ? TEXT.actionHint.counteringCan(counterOptions.map((entry) => formatDeclaration(entry)))
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

// 渲染上一轮回顾内容。
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

// 获取花色对应的找朋友点数选项。
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
  if (dom.toggleLogBtn) {
    dom.toggleLogBtn.classList.toggle("alert", !!state.showLogPanel);
  }
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

/**
 * 作用：
 * 把当前亮主 / 反主候选项渲染到中央操作区的可选列表里。
 *
 * 为什么这样写：
 * 玩家现在需要在多个合法亮牌方案之间手动切换，
 * 不能只看按钮上一条文案；单独做一个渲染 helper，
 * 可以让 PC 和 mobile 共用同一套候选列表结构与高亮状态。
 *
 * 输入：
 * @param {object[]} options - 当前阶段所有可选候选项。
 * @param {?object} selectedOption - 当前应高亮的候选项。
 *
 * 输出：
 * @returns {void} 直接更新中央操作区的候选列表 DOM。
 *
 * 注意：
 * - 没有可选项时必须清空并隐藏，避免残留上一阶段内容。
 * - 发牌阶段的候选项按钮会直接执行亮主；最后反主阶段仍保留“先选再确认”。
 */
function renderSetupOptions(options, selectedOption) {
  if (!dom.setupOptions) return;
  if (!Array.isArray(options) || options.length === 0) {
    dom.setupOptions.hidden = true;
    dom.setupOptions.innerHTML = "";
    return;
  }

  const isDealingPhase = state.phase === "dealing";
  const selectedKey = getSetupOptionKey(selectedOption);
  dom.setupOptions.hidden = false;
  dom.setupOptions.innerHTML = `
    ${isDealingPhase ? "" : `<div class="setup-options-label">${TEXT.setupOptions.counter}</div>`}
    ${options.map((entry) => {
      const optionKey = getSetupOptionKey(entry);
      const actionLabel = isDealingPhase
        ? (entry.suit === "notrump"
          ? `${state.declaration ? "抢亮" : "亮"}${getNoTrumpDeclarationLabel(entry)}无主`
          : `${state.declaration ? "抢亮" : "亮"}${formatDeclaration(entry)}`)
        : formatDeclaration(entry);
      return `
        <button
          type="button"
          class="setup-option-btn${isDealingPhase ? " primary" : ""}${optionKey === selectedKey ? " active" : ""}"
          data-setup-option-key="${optionKey}"
          aria-pressed="${isDealingPhase ? "false" : (optionKey === selectedKey ? "true" : "false")}"
        >${actionLabel}</button>
      `;
    }).join("")}
  `;
}

// 渲染中央操作面板内容。
function renderCenterPanel() {
  const isOpeningPhase = state.phase === "dealing" || state.phase === "countering";
  const humanSetupOptions = isOpeningPhase ? getAvailableSetupOptionsForPlayer(1, state.phase) : [];
  const selectedSetupOption = state.phase === "countering" ? getSelectedSetupOptionForPlayer(1, state.phase) : null;
  const canDeclareNow = state.phase === "countering"
      ? state.currentTurnId === 1 && !!selectedSetupOption
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
  dom.beatBtn.hidden = true;
  dom.beatBtn.disabled = true;
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
    dom.declareBtn.textContent = selectedSetupOption
      ? (selectedSetupOption.suit === "notrump"
        ? getNoTrumpCounterLabel(selectedSetupOption)
        : `反${getActionSuitLabel(selectedSetupOption)} ${selectedSetupOption.count}张`)
      : TEXT.buttons.counter;
  } else if (state.phase === "dealing") {
    dom.declareBtn.textContent = state.declaration ? TEXT.buttons.redeclare : TEXT.buttons.declare;
  } else {
    dom.declareBtn.textContent = TEXT.buttons.declare;
  }
  dom.declareBtn.hidden = state.phase !== "countering";
  dom.declareBtn.disabled = state.gameOver || !canDeclareNow;
  dom.declareBtn.classList.toggle("primary", canDeclareNow);
  const showPassCounterBtn = state.phase === "countering" && state.currentTurnId === 1 && !!selectedSetupOption;
  dom.passCounterBtn.disabled = state.gameOver || !showPassCounterBtn;
  dom.passCounterBtn.hidden = !showPassCounterBtn;
  renderSetupOptions(humanSetupOptions, selectedSetupOption);
  if (dom.aiDifficultySelect) {
    dom.aiDifficultySelect.value = AI_DIFFICULTY_OPTIONS.some((option) => option.value === state.aiDifficulty)
      ? state.aiDifficulty
      : DEFAULT_AI_DIFFICULTY;
    dom.aiDifficultySelect.disabled = state.gameOver || state.phase !== "ready";
  }
  if (dom.aiPaceSelect) {
    dom.aiPaceSelect.value = normalizeAiPace(state.aiPace);
    dom.aiPaceSelect.disabled = false;
  }
  if (dom.menuAiPaceSelect) {
    dom.menuAiPaceSelect.value = normalizeAiPace(state.aiPace);
    dom.menuAiPaceSelect.disabled = false;
  }
  /**
   * 作用：
   * 同步准备阶段原始开局按钮的隐藏与可用状态。
   *
   * 为什么这样写：
   * PC 现在由独立开始界面接管 ready 阶段入口，所以中央操作条里的旧按钮必须隐藏；
   * 但手游页仍然通过隐藏的原始按钮转发“开始游戏 / 继续游戏”动作，
   * 因此 mobile 端不能再把这些原始按钮一并禁用，否则壳层按钮会点了没反应。
   *
   * 输入：
   * @param {void} - 直接读取当前平台与全局状态。
   *
   * 输出：
   * @returns {void} 只更新按钮显隐和禁用状态，不返回额外结果。
   *
   * 注意：
   * - PC 必须继续隐藏旧按钮，避免和新版开始界面重复。
   * - mobile 即使让原始按钮保持可用，也仍由外层壳层界面承接真实点击入口。
   */
  const keepReadyEntryForMobile = APP_PLATFORM === "mobile" && state.phase === "ready" && !state.gameOver;
  dom.newProgressBtn.hidden = true;
  dom.newProgressBtn.disabled = true;
  dom.newProgressBtn.classList.remove("primary");
  dom.continueGameBtn.hidden = !keepReadyEntryForMobile;
  dom.continueGameBtn.disabled = !keepReadyEntryForMobile || !state.hasSavedProgress;
  dom.continueGameBtn.classList.toggle("primary", false);
  dom.continueGameBtn.textContent = "继续游戏";
  dom.startGameBtn.hidden = !keepReadyEntryForMobile;
  dom.startGameBtn.disabled = !keepReadyEntryForMobile;
  dom.startGameBtn.textContent = "开始游戏";
  if (dom.centerPanel && typeof shouldShowPcReadyLobby === "function") {
    dom.centerPanel.classList.toggle("hidden", shouldShowPcReadyLobby());
  }
}
