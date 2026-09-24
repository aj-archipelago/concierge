import { describeMediaGenerationError } from "../mediaGenerationErrors";

const t = (key) => key;
test.each([
    "Execution failed for video_seedance: ModelError: The input or output was flagged as sensitive. (E005)",
    { code: "TASK_FAILED", message: "Prediction failed: E005" },
])(
    "explains existing Seedance moderation failures without losing diagnostics",
    (error) => {
        const result = describeMediaGenerationError(
            { model: "replicate-seedance-2.0", error },
            t,
        );
        expect(result.kind).toBe("moderation");
        expect(result.title).toBe("Seedance declined this request");
        expect(result.message).toContain("choose another video model");
        expect(result.details).toContain("E005");
    },
);

test("separates timeouts from provider moderation and storage errors", () => {
    expect(
        describeMediaGenerationError(
            {
                type: "video",
                error: "Operation timed out after 10 minutes of inactivity",
            },
            t,
        ).kind,
    ).toBe("timeout");
    const storage = describeMediaGenerationError(
        {
            type: "video",
            error: {
                code: "ERR_BAD_REQUEST",
                message: "403: Storage access denied",
            },
        },
        t,
    );
    expect(storage.kind).toBe("error");
    expect(storage.message).toBe("403: Storage access denied");
});
