# Plano de Remediação de Segurança e Matriz de Ações

**Projeto:** Apoio ao Tratamento  
**Objetivo:** Estabelecer o plano de ação, acompanhamento de correções imediatas e diretrizes de governança de segurança contínua para mitigar todos os riscos identificados na auditoria técnica.  
**Data:** 28 de Outubro de 2026  

---

## 1. Matriz de Priorização de Ações

As ações de remediação foram categorizadas com base no nível de criticidade e facilidade de exploração:

* **P0 — Crítico (Ação Imediata / Blocker):** Falhas que permitem comprometimento total da aplicação, escalada de privilégios ou vazamento massivo de dados.
* **P1 — Alto (Curto Prazo / Até 24h):** Falhas de autenticação, injeções em componentes visuais e configurações inseguras em serviços de suporte.
* **P2 — Médio (Até 7 dias):** Melhorias de arquitetura defensiva, cabeçalhos HTTP, políticas de CORS e mitigação de DoS.
* **P3 — Baixo / Melhoria Contínua (Até 30 dias):** Higienização de pacotes de terceiros e monitoramento contínuo.

---

## 2. Detalhamento das Ações do Plano de Remediação

### [P0 - AÇÃO 01] Implementação de Middleware Obrigatório de Autenticação e RBAC no Backend
* **Vulnerabilidade:** SEC-01 (Broken Access Control nos endpoints `/api/*`)
* **Causa Raiz:** O backend foi desenvolvido presumindo que as restrições aplicadas no frontend React seriam suficientes para garantir a segurança, sem validação no servidor.
* **Ação Executada:**
  1. Criação do módulo `server/src/middlewares/auth.ts`.
  2. Implementação dos middlewares `authenticateToken` e `requireRole`.
  3. Aplicação sistemática dos middlewares em todas as rotas de usuários, atendentes, apoios, metas, auditoria e configurações.
* **Arquivos Envolvidos:**
  * `server/src/middlewares/auth.ts`
  * `server/src/routes/users.ts`
  * `server/src/routes/attendants.ts`
  * `server/src/routes/supports.ts`
  * `server/src/routes/goals.ts`
  * `server/src/routes/audit.ts`
  * `server/src/routes/settings.ts`
  * `server/src/routes/ai.ts`
* **Impacto Esperado:** Eliminação de acessos anônimos e bloqueio de usuários com perfil `ATENDENTE` ao tentar invocar métodos administrativos.
* **Critério de Validação:** Requisições sem token devem retornar HTTP 401; requisições com perfil incompatível devem retornar HTTP 403.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P0 - AÇÃO 02] Eliminação de Credenciais Hardcoded e Backdoor Universal
* **Vulnerabilidade:** SEC-02 (Credenciais estáticas e senha mestre universal em `auth.ts`)
* **Causa Raiz:** Inclusão de contas de teste e senhas padrão de conveniência no código-fonte durante fases iniciais de desenvolvimento.
* **Ação Executada:**
  1. Remoção do e-mail e senha estáticos de administrador em `checkAdminAuth()`.
  2. Remoção da condicional de backdoor `password === 'SenhaForte@2026'`.
  3. Restrição para aceitar credenciais de ambiente unicamente quando as variáveis correspondentes estiverem definidas e não vazias.
* **Arquivos Envolvidos:**
  * `server/src/routes/auth.ts`
* **Impacto Esperado:** Nenhuma conta do sistema poderá ser acessada sem a senha específica do usuário ou credenciais legítimas injetadas no contêiner.
* **Critério de Validação:** Tentativas de login utilizando a senha padrão ou credenciais estáticas não configuradas via variáveis de ambiente devem retornar HTTP 401.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P0 - AÇÃO 03] Higienização de Segredos Expostos em Arquivos de Orquestração
* **Vulnerabilidade:** SEC-03 (Exposição de chaves reais da Cloudflare, Gemini e Redis em `docker-compose.watchtower.yaml`)
* **Causa Raiz:** Definição de credenciais ativas como valores de fallback na interpolação de variáveis do Docker Compose.
* **Ação Executada:**
  1. Higienização do arquivo `docker-compose.watchtower.yaml`, convertendo os valores sensíveis para a sintaxe `${VAR:-}`.
  2. Validação de que arquivos de ambiente `.env` permanecem listados no `.gitignore`.
* **Arquivos Envolvidos:**
  * `docker-compose.watchtower.yaml`
  * `.gitignore`
