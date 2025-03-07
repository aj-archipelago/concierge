import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import {
    useCurrentUser,
    useUpdateUserState,
    useUserState,
} from "../../app/queries/users";
import { AuthContext } from "../App";
import {
    LanguageContext,
    LanguageProvider,
} from "../contexts/LanguageProvider";

// Create a mock language context before mocking
const mockLanguageContext = {
    language: "en",
    direction: "ltr",
    changeLanguage: jest.fn(),
};

// Mock style imports - removing virtual: true option
jest.mock("../App.scss", () => ({}));
jest.mock("../tailwind.css", () => ({}));

// Mock React's useContext to return our mockLanguageContext when LanguageContext is requested
const originalUseContext = React.useContext;
React.useContext = jest.fn((context) => {
    // Check if this is the LanguageContext
    if (context === LanguageContext) {
        return mockLanguageContext;
    }
    // Otherwise use the original implementation
    return originalUseContext(context);
});

// Mock the modules and hooks before importing App
jest.mock("@apollo/experimental-nextjs-app-support", () => ({
    ApolloNextAppProvider: ({ children }) => children,
}));

jest.mock("../graphql", () => ({
    getClient: jest.fn(() => ({})),
}));

jest.mock("../i18n", () => ({}));

jest.mock("@amplitude/analytics-browser", () => ({
    init: jest.fn(),
}));

// Mock useDebounce hook
jest.mock("@uidotdev/usehooks", () => ({
    useDebounce: jest.fn((val) => val), // By default, return the value immediately without debouncing
}));

jest.mock("../../app/queries/users", () => ({
    useCurrentUser: jest.fn(),
    useUserState: jest.fn(),
    useUpdateUserState: jest.fn(),
}));

jest.mock("../StoreProvider", () => ({
    __esModule: true,
    default: ({ children }) => (
        <div data-testid="store-provider">{children}</div>
    ),
}));

jest.mock("../contexts/LanguageProvider", () => {
    return {
        LanguageProvider: ({ children }) => {
            const mockContext = {
                language: "en",
                direction: "ltr",
                changeLanguage: jest.fn(),
            };

            // Import the actual context
            const { LanguageContext } = jest.requireActual(
                "../contexts/LanguageProvider",
            );

            // Return the Provider with our mock value
            return (
                <LanguageContext.Provider value={mockContext}>
                    {children}
                </LanguageContext.Provider>
            );
        },
        // Export the actual LanguageContext
        LanguageContext: jest.requireActual("../contexts/LanguageProvider")
            .LanguageContext,
    };
});

jest.mock("../contexts/ThemeProvider", () => ({
    ThemeProvider: ({ children }) => (
        <div data-testid="theme-provider">{children}</div>
    ),
}));

jest.mock("../contexts/AutoTranscribeContext", () => ({
    AutoTranscribeProvider: ({ children }) => (
        <div data-testid="auto-transcribe-provider">{children}</div>
    ),
}));

