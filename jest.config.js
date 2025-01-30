module.exports = {
    watchPathIgnorePatterns: ["\\.next"],
    modulePathIgnorePatterns: ["<rootDir>/.next", "<rootDir>/.next/standalone"],
    testPathIgnorePatterns: ["<rootDir>/.next", "<rootDir>/.next/standalone"],
    transformIgnorePatterns: ["node_modules", "\\.next"],
    haste: {
        forceNodeFilesystemAPI: true,
        enableSymlinks: false,
        throwOnModuleCollision: false,
    },
    projects: [
        {
            displayName: "components",
            testEnvironment: "jest-environment-jsdom",
            testMatch: ["<rootDir>/src/**/*.test.js"],
            setupFiles: [
                "<rootDir>/jest.setup.js",
                "<rootDir>/__mocks__/setup.js",
            ],
            transform: {
                "^.+\\.(js|jsx|mjs)$": [
                    "babel-jest",
                    {
                        presets: [
                            [
                                "@babel/preset-env",
                                { targets: { node: "current" } },
                            ],
                            "@babel/preset-react",
                        ],
                    },
                ],
            },
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
        },
        {
            displayName: "node",
            testEnvironment: "node",
            testMatch: ["<rootDir>/instrumentation.test.js"],
            setupFiles: ["<rootDir>/jest.setup.js"],
            transform: {
                "^.+\\.(js|jsx|mjs)$": [
                    "babel-jest",
                    {
                        presets: [
                            [
                                "@babel/preset-env",
                                { targets: { node: "current" } },
                            ],
                            "@babel/preset-react",
                        ],
                    },
                ],
            },
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
        },
    ],
};
