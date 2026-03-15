const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const { UNIT_TEST_SUITES } = require("./test-suites");

for (const suite of UNIT_TEST_SUITES) {
  test(suite.name, () => {
    try {
      execFileSync(process.execPath, [suite.file], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const stdout = error.stdout?.trim();
      const stderr = error.stderr?.trim();
      const details = [stdout, stderr].filter(Boolean).join("\n");
      assert.fail(details || `${suite.name} failed`);
    }
  });
}
