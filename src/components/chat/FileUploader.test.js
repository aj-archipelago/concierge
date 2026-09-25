import React, { useState } from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import FileUploader from "./FileUploader";
import { uploadFileToMediaHelper } from "../../utils/fileUploadUtils";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../App", () => ({
    AuthContext: require("react").createContext({
        user: { contextId: "test-user" },
    }),
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("./FileCollectionPickerModal", () => () => null);
jest.mock("../common/MediaThumbnail", () => () => null);
jest.mock("../../utils/fileUploadUtils", () => ({
    uploadFileToMediaHelper: jest.fn(),
}));
jest.mock("../../utils/mediaUtils", () => ({
    isSupportedFileUrl: () => true,
    isBlobStorageUrl: () => true,
    getFilename: (url) => url.split("/").pop(),
}));

function Harness({ initialFiles }) {
    const [files, setFiles] = useState(initialFiles);
    const [uploading, setUploading] = useState(false);
    const [urls, setUrls] = useState([]);
    return (
        <>
            <output data-testid="uploading">{String(uploading)}</output>
            <output data-testid="attachments">
                {JSON.stringify(urls.map((file) => file.url))}
            </output>
            <FileUploader
                files={files}
                setFiles={setFiles}
                setIsUploadingMedia={setUploading}
                setUrlsData={setUrls}
                addUrl={(file) => setUrls((prev) => [...prev, file])}
                chatId="test-chat"
            />
        </>
    );
}

const pendingFile = (id, name = `${id}.pdf`) => ({
    id,
    filename: name,
    source: new File([id], name, { type: "application/pdf" }),
    status: "pending",
});
const result = (id) => ({
    url: `https://files.test/${id}.pdf`,
    filename: `${id}.pdf`,
});
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

beforeEach(() => uploadFileToMediaHelper.mockReset());

it("keeps the batch busy until every upload finishes", async () => {
    const first = deferred(),
        second = deferred();
    uploadFileToMediaHelper
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
    render(
        <Harness
            initialFiles={[pendingFile("first"), pendingFile("second")]}
        />,
    );
    await waitFor(() =>
        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByTestId("uploading")).toHaveTextContent("true");
    await act(async () => first.resolve(result("first")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("true");
    await act(async () => second.resolve(result("second")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
    expect(JSON.parse(screen.getByTestId("attachments").textContent)).toEqual([
        result("first").url,
        result("second").url,
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
});

it("does not wait for files already attached from the library", () => {
    render(
        <Harness
            initialFiles={[
                {
                    id: "library-file",
                    source: { url: result("library").url },
                    serverId: result("library").url,
                    status: "completed",
                    filename: "library.pdf",
                },
            ]}
        />,
    );
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
    expect(uploadFileToMediaHelper).not.toHaveBeenCalled();
});

it("ignores a removed last upload even if its completion arrives later", async () => {
    const first = deferred();
    uploadFileToMediaHelper.mockReturnValueOnce(first.promise);
    render(<Harness initialFiles={[pendingFile("first")]} />);
    await waitFor(() =>
        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
    await act(async () => first.resolve(result("first")));
    expect(JSON.parse(screen.getByTestId("attachments").textContent)).toEqual(
        [],
    );
});

it("removing one upload keeps another with the same name and ignores late completion", async () => {
    const first = deferred(),
        second = deferred();
    uploadFileToMediaHelper
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
    render(
        <Harness
            initialFiles={[
                pendingFile("first", "report.pdf"),
                pendingFile("second", "report.pdf"),
            ]}
        />,
    );
    await waitFor(() =>
        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(2),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await act(async () => first.resolve(result("first")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("true");
    await act(async () => second.resolve(result("second")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    expect(JSON.parse(screen.getByTestId("attachments").textContent)).toEqual([
        result("second").url,
    ]);
});

it("keeps other uploads busy after a failure and allows the failed upload to retry", async () => {
    const first = deferred(),
        second = deferred(),
        retry = deferred();
    uploadFileToMediaHelper
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockReturnValueOnce(retry.promise);
    render(
        <Harness
            initialFiles={[pendingFile("first"), pendingFile("second")]}
        />,
    );
    await waitFor(() =>
        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(2),
    );
    await act(async () => first.reject(new Error("Upload failed")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("true");
    await act(async () => second.resolve(result("second")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByTestId("uploading")).toHaveTextContent("true");
    await act(async () => retry.resolve(result("first")));
    expect(screen.getByTestId("uploading")).toHaveTextContent("false");
    expect(JSON.parse(screen.getByTestId("attachments").textContent)).toEqual([
        result("second").url,
        result("first").url,
    ]);
});

it("removes only the selected completed attachment when filenames match", async () => {
    const first = {
        ...pendingFile("first"),
        source: { url: result("first").url },
        serverId: result("first").url,
        filename: "report.pdf",
        displayFilename: "report.pdf",
        status: "completed",
    };
    const second = {
        ...first,
        id: "second",
        source: { url: result("second").url },
        serverId: result("second").url,
    };
    function CompletedHarness() {
        const [files, setFiles] = useState([first, second]);
        const [urls, setUrls] = useState(
            [first, second].map((file) => ({
                url: file.serverId,
                filename: "report.pdf",
                displayFilename: "report.pdf",
            })),
        );
        return (
            <>
                <output data-testid="attachments">
                    {JSON.stringify(urls.map((file) => file.url))}
                </output>
                <FileUploader
                    files={files}
                    setFiles={setFiles}
                    setIsUploadingMedia={() => {}}
                    setUrlsData={setUrls}
                    addUrl={() => {}}
                />
            </>
        );
    }
    render(<CompletedHarness />);
    fireEvent.click(
        (await screen.findAllByRole("button", { name: "Remove" }))[0],
    );
    expect(JSON.parse(screen.getByTestId("attachments").textContent)).toEqual([
        result("second").url,
    ]);
});
