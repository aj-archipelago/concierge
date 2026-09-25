import React from "react";
import { render, screen } from "@testing-library/react";
import ChatStreamNotice from "../ChatStreamNotice";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import mockEnglish from "../../../../config/default/locales/en.json";
import mockArabic from "../../../../config/default/locales/ar.json";

let mockLanguage = "en";
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => (mockLanguage === "ar" ? mockArabic : mockEnglish)[key],
    }),
}));
jest.mock("../../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

test.each(["en", "ar"])(
    "renders interrupted and unsaved notices in %s",
    (language) => {
        mockLanguage = language;
        const direction = language === "ar" ? "rtl" : "ltr";
        const { rerender } = render(
            <LanguageContext.Provider value={{ direction }}>
                <ChatStreamNotice
                    message={{
                        tool: JSON.stringify({ streamStatus: "interrupted" }),
                    }}
                />
            </LanguageContext.Provider>,
        );
        expect(screen.getByRole("status").getAttribute("dir")).toBe(direction);
        expect(screen.getByRole("status").textContent).toBe(
            (language === "ar" ? mockArabic : mockEnglish)[
                "Chat reply was interrupted"
            ],
        );
        // The notice wraps at narrow widths and inherits the existing chat layout.
        expect(screen.getByRole("status").className).toContain("break-words");
        expect(screen.getByRole("status").className).toContain(
            "dark:text-amber-200",
        );
        rerender(
            <ChatStreamNotice
                message={{
                    tool: JSON.stringify({ streamStatus: "save_failed" }),
                }}
            />,
        );
        expect(screen.getByRole("status").textContent).toBe(
            (language === "ar" ? mockArabic : mockEnglish)[
                "Chat reply could not be saved"
            ],
        );
    },
);

test.each([null, "invalid JSON", "{}", '{"streamStatus":"completed"}'])(
    "omits notices for ordinary or legacy metadata: %s",
    (tool) => {
        const { container } = render(<ChatStreamNotice message={{ tool }} />);
        expect(container.textContent).toBe("");
    },
);
