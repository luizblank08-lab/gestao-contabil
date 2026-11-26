export type EstadoAtualizacao = {
  estado: 'nenhuma' | 'verificando' | 'baixando' | 'pronta' | 'em_dia' | 'erro' | 'indisponivel';
  versao?: string;
  progresso?: number;
  ultimaVersaoEncontrada?: string;
};

declare global {
  interface Window {
    desktop?: {
      versao: () => Promise<string>;
      plataforma: string;
      salvarArquivo: (nome: string, dados: ArrayBuffer) => Promise<string | null>;
      mostrarArquivo: (caminho: string) => Promise<void>;
      atualizacao?: {
        estado: () => Promise<EstadoAtualizacao>;
        verificar: () => Promise<EstadoAtualizacao>;
        instalar: () => Promise<void>;
        aoMudar: (fn: (e: EstadoAtualizacao) => void) => () => void;
      };
    };
  }
}
