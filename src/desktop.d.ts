export {};
declare global {
  interface Window {
    desktop?: { versao: () => Promise<string>; plataforma: string };
  }
}
