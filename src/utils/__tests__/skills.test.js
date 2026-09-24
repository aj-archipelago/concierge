import {
    APPLETS_HTML_GENERATION_GUIDE,
    BUILT_IN_SKILLS,
    buildRelevantSkillReferenceContext,
    getBuiltInSkill,
    loadSkill,
} from "../skills";
import { APPLET_SDK_DOCUMENTATION } from "../../content/appletSdkDocumentation";

describe("built-in applets skill", () => {
    const appletsSkill = BUILT_IN_SKILLS.find(
        (skill) => skill.name === "applets",
    );

    test("keeps Source Q&A out of SDK docs and every builder reference", async () => {
        for (const content of [
            appletsSkill.content,
            APPLETS_HTML_GENERATION_GUIDE,
            APPLET_SDK_DOCUMENTATION,
        ]) {
            expect(content).not.toMatch(/ask.?aj|specialistSkill/i);
            expect(content).toContain("Use only documented SDK APIs");
            expect(content.indexOf("Choose the API")).toBeLessThan(
                content.indexOf("ConciergeSDK.agent.chat({"),
            );
            expect(content).not.toContain("options.maxRefinementRounds");
        }
        expect(getBuiltInSkill("source-qa")).toBeNull();
        const available = await loadSkill();
        expect(available.data.skills.map((skill) => skill.name)).not.toContain(
            "source-qa",
        );
    });

    test("documents Home widget HTML as separate from Draft", () => {
        expect(appletsSkill?.content).toContain("UpdateAppletWidget");
        expect(appletsSkill?.content).toContain("widget.html");
        expect(appletsSkill?.content).toContain(
            "Draft-only edits will not change the tile",
        );
        expect(appletsSkill?.content).toContain(
            "Do not claim the Home tile is updated until",
        );
    });

    test("steers applets away from native confirm/alert/prompt dialogs", () => {
        expect(appletsSkill?.content).toContain("allow-modals");
        expect(appletsSkill?.content).toContain("window.confirm()");
        expect(appletsSkill?.content).toContain("in-app confirmation modal");
        expect(appletsSkill?.content).toContain(
            "block automated canvas debugging tools",
        );
    });

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

    test("documents reusable agent context", () => {
        expect(appletsSkill?.content).toContain(
            'pass `agentContext: "create"` to its `CreateApplet` call',
        );
        expect(appletsSkill?.content).toContain('directory: "skills/<name>"');
        expect(appletsSkill?.content).toContain(
            "Omit `directory` for root files",
        );
        expect(appletsSkill?.content).toContain(
            "must** go through `ConciergeSDK.agent.render(target, response)`",
        );
        expect(appletsSkill?.content).toContain("or build custom citation UI");
        expect(appletsSkill?.content).toContain(
            "Do not copy attached private files into applet HTML/JavaScript",
        );
        expect(appletsSkill?.content).toContain(
            "put the ID in applet HTML or UI",
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

    test("exposes a lean HTML generation guide without the canvas-tool catalog", () => {
        expect(APPLETS_HTML_GENERATION_GUIDE).toContain(
            "ConciergeSDK.media.models",
        );
        expect(APPLETS_HTML_GENERATION_GUIDE).toContain("Do NOT use `@apply`");
        expect(APPLETS_HTML_GENERATION_GUIDE).not.toContain(
            "Canvas Applet Tools",
        );
        expect(APPLETS_HTML_GENERATION_GUIDE).not.toContain(
            "| `CreateApplet` |",
        );
        expect(APPLETS_HTML_GENERATION_GUIDE).not.toContain(
            "## Example: Simple Counter Applet",
        );
    });
});
