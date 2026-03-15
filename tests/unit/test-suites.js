const path = require("path");

const UNIT_TEST_SUITES = [
  {
    name: "AI friend strategy regression",
    file: path.join(__dirname, "check-ai-friend-strategy.js"),
  },
  {
    name: "AI bury strategy regression",
    file: path.join(__dirname, "check-bury-strategy.js"),
  },
  {
    name: "AI intermediate foundation regression",
    file: path.join(__dirname, "check-ai-intermediate-foundation.js"),
  },
  {
    name: "AI intermediate search regression",
    file: path.join(__dirname, "check-ai-intermediate-search.js"),
  },
  {
    name: "AI memory strategy regression",
    file: path.join(__dirname, "check-ai-memory-strategy.js"),
  },
  {
    name: "Play announcement regression",
    file: path.join(__dirname, "check-play-announcements.js"),
  },
  {
    name: "Result subinfo regression",
    file: path.join(__dirname, "check-result-subinfo.js"),
  },
  {
    name: "Throw pattern regression",
    file: path.join(__dirname, "check-throw-patterns.js"),
  },
];

module.exports = {
  UNIT_TEST_SUITES,
};
