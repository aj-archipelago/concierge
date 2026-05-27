/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../utils/axios-client", () => ({
    post: jest.fn(),
}));

jest.mock("../models/feedback", () => ({
    create: jest.fn(),
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

import axios from "../../utils/axios-client";
import Feedback from "../models/feedback";
import { getCurrentUser } from "../utils/auth";
import { POST } from "./route";

function makeRequest(body, headers = {}) {
    const headerMap = new Map(
        Object.entries({
            host: "concierge.test",
            "x-forwarded-proto": "https",
            ...headers,
        }),
    );

    return {
        json: jest.fn().mockResolvedValue(body),
        headers: {
            get: jest.fn((name) => headerMap.get(name)),
        },
    };
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe("POST /api/feedback", () => {
    const originalSlackWebhook = process.env.SLACK_WEBHOOK_URL;
    const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    beforeEach(() => {
        jest.clearAllMocks();
        axios.post.mockResolvedValue({});
        process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/feedback";
        delete process.env.NEXT_PUBLIC_APP_URL;
    });

    afterEach(() => {
        jest.useRealTimers();
        process.env.SLACK_WEBHOOK_URL = originalSlackWebhook;
        process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    });

    it("stores feedback and sends Slack to the admin feedback detail", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            name: "Alex",
            username: "alex@example.com",
        });
        Feedback.create.mockResolvedValue({
            _id: "feedback-1",
            message: "The screenshot button failed",
            category: "bug",
            screenshotUrl: "https://files.test/screenshot.jpg",
            pageUrl: "https://concierge.test/chat",
            userName: "Alex",
            username: "alex@example.com",
        });

        const response = await POST(
            makeRequest({
                message: "  The screenshot button failed  ",
                category: "bug",
                screenshot: "https://files.test/screenshot.jpg",
                pageUrl: "https://concierge.test/chat",
                userAgent: "Jest",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            feedbackId: "feedback-1",
        });
        expect(Feedback.create).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "The screenshot button failed",
                category: "bug",
                screenshotUrl: "https://files.test/screenshot.jpg",
                pageUrl: "https://concierge.test/chat",
                userAgent: "Jest",
                source: "user",
                user: "user-1",
                userName: "Alex",
                username: "alex@example.com",
            }),
        );
        expect(axios.post).toHaveBeenCalledWith(
            "https://hooks.slack.test/feedback",
            expect.objectContaining({
                text: expect.stringContaining(
                    "https://concierge.test/admin/feedback?selected=feedback-1",
                ),
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        type: "section",
                        text: expect.objectContaining({
                            text: expect.stringContaining(
                                "*New Concierge feedback*",
                            ),
                        }),
                    }),
                ]),
            }),
        );
        expect(axios.post).toHaveBeenCalledWith(
            "https://hooks.slack.test/feedback",
            expect.objectContaining({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        type: "image",
                        image_url: "https://files.test/screenshot.jpg",
                        alt_text: "Feedback image",
                    }),
                    expect.objectContaining({
                        type: "actions",
                        elements: expect.arrayContaining([
                            expect.objectContaining({
                                url: "https://concierge.test/admin/feedback?selected=feedback-1",
                            }),
                        ]),
                    }),
                ]),
            }),
        );
    });

    it("returns before the background Slack image wait completes", async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-05-10T06:08:06.000Z"));
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            name: "Alex",
            username: "alex@example.com",
        });
        const imageUrl =
            "https://files.test/feedback.jpg?st=2026-05-10T06%3A08%3A05Z&se=2026-06-09T06%3A08%3A05Z";
        Feedback.create.mockResolvedValue({
            _id: "feedback-sas-image",
            message: "Fresh SAS image",
            category: "bug",
            screenshotUrl: imageUrl,
            userName: "Alex",
            username: "alex@example.com",
        });

        const responsePromise = POST(
            makeRequest({
                message: "Fresh SAS image",
                category: "bug",
                screenshot: imageUrl,
            }),
        );

        const response = await responsePromise;

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            feedbackId: "feedback-sas-image",
        });
        expect(axios.post).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(5_000);

        expect(axios.post).toHaveBeenCalledWith(
            "https://hooks.slack.test/feedback",
            expect.objectContaining({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        type: "image",
                        image_url: imageUrl,
                    }),
                ]),
            }),
        );
    });

    it("rejects empty messages before creating feedback", async () => {
        const response = await POST(makeRequest({ message: "   " }));

        expect(response.status).toBe(400);
        expect(Feedback.create).not.toHaveBeenCalled();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it("still succeeds when Slack notification fails after persistence", async () => {
        const consoleError = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            name: "Alex",
            username: "alex@example.com",
        });
        Feedback.create.mockResolvedValue({
            _id: "feedback-2",
            message: "Saved even if Slack fails",
            category: "idea",
            userName: "Alex",
            username: "alex@example.com",
        });
        axios.post.mockRejectedValue(new Error("Slack down"));

        const response = await POST(
            makeRequest({
                message: "Saved even if Slack fails",
                category: "idea",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            feedbackId: "feedback-2",
        });
        await flushPromises();
        expect(axios.post).toHaveBeenCalledTimes(2);
        consoleError.mockRestore();
    });

    it("retries Slack with a minimal admin-link payload when the rich payload fails", async () => {
        const consoleError = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            name: "Alex",
            username: "alex@example.com",
        });
        Feedback.create.mockResolvedValue({
            _id: "feedback-fallback",
            message: "The image notification failed.",
            category: "bug",
            screenshotUrl: "https://files.test/feedback.png",
            pageUrl: "https://concierge.test/chat",
            userName: "Alex",
            username: "alex@example.com",
        });
        axios.post
            .mockRejectedValueOnce({
                response: { data: "invalid_blocks" },
            })
            .mockResolvedValueOnce({});

        const response = await POST(
            makeRequest({
                message: "The image notification failed.",
                category: "bug",
                screenshot: "https://files.test/feedback.png",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            feedbackId: "feedback-fallback",
        });
        await flushPromises();

        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(axios.post.mock.calls[0][1].blocks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "image",
                    image_url: "https://files.test/feedback.png",
                }),
            ]),
        );
        expect(axios.post.mock.calls[1][1]).toEqual(
            expect.objectContaining({
                text: expect.stringContaining(
                    "https://concierge.test/admin/feedback?selected=feedback-fallback",
                ),
                blocks: expect.not.arrayContaining([
                    expect.objectContaining({ type: "image" }),
                ]),
            }),
        );
        expect(axios.post.mock.calls[1][1].blocks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "actions",
                    elements: expect.arrayContaining([
                        expect.objectContaining({
                            url: "https://concierge.test/admin/feedback?selected=feedback-fallback",
                        }),
                    ]),
                }),
            ]),
        );
        consoleError.mockRestore();
    });

    it("stores agent-submitted feedback with source metadata", async () => {
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            name: "Alex",
            username: "alex@example.com",
        });
        Feedback.create.mockResolvedValue({
            _id: "feedback-3",
            message: "Agent noticed the user was stuck.",
            category: "other",
            source: "agent",
            userName: "Alex",
            username: "alex@example.com",
        });

        const response = await POST(
            makeRequest({
                message: "Agent noticed the user was stuck.",
                category: "other",
                source: "agent",
            }),
        );

        expect(response.status).toBe(200);
        expect(Feedback.create).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Agent noticed the user was stuck.",
                category: "other",
                source: "agent",
            }),
        );
        expect(axios.post).toHaveBeenCalledWith(
            "https://hooks.slack.test/feedback",
            expect.objectContaining({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        type: "section",
                        text: expect.objectContaining({
                            text: expect.stringContaining("*Source:* Agent"),
                        }),
                    }),
                ]),
            }),
        );
    });
});
