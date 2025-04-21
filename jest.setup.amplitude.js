// Mock Amplitude for testing
jest.mock("@amplitude/analytics-browser", () => {
    return {
        init: jest.fn(),
        track: jest.fn(),
        identify: jest.fn(),
        setUserId: jest.fn(),
        reset: jest.fn(),
        getInstance: jest.fn().mockReturnValue({
            init: jest.fn(),
            track: jest.fn(),
            identify: jest.fn(),
            setUserId: jest.fn(),
            reset: jest.fn(),
        }),
        Types: {
            LogLevel: {
                Verbose: 0,
                Debug: 1,
                Info: 2,
                Warn: 3,
                Error: 4,
                None: 5,
            },
        },
    };
});
