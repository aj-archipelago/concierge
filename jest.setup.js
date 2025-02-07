const { TextEncoder, TextDecoder } = require("util");

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
