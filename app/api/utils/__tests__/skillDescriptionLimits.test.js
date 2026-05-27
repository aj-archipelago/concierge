/**
 * @jest-environment node
 */

import {
    SKILL_DESCRIPTION_MAX_LENGTH,
    SKILL_DESCRIPTION_OVERFLOW_HEADER,
    splitSkillSummaryDescription,
    mergeSkillDescriptionOverflowIntoMarkdown,
    stripSkillDescriptionOverflowBlock,
} from "@/src/utils/skillDescriptionLimits";

describe("splitSkillSummaryDescription", () => {
    it("returns full string when within limit", () => {
        const text = "a".repeat(SKILL_DESCRIPTION_MAX_LENGTH);
        const { summary, overflow } = splitSkillSummaryDescription(text);
        expect(summary).toBe(text);
        expect(overflow).toBe(null);
    });

    it("splits overflow after max length", () => {
        const suffix = "-overflow";
        const text = `${"b".repeat(SKILL_DESCRIPTION_MAX_LENGTH)}${suffix}`;
        const { summary, overflow } = splitSkillSummaryDescription(text);
        expect(summary.length).toBe(SKILL_DESCRIPTION_MAX_LENGTH);
        expect(summary).toBe("b".repeat(SKILL_DESCRIPTION_MAX_LENGTH));
        expect(overflow).toBe(suffix);
    });

    it("trims input and clears overflow when only whitespace follows cut", () => {
        const { summary } = splitSkillSummaryDescription(
            `  ${"x".repeat(SKILL_DESCRIPTION_MAX_LENGTH)}    `,
        );
        expect(summary.length).toBe(SKILL_DESCRIPTION_MAX_LENGTH);
        const { overflow } = splitSkillSummaryDescription(
            `  ${"x".repeat(SKILL_DESCRIPTION_MAX_LENGTH)}`,
        );
        expect(overflow).toBe(null);
    });
});

describe("mergeSkillDescriptionOverflowIntoMarkdown", () => {
    it("returns body unchanged without overflow", () => {
        expect(mergeSkillDescriptionOverflowIntoMarkdown(null, "# Hi")).toBe(
            "# Hi",
        );
        expect(mergeSkillDescriptionOverflowIntoMarkdown(undefined, "")).toBe(
            "",
        );
    });

    it("prefixes overflow and separator before markdown", () => {
        const merged = mergeSkillDescriptionOverflowIntoMarkdown(
            "more info",
            "# Body\n",
        );
        expect(merged).toContain("more info");
        expect(merged).toContain("# Body");
        expect(merged.endsWith("# Body\n")).toBe(false);
        expect(merged.indexOf("more info")).toBeLessThan(
            merged.indexOf("# Body"),
        );
    });

    it("is idempotent — repeating a merge with the same overflow does not duplicate the block", () => {
        const once = mergeSkillDescriptionOverflowIntoMarkdown(
            "more info",
            "# Body\n",
        );
        const twice = mergeSkillDescriptionOverflowIntoMarkdown(
            "more info",
            once,
        );
        expect(twice).toBe(once);
    });

    it("replaces a previously-generated block when overflow text changes", () => {
        const first = mergeSkillDescriptionOverflowIntoMarkdown(
            "original overflow",
            "# Body\n",
        );
        const second = mergeSkillDescriptionOverflowIntoMarkdown(
            "different overflow",
            first,
        );
        expect(second).toContain("different overflow");
        expect(second).not.toContain("original overflow");
        // Header should appear exactly once
        const matches =
            second.split(SKILL_DESCRIPTION_OVERFLOW_HEADER).length - 1;
        expect(matches).toBe(1);
    });

    it("strips an existing overflow block when no new overflow is provided", () => {
        const withBlock = mergeSkillDescriptionOverflowIntoMarkdown(
            "old overflow",
            "# Body\n",
        );
        const stripped = mergeSkillDescriptionOverflowIntoMarkdown(
            null,
            withBlock,
        );
        expect(stripped).not.toContain("old overflow");
        expect(stripped).not.toContain(SKILL_DESCRIPTION_OVERFLOW_HEADER);
        expect(stripped).toContain("# Body");
    });

    it("leaves user content untouched when no generated block is present", () => {
        const body = "# My notes\n\nSome content the user wrote.";
        expect(stripSkillDescriptionOverflowBlock(body)).toBe(body);
        expect(mergeSkillDescriptionOverflowIntoMarkdown(null, body)).toBe(
            body,
        );
    });
});
