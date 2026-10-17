import * as migration_20261017_055558_initial_admins from './20261017_055558_initial_admins';

export const migrations = [
  {
    up: migration_20261017_055558_initial_admins.up,
    down: migration_20261017_055558_initial_admins.down,
    name: '20261017_055558_initial_admins'
  },
];
