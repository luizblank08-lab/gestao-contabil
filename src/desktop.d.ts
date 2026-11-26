export {};
declare global {
  interface Window {
    desktop?: {
      versao: () => Promise<string>;
      plataforma: string;
      salvarArquivo: (nome: string, dados: ArrayBuffer) => Promise<string | null>;
      mostrarArquivo: (caminho: string) => Promise<void>;
    };
  }
}
