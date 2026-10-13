import { Router } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

router.get('/', (_req, res) => {
  const dbStatus = D1DatabaseClient.getStatus();
  res.json({
    status: 'online',
    system: 'Apoio ao Tratamento API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      provider: 'Cloudflare D1',
      mode: dbStatus.mode,
      isConnected: dbStatus.isConnected,
      name: dbStatus.database,
    },
  });
});

export default router;
