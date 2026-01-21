import express from 'express';
import { config } from './config/index.js';
import { requestContext } from './common/middleware/request-context.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.controller.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { createReportsRouter } from './modules/reports/reports.controller.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { createTaxRouter } from './modules/tax/tax.controller.js';
import { TaxService } from './modules/tax/tax.service.js';
import { createForecastsRouter } from './modules/forecasts/forecasts.controller.js';
import { CashFlowForecastService } from './modules/forecasts/cash-flow-forecast.service.js';
import { createInsightsRouter } from './modules/insights/insights.controller.js';
import { InsightsService } from './modules/insights/insights.service.js';
import { createExportsRouter } from './modules/exports/exports.controller.js';
import { ExportsService } from './modules/exports/exports.service.js';
import { createBudgetsRouter } from './modules/budgets/budgets.controller.js';
import { BudgetsService } from './modules/budgets/budgets.service.js';

const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: config.serviceName });
});

app.get('/health/ready', (_req, res) => {
  res.json({ status: 'ready' });
});

app.use('/api/v1', requestContext);

const taxService = new TaxService();
const insightsService = new InsightsService();
const dashboardService = new DashboardService(taxService, insightsService);
const reportsService = new ReportsService();
const forecastsService = new CashFlowForecastService();
const exportsService = new ExportsService();
const budgetsService = new BudgetsService();

app.use('/api/v1/dashboard', createDashboardRouter(dashboardService));
app.use('/api/v1/reports', createReportsRouter(reportsService));
app.use('/api/v1/tax', createTaxRouter(taxService));
app.use('/api/v1/forecasts', createForecastsRouter(forecastsService));
app.use('/api/v1/insights', createInsightsRouter(insightsService));
app.use('/api/v1/exports', createExportsRouter(exportsService));
app.use('/api/v1/budgets', createBudgetsRouter(budgetsService));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[${config.serviceName}] listening on port ${config.port}`);
});
