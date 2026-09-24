/** @jest-environment node */
import {
    planAutomationRetention,
    pruneAutomationOutputs,
    retainedOutputPaths,
} from "../automation-retention.mjs";
import Automation from "../../models/automation.js";
import Task from "../../models/task.mjs";
import User from "../../models/user.mjs";
import File from "../../models/file.js";
import { authorizedMediaFetch } from "../cfh-client.mjs";
import {
    claimAutomationDispatch,
    releaseAutomationDispatch,
} from "../automation-dispatch-lock.mjs";
import {
    retainedRunLimit,
    isValidRetainedRunLimit,
} from "../../../../src/utils/taskOutputRetention.js";

jest.mock("../../models/automation.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn(), schema: { path: jest.fn() } },
}));
jest.mock("../../models/task.mjs", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        exists: jest.fn(),
        updateOne: jest.fn(),
        schema: { path: jest.fn() },
    },
}));
jest.mock("../../models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
jest.mock("../../models/file.js", () => ({
    __esModule: true,
    default: { exists: jest.fn() },
}));
jest.mock("../cfh-client.mjs", () => ({ authorizedMediaFetch: jest.fn() }));
jest.mock("../automation-dispatch-lock.mjs", () => ({
    claimAutomationDispatch: jest.fn(),
    releaseAutomationDispatch: jest.fn(),
}));

const id = (n) => n.toString(16).padStart(24, "0");
const automation = {
    _id: id(100),
    owner: id(200),
    slug: "newswires",
    schedulerLockToken: "claim",
    latestRunTaskId: id(35),
};
const run = (n) => ({
    _id: id(n),
    automation: {
        outputPath: `automations/newswires/outputs/${id(n)}`,
        htmlOutputPath: `automations/newswires/outputs/${id(n)}/index.html`,
        widgetHtmlOutputPath: `automations/newswires/outputs/${id(n)}/widget.html`,
    },
});
const query = (value) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
});
let runs;
beforeEach(() => {
    jest.resetAllMocks();
    Automation.schema.path.mockReturnValue({});
    Task.schema.path.mockReturnValue({});
    process.env.CORTEX_MEDIA_API_URL =
        "http://localhost:7071/api/MediaFileChunker";
    runs = Array.from({ length: 35 }, (_, i) => run(i + 1));
    Task.find.mockImplementation((filter) => {
        const q = {
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
        };
        q.lean = jest.fn(async () =>
            filter._id
                ? runs
                      .filter((r) => !filter._id.$nin.includes(r._id))
                      .slice(
                          q.skip.mock.calls[0]?.[0] || 0,
                          (q.skip.mock.calls[0]?.[0] || 0) +
                              q.limit.mock.calls[0][0],
                      )
                : runs.slice(-q.limit.mock.calls[0][0]).reverse(),
        );
        return q;
    });
    Task.exists.mockResolvedValue(false);
    File.exists.mockResolvedValue(false);
    Task.updateOne.mockResolvedValue({ modifiedCount: 1 });
    claimAutomationDispatch.mockResolvedValue(automation);
    Automation.findOne.mockReturnValue(query(automation));
    User.findById.mockReturnValue(query({ contextId: "owner-context" }));
    authorizedMediaFetch.mockImplementation(async () => new Response("{}"));
});

test("keeps 30 successful runs by default; zero explicitly keeps everything", async () => {
    expect(retainedRunLimit(undefined)).toBe(30);
    expect(retainedRunLimit(0)).toBe(0);
    expect(isValidRetainedRunLimit(-1)).toBe(false);
    expect(isValidRetainedRunLimit("30")).toBe(false);
    expect(isValidRetainedRunLimit(1.5)).toBe(false);
    const plan = await planAutomationRetention(automation);
    expect(plan.candidates.map((c) => c.taskId)).toEqual(
        [1, 2, 3, 4, 5].map(id),
    );
    expect(Task.find.mock.calls[0][0]).toMatchObject({
        owner: automation.owner,
        automationRefId: automation._id,
        type: "automation-run",
        status: "completed",
    });
    Task.find.mockClear();
    expect(
        await planAutomationRetention({ ...automation, retainedRuns: 0 }),
    ).toEqual({ keep: 0, candidates: [] });
    expect(Task.find).not.toHaveBeenCalled();
});

test("expires only designated files from recorded attempts, including earlier paused turns", async () => {
    const attempts = [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
    ];
    runs[0].metadata = {
        outputAttemptId: attempts[1],
        outputAttemptIds: attempts,
    };
    const paths = retainedOutputPaths(automation, runs[0]);
    expect(paths).toEqual([
        run(1).automation.htmlOutputPath,
        run(1).automation.widgetHtmlOutputPath,
        ...attempts.flatMap((attempt) =>
            ["result.json", "index.html", "widget.html"].map(
                (filename) =>
                    `automations/newswires/outputs/${id(1)}/draft-${attempt}/${filename}`,
            ),
        ),
    ]);
    const result = await pruneAutomationOutputs(automation._id);
    expect(result).toMatchObject({
        expiredRuns: 5,
        deletedFiles: 16,
        errors: [],
    });
});

test("invalid attempt metadata cannot broaden retention to arbitrary paths", () => {
    expect(
        retainedOutputPaths(automation, {
            ...run(1),
            metadata: { outputAttemptIds: ["../scratch"] },
        }),
    ).toBeNull();
    expect(
        retainedOutputPaths(automation, {
            ...run(1),
            metadata: { outputAttemptIds: "anything" },
        }),
    ).toBeNull();
});

