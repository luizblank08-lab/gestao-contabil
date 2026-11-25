// Formulário de cadastro/edição de empresa (somente Gestor).
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Badge, Button, Tabs, Chip, Divider, Group, Modal, Radio, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconAlertTriangle } from '@tabler/icons-react';
import { ATIVIDADES, REGIMES, UFS, type Area } from '../../lib/constantes';
import { limparCnpj, mascaraCnpj, validarCnpj } from '../../lib/cnpj';
import { emailValido, mascaraTelefone } from '../../lib/formatos';
import { municipiosDaUf } from '../../lib/municipios';
import { supabase } from '../../lib/supabase';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import type { Empresa, Membro } from '../../lib/tipos';
import { useSessao } from '../../lib/sessao';
import { useModelos } from '../../lib/dados';
import { obrigacoesDaEmpresa } from '../../lib/modelos';
import { ObrigacoesEmpresa, useExcecoes } from './ObrigacoesEmpresa';

type Valores = {
  codigo: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  regime: string;
  atividades: string[];
  inscricao_estadual: string;
  inscricao_municipal: string;
  uf: string;
  municipio: string;
  possui_funcionarios: string;
  resp_fiscal_id: string | null;
  resp_contabil_id: string | null;
  resp_dp_id: string | null;
  contato_nome: string;
  contato_telefone: string;
  contato_email: string;
  observacoes: string;
  ativa: boolean;
};

function valoresIniciais(e?: Empresa | null): Valores {
  return {
    codigo: e?.codigo ?? '',
    cnpj: e?.cnpj ? mascaraCnpj(e.cnpj) : '',
    razao_social: e?.razao_social ?? '',
    nome_fantasia: e?.nome_fantasia ?? '',
    regime: e?.regime ?? '',
    atividades: e?.atividades ?? [],
    inscricao_estadual: e?.inscricao_estadual ?? '',
    inscricao_municipal: e?.inscricao_municipal ?? '',
    uf: e?.uf ?? '',
    municipio: e?.municipio ?? '',
    possui_funcionarios: e ? (e.possui_funcionarios ? 'sim' : 'nao') : 'nao',
    resp_fiscal_id: e?.resp_fiscal_id ?? null,
    resp_contabil_id: e?.resp_contabil_id ?? null,
    resp_dp_id: e?.resp_dp_id ?? null,
    contato_nome: e?.contato_nome ?? '',
    contato_telefone: e?.contato_telefone ?? '',
    contato_email: e?.contato_email ?? '',
    observacoes: e?.observacoes ?? '',
    ativa: e?.ativa ?? true,
  };
}

const vazio = (s: string) => (s.trim() ? s.trim() : null);
const v_ok = (cnpj: string) => validarCnpj(cnpj);

