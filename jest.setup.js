const { TextEncoder, TextDecoder } = require("util");

// Suppress ReactDOMTestUtils.act deprecation warning
const originalError = console.error;
console.error = (...args) => {
    if (args[0]?.includes('ReactDOMTestUtils.act')) return;
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
