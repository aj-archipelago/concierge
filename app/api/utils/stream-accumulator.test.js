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

test("persists normalized media receipts on tool completion, including a finish without start", () => {
    const receipt = {
        taskId: "a".repeat(24),
        type: "video",
        model: "model",
        name: "Model",
    };
    for (const withStart of [true, false]) {
        const accumulator = new StreamAccumulator();
        if (withStart)
            accumulator.updateToolCalls({
                type: "start",
                callId: "media-1",
                userMessage: "Creating",
            });
        accumulator.updateToolCalls({
            type: "finish",
            callId: "media-1",
            success: true,
            mediaTask: { ...receipt, url: "secret" },
        });
        accumulator.updateToolCalls({
            type: "finish",
            callId: "media-1",
            success: true,
        });
        const events = accumulator
            .buildFinalMessage("entity")
            .payload.map(JSON.parse)
            .filter((item) => item.type === "tool_event");
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            status: "completed",
            mediaTask: receipt,
        });
        expect(events[0].mediaTask.url).toBeUndefined();
        accumulator.updateToolCalls({
            type: "finish",
            callId: "media-1",
            success: false,
            mediaTask: receipt,
        });
        expect(
            accumulator.toolCallsMap.get("media-1").mediaTask,
        ).toBeUndefined();
    }
});
