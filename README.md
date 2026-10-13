# Apoio ao Tratamento — Gestão Clínica, Metas & Inteligência Operacional

Sistema corporativo de alto desempenho projetado para drogarias e redes farmacêuticas para registro, acompanhamento terapêutico, auditoria imutável, cálculo determinístico de metas e análise preditiva por Inteligência Artificial (Google Gemini) de **Apoios ao Tratamento**.

Construído com arquitetura moderna e conteinerizada em **Contêiner Único (*Single Container*)** via **Docker & Docker Compose**, suporte nativo ao banco de dados relacional **Cloudflare D1** (Edge SQL), integração à rede Docker compartilhada **`rede-proxy`** com **Nginx Proxy Manager** e publicação de imagens no **Docker Hub**.

---

> 📖 **Guia Completo de Deploy na VPS**:
> Para o passo a passo detalhado da instalação do Nginx Proxy Manager, configuração de DNS na Hostinger e emissão de certificados SSL gratuitos (Let's Encrypt), consulte o manual dedicado:
> 👉 **[MANUAL_DEPLOY_VPS_NPM.md](MANUAL_DEPLOY_VPS_NPM.md)** *(ou o PDF complementar `MANUAL_DEPLOY_VPS_NPM.pdf`)*.

---

## 1. Visão Geral e Conceito de Domínio

Um **Apoio ao Tratamento** representa a orientação e inclusão de um paciente em acompanhamento farmacoterapêutico (ex: adesão a antimicrobianos, cronogramas de hipertensão e diabetes, pediatria ou cessação tabágica).

### Separação Rigorosa de Papéis (RBAC):
```text
  ADMINISTRADOR (Acesso Total)
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
  * **ADMIN**: Perfil com privilégio total para lançar, alterar, auditar e excluir apoios, além de configurar metas operacionais, gerenciar usuários, visualizar auditoria e executar diagnósticos por IA.
  * **ATENDENTE**: Acesso restrito em modo **leitura** aos seus indicadores individuais no Dashboard e ao seu perfil.

---

## 2. Arquitetura Técnica e Stack Tecnológica (Single Container)

A aplicação foi refatorada e unificada em um **único contêiner**, eliminando a necessidade de contêineres separados para frontend e backend, reduzindo o consumo de memória RAM na VPS e simplificando drasticamente a orquestração de rede.

```text
                           INTERNET PÚBLICA / NAVEGADOR
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │   NGINX PROXY MANAGER (Host)  │
                        │   (Portas 80 / 443 com SSL)   │
                        │        Rede: rede-proxy       │
                        └───────────────┬───────────────┘
                                        │ (http://contador-apoio-app:3000)
                                        ▼
       ╔═════════════════════════════════════════════════════════════════════╗
       ║             CONTÊINER UNIFICADO: contador-apoio-app                 ║
       ║                    (Node.js 24 Alpine / Porta 3000)                 ║
       ║                                                                     ║
       ║  ┌─────────────────────────┐       ┌─────────────────────────────┐  ║
       ║  │      FRONTEND (SPA)     │       │        BACKEND (API)        │  ║
       ║  │  • React 18 + Vite      │◄──────┤  • Express 4.x REST         │  ║
       ║  │  • Tailwind CSS         │Static │  • Rotas: /api/*            │  ║
       ║  │  • Cache de Assets (1y) │ Files │  • Headers de Segurança     │  ║
       ║  │  • Roteamento SPA       │       │  • CORS & Body Parser 25MB  │  ║
       ║  └─────────────────────────┘       └──────────────┬──────────────┘  ║
       ╚════════════════════════════════════════════════════┼═════════════════╝
                                                           │
                                        ┌──────────────────┴──────────────────┐
                                        │                                     │
                                        ▼                                     ▼
                           CLOUDFLARE D1 (Edge SQL)                   GOOGLE GEMINI API
                        Dual Engine: Remote REST / Local              (gemini-3.6-flash)
```

### Tecnologias Utilizadas:
* **Frontend Web**: React 18, TypeScript, Vite, Tailwind CSS, Recharts (gráficos interativos), Lucide Icons, Material Symbols, Zod (validação de schemas), XLSX (exportação Excel).
* **Backend Integrado**: Node.js 24 Alpine, TypeScript, Express (servindo tanto os artefatos estáticos da SPA quanto os endpoints da API REST sob `/api/*`), CORS, Driver Dual Cloudflare D1 / SQLite nativo (`node:sqlite`).
* **Banco de Dados (Cloudflare D1 Dual Engine)**:
  * Motor relacional SQL com integridade ACID, chaves estrangeiras, concorrência otimista (`version`) e trilha de auditoria completa (`old_value` / `new_value`).
  * **Modo Nuvem (Produção)**: Conexão direta via **Cloudflare D1 REST API** na borda (*Edge*).
  * **Modo Local (Offline/Fallback)**: Engine nativa baseada em `node:sqlite` com volume persistente (`contador_apoio_d1_data`) em `/app/data`.
  * Tabelas: `user_profiles`, `attendants`, `treatment_supports`, `treatment_support_audits`, `goals`, `ai_analyses`, `audit_logs`, `system_settings`.
* **Inteligência Artificial (Google Gemini)**: Modelo `gemini-3.6-flash`, com parecer executivo, termômetro clínico, plano de voo operacional e cache determinístico por hash (`input_hash`).
* **Conteinerização**: Docker Multi-stage Build em 3 estágios, Docker Compose, rede externa `rede-proxy` e execução segura com usuário não-root `node`.

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
| `DOCKER_SHARED_NETWORK` | Não | Nome da rede Docker compartilhada com o proxy Nginx | `rede-proxy` |
| `APP_PORT` | Não | Porta de exposição da aplicação no host (se necessário) | `3000` |
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
docker network create rede-proxy 2>/dev/null || true
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
   docker network create rede-proxy 2>/dev/null || true
   ```

6. **Baixe a imagem unificada e inicialize o contêiner**:
   ```bash
   docker compose pull
   docker compose up -d
   ```

---

## 6. Integração com Nginx Proxy Manager & Hostinger DNS

Com o contêiner unificado conectado à rede **`rede-proxy`**, o Nginx Proxy Manager (NPM) roteia o tráfego de forma direta e sem expor portas extras:

### 6.1. Configuração no Painel do NPM:
1. **Aba Details**:
   * **Domain Names**: `apoio.suadrogaria.com.br` *(apontado na Hostinger via Registro A)*
   * **Scheme**: `http`
   * **Forward Hostname / IP**: `contador-apoio-app`
   * **Forward Port**: `3000`
   * Marque: **Block Common Exploits**, **Websockets Support** e **Cache Assets**.
2. **Aba SSL**:
   * **SSL Certificate**: Selecione *Request a new SSL Certificate* (Let's Encrypt gratuito).
   * Marque: **Force SSL**, **HTTP/2 Support** e aceite os termos de serviço.
   * Clique em **Save**.

### 6.2. Exemplo para Nginx Tradicional no Host:
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
# Ver logs em tempo real da aplicação unificada:
docker compose logs -f

# Reiniciar o contêiner:
docker compose restart

# Parar a aplicação mantendo os dados persistidos:
docker compose down

# Parar e remover volumes locais (atenção: apaga dados do SQLite local):
docker compose down -v
```

---

## 9. Licença e Direitos

Projeto desenvolvido com padrões corporativos de arquitetura de software para Drogarias e Clínicas Farmacêuticas. Todos os direitos reservados.
