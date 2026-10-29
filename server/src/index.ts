import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { D1DatabaseClient } from './db/d1Client.js';
import { apiGeneralRateLimiter } from './middlewares/rateLimiter.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import attendantsRouter from './routes/attendants.js';
import supportsRouter from './routes/supports.js';
import goalsRouter from './routes/goals.js';
import auditRouter from './routes/audit.js';
import settingsRouter from './routes/settings.js';
import aiRouter from './routes/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregamento resiliente de variáveis locais (.env) fora de contêineres Docker
if (typeof process.loadEnvFile === 'function') {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile(p);
        break;
      } catch {
        // Ignora erro se já estiver carregado pelo runtime
      }
    }
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configura o Express para confiar nos cabeçalhos de proxy reverso (NPM, Cloudflare, etc.)
app.set('trust proxy', 1);

// Cabeçalhos HTTP Defensivos de Segurança (OWASP / ASVS)
app.use((_req, res, next) => {
  // Anti-Clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevenção de MIME-Sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Política estrita de Referrer
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Força HTTPS em produção (HSTS - 1 ano com subdomínios)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // Restrição de recursos de hardware do navegador
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Content Security Policy (CSP) robusta
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

// Configuração segura de CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem origin (same-origin, ferramentas internas, proxy)
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email'],
  })
);

// Limites de tamanho de payload seguros (prevenção contra Memory Exhaustion DoS)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Logging de requisições simplificado
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Rate limiting global para a API
app.use('/api', apiGeneralRateLimiter);

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

// Rota 404 padrão para requisições na API
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado na API do Cloudflare D1.' });
});

// Servir arquivos estáticos do frontend (Single Container)
const potentialClientPaths = [
  process.env.CLIENT_BUILD_PATH,
  path.resolve(__dirname, '../client'),
  path.resolve(__dirname, '../../dist'),
  path.resolve(process.cwd(), 'client'),
  path.resolve(process.cwd(), 'dist'),
].filter(Boolean) as string[];

const clientDistPath = potentialClientPaths.find((p) => fs.existsSync(p));

if (clientDistPath) {
  // Cache de 1 ano para assets estáticos com hash gerados pelo Vite
  const assetsDir = path.join(clientDistPath, 'assets');
  if (fs.existsSync(assetsDir)) {
    app.use(
      '/assets',
      express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
      })
    );
  }

  // Demais arquivos estáticos da raiz do client (favicon, manifest, etc.)
  app.use(
    express.static(clientDistPath, {
      maxAge: '1h',
    })
  );

  // Fallback Single Page Application (SPA) para qualquer rota client-side
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Caso o frontend não esteja presente (modo API isolada)
  app.get('/', (_req, res) => {
    res.json({
      message: 'Apoio ao Tratamento — API Backend ativa',
      health: '/api/health',
    });
  });
}

// Inicialização do servidor
async function startServer() {
  try {
    await D1DatabaseClient.initDatabase();
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 Apoio ao Tratamento — Contêiner Unificado`);
      console.log(`🌐 Servidor ativo na porta: ${PORT}`);
      console.log(
        `💾 Banco de Dados: Cloudflare D1 (${
          D1DatabaseClient.isCloudflareRemote ? 'Remoto Edge' : 'Local SQLite Engine'
        })`
      );
      console.log(
        `🤖 Gemini API Key: ${
          process.env.GEMINI_API_KEY ? 'Configurada via ENV' : 'Aguardando configuração'
        }`
      );
      if (clientDistPath) {
        console.log(`📦 Frontend SPA: Integrado (${clientDistPath})`);
      } else {
        console.log(`⚠️  Frontend SPA: Não localizado (Modo apenas API)`);
      }
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('Falha crítica ao iniciar o servidor:', error);
    process.exit(1);
  }
}

startServer();
