# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** to **racna.dev@gmail.com**.

Do not file a public issue for security problems. We will:

- Acknowledge receipt within 48 hours
- Investigate and assess severity
- Publish a fix as quickly as the severity warrants
- Credit you in the changelog (unless you prefer anonymity)

## Supported versions

Racna is pre-1.0. Only the latest published version is supported.
Vulnerability fixes will be published as soon as a fix is available.

## Scope

In scope:

- The extension code itself (`src/`)
- The build pipeline (`scripts/`)
- The CI workflows (`.github/workflows/`)
- Third-party dependencies declared in `package.json`

Out of scope:

- Bugs in third-party websites Racna is loaded on (those are the
  responsibility of the site operator)
- Issues in unmaintained forks of this project
