/**
 * @jest-environment node
 */

import { handleSendSlackMessage, SLACK_CONTEXTUAL_TOOLS } from "../slackTools";

describe("Slack contextual tools", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("uses Concierge copy in the tool definition", () => {
        const description =
            SLACK_CONTEXTUAL_TOOLS[0].function.description +
            SLACK_CONTEXTUAL_TOOLS[0].function.descriptionAr;
        const downstreamBrandPattern = new RegExp(
            `${"La"}${"beeb"}|${"Al"} ${"Jazeera"}|${"A"}${"J"}\\b`,
        );

        expect(description).toContain("Concierge");
        expect(description).not.toMatch(downstreamBrandPattern);
    });

    it("confirms before sending through the server route", async () => {
        const confirmAction = jest.fn().mockResolvedValue(true);
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ ok: true, channel: "C123", ts: "1.0" }),
        }));

        const result = await handleSendSlackMessage(
            {
                toolArgs: {
                    to: "C123",
                    text: "hello",
                    threadTs: "1700000000.000100",
                },
            },
            { confirmAction },
        );

        expect(confirmAction).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/slack/send",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    to: "C123",
                    text: "hello",
                    threadTs: "1700000000.000100",
                }),
            }),
        );
        expect(result).toEqual({
            success: true,
            data: { ok: true, channel: "C123", ts: "1.0" },
        });
    });

    it("does not send when confirmation is cancelled", async () => {
        const confirmAction = jest.fn().mockResolvedValue(false);
        global.fetch = jest.fn();

        const result = await handleSendSlackMessage(
            { toolArgs: { to: "C123", text: "hello" } },
            { confirmAction },
        );

        expect(global.fetch).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            cancelled: true,
            message: "User cancelled the send.",
        });
    });
});
