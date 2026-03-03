import Keyv from 'keyv';
import KeyvPostgres from '@keyv/postgres';
import { StorageNamespace } from './storage.service';
import { PgMockManager } from '../../test/utils';

/**
 * Integration tests using PGlite to verify the regexp_replace touch SQL
 * preserves stored data while updating only the expires timestamp.
 *
 * Uses beforeAll (not beforeEach) because KeyvPostgres triggers async PGlite
 * initialization that must complete within an awaited context.
 */
describe('touchPostgres regexp_replace integration (PGlite)', () => {
  let store: KeyvPostgres;
  let keyv: Keyv;
  const ttl = 86400000;
  const namespace = StorageNamespace.SCENES;

  const getDb = () => PgMockManager.getInstance().getDb();

  /** Run the same regexp_replace SQL that touchPostgres uses. */
  const runTouchSql = async (fullKey: string, expires: number) => {
    return getDb().query(
      `UPDATE keyv
       SET value = regexp_replace(value, '"expires":\\d+', '"expires":' || $1::text)
       WHERE key = $2`,
      [expires, fullKey],
    );
  };

  /** Read the raw value column from the keyv table. */
  const readRawRow = async (
    fullKey: string,
  ): Promise<string | undefined> => {
    const result = await getDb().query<{ value: string }>(
      'SELECT value FROM keyv WHERE key = $1',
      [fullKey],
    );
    return result.rows[0]?.value;
  };

  beforeAll(async () => {
    store = new KeyvPostgres();
    keyv = new Keyv({ store, namespace, ttl });
    // Force PGlite table creation by performing an initial operation
    await keyv.set('__init__', 'init');
    await keyv.delete('__init__');
  });

  afterEach(async () => {
    await PgMockManager.getInstance().clearDatabase();
  });

  afterAll(async () => {
    await store.disconnect();
  });

  it('should preserve binary data after touch', async () => {
    const original = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
    await keyv.set('binary-key', original);

    const fullKey = `${namespace}:binary-key`;
    const newExpires = Date.now() + ttl * 2;
    await runTouchSql(fullKey, newExpires);

    const retrieved = await keyv.get('binary-key');
    expect(Buffer.isBuffer(retrieved)).toBe(true);
    expect(Buffer.from(retrieved).equals(original)).toBe(true);
  });

  it('should update the expires timestamp in the raw row', async () => {
    await keyv.set('ts-key', 'hello');

    const fullKey = `${namespace}:ts-key`;
    const rawBefore = await readRawRow(fullKey);
    const expiresBefore = JSON.parse(rawBefore!).expires as number;

    const newExpires = expiresBefore + 99999;
    await runTouchSql(fullKey, newExpires);

    const rawAfter = await readRawRow(fullKey);
    const expiresAfter = JSON.parse(rawAfter!).expires as number;

    expect(expiresAfter).toBe(newExpires);
    expect(expiresAfter).not.toBe(expiresBefore);
  });

  it('should preserve string data after touch', async () => {
    await keyv.set('str-key', 'some important string value');

    const fullKey = `${namespace}:str-key`;
    await runTouchSql(fullKey, Date.now() + ttl * 2);

    const retrieved = await keyv.get('str-key');
    expect(retrieved).toBe('some important string value');
  });

  it('should not modify value when expires is null', async () => {
    const fullKey = `${namespace}:no-expires`;
    // Insert a row manually with "expires":null — won't match \d+
    await getDb().query(`INSERT INTO keyv (key, value) VALUES ($1, $2)`, [
      fullKey,
      '{"value":"test-data","expires":null}',
    ]);

    const rawBefore = await readRawRow(fullKey);
    await runTouchSql(fullKey, Date.now() + ttl);
    const rawAfter = await readRawRow(fullKey);

    expect(rawAfter).toBe(rawBefore);
  });
});
