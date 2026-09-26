# Releasing msql

Releases are GitHub releases. Each one has `m-sql.tgz` attached, and users install the newest one with:

```bash
npm install -g https://github.com/s-azizkhan/msql/releases/latest/download/m-sql.tgz
```

## Release a new version

```bash
git pull
npm version patch        # or: minor | major
git push --follow-tags
```

- `npm version` updates `package.json`, commits the change and creates the tag `vX.Y.Z`. It refuses to run if you have uncommitted changes, so commit or stash them first.
- Pushing the tag starts `.github/workflows/release.yml`. The workflow builds the package, packs it as `m-sql.tgz` and creates the GitHub release with auto-generated notes.

| Bump | When | Example |
|---|---|---|
| `patch` | Bug fixes | 0.1.1 → 0.1.2 |
| `minor` | New features, backward compatible | 0.1.2 → 0.2.0 |
| `major` | Breaking changes | 0.2.0 → 1.0.0 |

## Verify

```bash
gh run watch                                   # wait for the Action to finish
gh release view --json tagName,assets          # check that m-sql.tgz is attached
npm install -g https://github.com/s-azizkhan/msql/releases/latest/download/m-sql.tgz
npm ls -g m-sql                                 # shows the installed version
```

## Manual release (if the Action fails)

```bash
npm install && npm run build
mv "$(npm pack | tail -1)" m-sql.tgz
gh release create v$(node -p 'require("./package.json").version') m-sql.tgz --generate-notes
rm m-sql.tgz
```

The attached file must be named exactly `m-sql.tgz`. Any other name breaks the `releases/latest/download/m-sql.tgz` link.

## Fix a bad release

```bash
gh release delete vX.Y.Z --yes --cleanup-tag   # removes the release and its tag
```

After that, fix the code and release again with a new patch version. Don't reuse the deleted version number.

## npm (optional)

The package is also named `m-sql` on npm. To publish there:

```bash
npm login
npm publish          # prepublishOnly builds dist/ first
```
