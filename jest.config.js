module.exports = {
  testTimeout: 60000,
  maxWorkers: 1,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  projects: [
    {
      displayName: 'backend',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/frontend/'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/server.ts',
        '!src/instrumentation.ts',
        '!src/frontend/**'
      ],
      coverageThreshold: {
        global: {
          branches: 65,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    },
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/tests/frontend/**/*.test.tsx',
        '<rootDir>/tests/frontend/**/*.test.ts'
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup.ts'],
      moduleNameMapper: {
        '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
        // konva ships ESM that Jest can't parse from node_modules, and jsdom has no
        // real <canvas> 2D context anyway - canvas pixel content isn't assertable
        // via RTL, so the editor's canvas layer is mocked; its real (non-canvas)
        // controls are tested directly. See tests/frontend/mocks/*.
        '^react-konva$': '<rootDir>/tests/frontend/mocks/reactKonvaMock.tsx',
        '^konva$': '<rootDir>/tests/frontend/mocks/konvaMock.ts'
      },
      collectCoverageFrom: [
        'src/frontend/src/**/*.{ts,tsx}',
        '!src/frontend/src/main.tsx',
        '!src/frontend/src/telemetry.ts'
      ],
      coverageThreshold: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    }
  ]
};
