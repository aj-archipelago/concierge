/**
 * Step definitions for the Home dashboard tour.
 *
 * The list adapts to whether the dashboard is empty or already populated,
 * because the "add stuff" affordances differ between the two states:
 *  - Empty  → Add is also available in the empty state.
 *  - Populated → Arrange exposes Add group and reordering controls.
 *
 * Steps target elements by their `data-tour` attribute. Targeted steps are
 * `optional`, so the overlay silently skips any whose target is missing.
 * A step with `requires: "edit"` tells the Home page to enter edit mode while
 * that step is active (so edit-only anchors exist).
 */
export function getHomeTourSteps({ isEmpty, t }) {
    const welcome = {
        id: "welcome",
        target: null,
        title: t("Welcome to your home page"),
        body: t(
            "Keep your apps and your colleagues’ reports together on Home. Start with Add to Home.",
        ),
        placement: "center",
    };

    const finish = {
        id: "finish",
        target: null,
        title: t("You're all set"),
        body: t(
            "Choose Arrange to move your cards and groups. Choose Take a tour in the header to see this again.",
        ),
        placement: "center",
    };

    if (isEmpty) {
        return [
            welcome,
            {
                id: "empty-add",
                target: "home-empty-add",
                title: t("Add your first item"),
                body: t("Choose Add to put an app or a task report on Home."),
                placement: "top",
                optional: true,
            },
            finish,
        ];
    }

    return [
        welcome,
        {
            id: "menu",
            target: "home-menu",
            title: t("Arrange your Home"),
            body: t(
                "Choose Arrange to move cards, rename groups, or change how cards appear.",
            ),
            placement: "bottom-end",
            optional: true,
        },
        {
            id: "add-group",
            target: "home-add-group",
            title: t("Add a group"),
            body: t(
                "Groups keep your home organized. Add one to create a new section.",
            ),
            placement: "bottom-end",
            optional: true,
            requires: "edit",
        },
        {
            id: "add-item",
            target: "home-add-item",
            title: t("Add apps and reports"),
            body: t(
                "Use Add inside a group to describe something new or choose an existing app or task.",
            ),
            placement: "top",
            optional: true,
            requires: "edit",
        },
        finish,
    ];
}
