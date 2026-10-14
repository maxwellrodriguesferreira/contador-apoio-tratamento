import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseStatus {
  mode: 'cloudflare_remote' | 'sqlite_local';
  isConnected: boolean;
  database: string;
}

export class D1DatabaseClient {
  private static localDb: DatabaseSync | null = null;
  private static isInitialized = false;

  private static get cloudflareConfig() {
    return {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '',
      databaseId:
        process.env.CLOUDFLARE_D1_DATABASE_ID ||
        process.env.CLOUDFLARE_DATABASE_ID ||
        process.env.CF_D1_DB_ID ||
        '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_D1_TOKEN || '',
    };
  }

  static get isCloudflareRemote(): boolean {
    const cfg = this.cloudflareConfig;
    return Boolean(cfg.accountId && cfg.databaseId && cfg.apiToken);
  }

  /**
   * Inicializa o banco de dados e executa migrações/seeds iniciais se necessário
   */
  static async initDatabase(): Promise<void> {
    if (this.isInitialized) return;

    if (this.isCloudflareRemote) {
      console.info('📡 Conectado ao Cloudflare D1 Remoto (Cloudflare Edge SQL API)');
      this.isInitialized = true;
      return;
    }

    // Modo SQLite Local (1:1 compatível com Cloudflare D1)
    const dbDir = process.env.DATABASE_DIR || path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'cloudflare_d1.sqlite');
    console.info(`📦 Inicializando Cloudflare D1 Engine Local em: ${dbPath}`);

    this.localDb = new DatabaseSync(dbPath);

    // Habilita WAL mode e foreign keys para máxima performance e integridade
    this.localDb.exec('PRAGMA journal_mode = WAL;');
    this.localDb.exec('PRAGMA foreign_keys = ON;');

    // Executa schema D1
    const schemaCandidates = [
      path.resolve(__dirname, 'schema.sql'),
      path.resolve(__dirname, '../src/db/schema.sql'),
      path.resolve(process.cwd(), 'src/db/schema.sql'),
      path.resolve(process.cwd(), 'server/src/db/schema.sql'),
    ];

    for (const sPath of schemaCandidates) {
      if (fs.existsSync(sPath)) {
        const schemaSql = fs.readFileSync(sPath, 'utf-8');
        this.localDb.exec(schemaSql);
        break;
      }
    }

    // Popula dados iniciais (Seed) se o banco for novo
    this.seedInitialData();

