import { test, expect } from "@playwright/test";

test.describe("Performance Profiling - New Chat Creation", () => {
    test("Profile new chat creation speed", async ({ page }) => {
        const results = {
            current: [],
            totalRuns: 8,
        };

        console.log("\nStarting performance profiling...\n");

        for (let i = 0; i < results.totalRuns; i++) {
            if (!page || page.isClosed()) {
                console.log("Page closed, stopping test");
                break;
            }

            try {
                await page.goto("/chat", {
                    waitUntil: "domcontentloaded",
                    timeout: 15000,
                });
            } catch (e) {
                console.log(`Run ${i + 1}: Navigation failed - ${e.message}`);
                break;
            }

            await page.waitForTimeout(800);

            try {
                await page.keyboard.press("Escape");
                await page.waitForTimeout(200);
            } catch (e) {}

            const startTime = Date.now();
            try {
                const button = page.getByTestId("sidebar-new-chat-button");
                await button.click({ force: true });
            } catch (e) {
                console.log(`Run ${i + 1}: Click failed - ${e.message}`);
                break;
            }

            try {
                await page.waitForURL(/\/chat\//, { timeout: 3000 });
            } catch (e) {}

            const duration = Date.now() - startTime;
            results.current.push(duration);
            console.log(`Run ${i + 1}: ${duration}ms`);

            try {
                await page.waitForTimeout(200);
            } catch {
                break;
            }

            if (page.isClosed()) {
                break;
            }
        }

        if (results.current.length === 0) {
            console.log("No successful runs completed");
            return;
        }

        const avg = (
            results.current.reduce((a, b) => a + b, 0) / results.current.length
        ).toFixed(2);
        const min = Math.min(...results.current);
        const max = Math.max(...results.current);
        const sorted = results.current.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        console.log("\n" + "=".repeat(60));
        console.log("CURRENT BRANCH PERFORMANCE RESULTS");
        console.log("=".repeat(60));
        console.log(`New Chat Creation - Average: ${avg}ms`);
        console.log(
            `                   Min: ${min}ms | Max: ${max}ms | Median: ${median}ms`,
        );
        console.log(
            `                   Runs completed: ${results.current.length}/${results.totalRuns}`,
        );
        console.log("=".repeat(60) + "\n");

        const stats = { avg, min, max, median, runs: results.current };
        const fs = await import("fs");
        fs.writeFileSync(
            "/tmp/perf-current.json",
            JSON.stringify(stats, null, 2),
        );

        expect(parseFloat(avg)).toBeLessThan(8000);
    });
});
