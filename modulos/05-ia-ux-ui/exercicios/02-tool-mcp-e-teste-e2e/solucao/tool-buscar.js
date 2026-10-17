// Tool nova: buscar_tarefas (filtro por texto e por status). Registrada SEM editar o exemplo 03:
// usamos o gancho `extrasMcp` de criarApp(), que repassa (server, estado) para esta função.
import { z } from 'zod';

export function registrarBuscarTarefas(server, estado) {
  server.registerTool('buscar_tarefas', {
    description: 'Busca tarefas por trecho do título (sem diferenciar maiúsculas/acentos) e/ou status',
    inputSchema: {
      texto: z.string().max(80).optional(),
      concluida: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ texto, concluida }) => {
    // normalize('NFD') + remoção de diacríticos: "cafe" encontra "Café".
    const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const achadas = estado.listar().filter((t) =>
      (texto === undefined || norm(t.titulo).includes(norm(texto))) &&
      (concluida === undefined || t.concluida === concluida));
    return { content: [{ type: 'text', text: JSON.stringify(achadas) }] };
  });
}
