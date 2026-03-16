const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  context.window = context;
  context.globalThis = context;
  context.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
  context.document = {
    cookie: "",
    querySelector() {
      return {
        classList: { add() {}, remove() {}, toggle() {} },
      };
    },
    getElementById() {
      return {
        classList: { add() {}, remove() {}, toggle() {} },
        textContent: "",
        innerHTML: "",
      };
    },
  };

  vm.createContext(context);
  const files = [
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/text.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/game.js"),
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

function runTests(context) {
  const testSource = `
    function makeCard(suit, rank, id = suit + "-" + rank) {
      return { suit, rank, id };
    }

    state.players = PLAYER_ORDER.map((id) => ({
      id,
      name: "玩家" + id,
      hand: [],
      played: [],
      roundPoints: 0,
      capturedPoints: 0,
      isHuman: id === 1,
    }));
    state.bankerId = 1;
    state.trumpSuit = "spades";
    state.levelRank = "2";
    state.declaration = null;
    state.gameOver = false;

    const failures = [];

    state.friendTarget = {
      suit: "clubs",
      rank: "A",
      occurrence: 1,
      matchesSeen: 0,
      failed: false,
      revealed: false,
      revealedBy: null,
      label: "第一张梅花A",
    };
    state.currentTrick = [{ playerId: 1, cards: [makeCard("clubs", "2", "lead-vice-level")] }];
    const viceLeadAnnouncement = getFriendProgressAnnouncement(1, [makeCard("clubs", "2", "lead-vice-level")]);
    if (viceLeadAnnouncement !== null) {
      failures.push("副级牌吊主不应被识别为找朋友播报");
    }

    state.currentTrick = [{ playerId: 1, cards: [makeCard("clubs", "K", "lead-natural-suit")] }];
    const naturalLeadAnnouncement = getFriendProgressAnnouncement(1, [makeCard("clubs", "K", "lead-natural-suit")]);
    if (!naturalLeadAnnouncement || !String(naturalLeadAnnouncement.message || "").includes("找朋友")) {
      failures.push("普通同花色领出仍应保留找朋友播报");
    }

    state.friendTarget = {
      suit: "clubs",
      rank: "2",
      occurrence: 1,
      matchesSeen: 0,
      failed: false,
      revealed: false,
      revealedBy: null,
      label: "第一张梅花2",
    };
    const viceTargetReveal = maybeRevealFriend(2, [makeCard("clubs", "2", "exact-vice-level")]);
    if (viceTargetReveal !== null || state.friendTarget.matchesSeen !== 0 || state.friendTarget.revealed) {
      failures.push("副级牌不应作为朋友牌触发站队");
    }

    globalThis.__friendSignalFailures = failures;
  `;

  vm.runInContext(testSource, context, { filename: "friend-signal-inline.js" });
  return context.__friendSignalFailures;
}

const context = loadContext();
const failures = runTests(context);

if (failures.length > 0) {
  console.error("Friend signal regression failures:");
  for (const failure of failures) {
    console.error("- " + failure);
  }
  process.exit(1);
}

console.log("Friend signal regression passed.");
