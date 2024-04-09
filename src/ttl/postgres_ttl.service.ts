import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Client } from 'pg';

@Injectable()
export class PostgresTtlService {
  private readonly logger = new Logger(PostgresTtlService.name);

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCron() {
    this.logger.log('Starting PostgresTtlService to clean up expired data.');
    this.deleteExpiredItems();
    this.logger.log('Finished.');
  }

  async deleteExpiredItems() {
    const uri: string = process.env[`STORAGE_URI`];
    if (!uri) {
      this.logger.error(`STORAGE_URI is undefined, cannot clean up old items`);
      return;
    }

    // Set up client with uri:
    const client = new Client({ connectionString: uri });
    let expired_items_count = 0;

    try {
      // Connect to the database
      client.connect();
      // Delete all expired items. TTL is stored in milliseconds:
      const queryResult = await client.query(
        "DELETE FROM keyv WHERE (keyv.value::json ->> 'expires')::bigint / 1000 <= extract(epoch from now());",
      );

      this.logger.log('Deleted expired items:', queryResult.rowCount);
      expired_items_count = queryResult.rowCount;
    } catch (error) {
      this.logger.error('Error executing query:', error);
    } finally {
      // Alwys release the connection afterwards:
      await client.end();
    }

    return expired_items_count;
  }
}
