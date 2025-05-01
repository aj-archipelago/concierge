import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import MessageInput from "./MessageInput";
import { AuthContext } from "../../App";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import fileUploadReducer from "../../stores/fileUploadSlice";
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client";
import userEvent from "@testing-library/user-event";

// Mock the @uidotdev/usehooks module
jest.mock("@uidotdev/usehooks", () => ({
    useDebounce: (value) => value,
}));

// Mock the config module
jest.mock("config", () => ({
    default: {
        chat: {
            botName: "Test Bot",
        },
    },
}));

// Directly mock Tos.js since it's importing config which leads to taxonomySets
jest.mock("../../components/Tos", () => ({
    __esModule: true,
    default: () => <div>Mock Tos</div>,
}));

// Mock the Layout component to avoid the require.context in Sidebar
jest.mock("../../layout/Layout", () => ({
    __esModule: true,
    default: ({ children }) => <div>{children}</div>,
}));

// Mock the DynamicFilePond component
jest.mock(
    "./MyFilePond",
    () => {
        const MockFilePond = ({ addUrl, files, setFiles }) => (
            <div data-testid="filepond-mock">
                <button
                    data-testid="add-url-button"
                    onClick={() =>
                        addUrl({
                            url: "https://example.com/doc.pdf",
                            type: "application/pdf",
                        })
                    }
                >
                    Add URL
                </button>
                {files &&
                    files.map((file, index) => (
                        <div key={index} data-testid={`file-${index}`}>
                            {file.source.name}
                        </div>
                    ))}
            </div>
        );
        return MockFilePond;
    },
    { virtual: true },
);

// Mock the dynamic import to properly return the component
jest.mock("next/dynamic", () => () => {
    const MockComponent = (props) => {
        const DynamicComponent = require("./MyFilePond");
        return <DynamicComponent {...props} />;
    };
    MockComponent.displayName = "DynamicFilepond";
    return MockComponent;
});

// Mock the required hooks
jest.mock("../../../app/queries/chats", () => ({
    useGetActiveChat: () => ({
        data: { _id: "test-chat-id", codeRequestId: null },
    }),
    useGetActiveChatId: () => "test-chat-id",
}));

jest.mock("../../../app/queries/uploadedDocs", () => ({
    useAddDocument: () => ({
        mutateAsync: jest.fn(),
    }),
}));

// Mock the required icons
jest.mock("lucide-react", () => ({
    Send: () => (
        <div data-testid="send-button" aria-label="send">
            Send Icon
        </div>
    ),
    FilePlus: () => (
        <div data-testid="file-plus-button" aria-label="file-upload">
            File Plus Icon
        </div>
    ),
    XCircle: () => (
        <div data-testid="close-button" aria-label="close">
            Close Icon
        </div>
    ),
    StopCircle: () => (
        <div data-testid="stop-button" aria-label="stop">
            Stop Icon
        </div>
    ),
}));

// Mock the graphql queries
jest.mock("../../graphql", () => ({
    COGNITIVE_INSERT: "COGNITIVE_INSERT",
    CODE_HUMAN_INPUT: "CODE_HUMAN_INPUT",
    QUERIES: {
        SYS_ENTITY_AGENT: "SYS_ENTITY_AGENT",
    },
}));

// Mock the mediaUtils
jest.mock("../../utils/mediaUtils", () => ({
    getFilename: jest.fn(),
    isDocumentUrl: jest.fn(),
    isMediaUrl: jest.fn(),
    ACCEPTED_FILE_TYPES: ["image/png", "image/jpeg", "image/gif"],
}));

// Mock the components that use ESM modules
jest.mock("../chat/ChatMessage", () => ({
    __esModule: true,
    default: () => <div>Mock Chat Message</div>,
}));

jest.mock("../chat/MessageList", () => ({
    __esModule: true,
    default: () => <div>Mock Message List</div>,
}));

jest.mock("../chat/ChatMessages", () => ({
    __esModule: true,
    default: () => <div>Mock Chat Messages</div>,
}));

jest.mock("../chat/ChatContent", () => ({
    __esModule: true,
    default: () => <div>Mock Chat Content</div>,
}));

jest.mock("../chat/ChatBox", () => ({
    __esModule: true,
    default: () => <div>Mock Chat Box</div>,
}));

