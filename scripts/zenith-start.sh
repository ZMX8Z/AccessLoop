#!/bin/sh
set -eu
pnpm exec tsx scripts/zenith-bootstrap.ts
pnpm exec tsx scripts/zenith-initialize.ts
exec pnpm start
