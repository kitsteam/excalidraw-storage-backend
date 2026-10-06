import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Database } from 'sqlite3';
import {
  SQLITE_CLIENT_FACTORY,
  SqliteClientFactory,
} from './sqlite-client.interface';

/**
 * Default factory that creates a real sqlite3.Database-backed client.
 * Mirrors @keyv/sqlite's own URI handling (strips the sqlite:// prefix).
 */
const defaultClientFactory: SqliteClientFactory = () => {
  const uri: string = process.env['STORAGE_URI'];
  const dbPath = uri.replace(/^sqlite:\/\//, '');
  let database: Database;
  return {
    connect: () =>
      new Promise<void>((resolve, reject) => {
        database = new Database(dbPath, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
    query: (sql: string) =>
      new Promise((resolve, reject) => {
        database.run(sql, function (error) {
          if (error) {
            reject(error);
          } else {
            resolve({ rowCount: this.changes });
          }
        });
      }),
    end: () =>
      new Promise<void>((resolve, reject) => {
        database.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
};

@Injectable()
export class SqliteTtlService {
  private readonly logger = new Logger(SqliteTtlService.name);
  private readonly clientFactory: SqliteClientFactory;

  constructor(
    @Optional()
    @Inject(SQLITE_CLIENT_FACTORY)
    clientFactory?: SqliteClientFactory,
  ) {
    this.clientFactory = clientFactory ?? defaultClientFactory;
  }

  @Cron(process.env['SQLITE_TTL_CRON'] || CronExpression.EVERY_DAY_AT_4AM)
  async handleCron() {
    this.logger.log('Starting SqliteTtlService to clean up expired data.');
    this.deleteExpiredItems();
    this.logger.log('Finished.');
  }

  async deleteExpiredItems() {
    let expiredItemsCount = 0;
    const client = this.clientFactory();

    try {
      await client.connect();
      // TTL is stored in milliseconds, embedded as JSON in the value column, same
      // generic {value, expires} shape keyv uses for any adapter without native TTL
      // support (same as postgres).
      const queryResult = await client.query(
        "DELETE FROM keyv WHERE CAST(json_extract(value, '$.expires') AS INTEGER) BETWEEN 1 AND (strftime('%s','now') * 1000);",
      );

      this.logger.log('Deleted expired items:', queryResult.rowCount);
      expiredItemsCount = queryResult.rowCount;
    } catch (error) {
      this.logger.error('Error executing query:', error);
    } finally {
      await client.end();
    }

    return expiredItemsCount;
  }
}
