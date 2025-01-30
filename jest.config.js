module.exports = {
    testEnvironment: "jsdom",
    transform: {
        "^.+\\.(js|jsx|mjs)$": [
            "babel-jest",
            {
                presets: [
                    ["@babel/preset-env", { targets: { node: "current" } }],
                    "@babel/preset-react",
                ],
            },
        ],
    },
    testMatch: ["**/*.test.js"],
    setupFiles: [
        "<rootDir>/__mocks__/setup.js",
        "<rootDir>/jest.setup.js"
    ],
    moduleDirectories: ["node_modules", "__mocks__"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/@/$1",
        "^@components/(.*)$": "<rootDir>/@/components/$1",
        "^@lib/(.*)$": "<rootDir>/app/lib/$1",
        "^@utils/(.*)$": "<rootDir>/app/utils/$1",
        "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
            "<rootDir>/__mocks__/fileMock.js",
        "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
        "^config/(.*)$": "<rootDir>/__mocks__/config/$1",
        "^./config/(.*)$": "<rootDir>/__mocks__/config/$1",
    },
    modulePathIgnorePatterns: [".next"],
    projects: [
        {
            displayName: "components",
            testEnvironment: "jsdom",
            testMatch: ["<rootDir>/src/**/*.test.js"],
            transform: {
                "^.+\\.(js|jsx|mjs)$": [
                    "babel-jest",
                    {
                        presets: [
                            ["@babel/preset-env", { targets: { node: "current" } }],
                            "@babel/preset-react",
                        ],
                    },
                ],
            },
        },
        {
            displayName: "node",
            testEnvironment: "node",
            testMatch: ["<rootDir>/instrumentation.test.js"],
            transform: {
                "^.+\\.(js|jsx|mjs)$": [
                    "babel-jest",
                    {
                        presets: [
                            ["@babel/preset-env", { 
                                targets: { node: "current" },
                                modules: "commonjs"
                            }],
                            "@babel/preset-react",
                        ],
                    },
                ],
            },
            moduleNameMapper: {
                "^config/(.*)$": "<rootDir>/__mocks__/config/$1",
                "^./config/(.*)$": "<rootDir>/__mocks__/config/$1",
            },
        },
    ],
};
