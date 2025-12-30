import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Client } from 'pg';
import {
  POSTGRES_CLIENT_FACTORY,
  PostgresClientFactory,
} from './postgres-client.interface';

/**
 * Default factory that creates a real pg.Client instance.
 */
const defaultClientFactory: PostgresClientFactory = () => {
  const uri: string = process.env[`STORAGE_URI`];
  const client = new Client({ connectionString: uri });
  return {
    connect: () => client.connect(),
    query: async (sql: string) => {
      return client.query(sql);
    },
    end: () => client.end(),
  };
};

@Injectable()
export class PostgresTtlService {
  private readonly logger = new Logger(PostgresTtlService.name);
  private readonly clientFactory: PostgresClientFactory;

  constructor(
    @Optional()
    @Inject(POSTGRES_CLIENT_FACTORY)
    clientFactory?: PostgresClientFactory,
  ) {
    this.clientFactory = clientFactory ?? defaultClientFactory;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCron() {
    this.logger.log('Starting PostgresTtlService to clean up expired data.');
    this.deleteExpiredItems();
    this.logger.log('Finished.');
  }

  async deleteExpiredItems() {
    let expiredItemsCount = 0;
    const client = this.clientFactory();

    try {
      // Connect to the database
      await client.connect();
      // Delete all expired items. TTL is stored in milliseconds:
      const queryResult = await client.query(
        "DELETE FROM keyv WHERE (keyv.value::json ->> 'expires')::bigint / 1000 <= extract(epoch from now());",
      );

      this.logger.log('Deleted expired items:', queryResult.rowCount);
      expiredItemsCount = queryResult.rowCount;
    } catch (error) {
      this.logger.error('Error executing query:', error);
    } finally {
      // Always release the connection afterwards:
      await client.end();
    }

    return expiredItemsCount;
  }
}
