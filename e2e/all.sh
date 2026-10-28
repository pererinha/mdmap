#!/bin/sh
# Every test, as before a release: types, unit tests, every scenario in the test Obsidian (e2e/setup.sh), then the
# phone scenario in Obsidian for Android on the emulator (e2e/README.md, "Android"). Each scenario's output goes to
# e2e/shots/<scenario>.log; at the end come the checks that came out false. Usage: e2e/all.sh
cd "$(dirname "$0")/.."
npx tsc --noEmit -p . || exit 1
npm test || exit 1
MDMAP_VAULT="$PWD/test-vault" npm run build || exit 1
mkdir -p e2e/shots
for s in steps lists positions story organize reveal trackpad paragraphs paragraph-media copy grip i18n width settings collapse folds focus search editing colors undo-lock viewport android; do
  node "e2e/$s.js" > "e2e/shots/$s.log" 2>&1
  echo "$s: exit $?"
done
echo "Checks that came out false:"
grep -H 'false$' e2e/shots/*.log
