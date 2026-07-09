import './env.js';
import express from 'express';
import cors from 'cors';
import { getJob, saveAnswer, startAnalyze } from './pipeline/jobs.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/analyze', (_req, res) => {
  const job = startAnalyze();
  res.json({ jobId: job.id });
});

app.get('/api/analyze/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    status: job.status,
    stage: job.stage,
    stageDetail: job.stageDetail,
    error: job.error,
    result: job.status === 'done' ? job.result : undefined,
  });
});

app.post('/api/questions/:id/answer', (req, res) => {
  const { answer } = req.body ?? {};
  if (typeof answer !== 'string' || !answer.trim())
    return res.status(400).json({ error: 'answer required' });
  if (!saveAnswer(req.params.id, answer.trim()))
    return res.status(404).json({ error: 'question not found' });
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`server on http://localhost:${PORT}`));
