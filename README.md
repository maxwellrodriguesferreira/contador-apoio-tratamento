# Apoio ao Tratamento — Gestão, Acompanhamento Clínico & Inteligência Operacional

Sistema web corporativo completo projetado para drogarias e redes farmacêuticas para registro, acompanhamento, auditoria imutável, cálculo determinístico de metas e análise preditiva por Inteligência Artificial (Google Gemini) de **Apoios ao Tratamento**.

Totalmente conteinerizado com **Docker & Docker Compose**, integrado a **redes Docker compartilhadas** com proxy reverso Nginx central e suporte nativo ao banco de dados **Cloudflare D1**.

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
               INTERNET / NAVEGADOR
                       │
                       ▼
       ┌───────────────────────────────┐
       │   NGINX PROXY CENTRAL (Host)  │
       │    (Rede Docker Compartilhada) │
       └───────────────┬───────────────┘
                       │
                       ▼ (http://contador-apoio-frontend:80)
       ┌───────────────────────────────┐
       │     FRONTEND (Nginx Alpine)   │
       │   React 18 • Vite • Tailwind  │
       └───────────────┬───────────────┘
                       │ (proxy /api/*)
                       ▼ (http://backend:4000)
       ┌───────────────────────────────┐
       │     BACKEND (Node.js + TS)    │
       │     API REST • Express        │
       └───────────────┬───────────────┘
                       │
       ┌───────────────┴───────────────┐
       │                               │
       ▼                               ▼
  CLOUDFLARE D1 (Edge SQL)      GOOGLE GEMINI API
 (Dual Engine: Remote / Local)  (gemini-3.6-flash)
```

### Tecnologias:
* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide Icons, Material Symbols, Zod, XLSX, Nginx Alpine.
* **Backend**: Node.js 24, TypeScript, Express, CORS, Driver Dual Cloudflare D1 / SQLite nativo.
* **Banco de Dados (Cloudflare D1)**:
  * Motor relacional SQL com integridade ACID, soft delete, concorrência otimista (`version`) e trilha de auditoria (`old_value` / `new_value`).
  * Suporte dual transparente: **Cloudflare D1 Edge REST API** (produção) e **SQLite nativo** com volume persistente (execução local / offline).
* **Inteligência Artificial**: Google Gemini (`gemini-3.6-flash`), com prompt corporativo em PT-BR, chave protegida exclusivamente no backend (`GEMINI_API_KEY`) e cache determinístico no Cloudflare D1 por hash (`input_hash`).
* **Conteinerização & Rede**: Docker Multi-stage Builds, Docker Compose com suporte a **rede externa compartilhada** (`shared_network`) e rede interna isolada (`internal_network`).

---

## 3. Variáveis de Ambiente (.env)

Copie o arquivo de exemplo para configurar seu ambiente:
```bash
cp .env.example .env
```

| Variável | Descrição | Padrão / Exemplo |
| :--- | :--- | :--- |
| `DOCKER_SHARED_NETWORK` | Nome da rede docker externa compartilhada com o Nginx Proxy | `shared-network` |
| `FRONTEND_PORT` | Porta de mapeamento do Frontend no host (opcional) | `3000` |
| `BACKEND_PORT` | Porta de mapeamento do Backend no host (opcional) | `4000` |
| `CLOUDFLARE_ACCOUNT_ID` / `CF_ACCOUNT_ID` | Account ID da Cloudflare (opcional em modo local) | `ID da conta Cloudflare` |
| `CLOUDFLARE_DATABASE_ID` / `CF_D1_DB_ID` | Database ID do Cloudflare D1 | `UUID do banco D1` |
| `CLOUDFLARE_API_TOKEN` / `CF_D1_TOKEN` | API Token da Cloudflare com permissão D1 Edit | `Token gerado no painel` |
| `GEMINI_API_KEY` | Chave da Google Gemini API (Google AI Studio) | `Chave obtida no AI Studio` |
| `GEMINI_DEFAULT_MODEL` | Modelo padrão de IA | `gemini-3.6-flash` |
| `ADMIN_EMAIL` / `APP_ADMIN_MAIL` | E-mail de login do Administrador | `admin@suaempresa.com.br` |
| `ADMIN_PASSWORD` / `APP_ADMIN_PASS` | Senha de login do Administrador | `Definir senha segura no .env` |
| `ATENDENTE_EMAIL` | E-mail de login do Atendente | `atendente@suaempresa.com.br` |
| `ATENDENTE_PASSWORD` | Senha de login do Atendente | `Definir senha segura no .env` |

---

## 4. Integração com a Rede Docker Compartilhada & Proxy Nginx Central

### 4.1. Garantir que a rede compartilhada existe
Se você já possui uma rede docker compartilhada (ex: `shared-network`, `proxy-network` ou `nginx-proxy`), certifique-se de que ela está criada:
```bash
docker network create shared-network
```
*(Caso use outro nome de rede, basta definir `DOCKER_SHARED_NETWORK=seu_nome_de_rede` no `.env`)*.

### 4.2. Configuração do Proxy Nginx Central (Upstream)
No container ou servidor do seu Nginx Proxy compartilhado (ex: Nginx Proxy Manager, Traefik ou Nginx tradicional), adicione a rota para o container do frontend:

```nginx
# Exemplo de bloco no Nginx Proxy Central do host:
server {
    listen 80;
    server_name apoio.suadrogaria.com.br;

    location / {
        proxy_pass http://contador-apoio-frontend:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
> O container `contador-apoio-frontend` já inclui o proxy reverso interno automático para a rota `/api/*` encaminhando para o container `contador-apoio-backend:4000`. Portanto, seu Nginx central só precisa apontar para `http://contador-apoio-frontend:80`.

---

## 5. Execução com Docker Compose

### 5.1. Iniciar a aplicação:
```bash
docker compose up -d
```

### 5.2. Verificar status dos contêineres:
```bash
docker compose ps
```

### 5.3. Logs dos serviços:
```bash
docker compose logs -f
```

### 5.4. Parar a aplicação:
```bash
docker compose down
```

---

## 6. Autenticação e Perfis de Acesso
 
 As credenciais de acesso padrão são definidas e gerenciadas com segurança através das variáveis de ambiente no arquivo `.env` (ou injetadas em tempo de execução no contêiner):
 
 * **Administrador Geral (ADMIN)**:
   * **E-mail**: Definido via `APP_ADMIN_MAIL` ou `ADMIN_EMAIL` no `.env`
   * **Senha**: Definida via `APP_ADMIN_PASS` ou `ADMIN_PASSWORD` no `.env`
   * **Permissões**: Acesso irrestrito a todas as áreas operacionais, registros clínicos, gestão de metas, auditoria imutável, análises por IA e controle de usuários.
 
 * **Atendente Farmacêutico (ATENDENTE)**:
   * **E-mail**: Definido via `ATENDENTE_EMAIL` no `.env`
   * **Senha**: Definida via `ATENDENTE_PASSWORD` no `.env`
   * **Permissões**: Acesso exclusivo em modo somente leitura aos seus indicadores no Dashboard e ao Meu Perfil.

---

## 7. Testes Automatizados

```bash
npm run test
```

---

## 8. Licença
Propriedade de Drogaria Central & Clínica Farmacoterapêutica. Todos os direitos reservados.
