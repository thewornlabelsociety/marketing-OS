import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { initDatabase } from './db/database';
import { campaignsRouter } from './routes/campaigns';
import { campaignBriefRouter } from './routes/campaignBrief';
import { campaignPlansRouter } from './routes/campaignPlans';
import { contentPlansRouter } from './routes/contentPlans';
import { campaignCreativeRouter } from './routes/campaignCreative';
import { campaignScheduleRouter } from './routes/campaignSchedule';
import { calendarScheduleRouter } from './routes/calendarSchedule';
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
import { publishingSchedulerService } from './services/publishing/PublishingSchedulerService';

dotenv.config();

const app = express();
app.use(cors());
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
app.use('/api/calendar/schedule', calendarScheduleRouter);
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
app.use('/api/media', mediaRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'marketing-os-backend' });
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Marketing OS Backend running on http://localhost:${PORT}`);
  publishingSchedulerService.start();
});
