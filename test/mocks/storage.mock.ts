/**
 * Shared mock for StorageService used across controller tests.
 */
export const createMockStorageService = () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(true),
  has: jest.fn(),
});
