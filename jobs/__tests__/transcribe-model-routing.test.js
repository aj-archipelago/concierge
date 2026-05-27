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
        process.env = { ...originalEnv, ENABLE_XAI_TRANSCRIBE: "true" };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("worker maps xAI model options to their Cortex queries", async () => {
        const { getTranscribeQueryForModelOption } = await import(
            "../tasks/transcribe-query.mjs"
        );
        const { TRANSCRIBE, TRANSCRIBE_XAI, TRANSCRIBE_XAI_GEMINI } =
            await import("../graphql.mjs");

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
});
