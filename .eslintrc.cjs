module.exports = {
    extends: ["react-app", "react-app/jest"],
    plugins: ["@eslint-community/eslint-comments"],
    rules: {
        // Prevent disabling no-use-before-define rule - it causes real errors in production
        "@eslint-community/eslint-comments/no-restricted-disable": [
            "error",
            "no-use-before-define",
        ],
    },
    overrides: [
        {
            // Playwright e2e tests don't use React Testing Library
            files: ["playwright/**/*.spec.js", "playwright/**/*.test.js"],
            rules: {
                "testing-library/prefer-screen-queries": "off",
                "testing-library/await-async-utils": "off",
                "testing-library/await-async-query": "off",
                "testing-library/no-wait-for-empty-callback": "off",
                "testing-library/no-node-access": "off",
                "jest/no-conditional-expect": "off",
                "no-unused-vars": "off",
            },
        },
    ],
};
