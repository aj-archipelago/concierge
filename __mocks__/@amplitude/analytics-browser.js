// Mock Amplitude SDK
const mockAmplitude = {
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

// Export the mock as both default and named exports
module.exports = mockAmplitude;
module.exports.default = mockAmplitude;
