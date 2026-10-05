module.exports = {
  preset: 'jest-expo',
  testTimeout: 20000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
