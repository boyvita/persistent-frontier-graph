# Security policy

## Supported version

The latest commit on `main` is supported while the project is pre-1.0. Pin an
exact reviewed commit when installing from GitHub.

## Reporting a vulnerability

Please use [GitHub's private vulnerability report](https://github.com/boyvita/persistent-frontier-graph/security/advisories/new).
Do not include exploit details, private data, or credentials in a public issue.
Include affected commits, a minimal reproduction, impact, and any known
mitigation. The maintainer will acknowledge a complete report within seven
days and coordinate disclosure after a fix is available.

## Trust boundary

The library performs no network requests, telemetry, persistence, or dynamic
code loading. Consumer-provided renderers and callbacks execute with the
consumer application's authority and are not sandboxed. Treat externally
loaded tree data as untrusted and validate it before rendering.
