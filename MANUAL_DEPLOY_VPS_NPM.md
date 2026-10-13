# Manual Completo: Implementação do Nginx Proxy Manager & Deploy em VPS

Guia prático, detalhado e passo a passo para instalação do proxy reverso central na VPS, orquestração via rede Docker compartilhada (`rede-proxy`), apontamento de DNS na **Hostinger**, emissão de certificados **SSL gratuitos (Let's Encrypt)** e deploy da aplicação **Apoio ao Tratamento** em contêiner unificado (*single container*).

---

## Sumário
1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Preparação do Servidor VPS](#2-preparação-do-servidor-vps)
3. [Criação da Rede Docker Compartilhada (`rede-proxy`)](#3-criação-da-rede-docker-compartilhada-rede-proxy)
4. [Instalação e Configuração do Nginx Proxy Manager (NPM)](#4-instalação-e-configuração-do-nginx-proxy-manager-npm)
5. [Configuração de DNS no Painel da Hostinger](#5-configuração-de-dns-no-painel-da-hostinger)
6. [Deploy da Aplicação (Apoio ao Tratamento — Contêiner Único)](#6-deploy-da-aplicação-apoio-ao-tratamento--contêiner-único)
7. [Configuração do Proxy Host e SSL no Painel do NPM](#7-configuração-do-proxy-host-e-ssl-no-painel-do-npm)
8. [Segurança e Endurecimento da VPS](#8-segurança-e-endurecimento-da-vps)
9. [Rotinas de Manutenção e Atualização](#9-rotinas-de-manutenção-e-atualização)
10. [Diagnóstico e Resolução de Problemas Comuns](#10-diagnóstico-e-resolução-de-problemas-comuns)

---

## 1. Visão Geral da Arquitetura

O ecossistema adota o padrão de **Gateway Central de Proxy Reverso** isolado na rede Docker `rede-proxy`. Isso significa que apenas as portas seguras padrão da web (**80** e **443**) ficam abertas para a Internet pública na VPS.

Todos os contêineres de aplicações (como o `contador-apoio-app`) comunicam-se com o Nginx Proxy Manager internamente através do DNS nativo do Docker, **sem necessidade de expor suas portas de aplicação no host**.

```text
                                INTERNET PÚBLICA
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
                 Porta 80 (HTTP)                  Porta 443 (HTTPS)
                      │                                 │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │     HOST VPS / FIREWALL (UFW)     │
                     └─────────────────┬─────────────────┘
                                       │
                                       ▼
       ╔═══════════════════════════════════════════════════════════════╗
       ║                REDE DOCKER BRIDGE: rede-proxy                 ║
       ║                                                               ║
       ║   ┌───────────────────────────────────────────────────────┐   ║
       ║   │              NGINX PROXY MANAGER (NPM)                │   ║
       ║   │  • Terminação SSL automática (Let's Encrypt)          │   ║
       ║   │  • Roteamento por Domínio (Hostinger)                 │   ║
       ║   │  • Interface Administrativa Web (Porta 81)            │   ║
       ║   └───────────────────────────┬───────────────────────────┘   ║
       ║                               │                               ║
       ║                               │ http://contador-apoio-app:3000║
       ║                               ▼                               ║
       ║   ┌───────────────────────────────────────────────────────┐   ║
       ║   │            APLICAÇÃO: contador-apoio-app              │   ║
       ║   │  • Contêiner Único (Node.js 24 Alpine)                │   ║
       ║   │  • Frontend SPA (React 18 + Vite)                     │   ║
       ║   │  • Backend API REST (Express /api/*)                  │   ║
       ║   │  • Banco: Cloudflare D1 Remoto ou Local SQLite Engine │   ║
       ║   └───────────────────────────────────────────────────────┘   ║
       ╚═══════════════════════════════════════════════════════════════╝
```

### Vantagens do Modelo Unificado (Single Container):
1. **Simplicidade Operacional**: Um único contêiner para gerenciar, parar, reiniciar ou atualizar.
2. **Sem Conflito de Portas**: A aplicação escuta na porta 3000 apenas dentro da rede Docker `rede-proxy`.
3. **Segurança Máxima**: Nenhuma porta do backend ou frontend é exposta na interface de rede pública da VPS.
4. **Economia de Recursos**: Elimina instâncias duplicadas de servidores web e reduz o consumo de memória RAM na VPS.

---

## 2. Preparação do Servidor VPS

> **Requisitos Mínimos Recomendados**:
> - Sistema Operacional: Ubuntu 22.04 LTS ou 24.04 LTS (ou Debian 12).
> - Recursos: 1 vCPU, 1 GB de RAM, 20 GB de disco SSD.
> - Acesso SSH com privilégios de `root` ou `sudo`.

### 2.1. Conectar à VPS e Atualizar Pacotes
```bash
ssh usuario@ip-da-vps
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw htop
```

### 2.2. Instalar o Docker e Docker Compose Plugin
Execute o script oficial automatizado da Docker Inc.:
```bash
# Baixa e instala o Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Adiciona seu usuário ao grupo docker ( dispensando o uso de sudo )
sudo usermod -aG docker $USER

# Habilita o Docker para inicializar automaticamente com o boot do sistema
sudo systemctl enable docker
sudo systemctl start docker
```
*Faça logout (`exit`) e conecte-se novamente via SSH para atualizar as permissões do grupo docker.*

Valide a instalação:
```bash
docker --version
docker compose version
```

### 2.3. Configurar o Firewall (UFW)
Mantenha liberadas as portas necessárias para a web e para o acesso seguro:
```bash
# Permite conexão SSH (NUNCA esqueça esta regra)
sudo ufw allow 22/tcp comment 'Acesso SSH'

# Portas padrão de tráfego Web HTTP e HTTPS
sudo ufw allow 80/tcp comment 'Trafego Web HTTP'
sudo ufw allow 443/tcp comment 'Trafego Seguro HTTPS'

# Porta de gerenciamento do Nginx Proxy Manager (recomenda-se fechar após configurar)
sudo ufw allow 81/tcp comment 'Painel Web NPM'

# Ativa o firewall
sudo ufw enable
sudo ufw status
```

---

## 3. Criação da Rede Docker Compartilhada (`rede-proxy`)

A rede `rede-proxy` atuará como a espinha dorsal privada entre o Nginx Proxy Manager e todos os contêineres que receberão tráfego da web.

Crie a rede no host com o comando:
```bash
docker network create rede-proxy
```

Verifique se a rede foi criada com sucesso:
```bash
docker network ls | grep rede-proxy
```

---

## 4. Instalação e Configuração do Nginx Proxy Manager (NPM)

### 4.1. Criar Diretório de Estrutura do Proxy
Recomenda-se manter o proxy isolado em `/opt/proxy-manager`:
```bash
sudo mkdir -p /opt/proxy-manager && cd /opt/proxy-manager
```

### 4.2. Criar o arquivo `docker-compose.yml` do NPM
Crie o arquivo com seu editor preferido (`nano docker-compose.yml`):
```yaml
services:
  npm:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      # Portas públicas do host para receber o tráfego da Internet
      - '80:80'
      - '443:443'
      - '81:81'
    environment:
      # Desativa métricas anônimas (opcional)
      - DISABLE_IPV6=true
    volumes:
      # Persistência de configurações e certificados SSL Let's Encrypt
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    networks:
      - rede-proxy

networks:
  rede-proxy:
    name: rede-proxy
    external: true
```

### 4.3. Inicializar o Nginx Proxy Manager
Execute o comando:
```bash
docker compose up -d
```

Verifique se o contêiner está rodando:
```bash
docker compose ps
```

### 4.4. Primeiro Acesso e Troca Obrigatória de Senha
1. Abra no navegador: `http://IP_DA_SUA_VPS:81`
2. Insira as credenciais padrão de fábrica:
   - **Email:** `admin@example.com`
   - **Password:** `changeme`
3. Imediatamente após o login, o painel solicitará a atualização dos dados:
   - Digite seu **Nome**, **Apelido** e **Seu E-mail Real** (importante para os avisos do Let's Encrypt).
   - Defina uma **Nova Senha Forte**.
   - Clique em **Save**.

---

## 5. Configuração de DNS no Painel da Hostinger

Antes de gerar os certificados SSL no NPM, o domínio ou subdomínio deve obrigatoriamente apontar para o IP público da sua VPS.

### 5.1. Acessar a Zona DNS na Hostinger
1. Acesse o painel da Hostinger: [hpanel.hostinger.com](https://hpanel.hostinger.com/).
2. Vá em **Domínios** ➔ Selecione o seu domínio (ex: `suadrogaria.com.br`).
3. No menu lateral, clique em **DNS / Servidores de Nome** (ou *Gerenciador de DNS*).

### 5.2. Criar o Registro Tipo A
Escolha uma das duas opções abaixo:

* **Opção A (Subdomínio - Recomendado)**: Para usar `apoio.suadrogaria.com.br`:
  * **Tipo:** `A`
  * **Nome (Host):** `apoio`
  * **Aponta para:** `IP_PUBLICO_DA_VPS` (ex: `185.123.45.67`)
  * **TTL:** `300` segundos (ou o mínimo permitido para propagação rápida).

* **Opção B (Domínio Principal)**: Para usar `suadrogaria.com.br`:
  * **Tipo:** `A`
  * **Nome (Host):** `@`
  * **Aponta para:** `IP_PUBLICO_DA_VPS`
  * **TTL:** `300` segundos.

Clique em **Adicionar Registro** (ou *Salvar*).

### 5.3. Testar a Propagação do DNS
No seu computador ou na própria VPS, teste se o domínio já responde com o IP da sua VPS:
```bash
ping apoio.suadrogaria.com.br -c 2
```
Ou via comando `dig`:
```bash
dig +short apoio.suadrogaria.com.br
```
> ⏱️ *Aguarde até que o comando retorne exatamente o IP da sua VPS antes de solicitar o certificado SSL no Nginx Proxy Manager.*

---

## 6. Deploy da Aplicação (Apoio ao Tratamento — Contêiner Único)

### 6.1. Criar o Diretório da Aplicação na VPS
```bash
sudo mkdir -p /opt/apoio-tratamento && cd /opt/apoio-tratamento
```

### 6.2. Criar o arquivo `docker-compose.yml` da Aplicação
Crie o arquivo (`nano docker-compose.yml`) com o seguinte conteúdo:
```yaml
services:
  app:
    image: maxwellrodriguesferreira/apoio-tratamento:latest
    container_name: contador-apoio-app
    restart: unless-stopped
    # OBS: Nenhuma porta precisa ser exposta para o host!
    # A comunicação com a Internet ocorre via Nginx Proxy Manager na rede-proxy.
    expose:
      - "3000"
    environment:
      - PORT=3000
      - CLIENT_BUILD_PATH=/app/client
      # Repasse seguro de variáveis de ambiente
      - CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-}
      - CLOUDFLARE_DATABASE_ID=${CLOUDFLARE_DATABASE_ID:-}
      - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - GEMINI_DEFAULT_MODEL=${GEMINI_DEFAULT_MODEL:-gemini-3.6-flash}
      - ADMIN_EMAIL=${ADMIN_EMAIL:-}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
      - ATENDENTE_EMAIL=${ATENDENTE_EMAIL:-}
      - ATENDENTE_PASSWORD=${ATENDENTE_PASSWORD:-}
      - DATABASE_DIR=/app/data
    volumes:
      - d1_sqlite_data:/app/data
    healthcheck:
      test: [ "CMD", "node", "-e", "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" ]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - rede-proxy

volumes:
  d1_sqlite_data:
    name: contador_apoio_d1_data

networks:
  rede-proxy:
    name: rede-proxy
    external: true
```

### 6.3. Criar e Configurar o arquivo `.env`
Crie o arquivo de variáveis na VPS (`nano .env`):
```ini
# ==============================================================================
# Variáveis de Produção — Apoio ao Tratamento
# ==============================================================================

# 1. Rede Docker Externa
DOCKER_SHARED_NETWORK=rede-proxy
PORT=3000

# 2. Banco de Dados Cloudflare D1 (Produção)
CLOUDFLARE_ACCOUNT_ID=seu_cloudflare_account_id
CLOUDFLARE_DATABASE_ID=seu_cloudflare_database_id
CLOUDFLARE_API_TOKEN=seu_cloudflare_api_token

# 3. Google Gemini IA Studio
GEMINI_API_KEY=sua_chave_gemini_api_key
GEMINI_DEFAULT_MODEL=gemini-3.6-flash

# 4. Credenciais Iniciais de Administrador
ADMIN_EMAIL=admin@suadrogaria.com.br
ADMIN_PASSWORD=SuaSenhaForteAqui123$

# 5. Configuração Interna de Dados
DATABASE_DIR=/app/data
```

### 6.4. Proteger as permissões do `.env`
```bash
chmod 600 .env
```

### 6.5. Baixar a Imagem e Iniciar o Contêiner
```bash
# Baixa a imagem oficial atualizada do Docker Hub
docker compose pull

# Sobe o contêiner em segundo plano
docker compose up -d
```

### 6.6. Validar Status e Logs da Aplicação
```bash
docker compose ps
```
*Saída esperada:*
```text
NAME                 SERVICE   STATUS                   PORTS
contador-apoio-app   app       Up (healthy)             3000/tcp
```

Verifique os logs em tempo real para confirmar a conexão com o Cloudflare D1 e frontend integrado:
```bash
docker compose logs -f
```

---

## 7. Configuração do Proxy Host e SSL no Painel do NPM

Agora você conectará o domínio configurado na Hostinger ao contêiner `contador-apoio-app`.

### 7.1. Adicionar um Novo Proxy Host
1. Acesse o painel do NPM (`http://IP_DA_VPS:81`).
2. Clique na aba **Hosts** ➔ **Proxy Hosts**.
3. Clique no botão **Add Proxy Host** (canto superior direito).

### 7.2. Preenchimento da Aba "Details"
Preencha exatamente como descrito:

| Campo | Valor a Preencher | Explicação |
| :--- | :--- | :--- |
| **Domain Names** | `apoio.suadrogaria.com.br` | O domínio ou subdomínio configurado na Hostinger. Pressione `Enter` após digitar. |
| **Scheme** | `http` | Comunicação interna entre o NPM e o contêiner. |
| **Forward Hostname / IP** | `contador-apoio-app` | **O nome exato do contêiner**. O Docker resolverá via DNS interno na `rede-proxy`. |
| **Forward Port** | `3000` | Porta interna em que a aplicação Express escuta. |
| **Cache Assets** | ✅ **Marcado** | Habilita cache de arquivos estáticos no Nginx. |
| **Block Common Exploits** | ✅ **Marcado** | Proteção contra SQL injection e exploits comuns. |
| **Websockets Support** | ✅ **Marcado** | Garante suporte para conexões em tempo real. |

---

### 7.3. Configuração do SSL Gratuito (Let's Encrypt) na Aba "SSL"
Na mesma janela, clique na aba **SSL**:

1. No campo **SSL Certificate**, selecione: **Request a new SSL Certificate**.
2. Marque as opções recomendadas:
   - ✅ **Force SSL** (redireciona automaticamente todo tráfego HTTP para HTTPS).
   - ✅ **HTTP/2 Support** (maior velocidade de carregamento).
   - ✅ **HSTS Enabled** (reforço de segurança contra interceptação).
   - ✅ **HSTS Subdomains** (opcional se for subdomínio).
3. No campo **Email Address for Let's Encrypt**, confirme o seu e-mail de contato.
4. Marque a caixa:
   - ✅ **I Agree to the Let's Encrypt Terms of Service**.
5. Clique em **Save**.

> ⏳ *O Nginx Proxy Manager se comunicará com os servidores da Let's Encrypt, validará o apontamento DNS da Hostinger e emitirá o certificado TLS em aproximadamente 10 a 20 segundos.*

### 7.4. Teste de Acesso
Abra seu navegador e acerte o endereço:
```text
https://apoio.suadrogaria.com.br
```
Você verá o cadeado de segurança verde/ativo e a tela de login do **Apoio ao Tratamento** carregando de forma instantânea!

---

## 8. Segurança e Endurecimento da VPS

### 8.1. Fechar a Porta 81 do NPM para a Internet
Após a configuração dos hosts, a porta 81 **não deve ficar aberta para qualquer pessoa tentar força bruta**:

```bash
# Remove a permissão pública da porta 81
sudo ufw delete allow 81/tcp
sudo ufw status
```

#### Como acessar o painel do NPM quando a porta 81 estiver fechada:
Utilize um **Túnel SSH** no terminal do seu computador pessoal:
```bash
ssh -L 8181:localhost:81 usuario@ip-da-vps
```
Depois abra no navegador do seu próprio computador: `http://localhost:8181`. O tráfego passará criptografado diretamente para a VPS!

### 8.2. Instalar e Configurar o Fail2Ban (Proteção Anti Força Bruta)
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 9. Rotinas de Manutenção e Atualização

### 9.1. Atualizar a Aplicação Apoio ao Tratamento
Sempre que uma nova versão da imagem for gerada ou corrigida no Docker Hub:

```bash
cd /opt/apoio-tratamento
docker compose pull
docker compose up -d
docker image prune -f
```
*O processo dura menos de 10 segundos e causa tempo de inatividade imperceptível.*

### 9.2. Backup do Banco Local SQLite (Modo Offline/Fallback)
Se a aplicação estiver operando com o SQLite local persistente:
```bash
# Faz backup do arquivo do banco para um diretório seguro
sudo cp -r /var/lib/docker/volumes/contador_apoio_d1_data/_data /opt/backup-$(date +%F)
```

### 9.3. Renovação de Certificados SSL
Os certificados Let's Encrypt gerados pelo Nginx Proxy Manager possuem validade de 90 dias e **são renovados automaticamente pelo NPM** 30 dias antes de vencer. Nenhuma intervenção manual é necessária.

---

## 10. Diagnóstico e Resolução de Problemas Comuns

### 10.1. Erro "502 Bad Gateway" no Navegador
* **Causa 1:** O contêiner da aplicação não está conectado à rede `rede-proxy`.
  * *Correção:* Verifique se `contador-apoio-app` está na rede com:
    ```bash
    docker network inspect rede-proxy | grep contador-apoio-app
    ```
* **Causa 2:** O Forward Hostname no NPM foi digitado com erro.
  * *Correção:* Certifique-se de que no painel do NPM o campo é `contador-apoio-app` e a porta é `3000`.

### 10.2. Erro "Internal Error" ao Gerar Certificado SSL no NPM
* **Causa 1:** O DNS na Hostinger ainda não se propagou ou o IP informado está errado.
  * *Correção:* Teste `ping seu-dominio.com` e aguarde a propagação completa antes de tentar novamente.
* **Causa 2:** A porta 80 está bloqueada no Firewall (UFW).
  * *Correção:* O Let's Encrypt precisa acessar `http://seu-dominio.com/.well-known/acme-challenge/` na porta 80 para validar a posse do domínio. Garanta que a porta 80 esteja liberada no firewall com `sudo ufw allow 80/tcp`.

### 10.3. O contêiner da aplicação está em status "unhealthy"
* **Causa:** A rota `/api/health` não está respondendo.
  * *Correção:* Analise os logs com:
    ```bash
    docker compose logs contador-apoio-app
    ```
    Verifique se as credenciais do Cloudflare D1 ou a chave do Gemini possuem caracteres inválidos no arquivo `.env`.

---
*Manual homologado para arquitetura Single Container com Nginx Proxy Manager e Hostinger DNS.*
