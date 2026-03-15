const TEXT = {
  cards: {
    bigJoker: "大王",
    smallJoker: "小王",
    noTrumpBadgeAria: "无主牌",
  },
  occurrences: {
    1: "第一张",
    2: "第二张",
    3: "第三张",
  },
  declarations: {
    noTrumpCounterBig: "大王反无主",
    noTrumpCounterSmall: "小王反无主",
    noTrumpCounterDefault: "王反无主",
    bottomNoTrump: "翻底定无主",
    bottomSuitPrefix: "翻底定主 ",
    notRevealed: "尚未亮主 · 各家按自己的 Lv 亮主",
    noTrumpByBottom: "无主（王和级牌为主） · 翻底定主",
    noTrumpByCount: (count) => `无主（王和级牌为主） · ${count} 张亮`,
    suitByBottom: (suitLabel) => `${suitLabel} · 翻底定主`,
    suitByCount: (suitLabel, rank, count) => `${suitLabel} ${rank} · ${count} 张亮`,
  },
  buttons: {
    restart: "再来一局",
    restartWithCountdown: (countdown) => `再来一局 (${countdown})`,
    autoManage: "本局托管",
    debug: "Debug",
    select: "选择",
    cancelSelection: "取消选择",
    buryPickSeven: "选 7 张",
    play: "出牌",
    bury: "扣牌",
    declare: "亮主",
    redeclare: "抢亮",
    counter: "反主",
    counterPass: "不反主",
    beat: "毙牌",
    startGame: "开始发牌",
    toggleLastTrickOpen: "上一轮",
    toggleLastTrickClose: "收起上一轮",
    cardFace: (label) => `牌面：${label}`,
  },
  patterns: {
    triple: "刻子",
    tractor: "拖拉机",
    train: "火车",
    bulldozer: "推土机",
    throw: "甩牌",
    leadTrump: "吊主",
  },
  outcome: {
    bankerBigWinTitle: "打家方大光",
    bankerSmallWinTitle: "打家方小光",
    bankerWinTitle: "打家方获胜",
    defenderWinTitle: "非打家方获胜",
    defenderLevelUpTitle: "非打家方升级",
    winTitle: "获胜",
    lossTitle: "失败",
  },
  roles: {
    ready: "等待开局",
    dealingBanker: "当前亮主",
    dealingWaiting: "等待亮主",
    counteringBanker: "待反主",
    counteringWaiting: "反主确认中",
    buryingBanker: "扣底中",
    buryingWaiting: "等待开打",
    callingBanker: "叫朋友中",
    callingWaiting: "等待叫朋友",
    banker: "打家",
    defender: "非打家",
    friend: "朋友",
    unknown: "阵营待揭晓",
  },
  friend: {
    hintCalling: "叫朋友中",
    hintBeforeCall: "待叫朋友",
    fixedHint: "",
    pendingLabel: "待定",
    stateCalling: "叫牌中",
    stateNotStarted: "未开始",
    stateNoFriend: "1打4",
    stateRevealed: "已现",
    stateWaiting: (occurrence, seen) => `等第${occurrence}张 · 已出${seen}`,
    ownerHidden: "身份未明",
    oneVsFour: "1打4",
    ownerRevealed: (name) => `${name}`,
    pickerHint: "先选第几张，再选花色和点数。常见找法是副牌 A，或者主牌里的大王。",
    pickerPreview: (label) => `当前将叫：${label}`,
    statusRevealed: (playerName) => `${playerName} 站队了`,
    statusMisplayed: (playerName) => `${playerName} 误出朋友牌 · 1打4`,
    searching: "找朋友",
    assisting: "帮找朋友",
  },
  phase: {
    gameOver: "牌局结束",
    ready: "等待开始",
    dealing: "发牌中",
    bottomReveal: "翻底定主",
    countering: "最后反主",
    burying: "扣底中",
    callingFriend: "叫朋友中",
    ending: "结算中",
    pause: "本轮结算中",
    playing: "出牌中",
    centerDealing: "发牌 / 抢亮",
    centerBottomReveal: "翻底展示",
    centerBurying: "整理底牌",
    centerCallingFriend: "叫朋友",
    centerPause: "本轮展示中",
  },
  hud: {
    readyLeader: "等待玩家点击开始发牌",
    currentDeclarationNone: "当前亮主：暂无",
    currentDeclaration: (name) => `当前亮主：${name}`,
    currentBanker: (name) => `当前打家：${name}`,
    currentCounter: (name) => `当前反主：${name}`,
    endingLeader: "牌局已结束，正在结算",
    currentLeader: (name) => `当前首家：${name}`,
    bankerWaiting: "待亮主确定",
    bankerAwaitHuman: "待玩家1确认",
    bottomReveal: "翻底结果展示中",
    countering: "待反主确认",
    burying: "待扣底完成",
    callingFriend: "待叫朋友完成",
    bankerSeat: (bankerId) => `玩家${bankerId}`,
    trickWaiting: "等待开始",
    trickAwaitingHuman: "补亮等待",
    trickDealingProgress: (dealIndex, total) => `发至 ${dealIndex} / ${total}`,
    trickBottomReveal: "展示底牌",
    trickCountering: "发牌完成",
    trickBurying: "整理底牌",
    trickCallingFriend: "选择朋友牌",
    trickEnding: "最终结算",
    trickPlaying: (trickNumber) => `第 ${trickNumber} 轮`,
  },
  scorePanel: {
    ended: "本局已结束",
    ready: (firstPlayerId) => `新牌局已就绪。当前由玩家${firstPlayerId}先抓牌，点击“开始发牌”后进入抓牌与亮主流程。`,
    dealingAwaitHuman: "发牌结束。其他玩家都没有亮主，玩家1可在 15 秒内决定是否补亮；超时后再翻底定主。",
    dealing: "发牌进行中，可用 2/3 张同花色级牌亮主，也可用 2/3 张同色王亮无主；若始终无人亮主，则由先抓牌玩家翻底定主做打家。打无主时，王和本局级牌都算主。",
    bottomReveal: (message) => `${message} 已翻开的底牌会公开展示 30 秒后进入扣底。`,
    countering: (playerId) => `最后反主阶段：当前轮到玩家${playerId}，30 秒内决定是否反主。`,
    buryingSelf: "你已拿起底牌，请在 60 秒内选 7 张重新扣底。",
    buryingOther: "打家正在 60 秒倒计时内整理底牌并重新扣 7 张。",
    callingFriendSelf: "你已扣底完成，请先叫朋友，再开始出牌。",
    callingFriendOther: "打家正在叫朋友，稍后进入正式出牌。",
    ending: "本局已出完最后一张牌，正在整理结算结果。",
    unresolvedFriend: "朋友未揭晓前，抓分先记在各玩家自己名下。",
    pause: "本轮暂停中，准备进入下一轮",
    currentTurn: (playerId) => `当前轮到玩家${playerId}出牌`,
  },
  bottom: {
    ended: "牌局结束，底牌已全部亮出。",
    revealing: "当前处于翻底定主展示阶段，已翻开的底牌会公开 30 秒后进入扣底。",
    hidden: "局中只有打家本人可以翻看底牌。",
    burying: "你已拿起底牌。整理后请从手中选出 7 张重新扣底；扣完后不能再换。",
    score: (points) => `当前底牌分 ${points} 分，仅打家本人可翻看。`,
    unavailable: "当前不可查看底牌",
    revealFallback: "无人亮主，由先抓牌玩家翻底定主。",
    resultLabel: "底牌亮出",
  },
  seat: {
    selfControlled: "本人操控",
    aiControlled: "电脑操控",
    handCountLabel: "剩余手牌",
    personalScoreLabel: "个人得分",
    levelLabel: (level) => `Lv:${level}`,
  },
  trickSpot: {
    self: "我的本轮出牌区",
    other: (name) => `${name}出牌区`,
    ready: "等待开始发牌",
    dealing: "等待发牌或亮主",
    bottomReveal: "等待翻底展示",
    burying: "等待打家扣底",
    callingFriend: "等待打家叫朋友",
    default: "本轮尚未出牌",
  },
  hand: {
    ready: (level, firstPlayerId) => `新牌局已准备好。你当前是 Lv:${level}，本局由玩家${firstPlayerId}先抓牌，点击“开始发牌”后进入抓牌和亮主。`,
    dealingAwaitHuman: (count, countdown, options) => `当前共 ${count} 张，其他玩家都没亮主；你可在 ${countdown} 秒内补亮：${options.join(" / ")}。`,
    dealingAwaitHumanNoOption: (count) => `当前共 ${count} 张，其他玩家都没亮主，等待翻底定主。`,
    dealingCanDeclare: (count, options) => `当前共 ${count} 张，已可亮主：${options.join(" / ")}。`,
    dealingNoDeclare: (count, level) => `当前共 ${count} 张，发牌中按花色分组显示；你当前是 Lv:${level}，拿到 2/3 张同花色 ${level} 或 2/3 张同色王即可亮主。`,
    counteringCan: (count, option) => `当前共 ${count} 张，你可以用 ${option} 进行最后反主。`,
    counteringCannot: (count) => `当前共 ${count} 张，你没有更强主牌可用于最后反主。`,
    bottomReveal: (count) => `当前共 ${count} 张，正在展示翻底定主结果；已翻开的底牌会保留 30 秒后由打家拿底并扣底。`,
    buryingSelf: (count) => `当前共 ${count} 张，请选出 7 张重新扣底。扣完后不能再换。`,
    buryingOther: (count) => `当前共 ${count} 张，等待打家整理底牌。`,
    callingFriendSelf: (count) => `当前共 ${count} 张，请先在弹出的菜单里叫朋友，再进入首轮出牌。`,
    callingFriendOther: (count) => `当前共 ${count} 张，等待打家叫朋友。`,
    playing: (count) => `当前共 ${count} 张，点击牌即可选择；首家只能出同一门的合法牌型，支持单张、对子、拖拉机、火车、4 对及以上的宇宙飞船、刻子、推土机和甩牌。`,
    setupSpecialLabelWithTrump: "当前主牌",
    setupSpecialLabelWithoutTrump: "常主",
    specialLabelNormal: "主牌",
  },
  actionHint: {
    ready: "新牌局等待开始。点击“开始发牌”后，大家才会从空手进入逐张发牌。",
    dealingAwaitHuman: (countdown, declaration) => `其他玩家都没亮主。你可在 ${countdown} 秒内补亮 ${declaration}；若不亮，则转入翻底定主。`,
    dealingAwaitHumanNoOption: "其他玩家都没亮主，等待翻底定主。",
    dealingCanDeclare: (declaration) => `发牌中。你现在可以亮主：${declaration}。如果不点“亮主”，发牌会继续进行。`,
    dealing: "发牌中。亮主顺序为 2 张级牌 < 2 张小王 < 2 张大王 < 3 张级牌 < 3 张小王 < 3 张大王。",
    bottomReveal: "无人亮主，正在公开展示已翻开的翻底结果。30 秒后进入打家扣底。",
    counteringWait: (playerId) => `最后反主阶段。当前由玩家${playerId}决定是否反主，请等待。`,
    counteringCan: (declaration) => `最后反主阶段。你可以用 ${declaration} 反主；顺序固定为 2 张级牌 < 2 张小王 < 2 张大王 < 3 张级牌 < 3 张小王 < 3 张大王。`,
    counteringCannot: "最后反主阶段。你没有更高一档的合法反主组合，30 秒后会自动不反主。",
    buryingWait: "打家正在整理底牌，请等待。",
    buryingReady: "已选择 7 张底牌，可以确认扣牌。",
    buryingPicking: (count) => `请从手中选出 7 张重新扣底。当前已选 ${count} 张。`,
    callingFriendSelf: "请先叫朋友。通常会先选一门花色，再选点数，确认后才进入正式出牌。",
    callingFriendOther: "打家正在叫朋友，请稍候。",
    ending: "最后一张已打完，正在结算本局结果。",
    beatReady: (cards) => `已选择：${cards.join("、")}。当前选择构成毙牌，可以点“毙牌”确认。`,
    playingIdle: "选择要出的牌。出牌直接落在桌布虚线区；轮到你时有 15 秒，超时会自动选择一手合法牌。",
    selectionValid: (cards) => `已选择：${cards.join("、")}。花色内已按从大到小排列。`,
  },
  lastTrick: {
    empty: "当前还没有上一轮记录。",
    meta: (trickNumber, winnerName, points) => `第 ${trickNumber} 轮 · 胜者：${winnerName} · 本轮 ${points} 分`,
  },
  debug: {
    title: "调试看牌",
    empty: "当前没有手牌。",
    handCount: (name, count) => `${name} 当前手牌 ${count} 张`,
    noDecision: "当前还没有这位玩家的 AI 决策记录。",
    decisionHistoryIndex: (current, total) => `第 ${current} / ${total} 条`,
    decisionPrev: "上一条",
    decisionNext: "下一条",
    latestDecision: (name, mode, primary, secondary, trickNumber) => `${name} ${trickNumber ? `第 ${trickNumber} 轮 · ` : ""}${({
      follow: "跟牌",
      lead: "首发",
      declare: "亮主",
      counter: "反主",
    }[mode] || "首发")} · 主目标 ${primary} · 次目标 ${secondary}`,
    selectedCards: (cards) => `最终选择：${cards}`,
    decisionStats: (timeMs, candidateCount, maxRolloutDepth, extendedRolloutCount) => `耗时 ${timeMs}ms · 候选 ${candidateCount} 个 · 最深 ${maxRolloutDepth} 层 · 双层前瞻 ${extendedRolloutCount} 个`,
    candidateTitle: (index, score) => `候选 ${index} · 总分 ${score}`,
    candidateMeta: (source, tags) => `来源 ${source}${tags ? ` · ${tags}` : ""}`,
    candidateScores: (heuristic, rollout, future) => `启发式 ${heuristic} · rollout ${rollout} · future ${future}`,
    candidateRollout: (depth, flags) => `搜索深度 ${depth}${flags ? ` · ${flags}` : ""}`,
    evaluationSummary: (total, primary, secondary) => `评估 ${total} · ${primary} / ${secondary}`,
    sectionDecision: "AI 决策",
    sectionHand: "暗手",
  },
  friendPicker: {
    suitOptions: [
      { value: "hearts", label: "红桃" },
      { value: "spades", label: "黑桃" },
      { value: "diamonds", label: "方块" },
      { value: "clubs", label: "梅花" },
      { value: "joker", label: "王" },
    ],
    occurrenceOptions: [
      { value: 1, label: "第一张" },
      { value: 2, label: "第二张" },
      { value: 3, label: "第三张" },
    ],
  },
  rules: {
    throwPenaltySummaryDefender: (penalty) => `非打家少 ${penalty} 分`,
    throwPenaltySummaryBanker: (penalty) => `非打家加 ${penalty} 分`,
    validation: {
      selectCards: "请选择要出的牌。",
      leadSupported: "首家只能出同一门的合法牌型，支持单张、对子、拖拉机、火车、4 对及以上的宇宙飞船、刻子、推土机和基础甩牌；末手也不能混花色出牌。",
      buryPointLimit: (points, limit) => `当前所选底牌共 ${points} 分，超过 ${limit} 分上限；请改扣不超过 ${limit} 分。`,
      followCount: (count) => `这一轮需要跟 ${count} 张牌。`,
      sameSuitFirst: "有足够同门牌时，必须先跟同门。",
      pairMustFollow: "对家出对时，你有对子就必须跟对子；三张刻子不用强拆成对。",
      tripleMustFollow: "首家出刻子时，你有刻子就必须跟刻子。",
      tripleFollowPair: "首家出刻子时，没有刻子也要尽量跟对子。",
      trainMustFollow: "首家出拖拉机、火车或宇宙飞船时，你有同长度连对就必须跟连对。",
      trainFollowPairs: "首家出拖拉机、火车或宇宙飞船时，没有连对也要尽量跟对子；三张刻子不用拆对。",
      bulldozerMustFollow: "首家出推土机时，你有同长度推土机就必须跟推土机。",
      bulldozerTriples: "首家出推土机时，你有刻子就必须先跟刻子。",
      bulldozerPairs: "首家出推土机时，你有对子就必须跟对子；两对即可，不需要把三张硬拆成对。",
      samePattern: "有同牌型可跟时，必须按同牌型跟牌。",
      exhaustSuit: "同门牌不够时，必须把手里剩余的同门牌全部跟出。",
    },
    bottomPenaltyLabels: {
      trump: {
        single: "单张主级牌扣底",
        pair: "两张主级牌扣底",
        triple: "三张主级牌扣底",
        tractor: "含主级牌拖拉机扣底",
        train: "含主级牌火车 / 宇宙飞船扣底",
        bulldozer: "含主级牌推土机扣底",
      },
      vice: {
        single: "单张副级牌扣底",
        pair: "两张副级牌扣底",
        triple: "三张副级牌扣底",
        tractor: "含副级牌拖拉机扣底",
        train: "含副级牌火车 / 宇宙飞船扣底",
        bulldozer: "含副级牌推土机扣底",
      },
    },
    bottomScoreLabels: {
      single: "单扣",
      pair: "对扣",
      triple: "刻子扣",
      tractor: "拖拉机扣",
      train: "火车扣",
      bulldozer: "推土机扣",
      throw: "甩牌扣",
    },
  },
  log: {
    setupGame: (playerId) => `新牌局已准备好。下一局由玩家${playerId}先抓牌，点击“开始发牌”后正式进入发牌阶段。`,
    startCallingFriend: (name) => `${name} 已扣底完成，当前需要先叫朋友，再进入出牌。`,
    friendCalled: (label) => `已叫朋友：${label}。`,
    enterPlaying: (name) => `进入出牌阶段，${name} 先出牌。`,
    startDealing: "开始发牌。每位玩家按自己的等级牌亮主或反主。",
    counterPhaseStart: (name, declaration) => `发牌结束，当前亮主为 ${name} 的 ${declaration}。`,
    counterPhaseIntro: "进入最后反主阶段。若没人反主，本局将按当前亮主进入出牌。",
    awaitingHumanDeclaration: "发牌结束，其他玩家都没有亮主。玩家1可在 15 秒内决定是否亮主；若超时未亮，则进入翻底定主。",
    bottomRevealAnnouncement: (name) => `${name} 翻底定主`,
    declare: (name, declaration) => `${name} 亮主：${declaration}。`,
    redeclare: (name, declaration) => `${name} 抢亮：${declaration}。`,
    counterDeclared: (name, isHuman) => `${name}${isHuman ? " 完成了最后反主" : " 在最后反主阶段完成反主"}。`,
    counterPass: (name, isTimeout) => `${name}${isTimeout ? " 反主超时，自动不反主" : " 选择不反主"}。`,
    counterEnd: "最后反主阶段结束，无人继续反主。",
    buryComplete: (name) => `${name} 已重新扣下 7 张底牌。`,
    takeBottom: (name) => `${name} 拿起底牌，请重新整理并扣下 7 张牌。`,
    throwFailure: (name, cards, penalty, summary) => `${name} 甩牌失败，强制改出：${cards.join("、")}，扣 ${penalty} 分（${summary}）。`,
    throwFailureAnnouncement: (name, penalty) => `${name} 甩牌失败 · 扣${penalty}分`,
    play: (name, cards) => `${name} 出牌：${cards.join("、")}。`,
    beatAnnouncement: (name) => `${name} 毙牌`,
    coverBeatAnnouncement: (name) => `${name} 盖毙`,
    friendMisplayed: (name, target) => `${name} 误打出了${target}，本局无朋友，变为 1 打 4。`,
    friendRevealed: (name, target) => `${name} 打出了${target}，朋友身份揭晓。`,
    teamsRevealed: (points) => `阵营已揭晓，非打家当前累计 ${points} 分。`,
    trickWon: (name, trickNumber, points) => `${name} 赢下第 ${trickNumber} 轮，获得 ${points} 分。`,
    finalBottomScore: (basePoints, multiplier, bottomPoints, label) => `最后一轮由非打家方获胜，底牌分按最多 25 分封顶后以${label} x${multiplier}计入（封顶后 ${basePoints} 分），共加 ${bottomPoints} 分。`,
    finalBottomPenalty: (label, levels) => `非打家以${label}完成扣底，打家额外降 ${levels} 级。`,
    unrevealedFriendFinish: "本局朋友牌始终未被他人打出，按 1 打 4 结算。",
  },
  result: {
    countdown: (countdown) => `30 秒后自动开局：${countdown}`,
  },
};

