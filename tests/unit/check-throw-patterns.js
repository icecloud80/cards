const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadRulesContext() {
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
  ];
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}

function runRegressionSuite(context) {
  const testSource = `
    state.trumpSuit = "spades";
    state.levelRank = "2";
    state.declaration = null;

    function makeCards(spec, suit = "hearts") {
      let seq = 0;
      return spec.flatMap(([rank, count]) =>
        Array.from({ length: count }, () => ({
          id: \`\${suit}-\${rank}-\${seq++}\`,
          suit,
          rank,
        }))
      );
    }

    function getSignature(pattern) {
      return [...pattern.components]
        .map((component) => \`\${component.type}:\${component.count}:\${component.chainLength || 0}\`)
        .sort()
        .join("|");
    }

    const cases = [
      {
        name: "tractor + triple",
        cards: makeCards([["A", 2], ["K", 2], ["Q", 3]]),
        expectedType: "throw",
        expectedSignature: "tractor:4:2|triple:3:0",
      },
      {
        name: "triple + tractor",
        cards: makeCards([["A", 3], ["K", 2], ["Q", 2]]),
        expectedType: "throw",
        expectedSignature: "tractor:4:2|triple:3:0",
      },
      {
        name: "bulldozer + pair",
        cards: makeCards([["A", 3], ["K", 3], ["Q", 2]]),
        expectedType: "throw",
        expectedSignature: "bulldozer:6:2|pair:2:0",
      },
      {
        name: "exact bulldozer",
        cards: makeCards([["A", 3], ["K", 3], ["Q", 3]]),
        expectedType: "bulldozer",
      },
      {
        name: "exact 3-pair train",
        cards: makeCards([["A", 2], ["K", 2], ["Q", 2]]),
        expectedType: "train",
      },
      {
        name: "exact spaceship",
        cards: makeCards([["A", 2], ["K", 2], ["Q", 2], ["J", 2]]),
        expectedType: "train",
      },
      {
        name: "train should not eat triple",
        cards: makeCards([["A", 2], ["K", 2], ["Q", 2], ["J", 3]]),
        expectedType: "throw",
        expectedSignature: "train:6:3|triple:3:0",
      },
      {
        name: "tractor + triple with extra A",
        cards: makeCards([["A", 3], ["K", 2], ["Q", 2], ["J", 2]]),
        expectedType: "throw",
        expectedSignature: "train:6:3|triple:3:0",
      },
      {
        name: "bulldozer + pair from lower ranks",
        cards: makeCards([["A", 2], ["K", 3], ["Q", 3]]),
        expectedType: "throw",
        expectedSignature: "bulldozer:6:2|pair:2:0",
      },
      {
        name: "extra A prefers triple + tractor",
        cards: makeCards([["A", 3], ["K", 2], ["Q", 2], ["J", 2]]),
        expectedType: "throw",
        expectedSignature: "train:6:3|triple:3:0",
      },
      {
        name: "train beats split pairs",
        cards: makeCards([["A", 2], ["K", 2], ["Q", 2], ["J", 2], ["10", 1]]),
        expectedType: "throw",
        expectedSignature: "single:1:0|train:8:4",
      },
      {
        name: "tractor + triple + single",
        cards: makeCards([["A", 2], ["K", 2], ["Q", 3], ["J", 1]]),
        expectedType: "throw",
        expectedSignature: "single:1:0|tractor:4:2|triple:3:0",
      },
    ];

    const failures = [];
    const results = cases.map((testCase) => {
      const pattern = classifyPlay(testCase.cards);
      const actualType = pattern.type;
      const actualSignature = pattern.type === "throw" ? getSignature(pattern) : "";
      const typeOk = actualType === testCase.expectedType;
      const signatureOk = !testCase.expectedSignature || actualSignature === testCase.expectedSignature;
      if (!pattern.ok || !typeOk || !signatureOk) {
        failures.push({
          name: testCase.name,
          expectedType: testCase.expectedType,
          actualType,
          expectedSignature: testCase.expectedSignature || "",
          actualSignature,
        });
      }
      return {
        name: testCase.name,
        actualType,
        actualSignature,
      };
    });

    globalThis.__throwPatternResults = { results, failures };
  `;

  vm.runInContext(testSource, context, { filename: "throw-regression-inline.js" });
  return context.__throwPatternResults;
}

const context = loadRulesContext();
const output = runRegressionSuite(context);

if (output.failures.length > 0) {
  console.error("Throw regression failures:");
  for (const failure of output.failures) {
    console.error(
      `- ${failure.name}: expected ${failure.expectedType} ${failure.expectedSignature || ""}, got ${failure.actualType} ${failure.actualSignature || ""}`.trim()
    );
  }
  process.exit(1);
}

console.log("Throw regression passed:");
for (const result of output.results) {
  const summary = result.actualSignature ? ` ${result.actualSignature}` : "";
  console.log(`- ${result.name}: ${result.actualType}${summary}`);
}
