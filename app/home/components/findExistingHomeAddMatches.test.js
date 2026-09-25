import {
    findExistingHomeAddMatches,
    scoreHomeAddMatch,
} from "./findExistingHomeAddMatches";

describe("scoreHomeAddMatch", () => {
    it("matches a distinctive word inside an existing applet name", () => {
        expect(
            scoreHomeAddMatch("calculator", "ThemeSmart Calculator"),
        ).toBeGreaterThanOrEqual(60);
    });

    it("matches a longer request that still names the existing applet", () => {
        expect(
            scoreHomeAddMatch("I want a calculator", "ThemeSmart Calculator"),
        ).toBeGreaterThanOrEqual(60);
    });

    it("does not match generic create language", () => {
        expect(
            scoreHomeAddMatch("create an app", "ThemeSmart Calculator"),
        ).toBe(0);
        expect(
            scoreHomeAddMatch(
                "I want a dashboard",
                "Jira QuickQuery Dashboard",
            ),
        ).toBe(0);
    });

    it("does not treat a short unrelated token as a match", () => {
        expect(
            scoreHomeAddMatch(
                "daily news brief every morning",
                "Personalized newsroom dashboard",
            ),
        ).toBe(0);
    });
});

describe("findExistingHomeAddMatches", () => {
    const applets = [
        {
            appletId: "calc-1",
            name: "ThemeSmart Calculator",
            description: "Add and convert numbers",
        },
        {
            appletId: "news-1",
            name: "Personalized newsroom dashboard",
        },
        {
            appletId: "jira-1",
            name: "Jira QuickQuery Dashboard",
        },
    ];
    const automations = [
        { _id: "auto-weather", name: "Weather Check" },
        { _id: "auto-brief", name: "Daily brief" },
    ];

    it("suggests the existing calculator applet", () => {
        const matches = findExistingHomeAddMatches({
            prompt: "calculator",
            applets,
            automations,
        });

        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({
            kind: "applet",
            id: "calc-1",
            name: "ThemeSmart Calculator",
            alreadyOnHome: false,
        });
    });

    it("suggests an existing automation when the prompt names it", () => {
        const matches = findExistingHomeAddMatches({
            prompt: "weather",
            applets,
            automations,
        });

        expect(matches[0]).toMatchObject({
            kind: "automation",
            id: "auto-weather",
            name: "Weather Check",
        });
    });

    it("marks matches that are already on Home", () => {
        const matches = findExistingHomeAddMatches({
            prompt: "calculator",
            applets,
            automations,
            excludedAppletIds: ["calc-1"],
        });

        expect(matches[0].alreadyOnHome).toBe(true);
    });

    it("returns no matches for an unrelated create prompt", () => {
        expect(
            findExistingHomeAddMatches({
                prompt: "A story tracker applet",
                applets,
                automations,
            }),
        ).toEqual([]);
    });
});
