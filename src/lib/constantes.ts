export type Area = 'fiscal' | 'contabil' | 'dp';
export type Regime = 'mei' | 'simples' | 'presumido' | 'real';
export type Atividade = 'comercio' | 'servico' | 'industria';

export const AREAS: { value: Area; label: string; cor: string }[] = [
  { value: 'fiscal', label: 'Fiscal', cor: 'blue' },
  { value: 'contabil', label: 'Contábil', cor: 'grape' },
  { value: 'dp', label: 'Departamento Pessoal', cor: 'teal' },
];

export const REGIMES: { value: Regime; label: string }[] = [
  { value: 'mei', label: 'MEI' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'presumido', label: 'Lucro Presumido' },
  { value: 'real', label: 'Lucro Real' },
];

export const ATIVIDADES: { value: Atividade; label: string }[] = [
  { value: 'comercio', label: 'Comércio' },
  { value: 'servico', label: 'Serviço' },
  { value: 'industria', label: 'Indústria' },
];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const rotuloArea = (a: string) => AREAS.find((x) => x.value === a)?.label ?? a;
export const corArea = (a: string) => AREAS.find((x) => x.value === a)?.cor ?? 'gray';
export const rotuloRegime = (r: string) => REGIMES.find((x) => x.value === r)?.label ?? r;
export const rotuloAtividade = (a: string) => ATIVIDADES.find((x) => x.value === a)?.label ?? a;
