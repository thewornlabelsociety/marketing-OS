import 'dotenv/config';
import './integrations/bootstrap';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { initDatabase } from './db/database';
import { campaignsRouter } from './routes/campaigns';
import { campaignBriefRouter } from './routes/campaignBrief';
import { campaignPlansRouter } from './routes/campaignPlans';
import { contentPlansRouter } from './routes/contentPlans';
import { campaignCreativeRouter } from './routes/campaignCreative';
import { campaignScheduleRouter } from './routes/campaignSchedule';
import { calendarScheduleRouter, calendarReadyRouter, calendarConfigRouter } from './routes/calendarSchedule';
import { integrationsRouter } from './routes/integrations';
import { publishingDestinationsRouter } from './routes/publishingDestinations';
import { contentRouter } from './routes/content';
import { entitiesRouter } from './routes/entities';
import { bridgeIntakeRouter, intakeRouter } from './routes/intake';
import { mediaRouter } from './routes/media';
import { objectivesRouter } from './routes/objectives';
import { campaignPerformanceRouter } from './routes/campaignPerformance';
import { libraryRouter } from './routes/library';
import { blueprintsRouter } from './routes/blueprints';
import { learningsRouter } from './routes/learnings';
import { performanceRouter } from './routes/performance';
import { sopsRouter } from './routes/sops';
import { archiveRouter } from './routes/archive';
import { campaignExperimentsRouter } from './routes/campaignExperiments';
import { dashboardRouter, attentionRouter } from './routes/dashboard';
import { publishingSchedulerService } from './services/publishing/PublishingSchedulerService';
import { businessSourcesRouter } from './routes/businessSources';
import { businessIntegrationService } from './services/business/BusinessIntegrationService';
import { establishLocalOperatorSession } from './middleware/localOperatorSession';
import { resolveWornLabelIntegrationEnvironment } from './config/businessIntegrationEnvironment';
import { intelligenceRouter } from './routes/intelligence';
import { recommendationsRouter } from './routes/recommendations';
import { plannerRouter } from './routes/planner';
import { repurposeRouter } from './routes/repurpose';

const app = express();
// In production (single-server) there is no cross-origin request so CORS
// does not apply. In local dev the Vite proxy rewrites the origin to
// localhost — allow that. On Replit the frontend is served by this same
// Express process so same-origin applies and CORS is irrelevant, but we
// also permit any *.replit.app or *.repl.co origin for the dev webview.
const CORS_ORIGIN = process.env.REPL_SLUG
  ? [/^https?:\/\/.*\.replit\.app$/, /^https?:\/\/.*\.repl\.co$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]
  : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100mb' }));

initDatabase();

app.use('/api/entities', entitiesRouter);
app.use('/api/objectives', objectivesRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns/:campaignId/brief', campaignBriefRouter);
app.use('/api/campaigns/:campaignId/plan', campaignPlansRouter);
app.use('/api/campaigns/:campaignId/content-plan', contentPlansRouter);
app.use('/api/campaigns/:campaignId/creative', campaignCreativeRouter);
app.use('/api/campaigns/:campaignId/schedule', campaignScheduleRouter);
app.use('/api/campaigns/:campaignId/performance', campaignPerformanceRouter);
app.use('/api/campaigns/:campaignId/experiments', campaignExperimentsRouter);
app.use('/api/calendar/schedule', calendarScheduleRouter);
app.use('/api/calendar/ready', calendarReadyRouter);
app.use('/api/calendar/config', calendarConfigRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/publishing/destinations', publishingDestinationsRouter);
app.use('/api/content', contentRouter);
app.use('/api/intake', intakeRouter);
app.use('/api/bridge/intake', bridgeIntakeRouter);
app.use('/api/sops', sopsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/learnings', learningsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/blueprints', blueprintsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/attention', attentionRouter);
app.use('/api/media', mediaRouter);
app.post('/api/local-operator-session', establishLocalOperatorSession);
app.use('/api/business-sources', businessSourcesRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/planner', plannerRouter);
app.use('/api/repurpose', repurposeRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'marketing-os-backend' });
});

// Serve built frontend in production (single-port deployment)
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Marketing OS Backend running on http://localhost:${PORT}`);
  publishingSchedulerService.start();
  const wornLabelEnv = resolveWornLabelIntegrationEnvironment();
  console.log(`[business-sync] ${wornLabelEnv.diagnostic}`);
  if (wornLabelEnv.enabled && wornLabelEnv.workspaceId) {
    businessIntegrationService.connectWornLabelFromEnvironment(wornLabelEnv.workspaceId)
      .then((integration) => {
        const syncWornLabel = () => void businessIntegrationService.sync(integration.id, wornLabelEnv.workspaceId!)
          .catch((error) => console.error('[business-sync] Worn Label sync failed:', (error as Error).message));
        syncWornLabel();
        setInterval(syncWornLabel, wornLabelEnv.syncIntervalMinutes * 60_000).unref();
      })
      .catch((error: Error) => {
        console.error('[business-sync] Worn Label configuration failed:', error.message);
      });
  }
});
