import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import BulkActionsBar from "../BulkActionsBar";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("lucide-react", () => {
    const Icon = () => <span />;
    return {
        CheckSquare: Icon,
        X: Icon,
        Download: Icon,
        Trash2: Icon,
        Tag: Icon,
        Loader2: Icon,
        Paperclip: Icon,
        FolderInput: Icon,
    };
});

describe("BulkActionsBar", () => {
    it("can be positioned relative to its container", () => {
        render(
            <BulkActionsBar
                selectedCount={2}
                allSelected={false}
                onClearSelection={jest.fn()}
                positionMode="container"
            />,
        );

        expect(
            screen.getByRole("region", { name: "Bulk actions" }),
        ).toHaveStyle({
            position: "absolute",
            left: "50%",
        });
    });
});