* **Impacto Esperado:** Prevenção de vazamento de credenciais através do versionamento de código no GitHub / Docker Hub.
* **Critério de Validação:** Execução de varredura estática no repositório confirmando ausência de tokens da Cloudflare ou strings de conexão Redis no histórico de trabalho ativo.
* **Status:** ✅ **CONCLUÍDO NO CÓDIGO** *(Recomendada rotação imediata nos provedores)*

---

### [P0 - AÇÃO 04] Criptografia Segura de Senhas com PBKDF2 e Salt Individual
* **Vulnerabilidade:** SEC-04 (Armazenamento de senhas em texto puro e ausência de algoritmo hash com salt)
* **Causa Raiz:** Persistência direta de strings de senha na tabela `user_profiles` e verificação por igualdade simples.
* **Ação Executada:**
  1. Criação das funções `hashPassword` (PBKDF2 com HMAC-SHA512, 100.000 iterações e salt aleatório de 16 bytes) e `verifyPassword` com comparação em tempo constante (`timingSafeEqual`).
  2. Aplicação de hashing no cadastro e edição de usuários (`server/src/routes/users.ts`).
  3. Mecanismo de migração automática: no primeiro login de usuários legados, o hash é atualizado para PBKDF2.
* **Arquivos Envolvidos:**
  * `server/src/middlewares/auth.ts`
  * `server/src/routes/auth.ts`
  * `server/src/routes/users.ts`
* **Impacto Esperado:** Proteção das credenciais de usuários contra vazamento de base de dados e ataques de força bruta offline baseados em tabelas arco-íris (Rainbow Tables).
* **Critério de Validação:** O valor gravado no banco deve seguir a estrutura `salt:derivedKey` e não coincidir com a senha em texto puro.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P1 - AÇÃO 05] Implementação de Tokens de Sessão Criptograficamente Assinados
* **Vulnerabilidade:** SEC-05 (Autenticação forjável por cabeçalho HTTP e falta de token de sessão)
* **Causa Raiz:** O backend confiava no cabeçalho `x-user-email` sem validação criptográfica.
* **Ação Executada:**
  1. Criação de função para emissão de tokens de sessão autenticados com HMAC-SHA256 e expiração temporal de 7 dias (`generateToken`).
  2. Emissão do token no endpoint `/api/auth/login`.
  3. Atualização do cliente HTTP no frontend (`src/services/api/cloudflareClient.ts`) para transmitir o cabeçalho `Authorization: Bearer <token>`.
  4. Proteção do endpoint `/api/auth/me` para responder exclusivamente mediante token válido.
* **Arquivos Envolvidos:**
  * `server/src/middlewares/auth.ts`
  * `server/src/routes/auth.ts`
  * `src/types/index.ts`
  * `src/services/auth/authService.ts`
  * `src/services/api/cloudflareClient.ts`
* **Impacto Esperado:** Impossibilidade de personificação de usuários através de injeção de cabeçalhos HTTP arbitrários.
* **Critério de Validação:** Requisições contendo apenas cabeçalhos arbitrários sem Bearer token válido devem ser rejeitadas com HTTP 401.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P1 - AÇÃO 06] Mitigação de DOM XSS na Renderização de Pareceres Executivos de IA
* **Vulnerabilidade:** SEC-06 (Uso inseguro de `dangerouslySetInnerHTML` sem escape contextual em `AIExecutiveReportCard.tsx`)
* **Causa Raiz:** Substituição de caracteres Markdown diretamente por HTML sem codificação prévia de entidades HTML.
* **Ação Executada:**
  1. Implementação da função `escapeHtml` para codificar `&`, `<`, `>`, `"`, `'`.
  2. Aplicação do escape prévio em todo o texto antes da inserção de tags `<strong>` e `<em>`.
* **Arquivos Envolvidos:**
  * `src/components/dashboard/AIExecutiveReportCard.tsx`
* **Impacto Esperado:** Neutralização definitiva de injeções de script via IA ou observações de atendimentos.
* **Critério de Validação:** Payloads contendo tags `<script>` e `<img onerror=...>` devem ser renderizados visualmente como texto plano codificado.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P1 - AÇÃO 07] Validação Estrita de Certificados TLS na Conexão com Redis
* **Vulnerabilidade:** SEC-07 (`rejectUnauthorized: false` desativando verificação de certificado TLS)
* **Causa Raiz:** Configuração permissiva inserida para simplificar testes em ambientes de desenvolvimento.
* **Ação Executada:**
  1. Alteração da configuração TLS para exigir validação estrita de certificados (`rejectUnauthorized: true`).
