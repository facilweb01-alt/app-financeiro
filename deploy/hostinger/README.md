# Mudança do app do Render para o VPS da Hostinger (custo zero)

Decisão do Marcelo (05/11/2026): sem clientes por enquanto, tirar o único custo
mensal do sistema (Render Starter, ~US$ 7) sem parar o WhatsApp, e **sem
prejudicar o que já roda no VPS** (Evolution, n8n, Traefik).

## O VPS (conferido em 05/11)
- srv1935413.hstgr.cloud, KVM 1 (1 vCPU, 4 GB), IP 2.25.102.73, vence 27/08/2027.
- Uso: CPU 4%, memória 32% (~1,3 GB), disco 9/50 GB.
- Projetos Docker: `evolution` (2 contêineres), `n8n-scjh`, `traefik` (rede host,
  Let's Encrypt por HTTP challenge, só publica contêiner com `traefik.enable=true`).
- O app entra como projeto novo `contay`, com teto de 768 MB e 0,75 CPU.

## Como a imagem chega
- `.github/workflows/imagem-docker.yml` constrói a imagem no GitHub a cada push
  no `main` e publica em `ghcr.io/facilweb01-alt/app-financeiro` (pública).
- O VPS só baixa a imagem: nada de build no servidor.

## Passo a passo
1. Mesclar o PR com o Dockerfile/workflow → conferir a Action "Imagem Docker" verde.
2. GitHub → Packages → `app-financeiro` → Package settings → visibilidade **Public**
   (senão o VPS precisa de login no ghcr).
3. Hostinger → VPS → Gerenciador Docker → Compose → projeto `contay`, colar
   `deploy/hostinger/docker-compose.yml` no Editor .yaml.
4. **Marcelo**: no Render (app-financeiro → Environment → Export) copiar as
   variáveis e colar no campo **Ambiente** do projeto `contay` (o Claude não
   digita credenciais). Conferir `APP_URL=https://contay.com.br` e trocar
   `AUTOMACOES_WHATSAPP` para `0` (ver passo 5).
5. Implantar. Testar em `https://contay.srv1935413.hstgr.cloud` (página,
   /api/health, login, lançamento de teste) **com o Render ainda no ar**.
   Durante o teste, deixar `AUTOMACOES_WHATSAPP=0` no Ambiente do VPS: assim só
   o Render manda as mensagens automáticas e ninguém recebe mensagem repetida.
   Trocar para `1` só depois de suspender o Render (passo 8).
6. Trocar os endereços que apontam para `app-financeiro-yswn.onrender.com`:
   n8n (nós HTTP que chamam o app), webhook do Asaas, `MAIN_APP_URL` do painel.
7. Registro.br (Marcelo entra na conta): `A contay.com.br → 2.25.102.73` e
   `www` → CNAME `contay.com.br` (ou A no mesmo IP). Esperar propagar e o
   Traefik emitir o certificado.
8. Conferir tudo em contay.com.br; então **suspender** o serviço
   `app-financeiro` no Render (Settings → Suspend). Isso para a cobrança.
   Logo depois, no Ambiente do VPS, `AUTOMACOES_WHATSAPP=1` e Implantar de novo.

## Voltar atrás (se algo der errado)
- Antes do passo 7: só parar/apagar o projeto `contay` no Hostinger. Nada muda.
- Depois do passo 7: devolver o DNS (`A → 216.24.57.1`, `www CNAME →
  app-financeiro-yswn.onrender.com`) e retomar o serviço no Render.
