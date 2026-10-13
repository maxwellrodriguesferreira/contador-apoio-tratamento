# Apoio ao Tratamento — Gestão Clínica, Metas & Inteligência Operacional

Sistema corporativo de alto desempenho projetado para drogarias e redes farmacêuticas para registro, acompanhamento terapêutico, auditoria imutável, cálculo determinístico de metas e análise preditiva por Inteligência Artificial (Google Gemini) de **Apoios ao Tratamento**.

Construído com arquitetura desacoplada e conteinerizada via **Docker & Docker Compose**, suporte nativo ao banco de dados relacional **Cloudflare D1** (Edge SQL), integração a **redes Docker compartilhadas** com proxy reverso Nginx central e publicação de imagens no **Docker Hub**.

---

## 1. Visão Geral e Conceito de Domínio

Um **Apoio ao Tratamento** representa a orientação e inclusão de um paciente em acompanhamento farmacoterapêutico (ex: adesão a antimicrobianos, cronogramas de hipertensão e diabetes, pediatria ou cessação tabágica).

### Separação Rigorosa de Papéis (RBAC):
```text
  ADMINISTRADOR (Carlos / Maxwell)
        │
        │ Registra, edita, exclui ou restaura apoios
        ▼
  Apoio ao Tratamento (Qtd: 10)
        │
        │ Vinculado operacionalmente a
        ▼
  Atendente Farmacêutico (João Silva)
```

* **USUÁRIO DO SISTEMA ≠ ATENDENTE**:
  * **ADMIN**: Único perfil autorizado a lançar, alterar, auditar e excluir apoios, além de configurar metas operacionais, gerenciar usuários e executar diagnósticos por IA.
  * **ATENDENTE**: Acesso restrito em modo **leitura** aos seus indicadores individuais no Dashboard e ao seu perfil.

---

## 2. Arquitetura e Stack Tecnológica (Single Container)

```text
                           INTERNET / NAVEGADOR
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   NGINX PROXY CENTRAL (Host)  │
                    │   (Ex: Nginx Proxy Manager)   │
                    │    Rede: shared-network       │
                    └───────────────┬───────────────┘
                                    │ (http://contador-apoio-app:3000)
                                    ▼
                    ┌───────────────────────────────────────────────┐
                    │   CONTÊINER UNIFICADO (Node.js 24 Alpine)     │
                    │   Imagem: apoio-tratamento:latest             │
                    │   Porta: 3000                                 │
                    │                                               │
                    │  ┌─────────────────┐   ┌───────────────────┐  │
                    │  │  FRONTEND (SPA) │   │  BACKEND (API)    │  │
                    │  │  React 18 Vite  │   │  Express REST     │  │
                    │  │  Tailwind CSS   │   │  Rotas: /api/*    │  │
                    │  └─────────────────┘   └─────────┬─────────┘  │
                    └──────────────────────────────────┼────────────┘
                                                       │
                                    ┌──────────────────┴──────────────────┐
                                    │                                     │
                                    ▼                                     ▼
                       CLOUDFLARE D1 (Edge SQL)                   GOOGLE GEMINI API
                    Dual Engine: Remote REST / Local              (gemini-3.6-flash)
```

### Tecnologias Utilizadas:
* **Frontend Web**: React 18, TypeScript, Vite, Tailwind CSS, Recharts (gráficos), Lucide Icons, Material Symbols, Zod (validação de schemas), XLSX (exportação Excel).
* **Backend Integrado**: Node.js 24, TypeScript, Express (servindo SPA e API unificados), CORS, Driver Dual Cloudflare D1 / SQLite nativo (`node:sqlite`).
* **Banco de Dados (Cloudflare D1)**:
  * Motor relacional SQL com integridade ACID, chaves estrangeiras, concorrência otimista (`version`) e trilha de auditoria (`old_value` / `new_value`).
  * **Dual Engine**: Conexão transparente via **Cloudflare D1 REST API** (produção na nuvem) ou **SQLite nativo** com volume persistente (`contador_apoio_d1_data`) em ambiente local/offline.
  * Tabelas: `user_profiles`, `attendants`, `treatment_supports`, `treatment_support_audits`, `goals`, `ai_analyses`, `audit_logs`, `system_settings`.
