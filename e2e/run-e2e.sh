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

echo "=> Ensuring Playwright Chromium is installed"
npx playwright install chromium

echo ""
echo "=> Starting fixture Storybook server..."

trap 'echo ""; echo "Tests interrupted by user"; exit 130' INT

# We use wait-on to wait for the storybook server to be ready before running tests.
# concurrently lets us spin up storybook and wait-on in parallel.
npx concurrently \
  --kill-others \
  --kill-others-on-fail \
  --success first \
  --raw \
  --names "SB,TESTS" \
  -c "bgBlue,bgMagenta" \
  "npm run storybook --prefix e2e/fixture 2>&1 | grep -v '^$' || true" \
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
   npm run test:e2e:jest && \
   echo '' && \
   echo '==============================================' && \
   echo '  Running E2E: Playwright ' && \
   echo '==============================================' && \
   npm run test:e2e:playwright"

echo ""
echo "=============================================="
echo "   All E2E Tests Passed! 🚀"
echo "=============================================="
