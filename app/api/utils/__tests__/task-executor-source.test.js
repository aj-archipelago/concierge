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

describe("task executor progress hooks", () => {
    test("dispatches parsed progress chunks to task handlers before completion", () => {
        const src = read("app/api/utils/task-executor.mjs");
        const handleProgressUpdateMatch = src.match(
            /async\s+handleProgressUpdate\([^)]*\)\s*{[\s\S]*?\n\s{4}async\s+parseProgressData/,
        );

        expect(handleProgressUpdateMatch).toBeTruthy();
        expect(handleProgressUpdateMatch[0]).toMatch(
            /await\s+this\.processProgressData\(/,
        );
        expect(handleProgressUpdateMatch[0]).toMatch(
            /data\?\.requestProgress\?\.data,[\s\S]*dataObject,[\s\S]*data\?\.requestProgress\?\.info,[\s\S]*infoObject/,
        );
    });

    test("optional task progress hooks receive raw and parsed payloads", () => {
        const src = read("app/api/utils/task-executor.mjs");
        const processProgressDataMatch = src.match(
            /async\s+processProgressData\([^)]*\)\s*{[\s\S]*?\n\s{4}async\s+processCompletedData/,
        );

        expect(processProgressDataMatch).toBeTruthy();
        expect(processProgressDataMatch[0]).toMatch(/handler\.handleProgress/);
        expect(processProgressDataMatch[0]).toMatch(
            /rawData,[\s\S]*dataObject,[\s\S]*rawInfo,[\s\S]*infoObject,[\s\S]*\{\s*\.\.\.metadata,\s*userId\s*\}/,
        );
    });
});

describe("task executor idle timeout handling", () => {
    test("tracker honors the configured BullMQ job timeout", () => {
        const src = read("app/api/utils/task-executor.mjs");

        expect(src).toMatch(
            /const\s+queueJobId\s*=\s*job\?\.id\?\.toString\?\.\(\)\s*\|\|\s*job\?\.id\s*\|\|\s*null/,
        );
        expect(src).toMatch(/id:\s*queueJobId\s*\|\|\s*taskId/);
        expect(src).toMatch(/opts:\s*job\?\.opts\s*\|\|\s*\{\}/);
        expect(src).toMatch(/function\s+getConfiguredJobTimeoutMs\(job\)/);
        expect(src).toMatch(/Number\(job\?\.opts\?\.timeout\)/);
        expect(src).toMatch(
            /this\.idleTimeoutMs\s*=\s*Math\.max\([\s\S]*taskIdleTimeoutMs,[\s\S]*getConfiguredJobTimeoutMs\(job\)\s*\|\|\s*0,[\s\S]*\)/,
        );
    });
});

describe("task executor transcription error handling", () => {
    test("normalizes private YouTube progress errors before storing status text", () => {
        const src = read("app/api/utils/task-executor.mjs");

        expect(src).toMatch(
            /getNormalizedYouTubeTranscriptionAccessErrorMessage/,
        );
        expect(src).toMatch(/async\s+handleProgressError\(/);
        expect(src).toMatch(
            /this\.updateRequestStatus\(\s*"failed",\s*getTaskStatusText\(errorObj,\s*this\.errorContext\),\s*\)/,
        );
    });
});

describe("task status synchronization", () => {
    test("does not overwrite terminal failed tasks with completed BullMQ jobs", () => {
        const src = read("app/api/utils/task-utils.mjs");

        expect(src).toMatch(/terminalTaskStatuses/);
        expect(src).toMatch(
            /const\s+isTerminalTask\s*=\s*terminalTaskStatuses\.has\(task\.status\)/,
        );
        expect(src).toMatch(/!\s*isTerminalTask/);
        expect(src).toMatch(/status\s*===\s*"failed"/);
        expect(src).toMatch(
            /normalizeTaskStatusText\(\s*task\.statusText,\s*task\s*\)/,
        );
    });

    test("active worker status writes do not overwrite terminal tasks", () => {
        const src = read("app/api/utils/task-executor.mjs");

        expect(src).toMatch(/const\s+terminalTaskStatuses\s*=\s*new\s+Set/);
        expect(src).toMatch(/const\s+activeTaskStatusFilter/);
        expect(src).toMatch(/async\s+isTaskActive\(/);
        expect(src).toMatch(
            /status:\s*activeTaskStatusFilter[\s\S]*?\}\s*,\s*update/,
        );
        expect(src).toMatch(
            /status:\s*activeTaskStatusFilter[\s\S]*?\}\s*,\s*\{\s*cortexRequestId\s*\}/,
        );
        expect(src).toMatch(
            /progressTracker\.updateRequestStatus\(\s*"completed",\s*null,\s*null,\s*1,\s*\)/,
        );
        expect(src).toMatch(
            /const\s+PROGRESS_WRITE_MIN_INTERVAL_MS\s*=\s*15_000/,
        );
        expect(src).toMatch(/const\s+PROGRESS_WRITE_MIN_DELTA\s*=\s*0\.05/);
        expect(src).toMatch(/TASK_LIVE_RENEW_INTERVAL_MS/);
        expect(src).toMatch(/markTaskLive/);
        expect(src).toMatch(/isTaskCancellationRequested/);
        expect(src).toMatch(/function\s+getSimpleStatusText/);
        expect(src).toMatch(
            /const\s+shouldPersist\s*=[\s\S]*PROGRESS_WRITE_MIN_DELTA[\s\S]*PROGRESS_WRITE_MIN_INTERVAL_MS/,
        );
        expect(src).toMatch(
            /await\s+this\.writeLiveHeartbeat\(\{[\s\S]*progress:\s*safeProgress/,
        );
        expect(src).toMatch(/setInterval\([\s\S]*TASK_LIVE_RENEW_INTERVAL_MS/);
        expect(src).not.toMatch(
            /findOneAndUpdate\([\s\S]*\{\s*lastHeartbeat:\s*new\s+Date\(\)\s*\}/,
        );
        expect(src).toMatch(/handler\.handleError\s*&&[\s\S]*?isTaskActive/);
        expect(src).toMatch(
            /const\s+wasTaskActive\s*=\s*await\s+this\.isTaskActive\(\)/,
        );
        expect(src).toMatch(/Skipping completion side effects/);
    });

    test("progress subscription failures clean up before best-effort failure writes", () => {
        const src = read("app/api/utils/task-executor.mjs");

        expect(src).toMatch(/this\.progressUpdateChain\s*=\s*Promise\.resolve/);
        expect(src).toMatch(/async\s+handleSubscriptionProgress\(/);
        expect(src).toMatch(
            /catch\s*\(error\)\s*{[\s\S]*?this\.cleanup\(\);[\s\S]*?try\s*{[\s\S]*?await\s+this\.updateRequestStatus\(/,
        );
        expect(src).toMatch(/Error marking failed progress update/);
    });

    test("checks abandoned status after BullMQ synchronization", () => {
        const src = read("app/api/tasks/route.js");

        expect(src).toMatch(
            /const\s+syncedRequests\s*=\s*await\s+Promise\.all/,
        );
        expect(src).toMatch(
            /syncedRequests\.map\(\(task\)\s*=>\s*checkAndUpdateAbandonedTask\(task\)\)/,
        );
    });
});

describe("transcribe task completion", () => {
    test("can store background retranscriptions as alternative tracks", () => {
        const src = read("jobs/tasks/transcribe.mjs");

        expect(src).toMatch(/applyTranscriptionCompletionToState/);
        expect(src).toMatch(/if\s*\(!result\.applied\)/);
    });

    test("does not save background transcription results for terminal tasks", () => {
        const src = read("jobs/tasks/transcribe.mjs");

        expect(src).toMatch(/const\s+activeTaskStatusFilter/);
        expect(src).toMatch(/\{\s*\.\.\.metadata,\s*taskId\s*\}/);
        expect(src).toMatch(
            /Task\.findOne\(\{\s*_id:\s*metadata\.taskId,\s*status:\s*activeTaskStatusFilter,\s*\}\)\.select\("_id"\)/,
        );
        expect(src).toMatch(
            /Skipping transcript save because task is already terminal/,
        );
    });
});
