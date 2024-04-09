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
  client.connect();

  return client
    .query(`CREATE DATABASE "${database}"`)
    .catch((e) => logger.debug('Error executing query:', e)) // this will happen after the first run, so we'll discard it
    .then(() => client.end());
};

// This helper is required for testing the postgres ttl service. It is designed specificially to clean up after each postgres spec.
// Therefore, we don't want to include it in other specs.
export const clearDatabase = async () => {
  const uri: string = process.env[`STORAGE_URI`];
  // Set up client with uri:
  const client = new Client({ connectionString: uri });
  client.connect();
  return client
    .query('DELETE FROM keyv;')
    .catch((e) => console.error(e.stack))
    .then(() => client.end());
};
