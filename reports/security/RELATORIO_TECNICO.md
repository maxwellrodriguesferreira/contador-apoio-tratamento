# Relatório Técnico de Vulnerabilidades e Achados de Segurança

**Aplicação Auditada:** Apoio ao Tratamento (Drogaria & Farmácia Clínica)  
**Normas de Referência:** OWASP Top 10:2021, OWASP ASVS v4.0.3, CWE (Common Weakness Enumeration), NIST SP 800-63B  
**Data da Avaliação:** 28 de Outubro de 2026  
**Status da Auditoria:** Concluída com Correções Verificadas  

---

## Índice de Vulnerabilidades

| ID | Título | Gravidade | OWASP Top 10 | CWE | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **SEC-01** | Ausência Total de Autenticação e Autorização nas Rotas da API REST (Broken Access Control) | 🔴 CRÍTICO | A01:2021 | CWE-306 / CWE-862 | **CORRIGIDO** |
| **SEC-02** | Credenciais Estáticas e Backdoor Universal de Senha Mestra no Mecanismo de Login | 🔴 CRÍTICO | A07:2021 | CWE-798 / CWE-912 | **CORRIGIDO** |
| **SEC-03** | Exposição de Segredos e Credenciais Reais em Arquivo de Orquestração Versionado | 🔴 CRÍTICO | A05:2021 | CWE-798 / CWE-312 | **CORRIGIDO** |
| **SEC-04** | Armazenamento de Senhas em Texto Claro e Comparação Sem Salt Criptográfico | 🔴 CRÍTICO | A02:2021 | CWE-256 / CWE-916 | **CORRIGIDO** |
| **SEC-05** | Ausência de Gerenciamento de Sessão Seguro e Autenticação Forjável por Cabeçalho HTTP | 🟠 ALTO | A07:2021 | CWE-287 / CWE-290 | **CORRIGIDO** |
| **SEC-06** | Cross-Site Scripting Baseado em DOM (DOM XSS) na Renderização de Relatórios de IA | 🟠 ALTO | A03:2021 | CWE-79 | **CORRIGIDO** |
| **SEC-07** | Invalidação Insegura de Certificados TLS na Conexão com Redis | 🟠 ALTO | A05:2021 | CWE-295 | **CORRIGIDO** |
| **SEC-08** | Ausência de Rate Limiting em Operações de IA e Risco de Negação de Serviço Financeira | 🟠 ALTO | A04:2021 | CWE-770 / CWE-400 | **CORRIGIDO** |
| **SEC-09** | Cabeçalhos de Segurança HTTP Incompletos e Ausência de Content Security Policy (CSP) | 🟡 MÉDIO | A05:2021 | CWE-1021 / CWE-693 | **CORRIGIDO** |
| **SEC-10** | Configuração Excessivamente Permissiva de CORS e Limite de Payload Elevado | 🟡 MÉDIO | A05:2021 | CWE-942 / CWE-400 | **CORRIGIDO** |
| **SEC-11** | Dependências Vulneráveis com Falhas Conhecidas (SCA - Software Composition Analysis) | 🔵 BAIXO | A06:2021 | CWE-1395 | **MITIGADO** |

---

## Detalhamento Técnico dos Achados

### SEC-01 — Ausência Total de Autenticação e Autorização nas Rotas da API REST (Broken Access Control)

