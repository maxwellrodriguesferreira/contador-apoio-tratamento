# Manifestos Kubernetes — Apoio ao Tratamento

Guia completo para orquestração e deploy da aplicação **Apoio ao Tratamento** em clusters Kubernetes (k3s, k8s vanilla, EKS, GKE, AKS, Minikube ou MicroK8s).

---

## 1. Visão Geral da Arquitetura em Kubernetes

A aplicação opera no modelo **Single-Container Unificado**:
* **Frontend SPA**: React 18 + Vite + Tailwind CSS (compilado e servido estaticamente pelo Express).
* **Backend API REST**: Express em Node.js 24 Alpine escutando internamente na porta `3000`.
* **Banco de Dados Híbrido**:
  * **Modo Edge (Nuvem)**: Conexão direta com a API do Cloudflare D1 via credenciais seguras.
  * **Modo Local (Offline/Fallback)**: SQLite 3 nativo em `/app/data` com conformidade ACID e WAL (*Write-Ahead Logging*).
* **Persistência**: PersistentVolumeClaim montado em `/app/data` para reter o banco SQLite local e migrações.
* **Segurança e Privilégios**: Execução com usuário sem privilégios de root (`node`, UID 1000, GID 1000) com `fsGroup: 1000` garantindo acesso estrito ao volume persistente.
* **Saúde e Resiliência**: Probes nativas de `startupProbe`, `readinessProbe` e `livenessProbe` apontando para `/api/health`.

### Fluxo de Implementação e Pipeline de CI/CD

```mermaid
flowchart TD
    subgraph DEV ["1. Desenvolvimento & Versionamento"]
        Dev["Desenvolvedor"] -->|git commit & push| Repo["GitHub Repo: main"]
    end

    subgraph GHA ["2. Pipeline de CI/CD: GitHub Actions (deploy.yml)"]
        Repo -->|Trigger: push main| Runner["Runner: ubuntu-latest"]
        Runner -->|Etapa 1| Checkout["Checkout do Código (actions/checkout@v4)"]
        Checkout -->|Etapa 2| DockerLogin["Login no Docker Hub (Secrets do GitHub)"]
        DockerLogin -->|Etapa 3: Multi-Stage Build| Build["Build Dockerfile:\n• Frontend: React 18 + Vite\n• Backend: Node 24 + Express\n• Runtime: Alpine Unificado"]
        Build -->|Etapa 4: Push| RegistryPush["Publicação da Imagem"]
    end

    subgraph REGISTRY ["3. Docker Hub Registry (Público)"]
        RegistryPush --> PublicImg["maxwellrodriguesferreira/apoio-tratamento:latest"]
    end

    subgraph PROD ["4. Ambientes de Execução & Deploy"]
        direction TB

        subgraph K8S ["Opção A: Cluster Kubernetes (K8s)"]
            K8sApply["kubectl apply -k k8s/"] --> K8sDeploy["Deployment: contador-apoio-app\n(imagePullPolicy: Always)"]
            PublicImg -.->|Pull automático| K8sDeploy
            K8sDeploy --> K8sService["Service: ClusterIP :80 ➔ :3000"]
            K8sService --> K8sIngress["Ingress Nginx Controller\n(Cert-Manager / Let's Encrypt TLS)"]
            K8sDeploy -.->|VolumeMount /app/data| K8sPVC[("PVC: contador-apoio-data-pvc\n(SQLite Local)")]
        end

        subgraph VPS_DOCKER ["Opção B: VPS com Portainer & Nginx Proxy Manager"]
            Portainer["Portainer Stack (compose.yml)"] --> AppContainer["Contêiner Único: contador-apoio-app\n(Porta Interna 3000)"]
            PublicImg -.->|Pull de Imagem| AppContainer
            AppContainer -->|Rede: rede-proxy| NPM["Nginx Proxy Manager\n(Portas Públicas 80 e 443 SSL)"]
            AppContainer -.->|Volume /app/data| DockerVol[("Volume: contador_apoio_d1_data")]
        end
    end

    subgraph EXTERNAL ["5. Integrações & Acesso Externo"]
        K8sDeploy & AppContainer -.->|Modo Edge SQL| CloudflareD1[("Cloudflare D1 Database")]
        K8sDeploy & AppContainer -.->|API Segura| GeminiAI["Google Gemini 3.6 Flash AI"]
        K8sIngress & NPM ==>|HTTPS: apoio.suaempresa.com.br| Users(["Usuários Finais / Farmacêuticos"])
    end
```

---


## 2. Estrutura dos Arquivos

```text
k8s/
├── namespace.yaml         # Namespace isolado (contador-apoio)
├── configmap.yaml         # Variáveis de ambiente operacionais não sensíveis
├── secret.example.yaml    # Modelo com placeholders para credenciais seguras
├── pvc.yaml               # PersistentVolumeClaim (2Gi) para o diretório /app/data
├── deployment.yaml        # Deployment com réplica única, probes e segurança
├── service.yaml           # Service ClusterIP (Porta 80 -> Target 3000)
├── ingress.yaml           # Ingress com suporte a TLS, Cert-Manager e Let's Encrypt
├── kustomization.yaml     # Agregador declarativo Kustomize
└── README.md              # Documentação técnica e operacional
```

---

## 3. Passo a Passo para Implantação

### Passo 1: Criação do Namespace
```bash
kubectl apply -f k8s/namespace.yaml
```

### Passo 2: Configuração dos Segredos (Secret)

**Opção A (A partir do arquivo `.env` existente):**
```bash
kubectl create secret generic contador-apoio-secret \
  --from-env-file=.env \
  --namespace=contador-apoio
```

**Opção B (Via arquivo YAML):**
```bash
cp k8s/secret.example.yaml k8s/secret.yaml
# Edite k8s/secret.yaml e aplique:
kubectl apply -f k8s/secret.yaml
```

### Passo 3: Ajuste do Domínio no Ingress
Edite `k8s/ingress.yaml` e ajuste `apoio.seudominio.com.br` para o seu domínio real.

### Passo 4: Aplicação dos Recursos com Kustomize
```bash
kubectl apply -k k8s/
```

---

## 4. Diagnóstico e Verificação

```bash
# Status dos recursos
kubectl get all,pvc,ingress -n contador-apoio

# Logs em tempo real
kubectl logs -f deployment/contador-apoio-app -n contador-apoio
```
