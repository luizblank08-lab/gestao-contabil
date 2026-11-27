import { describe, expect, it } from 'vitest';
import {
  classificarArquivo, conferirLimites, decodificarTexto, linhasParaTexto, paraBase64, prepararArquivo, sugerirTipo,
  type ArquivoPreparado,
} from '../conferenciaIA';

describe('conferência com IA: arquivos', () => {
  it('classifica pelo formato', () => {
    expect(classificarArquivo('Balancete 11-2026.PDF')).toBe('pdf');
    expect(classificarArquivo('guia.jpeg')).toBe('imagem');
    expect(classificarArquivo('razao.xlsx')).toBe('planilha');
    expect(classificarArquivo('extrato.ofx')).toBe('texto');
    expect(classificarArquivo('antigo.xls')).toBeNull();
    expect(classificarArquivo('sem-extensao')).toBeNull();
  });

  it('converte planilha em texto separado por ponto e vírgula', () => {
    const texto = linhasParaTexto([
      ['Conta', 'Descrição', 'Saldo', null],
      ['1.1.1', 'Caixa; geral', 1234.56, null],
      [null, null, null],
      ['1.1.2', 'Bancos', new Date('2026-11-30T00:00:00Z'), ''],
    ]);
    expect(texto).toBe('Conta;Descrição;Saldo\n1.1.1;Caixa geral;1234,56\n1.1.2;Bancos;30/11/2026');
  });

  it('lê texto em UTF-8 ou Latin-1 (arquivos de banco)', () => {
    expect(decodificarTexto(new TextEncoder().encode('Tarifa bancária').buffer)).toBe('Tarifa bancária');
    const latin1 = new Uint8Array([84, 97, 114, 105, 102, 97, 32, 98, 97, 110, 99, 0xe1, 114, 105, 97]);
    expect(decodificarTexto(latin1.buffer)).toBe('Tarifa bancária');
  });

  it('gera base64 igual ao padrão', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 conferência');
    expect(paraBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('prepara CSV como texto e PDF como base64', async () => {
    const csv = await prepararArquivo('extrato.csv', new Blob(['data;valor\n01/11/2026;-10,00']));
    expect(csv).toMatchObject({ nome: 'extrato.csv', tipo: 'texto', dados: 'data;valor\n01/11/2026;-10,00' });
    const pdf = await prepararArquivo('guia.pdf', new Blob(['%PDF-1.7']));
    expect(pdf).toMatchObject({ tipo: 'pdf', dados: Buffer.from('%PDF-1.7').toString('base64') });
  });

  it('recusa formatos não aceitos e arquivos vazios', async () => {
    await expect(prepararArquivo('antigo.xls', new Blob(['x']))).rejects.toThrow(/\.xlsx/);
    await expect(prepararArquivo('nota.docx', new Blob(['x']))).rejects.toThrow(/formato não aceito/);
    await expect(prepararArquivo('vazio.csv', new Blob([]))).rejects.toThrow(/vazio/);
  });

  it('respeita os limites de quantidade e tamanho', () => {
    const arq = (n: number): ArquivoPreparado => ({ nome: 'a.txt', tipo: 'texto', dados: 'x'.repeat(n), tamanho: n });
    expect(conferirLimites([])).toMatch(/pelo menos um/);
    expect(conferirLimites(Array.from({ length: 11 }, () => arq(1)))).toMatch(/no máximo 10/);
    expect(conferirLimites([arq(21 * 1024 * 1024)])).toMatch(/20 MB/);
    expect(conferirLimites([arq(10)])).toBeNull();
  });
});

describe('conferência com IA: tipo sugerido pela tarefa', () => {
  it('reconhece as tarefas comuns', () => {
    expect(sugerirTipo('Conciliação bancária')).toBe('conciliacao_bancaria');
    expect(sugerirTipo('Balancete mensal')).toBe('balancete');
    expect(sugerirTipo('Folha de pagamento')).toBe('folha');
    expect(sugerirTipo('DAS - Simples Nacional')).toBe('guias_impostos');
    expect(sugerirTipo('EFD Contribuições (PIS/COFINS)')).toBe('guias_impostos');
    expect(sugerirTipo('Reunião com cliente')).toBe('livre');
  });
});
