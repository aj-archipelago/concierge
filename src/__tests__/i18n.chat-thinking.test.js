import en from "../../config/default/locales/en.json";
import ar from "../../config/default/locales/ar.json";

describe("chat thinking locale labels", () => {
    it("defines labels for both streaming and completed thinking states", () => {
        expect(en["Thinking with duration"]).toBeTruthy();
        expect(en["Thought for duration"]).toBeTruthy();
        expect(ar["Thinking with duration"]).toBeTruthy();
        expect(ar["Thought for duration"]).toBeTruthy();
    });

    it("defines tool error detail toggles", () => {
        expect(en["Show tool error details"]).toBeTruthy();
        expect(en["Hide tool error details"]).toBeTruthy();
        expect(en["Tool failed"]).toBeTruthy();
        expect(en["Tool running"]).toBeTruthy();
        expect(en["Tool succeeded"]).toBeTruthy();
        expect(ar["Show tool error details"]).toBeTruthy();
        expect(ar["Hide tool error details"]).toBeTruthy();
        expect(ar["Tool failed"]).toBeTruthy();
        expect(ar["Tool running"]).toBeTruthy();
        expect(ar["Tool succeeded"]).toBeTruthy();
    });
});
