/**
 * @jest-environment node
 */

const {
    redactObjectForLog,
    redactSensitiveText,
    redactUrlForLog,
} = require("../log-redaction.mjs");

describe("log redaction", () => {
    test("redacts signed URL query strings and sensitive query parameters", () => {
        expect(
            redactUrlForLog(
                "https://storage.example/audio.wav?sig=secret&token=abc",
            ),
        ).toBe("https://storage.example/audio.wav?***REDACTED***");

        expect(redactSensitiveText("password=hunter2 api_key=secret")).toBe(
            "password=***REDACTED*** api_key=***REDACTED***",
        );

        expect(redactUrlForLog("audio.wav?password=hunter2&sig=secret")).toBe(
            "audio.wav?password=***REDACTED***&sig=***REDACTED***",
        );
    });

    test("redacts authorization headers and common credential shapes", () => {
        const basicCredentialFixture = ["dXNl", "cjpw", "YXNz"].join("");
        const awsKeyFixture = ["AKIA", "1234567890ABCDEF"].join("");
        const jwtFixture = [
            "eyJhbGciOiJIUzI1NiJ9",
            "eyJzdWIiOiIxIn0",
            "signature",
        ].join(".");
        const text = [
            "Bearer abc.def-ghi",
            `Basic ${basicCredentialFixture}`,
            awsKeyFixture,
            jwtFixture,
        ].join(" ");

        const redacted = redactSensitiveText(text);

        expect(redacted).toContain("Bearer ***REDACTED***");
        expect(redacted).toContain("Basic ***REDACTED***");
        expect(redacted).toContain("***REDACTED_AWS_KEY***");
        expect(redacted).toContain("***REDACTED_JWT***");
        expect(redacted).not.toContain(basicCredentialFixture);
    });

    test("redacts authorization schemes case-insensitively", () => {
        const redacted = redactSensitiveText(
            "bearer lower.token BASIC dXNlcjpwYXNz",
        );

        expect(redacted).toContain("bearer ***REDACTED***");
        expect(redacted).toContain("BASIC ***REDACTED***");
        expect(redacted).not.toContain("lower.token");
        expect(redacted).not.toContain("dXNlcjpwYXNz");
    });

    test("recursively redacts string values in objects and arrays", () => {
        expect(
            redactObjectForLog({
                url: "https://storage.example/a.wav?sig=secret",
                headers: { Authorization: "Bearer token.secret" },
                nested: [{ password: "password=secret" }],
            }),
        ).toEqual({
            url: "https://storage.example/a.wav?***REDACTED***",
            headers: { Authorization: "Bearer ***REDACTED***" },
            nested: [{ password: "password=***REDACTED***" }],
        });
    });
});
