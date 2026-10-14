# Contributing

Report bugs, suggest ideas and open pull requests on
[GitHub](https://github.com/pererinha/mdmap/issues).

## Setup

```sh
git clone https://github.com/pererinha/mdmap.git
cd mdmap
npm install
npm run build     # writes main.js and styles.css; with MDMAP_VAULT=/path/to/vault, also copies the plugin into that vault
npm run dev       # runs the build again after every change
```

## Before you open a pull request

- Run `npx tsc --noEmit -p .` and `npm test`. Both must pass.
- If the change shows in the map, test it in a real Obsidian.
  [e2e/README.md](e2e/README.md) explains how to run the tests on the desktop
  and on Android.
- Follow the style of the code around your change.

## Release

Before each release, run every test with `e2e/all.sh`. The release steps are
in the [README](README.md#release).
