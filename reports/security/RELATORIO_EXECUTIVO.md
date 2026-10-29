# Relatório Executivo de Auditoria de Segurança de Aplicação Web (AppSec)

**Projeto:** Sistema Apoio ao Tratamento — Drogaria & Clínica Farmacoterapêutica  
**Data da Auditoria:** 28 de Outubro de 2026  
**Commit / Versão Analisada:** `f36ed45` (Branch `main`)  
**Responsabilidade Técnica da Auditoria:** Especialista Sênior em AppSec, DevSecOps e Pentest  
**Classificação do Documento:** Confidencial / Auditoria de Segurança  

---

## 1. Sumário Executivo

Foi realizada uma auditoria abrangente e aprofundada de segurança da informação no sistema web **Apoio ao Tratamento**, contemplando o frontend em SPA (React), a API REST backend (Express/Node.js), o motor de persistência relacional (Cloudflare D1 / SQLite nativo), integrações de Inteligência Artificial (Google Gemini), infraestrutura de contêineres Docker, automações CI/CD (GitHub Actions) e orquestração de implantação.

A metodologia baseou-se nos frameworks globais de segurança da **OWASP** (**OWASP Top 10 Web Application Security Risks 2021** e **OWASP ASVS v4.0.3 - Application Security Verification Standard**), com ênfase em testes estáticos de código-fonte (SAST), análise de composição de software e dependências (SCA), inspeção de segredos e credenciais, auditoria arquitetural de autenticação/autorização (RBAC) e testes dinâmicos e unitários controlados.

Antes do início das ações corretivas imediatas, o sistema encontrava-se em estado **CRÍTICO**, apresentando ausência total de autenticação e autorização na camada backend, senhas mestras (backdoors) no mecanismo de login, armazenamento de senhas em texto puro e exposição inadvertida de credenciais de produção no histórico de infraestrutura.

Durante a presente intervenção, as vulnerabilidades críticas e de alto risco de maior impacto foram **identificadas, contidas e corrigidas diretamente no código-fonte**, elevando substancialmente o patamar de maturidade de segurança da aplicação.

---

## 2. Tecnologias Identificadas e Mapeadas