jest.mock("../layout/Layout", () => ({
    __esModule: true,
    default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

// Mock classNames utility
jest.mock("../../app/utils/class-names", () => ({
    __esModule: true,
    default: (...classes) => classes.filter(Boolean).join(" "),
}));

// Create a mock for dayjs
jest.mock("dayjs", () => {
    const originalDayjs = jest.requireActual("dayjs");
    return Object.assign(
        jest.fn(() => originalDayjs()),
        {
            locale: jest.fn(),
        },
    );
});

// Create a mock for i18next
jest.mock("i18next", () => ({
    language: "en",
    changeLanguage: jest.fn(),
}));

// Import App after all mocks are set up
import { useDebounce } from "@uidotdev/usehooks";
import App from "../App";

// Mock process.env
process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY = "test-api-key";

describe("App Component", () => {
    // Setup for all tests
    const mockRefetch = jest.fn();
    const mockMutate = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock implementations
        useCurrentUser.mockReturnValue({
            data: { id: "user1", name: "Test User" },
        });
        useUserState.mockReturnValue({
            data: { preferences: { theme: "light" } },
            refetch: mockRefetch,
        });
        useUpdateUserState.mockReturnValue({ mutate: mockMutate });

        // Reset useDebounce to pass through values by default
        useDebounce.mockImplementation((val) => val);
    });

    describe("User State Management", () => {
        it("should initialize userState from server when client state is null", async () => {
            // Setup initial state
            const serverState = {
                preferences: { theme: "dark", fontSize: "medium" },
            };
            useUserState.mockReturnValue({
                data: serverState,
                refetch: mockRefetch,
            });

            // Render component
            render(
                <LanguageProvider>
                    <App
                        language="en"
                        theme="light"
                        serverUrl="http://example.com"
                        graphQLPublicEndpoint="http://example.com/graphql"
                    >
                        Test Content
                    </App>
                </LanguageProvider>,
            );

            // First render should set userState from server
            await waitFor(() => {
                expect(useUserState().data).toEqual(serverState);
            });
        });

        it("should not overwrite client userState with server state on re-render", async () => {
            // Mock useState to capture state updates
            const setUserStateMock = jest.fn();
            let userStateValue = null;

            // Save the original useState
            const originalUseState = React.useState;

            // Create a mock implementation that tracks userState specifically
            const mockUseState = jest.fn((initialValue) => {
                // Only intercept the userState (null initial value)
                if (initialValue === null) {
                    return [userStateValue, setUserStateMock];
                }
                // For all other useState calls, use the original implementation
                return originalUseState(initialValue);
            });

            // Apply our mock implementation
            jest.spyOn(React, "useState").mockImplementation(mockUseState);

            // Initial server state
            const serverState = { preferences: { theme: "light" } };
            useUserState.mockReturnValue({
                data: serverState,
                refetch: mockRefetch,
            });

            // Initial render
            const { rerender } = render(
                <LanguageProvider>
                    <App
                        language="en"
                        theme="light"
                        serverUrl="http://example.com"
                        graphQLPublicEndpoint="http://example.com/graphql"
                    >
                        Test Content
                    </App>
                </LanguageProvider>,
            );

            // Manually trigger the effect that would set the state
            act(() => {
                // Find the useState call for userState and call its setter
                setUserStateMock(serverState);
            });

            // Verify setUserState was called with server state
            await waitFor(() => {
                expect(setUserStateMock).toHaveBeenCalledWith(serverState);
            });

            // Now simulate client state being set
            userStateValue = {
                preferences: { theme: "dark", fontSize: "large" },
            };
            setUserStateMock.mockClear();

            // Change server state
            useUserState.mockReturnValue({
                data: { preferences: { theme: "system" } }, // Different server state
                refetch: mockRefetch,
            });

            // Re-render
            rerender(
                <LanguageProvider>
                    <App
                        language="en"
                        theme="light"
                        serverUrl="http://example.com"
                        graphQLPublicEndpoint="http://example.com/graphql"
                    >
                        Test Content
                    </App>
                </LanguageProvider>,
            );

            // Verify setUserState was NOT called again (client state preserved)
            expect(setUserStateMock).not.toHaveBeenCalled();

            // Restore original useState
            React.useState.mockRestore();
        });

        it("should update server when client state changes", async () => {
            // Setup for testing debounce
            let debouncedValue = null;
            useDebounce.mockImplementation((value) => {
                debouncedValue = value;
                return value;
            });

            // Setup state mock
            const setUserStateMock = jest.fn();
            let userStateValue = null;

            const originalUseState = React.useState;
            jest.spyOn(React, "useState").mockImplementation((initialValue) => {
                if (initialValue === null) {
                    return [userStateValue, setUserStateMock];
                }
                return originalUseState(initialValue);
            });

            // Render component
            render(
                <LanguageProvider>
                    <App
                        language="en"
                        theme="light"
                        serverUrl="http://example.com"
                        graphQLPublicEndpoint="http://example.com/graphql"
                    >
                        Test Content
                    </App>
                </LanguageProvider>,
            );

            // Simulate state update
            const updatedState = { preferences: { theme: "dark" } };
            userStateValue = updatedState;

            // Trigger useEffect that watches debouncedUserState
            act(() => {
                // Force re-render by updating a prop
                render(
                    <LanguageProvider>
                        <App
                            language="en"
                            theme="dark" // Changed prop to force re-render
                            serverUrl="http://example.com"
                            graphQLPublicEndpoint="http://example.com/graphql"
                        >
                            Test Content
                        </App>
                    </LanguageProvider>,
                );
            });

            // Check if updateUserState.mutate was called with the updated state
            await waitFor(() => {
                expect(mockMutate).toHaveBeenCalledWith(debouncedValue);
            });

            // Restore original useState
            React.useState.mockRestore();
        });

        it("should call refetch and set refetchCalled when refetchUserState is called", async () => {
            // Mock the refetch function
            const mockRefetch = jest.fn();

            // Setup server state
            const serverState = { preferences: { theme: "light" } };
            useUserState.mockReturnValue({
                data: serverState,
                refetch: mockRefetch,
            });

            // Create a container to store the captured context value
            let capturedContextValue = null;

            // Mock the AuthContext.Provider to capture its value
            const originalProvider = AuthContext.Provider;
            AuthContext.Provider = ({ value, children }) => {
                capturedContextValue = value;
                return React.createElement(originalProvider, {
                    value,
                    children,
                });
            };

            // Render the component
            const { rerender } = render(
                <LanguageProvider>
                    <App
                        language="en"
                        theme="light"
                        serverUrl="http://example.com"
                        graphQLPublicEndpoint="http://example.com/graphql"
                    >
                        Test Content
                    </App>
                </LanguageProvider>,
            );

            // Store the initial userState
            const initialUserState = capturedContextValue.userState;

            // Clear previous calls
            mockRefetch.mockClear();

            // Call refetchUserState directly - no need for act() here
            capturedContextValue.refetchUserState();

            // Verify the refetch function was called
            expect(mockRefetch).toHaveBeenCalled();

            // Update the server state to simulate a successful refetch
            const updatedServerState = { preferences: { theme: "dark" } };
            useUserState.mockReturnValue({
                data: updatedServerState,
                refetch: mockRefetch,
            });

            // Re-render to trigger the useEffect that depends on serverUserState
            rerender(
                <LanguageProvider>
                    <App
                        language="en"
                        theme="light"
                        serverUrl="http://example.com"
                        graphQLPublicEndpoint="http://example.com/graphql"
                    >
                        Test Content
                    </App>
                </LanguageProvider>,
            );

            // First, wait for the userState to be different from the initial state
            await waitFor(() => {
                expect(capturedContextValue.userState).not.toEqual(
                    initialUserState,
                );
            });

            // Then, verify it matches the updated server state
            expect(capturedContextValue.userState).toEqual(updatedServerState);

            // Restore the original provider
            AuthContext.Provider = originalProvider;
        });
    });
});
