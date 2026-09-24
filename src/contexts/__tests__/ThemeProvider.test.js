import React, { useContext } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuthContext } from "../../App";
import { ThemeContext, ThemeProvider } from "../ThemeProvider";
import { THEME_INIT_SCRIPT } from "../../utils/themePreference";

jest.mock("../../App", () => ({
    AuthContext: require("react").createContext({}),
}));

function ThemeConsumer() {
    const { theme, changeTheme } = useContext(ThemeContext);
    return (
        <button
            onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}
        >
            {theme}
        </button>
    );
}

function renderTheme({ savedTheme, userState, update = jest.fn() } = {}) {
    const tree = (state) => (
        <AuthContext.Provider
            value={{ userState: state, debouncedUpdateUserState: update }}
        >
            <ThemeProvider savedTheme={savedTheme}>
                <ThemeConsumer />
            </ThemeProvider>
        </AuthContext.Provider>
    );
    const view = render(tree(userState));
    return {
        ...view,
        update,
        restore: (state) => view.rerender(tree(state)),
    };
}

beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-color-mode");
    document.documentElement.removeAttribute("style");
    document.body.className = "";
    document.cookie = "theme=; path=/; max-age=0";
    window.matchMedia = jest.fn(() => ({ matches: true }));
});

afterEach(() => jest.restoreAllMocks());

describe("startup theme before React", () => {
    it.each([
        ["dark", false, "dark"],
        ["light", true, "light"],
        [undefined, true, "dark"],
        [undefined, false, "light"],
        ["invalid", true, "dark"],
    ])(
        "resolves cookie %s with system dark=%s to %s",
        (cookie, systemDark, expected) => {
            if (cookie)
                document.documentElement.setAttribute(
                    "data-color-mode",
                    cookie,
                );
            window.matchMedia.mockReturnValue({ matches: systemDark });

            // Execute the exact inline script before mounting React.
            // eslint-disable-next-line no-eval
            window.eval(THEME_INIT_SCRIPT);

            expect(document.documentElement.classList.contains("dark")).toBe(
                expected === "dark",
            );
            expect(
                document.documentElement.getAttribute("data-color-mode"),
            ).toBe(expected);
            expect(document.documentElement.style.colorScheme).toBe(expected);
            expect(document.documentElement.style.backgroundColor).toBe(
                expected === "dark" ? "rgb(3, 7, 18)" : "rgb(249, 250, 251)",
            );
            expect(document.cookie).not.toContain("theme=");
        },
    );
});

describe("saved theme persistence", () => {
    it("keeps the prepaint system theme through mount without saving an implicit preference", () => {
        // eslint-disable-next-line no-eval
        window.eval(THEME_INIT_SCRIPT);
        const { update } = renderTheme({ userState: {} });

        expect(screen.getByRole("button").textContent).toBe("dark");
        expect(document.body.classList.contains("dark")).toBe(true);
        expect(document.cookie).not.toContain("theme=");
        expect(update).not.toHaveBeenCalled();
    });

    it.each([undefined, "light"])(
        "repairs a missing or stale cookie (%s) when the account preference loads",
        (savedTheme) => {
            const cookieWrites = jest.spyOn(document, "cookie", "set");
            const { restore } = renderTheme({ savedTheme });

            restore({ preferences: { theme: "dark" } });

            expect(screen.getByRole("button").textContent).toBe("dark");
            expect(document.documentElement.classList.contains("dark")).toBe(
                true,
            );
            expect(document.body.classList.contains("dark")).toBe(true);
            expect(document.cookie).toContain("theme=dark");
            expect(cookieWrites).toHaveBeenLastCalledWith(
                "theme=dark; path=/; max-age=31536000; SameSite=Lax",
            );
        },
    );

    it("uses an already-loaded account preference immediately and toggles both root and legacy styles", () => {
        const { update } = renderTheme({
            savedTheme: "light",
            userState: { preferences: { theme: "dark" } },
        });
        expect(screen.getByRole("button").textContent).toBe("dark");

        fireEvent.click(screen.getByRole("button"));

        expect(document.documentElement.classList.contains("dark")).toBe(false);
        expect(document.body.classList.contains("dark")).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe("light");
        expect(document.cookie).toContain("theme=light");
        expect(update).toHaveBeenCalledTimes(1);
        expect(
            update.mock.calls[0][0]({ preferences: { language: "ar" } }),
        ).toEqual({
            preferences: { language: "ar", theme: "light" },
        });
    });

    it("still migrates an explicit legacy cookie into an account with no saved theme", () => {
        const { update } = renderTheme({ savedTheme: "dark", userState: {} });
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]({})).toEqual({
            preferences: { theme: "dark" },
        });
    });
});
