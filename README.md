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

## 2. Arquitetura e Stack Tecnológica

```text
                           INTERNET / NAVEGADOR
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   NGINX PROXY CENTRAL (Host)  │
                    │   (Ex: Nginx Proxy Manager)   │
                    │    Rede: shared-network       │
                    └───────────────┬───────────────┘
                                    │
                                    ▼ (http://contador-apoio-frontend:80)
                    ┌───────────────────────────────┐
                    │     FRONTEND (Nginx Alpine)   │
                    │   React 18 • Vite • Tailwind  │
                    └───────────────┬───────────────┘
                                    │ (Proxy reverso interno /api/*)
                                    ▼ (http://contador-apoio-backend:4000)
                    ┌───────────────────────────────┐
                    │     BACKEND (Node.js 24 TS)   │
                    │       Express API REST        │
                    │  Docker Hub: apoio-tratamento │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
       CLOUDFLARE D1 (Edge SQL)             GOOGLE GEMINI API
    Dual Engine: Remote REST / Local       (gemini-3.6-flash)
```

### Tecnologias Utilizadas:
* **Frontend Web**: React 18, TypeScript, Vite, Tailwind CSS, Recharts (gráficos), Lucide Icons, Material Symbols, Zod (validação de schemas), XLSX (exportação Excel), Nginx Alpine.
* **Backend API**: Node.js 24, TypeScript, Express, CORS, Driver Dual Cloudflare D1 / SQLite nativo (`node:sqlite`).
* **Banco de Dados (Cloudflare D1)**:
  * Motor relacional SQL com integridade ACID, chaves estrangeiras, concorrência otimista (`version`) e trilha de auditoria (`old_value` / `new_value`).
  * **Dual Engine**: Conexão transparente via **Cloudflare D1 REST API** (produção na nuvem) ou **SQLite nativo** com volume persistente (`contador_apoio_d1_data`) em ambiente local/offline.
  * Tabelas: `user_profiles`, `attendants`, `treatment_supports`, `treatment_support_audits`, `goals`, `ai_analyses`, `audit_logs`, `system_settings`.
* **Inteligência Artificial**: Google Gemini (`gemini-3.6-flash`), com prompts clínicos em PT-BR, chave de API protegida exclusivamente no backend e cache determinístico no banco por hash (`input_hash`).
* **Conteinerização**: Docker Multi-stage Builds, Docker Compose, rede compartilhada externa (`shared_network`) e rede interna isolada (`internal_network`).

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
| `FRONTEND_PORT` | Não | Porta de exposição do Frontend no host | `3000` |
| `BACKEND_PORT` | Não | Porta de exposição da API Backend no host | `4000` |
| `CLOUDFLARE_ACCOUNT_ID` | Produção | Account ID da conta no painel Cloudflare | `ef579acea...` |
| `CLOUDFLARE_DATABASE_ID` | Produção | UUID do banco D1 criado na Cloudflare | `9e9cb6e6-...` |
| `CLOUDFLARE_API_TOKEN` | Produção | Token de API com permissão *D1 Edit* | `cfut_...` |
| `GEMINI_API_KEY` | Opcional | Chave da Google Gemini API (Google AI Studio) | `Chave AI Studio` |
| `GEMINI_DEFAULT_MODEL` | Não | Identificador do modelo de IA | `gemini-3.6-flash` |
| `ADMIN_EMAIL` | Sim | E-mail de login do Administrador Geral | `admin@suaempresa.com.br` |
| `ADMIN_PASSWORD` | Sim | Senha forte de acesso do Administrador | `Definida no .env` |
| `ATENDENTE_EMAIL` | Não | E-mail de login do Atendente padrão | `atendente@suaempresa.com.br` |
| `ATENDENTE_PASSWORD` | Não | Senha de acesso do Atendente padrão | `Definida no .env` |

> 💡 **Nota sobre o Banco de Dados**: Se as variáveis `CLOUDFLARE_*` forem omitidas, o backend entra automaticamente em modo **Local Engine**, mantendo todos os dados salvos no volume SQLite persistente do Docker.

---

## 4. Execução Local com Docker Compose

### 4.1. Garantir que a rede compartilhada existe no host:
```bash
docker network create shared-network 2>/dev/null || true
```

### 4.2. Construir imagens e iniciar contêineres:
```bash
docker compose up -d --build
```

### 4.3. Verificar saúde dos contêineres:
```bash
docker compose ps
```

Saída esperada:
```text
NAME                      SERVICE    STATUS                    PORTS
contador-apoio-backend    backend    Up (healthy)              0.0.0.0:4000->4000
contador-apoio-frontend   frontend   Up                        0.0.0.0:3000->80
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

O serviço backend está configurado com a imagem:
```text
maxwellrodriguesferreira/apoio-tratamento:latest
```

### 5.1. Compilar e Publicar a Imagem (Na Máquina de Desenvolvimento):
```bash
# 1. Login no Docker Hub
docker login

# 2. Compilar a imagem com a tag oficial
docker compose build backend

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

6. **Baixe as imagens e inicialize os serviços**:
   ```bash
   docker compose pull
   docker compose up -d
   ```

---

## 6. Integração com Nginx Central / Nginx Proxy Manager

Se você utiliza um proxy central compartilhado (ex: Nginx tradicional, Traefik ou Nginx Proxy Manager) na VPS:

1. Conecte o container do Nginx Proxy à mesma rede `shared-network`.
2. Configure o Upstream apontando para o container frontend:
   * **Host / Upstream**: `contador-apoio-frontend`
   * **Porta**: `80`
   * **Esquema**: `http`

### Exemplo de bloco Nginx:
```nginx
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
*(O container `contador-apoio-frontend` já inclui o proxy interno para `/api/*` apontando para o backend).*

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
