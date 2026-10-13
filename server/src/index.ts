import express from 'express';
import cors from 'cors';
import { D1DatabaseClient } from './db/d1Client.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import attendantsRouter from './routes/attendants.js';
import supportsRouter from './routes/supports.js';
import goalsRouter from './routes/goals.js';
import auditRouter from './routes/audit.js';
import settingsRouter from './routes/settings.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logging de requisições simplificado
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Rotas da API
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/attendants', attendantsRouter);
app.use('/api/supports', supportsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ai', aiRouter);

// Rota 404 padrão
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado na API do Cloudflare D1.' });
});

// Inicialização do servidor
async function startServer() {
  try {
    await D1DatabaseClient.initDatabase();
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 Apoio ao Tratamento — Backend API`);
      console.log(`🌐 Servidor ativo na porta: ${PORT}`);
      console.log(`💾 Banco de Dados: Cloudflare D1 (${D1DatabaseClient.isCloudflareRemote ? 'Remoto Edge' : 'Local SQLite Engine'})`);
      console.log(`🤖 Gemini API Key: ${process.env.GEMINI_API_KEY ? 'Configurada via ENV' : 'Aguardando configuração'}`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('Falha crítica ao iniciar o servidor:', error);
    process.exit(1);
  }
}

startServer();
