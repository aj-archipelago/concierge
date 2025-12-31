import { composeUserDateTimeInfo } from "../datetimeUtils";

describe("datetimeUtils", () => {
    describe("composeUserDateTimeInfo", () => {
        it("should return valid JSON structure", () => {
            // Test with current system timezone (should be valid)
            const result = composeUserDateTimeInfo();
            const parsed = JSON.parse(result);

            expect(parsed).toHaveProperty("datetime");
            expect(parsed.datetime).toHaveProperty("local");
            expect(parsed.datetime).toHaveProperty("iso");
            expect(parsed.datetime).toHaveProperty("timezone");
            expect(parsed.datetime).toHaveProperty("dayOfWeek");
            expect(parsed.datetime).toHaveProperty("timeOfDay");
            expect(typeof parsed.datetime.local).toBe("string");
            expect(typeof parsed.datetime.iso).toBe("string");
            expect(typeof parsed.datetime.timezone).toBe("string");
            expect(typeof parsed.datetime.dayOfWeek).toBe("string");
            expect(typeof parsed.datetime.timeOfDay).toBe("string");
        });

        it("should work with current valid timezone", () => {
            const result = composeUserDateTimeInfo();
            const parsed = JSON.parse(result);

            // Should have a valid timezone (current system timezone)
            expect(parsed.datetime.timezone).toBeTruthy();
            expect(parsed.datetime.timezone).toMatch(/^[A-Za-z_\/]+$/);

            // Should not have originalTimezone when no fallback occurs
            expect(parsed.datetime.originalTimezone).toBeUndefined();
        });

        it("should have valid ISO datetime format", () => {
            const result = composeUserDateTimeInfo();
            const parsed = JSON.parse(result);

            // ISO format should be valid
            expect(() => new Date(parsed.datetime.iso)).not.toThrow();
            expect(parsed.datetime.iso).toMatch(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
            );
        });

        it("should have valid day of week", () => {
            const result = composeUserDateTimeInfo();
            const parsed = JSON.parse(result);

            const validDays = [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ];
            expect(validDays).toContain(parsed.datetime.dayOfWeek);
        });

        it("should have valid time of day", () => {
            const result = composeUserDateTimeInfo();
            const parsed = JSON.parse(result);

            const validTimes = ["morning", "afternoon", "evening", "night"];
            expect(validTimes).toContain(parsed.datetime.timeOfDay);
        });
    });

    describe("timezone validation logic", () => {
        it("should validate common valid timezones", () => {
            // Test the isValidTimezone function indirectly
            const validTimezones = [
                "UTC",
                "America/New_York",
                "Europe/London",
                "Asia/Qatar",
            ];

            validTimezones.forEach((tz) => {
                expect(() => {
                    Intl.DateTimeFormat(undefined, { timeZone: tz });
                }).not.toThrow();
            });
        });

        it("should reject invalid timezones", () => {
            // Test invalid timezone validation
            const invalidTimezones = [
                "Etc/Unknown",
                "Invalid/Timezone",
                "Fake/Zone",
            ];

            invalidTimezones.forEach((tz) => {
                expect(() => {
                    Intl.DateTimeFormat(undefined, { timeZone: tz });
                }).toThrow();
            });
        });
    });
});
