#!/bin/sh
# Creates test-vault/ from the fixtures, builds the plugin into it and launches a second Obsidian
# with its own profile and a CDP port. Usage: e2e/setup.sh   (then: node e2e/drive.js status)
set -e
cd "$(dirname "$0")/.."
VAULT="$PWD/test-vault"
PROFILE="${MDMAP_OBSIDIAN_PROFILE:-$VAULT/.obsidian-profile}"
PORT="${MDMAP_CDP_PORT:-9333}"
mkdir -p "$VAULT/.obsidian" "$PROFILE"
cp -R e2e/fixtures/. "$VAULT/"
echo '["mdmap"]' > "$VAULT/.obsidian/community-plugins.json"
MDMAP_VAULT="$VAULT" npm run build
printf '{"vaults":{"0123456789abcdef":{"path":"%s","ts":%s000,"open":true}}}' "$VAULT" "$(date +%s)" > "$PROFILE/obsidian.json"
echo "Launching Obsidian on port $PORT with profile $PROFILE"
exec /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$PROFILE" --remote-debugging-port="$PORT"
