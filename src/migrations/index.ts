import * as migration_20261017_055558_initial_admins from './20261017_055558_initial_admins';
import * as migration_20261017_065620_c0_foundation from './20261017_065620_c0_foundation';
import * as migration_20261017_070142_provider_reservation_lease from './20261017_070142_provider_reservation_lease';
import * as migration_20261017_070959_d_repository_integration from './20261017_070959_d_repository_integration';

export const migrations = [
  {
    up: migration_20261017_055558_initial_admins.up,
    down: migration_20261017_055558_initial_admins.down,
    name: '20261017_055558_initial_admins',
  },
  {
    up: migration_20261017_065620_c0_foundation.up,
    down: migration_20261017_065620_c0_foundation.down,
    name: '20261017_065620_c0_foundation',
  },
  {
    up: migration_20261017_070142_provider_reservation_lease.up,
    down: migration_20261017_070142_provider_reservation_lease.down,
    name: '20261017_070142_provider_reservation_lease',
  },
  {
    up: migration_20261017_070959_d_repository_integration.up,
    down: migration_20261017_070959_d_repository_integration.down,
    name: '20261017_070959_d_repository_integration'
  },
];
