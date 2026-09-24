/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useReferenceUpload } from "../useReferenceUpload";

const videoRow = { kind: "video", range: { max: 1 } };
const video = new File(["video"], "clip.mp4", { type: "video/mp4" });

function setup(overrides = {}) {
    const props = {
        uploadFiles: jest
            .fn()
            .mockResolvedValue([{ cortexRequestId: "uploaded" }]),
        onAttach: jest.fn(),
        referencesByParameterKind: {},
        selectionKey: "seedance:video",
        isUploading: false,
        t: (key) => key,
        ...overrides,
    };
    const view = renderHook((options) => useReferenceUpload(options), {
        initialProps: props,
    });
    view.result.current.inputRef.current = { click: jest.fn(), accept: "" };
    return { ...view, props };
}

test("choosing a video reference opens the video picker and attaches its upload", async () => {
    const { result, props } = setup();
    act(() => result.current.chooseReferences(videoRow));
    expect(result.current.inputRef.current.accept).toBe("video/*");
    expect(result.current.inputRef.current.click).toHaveBeenCalledTimes(1);
    const event = { target: { files: [video], value: "clip.mp4" } };
    await act(async () => result.current.onFileSelect(event));
    expect(event.target.value).toBe("");
    expect(props.uploadFiles).toHaveBeenCalledWith([video], {
        selectUploaded: false,
    });
    expect(props.onAttach).toHaveBeenCalledWith(
        [{ cortexRequestId: "uploaded" }],
        { referenceKind: "video" },
    );
});

test("desktop drops accept matching extensions and keep within remaining slots", async () => {
    const { result, props } = setup({
        referencesByParameterKind: { image: [{ id: "existing" }] },
    });
    const image = new File(["png"], "reference.png");
    await act(async () =>
        result.current.uploadReferences([video, image, image], {
            kind: "image",
            range: { max: 2 },
        }),
    );
    expect(props.uploadFiles).toHaveBeenCalledWith([image], {
        selectUploaded: false,
    });
    expect(props.onAttach).toHaveBeenCalledWith(expect.any(Array), {
        referenceKind: "image",
    });
});

test("unsupported drops display an error without uploading", async () => {
    const { result, props } = setup();
    await act(async () =>
        result.current.uploadReferences(
            [new File(["html"], "page.html")],
            videoRow,
        ),
    );
    expect(props.uploadFiles).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
        "Choose a file that matches this reference type.",
    );
});

test("a cancelled picker does not display an error", async () => {
    const { result, props } = setup();
    act(() => result.current.chooseReferences(videoRow));
    await act(async () =>
        result.current.onFileSelect({ target: { files: [], value: "" } }),
    );
    expect(props.uploadFiles).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
});

test("changing model during upload leaves the result in the library without attaching it", async () => {
    let finish;
    const { result, props, rerender } = setup({
        uploadFiles: jest.fn(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        ),
    });
    let pending;
    act(() => {
        pending = result.current.uploadReferences([video], videoRow);
    });
    rerender({ ...props, selectionKey: "other:image" });
    await act(async () => {
        finish([{ cortexRequestId: "uploaded" }]);
        await pending;
    });
    expect(props.onAttach).not.toHaveBeenCalled();
});

test("full reference slots and active uploads do not open another upload", async () => {
    const { result, props } = setup({ isUploading: true });
    act(() => result.current.chooseReferences(videoRow));
    await act(async () => result.current.uploadReferences([video], videoRow));
    expect(result.current.inputRef.current.click).not.toHaveBeenCalled();
    expect(props.uploadFiles).not.toHaveBeenCalled();
    const full = setup({ referencesByParameterKind: { video: [{}] } });
    await act(async () =>
        full.result.current.uploadReferences([video], videoRow),
    );
    expect(full.props.uploadFiles).not.toHaveBeenCalled();
});