export function EmpresaForm({
  aberto, aoFechar, empresa, membros,
}: { aberto: boolean; aoFechar: () => void; empresa: Empresa | null; membros: Membro[] }) {
  const { escritorio } = useSessao();
  const ativas = escritorio?.areas_ativas ?? [];
  const [salvando, setSalvando] = useState(false);
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [aba, setAba] = useState<string | null>('dados');
  const { modelos } = useModelos();
  const { excecoes, setExcecoes } = useExcecoes(empresa?.id ?? null);

  const form = useForm<Valores>({
    initialValues: valoresIniciais(empresa),
    validate: {
      // Só a razão social é obrigatória; o restante pode ser completado depois
      // (a empresa fica marcada como "cadastro incompleto").
      cnpj: (v) => (!v.trim() || validarCnpj(v) ? null : 'CNPJ inválido'),
      razao_social: (v) => (v.trim() ? null : 'Informe a razão social'),
      contato_email: (v) => (!v.trim() || emailValido(v) ? null : 'E-mail inválido'),
    },
  });

  useEffect(() => {
    if (aberto) {
      form.setValues(valoresIniciais(empresa));
      form.resetDirty(valoresIniciais(empresa));
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, empresa]);

  useEffect(() => {
    municipiosDaUf(form.values.uf).then(setMunicipios);
  }, [form.values.uf]);

  // Responsáveis possíveis por área: usuários ativos com aquela área (e gestores)
  const opcoes = useMemo(() => {
    const por = (area: Area) =>
      membros
        .filter((m) => m.ativo && (m.papel === 'gestor' || m.areas.includes(area)))
        .map((m) => ({ value: m.id, label: m.papel === 'gestor' ? `${m.nome} (Gestor)` : m.nome }));
    return { fiscal: por('fiscal'), contabil: por('contabil'), dp: por('dp') };
  }, [membros]);

  async function salvar(v: Valores) {
    setSalvando(true);
    const dados = {
      codigo: vazio(v.codigo),
      cnpj: v.cnpj.trim() ? limparCnpj(v.cnpj) : null,
      razao_social: v.razao_social.trim(),
      nome_fantasia: vazio(v.nome_fantasia),
      regime: v.regime || null,
      atividades: v.atividades,
      inscricao_estadual: vazio(v.inscricao_estadual),
      inscricao_municipal: vazio(v.inscricao_municipal),
      uf: v.uf || null,
      municipio: vazio(v.municipio),
      possui_funcionarios: v.possui_funcionarios === 'sim',
      resp_fiscal_id: v.resp_fiscal_id || null,
      resp_contabil_id: v.resp_contabil_id || null,
      resp_dp_id: v.resp_dp_id || null,
      contato_nome: vazio(v.contato_nome),
      contato_telefone: vazio(v.contato_telefone),
      contato_email: vazio(v.contato_email),
      observacoes: vazio(v.observacoes),
      ativa: v.ativa,
    };
    const sb = supabase();
    const { error } = empresa
      ? await sb.from('empresas').update(dados).eq('id', empresa.id)
      : await sb.from('empresas').insert(dados);
    setSalvando(false);
    if (error) return avisoErro(error);
    avisoSucesso(empresa ? 'Empresa atualizada.' : 'Empresa cadastrada.');
    aoFechar();
  }

  function excluir() {
    if (!empresa) return;
    modals.openConfirmModal({
      title: 'Excluir empresa?',
      children: (
        <Text size="sm">
          A empresa <b>{empresa.razao_social}</b> e todo o seu histórico serão apagados de forma definitiva.
          Se a empresa só deixou de ser atendida, prefira marcá-la como <b>inativa</b>.
        </Text>
      ),
      labels: { confirm: 'Excluir definitivamente', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const { error } = await supabase().from('empresas').delete().eq('id', empresa.id);
        if (error) return avisoErro(error);
        avisoSucesso('Empresa excluída.');
        aoFechar();
      },
    });
  }

  const faltando = [
    !v_ok(form.values.cnpj) && 'CNPJ',
    !form.values.regime && 'regime',
    form.values.atividades.length === 0 && 'atividade',
    !form.values.uf && 'UF',
    !form.values.municipio.trim() && 'município',
  ].filter(Boolean) as string[];

  const dadosRegra = {
    regime: (form.values.regime || null) as Empresa['regime'],
    atividades: form.values.atividades as Empresa['atividades'],
    possui_funcionarios: form.values.possui_funcionarios === 'sim',
  };
  const qtdObrigacoes = obrigacoesDaEmpresa(
    modelos.filter((m) => m.ativo && (escritorio?.areas_ativas ?? []).includes(m.area)), dadosRegra, excecoes,
  ).filter((o) => o.aplicada).length;

  return (
    <Modal opened={aberto} onClose={aoFechar} size="xl" title={<Text fw={600} size="lg">{empresa ? 'Editar empresa' : 'Nova empresa'}</Text>}>
      <form noValidate onSubmit={form.onSubmit(salvar)}>
        <Stack gap="md">
          {faltando.length > 0 && (
            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
              Cadastro incompleto — falta: {faltando.join(', ')}. Dá para salvar assim e completar depois,
              mas os checklists automáticos dependem desses dados.
            </Alert>
          )}
          <Tabs value={aba} onChange={setAba}>
            <Tabs.List mb="md">
              <Tabs.Tab value="dados">Dados da empresa</Tabs.Tab>
              <Tabs.Tab value="obrigacoes" rightSection={<Badge size="xs" variant="light">{qtdObrigacoes}</Badge>}>Obrigações</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="dados">
          <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <TextInput label="Código" description="Código interno do escritório" {...form.getInputProps('codigo')} />
            <TextInput
              label="CNPJ" placeholder="00.000.000/0000-00" description="Aceita o novo CNPJ com letras"
              {...form.getInputProps('cnpj')}
              onChange={(e) => form.setFieldValue('cnpj', mascaraCnpj(e.currentTarget.value))}
            />
            <TextInput label="Razão social" required description=" " style={{ gridColumn: 'span 2' }} {...form.getInputProps('razao_social')} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Nome fantasia" {...form.getInputProps('nome_fantasia')} />
            <Select label="Regime tributário" clearable data={REGIMES} {...form.getInputProps('regime')} />
            <div>
              <Text size="sm" fw={500} mb={6}>Atividade</Text>
              <Chip.Group multiple value={form.values.atividades} onChange={(v) => form.setFieldValue('atividades', v)}>
                <Group gap="xs">
                  {ATIVIDADES.map((a) => <Chip key={a.value} value={a.value} size="sm">{a.label}</Chip>)}
                </Group>
              </Chip.Group>
              {form.errors.atividades && <Text c="red" size="xs" mt={4}>{form.errors.atividades}</Text>}
            </div>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <TextInput label="Inscrição estadual" placeholder="Opcional" {...form.getInputProps('inscricao_estadual')} />
            <TextInput label="Inscrição municipal" placeholder="Opcional" {...form.getInputProps('inscricao_municipal')} />
            <Select label="UF" searchable clearable data={UFS} {...form.getInputProps('uf')}
              onChange={(v) => { form.setFieldValue('uf', v ?? ''); form.setFieldValue('municipio', ''); }} />
            <Autocomplete label="Município" data={municipios} limit={30} {...form.getInputProps('municipio')} />
          </SimpleGrid>
          <Radio.Group label="Possui funcionários?" {...form.getInputProps('possui_funcionarios')}>
            <Group mt={6}><Radio value="sim" label="Sim" /><Radio value="nao" label="Não" /></Group>
          </Radio.Group>

          <Divider label="Responsáveis" labelPosition="left" />
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            {ativas.includes('fiscal') && (
              <Select label="Responsável Fiscal" clearable searchable data={opcoes.fiscal}
                nothingFoundMessage="Nenhum usuário com a área Fiscal" {...form.getInputProps('resp_fiscal_id')} />
            )}
            {ativas.includes('contabil') && (
              <Select label="Responsável Contábil" clearable searchable data={opcoes.contabil}
                nothingFoundMessage="Nenhum usuário com a área Contábil" {...form.getInputProps('resp_contabil_id')} />
            )}
            {ativas.includes('dp') && (
              <Select label="Responsável Depto. Pessoal" clearable searchable data={opcoes.dp}
                nothingFoundMessage="Nenhum usuário com a área DP" {...form.getInputProps('resp_dp_id')} />
            )}
          </SimpleGrid>

          <Divider label="Contato do cliente" labelPosition="left" />
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Nome" {...form.getInputProps('contato_nome')} />
            <TextInput label="Telefone" placeholder="(00) 00000-0000" {...form.getInputProps('contato_telefone')}
              onChange={(e) => form.setFieldValue('contato_telefone', mascaraTelefone(e.currentTarget.value))} />
            <TextInput label="E-mail" {...form.getInputProps('contato_email')} />
          </SimpleGrid>
          <Textarea label="Observações" autosize minRows={2} maxRows={6} {...form.getInputProps('observacoes')} />
          <Switch label={form.values.ativa ? 'Empresa ativa' : 'Empresa inativa (não gera checklists)'}
            checked={form.values.ativa} onChange={(e) => form.setFieldValue('ativa', e.currentTarget.checked)} />
          </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="obrigacoes">
              <ObrigacoesEmpresa empresaId={empresa?.id ?? null} dados={dadosRegra} modelos={modelos} excecoes={excecoes} setExcecoes={setExcecoes} />
            </Tabs.Panel>
          </Tabs>

          <Group justify="space-between" mt="sm">
            {empresa ? <Button variant="subtle" color="red" onClick={excluir}>Excluir empresa</Button> : <span />}
            <Group>
              <Button variant="default" onClick={aoFechar}>Cancelar</Button>
              <Button type="submit" loading={salvando}>{empresa ? 'Salvar alterações' : 'Cadastrar empresa'}</Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
