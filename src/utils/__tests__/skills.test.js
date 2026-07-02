import {
    BUILT_IN_SKILLS,
    buildRelevantSkillReferenceContext,
    getBuiltInSkill,
} from "../skills";

describe("built-in applets skill", () => {
    const appletsSkill = BUILT_IN_SKILLS.find(
        (skill) => skill.name === "applets",
    );

    test("steers generated applets away from fragile Tailwind @apply styling", () => {
        expect(appletsSkill?.content).toContain("Do NOT use `@apply`");
        expect(appletsSkill?.content).toContain(
            "Put Tailwind utility classes directly on HTML elements",
        );
        expect(appletsSkill?.content).not.toContain("for @apply directives");
        expect(appletsSkill?.content).not.toContain(".counter {");
        expect(appletsSkill?.content).toContain(
            'class="flex min-h-[200px] items-center justify-center',
        );
    });

    test("steers media applets to SDK media tasks", () => {
        expect(appletsSkill?.content).toContain(
            "Media Generation, Transcription, and Subtitle Translation",
        );
        expect(appletsSkill?.content).toContain("ConciergeSDK.media.models()");
        expect(appletsSkill?.content).toContain("ConciergeSDK.media.create()");
        expect(appletsSkill?.content).toContain("createImage()");
        expect(appletsSkill?.content).toContain("ConciergeSDK.tasks.wait");
        expect(appletsSkill?.content).toContain(
            "ConciergeSDK.media.transcribe",
        );
        expect(appletsSkill?.content).toContain(
            "ConciergeSDK.media.translateSubtitles",
        );
        expect(appletsSkill?.content).toContain("ConciergeSDK.tasks.get");
        expect(appletsSkill?.content).toContain("never invent/sample output");
        expect(appletsSkill?.content).toContain("wordTimestamped");
        expect(appletsSkill?.content).toContain("media preview");
        expect(appletsSkill?.content).toContain("audio/video playback");
    });

    test("can build reference-only applet skill context for active applet turns", () => {
        expect(getBuiltInSkill("applets")).toBe(appletsSkill);

        const context = buildRelevantSkillReferenceContext(
            "applets",
            "The active canvas contains a Concierge applet.",
        );

        expect(context).toContain("## Relevant Skill: applets");
        expect(context).toContain(
            "The active canvas contains a Concierge applet.",
        );
        expect(context).toContain('LoadSkill("applets")');
        expect(context).toContain(
            "before changing related files, using related platform APIs, or calling related management/publishing tools",
        );
        expect(context).not.toContain("Concierge Applet SDK");
        expect(context).not.toContain(
            "ConciergeSDK.navigation.open(path, options)",
        );
    });
});
