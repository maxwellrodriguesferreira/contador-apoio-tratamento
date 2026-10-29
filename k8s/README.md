# Manifestos Kubernetes (K3s) — Apoio ao Tratamento

Estrutura completa de manifestos declarativos para orquestração da aplicação **Apoio ao Tratamento** em clusters **K3s**, com perfis dedicados para **Raspberry Pi 4 (ARM64)** e **VPS Cloud (x86_64)**.

---

## 📁 Estrutura de Diretórios

```text
k8s/
├── base/                              # Recursos comuns (agnósticos ao nó)
│   ├── namespace.yaml                 # Namespace: contador-apoio
│   ├── configmap.yaml                 # Variáveis operacionais da aplicação
│   ├── secret.example.yaml            # Modelo com placeholders para credenciais seguras
│   ├── pvc.yaml                       # PersistentVolumeClaim (local-path) para /app/data
│   ├── deployment.yaml                # Deployment com réplica única, probes e non-root
│   ├── service.yaml                   # Service ClusterIP (Porta 80 -> Target 3000)
│   └── kustomization.yaml             # Kustomize base
│
├── overlays/
│   ├── rpi4/                          # Perfil Borda: Raspberry Pi 4 (ARM64)
│   │   ├── cloudflare-tunnel.yaml     # Pod conector cloudflared (bypass CGNAT)
│   │   └── kustomization.yaml         # Agregador Kustomize para RPi 4
│   │
│   └── vps/                           # Perfil Nuvem: VPS Cloud (x86_64)
│       ├── issuer.yaml                # Cert-Manager Issuer Let's Encrypt (maxwellferreira@proton.me)
│       ├── ingress.yaml               # Traefik Ingress TLS para maxwelldev.online
│       └── kustomization.yaml         # Agregador Kustomize para VPS
│
├── rpi4-all-in-one.yaml               # Manifesto único pronto para Raspberry Pi 4
├── vps-all-in-one.yaml                # Manifesto único pronto para VPS Cloud
└── README.md                          # Este guia técnico
```

---

## 🚀 Como Aplicar os Manifestos

> ⚠️ **Importante**: Para executar o Kubernetes (K3s) na VPS ou Raspberry Pi, **desative o Nginx Proxy Manager** (e contêineres Docker legados) para liberar as portas `80` e `443` e economizar memória RAM:
> ```bash
> docker stop nginx-proxy-manager || docker compose down
> ```

### 1. Criar a Secret com suas Credenciais:
Antes de aplicar qualquer overlay, crie a Secret com suas chaves seguras (Cloudflare D1, Gemini AI e Senhas):

```bash
# Método A: A partir do arquivo .env existente na raiz do projeto
kubectl create secret generic contador-apoio-secret \
  --namespace=contador-apoio \
  --from-env-file=.env

# Método B: Criando a Secret a partir de k8s/base/secret.example.yaml
cp k8s/base/secret.example.yaml k8s/base/secret.yaml
# Edite com nano e aplique:
kubectl apply -f k8s/base/secret.yaml
```

---

### 2. Deploy na Raspberry Pi 4 (ARM64 com Cloudflare Tunnel)

1. Crie o túnel no Cloudflare Zero Trust e configure o Public Hostname `maxwelldev.online` apontando para `http://contador-apoio-service.contador-apoio.svc.cluster.local:80`.
2. Armazene o token do túnel:
   ```bash
   kubectl create secret generic cloudflare-tunnel-token \
     --namespace=contador-apoio \
     --from-literal=token="SEU_TUNNEL_TOKEN_AQUI"
   ```
3. Aplique os recursos:
   ```bash
   # Opção Kustomize:
   kubectl apply -k k8s/overlays/rpi4/

   # OU Opção Manifesto Único:
   kubectl apply -f k8s/rpi4-all-in-one.yaml
   ```

---

### 3. Deploy na VPS Cloud (x86_64 com Traefik Ingress e Let's Encrypt)

1. Instale o Cert-Manager no cluster K3s:
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.0/cert-manager.yaml
   ```
2. No seu DNS, garanta que `maxwelldev.online` e `www.maxwelldev.online` apontem via Registro A para o IP público da sua VPS.
3. Aplique os recursos:
   ```bash
   # Opção Kustomize:
   kubectl apply -k k8s/overlays/vps/

   # OU Opção Manifesto Único:
   kubectl apply -f k8s/vps-all-in-one.yaml
   ```

---

## 🔍 Comandos de Verificação e Manutenção

```bash
# Listar todos os recursos do namespace
kubectl get all,pvc,ingress -n contador-apoio -o wide

# Acompanhar logs da aplicação em tempo real
kubectl logs -f deployment/contador-apoio-app -n contador-apoio

# Atualizar imagem (rollout) após novo push no GitHub Actions
kubectl rollout restart deployment/contador-apoio-app -n contador-apoio

# Acompanhar status do rollout
kubectl rollout status deployment/contador-apoio-app -n contador-apoio
```
