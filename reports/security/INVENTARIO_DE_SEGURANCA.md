# Inventário de Segurança e Mapeamento de Superfície de Ataque

**Aplicação:** Apoio ao Tratamento  
**Ambiente Analisado:** Código-Fonte, API REST Backend, Frontend SPA, Manifestos Docker/Kubernetes  
**Data:** 28 de Outubro de 2026  

---

## 1. Mapeamento de Rotas e Endpoints da API REST

| Rota / Endpoint | Método | Requer Autenticação? | Papéis Autorizados (RBAC) | Finalidade do Endpoint | Proteções Implementadas |
| :--- | :---: | :---: | :---: | :--- | :--- |
| `/api/health` | GET | Não | Qualquer / Monitoramento | Verificação de disponibilidade da API e do banco D1 | Header de segurança |
| `/api/auth/login` | POST | Não | Público | Autenticação por e-mail e senha, emissão de token Bearer | Rate Limiter (Brute-Force), Sanitização |
| `/api/auth/me` | GET | **Sim** | ADMIN, ATENDENTE | Obtenção do perfil da sessão ativa baseado no token | Bearer Token Validation, DB active check |
| `/api/users` | GET | **Sim** | ADMIN | Listagem de todos os usuários do sistema | Bearer Token + RBAC `ADMIN` |
| `/api/users` | POST | **Sim** | ADMIN | Cadastro de novos usuários e papéis | Bearer Token + RBAC + PBKDF2 Hash |
| `/api/users/:id` | PUT | **Sim** | ADMIN | Atualização de perfil, status e permissões | Bearer Token + RBAC + Anti Self-Disable |
| `/api/users/:id` | DELETE | **Sim** | ADMIN | Exclusão definitiva de usuário | Bearer Token + RBAC + Anti Self-Delete |
| `/api/attendants` | GET | **Sim** | ADMIN, ATENDENTE | Listagem de atendentes farmacêuticos ativos/inativos | Bearer Token |
| `/api/attendants` | POST | **Sim** | ADMIN | Cadastro de novos atendentes com código único | Bearer Token + RBAC `ADMIN` |
| `/api/attendants/:id` | PUT | **Sim** | ADMIN | Atualização de dados e código do atendente | Bearer Token + RBAC `ADMIN` |
| `/api/attendants/:id` | DELETE | **Sim** | ADMIN | Exclusão do atendente e desvinculação referencial | Bearer Token + RBAC `ADMIN` |
| `/api/supports` | GET | **Sim** | ADMIN, ATENDENTE | Listagem de apoios ao tratamento (ativos ou deletados) | Bearer Token |
| `/api/supports` | POST | **Sim** | ADMIN | Registro de novo apoio ao tratamento | Bearer Token + RBAC + Server-Side Identity |
| `/api/supports/:id` | PUT | **Sim** | ADMIN | Edição de quantidade/observação e controle de concorrência | Bearer Token + RBAC + Concorrência Otimista |
| `/api/supports/:id` | DELETE | **Sim** | ADMIN | Exclusão suave (Soft Delete) do apoio | Bearer Token + RBAC `ADMIN` |
| `/api/supports/:id/restore`| POST | **Sim** | ADMIN | Restauração de apoio previamente excluído | Bearer Token + RBAC `ADMIN` |
| `/api/goals` | GET | **Sim** | ADMIN, ATENDENTE | Consulta de metas operacionais diárias/mensais | Bearer Token |
| `/api/goals` | POST | **Sim** | ADMIN | Cadastro e versionamento de novas metas | Bearer Token + RBAC `ADMIN` |
| `/api/goals/:id` | PUT | **Sim** | ADMIN | Ajuste de parâmetros de metas | Bearer Token + RBAC `ADMIN` |
| `/api/goals/:id` | DELETE | **Sim** | ADMIN | Exclusão de meta operacional | Bearer Token + RBAC `ADMIN` |
| `/api/audit/logs` | GET | **Sim** | ADMIN | Visualização da trilha global de auditoria | Bearer Token + RBAC `ADMIN` |
| `/api/audit/logs` | POST | **Sim** | ADMIN, ATENDENTE | Registro de evento de auditoria pelo sistema | Bearer Token + Server-Side User Injection |
| `/api/audit/supports` | GET | **Sim** | ADMIN | Histórico detalhado de mutações (old/new value) | Bearer Token + RBAC `ADMIN` |
| `/api/audit/supports` | POST | **Sim** | ADMIN | Registro de mutação de apoio | Bearer Token + RBAC `ADMIN` |
| `/api/settings` | GET | **Sim** | ADMIN | Consulta de configurações gerais e status da IA | Bearer Token + RBAC `ADMIN` |
| `/api/settings` | PUT | **Sim** | ADMIN | Atualização de configurações operacionais da loja | Bearer Token + RBAC `ADMIN` |
| `/api/settings/gemini-key` | POST | **Sim** | ADMIN | Cadastro de chave de API Google Gemini no banco | Bearer Token + RBAC `ADMIN` |
| `/api/settings/gemini-key` | DELETE | **Sim** | ADMIN | Remoção da chave de API do banco | Bearer Token + RBAC `ADMIN` |
| `/api/ai/test` | POST | **Sim** | ADMIN, ATENDENTE | Teste de conectividade com a API Google Gemini | Bearer Token + AI Rate Limiter + Header Auth |
| `/api/ai/analyze` | POST | **Sim** | ADMIN, ATENDENTE | Geração de Parecer Executivo por Inteligência Artificial | Bearer Token + AI Rate Limiter + Model Whitelist |

