import * as migration_20260309_235650_backfill_product_prices_usd from './20260309_235650_backfill_product_prices_usd';
import * as migration_20260426_130000_migrate_media_from_vercel_blob from './20260426_130000_migrate_media_from_vercel_blob';
import * as migration_20260627_103000_create_default_bot_user from './20260627_103000_create_default_bot_user';

export const migrations = [
  {
    up: migration_20260309_235650_backfill_product_prices_usd.up,
    down: migration_20260309_235650_backfill_product_prices_usd.down,
    name: '20260309_235650_backfill_product_prices_usd'
  },
  {
    up: migration_20260426_130000_migrate_media_from_vercel_blob.up,
    down: migration_20260426_130000_migrate_media_from_vercel_blob.down,
    name: '20260426_130000_migrate_media_from_vercel_blob'
  },
  {
    up: migration_20260627_103000_create_default_bot_user.up,
    down: migration_20260627_103000_create_default_bot_user.down,
    name: '20260627_103000_create_default_bot_user'
  },
];
