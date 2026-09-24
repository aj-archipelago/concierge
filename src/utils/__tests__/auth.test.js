import {
    isAuthFlowPath,
    isAzureAppService,
    sanitizeAppRedirect,
} from "../auth";

describe("isAzureAppService", () => {
    const originalLocation = Object.getOwnPropertyDescriptor(
        window,
        "location",
    );
    const originalNodeEnv = process.env.NODE_ENV;
    const originalEasyAuth = process.env.NEXT_PUBLIC_AUTH_USE_EASY_AUTH;

    function setHostname(hostname) {
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { hostname },
        });
    }

    beforeEach(() => {
        process.env.NODE_ENV = "test";
        delete process.env.NEXT_PUBLIC_AUTH_USE_EASY_AUTH;
    });

    afterEach(() => {
        Object.defineProperty(window, "location", originalLocation);
        if (originalEasyAuth === undefined)
            delete process.env.NEXT_PUBLIC_AUTH_USE_EASY_AUTH;
        else process.env.NEXT_PUBLIC_AUTH_USE_EASY_AUTH = originalEasyAuth;
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
    });

    it.each([
        "azurewebsites.net",
        "concierge.azurewebsites.net",
        "azure.com",
        "portal.azure.com",
    ])("recognizes Azure hostname %s", (hostname) => {
        setHostname(hostname);
        expect(isAzureAppService()).toBe(true);
    });

    it.each([
        "azurewebsites.net.evil.example",
        "concierge.azurewebsites.net.evil.example",
        "fakeazurewebsites.net",
        "azure.com.evil.example",
        "fakeazure.com",
        "localhost",
    ])("does not select Azure authentication for %s", (hostname) => {
        setHostname(hostname);
        expect(isAzureAppService()).toBe(false);
    });

    it("requires explicit Azure authentication on custom production domains", () => {
        process.env.NODE_ENV = "production";
        setHostname("concierge.example.net");
        expect(isAzureAppService()).toBe(false);
        process.env.NEXT_PUBLIC_AUTH_USE_EASY_AUTH = "true";
        expect(isAzureAppService()).toBe(true);
    });
});

describe("sanitizeAppRedirect", () => {
    const origin = "http://localhost:3000";

    it("keeps same-origin relative and absolute paths", () => {
        expect(sanitizeAppRedirect("/chat/new", origin)).toBe("/chat/new");
        expect(
            sanitizeAppRedirect("http://localhost:3000/chat/abc?x=1", origin),
        ).toBe("/chat/abc?x=1");
    });

    it("rejects external and protocol-relative URLs", () => {
        expect(sanitizeAppRedirect("https://evil.example/phish", origin)).toBe(
            "/",
        );
        expect(sanitizeAppRedirect("//evil.example/phish", origin)).toBe("/");
        expect(
            sanitizeAppRedirect(["javascript", "alert(1)"].join(":"), origin),
        ).toBe("/");
    });

    it("rejects auth-loop paths", () => {
        expect(sanitizeAppRedirect("/auth/login", origin)).toBe("/");
        expect(
            sanitizeAppRedirect("/api/auth/local?action=login", origin),
        ).toBe("/");
        expect(sanitizeAppRedirect("/.auth/login/aad", origin)).toBe("/");
    });
});

describe("isAuthFlowPath", () => {
    it("detects local login routes", () => {
        expect(isAuthFlowPath("/auth/login")).toBe(true);
        expect(isAuthFlowPath("/api/auth/local")).toBe(true);
        expect(isAuthFlowPath("/chat/new")).toBe(false);
    });
});
