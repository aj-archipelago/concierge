import en from "../../config/default/locales/en.json";
import ar from "../../config/default/locales/ar.json";

describe("chat thinking locale labels", () => {
    it("defines labels for both streaming and completed thinking states", () => {
        expect(en["Thinking with duration"]).toBeTruthy();
        expect(en["Thought for duration"]).toBeTruthy();
        expect(ar["Thinking with duration"]).toBeTruthy();
        expect(ar["Thought for duration"]).toBeTruthy();
    });
});