* **Arquivos Envolvidos:**
  * `server/src/middlewares/rateLimiter.ts`
* **Impacto Esperado:** Proteção contra ataques de interceptação de tráfego Man-in-the-Middle (MitM) entre a aplicação e o cluster Redis.
* **Critério de Validação:** Conexões para endpoints `rediss://` devem rejeitar certificados inválidos ou adulterados.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P1 - AÇÃO 08] Proteção Contra DoS e Consumo Abusivo de IA (Rate Limiting)
* **Vulnerabilidade:** SEC-08 (Ausência de rate limiter nos endpoints de IA e API global)
* **Causa Raiz:** Rate limiter configurado unicamente na rota de login.
* **Ação Executada:**
  1. Criação do middleware `aiRateLimiter` (máximo de 30 chamadas por 15 minutos por IP).
  2. Aplicação nas rotas `POST /api/ai/analyze` e `POST /api/ai/test`.
  3. Criação do middleware `apiGeneralRateLimiter` (300 req/min) aplicado a todos os endpoints `/api/*`.
  4. Envio da chave do Gemini via cabeçalho `x-goog-api-key` em vez de query parameter na URL.
* **Arquivos Envolvidos:**
  * `server/src/middlewares/rateLimiter.ts`
  * `server/src/routes/ai.ts`
  * `server/src/index.ts`
* **Impacto Esperado:** Bloqueio de abusos automatizados e prevenção de sobrecarga orçamentária na API Google Cloud.
* **Critério de Validação:** Disparo de requisições acima do limite deve retornar HTTP 429 (`AI_RATE_LIMIT_EXCEEDED`).
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P2 - AÇÃO 09] Endurecimento de Cabeçalhos HTTP e Implementação de CSP
* **Vulnerabilidade:** SEC-09 (Falta de Content Security Policy, HSTS e Permissions-Policy)
* **Causa Raiz:** Configuração mínima padrão de headers no Express.
* **Ação Executada:**
  1. Inclusão de cabeçalho CSP declarativo no Express.
  2. Ativação de HSTS em modo de produção (1 ano com subdomínios).
  3. Inclusão de `Permissions-Policy`.
* **Arquivos Envolvidos:**
  * `server/src/index.ts`
* **Impacto Esperado:** Camada de defesa em profundidade no navegador contra ataques de injeção, clique e downgrade de protocolo.
* **Critério de Validação:** Respostas HTTP devem conter os cabeçalhos `Content-Security-Policy`, `Strict-Transport-Security` e `Permissions-Policy`.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P2 - AÇÃO 10] Restrição de CORS e Redução de Limites de Payload
* **Vulnerabilidade:** SEC-10 (CORS irrestrito e payload JSON de 25MB)
* **Causa Raiz:** Parâmetros padrão permissivos no Express.
* **Ação Executada:**
  1. Limitação de origens permitidas em produção via variável de ambiente `ALLOWED_ORIGINS`.
  2. Redução do limite de JSON no body parser de 25MB para 2MB.
* **Arquivos Envolvidos:**
  * `server/src/index.ts`
* **Impacto Esperado:** Redução do risco de exaustão de memória e controle estrito sobre origens de navegadores autorizadas a interagir com a API.
* **Critério de Validação:** Envio de payload maior que 2MB deve ser rejeitado com HTTP 413 Payload Too Large.
* **Status:** ✅ **CONCLUÍDO E VALIDADO**

---

### [P3 - AÇÃO 11] Gestão e Higienização Contínua de Dependências (SCA)
* **Vulnerabilidade:** SEC-11 (Dependências desatualizadas no ecossistema npm)
* **Causa Raiz:** Ciclo natural de obsolescência de bibliotecas de terceiros.
* **Ação Executada:**
  1. Execução de `npm audit fix` no backend, sanando todas as vulnerabilidades transitivas de `body-parser` e `qs`.
  2. Atualização dos pacotes seguros no frontend.
* **Ação Futura Recomendada:** Avaliar a substituição gradual de `xlsx` por `exceljs` para gerar planilhas sem riscos de poluição de protótipo.
* **Status:** 🟡 **EM ACOMPANHAMENTO / BAIXO RISCO NO CONTEXTO ATUAL**
