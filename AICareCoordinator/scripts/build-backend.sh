#!/usr/bin/env bash
set -euo pipefail

echo "Building backend Lambda bundle..."

npx esbuild packages/backend/src/api-handler.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/lambda/index.js \
  --external:@aws-sdk/* \
  --format=cjs

echo "Backend bundle created at dist/lambda/index.js"
