#!/bin/bash
# One command to update EVERYTHING:
#   ./release.sh          -> deploy the website + publish a new .exe (booth PCs auto-update)
#   ./release.sh web      -> only deploy the website (booth reloads itself on the home screen)
# Needs: wrangler (logged in), gh (logged in), npm.
set -e
cd "$(dirname "$0")"

echo "1) Building + deploying the website to photobooth.izzul.xyz ..."
npm run build
wrangler pages deploy dist --project-name photobooth-izzul --branch main --commit-dirty=true

if [ "$1" != "web" ]; then
  echo "2) Building + publishing the new desktop app (.exe) to GitHub Releases ..."
  export GH_TOKEN="$(gh auth token)"
  npm run release
  VERSION=$(node -p "require('./package.json').version")
  echo "   Published version $VERSION - booth PCs will download it and install when idle."
fi

echo "3) Saving the code to GitHub ..."
git add -u
git commit -qm "Release $(node -p "require('./package.json').version")" || true
git push -q || true
echo "Done."
