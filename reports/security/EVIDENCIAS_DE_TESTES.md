# Registro e Evidências de Testes de Segurança

**Aplicação:** Apoio ao Tratamento  
**Ambiente:** Ambiente Local / Node.js 24 Alpine Runtime  
**Data de Execução:** 28 de Outubro de 2026  
**Ferramentas Empregadas:** Vitest v3, NPM Audit, Ripgrep SAST, TypeScript Compiler (`tsc`)  

---

## 1. Testes Automatizados de Segurança e Criptografia (Vitest)

Foi desenvolvida e executada a suíte de testes de segurança automatizados `src/tests/serverSecurity.test.ts`, integrada às suítes existentes (`rbacSecurity.test.ts`, `supportCrud.test.ts` e `calculations.test.ts`).

### 1.1. Log de Execução dos Testes Automatizados

```bash
$ npm test

✓ src/tests/calculations.test.ts (5 tests) 12ms
✓ src/tests/serverSecurity.test.ts (6 tests) 65ms
    ✓ deve gerar e validar token criptograficamente assinado com sucesso
    ✓ deve rejeitar tokens adulterados na assinatura
    ✓ deve rejeitar tokens adulterados no payload para escalada de privilégios
    ✓ deve gerar hash de senha usando PBKDF2 com salt aleatório exclusivo
    ✓ não deve aceitar a senha padrão de backdoor (SenhaForte@2026) contra hash legítimo
    ✓ deve sanitizar caracteres HTML para prevenir XSS na formatação de pareceres
✓ src/tests/supportCrud.test.ts (3 tests) 75ms
✓ src/tests/rbacSecurity.test.ts (5 tests) 39ms

Test Files  4 passed (4)
     Tests  19 passed (19)
  Duration  4.24s
```

### 1.2. Casos de Teste e Evidências Técnicas

#### Teste 1: Validação de Assinatura Criptográfica de Tokens
* **Objetivo:** Garantir que tokens assinados com a chave do servidor sejam emitidos no formato `header.payload.signature` e decodificados com sucesso.
* **Resultado:** **APROVADO**. O token emitido contém 3 segmentos base64url e decodifica exatamente o identificador, e-mail e cargo do usuário.

#### Teste 2: Rejeição de Assinatura Adulterada (Anti-Forgery)
* **Objetivo:** Verificar se modificações de um único caractere na assinatura invalidam o token.
* **Resultado:** **APROVADO**. `verifyToken(forgedToken)` retornou `null`. O servidor descarta o token e retorna HTTP 401.

#### Teste 3: Rejeição de Escalada de Privilégios no Payload (Anti-Privilege Escalation)
* **Objetivo:** Simular um usuário com perfil `ATENDENTE` alterando o payload codificado para `ADMIN` mantendo a assinatura original.
* **Resultado:** **APROVADO**. A comparação de verificação HMAC em tempo constante detectou a divergência imediatamente e retornou `null`.

#### Teste 4: Derivação de Senhas com PBKDF2 e Salt Exclusivo
* **Objetivo:** Assegurar que senhas iguais gerem hashes completamente distintos devido ao salt pseudo-aleatório de 16 bytes.
* **Resultado:** **APROVADO**. `hash1 !== hash2`, ambos no formato `salt:key`, e ambos válidos via `verifyPassword`.

#### Teste 5: Rejeição da Senha Mestra (Backdoor Removal)
* **Objetivo:** Confirmar que a antiga senha mestre estática `SenhaForte@2026` não permite mais autenticação sobre contas cadastradas.
* **Resultado:** **APROVADO**. `verifyPassword('SenhaForte@2026', userHash)` retornou estritamente `false`.

#### Teste 6: Sanitização de XSS em Relatórios de IA
* **Objetivo:** Submeter payload com `<script>alert("XSS")</script><img src=x onerror=alert(1)>**Texto Importante**` à função `formatInline`.
* **Resultado:** **APROVADO**. O output gerado foi:
  `&lt;script&gt;alert("XSS")&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;<strong class="font-bold text-on-surface">Texto Importante</strong>`
  Tags HTML maliciosas foram convertidas em texto codificado inofensivo, preservando a estilização segura de Markdown.

---

## 2. Auditoria de Composição de Software (SCA)

### 2.1. Backend (`server/`)

* **Comando Executado:** `npm audit fix`
* **Log Sanitizado:**
  ```text
  changed 2 packages, and audited 114 packages in 2s
  found 0 vulnerabilities
  ```
* **Resultado:** Todas as vulnerabilidades de dependências transitivas (`body-parser` < 1.20.9 e `qs` < 6.16.0) foram completamente eliminadas do runtime de produção do backend.

### 2.2. Frontend (`/`)

* **Comando Executado:** `npm audit fix`
* **Log Sanitizado:**
  ```text
  changed 3 packages, and audited 282 packages in 4s
  ```
* **Resultado:**
  * Vulnerabilidades em `postcss-selector-parser`, `source-map-js` e `vite` foram corrigidas.
  * O pacote `xlsx` apresentou apontamento conhecido na comunidade (SheetJS ReDoS / Prototype Pollution). Verificou-se que a aplicação utiliza apenas `XLSX.writeFile` e `XLSX.utils.json_to_sheet` para exportação, não processando arquivos enviados por terceiros. Risco classificado como insignificante no escopo atual.

---

## 3. Inspeção Estática de Segredos e Configurações

### 3.1. Arquivo de Orquestração (`docker-compose.watchtower.yaml`)
* **Verificação Pré-Correção:**
  ```yaml
  - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-cfut_[REDACTED]}
  - GEMINI_API_KEY=${GEMINI_API_KEY:-AQ.[REDACTED]}
  - REDIS_URL=${REDIS_URL:-rediss://default:[REDACTED]}
  ```
* **Verificação Pós-Correção:**
  ```yaml
  - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-}
  - GEMINI_API_KEY=${GEMINI_API_KEY:-}
  - REDIS_URL=${REDIS_URL:-}
  - ADMIN_EMAIL=${ADMIN_EMAIL:-}
  - ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
  ```
* **Resultado:** Segredos estáticos eliminados do manifesto versionado.

### 3.2. Arquivo Git Ignore (`.gitignore`)
* **Verificação:** Confirmada presença de regras estritas:
  ```gitignore
  .env
  .env.*
  !.env.example
  *secret*.yaml
  k8s/secret*.yaml
  ```
* **Resultado:** Arquivos locais com segredos reais não são indexados pelo Git.

---

## 4. Testes de Compilação e Integridade de Tipos

### 4.1. Compilação TypeScript do Backend
* **Comando Executado:** `npm run build` em `server/`
* **Resultado:** Código compilado com sucesso sem erros de tipagem (`exit code 0`). O schema SQL `schema.sql` foi transferido corretamente para o diretório de runtime `dist/db/schema.sql`.

### 4.2. Compilação do Frontend SPA (Vite)
* **Comando Executado:** `npm run build` na raiz do projeto
* **Resultado:** `tsc -b && vite build` finalizado com sucesso (`exit code 0`). Bundles gerados em `dist/assets/` com hash para cache de longa duração.
