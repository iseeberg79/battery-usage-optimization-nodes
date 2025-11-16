module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/test/**/*.test.js',
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.test.js'
    ],
    collectCoverageFrom: [
        'nodes/**/*.js',
        '!nodes/**/*.html',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true,
    testTimeout: 10000,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true
};
