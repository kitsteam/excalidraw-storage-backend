/**
 * Global test setup - mocks for database connections
 * This file is loaded by Jest before all tests via setupFilesAfterEnv
 *
 */

import { PgMockManager } from './utils/pg-mock-manager';

// Re-export for convenience
export const configurePGMock = PgMockManager.getInstance().configure.bind(
  PgMockManager.getInstance(),
);

// Mock pg module - can be configured to use PGlite via configurePGMock()
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => {
    const adapter = PgMockManager.getInstance().getAdapter();
    if (adapter) {
      return adapter;
    }
    // Default mock for tests that don't need real pg behavior
    return {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      end: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      }),
    };
  }),
}));
