/**
 * @jest-environment node
 */

import { StreamAccumulator } from "./stream-accumulator.mjs";

describe("StreamAccumulator", () => {
    it("marks finalized assistant messages as server generated", () => {
        const accumulator = new StreamAccumulator();
        accumulator.processResult(JSON.stringify("durable answer"));

        const finalMessage = accumulator.buildFinalMessage("entity-1");

        expect(finalMessage).toMatchObject({
            sender: "assistant",
            direction: "incoming",
            entityId: "entity-1",
            isServerGenerated: true,
            isStreaming: false,
        });
    });
});
