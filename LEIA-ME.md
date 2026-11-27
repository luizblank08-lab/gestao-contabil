# Gestão Contábil

Aplicativo de computador (Windows e Mac) para escritórios de contabilidade controlarem as
obrigações Fiscais, Contábeis e de Departamento Pessoal de cada empresa atendida.

## Como as peças se encaixam

| Peça | O que é | Onde fica |
|---|---|---|
| **App** | O programa instalado em cada computador | pasta `src/` (telas) e `electron/` (janela) |
| **Banco de dados** | Onde ficam empresas, equipe e checklists, compartilhados por todos | Supabase (online) — regras em `supabase/migrations/` |
| **Função de usuários** | Cria/desativa usuários com segurança (o app não tem essa permissão) | `supabase/functions/admin-usuarios/` |
| **Instalador** | O `.exe` que a equipe instala | gerado pelo GitHub (`.github/workflows/instalador.yml`) |

## Etapas

- [x] **Etapa 1** — Conta do escritório, login, perfis, equipe, cadastro de empresas, importação de planilha
- [x] **Etapa 2** — Modelos de checklist (vencimentos com feriados nacionais, aplicação automática, exceções por empresa)
- [x] **Etapa 3** — Checklists do mês (geração automática diária, situação, observação, anexos, histórico, tempo real)
- [x] **Etapa 4** — Painéis (Gestor: resumo, por área, por responsável, por empresa, grade; usuário: minhas tarefas)
- [ ] Etapa 5 — Notificações, bandeja, iniciar com o Windows, atualização automática
- [ ] Etapa 6 — E-mails, PDF/Excel, backup

## Preparar o banco de dados (uma única vez)

1. Crie uma conta em <https://supabase.com> e um projeto novo (região **South America (São Paulo)**).
   Guarde a senha do banco num lugar seguro.
2. **Tabelas e regras:** menu *SQL Editor* › *New query* › cole todo o conteúdo de
   `supabase/instalar-banco.sql` › *Run*. Deve aparecer "Success".
3. **Função de usuários:** menu *Edge Functions* › *Deploy a new function* › *Via Editor*.
   Nome: `admin-usuarios`. Apague o exemplo, cole o conteúdo de
   `supabase/functions/admin-usuarios/index.ts` e clique em *Deploy*. Depois, nos detalhes da
   função, desligue **"Verify JWT"** (a própria função confere quem está chamando).
4. **Login:** menu *Authentication*:
   - *Sign In / Providers* › *Email*: desligue **"Confirm email"**.
   - *Emails* › *Templates* › **Reset Password**: assunto "Código para redefinir sua senha" e
     cole o conteúdo de `supabase/templates/recuperar_senha.html`.
5. **Dados de conexão:** *Project Settings* › *API Keys*: copie o **Project URL** e a
   chave **publishable** (ou "anon"). Essa chave é pública por natureza — a segurança está nas
   regras do banco.

> Observação sobre e-mails: o serviço de e-mail gratuito que vem no Supabase envia poucos
> e-mails por hora e só para endereços da sua conta Supabase. Para o "esqueci minha senha"
> funcionar para toda a equipe, configure um serviço de e-mail próprio (Etapa 6). Enquanto
> isso, o Gestor pode redefinir a senha de qualquer pessoa em *Equipe* › *Redefinir senha*.

## Testar no computador (para desenvolvimento)

```bash
npm install
cp .env.example .env.local   # preencha com o Project URL e a chave
npm run dev                  # abre o app com recarregamento automático
```

Testes automáticos:

```bash
npm test                     # validação de CNPJ, formatos e leitura de planilha
npm run test:banco           # regras de acesso do banco (precisa de PostgreSQL local)
node testes/e2e-etapa1.cjs   # telas de ponta a ponta (precisa de: npx supabase start; npx vite)
node testes/e2e-etapa2.cjs   # telas da Etapa 2 (modelos e obrigações)
node testes/e2e-etapa3-4.cjs # telas das Etapas 3 e 4 (checklists, anexos, painéis)
node testes/e2e-importacoes.cjs # histórico de importações com "Desfazer"
node testes/e2e-revisao.cjs  # Gestor devolve tarefa para correção
xvfb-run -a node testes/electron-salvar-anexo.cjs   # "Salvar como" no programa de computador
```

## Gerar o instalador e distribuir para a equipe

O GitHub gera o `.exe` num computador Windows. A conexão com o banco do escritório fica no
arquivo `.env.production` (endereço e chave pública — nunca a chave secreta).

**Publicar uma versão nova** (todos os computadores se atualizam sozinhos):
1. Aumente a versão em `package.json` (ex.: `0.3.1` → `0.4.0`).
2. *Actions › Gerar instalador › Run workflow*, marque **publicar** e confirme.
3. Em alguns minutos a versão aparece em *Releases*. Cada computador baixa ao abrir o app
   (ou a cada 4 horas) e instala ao fechar — ou na hora, em "Reiniciar e atualizar".

**Instalar em um computador novo:** baixe sempre a versão mais recente neste link fixo
(o repositório precisa estar público):

https://github.com/luizblank08-lab/gestao-contabil/releases/latest/download/GestaoContabil-Setup.exe

**Só testar** (sem publicar): rode o mesmo fluxo com "publicar" desmarcado; o arquivo fica em *Artifacts*.
