/** @jest-environment node */
import {
    backgroundImageUrl,
    ensureAppletBackgroundImage,
} from "./applet-background-image.js";
import AppletUserData from "../models/applet-user-data.js";
import AppletData from "../models/applet-data.js";
import Task from "../models/task.mjs";
jest.mock("../models/task.mjs", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

jest.mock("../models/applet-user-data.js", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
}));
jest.mock("../models/applet-data.js", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
const query = { appletId: "applet-a", userId: "user-a", key: "atmosphereUrl" };
beforeEach(() => {
    jest.clearAllMocks();
    Task.findOne.mockResolvedValue(null);
    AppletUserData.findOneAndUpdate.mockResolvedValue(null);
    AppletUserData.updateOne.mockResolvedValue({ modifiedCount: 1 });
    AppletUserData.findOne.mockReturnValue({ lean: async () => null });
    AppletData.findOne.mockReturnValue({ lean: async () => null });
});
it.each([
    { url: "https://example.test/image.png" },
    "https://example.test/image.png",
])("reuses the saved SDK value %p", async (value) => {
    AppletUserData.findOne.mockReturnValue({ lean: async () => ({ value }) });
    const create = jest.fn();
    expect(await ensureAppletBackgroundImage({ ...query, create })).toEqual({
        url: "https://example.test/image.png",
    });
    expect(create).not.toHaveBeenCalled();
    expect(AppletUserData.findOne).toHaveBeenCalledWith(query);
});
it("uses the legacy per-user cache", async () => {
    AppletData.findOne.mockReturnValue({
        lean: async () => ({
            data: { atmosphereUrl: { url: "https://example.test/legacy.png" } },
        }),
    });
    const create = jest.fn();
    expect(await ensureAppletBackgroundImage({ ...query, create })).toEqual({
        url: "https://example.test/legacy.png",
    });
    expect(create).not.toHaveBeenCalled();
    expect(AppletData.findOne).toHaveBeenCalledWith({
        appletId: "applet-a",
        userId: "user-a",
    });
});
it("gives repeat requests the same durable task key", async () => {
    const create = jest.fn().mockResolvedValue({ taskId: "one-task" });
    await Promise.all(
        Array.from({ length: 5 }, () =>
            ensureAppletBackgroundImage({ ...query, create }),
        ),
    );
    expect(create.mock.calls).toEqual(
        Array.from({ length: 5 }, () => ["widget-background-v1:atmosphereUrl"]),
    );
});
it("fails closed on a cache read error", async () => {
    AppletUserData.findOne.mockReturnValue({
        lean: async () => {
            throw new Error("DB unavailable");
        },
    });
    const create = jest.fn();
    await expect(
        ensureAppletBackgroundImage({ ...query, create }),
    ).rejects.toThrow("DB unavailable");
    expect(create).not.toHaveBeenCalled();
});
it.each(["javascript:alert(1)", "gs://bucket/object", {}, null])(
    "rejects a non-displayable cached URL %p",
    (value) => {
        expect(backgroundImageUrl(value)).toBeNull();
    },
);

it("finalizes a completed task on the next visit even if its original widget closed", async () => {
    AppletUserData.findOne.mockReturnValue({
        lean: async () => ({ value: { taskId: "saved-task" } }),
    });
    Task.findOne.mockResolvedValue({
        _id: "saved-task",
        status: "completed",
        data: { url: "https://example.test/completed.png" },
    });
    const create = jest.fn();
    expect(await ensureAppletBackgroundImage({ ...query, create })).toEqual({
        url: "https://example.test/completed.png",
        taskId: "saved-task",
    });
    expect(Task.findOne).toHaveBeenCalledWith({
        _id: "saved-task",
        owner: "user-a",
        "invokedFrom.source": "applet_sdk",
        "invokedFrom.appletId": "applet-a",
    });
    expect(AppletUserData.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ "value.taskId": "saved-task" }),
        expect.objectContaining({
            $set: expect.objectContaining({
                value: { url: "https://example.test/completed.png" },
            }),
        }),
    );
    expect(create).not.toHaveBeenCalled();
});
it("does not regenerate after a saved task is deleted or belongs to another applet", async () => {
    AppletUserData.findOne.mockReturnValue({
        lean: async () => ({ value: { taskId: "missing-task" } }),
    });
    const create = jest.fn();
    await expect(
        ensureAppletBackgroundImage({ ...query, create }),
    ).rejects.toThrow("unavailable");
    expect(create).not.toHaveBeenCalled();
});
it("keeps a failed task instead of automatically starting a replacement", async () => {
    AppletUserData.findOne.mockReturnValue({
        lean: async () => ({ value: { taskId: "failed-task" } }),
    });
    Task.findOne.mockResolvedValue({ _id: "failed-task", status: "failed" });
    const create = jest.fn();
    expect(await ensureAppletBackgroundImage({ ...query, create })).toEqual({
        taskId: "failed-task",
    });
    expect(create).not.toHaveBeenCalled();
});