---

## 2. Matriz de Controle de Acesso Baseado em Papéis (RBAC Matrix)

| Funcionalidade / Recurso | Visitante Não Autenticado | Perfil ATENDENTE | Perfil ADMIN | Comportamento no Servidor |
| :--- | :---: | :---: | :---: | :--- |
| **Acesso à Interface de Login** | Permitido | Redireciona Dashboard | Redireciona Dashboard | 200 OK |
| **Dashboard Operacional** | Bloqueado | Leitura Permitida | Leitura Permitida | 200 OK |
| **Registrar Apoio ao Tratamento** | Bloqueado (401) | **Bloqueado (403)** | **Permitido (201)** | 403 Forbidden para Atendente |
| **Editar Apoio ao Tratamento** | Bloqueado (401) | **Bloqueado (403)** | **Permitido (200)** | 403 Forbidden para Atendente |
| **Excluir / Restaurar Apoio** | Bloqueado (401) | **Bloqueado (403)** | **Permitido (200)** | 403 Forbidden para Atendente |
| **Gestão de Atendentes** | Bloqueado (401) | Leitura Apenas (200) | CRUD Total (200/201) | 403 em POST/PUT/DELETE para Atendente |
| **Gestão de Metas da Drogaria** | Bloqueado (401) | Leitura Apenas (200) | CRUD Total (200/201) | 403 em POST/PUT/DELETE para Atendente |
| **Gestão de Usuários e Senhas** | Bloqueado (401) | **Bloqueado (403)** | CRUD Total (200/201) | 403 Forbidden total para Atendente |
| **Trilha de Auditoria do Sistema** | Bloqueado (401) | **Bloqueado (403)** | Leitura Total (200) | 403 Forbidden para Atendente em GET |
| **Configurações e Chaves de IA** | Bloqueado (401) | **Bloqueado (403)** | Acesso Total (200) | 403 Forbidden para Atendente |
| **Geração de Pareceres por IA** | Bloqueado (401) | Permitido (Com Limite) | Permitido (Com Limite)| Rate limit 30 req / 15 min |

---

## 3. Mecanismos de Autenticação e Criptografia

