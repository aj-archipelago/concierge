import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useApolloClient } from "@apollo/client";
import SecretsEditor from "../SecretsEditor";
import { LanguageContext } from "../../contexts/LanguageProvider";

jest.mock("@apollo/client", () => ({
    useApolloClient: jest.fn(),
}));

jest.mock("../../graphql", () => ({
    SYS_GET_ENTITIES: "SYS_GET_ENTITIES",
}));

jest.mock("../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("react-i18next", () => {
    const t = (key) => key;
    return {
        useTranslation: () => ({ t }),
    };
});

const jsonResponse = (body) => ({
    ok: true,
    json: async () => body,
});

const renderEditor = (props = {}) =>
    render(
        <LanguageContext.Provider value={{ direction: "ltr" }}>
            <SecretsEditor entityId="entity-1" closeOnSave={false} {...props} />
        </LanguageContext.Provider>,
    );

describe("SecretsEditor", () => {
    beforeEach(() => {
        useApolloClient.mockReturnValue({
            refetchQueries: jest.fn().mockResolvedValue([]),
        });
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({ secretKeys: ["SERVICE_API_KEY"] }),
            )
            .mockResolvedValueOnce(
                jsonResponse({ secretKeys: ["SERVICE_API_KEY"] }),
            )
            .mockResolvedValueOnce(
                jsonResponse({ secretKeys: ["SERVICE_API_KEY"] }),
            );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("masks saved secret values and shows in-place confirmation", async () => {
        const onClose = jest.fn();

        renderEditor({ onClose });

        const valueInput = await screen.findByDisplayValue("********");
        expect(valueInput.getAttribute("type")).toBe("password");

        await userEvent.click(valueInput);
        await waitFor(() => expect(valueInput.value).toBe(""));

        await userEvent.type(valueInput, "updated-secret");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));

        const patchCall = global.fetch.mock.calls.find(
            ([, options]) => options?.method === "PATCH",
        );
        expect(JSON.parse(patchCall[1].body)).toEqual({
            secrets: { SERVICE_API_KEY: "updated-secret" },
        });

        expect(await screen.findByDisplayValue("********")).toBeTruthy();
        expect(screen.getByText("Saved")).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
    });
});
