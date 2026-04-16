#!/usr/bin/env bash
set -e

echo "=============================================="
echo "    Story Diff E2E Testing Pipeline           "
echo "=============================================="

# cd back to root
cd "$(dirname "$0")/.."

# ensure project is built
echo "=> Building project..."
npm run build

echo "=> Preparing E2E environments"
# Clean up previous runs
rm -rf e2e/snapshots

# ensure fixture deps
cd e2e/fixture
npm install
cd ../..

echo ""
echo "=> Starting fixture Storybook server..."
# We use wait-on to wait for the storybook server to be ready before running tests.
# concurrently lets us spin up storybook and wait-on in parallel.
npx concurrently \
  --kill-others \
  --success first \
  --names "SB,TESTS" \
  -c "bgBlue,bgMagenta" \
  "npm run storybook --prefix e2e/fixture" \
  "npx wait-on http://127.0.0.1:6006/iframe.html -t 60000 && echo 'Storybook ready!' && \
   echo '' && \
   echo '==============================================' && \
   echo '  Running E2E: Vitest ' && \
   echo '==============================================' && \
   npm run test:e2e:vitest && \
   echo '' && \
   echo '==============================================' && \
   echo '  Running E2E: Jest ' && \
   echo '==============================================' && \
   npm run test:e2e:jest"

echo ""
echo "=============================================="
echo "   All E2E Tests Passed! 🚀"
echo "=============================================="
