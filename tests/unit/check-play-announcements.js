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
      return null;
    },
    getElementById() {
      return null;
    },
  };
  context.sortPlayedCards = function sortPlayedCards(cards) {
    return [...cards].sort((a, b) => context.cardStrength(a) - context.cardStrength(b));
  };

  vm.createContext(context);
  const files = [
    path.join(__dirname, "../../src/shared/config.js"),
    path.join(__dirname, "../../src/shared/rules.js"),
    path.join(__dirname, "../../src/shared/text.js"),
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

function runSuite(context) {
  const testSource = `
    state.players = [{ id: 1, name: "玩家1" }];
    state.trumpSuit = "spades";
    state.levelRank = "2";
    state.declaration = null;

    function getPlayer(id) {
      return state.players.find((player) => player.id === id) || null;
    }

    function makePairRun(ranks, suit = "hearts") {
      let seq = 0;
      return ranks.flatMap((rank) => ([
        { id: \`\${suit}-\${rank}-\${seq++}\`, suit, rank },
        { id: \`\${suit}-\${rank}-\${seq++}\`, suit, rank },
      ]));
    }

    const train = classifyPlay(makePairRun(["8", "9", "10"]));
    const spaceship = classifyPlay(makePairRun(["8", "9", "10", "J"]));
    const leadTrumpSingle = classifyPlay([{ id: "spades-A-0", suit: "spades", rank: "A" }]);
    const cases = [
      {
        name: "lead 3-pair run announces train",
        actual: getPlayAnnouncement(1, train, { isLead: true }),
        expected: "玩家1 火车",
      },
      {
        name: "follow 3-pair run does not announce train",
        actual: getPlayAnnouncement(1, train, { isLead: false }),
        expected: "",
      },
      {
        name: "lead 4-pair run announces spaceship",
        actual: getPlayAnnouncement(1, spaceship, { isLead: true }),
        expected: "玩家1 宇宙飞船",
      },
      {
        name: "lead trump single announces diaozhu only",
        actual: getPlayAnnouncement(1, leadTrumpSingle, { isLead: true, leadTrump: true }),
        expected: "玩家1 吊主",
      },
    ];

    const failures = cases.filter((testCase) => testCase.actual !== testCase.expected);
    globalThis.__playAnnouncementResults = { cases, failures };
  `;

  vm.runInContext(testSource, context, { filename: "play-announcement-inline.js" });
  return context.__playAnnouncementResults;
}

const context = loadContext();
const output = runSuite(context);

if (output.failures.length > 0) {
  console.error("Play announcement regression failures:");
  for (const failure of output.failures) {
    console.error(`- ${failure.name}: expected "${failure.expected}", got "${failure.actual}"`);
  }
  process.exit(1);
}

console.log("Play announcement regression passed:");
for (const testCase of output.cases) {
  console.log(`- ${testCase.name}: "${testCase.actual}"`);
}
