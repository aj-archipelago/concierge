import { BUILT_IN_SKILLS } from "../skills";

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
});
