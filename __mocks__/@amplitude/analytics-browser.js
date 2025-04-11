const amplitude = {
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
};

module.exports = amplitude;
