import { Logger } from '@nestjs/common';
import { Client } from 'pg';
const logger = new Logger();

// This is a very simple helper to make sure that the tests do not overwrite the local development database.
export const createTestDatabaseSetup = async () => {
  const uri: string = process.env[`STORAGE_URI`];

  // This is all very specific to the docker-compose.yml. We should refactor this later. This will break when query parameters are added:
  const parts = uri.split('/');
  if (parts.length < 1) {
    logger.error('No database match found');
    return;
  }
  const databaseSuffix = '-test';
  const database = parts[parts.length - 1] + databaseSuffix;
  process.env['STORAGE_URI'] = process.env['STORAGE_URI'] + databaseSuffix;

  // Set up client with uri:
  const client = new Client({ connectionString: uri });
  await client.connect();

  try {
    await client.query(`CREATE DATABASE "${database}"`);
    logger.debug('Test database created successfully');
  } catch (e) {
    // Database already exists, which is fine
    logger.debug('Test database already exists');
  } finally {
    await client.end();
  }
};

// This helper is required for testing the postgres ttl service. It is designed specificially to clean up after each postgres spec.
// Therefore, we don't want to include it in other specs.
export const clearDatabase = async () => {
  const uri: string = process.env[`STORAGE_URI`];
  // Set up client with uri:
  const client = new Client({ connectionString: uri });
  await client.connect();

  try {
    await client.query('DELETE FROM keyv;');
  } catch (e) {
    logger.error('Error clearing database:', e);
  } finally {
    await client.end();
  }
};
