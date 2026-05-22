#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Step 1: Build backend Lambda bundle ==="
bash "$SCRIPT_DIR/build-backend.sh"

echo ""
echo "=== Step 2: Deploy infrastructure (first pass) ==="
cd "$PROJECT_ROOT/infra"
npx cdk deploy --require-approval never --outputs-file cdk-outputs.json

echo ""
echo "=== Step 3: Extract API URL from CDK outputs ==="
API_URL=$(node -e "
  const outputs = require('./cdk-outputs.json');
  const stackName = Object.keys(outputs)[0];
  console.log(outputs[stackName].ApiUrl);
")

if [ -z "$API_URL" ]; then
  echo "ERROR: Failed to extract ApiUrl from CDK outputs" >&2
  exit 1
fi
echo "API URL: $API_URL"

echo ""
echo "=== Step 4: Build frontend with API URL ==="
cd "$PROJECT_ROOT"
VITE_API_URL="$API_URL" bash "$SCRIPT_DIR/build-frontend.sh"

echo ""
echo "=== Step 5: Re-deploy to push frontend assets to S3 ==="
cd "$PROJECT_ROOT/infra"
npx cdk deploy --require-approval never

echo ""
echo "=== Deployment complete ==="
FRONTEND_URL=$(node -e "
  const outputs = require('./cdk-outputs.json');
  const stackName = Object.keys(outputs)[0];
  console.log(outputs[stackName].FrontendUrl);
")
echo ""
echo "API URL:      $API_URL"
echo "Frontend URL: https://$FRONTEND_URL"
