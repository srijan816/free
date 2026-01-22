# Free SaaS Suite (Unified Codebase)

This repo is a four-service SaaS suite in a single codebase. The Gateway/Auth/Ledger service is the orchestration hub, and Money In, Money Out, and Intelligence are spokes that publish events and consume shared data.

## Service map (local ports)
- Money In: `http://localhost:22001`
- Money Out: `http://localhost:22002`
- Intelligence: `http://localhost:22003`
- Gateway/Auth/Ledger: `http://localhost:22004`

## Required local infrastructure
- Postgres 14+ with TimescaleDB extension available.
- Redis 6+ for the event bus.
- Node.js 20+ (TSX + ESM).

## Environment setup
Each service reads its own env file from `config/`. If you change ports, update these files:
- `config/money-in.env`
- `config/money-out.env`
- `config/intelligence.env`
- `config/gateway.env`

Local DB password is stored in `.env`:
- `POSTGRES_PASSWORD` in `.env`
- `DATABASE_URL` in `.env` (example: `postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/freelancer_suite`)

## One-time database setup
```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '<POSTGRES_PASSWORD>';"
sudo -u postgres createdb freelancer_suite
```

## Migrations (run in this order)
```bash
npm install
npm run migrate:gateway
npm run migrate:money-in
npm run migrate:money-out
npm run migrate:intelligence
```

## Build
```bash
npm run build
```

## Run (dev mode)
Starts all services together:
```bash
npm run dev
```

## Run (prod mode)
```bash
npm run build
npm run start
```

## Integration guardrails (important)
- Ledger writes only happen in the Gateway/Auth/Ledger service. Money In and Money Out must publish events; they must not write ledger rows directly.
- Currency values are integer cents only. The gateway rejects decimal currency fields.
- JWTs are issued by the gateway; Money In, Money Out, and Intelligence validate tokens locally via `JWT_ACCESS_SECRET`.
- Magic links are unified in the gateway: use `/api/v1/magic-links`.
- Internal service calls to Part 4 should send `x-internal-key: ${INTERNAL_API_KEY}`.
- OCR routing in Money Out uses a hybrid router (Gemini Flash for low-value, Mindee for high-value/complex).
- True Liquid Balance is computed in Intelligence: bank balances - unpaid bills - estimated taxes.

## Useful URLs
- Homepage / Control Room: `http://localhost:22004/`
- Gateway health: `http://localhost:22004/health`
- Money In API base: `http://localhost:22001/api/v1`
- Money Out API base: `http://localhost:22002/api/v1`
- Intelligence API base: `http://localhost:22003/api/v1`
