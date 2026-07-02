import { redirect } from "next/navigation";
import Page from "../page";

jest.mock("next/navigation", () => ({
    __esModule: true,
    redirect: jest.fn(),
}));

describe("Applets route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("redirects to the My Applets tab in Apps", () => {
        Page();

        expect(redirect).toHaveBeenCalledWith("/apps?tab=my-applets");
    });
});