// 生成牌的说明文本。
function describeCard(card) {
  if (!card) return "";
  if (card.rank === "RJ") return TEXT.cards.bigJoker;
  if (card.rank === "BJ") return TEXT.cards.smallJoker;
  return `${SUIT_LABEL[card.suit]} ${card.rank}`;
}

// 获取出现序号文案。
function getOccurrenceLabel(occurrence = 1) {
  return TEXT.occurrences[occurrence] || `第${occurrence}张`;
}

// 生成目标牌的说明文本。
function describeTarget(target) {
  const prefix = getOccurrenceLabel(target.occurrence ?? 1);
  if (target.suit === "joker") {
    return target.rank === "RJ" ? `${prefix}${TEXT.cards.bigJoker}` : `${prefix}${TEXT.cards.smallJoker}`;
  }
  return `${prefix}${SUIT_LABEL[target.suit]} ${target.rank}`;
}

// 获取无主反主文案。
function getNoTrumpCounterLabel(entry) {
  const baseLabel = getNoTrumpDeclarationLabel(entry);
  return baseLabel ? `${baseLabel}反无主` : "";
}

// 获取无主亮主声明文案。
function getNoTrumpDeclarationLabel(entry) {
  if (!entry || entry.suit !== "notrump") return "";
  const rank = entry.cards?.[0]?.rank;
  if (rank === "RJ") return `${entry.count}张大王`;
  if (rank === "BJ") return `${entry.count}张小王`;
  return `${entry.count}张王`;
}