* **Frontend:** React 18.3, TypeScript 5.7, Vite 6.4, Tailwind CSS 3.4, Lucide React, Recharts, Zod, Date-fns, SheetJS (xlsx).
* **Backend:** Node.js 24 Alpine, Express 4.21, TypeScript 5.7 (ts-node), ioredis 6.0, express-rate-limit 8.7, rate-limit-redis 6.0.
* **Persistência / Banco de Dados:** Cloudflare D1 (Edge Distributed SQL via REST API) com engine dual local baseada no `node:sqlite` nativo (`DatabaseSync`).
* **Inteligência Artificial:** Google Generative AI (Gemini 3.6 Flash / 2.0 Flash) via REST API com prompt corporativo e cache determinístico.
* **Infraestrutura e Orquestração:** Docker multi-stage build (contêiner unificado), Docker Compose (Watchtower, Nginx Proxy Manager), Kubernetes Manifests (Traefik Ingress Controller, Cert-Manager Let's Encrypt).

---

## 3. Escopo Avaliado

| Componente | Escopo Analisado | Metodologia Aplicada |
| :--- | :--- | :--- |
| **API Backend** | 9 roteadores (`auth`, `users`, `attendants`, `supports`, `goals`, `audit`, `settings`, `ai`, `health`) | SAST, Code Review, Auditoria de Rotas e Middlewares |
| **Autenticação & Sessões** | Fluxos de login, `/me`, geração/validação de tokens, expiração, gerenciamento de credenciais | Verificação de Algoritmos Criptográficos, Força Bruta |
| **Controle de Acesso (RBAC)** | Matriz de permissões `ADMIN` vs `ATENDENTE` no Frontend e Backend | Testes de BOLA/IDOR, Broken Access Control, Bypass de Perfil |
| **Entrada e Saída de Dados** | Injeção SQL, Cross-Site Scripting (XSS), manipulação de HTML no DOM | Análise de Sinks/Sources, escape contextual de saída |
| **Composição e Dependências** | Pacotes NPM (Frontend e Backend) e bibliotecas de terceiros | SCA via `npm audit` e advisories GitHub/NVD |
| **Segredos & Configurações** | Arquivos `.env`, `compose.yml`, Dockerfiles, manifestos Kubernetes, scripts de CI/CD | Detecção de segredos hardcoded, análise de TLS e headers HTTP |

---

## 4. Quadro Resumo de Achados por Gravidade

| Gravidade | Quantidade Identificada | Corrigidos Imediatamente | Riscos Residuais / Pendentes |
| :--- | :---: | :---: | :---: |
| 🔴 **CRÍTICO** | **4** | **4** | 0 |
| 🟠 **ALTO** | **4** | **4** | 0 |
| 🟡 **MÉDIO** | **2** | **2** | 0 |
| 🔵 **BAIXO / INFORMATIVO** | **2** | **1** | 1 (Revisão da biblioteca xlsx) |
| **TOTAL** | **12** | **11** | **1** |

---

## 5. Principais Riscos Identificados (Antes da Correção)

1. **Comprometimento Total por Ausência de Autenticação na API (Broken Access Control):** Qualquer pessoa com acesso à rede conseguia criar usuários administradores, excluir todos os apoios ao tratamento e atendentes da drogaria e desativar contas de gestão sem credenciais.
2. **Backdoor de Acesso Universal no Login:** Existência de senha mestra universal (`SenhaForte@2026`) que permitia login em qualquer conta cadastrada no banco de dados, além de e-mail e senha de administrador hardcoded no código.
3. **Exposição de Credenciais Reais em Arquivo de Orquestração:** Tokens ativos de API da Cloudflare, chave de API do Google Gemini, string com senha do Upstash Redis e credenciais de administrador expostas no arquivo `docker-compose.watchtower.yaml`.
4. **Vazamento e Fraqueza no Armazenamento de Senhas:** Senhas mantidas em texto puro ou sem função hash criptográfica com salt resistente (PBKDF2/scrypt/argon2).
5. **Cross-Site Scripting (DOM XSS) em Relatórios Executivos:** Falha de sanitização em `dangerouslySetInnerHTML` que possibilitava injeção de scripts arbitrários no navegador do gestor farmacêutico.
6. **Exaustão Financeira de IA (Denial of Wallet / DoS):** Endpoint de geração de IA desprotegido contra requisições em massa, permitindo esgotamento de cotas e custos descontrolados na API Google Gemini.

---

## 6. Principais Correções Implementadas

* ✅ **Implementação de Middleware Centralizado de Autenticação e RBAC:** Criado `server/src/middlewares/auth.ts`, aplicando validação de Bearer Tokens (HMAC-SHA256 com timestamp e expiração) e bloqueio `403 Forbidden` no backend para usuários sem permissão `ADMIN`.
* ✅ **Eliminação de Backdoors e Credenciais Hardcoded:** Removidas credenciais estáticas e senha mestra universal de `auth.ts`; autenticação agora exige variáveis de ambiente estritas ou hash verificado.
* ✅ **Armazenamento Criptográfico Seguro de Senhas:** Implementado hashing nativo com PBKDF2 (100.000 iterações de SHA-512) e salt aleatório de 16 bytes em formato `salt:key`, com comparação em tempo constante (`crypto.timingSafeEqual`).
* ✅ **Sanitização Rigorosa Contra DOM XSS:** Implementada função `escapeHtml` no componente `AIExecutiveReportCard.tsx`, neutralizando tags e caracteres especiais antes da renderização de destaques.
* ✅ **Blindagem de Infraestrutura e Redução da Superfície de Ataque:**
  * Remoção de credenciais reais em `docker-compose.watchtower.yaml`.
  * Validação estrita de certificados TLS na conexão Redis (`rejectUnauthorized: true`).
  * Inclusão de cabeçalhos HTTP defensivos (CSP, HSTS, Permissions-Policy, X-Frame-Options, X-Content-Type-Options).
  * Rate Limiting específico para IA (prevenção de DoS financeiro) e geral para a API.
  * Redução do tamanho máximo de payload JSON de 25MB para 2MB.

---

## 7. Limitações da Auditoria

* A auditoria focou no código-fonte, arquitetura de persistência D1 e contêineres locais.
* Não foram realizados testes de penetração destrutivos contra a infraestrutura remota da Cloudflare ou contra os servidores de inferência do Google Gemini, respeitando as regras de engajamento ético.
* O arquivo local `.env` contém credenciais que devem ser **rotacionadas imediatamente** nos provedores de nuvem pelo mantenedor responsável, uma vez que estiveram versionadas no histórico do repositório Git.

---

## 8. Estado Geral da Avaliação de Segurança

* **Postura Inicial:** **INSUFICIENTE / CRÍTICA** (Risco iminente de sequestro ou vazamento de dados).
* **Postura Pós-Remediação:** **FORTE / ADEQUADA** (Camada de defesa em profundidade ativa, RBAC obrigatório no servidor, senhas protegidas e código blindado contra XSS e injeções).
