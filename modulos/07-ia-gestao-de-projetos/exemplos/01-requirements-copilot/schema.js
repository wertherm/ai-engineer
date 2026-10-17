// Contrato do Requirements Copilot: o LLM só pode devolver algo que passe neste schema.
import { z } from 'zod';

export const Historia = z.object({
  id: z.string().describe('ex.: HU-01'),
  como: z.string().describe('persona, ex.: cliente'),
  quero: z.string(),
  para: z.string(),
  criterios: z.array(z.string()).describe('critérios de aceite no formato Dado/Quando/Então'),
  tarefas: z.array(z.string()).describe('decomposição técnica em tarefas curtas'),
});

export const Epico = z.object({
  id: z.string().describe('ex.: EP-01'),
  titulo: z.string(),
  historias: z.array(Historia),
});

export const Requisitos = z.object({
  epicos: z.array(Epico),
  mudancas: z.array(z.object({
    descricao: z.string(),
    afeta: z.array(z.string()).describe('ids das histórias afetadas'),
  })).describe('requisitos de mudança (change requests) citados no texto'),
  duvidas: z.array(z.string()).describe('ambiguidades a perguntar ao PO'),
});