// 格式化亮主声明。
function formatDeclaration(entry) {
  if (entry?.source === "bottom") {
    return entry.suit === "notrump"
      ? TEXT.declarations.bottomNoTrump
      : `${TEXT.declarations.bottomSuitPrefix}${SUIT_LABEL[entry.suit]}`;
  }
  if (entry.suit === "notrump") {
    return getNoTrumpDeclarationLabel(entry);
  }
  return `${SUIT_LABEL[entry.suit]} ${entry.rank} x${entry.count}`;
}

// 返回操作提示里使用的花色名称。
function getActionSuitLabel(entry) {
  return entry ? SUIT_LABEL[entry.suit] : "";
}

// 更新结算倒计时文案。
function updateResultCountdownLabel() {
  if (!dom.resultCountdown || !dom.restartBtn) return;
  dom.resultCountdown.textContent = TEXT.result.countdown(state.resultCountdownValue);
  dom.restartBtn.textContent = state.resultCountdownValue > 0
    ? TEXT.buttons.restartWithCountdown(state.resultCountdownValue)
    : TEXT.buttons.restart;
}

// 获取牌型文案。
function getPatternLabel(patternOrType) {
  const pattern = typeof patternOrType === "string"
    ? { type: patternOrType }
    : (patternOrType || {});
  if (pattern.type === "train") {
    return pattern.chainLength >= 4 ? "宇宙飞船" : TEXT.patterns.train;
  }
  return TEXT.patterns[pattern.type] || "";
}

