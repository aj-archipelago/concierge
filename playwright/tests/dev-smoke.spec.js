import { test, expect } from "@playwright/test";

// Exercise real route compilation, server dependencies, Shadcn aliases, and
// the raw Markdown loader. A dev server's Ready message does not check these.
test("core pages compile and hydrate", async ({ page, baseURL }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
        // Home can contain sandboxed applets without localStorage access.
        if (window !== window.top) return;
        localStorage.setItem("cortexWebShowTos", new Date().toString());
        localStorage.setItem("i18nextLng", "en");
    });
    await page.context().addCookies(
        ["NEXT_LOCALE", "i18next"].map((name) => ({
            name,
            value: "en",
            url: baseURL,
        })),
    );

    for (const pathname of [
        "/home",
        "/colleagues",
        "/media",
        "/help/guides/getting-started",
    ]) {
        await test.step(pathname, async () => {
            const response = await page.goto(pathname);
            expect(response.status()).toBe(200);
            await expect(
                page.locator("[data-page-header]").first(),
            ).toBeVisible({
                timeout: 30000,
            });
            expect(errors).toEqual([]);
        });
    }

    await expect(
        page.getByRole("heading", {
            level: 2,
            name: "Getting Started with Concierge",
        }),
    ).toBeVisible();
    const response = await page.request.get("/api/colleagues?limit=1");
    expect(response.status()).toBe(200);
    const directory = await response.json();
    expect(directory.colleagues.length).toBeLessThanOrEqual(1);
    expect(directory.limit).toBe(1);
    expect(errors).toEqual([]);
});