* **Inteligência Artificial**: Google Gemini (`gemini-3.6-flash`), com prompts clínicos em PT-BR, chave de API protegida exclusivamente no backend e cache determinístico no banco por hash (`input_hash`).
* **Conteinerização Unificada**: Docker Multi-stage Build em único contêiner, Docker Compose, rede compartilhada externa (`shared_network`) e volume de dados persistente (`d1_sqlite_data`).

---

## 3. Configuração de Ambiente (.env)

O sistema utiliza o arquivo `.env` para carregar todas as variáveis de forma segura. O arquivo `.env` é protegido pelo `.gitignore` e **nunca é commitado nem empacotado na imagem Docker**.

Crie seu arquivo de ambiente a partir do modelo:
```bash
cp .env.example .env
```

### Variáveis Suportadas:

| Variável | Obrigatória? | Descrição | Exemplo / Padrão |
| :--- | :---: | :--- | :--- |
| `DOCKER_SHARED_NETWORK` | Não | Nome da rede Docker compartilhada com o proxy Nginx | `shared-network` |
| `APP_PORT` | Não | Porta de exposição da aplicação no host | `3000` |
| `PORT` | Não | Porta interna do servidor no contêiner | `3000` |
| `CLOUDFLARE_ACCOUNT_ID` | Produção | Account ID da conta no painel Cloudflare | `ef579acea...` |
| `CLOUDFLARE_DATABASE_ID` | Produção | UUID do banco D1 criado na Cloudflare | `9e9cb6e6-...` |
| `CLOUDFLARE_API_TOKEN` | Produção | Token de API com permissão *D1 Edit* | `cfut_...` |
| `GEMINI_API_KEY` | Opcional | Chave da Google Gemini API (Google AI Studio) | `Chave AI Studio` |
| `GEMINI_DEFAULT_MODEL` | Não | Identificador do modelo de IA | `gemini-3.6-flash` |
| `ADMIN_EMAIL` | Sim | E-mail de login do Administrador Geral | `admin@suaempresa.com.br` |
| `ADMIN_PASSWORD` | Sim | Senha forte de acesso do Administrador | `Definida no .env` |
| `ATENDENTE_EMAIL` | Não | E-mail de login do Atendente padrão | `atendente@suaempresa.com.br` |
| `ATENDENTE_PASSWORD` | Não | Senha de acesso do Atendente padrão | `Definida no .env` |

> 💡 **Nota sobre o Banco de Dados**: Se as variáveis `CLOUDFLARE_*` forem omitidas, a aplicação entra automaticamente em modo **Local Engine**, mantendo todos os dados salvos no volume SQLite persistente do Docker (`/app/data`).

---

## 4. Execução Local com Docker Compose

### 4.1. Garantir que a rede compartilhada existe no host:
```bash
docker network create shared-network 2>/dev/null || true
```

### 4.2. Construir imagem e iniciar o contêiner único:
```bash
docker compose up -d --build
```

### 4.3. Verificar saúde do contêiner:
```bash
docker compose ps
```

Saída esperada:
```text
NAME                  SERVICE    STATUS                    PORTS
contador-apoio-app    app        Up (healthy)              0.0.0.0:3000->3000
```

### 4.4. Testar conectividade e healthcheck da API:
```bash
curl http://localhost:3000/api/health
```

Resposta esperada:
```json
{
  "status": "online",
  "system": "Apoio ao Tratamento API",
  "database": {
    "provider": "Cloudflare D1",
    "mode": "cloudflare_remote",
    "isConnected": true
  }
}
```