// 获取特殊牌型播报。
function getSpecialPatternAnnouncement(pattern, playerId) {
  if (!pattern?.ok) return "";
  const label = getPatternLabel(pattern);
  if (!label) return "";
  return `${getPlayer(playerId).name} 打出${label}`;
}

// 获取出牌播报文案。
function getPlayAnnouncement(playerId, pattern, options = {}) {
  const player = getPlayer(playerId);
  if (!player || !pattern?.ok) return "";
  const parts = [];
  if (options.leadTrump) {
    parts.push(TEXT.patterns.leadTrump);
  }
  const special = options.isLead ? getPatternLabel(pattern) : "";
  if (special) {
    parts.push(special);
  }
  if (parts.length === 0) return "";
  return `${player.name} ${parts.join(" · ")}`;
}

// 获取找朋友进度播报。
function getFriendProgressAnnouncement(playerId, cards) {
  if (state.currentTrick.length !== 1) return null;
  if (!state.friendTarget || isFriendTeamResolved()) return null;
  if (state.friendTarget.suit === "joker") return null;
  const hasTargetSuit = cards.some((card) => isFriendSearchSignalCard(card));
  if (!hasTargetSuit) return null;
  const hitExactTarget = cards.some(
    (card) => isFriendTargetMatchCard(card)
  );
  if (hitExactTarget) return null;
  return {
    message: `${getPlayer(playerId).name} ${playerId === state.bankerId ? TEXT.friend.searching : TEXT.friend.assisting}`,
    tone: "default",
  };
}

