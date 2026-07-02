import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QUERIES } from "../../../graphql";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import Translation, {
    buildTranslationRequest,
    normalizeTranslationStrategy,
    TRANSLATION_STRATEGIES,
} from "../Translation";

const mockQuery = jest.fn();

jest.mock("@apollo/client", () => ({
    ...jest.requireActual("@apollo/client"),
    useApolloClient: () => ({
        query: mockQuery,
    }),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("../../CopyButton", () => () => null);
jest.mock("../../editor/LoadingButton", () => ({
    __esModule: true,
    default: ({ children, disabled, loading, onClick }) => (
        <button disabled={disabled || loading} onClick={onClick}>
            {children}
        </button>
    ),
}));

function renderTranslation(props = {}) {
    const defaultProps = {
        inputText: "Hello",
        translationStrategy: TRANSLATION_STRATEGIES.GPT_55,
        translationLanguage: "fr",
        translatedText: "",
        setTranslatedText: jest.fn(),
        setTranslationInputText: jest.fn(),
        setTranslationLanguage: jest.fn(),
        setTranslationStrategy: jest.fn(),
    };

    return render(
        <LanguageContext.Provider value={{ direction: "ltr" }}>
            <Translation {...defaultProps} {...props} />
        </LanguageContext.Provider>,
    );
}

describe("Translation model selector", () => {
    const originalNextFlag =
        process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM;
    let consoleError;

    beforeEach(() => {
        mockQuery.mockReset();
        delete process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM;
        consoleError = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    afterAll(() => {
        if (originalNextFlag === undefined) {
            delete process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM;
        } else {
            process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM =
                originalNextFlag;
        }
    });

    it("shows Google TranslateLLM by default", () => {
        renderTranslation();

        expect(
            normalizeTranslationStrategy(
                TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
            ),
        ).toBe(TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM);
        expect(screen.getByText("Google TranslateLLM")).not.toBeNull();
    });

    it("hides Google TranslateLLM when explicitly disabled and normalizes stale saved values", () => {
        process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM = "false";

        renderTranslation();

        expect(screen.queryByText("Google TranslateLLM")).toBeNull();
        expect(
            normalizeTranslationStrategy(
                TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
            ),
        ).toBe(TRANSLATION_STRATEGIES.GPT_55);
    });

    it("routes the default GPT strategy through GPT 5.5", async () => {
        const setTranslatedText = jest.fn();
        mockQuery.mockResolvedValue({
            data: {
                translate: {
                    result: "Bonjour",
                },
            },
        });

        renderTranslation({
            setTranslatedText,
            translationStrategy: TRANSLATION_STRATEGIES.GPT_55,
        });

        expect(screen.getByText(/GPT 5\.5/)).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Translate" }));

        await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
        expect(mockQuery).toHaveBeenCalledWith({
            query: QUERIES.TRANSLATE,
            variables: {
                text: "Hello",
                to: "French",
                model: "oai-gpt55",
            },
        });
        await waitFor(() =>
            expect(setTranslatedText).toHaveBeenCalledWith("Bonjour"),
        );
    });

    it("includes Roman Urdu, Punjabi, and Hindi as main translation targets", () => {
        renderTranslation();

        const languageSelect = screen.getByLabelText("Translate to");

        expect(
            [...languageSelect.options].map((option) => option.textContent),
        ).toEqual(expect.arrayContaining(["Roman Urdu", "Punjabi", "Hindi"]));
    });

    it("routes Roman Urdu, Punjabi, and Hindi targets through model translation by language name", () => {
        expect(
            buildTranslationRequest(
                TRANSLATION_STRATEGIES.GPT_55,
                "<p>Hello</p>",
                "ur-Latn",
            ).variables,
        ).toEqual({
            text: "Hello",
            to: "Roman Urdu",
            model: "oai-gpt55",
        });

        expect(
            buildTranslationRequest(
                TRANSLATION_STRATEGIES.GPT_55,
                "Hello",
                "pa",
            ).variables,
        ).toEqual({
            text: "Hello",
            to: "Punjabi",
            model: "oai-gpt55",
        });

        expect(
            buildTranslationRequest(
                TRANSLATION_STRATEGIES.GPT_55,
                "Hello",
                "hi",
            ).variables,
        ).toEqual({
            text: "Hello",
            to: "Hindi",
            model: "oai-gpt55",
        });
    });

    it("hides Roman Urdu for code-based translation strategies but keeps Punjabi and Hindi", () => {
        renderTranslation({
            translationStrategy: TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
        });

        const languageSelect = screen.getByLabelText("Translate to");
        const optionLabels = [...languageSelect.options].map(
            (option) => option.textContent,
        );

        expect(optionLabels).not.toContain("Roman Urdu");
        expect(optionLabels).toContain("Punjabi");
        expect(optionLabels).toContain("Hindi");
    });

    it("resets stale Roman Urdu selection when switching to a code-based strategy", async () => {
        const setTranslationLanguage = jest.fn();

        renderTranslation({
            setTranslationLanguage,
            translationLanguage: "ur-Latn",
            translationStrategy: TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
        });

        await waitFor(() =>
            expect(setTranslationLanguage).toHaveBeenCalledWith("en"),
        );
    });

    it("rejects Roman Urdu for code-based translation requests", () => {
        expect(() =>
            buildTranslationRequest(
                TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
                "Hello",
                "ur-Latn",
            ),
        ).toThrow("Roman Urdu is not supported");
    });

    it("keeps supported target codes for Google TranslateLLM", () => {
        expect(
            buildTranslationRequest(
                TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
                "Hello",
                "pa",
            ).variables,
        ).toEqual({
            text: "Hello",
            to: "pa",
        });

        expect(
            buildTranslationRequest(
                TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
                "Hello",
                "hi",
            ).variables,
        ).toEqual({
            text: "Hello",
            to: "hi",
        });
    });

    it("routes Google TranslateLLM to its pathway", async () => {
        const setTranslatedText = jest.fn();
        mockQuery.mockResolvedValue({
            data: {
                translate_google_llm: {
                    result: "Bonjour",
                },
            },
        });

        renderTranslation({
            setTranslatedText,
            translationStrategy: TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
        });

        expect(screen.getByText("Google TranslateLLM")).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Translate" }));

        await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
        expect(mockQuery).toHaveBeenCalledWith({
            query: QUERIES.TRANSLATE_GOOGLE_LLM,
            variables: {
                text: "Hello",
                to: "fr",
            },
        });
        await waitFor(() =>
            expect(setTranslatedText).toHaveBeenCalledWith("Bonjour"),
        );
    });

    it("normalizes empty provider responses into a useful error message", async () => {
        process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM = "true";
        const setTranslatedText = jest.fn();
        mockQuery.mockResolvedValue({
            data: {
                translate_google_llm: {
                    result: null,
                },
            },
        });

        renderTranslation({
            setTranslatedText,
            translationStrategy: TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
        });

        fireEvent.click(screen.getByRole("button", { name: "Translate" }));

        await waitFor(() =>
            expect(setTranslatedText).toHaveBeenCalledWith(
                expect.stringContaining(
                    "Translation service returned no result.",
                ),
            ),
        );
    });

    it("surfaces GraphQL provider errors before falling back to null result handling", async () => {
        process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM = "true";
        const setTranslatedText = jest.fn();
        mockQuery.mockResolvedValue({
            errors: [{ message: "Cloud Translation API is disabled" }],
            data: {
                translate_google_llm: null,
            },
        });

        renderTranslation({
            setTranslatedText,
            translationStrategy: TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
        });

        fireEvent.click(screen.getByRole("button", { name: "Translate" }));

        await waitFor(() =>
            expect(setTranslatedText).toHaveBeenCalledWith(
                expect.stringContaining("Cloud Translation API is disabled"),
            ),
        );
    });

    it("surfaces Cortex pathway errors returned in the pathway payload", async () => {
        process.env.NEXT_PUBLIC_ENABLE_GOOGLE_TRANSLATE_LLM = "true";
        const setTranslatedText = jest.fn();
        mockQuery.mockResolvedValue({
            data: {
                translate_google_llm: {
                    result: null,
                    errors: ["Cloud Translation API has not been used"],
                },
            },
        });

        renderTranslation({
            setTranslatedText,
            translationStrategy: TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM,
        });

        fireEvent.click(screen.getByRole("button", { name: "Translate" }));

        await waitFor(() =>
            expect(setTranslatedText).toHaveBeenCalledWith(
                expect.stringContaining(
                    "Cloud Translation API has not been used",
                ),
            ),
        );
    });
});
