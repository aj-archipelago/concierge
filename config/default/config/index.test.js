import config from "./index.js";

describe("Config - Endpoints", () => {
    let originalEnv;

    beforeEach(() => {
        // Store original environment variables
        originalEnv = process.env.CORTEX_MEDIA_API_URL;
    });

    afterEach(() => {
        // Restore original environment variables
        if (originalEnv !== undefined) {
            process.env.CORTEX_MEDIA_API_URL = originalEnv;
        } else {
            delete process.env.CORTEX_MEDIA_API_URL;
        }
    });

    describe("mediaHelperDirect", () => {
        test("should return CORTEX_MEDIA_API_URL when environment variable is set", () => {
            // Arrange
            const expectedUrl = "https://media-api.example.com";
            process.env.CORTEX_MEDIA_API_URL = expectedUrl;

            // Act
            const result = config.endpoints.mediaHelperDirect();

            // Assert
            expect(result).toBe(expectedUrl);
        });

        test("should return undefined when CORTEX_MEDIA_API_URL is not set", () => {
            // Arrange
            delete process.env.CORTEX_MEDIA_API_URL;

            // Act
            const result = config.endpoints.mediaHelperDirect();

            // Assert
            expect(result).toBeUndefined();
        });

        test("should return empty string when CORTEX_MEDIA_API_URL is empty", () => {
            // Arrange
            process.env.CORTEX_MEDIA_API_URL = "";

            // Act
            const result = config.endpoints.mediaHelperDirect();

            // Assert
            expect(result).toBe("");
        });

        test("should return the exact value of CORTEX_MEDIA_API_URL including special characters", () => {
            // Arrange
            const specialUrl =
                "https://api.example.com:8080/media?version=v1&auth=token123";
            process.env.CORTEX_MEDIA_API_URL = specialUrl;

            // Act
            const result = config.endpoints.mediaHelperDirect();

            // Assert
            expect(result).toBe(specialUrl);
        });

        test("should be a function", () => {
            // Assert
            expect(typeof config.endpoints.mediaHelperDirect).toBe("function");
        });

        test("should not require any parameters", () => {
            // Arrange
            process.env.CORTEX_MEDIA_API_URL = "https://test.example.com";

            // Act & Assert - should not throw when called without parameters
            expect(() => config.endpoints.mediaHelperDirect()).not.toThrow();
        });
    });

    describe("endpoints object structure", () => {
        test("should have mediaHelperDirect property", () => {
            expect(config.endpoints).toHaveProperty("mediaHelperDirect");
        });

        test("should have all expected endpoint functions", () => {
            const expectedEndpoints = [
                "mediaHelper",
                "graphql",
                "mediaHelperDirect",
            ];

            expectedEndpoints.forEach((endpoint) => {
                expect(config.endpoints).toHaveProperty(endpoint);
                expect(typeof config.endpoints[endpoint]).toBe("function");
            });
        });
    });
});
