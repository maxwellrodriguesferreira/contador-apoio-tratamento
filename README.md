# Apoio ao Tratamento — Gestão Clínica, Metas & IA Operacional

> Sistema corporativo de alta performance voltado a drogarias e redes farmacêuticas para registro de orientações clínicas, acompanhamento terapêutico, auditoria imutável, cálculo determinístico de metas e análise preditiva com Google Gemini.

[![Docker Image](https://img.shields.io/badge/docker-single_container-blue.svg)](Dockerfile)
[![Node.js](https://img.shields.io/badge/node.js-24_alpine-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-18-61dafb.svg)](https://react.dev/)
[![Database](https://img.shields.io/badge/database-Cloudflare_D1_%7C_SQLite-orange.svg)](https://developers.cloudflare.com/d1/)
[![AI](https://img.shields.io/badge/AI-Google_Gemini_Flash-purple.svg)](https://ai.google.dev/)
[![Tests](https://img.shields.io/badge/tests-Vitest-yellow.svg)](vitest.config.ts)

---

## 🚀 Funcionalidades do Sistema

O sistema centraliza a rotina de apoio terapêutico e acompanhamento clínico das lojas em uma interface moderna, rápida e intuitiva:

| Módulo / Funcionalidade | Descrição |
| :--- | :--- |
| 📊 **Dashboard em Tempo Real** | Visão instantânea de KPIs, total de apoios no dia/mês, termômetro clínico de progresso, projeção linear de metas e gráficos comparativos de desempenho por atendente e loja. |
| ✍️ **Registro Rápido de Apoios** | Cadastro ágil de atendimentos clínicos e adesão farmacoterapêutica com validação estrita de integridade via Zod. |
| 📋 **Gestão de Lançamentos** | Listagem completa com filtros temporais e por equipe, controle de concorrência otimista (`version`) e **Soft Delete** com capacidade de restauração imediata. |
| 🎯 **Motor Determinístico de Metas** | Metas operacionais globais e individuais por atendente. O algoritmo calcula projeções e metas diárias excluindo automaticamente domingos e dias não trabalhados. |
| 🛡️ **Auditoria Imutável (Audit Trail)** | Trilha detalhada de conformidade que registra usuário, data, ação e snapshots completos de estado anterior (`old_value`) e novo (`new_value`) para mutações (`CREATE`, `UPDATE`, `DELETE`, `RESTORE`). |
| 🤖 **Inteligência Artificial (Google Gemini)** | Geração de pareceres analíticos, diagnósticos de aderência terapêutica e plano de voo com recomendações de melhoria. Possui cache determinístico (`input_hash`) e invalidação atômica ao alterar dados. |
| 📈 **Relatórios & Exportação** | Painel de relatórios analíticos consolidados com exportação direta para planilhas Excel (`.xlsx`). |
| 👥 **Gestão de Usuários & Equipe** | Cadastro de atendentes, controle de contas de acesso, ativação/inativação e redefinição de credenciais. |
| ⚙️ **Configurações do Sistema** | Parametrização global de regras de cálculo, integração com a IA Gemini e personalização operacional. |

---

## 🔐 Controle de Acesso (RBAC)

O sistema adota separação rigorosa entre quem atende e quem administra o sistema:

* **Administrador (`ADMIN`)**: Acesso total — registro e gestão de apoios, metas, auditoria, usuários, relatórios executivos, diagnóstico por IA e configurações.
* **Atendente (`ATENDENTE`)**: Acesso restrito ao **Dashboard pessoal** (em modo apenas leitura) e ao próprio perfil para consulta de seus números individuais.

---

## 🛠️ Stack Tecnológica

* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts (gráficos) e Zod.
* **Backend Integrado**: Node.js 24 Alpine, TypeScript, Express 4.x servindo a SPA e as rotas REST em `/api/*`.
* **Banco de Dados (Dual Engine)**: **Cloudflare D1** (Edge SQL na nuvem) com fallback automático e persistente para **SQLite** nativo (`node:sqlite`).
* **Inteligência Artificial**: **Google Gemini 3.6 Flash** com cache determinístico e cálculo estatístico prévio no backend.
* **Arquitetura**: **Contêiner Único (*Single Container*)** leve, seguro (execução com usuário não-root `node`) e com zero dependência entre contêineres adicionais.

---

## ⚡ Início Rápido

### 1. Clonar e Configurar Variáveis
```bash
git clone https://github.com/maxwellrodriguesferreira/contador-apoio-tratamento.git
cd contador-apoio-tratamento
cp .env.example .env
```

> Preencha as credenciais no `.env` (credenciais de Admin, chave Gemini opcional e chaves Cloudflare D1 caso use banco remoto). Se omitir as chaves da Cloudflare, o sistema opera automaticamente com o banco local persistido.

### 2. Executar com Docker Compose
```bash
# 1. Cria a rede Docker compartilhada (se não existir)
docker network create rede-proxy 2>/dev/null || true

# 2. Constrói a imagem e inicia o serviço
docker compose up -d --build
```

Acesse a aplicação em: **`http://localhost:3000`**

### 3. Verificar Conectividade e Saúde
```bash
curl http://localhost:3000/api/health
```

---

## 📦 Comandos Essenciais

```bash
# Ver logs em tempo real
docker compose logs -f

# Reiniciar o serviço
docker compose restart

# Parar mantendo o volume de dados
docker compose down

# Rodar testes automatizados (Vitest)
npm run test
```

---

## 📚 Documentações Complementares

Para aprofundar em tópicos específicos de infraestrutura, arquitetura e segurança:

* 🏛️ **[Arquitetura Detalhada](ARCHITECTURE.md)**: Diagrama de fluxo, schemas de banco de dados e ciclo de vida do contêiner.
* 🚀 **[Deploy Contínuo e CI/CD](README_CICD_WATCHTOWER.md)**: Automação com GitHub Actions, Docker Hub e atualização contínua via Watchtower.
* 🌐 **[Deploy em VPS & Nginx Proxy Manager](MANUAL_DEPLOY_VPS_NPM.md)**: Passo a passo completo de publicação em VPS, SSL e proxy reverso.
* 🍓☁️ **[Manual de Implementação: Raspberry Pi & VPS](MANUAL_IMPLEMENTACAO_RPI_VPS.md)**: Guia completo passo a passo de deploy em Raspberry Pi (ARM64) e servidores VPS (x86_64).
* ☸️ **[Manifestos Kubernetes (K8s)](k8s/README.md)**: Implantação em clusters Kubernetes (k3s, EKS, GKE).
* 🔒 **[Relatórios de Segurança e Testes](reports/security/)**: Evidências de testes de segurança e relatório executivo.

---

## 👨‍⚕️ Autoria e Responsabilidade Técnica

* **Responsável Técnico / Desenvolvedor**: **Maxwell Rodrigues Ferreira**
* **Registro Profissional**: **CRF-SP: 86426**
* **Imagem Oficial no Docker Hub**: [`maxwellrodriguesferreira/apoio-tratamento:latest`](https://hub.docker.com/r/maxwellrodriguesferreira/apoio-tratamento)

---
*Desenvolvido sob padrões corporativos para farmácias e drogarias. Todos os direitos reservados.*
