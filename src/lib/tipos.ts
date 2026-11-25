import type { Area, Atividade, Regime } from './constantes';

export type Escritorio = {
  id: string;
  nome: string;
  cnpj: string | null;
  areas_ativas: Area[];
};

export type Membro = {
  id: string;
  escritorio_id: string;
  nome: string;
  email: string;
  papel: 'gestor' | 'usuario';
  areas: Area[];
  todas_empresas: boolean;
  ativo: boolean;
  trocar_senha: boolean;
  criado_em: string;
};

export type Empresa = {
  id: string;
  escritorio_id: string;
  codigo: string | null;
  cnpj: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  regime: Regime | null;
  atividades: Atividade[];
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  uf: string | null;
  municipio: string | null;
  possui_funcionarios: boolean;
  resp_fiscal_id: string | null;
  resp_contabil_id: string | null;
  resp_dp_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  observacoes: string | null;
  ativa: boolean;
  cadastro_completo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type Periodicidade = 'mensal' | 'trimestral' | 'anual';
export type TipoVencimento = 'dia_fixo' | 'dia_util' | 'ultimo_dia_util';
export type Ajuste = 'antecipa' | 'posterga' | 'nenhum';

export type Modelo = {
  id: string;
  escritorio_id: string;
  codigo_padrao: string | null;
  nome: string;
  descricao: string | null;
  area: Area;
  periodicidade: Periodicidade;
  tipo_vencimento: TipoVencimento;
  dia: number | null;
  meses_apos: number;
  ajuste: Ajuste;
  regimes: Regime[];
  atividades: Atividade[];
  somente_com_funcionarios: boolean;
  ativo: boolean;
  ordem: number;
};

export type Excecao = { empresa_id: string; modelo_id: string; incluir: boolean };