    this.isInitialized = true;
    console.info('✓ Cloudflare D1 Database Engine pronto e operando.');
  }

  /**
   * Executa uma consulta SQL retornando linhas tipadas
   */
  static async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.initDatabase();

    if (this.isCloudflareRemote) {
      return this.queryCloudflareRemote<T>(sql, params);
    }

    if (!this.localDb) {
      throw new Error('Banco de dados local não inicializado.');
    }

    const stmt = this.localDb.prepare(sql);
    return stmt.all(...(params as (string | number | bigint | null | Uint8Array)[])) as T[];
  }

  /**
   * Executa uma mutação SQL (INSERT, UPDATE, DELETE)
   */
  static async execute(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    await this.initDatabase();

    if (this.isCloudflareRemote) {
      return this.executeCloudflareRemote(sql, params);
    }

    if (!this.localDb) {
      throw new Error('Banco de dados local não inicializado.');
    }

    const stmt = this.localDb.prepare(sql);
    const result = stmt.run(...(params as (string | number | bigint | null | Uint8Array)[]));
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  /**
   * Consulta via Cloudflare D1 REST API
   */
  private static async queryCloudflareRemote<T>(sql: string, params: unknown[]): Promise<T[]> {
    const { accountId, databaseId, apiToken } = this.cloudflareConfig;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na API Cloudflare D1 (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      result?: Array<{ results?: T[]; success?: boolean }>;
      success?: boolean;
      errors?: Array<{ message: string }>;
    };

    if (!data.success || !data.result?.[0]) {
      const errMsg = data.errors?.[0]?.message || 'Falha ao executar query no Cloudflare D1';
      throw new Error(errMsg);
    }

    return data.result[0].results || [];
  }

  /**
   * Mutação via Cloudflare D1 REST API
   */
  private static async executeCloudflareRemote(sql: string, params: unknown[]): Promise<{ changes: number }> {
    const { accountId, databaseId, apiToken } = this.cloudflareConfig;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro de mutação na API Cloudflare D1 (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      result?: Array<{ meta?: { changes?: number }; success?: boolean }>;
      success?: boolean;
      errors?: Array<{ message: string }>;
    };

    if (!data.success || !data.result?.[0]) {
      const errMsg = data.errors?.[0]?.message || 'Falha na mutação Cloudflare D1';
      throw new Error(errMsg);
    }

    return {
      changes: data.result[0].meta?.changes || 1,
    };
  }

  /**
   * Obtém status do banco para endpoints de healthcheck
   */
  static getStatus(): DatabaseStatus {
    return {
      mode: this.isCloudflareRemote ? 'cloudflare_remote' : 'sqlite_local',
      isConnected: this.isInitialized,
      database: this.isCloudflareRemote ? this.cloudflareConfig.databaseId : 'Cloudflare D1 Local Engine',
    };
  }

  /**
   * Popula dados iniciais no banco caso esteja vazio
   */
  private static seedInitialData(): void {
    if (!this.localDb) return;

    // Verifica se o seed já foi executado através de flag em system_settings
    try {
      const seededRow = this.localDb
        .prepare("SELECT value FROM system_settings WHERE key = 'system_seeded'")
        .get() as { value: string } | undefined;

      if (seededRow && seededRow.value === '1') {
        return;
      }
    } catch {
      // Se a tabela ainda não existir, segue para verificação
    }

    // Se já existem perfis de usuários cadastrados, marca como seeded e sai sem recriar
    const countUsers = this.localDb.prepare('SELECT COUNT(*) as count FROM user_profiles').get() as { count: number };
    if (countUsers.count > 0) {
      try {
        this.localDb.prepare(`
          INSERT OR REPLACE INTO system_settings (key, value, updated_at)
          VALUES ('system_seeded', '1', ?)
        `).run(new Date().toISOString());
      } catch {
        // Ignora erro
      }
      return;
    }

    console.info('🌱 Populando dados iniciais no Cloudflare D1...');
    const now = new Date().toISOString();

    // 1. Atendentes
    const attendants = [
      { id: 'att-1', name: 'João Silva', code: '001', active: 1 },
      { id: 'att-2', name: 'Maria Souza', code: '002', active: 1 },
      { id: 'att-3', name: 'Pedro Santos', code: '003', active: 1 },
      { id: 'att-4', name: 'Ana Oliveira', code: '004', active: 1 },
      { id: 'att-5', name: 'Lucas Ferreira', code: '005', active: 1 },
    ];

    for (const a of attendants) {
      this.localDb.prepare(`
        INSERT INTO attendants (id, name, code, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(a.id, a.name, a.code, a.active, now, now);
    }

    // 2. Usuários
    const users = [
      {
        id: 'usr-admin-1',
        auth_user_id: 'sub-admin-carlos',
        name: 'Carlos Eduardo',
        email: 'carlos.admin@drogaria.com.br',
        role: 'ADMIN',
        active: 1,
        attendant_id: null,
      },
      {
        id: 'usr-atendente-1',
        auth_user_id: 'sub-atendente-joao',
        name: 'João Silva',
        email: 'joao.silva@drogaria.com.br',
        role: 'ATENDENTE',
        active: 1,
        attendant_id: 'att-1',
      },
    ];

    for (const u of users) {
      this.localDb.prepare(`
        INSERT INTO user_profiles (id, auth_user_id, name, email, role, active, attendant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(u.id, u.auth_user_id, u.name, u.email, u.role, u.active, u.attendant_id, now, now);
    }

    // 3. Metas Operacionais Padrão
    const today = new Date().toISOString().split('T')[0];
    const goals = [
      {
        id: 'goal-store-daily',
        type: 'DAILY_STORE',
        attendant_id: null,
        target_value: 30,
        start_date: today,
        end_date: null,
        active: 1,
      },
      {
        id: 'goal-store-monthly',
        type: 'MONTHLY_STORE',
        attendant_id: null,
        target_value: 750,
        start_date: today,
        end_date: null,
        active: 1,
      },
      {
        id: 'goal-attendant-daily',
        type: 'DAILY_ATTENDANT',
        attendant_id: null,
        target_value: 6,
        start_date: today,
        end_date: null,
        active: 1,
      },
    ];

    for (const g of goals) {
      this.localDb.prepare(`
        INSERT INTO goals (id, type, attendant_id, target_value, start_date, end_date, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(g.id, g.type, g.attendant_id, g.target_value, g.start_date, g.end_date, g.active, now, now);
    }

    try {
      this.localDb.prepare(`
        INSERT OR REPLACE INTO system_settings (key, value, updated_at)
        VALUES ('system_seeded', '1', ?)
      `).run(now);
    } catch {
      // Ignora erro
    }

    console.info('✓ Dados iniciais de seed cadastrados com sucesso no Cloudflare D1.');
  }
}
