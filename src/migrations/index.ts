import * as migration_20260309_235650_backfill_product_prices_usd from './20260309_235650_backfill_product_prices_usd';

export const migrations = [
  {
    up: migration_20260309_235650_backfill_product_prices_usd.up,
    down: migration_20260309_235650_backfill_product_prices_usd.down,
    name: '20260309_235650_backfill_product_prices_usd'
  },
];
