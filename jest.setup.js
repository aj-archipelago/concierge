const { TextEncoder, TextDecoder } = require("util");

// Suppress ReactDOMTestUtils.act deprecation warning and expected test errors
const originalError = console.error;
console.error = (...args) => {
    if (
        typeof args[0] === "string" &&
        args[0].includes("ReactDOMTestUtils.act")
    )
        return;

    // Suppress expected error messages from tests
    const errorMessage = args[0];
    if (typeof errorMessage === "string") {
        // Suppress streaming upload test errors
        if (
            errorMessage.includes("Error uploading to media service:") ||
            errorMessage.includes("Error during test upload:") ||
            errorMessage.includes("Auth check failed:") ||
            errorMessage.includes("Error: Not implemented: navigation") ||
            (errorMessage.includes("Warning: An update to") &&
                errorMessage.includes(
                    "inside a test was not wrapped in act",
                )) ||
            errorMessage.includes("Error fetching remote image from HTML src:")
        ) {
            return;
        }
    }

    originalError.call(console, ...args);
};

// Define text encoder/decoder globals first
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Now initialize JSDOM
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = {
    userAgent: "node.js",
};

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
}));

// Mock MutationObserver
global.MutationObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
}));

// Mock fetch for jsdom environment
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
        status: 200,
        statusText: "OK",
    }),
);

// Add any missing window properties that might be needed
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock window navigation methods
Object.defineProperty(window, "location", {
    writable: true,
    value: {
        href: "http://localhost",
        hostname: "localhost",
        assign: jest.fn(),
        replace: jest.fn(),
        reload: jest.fn(),
        toString: () => "http://localhost",
    },
});

// Mock history API
global.history = {
    pushState: jest.fn(),
    replaceState: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    go: jest.fn(),
};

// Mock require.context for webpack compatibility in jest
require.context = (
    base = ".",
    scanSubDirectories = false,
    regularExpression = /\.js$/,
) => {
    const fs = require("fs");
    const path = require("path");

    const files = {};

    function readDirectory(directory) {
        fs.readdirSync(directory).forEach((file) => {
            const fullPath = path.resolve(directory, file);

            if (fs.statSync(fullPath).isDirectory()) {
                if (scanSubDirectories) {
                    readDirectory(fullPath);
                }
                return;
            }

            if (!regularExpression.test(fullPath)) {
                return;
            }

            files[fullPath] = true;
        });
    }

    try {
        readDirectory(path.resolve(__dirname, base));
    } catch (error) {
        // Just return an empty context if the directory doesn't exist
    }

    const keys = Object.keys(files);
    const context = function (file) {
        // Simple handling for taxonomy-sets
        if (file.includes("taxonomy-sets")) {
            return [];
        }
        // Return empty object as default
        return {};
    };

    context.keys = () => keys;
    context.resolve = (key) => key;
    context.id = base;

    return context;
};
