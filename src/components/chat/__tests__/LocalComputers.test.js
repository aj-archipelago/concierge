import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocalComputers from "../LocalComputers";
import { LanguageContext } from "../../../contexts/LanguageProvider";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

describe("local computer pairing", () => {
    const originalFetch = global.fetch;
    beforeEach(() => {
        global.fetch = jest.fn(async (url, options) => ({
            ok: true,
            json: async () =>
                url.includes("/config")
                    ? { enabled: true, downloads: {} }
                    : options?.method
                      ? { paired: true }
                      : {
                            devices: [
                                {
                                    id: "mac",
                                    name: "Editing Mac",
                                    online: true,
                                    servers: [
                                        { id: "premiere", name: "Premiere" },
                                    ],
                                },
                            ],
                        },
        }));
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it("shows live computers and submits only the pairing code", async () => {
        render(
            <LanguageContext.Provider value={{ direction: "rtl" }}>
                <LocalComputers />
            </LanguageContext.Provider>,
        );
        expect(await screen.findByText("Editing Mac")).toBeInTheDocument();
        expect(
            screen.getByRole("region", { name: "Concierge Companion" }),
        ).toHaveAttribute("dir", "rtl");
        fireEvent.click(screen.getByText("Troubleshooting"));
        const submit = screen.getByRole("button", { name: "Connect computer" });
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Pairing code"), {
            target: { value: "ABCD-1234-EF56" },
        });
        fireEvent.click(submit);
        await waitFor(() =>
            expect(screen.getByLabelText("Pairing code")).toHaveValue(""),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/users/me/computers",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ code: "ABCD-1234-EF56" }),
            }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/users/me/computers",
                expect.objectContaining({
                    method: "DELETE",
                    body: JSON.stringify({ deviceId: "mac" }),
                }),
            ),
        );
    });
});
