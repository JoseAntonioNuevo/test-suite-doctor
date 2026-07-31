# Release runbook

The repository workflows build and test releases, but two GitHub/registry
controls must be configured by a repository or registry administrator. They
are intentionally not mutated by local scripts.

## Repository controls

1. Create a GitHub `release` environment with the maintainers as required
   reviewers and enable maintainer self-approval. This is the single manual
   approval gate.
2. Add a repository ruleset for `refs/tags/v*` that prevents deletion and
   non-fast-forward/force updates.
3. Require the CI jobs named `quality`, `runner-integration`, `dogfood`,
   `package-smoke`, `mutation-smoke`, `workflow-security`, and `benchmark`.

## One-time registry bootstrap for v0.3

Immediately before bootstrap, check the package name with
`pnpm view test-suite-doctor`. If it is unavailable, change `package.json` to
`@joseantonionuevo/test-suite-doctor`; retain the `test-suite-doctor` binary.

1. On a protected release candidate commit, set the version to `0.3.0-rc.0`.
2. Create a manually dispatched workflow restricted to the `release`
   environment. It must run the full release gates, pack once, and publish the
   exact tested tarball under `next` using a short-lived granular token:
   `pnpm publish "$TARBALL" --tag next --access public`.
3. Configure registry trusted publishing for exactly
   `JoseAntonioNuevo/test-suite-doctor`, workflow `release.yml`, environment
   `release`.
4. Revoke the granular token and delete or disable the bootstrap workflow
   before tagging stable `v0.3.0`.

The bootstrap workflow is deliberately not committed in an active state: an
active long-lived-token publication path would undermine the stable OIDC path.

## Stable release

Update `package.json` and the bundled tool version together, rebuild
`dist/cli.mjs`, and commit it. Tag the exact commit as `vX.Y.Z`; the tag must
equal the package version. `release.yml` then:

- reruns all tests and pinned external benchmarks from clean checkouts;
- uses GitHub-hosted Node 24 and pnpm 11.18.0;
- packs once, writes SHA-256 and CycloneDX SBOM files, and publishes that exact
  tarball using OIDC provenance and no registry token;
- skips registry publication when the version already exists; and
- creates or updates the GitHub release and attaches the same tarball,
  checksum, and SBOM idempotently.

Do not recreate a registry-token path after trusted publishing is enabled.
