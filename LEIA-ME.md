# Gestão Contábil

Aplicativo de computador (Windows e Mac) para escritórios de contabilidade controlarem as
obrigações Fiscais, Contábeis e de Departamento Pessoal de cada empresa atendida.

## Como as peças se encaixam

| Peça | O que é | Onde fica |
|---|---|---|
| **App** | O programa instalado em cada computador | pasta `src/` (telas) e `electron/` (janela) |
| **Banco de dados** | Onde ficam empresas, equipe e checklists, compartilhados por todos | Supabase (online) — regras em `supabase/migrations/` |
| **Função de usuários** | Cria/desativa usuários com segurança (o app não tem essa permissão) | `supabase/functions/admin-usuarios/` |
| **Função de conferência com IA** | Envia os arquivos à IA (Claude, da Anthropic) e guarda o resultado; a chave da IA fica só aqui | `supabase/functions/conferencia-ia/` |
| **Instalador** | O `.exe` que a equipe instala | gerado pelo GitHub (`.github/workflows/instalador.yml`) |

## Etapas

- [x] **Etapa 1** — Conta do escritório, login, perfis, equipe, cadastro de empresas, importação de planilha
- [x] **Etapa 2** — Modelos de checklist (vencimentos com feriados nacionais, aplicação automática, exceções por empresa)
- [x] **Etapa 3** — Checklists do mês (geração automática diária, situação, observação, anexos, histórico, tempo real)
- [x] **Etapa 4** — Painéis (Gestor: resumo, por área, por responsável, por empresa, grade; usuário: minhas tarefas)
- [x] **Conferência com IA** — balancete, conciliação bancária, guias de impostos, folha ou conferência livre, a partir dos anexos da tarefa ou de arquivos do computador; depois do resultado, perguntas à IA sobre a conferência
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

6. **Conferência com IA** (opcional):
   - Crie uma conta em <https://console.anthropic.com>, coloque créditos e gere uma **API key**.
   - No Supabase, menu *Edge Functions* › *Secrets* › *Add new secret*: nome `ANTHROPIC_API_KEY`, valor = a chave.
     **Nunca** coloque essa chave no `.env.production` nem no programa: ela é secreta.
   - *Edge Functions* › *Deploy a new function* › *Via Editor*. Nome: `conferencia-ia`. Cole o conteúdo de
     `supabase/functions/conferencia-ia/index.ts`, clique em *Deploy* e desligue **"Verify JWT"** (a função confere quem chama).
   - Opcionais (também em *Secrets*): `CONFERENCIA_IA_MODELO` (padrão `claude-opus-5-5`), `CONFERENCIA_IA_ESFORCO`
     (`low`, `medium`, `high` — padrão —, `xhigh`, `max`; mais esforço = mais cuidado, mais tempo e mais custo) e
     `CONFERENCIA_IA_LIMITE_DIA` (conferências + perguntas por pessoa por dia, padrão 30).

> Sobre a conferência com IA: os arquivos escolhidos são enviados à Anthropic só para aquela conferência e para as
> perguntas feitas sobre ela. Eles ficam guardados no Supabase, num armazenamento privado (`conferencias`) que só a
> função acessa, até a conferência ser apagada. O resultado e as perguntas ficam no histórico (*Conferência com IA*),
> visíveis ao Gestor, a quem pediu e a quem pode ver a empresa/tarefa.
> A IA é um apoio à revisão e pode errar — ela nunca muda a situação de uma tarefa. Cada conferência é cobrada pela
> Anthropic conforme o tamanho dos arquivos (acompanhe em console.anthropic.com). No plano gratuito do Supabase uma
> função pode rodar por até 150 segundos; se conferências grandes não terminarem, envie menos arquivos por vez ou
> use `CONFERENCIA_IA_ESFORCO=medium`.

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
node testes/e2e-conferencia-ia.cjs # tela de conferência com IA (a IA é simulada; não gasta créditos)
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