test("deletes only exact generated reports with owner-scoped grants, then clears the full result while preserving history", async () => {
    const result = await pruneAutomationOutputs(automation._id, {
        ownerId: automation.owner,
    });
    expect(result).toMatchObject({
        expiredRuns: 5,
        deletedFiles: 10,
        errors: [],
    });
    expect(claimAutomationDispatch).toHaveBeenCalledWith(
        automation._id,
        {
            owner: automation.owner,
        },
        { timestamps: false },
    );
    const [url, options, auth] = authorizedMediaFetch.mock.calls[0];
    expect(new URL(url).searchParams.get("blobPath")).toBe(
        run(1).automation.htmlOutputPath,
    );
    expect(options.method).toBe("DELETE");
    expect(auth.targets).toEqual([
        {
            owner: "owner-context",
            path: run(1).automation.htmlOutputPath,
            actions: ["delete"],
        },
    ]);
    const [filter, update, settings] = Task.updateOne.mock.calls[0];
    expect(filter).toMatchObject({
        owner: automation.owner,
        status: "completed",
        outputExpiredAt: null,
    });
    expect(update.$set.outputExpiredAt).toBeInstanceOf(Date);
    expect(update.$unset).toMatchObject({
        data: 1,
        "automation.htmlOutputPath": 1,
    });
    expect(update.$unset.status).toBeUndefined();
    expect(settings).toEqual({ timestamps: false });
    expect(releaseAutomationDispatch).toHaveBeenCalledWith(
        automation,
        {},
        { timestamps: false },
    );
});

test("retains the current report and separately saved file references even outside the normal window", async () => {
    File.exists.mockImplementation(async (q) =>
        q.blobPath.$in.includes(run(2).automation.htmlOutputPath),
    );
    const plan = await planAutomationRetention({
        ...automation,
        latestRunTaskId: id(1),
        latestWidgetHtmlOutputPath: run(3).automation.widgetHtmlOutputPath,
    });
    expect(plan.candidates.map((c) => c.taskId)).toEqual([4, 5].map(id));
});

test.each(["pending", "in_progress", "waiting"])(
    "defers cleanup for an active or waiting run: %s",
    async () => {
        Task.exists.mockResolvedValue(true);
        expect(await pruneAutomationOutputs(automation._id)).toMatchObject({
            skipped: "active-run",
        });
        expect(Task.find).not.toHaveBeenCalled();
        expect(authorizedMediaFetch).not.toHaveBeenCalled();
        expect(releaseAutomationDispatch).toHaveBeenCalled();
    },
);

test("keeps database output recoverable if deleting either file fails; retries already missing files", async () => {
    runs = runs.slice(-31);
    authorizedMediaFetch
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(new Response("", { status: 503 }));
    const result = await pruneAutomationOutputs(automation._id);
    expect(result.expiredRuns).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(Task.updateOne).not.toHaveBeenCalled();
    authorizedMediaFetch.mockImplementation(
        async () => new Response("", { status: 404 }),
    );
    expect(await pruneAutomationOutputs(automation._id)).toMatchObject({
        expiredRuns: 1,
        errors: [],
    });
});

test("refuses paths outside the generated run directory, including instructions and other owners", () => {
    expect(retainedOutputPaths(automation, run(1))).toHaveLength(2);
    for (const path of [
        "automations/newswires/AUTOMATION.md",
        run(2).automation.htmlOutputPath,
        "global/saved-report.html",
        "automations/newswires/outputs/../index.html",
    ]) {
        expect(
            retainedOutputPaths(automation, {
                ...run(1),
                automation: { htmlOutputPath: path },
            }),
        ).toBeNull();
    }
    expect(
        retainedOutputPaths({ ...automation, slug: "../newswires" }, run(1)),
    ).toBeNull();
});

test("does not expire output when the owner changes retention or invalidates the lock", async () => {
    Automation.findOne.mockReturnValue(
        query({ ...automation, retainedRuns: 0 }),
    );
    expect(await pruneAutomationOutputs(automation._id)).toMatchObject({
        expiredRuns: 0,
        deletedFiles: 0,
    });
    expect(authorizedMediaFetch).not.toHaveBeenCalled();
});

test("dry run never claims a lock or deletes output", async () => {
    Automation.findOne.mockResolvedValue(automation);
    expect(
        (
            await pruneAutomationOutputs(automation._id, {
                dryRun: true,
                ownerId: automation.owner,
            })
        ).candidates,
    ).toHaveLength(5);
    expect(claimAutomationDispatch).not.toHaveBeenCalled();
    expect(releaseAutomationDispatch).not.toHaveBeenCalled();
    expect(authorizedMediaFetch).not.toHaveBeenCalled();
    expect(Task.updateOne).not.toHaveBeenCalled();
});

test("walks past protected records instead of leaving all later output forever", async () => {
    runs = Array.from({ length: 140 }, (_, i) => run(i + 1));
    File.exists.mockImplementation(
        async (q) =>
            Number.parseInt(q.blobPath.$in[0].split("/")[3], 16) <= 100,
    );
    const plan = await planAutomationRetention({
        ...automation,
        latestRunTaskId: id(140),
    });
    expect(plan.candidates).toHaveLength(10);
    expect(plan.candidates[0].taskId).toBe(id(101));
});

test.each([Task, Automation])(
    "refuses cleanup with stale hot-reloaded database schemas",
    async (model) => {
        model.schema.path.mockReturnValue(undefined);
        await expect(pruneAutomationOutputs(automation._id)).rejects.toThrow(
            "Reload database models",
        );
        expect(claimAutomationDispatch).not.toHaveBeenCalled();
        expect(authorizedMediaFetch).not.toHaveBeenCalled();
    },
);
