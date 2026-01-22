# Free SaaS Suite

Unified codebase for four services:
- Gateway/Auth/Ledger (hub)
- Money In (revenue, invoices, payments)
- Money Out (expenses, receipts, banking)
- Intelligence (analytics, tax, forecasts)

## Layout
- `src/gateway`: auth, ledger, gateway APIs
- `src/money-in`: revenue + receivables APIs
- `src/money-out`: expenses + banking APIs
- `src/intelligence`: analytics + tax APIs
- `src/shared`: shared helpers and contracts
- `config`: per-service env files
- `tests`: money-in and money-out unit tests

## Requirements
- Node.js 20+
- Postgres 14+ (TimescaleDB extension available)
- Redis 6+

## Setup
1. Copy env files:
```bash
cp config/money-in.env.example config/money-in.env
cp config/money-out.env.example config/money-out.env
cp config/intelligence.env.example config/intelligence.env
cp config/gateway.env.example config/gateway.env
```

2. Create a root `.env` for shared DB credentials (ignored by git):
```bash
POSTGRES_PASSWORD=your_password
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/freelancer_suite
```

3. Create database:
```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '<POSTGRES_PASSWORD>';"
sudo -u postgres createdb freelancer_suite
```

4. Install dependencies + run migrations:
```bash
npm install
npm run migrate:gateway
npm run migrate:money-in
npm run migrate:money-out
npm run migrate:intelligence
```

## Run
Dev (all services):
```bash
npm run dev
```

Prod:
```bash
npm run build
npm run start
```

## Useful URLs
- Gateway health: `http://localhost:22004/health`
- Money In API base: `http://localhost:22001/api/v1`
- Money Out API base: `http://localhost:22002/api/v1`
- Intelligence API base: `http://localhost:22003/api/v1`

## Notes
- Ledger writes only happen in Gateway/Auth/Ledger.
- Currency values are integer cents only.
- JWTs are issued by the gateway; other services validate via `JWT_ACCESS_SECRET`.

## Docs
- Architecture overview: `docs/ARCHITECTURE.md`
