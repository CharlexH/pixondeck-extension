# Development

## Standalone build and fixtures

`npm ci`, `npm run typecheck`, `npm test`, and `npm run build` run inside this repository without a website checkout. Tests depend on the pinned Clerk package layout. A build with empty auth configuration produces a shell, not a usable hosted account connection.

`npm run preview` starts local fixtures at port 8791. Preview images use the bundled project icon instead of private website examples. Login, tasks, saved prompts and provider responses are simulated. Do not use real credentials in fixtures.

## Live service requirements

Use `.env.example` for public client configuration only. You need:

- A matching website and Clerk instance, using its publishable key, frontend origin and Sync Host configuration.
- The actual `chrome-extension://<id>` in the appropriate Clerk and backend origin allowlists.
- An API implementing the client's `/api/reverse/*` and `/api/saved-prompts` contracts, authenticated with Bearer tokens and exact-origin CORS.
- Site routes for shared sign-in and supported prompt handoff.

The generated `development-key.json` contains a public key and extension ID only. It stabilizes your local identity and is ignored by Git. Never configure a private signing key or server credential in the extension. Generating an identity does not authorize it against PixOnDeck's production services. BYOK currently also requires shared account sign-in.

This repository does not ship a backend implementation or promise full self-hosting. Use the official installation page for the supported product. Contact maintainers before proposing service-integration changes.

## Maintainer packaging

Copy `.env.production.example` to `.env.production` and fill authorized public configuration. Run `npm run package:production` (also requires Python 3). The ZIP and checksum are written to `artifacts/`; the build includes LICENSE, NOTICE and generated dependency notices.

Production validation rejects local origins, development Clerk keys, mismatched Clerk origins and reuse of the generated development identity. Do not treat those checks as live API/auth validation. Register and test the exact store identity before distribution.

A tagged source version, a generated ZIP, store submission and a publicly installable store version are different states. Never claim store availability based only on a build or source tag.

## Upstream maintenance

This repository publishes the official client from the PixOnDeck development codebase. Keep original client behavior in sync; standalone adaptations cover local assets, locale definitions, explicit test dependencies and packaging paths. Accept external changes through review, integrate them into the development source, then publish the next reviewed snapshot. Do not copy private environment files, operational records or website Git history.

### Updating from the private development checkout

Run the allowlisted sync as a dry run first:

```sh
python3 scripts/sync-upstream.py /path/to/PixOnDeck
python3 scripts/sync-upstream.py /path/to/PixOnDeck --apply
npm ci
npm run typecheck
npm test
npm run build
git diff
```

The apply step requires a clean public checkout. It copies only client source, preview fixtures, selected build scripts and assets; preserves public documentation and environment templates; reapplies standalone adaptations; refreshes the lockfile; and removes only previously managed files no longer present upstream. Review changes for sensitive content and new dependencies before publishing. Structural changes stop the adapter for manual review. It never commits or pushes. Website-only changes normally need no client sync; changed API contracts may still require a coordinated client release.
