#!/usr/bin/env bash
set -e

# Define colors and formatting
RED='\033[31m'
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
MAGENTA='\033[35m'
CYAN='\033[36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

printf "%b\n" "${BOLD}${CYAN}Story Diff E2E Testing Pipeline ${NC}"

# cd back to root
cd "$(dirname "$0")/.."

# ensure project is built
printf "%b\n" "\n${BOLD}${BLUE}📦 Building project...${NC}"
npm run build

printf "%b\n" "${BOLD}${BLUE}🧹 Preparing E2E environments...${NC}"
# Clean up previous runs
rm -rf e2e/snapshots

# ensure fixture deps
cd e2e/fixture
npm install
cd ../..

printf "%b\n" "\n${BOLD}${BLUE}🌐 Ensuring Playwright Chromium is installed...${NC}"
npx playwright install chromium

printf "%b\n" "\n${BOLD}${BLUE}🚀 Starting fixture Storybook server...${NC}\n"

trap 'printf "%b\n" "\n${BOLD}${RED}❌ Tests interrupted by user${NC}"; exit 130' INT

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
  "npx wait-on http://127.0.0.1:6006/iframe.html -t 60000 && printf '%b\n' '\n${BOLD}${GREEN}✅ Storybook ready!${NC}' && \
   printf '\n' && \
   printf '%b\n' '${BOLD}${MAGENTA}🧪 Running E2E: Vitest${NC}' && \
   npm run test:e2e:vitest && \
   printf '%b\n' '${BOLD}${YELLOW}🧪 Running E2E: Jest${NC}' && \
   npm run test:e2e:jest && \
   printf '\n' && \
   printf '%b\n' '${BOLD}${CYAN}🎭 Running E2E: Playwright${NC}' && \
   npm run test:e2e:playwright"

printf "%b\n" "\n${BOLD}${GREEN}🎉 All E2E Tests Passed! 🚀${NC}"
