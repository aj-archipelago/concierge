import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import AppCatalogCard from "./AppCatalogCard";

jest.mock("@/src/utils/fileDownloadUtils", () => ({
    __esModule: true,
    getDownloadUrl: (url) => url,
}));

function expectImageCardLayoutToStayFixed() {
    expect(screen.getByTestId("app-catalog-card-header")).toHaveClass(
        "items-start",
        "gap-2.5",
        "p-0",
    );
    expect(screen.getByTestId("app-catalog-card-icon-surface")).toHaveClass(
        "-mt-1",
        "h-9",
        "w-9",
        "border-0",
        "bg-transparent",
        "p-0",
        "shadow-none",
        "backdrop-blur-none",
    );
    expect(screen.getByTestId("app-catalog-card-title-surface")).toHaveClass(
        "min-w-0",
        "flex-1",
        "border-0",
        "bg-transparent",
        "p-0",
        "shadow-none",
        "backdrop-blur-none",
    );
    expect(screen.getByTestId("app-catalog-card-description")).toHaveClass(
        "border-0",
        "bg-transparent",
        "p-0",
        "shadow-none",
        "backdrop-blur-none",
        "mt-1",
    );
    expect(
        screen.getByTestId("app-catalog-card-title-surface"),
    ).not.toHaveClass("max-w-[calc(100%-3.375rem)]");
}

