// Importar empresas e responsáveis a partir de uma planilha Excel (Gestor).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion, Alert, Badge, Button, Group, List, Modal, Paper, ScrollArea, Select, Stack, Table, Text, ThemeIcon,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconFileSpreadsheet, IconUpload, IconUserPlus } from '@tabler/icons-react';
import readXlsxFile from 'read-excel-file';
import { lerLinhas, sugerirMembro, type ResultadoLeitura } from '../../lib/planilha';
import { corArea, rotuloArea, type Area } from '../../lib/constantes';
import { supabase } from '../../lib/supabase';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import type { Empresa, Membro } from '../../lib/tipos';
import { AcessoCriado, FormMembro } from './Equipe';

export function ImportarPlanilha({
  aberto, aoFechar, membros, empresas,
}: { aberto: boolean; aoFechar: () => void; membros: Membro[]; empresas: Empresa[] }) {
  const [arquivo, setArquivo] = useState<string>('');
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);
  const [vinculo, setVinculo] = useState<Record<string, string | null>>({});
  const [arrastando, setArrastando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [novaPessoa, setNovaPessoa] = useState<{ chave: string; nome: string; areas: Area[] } | null>(null);
  const [versaoForm, setVersaoForm] = useState(0);
  const [acesso, setAcesso] = useState<{ nome: string; email: string; senha: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) {
      setArquivo('');
      setLeitura(null);
      setVinculo({});
    }
  }, [aberto]);

  // Sugere automaticamente o usuário para cada nome ainda sem vínculo (inclusive após cadastrar alguém)
  useEffect(() => {
    if (!leitura) return;
    setVinculo((atual) => {
      const novo = { ...atual };
      for (const chave of leitura.pessoas.keys()) {
        if (!novo[chave]) novo[chave] = sugerirMembro(chave, membros);
      }
      return novo;
    });
  }, [leitura, membros]);

  async function abrirArquivo(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      avisoErro(new Error('Use um arquivo do Excel no formato .xlsx (em "Salvar como", escolha "Pasta de Trabalho do Excel").'));
      return;
    }
    try {
      const linhas = await readXlsxFile(f);
      setArquivo(f.name);
      setVinculo({});
      setLeitura(lerLinhas(linhas as unknown as (string | number | null)[][]));
    } catch (e) {
      avisoErro(new Error('Não consegui ler a planilha: ' + ((e as Error).message || e)));
    }
  }

  const codigosExistentes = useMemo(() => new Set(empresas.map((e) => e.codigo).filter(Boolean)), [empresas]);
  const pessoas = useMemo(() => (leitura ? [...leitura.pessoas.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome)) : []), [leitura]);
  const comAviso = leitura?.linhas.filter((l) => l.avisos.length > 0) ?? [];
  const bloqueadas = leitura?.linhas.filter((l) => !l.codigo || !l.razao_social || l.avisos.some((a) => a.startsWith('código repetido'))) ?? [];
  const novas = leitura?.linhas.filter((l) => l.codigo && !codigosExistentes.has(l.codigo)).length ?? 0;

  // Pessoa vinculada sem a área necessária (o banco recusaria)
  const conflitos = pessoas.flatMap(([chave, p]) => {
    const m = membros.find((x) => x.id === vinculo[chave]);
    if (!m || m.papel === 'gestor') return [];
    const faltam = [...p.areas].filter((a) => !m.areas.includes(a));
    return faltam.length ? [`${p.nome} está ligado(a) a ${m.nome}, que não tem a área ${faltam.map(rotuloArea).join(' e ')}. Ajuste em Equipe.`] : [];
  });
  const semVinculo = pessoas.filter(([chave]) => !vinculo[chave]);

  async function importar() {
    if (!leitura) return;
    setImportando(true);
    const itens = leitura.linhas
      .filter((l) => !bloqueadas.includes(l))
      .map((l) => ({
        codigo: l.codigo,
        razao_social: l.razao_social,
        cnpj: l.cnpj ?? '',
        regime: l.regime ?? '',
        resp_fiscal_id: (l.responsaveis.fiscal && vinculo[l.responsaveis.fiscal]) || '',
        resp_contabil_id: (l.responsaveis.contabil && vinculo[l.responsaveis.contabil]) || '',
        resp_dp_id: (l.responsaveis.dp && vinculo[l.responsaveis.dp]) || '',
      }));
    const { data, error } = await supabase().rpc('importar_empresas', { p_itens: itens });
    setImportando(false);
    if (error) return avisoErro(error);
    avisoSucesso(`Importação concluída: ${data.criadas} empresa(s) nova(s) e ${data.atualizadas} atualizada(s).`);
    aoFechar();
  }

  return (
    <Modal opened={aberto} onClose={aoFechar} size={980} title={<Text fw={600} size="lg">Importar empresas de uma planilha</Text>}>
      <Stack>
        <Paper
          withBorder
          p="lg"
          radius="md"
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: arrastando ? 'var(--mantine-color-indigo-5)' : undefined,
            background: arrastando ? 'var(--mantine-color-indigo-0)' : undefined,
            cursor: 'pointer',
          }}
          onClick={() => entrada.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); abrirArquivo(e.dataTransfer.files[0]); }}
        >
          <Group justify="center" gap="md">
            <ThemeIcon size={44} radius="md" variant="light">{arquivo ? <IconFileSpreadsheet /> : <IconUpload />}</ThemeIcon>
            <div>
              <Text fw={600}>{arquivo || 'Arraste a planilha aqui ou clique para escolher'}</Text>
              <Text size="sm" c="dimmed">
                Arquivo .xlsx com as colunas: Código, Empresa, Classificação tributária (regime), Responsável Escrita/Fiscal,
                Responsável Contábil. CNPJ e Responsável DP são opcionais.
              </Text>
            </div>
          </Group>
          <input ref={entrada} type="file" accept=".xlsx" hidden data-testid="arquivo-planilha"
            onChange={(e) => { abrirArquivo(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
        </Paper>

        {leitura && leitura.erros.length > 0 && (
          <Alert color="red" title="Não foi possível usar esta planilha"><List size="sm">{leitura.erros.map((e) => <List.Item key={e}>{e}</List.Item>)}</List></Alert>
        )}

        {leitura && leitura.erros.length === 0 && (
          <>
            <Group gap="xs">
              <Badge size="lg" variant="light">{leitura.linhas.length} empresas na planilha</Badge>
              <Badge size="lg" variant="light" color="green">{novas} nova(s)</Badge>
              <Badge size="lg" variant="light" color="gray">{leitura.linhas.length - novas} já cadastrada(s) — serão atualizadas</Badge>
              {comAviso.length > 0 && <Badge size="lg" variant="light" color="yellow">{comAviso.length} com observações</Badge>}
            </Group>

            <div>
              <Text fw={600} mb={4}>Quem é quem na equipe</Text>
              <Text size="sm" c="dimmed" mb="xs">
                Ligue cada nome da planilha a um usuário. Quem ainda não tem acesso pode ser cadastrado agora
                (você precisará do e-mail da pessoa). Nomes sem ligação entram sem responsável e podem ser ajustados depois —
                basta importar a planilha de novo.
              </Text>
              <Paper withBorder radius="md">
                <Table verticalSpacing={6}>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Nome na planilha</Table.Th><Table.Th>Áreas</Table.Th><Table.Th>Empresas</Table.Th><Table.Th w={330}>Usuário no app</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pessoas.map(([chave, p]) => (
                      <Table.Tr key={chave}>
                        <Table.Td><Text fw={500} size="sm">{p.nome}</Text></Table.Td>
                        <Table.Td><Group gap={4}>{[...p.areas].map((a) => <Badge key={a} size="sm" variant="light" color={corArea(a)}>{rotuloArea(a)}</Badge>)}</Group></Table.Td>
                        <Table.Td><Text size="sm">{p.empresas}</Text></Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Select
                              aria-label={`Usuário para ${p.nome}`}
                              placeholder="Sem ligação"
                              size="xs"
                              style={{ flex: 1 }}
                              clearable
                              searchable
                              value={vinculo[chave] ?? null}
                              onChange={(v) => setVinculo((x) => ({ ...x, [chave]: v }))}
                              data={membros.filter((m) => m.ativo).map((m) => ({ value: m.id, label: m.papel === 'gestor' ? `${m.nome} (Gestor)` : m.nome }))}
                            />
                            {!vinculo[chave] && (
                              <Button size="xs" variant="light" leftSection={<IconUserPlus size={14} />}
                                onClick={() => { setVersaoForm((v) => v + 1); setNovaPessoa({ chave, nome: p.nome, areas: [...p.areas] }); }}>
                                Cadastrar
                              </Button>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </div>

            {conflitos.length > 0 && (
              <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Ajuste antes de importar">
                <List size="sm">{conflitos.map((c) => <List.Item key={c}>{c}</List.Item>)}</List>
              </Alert>
            )}

            {comAviso.length > 0 && (
              <Accordion variant="contained" radius="md">
                <Accordion.Item value="avisos">
                  <Accordion.Control icon={<IconAlertTriangle size={18} color="var(--mantine-color-yellow-7)" />}>
                    {comAviso.length} empresa(s) com observações — serão importadas e ficarão para completar
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ScrollArea.Autosize mah={220}>
                      <Table verticalSpacing={4} fz="sm">
                        <Table.Tbody>
                          {comAviso.map((l) => (
                            <Table.Tr key={l.linha}>
                              <Table.Td c="dimmed" w={70}>linha {l.linha}</Table.Td>
                              <Table.Td w={70}>{l.codigo}</Table.Td>
                              <Table.Td>{l.razao_social}</Table.Td>
                              <Table.Td c="orange.8">{l.avisos.join('; ')}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea.Autosize>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

            {bloqueadas.length > 0 && (
              <Alert color="orange">{bloqueadas.length} linha(s) sem código, sem nome ou com código repetido não serão importadas.</Alert>
            )}

            <Alert color="blue" variant="light">
              As empresas entram como <b>cadastro incompleto</b> quando faltam CNPJ, regime, atividade, UF ou município.
              Elas aparecem sinalizadas na lista de Empresas para você completar.
            </Alert>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">{semVinculo.length > 0 ? `${semVinculo.length} nome(s) sem ligação ficarão sem responsável.` : 'Todos os nomes estão ligados.'}</Text>
              <Group>
                <Button variant="default" onClick={aoFechar}>Cancelar</Button>
                <Button leftSection={<IconCheck size={18} />} loading={importando} disabled={conflitos.length > 0} onClick={importar}>
                  Importar {leitura.linhas.length - bloqueadas.length} empresa(s)
                </Button>
              </Group>
            </Group>
          </>
        )}
      </Stack>

      <FormMembro
        key={versaoForm}
        aberto={!!novaPessoa}
        aoFechar={() => setNovaPessoa(null)}
        membro={null}
        empresas={[]}
        empresasDoMembro={[]}
        inicial={novaPessoa ? { nome: novaPessoa.nome, areas: novaPessoa.areas } : undefined}
        aoCriar={(info) => setAcesso(info)}
        aoSalvar={() => {}}
        souEu={false}
      />
      <AcessoCriado info={acesso} aoFechar={() => setAcesso(null)} />
    </Modal>
  );
}
