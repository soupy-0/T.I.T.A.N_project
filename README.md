# T.I.T.A.N — Solana Devnet MVP

T.I.T.A.N is a cold-chain/supply-chain telemetry backend. This MVP replaces the Hyperledger Fabric integration with native Solana Devnet transactions using Solana's Memo Program. SQLite remains the operational history and query store; the chain stores a SHA-256 digest plus minimal event metadata, not raw sensor readings or personal data.

## Architecture

- **Node.js + Express API** — supplier onboarding, delivery workflow, limits, sensor buffer, audit/report endpoints.
- **SQLite** — complete sensor history, supplier/sensor mapping, thresholds, delivery status and retry queue.
- **Solana Devnet** — immutable event anchors for workflow changes and selected telemetry (every second reading, plus every alarm).
- **Seed simulator** — simulates five delivery profiles and 50 readings per delivery, including temperature and humidity violations. No NFC implementation is included.

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm
- A Solana Devnet keypair with a small amount of devnet SOL for transaction fees

## Setup

```bash
cd application
npm install
cp .env.example .env
```

Set `SOLANA_KEYPAIR_PATH` in `application/.env` to the path of a Solana CLI keypair JSON file. For example, if you created one with `solana-keygen new`, use its absolute path. Keep the keypair outside source control. Alternatively set `SOLANA_SECRET_KEY` to a JSON array of secret-key bytes; do not use this option on shared systems.

For a fresh Devnet wallet:

```bash
solana config set --url devnet
solana airdrop 1
solana address
```

Ensure the CLI keypair used for the airdrop is the same keypair configured in `.env`.

Start the API:

```bash
npm start
```

Health check: `GET http://localhost:3000/health`.

## Simulate the BPMN telemetry flow

In another terminal, with the API running:

```bash
cd application
npm run seed
```

The seed script registers simulated suppliers and deliveries, configures limits, confirms them, then sends 50 timestamped sensor readings per supplier to `POST /api/buffer`. It includes normal data and temperature/humidity alarm scenarios.

## Key API behavior

- Sensor API key is supplied in `x-api-key`; query-string keys are rejected.
- `POST /api/buffer` validates sensor readings and timestamps (default maximum age 5 minutes; future timestamps beyond 60 seconds are rejected).
- SQLite stores every accepted reading.
- Every second reading and every out-of-range reading is anchored on Solana Devnet.
- If a chain write fails, the reading stays in SQLite with `sync_status='PENDING'`; the background worker retries pending entries every 30 seconds when a wallet is configured.
- `GET /api/dev/health` shows whether the Solana wallet is configured; `GET /health` gives the general API status.

## What goes on-chain?

A canonical event is hashed with SHA-256. A Memo Program transaction records the event type, event ID, digest and timestamp. Full temperature/humidity/GPS data remains in SQLite, avoiding unnecessary disclosure of operational data. Transaction responses include a Solana Explorer URL where available.

## Environment variables

See [`application/.env.example`](application/.env.example). Never commit `.env`, wallet JSON files, or the SQLite database.

## MVP limitations

- Devnet is a test network; it is not production infrastructure.
- The existing delivery workflow adapter records workflow mutations as signed Solana memo events, while SQL remains the queryable state source. This is not a custom Solana smart contract/program.
- A valid Solana keypair and devnet SOL are required for actual on-chain writes. Without a wallet, delivery workflows can be demoed in local-only mode, but no on-chain transaction is sent and selected sensor readings remain pending.
- Before production: rotate demo API keys, move secrets to a secret manager, add HTTPS termination, stronger rate limits and request authentication, and run integration tests against a funded Devnet wallet.
