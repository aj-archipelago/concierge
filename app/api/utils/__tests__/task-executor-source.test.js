/**
 * @jest-environment node
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("task executor media completion handling", () => {
    test("media-generation tasks with empty terminal data fail instead of completing", () => {
        const src = read("app/api/utils/task-executor.mjs");
        const handleCompletionMatch = src.match(
            /async\s+handleCompletion\([^)]*\)\s*{[\s\S]*?\n\s{4}async\s+processCompletedData/,
        );

        expect(handleCompletionMatch).toBeTruthy();
        expect(handleCompletionMatch[0]).toMatch(
            /this\.job\.data\.type\s*===\s*"media-generation"/,
        );
        expect(handleCompletionMatch[0]).toMatch(
            /missingDataError\.code\s*=\s*"MISSING_COMPLETION_DATA"/,
        );
        expect(handleCompletionMatch[0]).toMatch(
            /return\s+await\s+this\.handleProgressError\(/,
        );
        expect(handleCompletionMatch[0]).toMatch(
            /Media generation completed without returning media data/,
        );
    });
});