### 4.5. Acessar a aplicação:
* **Web App**: Abra o navegador em [`http://localhost:3000`](http://localhost:3000)

---

## 5. Publicação no Docker Hub & Deploy em VPS

O serviço unificado está configurado com a imagem oficial:
```text
maxwellrodriguesferreira/apoio-tratamento:latest
```

### 5.1. Compilar e Publicar a Imagem (Na Máquina de Desenvolvimento):
```bash
# 1. Login no Docker Hub
docker login

# 2. Compilar a imagem unificada
docker compose build

# 3. Publicar no Docker Hub
docker push maxwellrodriguesferreira/apoio-tratamento:latest
```

> 🔒 **Segurança**: As variáveis de ambiente do arquivo `.env` **não são embutidas na imagem**. Apenas o código compilado da aplicação é enviado para o Docker Hub.

---

### 5.2. Instalação e Execução na VPS (Servidor de Produção):

1. **Acesse sua VPS via SSH**:
   ```bash
   ssh usuario@ip-da-vps
   ```

2. **Crie o diretório do projeto e copie o `docker-compose.yml`**:
   ```bash
   mkdir -p /opt/apoio-tratamento && cd /opt/apoio-tratamento
   ```

3. **Crie e configure o arquivo `.env` na VPS**:
   ```bash
   nano .env
   ```
   *Cole suas credenciais e salve o arquivo (`Ctrl + O`, `Enter`, `Ctrl + X`).*

4. **Restrinja as permissões do `.env` por segurança**:
   ```bash
   chmod 600 .env
   ```

5. **Garanta a existência da rede Docker compartilhada**:
   ```bash
   docker network create shared-network 2>/dev/null || true
   ```

6. **Baixe a imagem unificada e inicialize o contêiner**:
   ```bash
   docker compose pull
   docker compose up -d
   ```

---

## 6. Integração com Nginx Central / Nginx Proxy Manager

Como a aplicação agora roda em um **único contêiner**, a configuração no Nginx Proxy Manager (NPM) ou proxy reverso na VPS ficou extremamente simples:

### 6.1. No Nginx Proxy Manager (Interface Gráfica):
1. **Details**:
   * **Domain Names**: `apoio.suadrogaria.com.br`
   * **Scheme**: `http`
   * **Forward Hostname / IP**: `contador-apoio-app`
   * **Forward Port**: `3000`
   * Marque: **Block Common Exploits** e **Websockets Support**.
2. **SSL**:
   * Solicite ou selecione seu certificado SSL Let's Encrypt gratuito e marque **Force SSL** e **HTTP/2 Support**.

### 6.2. Exemplo para Nginx Tradicional:
```nginx
server {
    listen 80;
    server_name apoio.suadrogaria.com.br;

    location / {
        proxy_pass http://contador-apoio-app:3000;
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

---

## 7. Testes Automatizados

O projeto conta com suíte de testes unitários e de integração utilizando **Vitest**:

```bash
npm run test
```

### Cobertura dos testes:
* **Cálculo Determinístico de Metas**: Metas diárias, metas mensais e projeção linear proporcional com exclusão de domingos.
* **Integridade de Auditoria (Audit Trail)**: Criação de snapshots `old_value` e `new_value`, validação de soft delete e controle de concorrência (`version`).
* **Segurança e RBAC**: Restrição de acesso entre perfis ADMIN e ATENDENTE, validação de rotas proibidas e autenticação.

---

## 8. Comandos Úteis do Docker Compose

```bash
# Ver logs em tempo real:
docker compose logs -f

# Ver logs apenas do backend:
docker compose logs -f backend

# Reiniciar a aplicação:
docker compose restart

# Parar a aplicação mantendo os dados persistidos:
docker compose down

# Parar e remover volumes locais (atenção):
docker compose down -v
```

---

## 9. Licença e Direitos

Projeto desenvolvido com padrões corporativos de arquitetura de software para Drogarias e Clínicas Farmacêuticas. Todos os direitos reservados.
