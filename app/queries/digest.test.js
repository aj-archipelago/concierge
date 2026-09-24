/**
 * @jest-environment jsdom
 */

import {
    digestHasActiveAutomationRun,
    getDigestRefetchInterval,
} from "./digest";

describe("digest automation polling helpers", () => {
    it("detects active automation runs on digest blocks", () => {
        expect(
            digestHasActiveAutomationRun({
                blocks: [
                    {
                        automationId: "a1",
                        automationRun: { status: "in_progress" },
                    },
                ],
            }),
        ).toBe(true);

        expect(
            digestHasActiveAutomationRun({
                blocks: [
                    {
                        automationId: "a1",
                        automationRun: { status: "completed" },
                    },
                    { prompt: "hello" },
                ],
            }),
        ).toBe(false);
    });

    it("bounds digest refetchInterval to 5s only while a run is active", () => {
        expect(
            getDigestRefetchInterval({
                state: {
                    data: {
                        blocks: [
                            {
                                automationId: "a1",
                                automationRun: { status: "pending" },
                            },
                        ],
                    },
                },
            }),
        ).toBe(5_000);

        expect(
            getDigestRefetchInterval({
                state: {
                    data: {
                        blocks: [
                            {
                                automationId: "a1",
                                automationRun: { status: "completed" },
                            },
                        ],
                    },
                },
            }),
        ).toBe(false);
    });
});