* **Gravidade:** 🔴 CRÍTICO (CVSS v3.1: 9.8 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
* **Categoria OWASP:** A01:2021 – Broken Access Control
* **CWE:** CWE-306 (Missing Authentication for Critical Function), CWE-862 (Missing Authorization)
* **Componente Afetado:** `server/src/routes/` (`users.ts`, `supports.ts`, `attendants.ts`, `goals.ts`, `audit.ts`, `settings.ts`, `ai.ts`)

#### Descrição Técnica
Embora a documentação arquitetural (`ARCHITECTURE.md`) e a interface gráfica (React) definissem restrições rigorosas baseadas em papéis (`ADMIN` vs `ATENDENTE`), o servidor Express não possuía nenhum middleware de autenticação interceptando as rotas da API sob `/api/*`. 

Qualquer requisição HTTP enviada diretamente por ferramentas como `curl` ou Postman permitia a um usuário anônimo ou de baixo privilégio:
1. Listar, criar, modificar ou excluir perfis de administradores (`/api/users`).
2. Cadastrar, editar ou excluir registros de apoios ao tratamento clínico (`/api/supports`).
3. Forjar logs de auditoria de conformidade (`/api/audit/logs`).
4. Reconfigurar parâmetros centrais do sistema ou deletar a chave do Google Gemini (`/api/settings`).
5. Excluir atendentes em cascata, eliminando registros históricos de tratamento vinculados (`/api/attendants/:id`).

#### Evidências Sanitizadas (Código Vulnerável)
```typescript
// server/src/routes/users.ts (original)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name, email, role, active = true, attendantId } = req.body;
  // NENHUMA verificação de token ou perfil. Qualquer cliente podia enviar role: 'ADMIN'.
```
```typescript
// server/src/routes/supports.ts (original)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const deletedBy = (req.body && req.body.deletedBy) || 'ADMIN';
  // Exclusão permitida anonimamente com autoria forjada.
```

#### Pré-Requisitos para Exploração
Nenhum. Apenas conectividade de rede com a porta do servidor web da aplicação.

#### Impacto Potencial
* **Confidencialidade:** Alta. Vazamento de dados de atendimento, colaboradores, metas e configurações.
* **Integridade:** Crítica. Adulteração irrestrita de dados clínicos, históricos de auditoria e contas administrativas.
* **Disponibilidade:** Alta. Exclusão arbitrária de atendentes, apoios ao tratamento e redefinição de chaves de API.

#### Recomendação de Correção
Implementar middleware de autenticação obrigatório no Express (`authenticateToken`) com verificação criptográfica de tokens e middleware de RBAC estrito (`requireRole(['ADMIN'])`), garantindo que apenas usuários autenticados com o perfil correspondente possam acessar recursos sensíveis.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Criado o middleware `server/src/middlewares/auth.ts` e aplicado em todos os roteadores. Requisições anônimas recebem `401 Unauthorized` (`AUTH_REQUIRED`), e requisições de atendentes a rotas administrativas recebem `403 Forbidden` (`ACCESS_DENIED`). Validado por suite automatizada em `src/tests/serverSecurity.test.ts`.

---

### SEC-02 — Credenciais Estáticas e Backdoor Universal de Senha Mestra no Mecanismo de Login

* **Gravidade:** 🔴 CRÍTICO (CVSS v3.1: 9.8 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
* **Categoria OWASP:** A07:2021 – Identification and Authentication Failures
* **CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-912 (Hidden Functionality / Backdoor)
* **Componente Afetado:** `server/src/routes/auth.ts` (linhas 28, 37, 120)

#### Descrição Técnica
Foram encontradas duas falhas graves de projeto no endpoint de autenticação:
1. **Credenciais Hardcoded:** O método `checkAdminAuth()` aceitava e-mail de administrador e senha pré-definidos (`Teste123$`) diretamente no código caso as variáveis de ambiente estivessem ausentes.
2. **Backdoor de Senha Universal:** Na linha 120 de `server/src/routes/auth.ts`, a expressão condicional continha:
   `password === 'SenhaForte@2026'`
   Isso permitia que um atacante autenticasse em **qualquer conta de usuário cadastrada no sistema** utilizando a senha mestre estática, contornando a senha real do usuário sem deixar rastro no banco.

#### Evidências Sanitizadas (Código Vulnerável)
```typescript
// server/src/routes/auth.ts (original)
const allowedPasswords = [
  process.env.ADMIN_PASSWORD,
  process.env.APP_ADMIN_PASS,
  process.env.DEFAULT_ADMIN_PASSWORD,
  '[SENHA_ESTATICA_REMOVIDA]',
].filter(Boolean);

// Linha 116-120:
const isPasswordValid =
  isValidAdminEnv ||
  isValidAtendenteEnv ||
  (user.password_hash && user.password_hash === password) ||
  password === '[SENHA_MESTRA_REMOVIDA]';
```

#### Pré-Requisitos para Exploração
Conhecimento do e-mail de qualquer usuário cadastrado na base de dados.

#### Impacto Potencial
Acesso não autorizado instantâneo com privilégios de Administrador, comprometimento total das contas e dados corporativos.

#### Recomendação de Correção
1. Eliminar qualquer constante estática ou senha mestre de código-fonte.
2. Permitir autenticação via variáveis de ambiente unicamente quando estas forem expressamente injetadas no container e não vazias.
3. Exigir verificação estrita contra hash criptográfico individual por usuário.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Removidas todas as constantes literais em `auth.ts`. O teste unitário em `src/tests/serverSecurity.test.ts` confirma a rejeição de senhas estáticas e backdoors universais com código de retorno `401 Unauthorized`.

---

### SEC-03 — Exposição de Segredos e Credenciais Reais em Arquivo de Orquestração Versionado

* **Gravidade:** 🔴 CRÍTICO (CVSS v3.1: 9.3 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N`)
* **Categoria OWASP:** A05:2021 – Security Misconfiguration / A02:2021 – Cryptographic Failures
* **CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-312 (Cleartext Storage of Sensitive Information)
* **Componente Afetado:** `docker-compose.watchtower.yaml` (linhas 33, 38-40, 43, 47-48)

#### Descrição Técnica
O arquivo de manifesto Docker Compose `docker-compose.watchtower.yaml` continha valores de fallback incorporados que incluíam credenciais reais de produção da Cloudflare (Account ID, Database ID e API Token com permissão *D1 Edit*), chave ativa de API do Google Gemini, string de conexão com senha embutida do Upstash Redis e dados de acesso administrativo. 

Como o arquivo estava versionado no repositório Git, essas credenciais ficaram expostas a qualquer pessoa ou automação com permissão de leitura sobre o repositório.

#### Evidências Sanitizadas (Trecho Vulnerável)
```yaml
# docker-compose.watchtower.yaml (original)
- REDIS_URL=${REDIS_URL:-rediss://default:[REDACTED_UPSTASH_TOKEN]@endless-satyr-240710.upstash.io:6379}
- CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-[REDACTED_CF_ACCOUNT]}
- CLOUDFLARE_DATABASE_ID=${CLOUDFLARE_DATABASE_ID:-[REDACTED_CF_DATABASE]}
- CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-cfut_[REDACTED_CF_TOKEN]}
- GEMINI_API_KEY=${GEMINI_API_KEY:-AQ.[REDACTED_GEMINI_KEY]}
- ADMIN_EMAIL=${ADMIN_EMAIL:-[REDACTED_EMAIL]}
- ADMIN_PASSWORD=${ADMIN_PASSWORD:-[REDACTED_PASSWORD]}
```

#### Pré-Requisitos para Exploração
Acesso de leitura ao repositório Git ou clone do projeto.

#### Impacto Potencial
* Acesso direto e externo ao banco de dados Cloudflare D1 através da API REST oficial da Cloudflare, contornando a aplicação.
* Consumo arbitrário de tokens de IA faturados na conta do Google Cloud/Gemini.
* Sequestro da instância Redis do Upstash.

#### Recomendação de Correção
1. Substituir todas as credenciais no arquivo versionado pela sintaxe segura `${VAR:-}` sem valores padrão sensíveis.
2. Injetar credenciais estritamente via gerenciador de segredos ou arquivo `.env` não versionado e restrito ao host de produção.
3. **Ação Obrigatória:** Rotacionar imediatamente no painel dos respectivos provedores: API Token da Cloudflare, Chave de API do Gemini e senha do Upstash Redis.

#### Status e Validação
* **Status:** **CORRIGIDO NO CÓDIGO** (Pendente rotação de credenciais nos provedores externos).
* **Evidência de Validação:** O arquivo `docker-compose.watchtower.yaml` foi higienizado e não armazena mais nenhum segredo padrão em texto plano.

---

### SEC-04 — Armazenamento de Senhas em Texto Claro e Comparação Sem Salt Criptográfico

* **Gravidade:** 🔴 CRÍTICO (CVSS v3.1: 8.8 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`)
* **Categoria OWASP:** A02:2021 – Cryptographic Failures
* **CWE:** CWE-256 (Plaintext Storage of Password), CWE-916 (Use of Password Hash With Insufficient Computational Effort)
* **Componente Afetado:** `server/src/routes/auth.ts`, `server/src/db/schema.sql`, `src/services/auth/authService.ts`

#### Descrição Técnica
Na implementação anterior:
* A tabela `user_profiles` possuía o campo `password_hash`, porém o código comparava a string diretamente com a senha informada (`user.password_hash === password`), permitindo e incentivando armazenamento em texto claro.
* Não havia aplicação de algoritmo seguro de derivação de chave com fator de trabalho (work factor / cost) e salt individual aleatório.
* No fallback local do frontend (`authService.ts`), a autenticação apenas verificava se o e-mail existia (`u.email.toLowerCase() === cleanEmail`), ignorando completamente a checagem da senha digitada.

#### Evidências Sanitizadas
```typescript
// server/src/routes/auth.ts (original)
(user.password_hash && user.password_hash === password)
```
```typescript
// src/services/auth/authService.ts (original - fallback local)
const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
if (!user) throw new Error('E-mail ou senha incorretos.');
// Não verificava senha!
```

#### Pré-Requisitos para Exploração
Acesso ao arquivo de banco de dados SQLite local ou execução em modo fallback offline.

#### Impacto Potencial
Comprometimento de credenciais em caso de vazamento da base de dados e facilidade de colisão/reutilização de senhas entre serviços.

#### Recomendação de Correção
Adotar função de derivação de chaves padrão PBKDF2 (com no mínimo 100.000 iterações de HMAC-SHA512 e salt criptográfico de 16 bytes) ou Argon2id, utilizando comparação em tempo constante (`timingSafeEqual`) para evitar ataques de temporização (Timing Attacks).

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Funções `hashPassword` e `verifyPassword` implementadas no módulo `server/src/middlewares/auth.ts`. Ao cadastrar/editar usuários, a senha é automaticamente gravada no formato `salt:key`. Senhas legadas são atualizadas automaticamente no primeiro login bem-sucedido. Testado em `src/tests/serverSecurity.test.ts`.

---

### SEC-05 — Ausência de Gerenciamento de Sessão Seguro e Autenticação Forjável por Cabeçalho HTTP

* **Gravidade:** 🟠 ALTO (CVSS v3.1: 8.1 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`)
* **Categoria OWASP:** A07:2021 – Identification and Authentication Failures
* **CWE:** CWE-287 (Improper Authentication), CWE-290 (Authentication Bypass by Spoofing)
* **Componente Afetado:** `server/src/routes/auth.ts` (`/me`), `src/services/api/cloudflareClient.ts`

#### Descrição Técnica
O endpoint `/api/auth/login` retornava o objeto do usuário sem gerar tokens assinados de sessão (JWT ou Bearer Token assinado com chave secreta do servidor). O endpoint `/api/auth/me` determinava a identidade do usuário através do cabeçalho `x-user-email` ou parâmetro de consulta `?email=`:
```typescript
const email = (req.headers['x-user-email'] as string) || (req.query.email as string);
```
Qualquer agente malicioso na rede podia enviar requisições com `x-user-email: admin@drogaria.com.br` e obter os dados cadastrais, cargo e informações do administrador sem apresentar credencial válida.

#### Pré-Requisitos para Exploração
Conexão HTTP direta aos endpoints do backend.

#### Impacto Potencial
Bypass completo da autenticação e personificação de qualquer usuário do sistema.

#### Recomendação de Correção
Emitir tokens de sessão criptograficamente assinados no login (HMAC-SHA256 com secret interno e expiração de validade). Proteger `/api/auth/me` para responder exclusivamente mediante token válido no cabeçalho `Authorization: Bearer <token>`.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Implementada a geração e validação de tokens em `server/src/middlewares/auth.ts`. O client frontend injeta o Bearer token via `cloudflareClient.ts`. O endpoint `/api/auth/me` agora utiliza o middleware `authenticateToken` e consulta a identidade contida no token validado.

---

### SEC-06 — Cross-Site Scripting Baseado em DOM (DOM XSS) na Renderização de Relatórios de IA

* **Gravidade:** 🟠 ALTO (CVSS v3.1: 7.4 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:L/A:N`)
* **Categoria OWASP:** A03:2021 – Injection
* **CWE:** CWE-79 (Improper Neutralization of Input During Web Page Generation)
* **Componente Afetado:** `src/components/dashboard/AIExecutiveReportCard.tsx` (linhas 138-142 e 364, 389, 414, 446, 461, 588)

#### Descrição Técnica
O componente React responsável por exibir o Parecer Executivo de IA utilizava `dangerouslySetInnerHTML` para renderizar ênfases de Markdown (`**negrito**` e `*itálico*`) através da função `formatInline`:
```typescript
const formatInline = (str: string) => {
  return str
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-on-surface">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-on-surface-variant font-medium">$1</em>');
};
```
A função não sanitizava ou codificava entidades HTML antes da substituição. Como o conteúdo vinha de retornos de IA (que podem ser manipulados via injeção indireta de prompt em observações de atendimentos ou dados cadastrais) ou de análises cacheadas no banco, tags como `<img src=x onerror=...>` ou `<script>` eram inseridas diretamente no DOM do navegador do gestor.

#### Pré-Requisitos para Exploração
Injeção de payload em dados analisados pela IA ou resposta manipulada da LLM.

#### Impacto Potencial
Execução de scripts maliciosos no contexto da sessão da vítima, roubo de dados do `localStorage` (como a sessão ativa do usuário) e defacement da interface.

#### Recomendação de Correção
Aplicar codificação contextual rigorosa de caracteres HTML (`&`, `<`, `>`, `"`, `'`) antes de processar qualquer regex de formatação Markdown.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Adicionada a função defensiva `escapeHtml` em `AIExecutiveReportCard.tsx`. Testes específicos no arquivo `src/tests/serverSecurity.test.ts` validam que payloads contendo `<script>` e `<img onerror=...>` são neutralizados e renderizados com segurança como texto codificado (`&lt;script&gt;`).

---

### SEC-07 — Invalidação Insegura de Certificados TLS na Conexão com Redis

* **Gravidade:** 🟠 ALTO (CVSS v3.1: 7.5 - `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N`)
* **Categoria OWASP:** A05:2021 – Security Misconfiguration / A02:2021 – Cryptographic Failures
* **CWE:** CWE-295 (Improper Certificate Validation)
* **Componente Afetado:** `server/src/middlewares/rateLimiter.ts` (linha 19)

#### Descrição Técnica
Na inicialização do cliente `ioredis`, a propriedade TLS continha:
`tls: isUpstashOrTls ? { rejectUnauthorized: false } : undefined`
Desativar `rejectUnauthorized` permite que a conexão aceite certificados TLS autoassinados, expirados ou forjados por agentes maliciosos na rede, expondo o tráfego a ataques Man-in-the-Middle (MitM).

#### Pré-Requisitos para Exploração
Agente na mesma rede ou controle sobre a rota de tráfego DNS/IP entre a VPS e o provedor Upstash.

#### Impacto Potencial
Interceptação de credenciais transmitidas, manipulação de contadores de Rate Limit e sequestro de sessões armazenadas em cache.

#### Recomendação de Correção
Exigir validação estrita de certificados TLS (`rejectUnauthorized: true`) por padrão, permitindo bypass apenas se uma variável de ambiente expressa de depuração (`REDIS_REJECT_UNAUTHORIZED=false`) for configurada.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Atualizado `server/src/middlewares/rateLimiter.ts` com validação estrita de certificados TLS habilitada por padrão.

---

### SEC-08 — Ausência de Rate Limiting em Operações de IA e Risco de Negação de Serviço Financeira

* **Gravidade:** 🟠 ALTO (CVSS v3.1: 7.5 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`)
* **Categoria OWASP:** A04:2021 – Insecure Design / A05:2021 – Security Misconfiguration
* **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling), CWE-400 (Uncontrolled Resource Consumption)
* **Componente Afetado:** `server/src/routes/ai.ts` (`POST /api/ai/analyze` e `POST /api/ai/test`)

#### Descrição Técnica
O rate limiting estava configurado exclusivamente na rota `/api/auth/login`. Os endpoints `/api/ai/analyze` e `/api/ai/test` estavam totalmente desprotegidos. Um invasor podia disparar milhares de requisições por minuto com parâmetros como `forceRefresh: true` e payloads volumosos, forçando chamadas contínuas à API Google Gemini, causando:
1. Esgotamento das cotas da organização (Denial of Service).
2. Gastos financeiros imprevistos com faturamento de tokens (Denial of Wallet).
3. Degradação de desempenho do Node.js por acúmulo de requisições pendentes.

#### Pré-Requisitos para Exploração
Acesso ao endpoint `/api/ai/analyze`.

#### Impacto Potencial
Prejuízo financeiro direto, indisponibilidade do serviço de inteligência analítica e sobrecarga do servidor.

#### Recomendação de Correção
Implementar rate limiter específico para Inteligência Artificial (`aiRateLimiter`), limitando a taxa de requisições por IP e exigindo autenticação prévia.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Criado e aplicado o middleware `aiRateLimiter` em `server/src/middlewares/rateLimiter.ts` e inserido nas rotas de teste e análise em `server/src/routes/ai.ts`. A chave de API do Gemini também passou a ser transmitida via cabeçalho HTTP (`x-goog-api-key`), e não mais na query string da URL.

---

### SEC-09 — Cabeçalhos de Segurança HTTP Incompletos e Ausência de Content Security Policy (CSP)

* **Gravidade:** 🟡 MÉDIO (CVSS v3.1: 5.4 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N`)
* **Categoria OWASP:** A05:2021 – Security Misconfiguration
* **CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers or Frames), CWE-693 (Protection Mechanism Failure)
* **Componente Afetado:** `server/src/index.ts`, `index.html`

