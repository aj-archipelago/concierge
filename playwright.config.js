import { defineConfig } from "@playwright/test";
import fs from "fs";
import path from "path";
import os from "os";

if (process.env.NO_COLOR) {
    delete process.env.NO_COLOR;
}

if (
    process.arch === "arm64" &&
    !process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE
) {
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "mac-arm64";
}

const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3001";

const parsedBaseURL = (() => {
    try {
        return new URL(baseURL);
    } catch {
        return null;
    }
})();
const isLocalhost =
    parsedBaseURL &&
    (parsedBaseURL.hostname === "localhost" ||
        parsedBaseURL.hostname === "127.0.0.1");
const baseURLPort = parsedBaseURL?.port || (isLocalhost ? "3001" : undefined);
const baseURLHost = isLocalhost ? parsedBaseURL?.hostname : undefined;

const webServerCommand = (() => {
    if (isLocalhost && baseURLHost) {
        const portArg = baseURLPort ? `-p ${baseURLPort}` : "";
        return `npm run prebuild && next dev -H ${baseURLHost} ${portArg}`.trim();
    }
    return "npm run next:dev";
})();

const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";
const browserName = process.env.PLAYWRIGHT_BROWSER || "chromium";
const homeDir = os.homedir();
const chromeExecutable =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const hasSystemChrome = fs.existsSync(chromeExecutable);

const chromiumExecutableCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    path.join(
        homeDir,
        "Library/Caches/ms-playwright/chromium-1181/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ),
    path.join(
        homeDir,
        "Library/Caches/ms-playwright/chromium-1179/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ),
    path.join(
        homeDir,
        "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    ),
    path.join(
        homeDir,
        "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ),
    path.join(
        homeDir,
        "Library/Caches/ms-playwright/chromium-1208/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ),
    path.join(
        homeDir,
        "Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    ),
].filter(Boolean);

const chromiumExecutable = chromiumExecutableCandidates.find((candidate) =>
    fs.existsSync(candidate),
);
const chromiumLaunchOptions = {
    args: ["--disable-crashpad", "--disable-crash-reporter"],
};

export default defineConfig({
    testDir: "./playwright/tests",
    timeout: 60000,
    expect: {
        timeout: 5000,
    },
    fullyParallel: false,
    workers: 1,
    retries: 2,
    reporter: [["list"], ["html", { open: "never" }]],
    globalSetup: "./playwright/global-setup.js",
    webServer: {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env:
            baseURLPort || baseURLHost
                ? {
                      ...(baseURLPort ? { PORT: baseURLPort } : {}),
                      ...(baseURLHost ? { HOSTNAME: baseURLHost } : {}),
                  }
                : undefined,
    },
    projects: [
        {
            name: browserName,
            use: {
                browserName,
                ...(browserName === "chromium"
                    ? {
                          executablePath: chromiumExecutable,
                          channel:
                              useSystemChrome && hasSystemChrome
                                  ? "chrome"
                                  : undefined,
                          launchOptions: chromiumLaunchOptions,
                      }
                    : {}),
            },
        },
    ],
    use: {
        baseURL,
        actionTimeout: 5000,
        navigationTimeout: 15000,
        storageState: "playwright/.auth/state.json",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
});