describe("AppCatalogCard", () => {
    let originalMutationObserver;

    beforeEach(() => {
        originalMutationObserver = global.MutationObserver;
    });

    afterEach(() => {
        document.body.className = "";
        document.documentElement.removeAttribute("data-color-mode");
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.className = "";
        global.MutationObserver = originalMutationObserver;
    });

    test("switches applet card artwork when the app theme changes", async () => {
        const observers = [];
        global.MutationObserver = class {
            constructor(callback) {
                this.callback = callback;
                observers.push(this);
            }

            observe() {}
            disconnect() {}
        };
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Editorial Launchpad"
                description="Launch newsroom applets"
                imageLightUrl="https://images.example/launchpad-light.webp"
                imageDarkUrl="https://images.example/launchpad-dark.webp"
                imageBadge="Text & Edit"
                chips={["editorial"]}
            />,
        );

        expect(screen.getByTestId("app-catalog-card-image")).toHaveAttribute(
            "src",
            "https://images.example/launchpad-light.webp",
        );
        expect(
            screen.getByRole("heading", { name: "Editorial Launchpad" }),
        ).toHaveClass("text-slate-950");
        expect(screen.getByTestId("app-catalog-card-image-badge")).toHaveClass(
            "bg-white/[0.56]",
            "text-slate-950",
        );
        expect(screen.queryByText("editorial")).not.toBeInTheDocument();
        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_25%,rgba(255,255,255,0.8)_33%,rgba(255,255,255,0.94)_100%)]",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).not.toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]",
        );
        expectImageCardLayoutToStayFixed();

        await act(async () => {
            document.documentElement.setAttribute("data-color-mode", "dark");
            observers.forEach((observer) => observer.callback());
        });

        await waitFor(() => {
            expect(
                screen.getByTestId("app-catalog-card-image"),
            ).toHaveAttribute(
                "src",
                "https://images.example/launchpad-dark.webp",
            );
        });
        await waitFor(() => {
            expect(
                screen.getByRole("heading", { name: "Editorial Launchpad" }),
            ).toHaveClass("text-white");
        });
        expect(screen.getByTestId("app-catalog-card-image-badge")).toHaveClass(
            "text-white",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0)_25%,rgba(2,6,23,0.8)_33%,rgba(2,6,23,0.94)_100%)]",
        );
        expectImageCardLayoutToStayFixed();
    });

    test("supports a softer Home image overlay without changing the default app overlay", () => {
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Home Launchpad"
                description="Launch newsroom applets"
                imageLightUrl="https://images.example/home-light.webp"
                imageOverlayVariant="home"
            />,
        );

        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).not.toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_25%,rgba(255,255,255,0.8)_33%,rgba(255,255,255,0.94)_100%)]",
        );
    });

    test("supports an app-library image overlay without changing the default app overlay", () => {
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Catalog Launchpad"
                description="Launch newsroom applets"
                imageLightUrl="https://images.example/catalog-light.webp"
                imageOverlayVariant="app-library"
            />,
        );

        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).not.toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_25%,rgba(255,255,255,0.8)_33%,rgba(255,255,255,0.94)_100%)]",
        );
    });

    test("keeps the stronger dark overlay on Home image cards", () => {
        document.documentElement.setAttribute("data-color-mode", "dark");

        render(
            <AppCatalogCard
                title="Home Launchpad"
                description="Launch newsroom applets"
                imageDarkUrl="https://images.example/home-dark.webp"
                imageOverlayVariant="home"
            />,
        );

        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.36)_42%,rgba(2,6,23,0.84)_100%)]",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).not.toHaveClass(
            "bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0)_25%,rgba(2,6,23,0.8)_33%,rgba(2,6,23,0.94)_100%)]",
        );
    });

    test("keeps app-library dark overlay focused on the lower reading area", () => {
        document.documentElement.setAttribute("data-color-mode", "dark");

        render(
            <AppCatalogCard
                title="Catalog Launchpad"
                description="Launch newsroom applets"
                imageDarkUrl="https://images.example/catalog-dark.webp"
                imageOverlayVariant="app-library"
            />,
        );

        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0)_40%,rgba(2,6,23,0.8)_66%,rgba(2,6,23,0.94)_100%)]",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).not.toHaveClass(
            "bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0)_25%,rgba(2,6,23,0.8)_33%,rgba(2,6,23,0.94)_100%)]",
        );
    });

    test("renders image actions in the top overlay row", () => {
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Catalog Launchpad"
                description="Launch newsroom applets"
                imageLightUrl="https://images.example/catalog-light.webp"
                imageBadge="Tools"
                imageActions={<button type="button">Edit</button>}
            />,
        );

        expect(
            screen.getByTestId("app-catalog-card-image-actions"),
        ).toContainElement(screen.getByRole("button", { name: "Edit" }));
    });

    test("keeps hover affordances locked while card interactions are active", () => {
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Catalog Launchpad"
                description="Launch newsroom applets"
                imageLightUrl="https://images.example/catalog-light.webp"
                imageActions={<button type="button">More actions</button>}
                isInteractionActive
            />,
        );

        expect(screen.getByTestId("app-catalog-card")).toHaveAttribute(
            "data-interaction-active",
            "true",
        );
        expect(screen.getByTestId("app-catalog-card-image")).toHaveClass(
            "group-data-[interaction-active=true]:scale-[1.03]",
        );
        expect(
            screen.getByTestId("app-catalog-card-image-actions"),
        ).toHaveClass(
            "group-data-[interaction-active=true]:pointer-events-auto",
            "group-data-[interaction-active=true]:opacity-100",
        );
    });

    test("can suppress card motion while a menu action settles", () => {
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Catalog Launchpad"
                description="Launch newsroom applets"
                imageLightUrl="https://images.example/catalog-light.webp"
                imageActions={<button type="button">More actions</button>}
                suppressInteractionMotion
            />,
        );

        expect(screen.getByTestId("app-catalog-card")).toHaveClass(
            "transition-none",
        );
        expect(screen.getByTestId("app-catalog-card-image")).toHaveClass(
            "transition-none",
            "duration-0",
        );
        expect(
            screen.getByTestId("app-catalog-card-image-actions"),
        ).toHaveClass("transition-none", "duration-0");
    });

    test("uses app-library visual layout even without generated artwork", () => {
        document.documentElement.setAttribute("data-color-mode", "light");

        render(
            <AppCatalogCard
                title="Fallback Launchpad"
                description="Launch newsroom applets"
                imageBadge="Tools"
                imageOverlayVariant="app-library"
                imageActions={<button type="button">Edit</button>}
            />,
        );

        expect(
            screen.queryByTestId("app-catalog-card-image"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]",
        );
        expect(screen.getByTestId("app-catalog-card-image-badge")).toHaveClass(
            "bg-white/[0.56]",
            "text-slate-950",
        );
        expectImageCardLayoutToStayFixed();
    });
});