#### Descrição Técnica
A aplicação não configurava os cabeçalhos recomendados pelas diretrizes da OWASP e ASVS:
* Ausência de `Content-Security-Policy` (CSP), deixando a aplicação vulnerável a injeções de scripts e conexões não autorizadas.
* Ausência de `Strict-Transport-Security` (HSTS), permitindo potenciais ataques de SSL Stripping em redes abertas.
* Ausência de `Permissions-Policy`, não restringindo APIs de hardware do navegador.
* Uso de `X-XSS-Protection: 1; mode=block` (cabeçalho depreciado e desaconselhado pelos padrões modernos do W3C).

#### Pré-Requisitos para Exploração
Ataques de engenharia social, injeção de scripts ou presença em redes desprotegidas.

#### Impacto Potencial
Maior facilidade para exploração de vulnerabilidades XSS e abertura a ataques de enquadramento (clickjacking).

#### Recomendação de Correção
Configurar CSP declarativo permitindo apenas origens confiáveis (`'self'`, Google Fonts e domínios de API autorizados), habilitar HSTS com `includeSubDomains` em produção e adicionar `Permissions-Policy`.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Inseridos todos os cabeçalhos defensivos no middleware central em `server/src/index.ts`.

---

### SEC-10 — Configuração Excessivamente Permissiva de CORS e Limite de Payload Elevado

