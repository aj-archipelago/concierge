import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomeFullscreenDialog from "./HomeFullscreenDialog";
import { LanguageContext } from "@/src/contexts/LanguageProvider";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("@/src/contexts/LanguageProvider", () => {
    const React = require("react");
    return { LanguageContext: React.createContext({ direction: "ltr" }) };
});

test("Home views focus Close, close with Escape, and restore the opener", async () => {
    function View() {
        const [open, setOpen] = React.useState(false);
        return (
            <>
                <button onClick={() => setOpen(true)}>Open report</button>
                {open && (
                    <HomeFullscreenDialog
                        title="Daily report"
                        onClose={() => setOpen(false)}
                    >
                        <button>Report action</button>
                    </HomeFullscreenDialog>
                )}
            </>
        );
    }
    render(<View />);
    const opener = screen.getByRole("button", { name: "Open report" });
    opener.focus();
    fireEvent.click(opener);
    const back = screen.getByRole("button", { name: "Close" });
    await waitFor(() => expect(back).toHaveFocus());
    fireEvent.keyDown(back, { key: "Escape" });
    await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
});

test("compact Home dialogs carry RTL direction into their portal", () => {
    render(
        <LanguageContext.Provider value={{ direction: "rtl" }}>
            <HomeFullscreenDialog compact title="إضافة" onClose={() => {}}>
                <button>اختيار</button>
            </HomeFullscreenDialog>
        </LanguageContext.Provider>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("dir", "rtl");
});
