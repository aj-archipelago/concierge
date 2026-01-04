const projects = process.env.CI
    ? [
          {
              displayName: "node",
              testEnvironment: "node",
              testMatch: [
                  "<rootDir>/instrumentation.test.js",
                  "<rootDir>/app/api/**/*.test.js",
                  "<rootDir>/jobs/**/*.test.js",
                  "<rootDir>/config/**/*.test.js",
              ],
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
                  "\\.(css|less|scss|sass)$":
                      "<rootDir>/__mocks__/styleMock.js",
                  "^config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^./config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^../../../config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^../../../../../config/(.*)$":
                      "<rootDir>/__mocks__/config/$1",
                  "^@amplitude/analytics-browser$":
                      "<rootDir>/__mocks__/@amplitude/analytics-browser.js",
              },
              transformIgnorePatterns: [
                  "/node_modules/(?!(react-markdown|vfile|unist-.*|unified|bail|is-plain-obj|trough|remark-.*|mdast-util-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|rehype-.*|hastscript|web-namespaces|zwitch|html-void-elements)/)",
              ],
          },
      ]
    : [
          {
              displayName: "components",
              testEnvironment: "jsdom",
              testMatch: [
                  "<rootDir>/src/**/*.test.js",
                  "<rootDir>/app/**/*.test.js",
                  "!<rootDir>/app/api/**/*.test.js",
                  "!<rootDir>/instrumentation.test.js",
              ],
              setupFiles: [
                  "<rootDir>/jest.setup.js",
                  "<rootDir>/jest.setup.react.js",
                  "<rootDir>/jest.setup.amplitude.js",
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
                  "\\.(css|less|scss|sass)$":
                      "<rootDir>/__mocks__/styleMock.js",
                  "^config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^./config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^../../../config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^../../../../../config/(.*)$":
                      "<rootDir>/__mocks__/config/$1",
                  "^@amplitude/analytics-browser$":
                      "<rootDir>/__mocks__/@amplitude/analytics-browser.js",
                  "^@uidotdev/usehooks$":
                      "<rootDir>/__mocks__/@uidotdev/usehooks.js",
              },
              transformIgnorePatterns: [
                  "/node_modules/(?!(react-markdown|vfile|unist-.*|unified|bail|is-plain-obj|trough|remark-.*|mdast-util-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|rehype-.*|hastscript|web-namespaces|zwitch|html-void-elements)/)",
              ],
          },
          {
              displayName: "node",
              testEnvironment: "node",
              testMatch: [
                  "<rootDir>/instrumentation.test.js",
                  "<rootDir>/app/api/**/*.test.js",
                  "<rootDir>/jobs/**/*.test.js",
                  "<rootDir>/config/**/*.test.js",
              ],
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
                  "\\.(css|less|scss|sass)$":
                      "<rootDir>/__mocks__/styleMock.js",
                  "^config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^./config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^../../../config/(.*)$": "<rootDir>/__mocks__/config/$1",
                  "^../../../../../config/(.*)$":
                      "<rootDir>/__mocks__/config/$1",
                  "^@amplitude/analytics-browser$":
                      "<rootDir>/__mocks__/@amplitude/analytics-browser.js",
              },
              transformIgnorePatterns: [
                  "/node_modules/(?!(react-markdown|vfile|unist-.*|unified|bail|is-plain-obj|trough|remark-.*|mdast-util-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|rehype-.*|hastscript|web-namespaces|zwitch|html-void-elements)/)",
              ],
          },
      ];

// eslint-disable-next-line import/no-anonymous-default-export
export default {
    // Force exit after tests complete to prevent hanging from open handles
    // (Apollo client, timers, etc. that don't clean up properly in jsdom)
    forceExit: true,
    watchPathIgnorePatterns: ["\\.next"],
    modulePathIgnorePatterns: ["<rootDir>/.next", "<rootDir>/.next/standalone"],
    testPathIgnorePatterns: ["<rootDir>/.next", "<rootDir>/.next/standalone"],
    transformIgnorePatterns: [
        "/node_modules/(?!(react-markdown|vfile|unist-.*|unified|bail|is-plain-obj|trough|remark-.*|mdast-util-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|rehype-.*|hastscript|web-namespaces|zwitch|html-void-elements)/)",
    ],
    haste: {
        forceNodeFilesystemAPI: true,
        enableSymlinks: false,
        throwOnModuleCollision: false,
    },
    projects,
};