* **Gravidade:** 🟡 MÉDIO (CVSS v3.1: 5.3 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:L`)
* **Categoria OWASP:** A05:2021 – Security Misconfiguration
* **CWE:** CWE-942 (Permissive Cross-origin Resource Sharing Policy), CWE-400 (Uncontrolled Resource Consumption)
* **Componente Afetado:** `server/src/index.ts`

#### Descrição Técnica
1. **CORS:** O servidor utilizava `app.use(cors())` sem restrições, autorizando requisições de qualquer origem da internet (`Origin: *`).
2. **Payload Size:** O body parser estava configurado com limite de `25mb` (`express.json({ limit: '25mb' })`), tamanho desproporcional para uma API REST que trafega apenas dados cadastrais e JSONs estruturados, facilitando ataques de exaustão de memória heap no processo Node.js.

#### Pré-Requisitos para Exploração
Envio de requisições volumosas ou requisições originadas de domínios maliciosos em navegadores de usuários.

#### Impacto Potencial
Negação de serviço na instância do contêiner e facilitação de ataques de CSRF/Cross-Origin.

#### Recomendação de Correção
Restringir o CORS para aceitar apenas origens legítimas (`ALLOWED_ORIGINS` configurável) e reduzir o limite de payload JSON para `2mb`.

#### Status e Validação
* **Status:** **CORRIGIDO**
* **Evidência de Validação:** Atualizado `server/src/index.ts` com validação de origens em produção e limite de 2MB no parser.

---

### SEC-11 — Dependências Vulneráveis com Falhas Conhecidas (SCA - Software Composition Analysis)

* **Gravidade:** 🔵 BAIXO / INFORMATIVO (CVSS v3.1: 3.7 - `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:L`)
* **Categoria OWASP:** A06:2021 – Vulnerable and Outdated Components
* **CWE:** CWE-1395 (Dependency on Vulnerable Third-Party Component)
* **Componente Afetado:** `package.json`, `server/package.json`

#### Descrição Técnica
A auditoria automatizada de pacotes identificou:
* No backend: `body-parser` < 1.20.9 (GHSA-27r3-jxmh-p828) e `qs` < 6.16.0 vulneráveis a DoS.
* No frontend: `xlsx` (SheetJS) afetado por poluição de protótipo (GHSA-4r6h-8v6p-xvw6) e ReDoS (GHSA-5pgg-2g8v-p4x9); dependências de teste e validação (`tinypool`, `vitest`, `zod`).

#### Impacto Potencial
No caso do `xlsx`, a biblioteca é utilizada unicamente na exportação client-side de lançamentos para download em formato Excel (`XLSX.writeFile`), não realizando parsing de arquivos externos enviados por usuários. Portanto, a explorabilidade prática no contexto atual é desprezível.

#### Recomendação de Correção
Executar `npm audit fix` para atualizar dependências transitivas do backend e substituir no futuro a biblioteca `xlsx` por alternativas mantidas ativamente com foco em segurança (como `exceljs`).

#### Status e Validação
* **Status:** **MITIGADO**
* **Evidência de Validação:** Executado `npm audit fix` no backend (`server/package.json`), zerando todas as vulnerabilidades reportadas (`found 0 vulnerabilities`). No frontend, corrigidos os pacotes sem breaking changes.
