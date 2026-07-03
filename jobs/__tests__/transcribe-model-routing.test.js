const fs = require("fs");
const path = require("path");

jest.mock("@apollo/client/index.js", () => ({
    __esModule: true,
    gql: (strings, ...values) => ({ strings, values }),
}));

const repoRoot = path.resolve(__dirname, "../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("transcribe model routing", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            ENABLE_XAI_TRANSCRIBE: "true",
            ENABLE_MAI_TRANSCRIBE: "true",
        };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("worker maps xAI model options to their Cortex queries", async () => {
        const { getTranscribeQueryForModelOption } = await import(
            "../tasks/transcribe-query.mjs"
        );
        const {
            TRANSCRIBE,
            TRANSCRIBE_MAI_15,
            TRANSCRIBE_XAI,
            TRANSCRIBE_XAI_GEMINI,
        } = await import("../graphql.mjs");

        expect(getTranscribeQueryForModelOption("MAI-Transcribe-1.5")).toBe(
            TRANSCRIBE_MAI_15,
        );
        expect(getTranscribeQueryForModelOption("mai-1.5")).toBe(
            TRANSCRIBE_MAI_15,
        );
        expect(getTranscribeQueryForModelOption("xAI")).toBe(TRANSCRIBE_XAI);
        expect(getTranscribeQueryForModelOption("xAI + Gemini")).toBe(
            TRANSCRIBE_XAI_GEMINI,
        );
        expect(getTranscribeQueryForModelOption("xai+gemini")).toBe(
            TRANSCRIBE_XAI_GEMINI,
        );
        expect(getTranscribeQueryForModelOption(" XAI+Gemini ")).toBe(
            TRANSCRIBE_XAI_GEMINI,
        );
        expect(getTranscribeQueryForModelOption("Whisper")).toBe(TRANSCRIBE);
    });

    test("GraphQL query files declare xAI transcribe operations", () => {
        for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
            const src = read(file);

            expect(src).toMatch(/TRANSCRIBE_MAI_15\s*=\s*gql`/);
            expect(src).toMatch(/transcribe_mai_15\(/);
            expect(src).toMatch(/TRANSCRIBE_XAI_GEMINI\s*=\s*gql`/);
            expect(src).toMatch(/transcribe_xai_gemini\(/);
            expect(src).toMatch(/TRANSCRIBE_XAI\s*=\s*gql`/);
            expect(src).toMatch(/transcribe_xai\(/);
            expect(src).toMatch(/contextId\s*:\s*\$contextId/);
        }
    });

    test("stores text, formatted text, and subtitle formats distinctly", async () => {
        const { getStoredTranscriptFormat } = await import(
            "../tasks/transcribe-format.mjs"
        );

        expect(getStoredTranscriptFormat("")).toBe("");
        expect(getStoredTranscriptFormat("text")).toBe("");
        expect(getStoredTranscriptFormat(undefined)).toBe("");
        expect(getStoredTranscriptFormat("formatted")).toBe("formatted");
        expect(getStoredTranscriptFormat("vtt")).toBe("vtt");
    });

    test("worker treats transcribe backend error payloads as task failures", async () => {
        const handler = (await import("../tasks/transcribe.mjs")).default;

        await expect(
            handler.handleCompletion(
                "task-1",
                {
                    data: "Transcribe error: Error processing media file: Request failed with status code 403",
                },
                null,
                { skipUserState: true, responseFormat: "vtt" },
                {},
            ),
        ).rejects.toThrow(
            "Transcription failed: Error processing media file: Request failed with status code 403",
        );

        await expect(
            handler.handleCompletion(
                "task-1",
                {
                    message:
                        "Transcribe error: Error processing media file: Request failed with status code 403",
                },
                null,
                { skipUserState: true, responseFormat: "vtt" },
                {},
            ),
        ).rejects.toThrow(
            "Transcription failed: Error processing media file: Request failed with status code 403",
        );
    });
});
