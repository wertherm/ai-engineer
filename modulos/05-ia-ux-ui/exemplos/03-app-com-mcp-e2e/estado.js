// Estado da aplicação (em memória). A UI web e o servidor MCP leem e escrevem o MESMO estado:
// é isso que permite a um agente agir pela interface e conferir o resultado pelo MCP.
export function criarEstado() {
  let tarefas = [];
  let proximoId = 1;
  return {
    listar: () => tarefas.map((t) => ({ ...t })),
    adicionar(titulo) {
      const t = { id: proximoId++, titulo: String(titulo).trim(), concluida: false };
      if (!t.titulo) throw new Error('Título vazio');
      tarefas.push(t);
      return { ...t };
    },
    concluir(id) {
      const t = tarefas.find((x) => x.id === Number(id));
      if (!t) return null;
      t.concluida = true;
      return { ...t };
    },
    resetar() { tarefas = []; proximoId = 1; },
  };
}
