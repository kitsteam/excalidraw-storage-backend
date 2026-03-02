/**
 * Global test setup - mocks for database connections
 * This file is loaded by Jest before all tests via setupFilesAfterEnv
 *
 */

import { PgMockManager } from './utils/pg-mock-manager';

// Mock pg module - always uses the shared PGlite instance
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => {
    return PgMockManager.getInstance().getAdapter();
  }),
}));