// 获取单轮结果播报。
function getTrickOutcomeAnnouncement(winnerId) {
  if (winnerId === 1) return "上轮你大，请出牌";
  return `上轮${getPlayer(winnerId).name}大`;
}

/**
 * 作用：
 * 根据非打家最终总分与扣底结果，生成本局胜负和升级结论。
 *
 * 为什么这样写：
 * 扣底只会影响“额外降级”和“最终总分”，不会单独越过 120 分门槛直接改判胜负；这样可以把“成功扣底”和“真正翻盘”区分开，和当前规则保持一致。
 *
 * 输入：
 * @param {number} points - 已经包含底牌加分后的非打家最终总分
 * @param {{bottomPenalty?: {levels: number, label: string} | null}} options - 扣底惩罚信息
 *
 * 输出：
 * @returns {{title: string, body: string, bankerLevels: number, defenderLevels: number, winner: string}} 本局结算摘要
 *
 * 注意：
 * - `points` 必须传最终分数，不能传扣底前分数
 * - 成功扣底但总分仍不到 120 时，只触发额外降级，不直接改判非打家获胜
 */
function getOutcome(points, options = {}) {
  const defendersWin = points >= 120;
  if (!defendersWin && points === 0) {
    return {
      title: TEXT.outcome.bankerBigWinTitle,
      body: options.bottomPenalty?.levels > 0
        ? `非打家总分为 0 分，虽然最后一轮完成了${options.bottomPenalty.label}，但仍未翻盘；打家方大光，升 3 级。`
        : "非打家总分为 0 分，且未形成主级牌成功扣底，打家方升 3 级。",
      bankerLevels: 3,
      defenderLevels: 0,
      winner: "banker",
    };
  }
  if (!defendersWin && points < 60) {
    return {
      title: TEXT.outcome.bankerSmallWinTitle,
      body: options.bottomPenalty?.levels > 0
        ? `非打家总分为 ${points} 分，虽然最后一轮完成了${options.bottomPenalty.label}，但仍未翻盘；打家方升 2 级。`
        : `非打家总分为 ${points} 分，未到 60 分，且未形成主级牌成功扣底，打家方升 2 级。`,
      bankerLevels: 2,
      defenderLevels: 0,
      winner: "banker",
    };
  }
  if (!defendersWin && points < 120) {
    return {
      title: TEXT.outcome.bankerWinTitle,
      body: options.bottomPenalty?.levels > 0
        ? `非打家总分为 ${points} 分，虽然最后一轮完成了${options.bottomPenalty.label}，但仍未翻盘；打家方正常获胜，升 1 级。`
        : `非打家总分为 ${points} 分，未到 120 分，且未形成主级牌成功扣底，打家方正常获胜，升 1 级。`,
      bankerLevels: 1,
      defenderLevels: 0,
      winner: "banker",
    };
  }
  if (points < 165) {
    return {
      title: TEXT.outcome.defenderWinTitle,
      body: options.bottomPenalty?.levels > 0
        ? `非打家总分为 ${points} 分，并已完成${options.bottomPenalty.label}。非打家方获胜，但本局不升级。`
        : `非打家总分为 ${points} 分，已达到 120 分但未到 165 分。非打家方获胜，但本局不升级。`,
      bankerLevels: 0,
      defenderLevels: 0,
      winner: "defender",
    };
  }
  const levels = 1 + Math.floor((points - 165) / 60);
  return {
    title: TEXT.outcome.defenderLevelUpTitle,
    body: `非打家总分为 ${points} 分，按你当前规则从 165 分开始升级，本局非打家方升 ${levels} 级。`,
    bankerLevels: 0,
    defenderLevels: levels,
    winner: "defender",
  };
}

