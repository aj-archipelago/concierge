import { reviewAppletApis } from "../appletApiReview";

test.each([
    "ConciergeSDK.sourceQa.query({})",
    'ConciergeSDK["sourceQa"].stream({})',
    "const { sourceQa } = ConciergeSDK;",
    'fetch("/api/applet/source-qa/initial-questions")',
])("flags known Source Q&A references: %s", (html) => {
    expect(reviewAppletApis(html)[0].code).toBe(
        "APPLET_SOURCE_QA_REVIEW_REQUIRED",
    );
    expect(
        reviewAppletApis(html, { specialistSkill: "source-qa" }),
    ).toHaveLength(1);
    expect(reviewAppletApis(html, { specialistSkill: true })).toHaveLength(1);
});

test("allows ordinary APIs and empty source", () => {
    for (const html of [
        null,
        "",
        "ConciergeSDK.models.executePrompt({})",
        "ConciergeSDK.agent.chat({})",
    ]) {
        expect(reviewAppletApis(html)).toEqual([]);
    }
});
