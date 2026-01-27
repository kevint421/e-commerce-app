module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/integration'],
  testMatch: ['**/*.test.ts'],
  testTimeout: 30000, // 30 second timeout for integration tests
  collectCoverageFrom: [
    'integration/**/*.ts',
    '!integration/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