1. **Assinatura de Sessão:** HMAC-SHA256 gerado a partir de chave secreta no servidor (`JWT_SECRET` / `APP_SECRET`), com timestamp de criação (`iat`) e expiração obrigatória (`exp` = 7 dias). Formato padrão `header.payload.signature`.
2. **Derivação de Senhas (Hashing):** Algoritmo PBKDF2 nativo do Node.js (`crypto.pbkdf2Sync`) configurado com:
   * Função pseudo-aleatória: HMAC-SHA512
   * Fator de trabalho: 100.000 iterações
   * Salt: 16 bytes aleatórios criptograficamente seguros (`crypto.randomBytes(16)`)
   * Formato de armazenamento: `salt:derivedKeyHex`
   * Comparação: Tempo constante via `crypto.timingSafeEqual` para mitigação de Timing Attacks.
3. **Credenciais em Trânsito:** Chave de API do Gemini transmitida no cabeçalho seguro `x-goog-api-key`, evitando exposição em URLs e logs de proxies.

---

## 4. Tecnologias, Bibliotecas e Ferramentas Utilizadas

| Categoria | Tecnologia / Ferramenta | Finalidade | Avaliação de Segurança |
| :--- | :--- | :--- | :--- |
| **Linguagem & Runtime** | Node.js v24.19.0 LTS | Servidor e execução de scripts | Suporte a primitivas modernas (`node:crypto`, `node:sqlite`) |
| **Framework Backend** | Express v4.21.2 | Roteamento REST e middlewares | Endurecido com Rate Limiting e Headers |
| **Taxa de Requisições** | Express-Rate-Limit v8.7.1 | Limitação de requisições | Integrado a Redis e memória local |
| **Armazenamento de Cache** | Ioredis v6.0.0 + Upstash | Gerenciamento distribuído de Rate Limit | TLS estrito ativado |
| **Persistência Relacional** | Cloudflare D1 / SQLite nativo | Armazenamento de dados | Consultas parametrizadas (anti SQLi) |
| **Frontend Framework** | React v18.3.1 + Vite v6.4.5 | Interface SPA | JSX com escape automático e sem uso indevido de innerHTML |
| **Auditoria de Dependências** | `npm audit` / GitHub Advisory | Análise de composição de software (SCA)| Executada no frontend e backend |
| **Testes de Segurança** | Vitest v3.0.5 | Execução de testes automatizados | Suíte `serverSecurity.test.ts` implementada |

---

## 5. Áreas Examinadas

* Toda a camada de roteamento e middlewares Express em `server/src/`.
* Módulos de persistência D1 e schema SQL em `server/src/db/`.
* Serviços de autenticação e controle de sessão em `src/services/auth/` e `src/contexts/`.
* Componentes de renderização de conteúdo externo e IA em `src/components/dashboard/`.
* Manifestos de implantação Docker Compose (`compose.yml`, `docker-compose.watchtower.yaml`, `docker-compose.yaml`).
* Arquivos de configuração de proxy (`nginx.conf`).
* Pipelines de integração e entrega contínua em `.github/workflows/deploy.yml`.
* Manifestos Kubernetes em `k8s/` (`deployment.yaml`, `ingress.yaml`, `service.yaml`, `secret.example.yaml`).

---

## 6. Áreas Não Verificadas (Limitações do Escopo)

* **Infraestrutura Cloudflare Edge SQL Remota:** A API da Cloudflare foi inspecionada do ponto de vista da aplicação consumidora (chamadas REST e tokens). Não foram realizados testes de intrusão contra os servidores físicos da Cloudflare.
* **Instância Gerenciada Upstash Redis:** Apenas a configuração de conexão e certificados foi avaliada; o painel web administrativo do Upstash está fora do escopo.
* **Provedor Let's Encrypt / Cert-Manager Externo:** O manifesto de emissão foi avaliado sintaticamente; a validação real do desafio ACME depende do apontamento DNS em produção.