// 获取等级结算摘要。
function getLevelSettlementSummary(outcome) {
  const parts = [];
  if (outcome.bankerLevels > 0) {
    const bankerLevels = getBankerTeamIds()
      .map((playerId) => `玩家${playerId} Lv:${getPlayerLevel(playerId)}`)
      .join("，");
    parts.push(`打家方升级后：${bankerLevels}`);
  }
  if (outcome.defenderLevels > 0) {
    const defenderLevels = getDefenderIds()
      .map((playerId) => `玩家${playerId} Lv:${getPlayerLevel(playerId)}`)
      .join("，");
    parts.push(`非打家方升级后：${defenderLevels}`);
  }
  if (parts.length === 0) {
    parts.push("当前等级保持不变，下一局继续按各自 Lv 亮主。");
  } else {
    parts.push("下一局继续按各自 Lv 亮主。");
  }
  return ` ${parts.join(" ")}`;
}

// 获取扣底结果文本。
function getBottomResultText(bottomResult) {
  if (!bottomResult) return "";
  if (!bottomResult.defenderBottom) {
    return ` 最后一轮由${bottomResult.playerName}保底成功，未发生非打家扣底；下一局由玩家${bottomResult.nextLeadPlayerId}先抓牌。`;
  }
  if (bottomResult.penalty) {
    return ` ${bottomResult.playerName}完成扣底，并以${bottomResult.penalty.label}成功扣底，打家额外降 ${bottomResult.penalty.levels} 级；下一局由玩家${bottomResult.nextLeadPlayerId}先抓牌。`;
  }
  return ` ${bottomResult.playerName}完成扣底，但未形成主级牌成功扣底；本次只计底牌分，不触发翻盘降级。下一局由玩家${bottomResult.nextLeadPlayerId}先抓牌。`;
}

// 生成牌文案的简短表示。
function shortCardLabel(card) {
  if (card.rank === "RJ") return TEXT.cards.bigJoker;
  if (card.rank === "BJ") return TEXT.cards.smallJoker;
  return `${SUIT_SYMBOL[card.suit] || ""}${card.rank}`;
}
