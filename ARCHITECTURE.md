# Arquitetura Técnica do Sistema — Apoio ao Tratamento

## 1. Visão Geral da Arquitetura

O sistema **Apoio ao Tratamento** foi refatorado e desenhado seguindo padrões corporativos modernos de engenharia de software, desacoplado de dependências proprietárias da nuvem AWS Amplify. A persistência é baseada no **Cloudflare D1** (SQLite distribuído na rede da Cloudflare), conteinerizado via **Docker** e orquestrado com **Docker Compose**.

---

## 2. Diagrama de Fluxo de Dados e Componentes

```mermaid
flowchart TD
    User([Usuário no Navegador]) -->|HTTP / Porta 3000| Nginx[Frontend: Nginx Alpine Contêiner]
    
    subgraph Frontend Container
        Nginx -->|SPA Static Files| ReactApp[React 18 + Vite + Tailwind CSS]
        Nginx -->|Proxy Reverso /api/*| BackendAPI
    end

    subgraph Backend Container
        BackendAPI[Node.js + Express REST API / Porta 4000]
        BackendAPI -->|Dual Engine D1 Client| D1Driver{Cloudflare Configurada?}
        D1Driver -->|Sim: HTTP REST API| CloudflareD1[(Cloudflare D1 Edge SQL)]
        D1Driver -->|Não: node:sqlite Local| SQLiteFile[(Volume Persistente: /app/data)]
        
        BackendAPI -->|GEMINI_API_KEY Segura| GeminiAPI[Google Gemini 3.6 Flash]
    end

    subgraph Segurança e Governança
        BackendAPI -->|RBAC 403 Forbidden| RBACPolicy[ADMIN vs ATENDENTE]
        BackendAPI -->|Auditoria Imutável| AuditDB[(Tabelas: audit_logs & treatment_support_audits)]
    end
```

---

## 3. Banco de Dados Cloudflare D1

O **Cloudflare D1** opera sob o motor relacional SQLite com conformidade ACID e replicação distribuída.

### 3.1. Estrutura de Tabelas:
1. `user_profiles`: Perfis de usuário, papéis (`ADMIN` / `ATENDENTE`), status ativo e auditoria de login.
2. `attendants`: Cadastro único de atendentes farmacêuticos (`code` único).
3. `treatment_supports`: Registros de apoios ao tratamento, com suporte a **Soft Delete** (`deleted_at`, `deleted_by`) e **Concorrência Otimista** (`version`).
4. `treatment_support_audits`: Trilha de auditoria rastreando antes (`old_value`) e depois (`new_value`) para mutações `CREATE`, `UPDATE`, `DELETE`, `RESTORE`.
5. `goals`: Metas operacionais por loja e por atendente com versionamento temporal.
6. `ai_analyses`: Cache de pareceres analíticos gerados pelo Google Gemini associados a um hash determinístico (`input_hash`).
7. `audit_logs`: Logs de segurança do sistema (autenticação, falhas, redefinição de senhas, alterações de permissão).
8. `system_settings`: Configurações operacionais e credenciais protegidas no backend.

---

## 4. Estratégia de Isolamento e RBAC (Role-Based Access Control)

| Recurso / Rota | Perfil ADMIN | Perfil ATENDENTE | Ação de Bloqueio |
| :--- | :--- | :--- | :--- |
| `/dashboard` | Leitura Completa | Leitura Restrita/Pessoal | 200 OK |
| `/registrar-apoio` | Gravação Permitida | Acesso Proibido | 403 Forbidden |
| `/lancamentos` | CRUD + Soft Delete + Restore | Acesso Proibido | 403 Forbidden |
| `/atendentes` | Cadastro e Ativação | Acesso Proibido | 403 Forbidden |
| `/metas` | Versionamento e Ajuste | Acesso Proibido | 403 Forbidden |
| `/relatorios` | Exportação e Análise | Acesso Proibido | 403 Forbidden |
| `/usuarios` | Criação, Edição, Status e Reset de Senha | Acesso Proibido | 403 Forbidden |
| `/auditoria` | Visualização Total de Trilha | Acesso Proibido | 403 Forbidden |
| `/configuracoes` | Parâmetros, IA e Chaves do Sistema | Acesso Proibido | 403 Forbidden |
| `/perfil` | Visualização e Troca Senha | Visualização e Troca Senha | 200 OK |

---

## 5. Inteligência Artificial com Proteção de Segredos

1. **Persistência Segura**: A chave `GEMINI_API_KEY` é injetada exclusivamente no contêiner do backend (via variáveis de ambiente ou tabela `system_settings`). O frontend nunca tem acesso à credencial em texto plano.
2. **Cálculo Determinístico**: O backend calcula previamente todos os dados estatísticos (volumes, aderência a metas, médias e projeções).
3. **Cache Determinístico**: Se o hash dos dados oficiais calculados (`input_hash`) for idêntico ao registrado em `ai_analyses`, a análise é retornada do cache sem custo adicional de token.
4. **Invalidação Atômica**: Qualquer criação, edição, exclusão ou restauração de apoio invalida instantaneamente o cache analítico do período afetado.

---

## 6. Conteinerização com Docker e Docker Compose

* **Frontend**: Multi-stage build com Node.js 24 Alpine para compilação Vite e Nginx Alpine com proxy reverso e SPA routing.
* **Backend**: Multi-stage build com Node.js 24 Alpine, TypeScript, driver dual Cloudflare D1 e execução com usuário não-root `node`.
* **Healthcheck**: O frontend aguarda a prontidão do backend (`service_healthy`) através do endpoint `/api/health`.