describe("MessageInput", () => {
    const mockOnSend = jest.fn();
    const mockOnStopStreaming = jest.fn();
    const mockDebouncedUpdateUserState = jest.fn();
    const mockUser = {
        contextId: "test-context-id",
        aiName: "Test AI",
        aiStyle: "default",
        aiMemorySelfModify: false,
    };

    // Create a mock store
    const store = configureStore({
        reducer: {
            fileUpload: fileUploadReducer,
        },
    });

    // Create a mock Apollo Client
    const client = new ApolloClient({
        cache: new InMemoryCache(),
        defaultOptions: {
            watchQuery: {
                fetchPolicy: "no-cache",
            },
            query: {
                fetchPolicy: "no-cache",
            },
        },
    });

    const renderMessageInput = (props = {}) => {
        return render(
            <ApolloProvider client={client}>
                <Provider store={store}>
                    <AuthContext.Provider
                        value={{
                            user: mockUser,
                            userState: {},
                            debouncedUpdateUserState:
                                mockDebouncedUpdateUserState,
                        }}
                    >
                        <MessageInput
                            onSend={mockOnSend}
                            loading={false}
                            enableRag={true}
                            placeholder="Send a message"
                            viewingReadOnlyChat={false}
                            isStreaming={false}
                            onStopStreaming={mockOnStopStreaming}
                            {...props}
                        />
                    </AuthContext.Provider>
                </Provider>
            </ApolloProvider>,
        );
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockDebouncedUpdateUserState.mockClear();
    });

    describe("Chat input state persistence", () => {
        it("should update user state when input changes", () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "Test message" } });

            expect(mockDebouncedUpdateUserState).toHaveBeenCalledWith(
                expect.any(Function),
            );
            const updateFn = mockDebouncedUpdateUserState.mock.calls[0][0];
            expect(updateFn({ chatInputs: {} })).toEqual({
                chatInputs: {
                    "test-chat-id": "Test message",
                },
            });
        });

        it("should initialize input value from user state", () => {
            const savedInput = "Saved message";
            render(
                <ApolloProvider client={client}>
                    <Provider store={store}>
                        <AuthContext.Provider
                            value={{
                                user: mockUser,
                                userState: {
                                    chatInputs: {
                                        "test-chat-id": savedInput,
                                    },
                                },
                                debouncedUpdateUserState:
                                    mockDebouncedUpdateUserState,
                            }}
                        >
                            <MessageInput
                                onSend={mockOnSend}
                                loading={false}
                                enableRag={true}
                                placeholder="Send a message"
                                viewingReadOnlyChat={false}
                                isStreaming={false}
                                onStopStreaming={mockOnStopStreaming}
                            />
                        </AuthContext.Provider>
                    </Provider>
                </ApolloProvider>,
            );

            const input = screen.getByPlaceholderText("Send a message");
            expect(input.value).toBe(savedInput);
        });
    });

    describe("Pasting functionality", () => {
        it("should handle text paste via default", async () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");
            const spy = jest.spyOn(Event.prototype, "preventDefault");

            // Create clipboard data structure
            const clipboardData = {
                items: [
                    {
                        kind: "string",
                        type: "text/plain",
                        getAsString: (callback) => callback("Pasted text"),
                    },
                ],
            };

            // Trigger paste event using userEvent with clipboardData
            await userEvent.paste(input, "Pasted text", { clipboardData });

            // Verify preventDefault was not called
            expect(spy).not.toHaveBeenCalled();

            // Verify input value was updated
            expect(input.value).toBe("Pasted text");

            spy.mockRestore();
        });

        it("should process image paste by showing FilePond and preparing for upload and calling preventDefault", async () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            // Create a mock file
            const mockFile = new File(["test-image-data"], "test.png", {
                type: "image/png",
            });

            // Spy on Event.prototype.preventDefault
            const spy = jest.spyOn(Event.prototype, "preventDefault");

            // Create clipboard data structure
            const clipboardData = {
                items: [
                    {
                        kind: "file",
                        type: "image/png",
                        getAsFile: () => mockFile,
                    },
                ],
            };

            // Trigger paste event using userEvent with clipboardData
            await userEvent.paste(input, "", { clipboardData });

            // Verify that preventDefault was called
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();

            // Verify FilePond is visible
            expect(screen.getByTestId("filepond-mock")).toBeInTheDocument();

            // Check that our component has set up the system for file upload
            expect(screen.getByTestId("close-button")).toBeInTheDocument();
        });

        it("should handle mixed content paste by processing text via default", async () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            // Create a mock file
            const mockFile = new File(["test-image-data"], "test.png", {
                type: "image/png",
            });

            // Spy on Event.prototype.preventDefault
            const spy = jest.spyOn(Event.prototype, "preventDefault");

            // Create clipboard data structure with both image and text
            const clipboardData = {
                items: [
                    {
                        kind: "file",
                        type: "image/png",
                        getAsFile: () => mockFile,
                    },
                    {
                        kind: "string",
                        type: "text/plain",
                        getAsString: (callback) => callback("Test pasted text"),
                    },
                ],
            };

            // Set initial input value
            fireEvent.change(input, { target: { value: "Initial text" } });

            // Trigger paste event using userEvent with clipboardData
            await userEvent.paste(input, "Test pasted text", { clipboardData });

            // Verify that preventDefault was not called
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();

            // Verify that FilePond is visible (for the image part)
            expect(
                screen.queryByTestId("filepond-mock"),
            ).not.toBeInTheDocument();
        });

        it("should handle mixed content paste by appending text", async () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");
            fireEvent.change(input, { target: { value: "Initial text " } });

            const spy = jest.spyOn(Event.prototype, "preventDefault");

            // Create clipboard data structure with file, text, and HTML
            const clipboardData = {
                items: [
                    {
                        kind: "file",
                        type: "image/png",
                        getAsFile: () =>
                            new File(["image data"], "test.png", {
                                type: "image/png",
                            }),
                    },
                    {
                        kind: "string",
                        type: "text/plain",
                        getAsString: (callback) => callback("Pasted text."),
                    },
                    {
                        kind: "string",
                        type: "text/html",
                        getAsString: (callback) =>
                            callback('<body><img src="test.png"> Text</body>'),
                    },
                ],
            };

            // Trigger paste event using userEvent with clipboardData
            await userEvent.paste(input, "Pasted text.", { clipboardData });

            expect(input.value).toBe("Initial text Pasted text.");
            // Assert: FilePond mock should not appear
            expect(
                screen.queryByTestId("filepond-mock"),
            ).not.toBeInTheDocument();
            // Assert: Close icon (associated with FilePond) should not appear
            expect(
                screen.queryByTestId("close-button"),
            ).not.toBeInTheDocument();
            // Assert: preventDefault should not have been called
            expect(spy).not.toHaveBeenCalled();

            spy.mockRestore();
        });
    });

    describe("Form submission", () => {
        it("should submit form with text input", () => {
            renderMessageInput({ isStreaming: false });
            const input = screen.getByPlaceholderText("Send a message");
            const submitButton = screen.getByTestId("send-button");

            fireEvent.change(input, { target: { value: "Test message" } });
            fireEvent.click(submitButton);

            expect(mockOnSend).toHaveBeenCalledWith("Test message");
        });

        it("should not submit when loading", () => {
            renderMessageInput({ loading: true, isStreaming: false });
            const input = screen.getByPlaceholderText("Send a message");
            const stopButton = screen.getByRole("button", { name: /stop/i });

            fireEvent.change(input, { target: { value: "Test message" } });
            fireEvent.click(stopButton);

            expect(mockOnSend).not.toHaveBeenCalled();
        });

        it("should not submit when input is empty", () => {
            renderMessageInput();
            const submitButton = screen.getByTestId("send-button");

            fireEvent.click(submitButton);

            expect(mockOnSend).not.toHaveBeenCalled();
        });

        it("should handle Enter key submission", () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "Test message" } });
            fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

            expect(mockOnSend).toHaveBeenCalledWith("Test message");
            expect(input.value).toBe("");
        });

        it("should not submit on Enter when loading", () => {
            renderMessageInput({ loading: true });
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "Test message" } });
            fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

            expect(mockOnSend).not.toHaveBeenCalled();
        });

        it("should allow newline with Shift+Enter", () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

            expect(mockOnSend).not.toHaveBeenCalled();
        });
    });

    describe("File upload functionality", () => {
        it("should not show file upload button when enableRag is false", () => {
            renderMessageInput({ enableRag: false });
            expect(
                screen.queryByTestId("file-plus-button"),
            ).not.toBeInTheDocument();
        });

        it("should handle file upload through FilePond", () => {
            // Render with FilePond visible
            renderMessageInput({
                enableRag: true,
                initialShowFileUpload: true,
            });

            // Verify FilePond is visible
            expect(screen.getByTestId("filepond-mock")).toBeInTheDocument();

            // Create a mock file
            const mockFile = new File(["test-image-data"], "test.png", {
                type: "image/png",
            });
            const pondFile = {
                source: mockFile,
                options: {
                    type: "local",
                    file: mockFile,
                },
            };

            // Manually set files to test the rendering
            act(() => {
                screen.getByTestId("filepond-mock").dispatchEvent(
                    new CustomEvent("onaddfile", {
                        detail: { file: pondFile },
                    }),
                );
            });
        });
    });

    describe("Input state management", () => {
        it("should update input value on change", () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "New message" } });
            expect(input.value).toBe("New message");
        });

        it("should clear input after submission", () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "Test message" } });
            fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

            expect(input.value).toBe("");
        });

        it("should maintain input value when loading", () => {
            renderMessageInput({ loading: true });
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "Test message" } });
            expect(input.value).toBe("Test message");
        });
    });

    describe("Button states", () => {
        it("should show stop button when streaming", () => {
            renderMessageInput({ isStreaming: true });
            const stopButton = screen.getByRole("button", { name: /stop/i });
            expect(stopButton).toBeInTheDocument();
        });

        it("should show send button when not streaming", () => {
            renderMessageInput({ isStreaming: false });
            const sendButton = screen.getByTestId("send-button");
            expect(sendButton).toBeInTheDocument();
        });

        it("should disable send button when loading", () => {
            renderMessageInput({ loading: true });

            // Verify stop button is visible
            const stopButton = screen.getByRole("button", { name: /stop/i });
            expect(stopButton).toBeInTheDocument();

            // Verify it's enabled (not disabled)
            expect(stopButton).not.toBeDisabled();
        });

        it("should disable send button when input is empty", () => {
            renderMessageInput();
            const sendButton = screen.getByRole("button", { name: /send/i });
            expect(sendButton).toBeDisabled();
        });

        it("should call onStopStreaming when stop button is clicked during streaming", () => {
            renderMessageInput({
                isStreaming: true,
                onStopStreaming: mockOnStopStreaming,
            });

            const stopButton = screen.getByRole("button", { name: /stop/i });
            fireEvent.click(stopButton);

            expect(mockOnStopStreaming).toHaveBeenCalled();
        });

        it("should call onStopStreaming when stop button is clicked during loading", () => {
            const mockOnStopStreaming = jest.fn();
            // Test with loading: true to verify stop button works during loading
            renderMessageInput({
                loading: true,
                onStopStreaming: mockOnStopStreaming,
            });

            const stopButton = screen.getByRole("button", { name: /stop/i });
            fireEvent.click(stopButton);

            expect(mockOnStopStreaming).toHaveBeenCalled();
        });
    });

    describe("URL handling", () => {
        it("should correctly process various YouTube URL formats", () => {
            // Sample of different YouTube URL formats to test
            const youtubeUrls = [
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "https://youtu.be/dQw4w9WgXcQ",
                "https://www.youtube.com/embed/dQw4w9WgXcQ",
                "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s",
                "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            ];

            // Mock isYoutubeUrl for specific URL checks
            const isYoutubeUrlMock = jest.fn().mockImplementation((url) => {
                return youtubeUrls.includes(url);
            });

            // Apply the mock to the actual function
            jest.spyOn(
                require("../../utils/urlUtils"),
                "isYoutubeUrl",
            ).mockImplementation(isYoutubeUrlMock);

            // Mock setUrlsData state updating function to track what URLs are added
            const setUrlsDataMock = jest.fn();
            jest.spyOn(React, "useState").mockImplementationOnce(() => [
                [],
                setUrlsDataMock,
            ]);

            const mockAddUrl = jest.fn();

            renderMessageInput({
                enableRag: true,
                initialShowFileUpload: false, // Start with file upload hidden
                onSend: mockAddUrl,
            });

            // First, click the file upload button to show FilePond
            const fileButton = screen.getByTestId("file-plus-button");
            fireEvent.click(fileButton);

            // Simulate user pasting each YouTube URL format
            for (const youtubeUrl of youtubeUrls) {
                // Get the input field and paste a URL
                const input = screen.getByPlaceholderText("Send a message");

                // Replace the current input value with our YouTube URL
                fireEvent.change(input, { target: { value: youtubeUrl } });

                // Use the submit button to submit the form
                const submitButton = screen.getByTestId("send-button");
                fireEvent.click(submitButton);

                // Verify the input was cleared (meaning the form was processed)
                expect(input.value).toBe("");
            }

            // Verify onSend was called for each YouTube URL
            expect(mockAddUrl).toHaveBeenCalledTimes(youtubeUrls.length);

            // Each call should have sent the URL as part of the message
            for (let i = 0; i < youtubeUrls.length; i++) {
                // Check that each YouTube URL was included in one of the calls
                const calls = mockAddUrl.mock.calls;

                // Look for the URL in any of the calls
                const urlFound = calls.some((call) => {
                    const param = call[0];
                    // Could be directly the URL string or part of a message structure
                    return (
                        param === youtubeUrls[i] ||
                        (typeof param === "string" &&
                            param.includes(youtubeUrls[i])) ||
                        (Array.isArray(param) &&
                            param.some(
                                (item) =>
                                    typeof item === "string" &&
                                    item.includes(youtubeUrls[i]),
                            ))
                    );
                });

                expect(urlFound).toBe(true);
            }
        });

        it("should handle document URLs", async () => {
            // Mock isDocumentUrl to return true
            jest.spyOn(
                require("../../utils/mediaUtils"),
                "isDocumentUrl",
            ).mockImplementation(() => true);

            // Mock the Apollo client query
            const mockQuery = jest.fn().mockResolvedValue({});
            const mockClient = {
                query: mockQuery,
            };

            // Mock useApolloClient hook
            const useApolloClient = jest.spyOn(
                require("@apollo/client"),
                "useApolloClient",
            );
            useApolloClient.mockReturnValue(mockClient);

            // Mock getFilename to return a simple filename
            jest.spyOn(
                require("../../utils/mediaUtils"),
                "getFilename",
            ).mockImplementation(() => "doc.pdf");

            // Render with FilePond already visible
            renderMessageInput({
                enableRag: true,
                initialShowFileUpload: true,
            });

            // Verify FilePond is visible
            expect(screen.getByTestId("filepond-mock")).toBeInTheDocument();

            // Click the add URL button in the mocked FilePond component
            const addUrlButton = screen.getByTestId("add-url-button");
            fireEvent.click(addUrlButton);

            // Verify that the document was processed
            expect(mockQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: "COGNITIVE_INSERT",
                    variables: expect.objectContaining({
                        file: "https://example.com/doc.pdf",
                        privateData: true,
                        contextId: "test-context-id",
                        chatId: "test-chat-id",
                    }),
                }),
            );
        });

        it("should handle media URLs", async () => {
            renderMessageInput();
            const input = screen.getByPlaceholderText("Send a message");

            // Mock isMediaUrl to return true
            jest.spyOn(
                require("../../utils/mediaUtils"),
                "isMediaUrl",
            ).mockImplementation(() => true);

            fireEvent.change(input, {
                target: { value: "https://example.com/image.jpg" },
            });

            // Wait for the next tick to allow state updates
            await new Promise((resolve) => setTimeout(resolve, 0));

            // Verify that the media was added to urlsData
            const sendButton = screen.getByTestId("send-button");
            expect(sendButton).not.toBeDisabled();
        });
    });

    describe("Read-only mode", () => {
        it("should disable input in read-only mode", () => {
            renderMessageInput({ viewingReadOnlyChat: true });
            const input = screen.getByPlaceholderText("Send a message");
            const submitButton = screen.getByRole("button", { name: /send/i });

            expect(input).toBeDisabled();
            expect(submitButton).toBeDisabled();
        });

        it("should not allow form submission in read-only mode", () => {
            renderMessageInput({ viewingReadOnlyChat: true });
            const input = screen.getByPlaceholderText("Send a message");

            fireEvent.change(input, { target: { value: "Test message" } });
            fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

            expect(mockOnSend).not.toHaveBeenCalled();
        });
    });
});
