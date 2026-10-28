import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import type { Request } from 'express';

let redisClient: Redis | null = null;
let redisStore: RedisStore | undefined = undefined;

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST;

// Inicializa a conexão com o Redis de forma assíncrona e resiliente
if (redisUrl || redisHost) {
  try {
    const clientOptions = {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        // Tenta reconectar a cada 1s a 3s
        return Math.min(times * 200, 3000);
      },
    };

    redisClient = redisUrl
      ? new Redis(redisUrl, clientOptions)
      : new Redis({
          host: redisHost || 'redis',
          port: Number(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          ...clientOptions,
        });

    redisClient.on('connect', () => {
      console.log('✅ [Redis] Conexão estabelecida com sucesso para Rate Limiting.');
    });

    redisClient.on('error', (err: Error) => {
      console.warn('⚠️  [Redis] Aviso de conexão:', err.message);
    });

    // Conexão inicial em segundo plano (não bloqueia inicialização da API)
    redisClient.connect().catch((err) => {
      console.warn('⚠️  [Redis] Não foi possível conectar ao Redis imediatamente. O Rate Limiter funcionará em modo fallback.', err.message);
    });

    redisStore = new RedisStore({
      // @ts-expect-error ioredis call signature compatibility
      sendCommand: (...args: string[]) => redisClient!.call(...args),
      prefix: 'rl:auth:login:',
    });
  } catch (err) {
    console.warn('⚠️  [Redis] Falha ao configurar RedisStore. Operando em modo de memória local.');
  }
}

/**
 * Middleware de Rate Limit específico para a rota de Login.
 * - Proteção contra ataques de Força Bruta (Brute-Force).
 * - Armazenamento distribuído no Redis (ou memória caso Redis esteja offline).
 * - Conta apenas requisições que falharem (skipSuccessfulRequests: true).
 */
export const loginRateLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5, // 5 tentativas incorretas por janela
  standardHeaders: true, // Adiciona cabeçalhos `RateLimit-*` (RFC 6585)
  legacyHeaders: false, // Desabilita `X-RateLimit-*` legados
  passOnStoreError: true, // Se o Redis oscilar, não derruba a requisição de login
  skipSuccessfulRequests: true, // Login correto com sucesso (status < 400) não consome tentativas
  store: redisStore,
  keyGenerator: (req: Request) => {
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-ip';
    // Isola o limite por IP e por conta de e-mail para evitar negação de serviço entre usuários do mesmo IP
    return email ? `${clientIp}:${email}` : clientIp;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Muitas tentativas incorretas de login. Por motivos de segurança, tente novamente após 15 minutos.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterMinutes: 15,
    });
  },
});

export { redisClient };
