// Funções puras de priorização: RICE, WSJF, MoSCoW, roadmap por capacidade e alinhamento a OKRs.
// Tudo aqui é determinístico e testável; o LLM nunca calcula score.

// RICE = (Reach × Impact × Confidence) / Effort  (Intercom)
export const rice = (i) => (i.reach * i.impact * i.confidence) / i.effort;

// WSJF = Cost of Delay / Job Size, com CoD = valor de negócio + criticidade no tempo + redução de risco (SAFe)
export const wsjf = (i) => (i.businessValue + i.timeCriticality + i.riskReduction) / i.jobSize;

// MoSCoW por regra explícita (auditável), não por "feeling":
// Must = regulatório ou pré-requisito de um Must; Should = top 50% em WSJF; Could = resto com OKR; Won't = sem OKR.
export function moscow(itens) {
  const ordenados = [...itens].sort((a, b) => wsjf(b) - wsjf(a));
  const metade = Math.ceil(ordenados.length / 2);
  const classe = new Map();
  for (const i of itens) if (i.regulatorio) classe.set(i.id, 'Must');
  // Propaga Must para dependências (não dá para entregar um Must sem o que ele precisa).
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const i of itens) if (classe.get(i.id) === 'Must') for (const d of i.dependeDe)
      if (classe.get(d) !== 'Must') { classe.set(d, 'Must'); mudou = true; }
  }
  ordenados.forEach((i, pos) => {
    if (classe.has(i.id)) return;
    if (!i.kr) classe.set(i.id, "Won't");
    else classe.set(i.id, pos < metade ? 'Should' : 'Could');
  });
  return classe;
}

// Roadmap guloso: ordem MoSCoW > WSJF, respeitando dependências e capacidade (jobSize) por sprint.
export function roadmap(itens, capacidade, classes) {
  const peso = { Must: 0, Should: 1, Could: 2, "Won't": 9 };
  const fila = itens.filter((i) => classes.get(i.id) !== "Won't")
    .sort((a, b) => peso[classes.get(a.id)] - peso[classes.get(b.id)] || wsjf(b) - wsjf(a));
  const sprints = [];
  const feito = new Map(); // id -> sprint em que termina
  while (fila.length) {
    const n = sprints.length + 1;
    let livre = capacidade;
    const sprint = [];
    for (const i of [...fila]) {
      // Dependência precisa ter terminado em sprint ANTERIOR.
      const depsOk = i.dependeDe.every((d) => feito.has(d) && feito.get(d) < n);
      if (depsOk && i.jobSize <= livre) {
        sprint.push(i.id); livre -= i.jobSize; fila.splice(fila.indexOf(i), 1);
      }
    }
    if (!sprint.length) throw new Error(`Item maior que a capacidade ou dependência impossível: ${fila.map((i) => i.id)}`);
    sprint.forEach((id) => feito.set(id, n));
    sprints.push(sprint);
  }
  return sprints;
}

// Alinhamento ao portfólio: quanto do esforço vai para cada KR e quais KRs estão sem iniciativa.
export function alinhamentoOkr(okrs, itens) {
  const total = itens.reduce((s, i) => s + i.jobSize, 0);
  const krs = okrs.flatMap((o) => o.krs.map((k) => ({ ...k, objetivo: o.id })));
  const porKr = krs.map((k) => {
    const doKr = itens.filter((i) => i.kr === k.id);
    return { kr: k.id, itens: doKr.map((i) => i.id), esforcoPct: Math.round((100 * doKr.reduce((s, i) => s + i.jobSize, 0)) / total) };
  });
  return {
    porKr,
    krsSemIniciativa: porKr.filter((k) => k.itens.length === 0).map((k) => k.kr),
    itensSemKr: itens.filter((i) => !i.kr).map((i) => i.id),
  };
}
