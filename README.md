# Apoio ao Tratamento — Gestão, Acompanhamento Clínico & Inteligência Operacional

Sistema web corporativo completo projetado para drogarias e redes farmacêuticas para registro, acompanhamento, auditoria imutável, cálculo determinístico de metas e análise preditiva por Inteligência Artificial (Google Gemini) de **Apoios ao Tratamento**.

Totalmente conteinerizado com **Docker & Docker Compose** e com suporte nativo a banco de dados **Cloudflare D1**.

---

## 1. Visão Geral e Conceito

Um **Apoio ao Tratamento** representa a situação em que um cliente/paciente de drogaria é orientado e cadastrado para acompanhamento farmacoterapêutico (ex: antibioticoterapia, hipertensão, diabetes, pediatria).

### Princípio Fundamental de Separação de Papéis:
```text
ADMIN (Carlos)
     │
     │ registra apoio
     ▼
Apoio ao Tratamento = 10
     │
     │ atribuído a
     ▼
Atendente (João Silva)
```
* **USUÁRIO DO SISTEMA ≠ ATENDENTE**: O atendente não lança apoios. Quem registra, edita, exclui ou restaura é o perfil **ADMIN**. O **ATENDENTE** possui acesso exclusivamente em modo leitura aos seus indicadores e aos dados consolidados no Dashboard.

---

## 2. Arquitetura e Stack Tecnológica

```text
                     USUÁRIO (Navegador)
                             │
                             ▼
               ┌───────────────────────────┐
               │    FRONTEND (Porta 3000)  │
               │  Nginx Alpine • React 18  │
               │ Vite • Tailwind • Recharts│
               └─────────────┬─────────────┘
                             │
                     (proxy /api/*)
                             │
                             ▼
               ┌───────────────────────────┐
               │    BACKEND (Porta 4000)   │
               │   Node.js • Express • TS  │
               └─────────────┬─────────────┘
                             │
             ┌───────────────┴───────────────┐
             │                               │
             ▼                               ▼
    CLOUDFLARE D1 (Edge SQL)          GOOGLE GEMINI API
 (Dual Engine: Remote / Local)       (gemini-3.6-flash)
```

### Tecnologias:
* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide Icons, Material Symbols, Zod, XLSX, Nginx Alpine.
* **Backend**: Node.js 24, TypeScript, Express, CORS, Driver Dual Cloudflare D1 / SQLite nativo.
* **Banco de Dados (Cloudflare D1)**:
  * Motor relacional SQL com integridade ACID, soft delete, concorrência otimista (`version`) e trilha de auditoria (`old_value` / `new_value`).
  * Suporte dual transparente: **Cloudflare D1 Edge REST API** (produção) e **SQLite nativo** com volume persistente (execução local / offline).
* **Inteligência Artificial**: Google Gemini (`gemini-3.6-flash`), com prompt corporativo em PT-BR, chave protegida exclusivamente no backend (`GEMINI_API_KEY`) e cache determinístico no Cloudflare D1 por hash (`input_hash`).
* **Conteinerização**: Docker Multi-stage Builds e Docker Compose com healthcheck integrado.

---

## 3. Variáveis de Ambiente (.env)

Copie o arquivo de exemplo para configurar seu ambiente:
```bash
cp .env.example .env
```

| Variável | Descrição | Padrão / Exemplo |
| :--- | :--- | :--- |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID da Cloudflare (opcional em modo local) | `ex: 9a8b7c6d...` |
| `CLOUDFLARE_DATABASE_ID` | Database ID do Cloudflare D1 | `ex: 1234-abcd-...` |
| `CLOUDFLARE_API_TOKEN` | API Token da Cloudflare com permissão D1 Edit | `Bearer token` |
| `GEMINI_API_KEY` | Chave da Google Gemini API (Google AI Studio) | `AIzaSy...` |
| `GEMINI_DEFAULT_MODEL` | Modelo padrão de IA | `gemini-3.6-flash` |
| `ADMIN_EMAIL` | E-mail de login do Administrador | `carlos.admin@drogaria.com.br` |
| `ADMIN_PASSWORD` | Senha de login do Administrador | `SenhaForte@2026` |
| `ATENDENTE_EMAIL` | E-mail de login do Atendente | `joao.silva@drogaria.com.br` |
| `ATENDENTE_PASSWORD` | Senha de login do Atendente | `SenhaForte@2026` |
| `PORT` | Porta interna da API | `4000` |

> [!NOTE]
> Se as credenciais da Cloudflare não forem preenchidas, a aplicação inicia automaticamente com a engine local SQLite compatível 1:1 com o Cloudflare D1, populando as tabelas e dados iniciais no volume persistente.

---

## 4. Execução com Docker e Docker Compose

### 4.1. Iniciar a aplicação completa:
```bash
docker compose up -d --build
```

### 4.2. Verificar status dos contêineres:
```bash
docker compose ps
```

### 4.3. Visualizar logs em tempo real:
```bash
# Logs de todos os serviços
docker compose logs -f

# Logs exclusivos do backend
docker compose logs -f backend
```

### 4.4. Parar a aplicação:
```bash
docker compose down
```

A aplicação estará acessível em:
* **Frontend Web**: `http://localhost:3000`
* **Backend API & Healthcheck**: `http://localhost:4000/api/health`

---

## 5. Credenciais Padrão de Acesso (E-mail e Senha)

* **Administrador Geral (ADMIN)**:
  * **E-mail**: `carlos.admin@drogaria.com.br` (ou configurado em `ADMIN_EMAIL`)
  * **Senha**: `SenhaForte@2026` (ou configurada em `ADMIN_PASSWORD`)
  * **Permissões**: Acesso completo a todas as rotas, lançamentos, auditoria, atendentes, metas, IA e configurações.

* **Atendente Farmacêutico (ATENDENTE)**:
  * **E-mail**: `joao.silva@drogaria.com.br` (ou configurado em `ATENDENTE_EMAIL`)
  * **Senha**: `SenhaForte@2026` (ou configurada em `ATENDENTE_PASSWORD`)
  * **Permissões**: Acesso exclusivo em modo somente leitura ao Dashboard e Meu Perfil.

---

## 6. Desenvolvimento Local e Testes (Sem Docker)

Caso queira rodar diretamente no Node.js local:

```bash
# 1. Instalar dependências
npm install
cd server && npm install && cd ..

# 2. Executar os testes automatizados
npm run test

# 3. Iniciar o backend (porta 4000)
cd server && npm run dev

# 4. Iniciar o frontend em outro terminal (porta 3000)
npm run dev
```

---

## 7. Licença
Propriedade de Drogaria Central & Clínica Farmacoterapêutica. Todos os direitos reservados.
