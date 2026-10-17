// Regras determinísticas de qualidade (o "lint" do backlog). Não dependem do LLM.
export function auditarRequisitos(req) {
  const problemas = [];
  const ids = new Set();
  for (const ep of req.epicos) {
    if (ep.historias.length === 0) problemas.push(`${ep.id}: épico sem histórias`);
    for (const h of ep.historias) {
      if (ids.has(h.id)) problemas.push(`${h.id}: id duplicado`);
      ids.add(h.id);
      if (h.criterios.length < 2) problemas.push(`${h.id}: menos de 2 critérios de aceite`);
      const semGwt = h.criterios.filter((c) => !/dado/i.test(c) || !/ent[ãa]o/i.test(c));
      if (semGwt.length) problemas.push(`${h.id}: ${semGwt.length} critério(s) fora do formato Dado/Quando/Então`);
      if (h.tarefas.length === 0) problemas.push(`${h.id}: sem decomposição em tarefas`);
    }
  }
  // Rastreabilidade: toda mudança precisa apontar para histórias que existem.
  for (const m of req.mudancas) {
    const orfas = m.afeta.filter((id) => !ids.has(id));
    if (orfas.length) problemas.push(`mudança "${m.descricao.slice(0, 40)}..." aponta para ids inexistentes: ${orfas.join(', ')}`);
  }
  return { historias: ids.size, problemas };
}
