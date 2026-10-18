// Registro de ferramentas de um harness de agentes. Sem dependências (Node 22+).
//
// Versão "endurecida" do padrão `tools/index.js` do jps-agents (estudo-de-caso/): o mesmo formato simples de
// ferramenta ({nome, descrição, esquema, executar}), acrescido do que o original não tinha:
//   - contrato validado no cadastro (nome, descrição útil, esquema fechado e SUPORTADO, nível de risco declarado) e cópia
//     congelada da ferramenta: mudar o objeto depois do cadastro não muda o risco nem o esquema em vigor;
//   - validação dos argumentos contra o esquema ANTES de executar (o modelo erra, mente e é induzido por injeção), sobre uma
//     CÓPIA dos argumentos (o que foi validado e aprovado é exatamente o que executa);
//   - permissões por nível de risco e aprovação humana para o que é irreversível (erro na aprovação = negado);
//   - timeout, limite de saída, segredos mascarados na saída e erros estruturados (sem stack trace);
//   - auditoria de cada chamada (quem, o quê, risco, resultado, duração) sem gravar os VALORES dos argumentos.
//
// Limites que continuam valendo: o timeout NÃO mata o código da ferramenta (JavaScript não permite): a ferramenta precisa
// respeitar `signal`. Enquanto uma ferramenta que estourou o tempo não terminar, novas chamadas a ela são recusadas
// (`ferramenta_ocupada`) para não acumular execuções em paralelo.
import { limparSaida, mascararSegredos, paraTerminal, temControle } from '../../../ferramentas/comum.mjs';

export const RISCOS = ['leitura', 'escrita', 'irreversivel'];
const NOME = /^[a-z][a-z0-9_]{2,40}$/;
const TIPOS_JSON = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];
const PALAVRAS = new Set(['type', 'enum', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'items', 'properties', 'required', 'additionalProperties', 'minItems', 'maxItems', 'description', 'title', 'default']);
const PROFUNDIDADE_MAX = 8;
const MAX_PROBLEMAS = 20;

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const nomeSeguro = (k) => String(k).replace(/[^\w.-]/g, '?').slice(0, 40);

/**
 * Confere se o ESQUEMA usa só o que `validarEsquema` realmente aplica. Palavras-chave não suportadas (oneOf, $ref, format...)
 * seriam ignoradas em silêncio e a validação pareceria existir sem existir: por isso são recusadas no cadastro.
 * Devolve uma lista de problemas (vazia = esquema aceito).
 */
export function verificarEsquema(e, caminho = 'esquema', prof = 0) {
  if (prof > PROFUNDIDADE_MAX) return [`${caminho}: aninhamento maior que ${PROFUNDIDADE_MAX} níveis`];
  if (!ehObjetoSimples(e)) return [`${caminho}: deve ser um objeto`];
  const p = [];
  for (const k of Object.keys(e)) if (!PALAVRAS.has(k)) p.push(`${caminho}.${nomeSeguro(k)}: palavra-chave não suportada (seria ignorada na validação)`);
  if (e.type !== undefined && !TIPOS_JSON.includes(e.type)) p.push(`${caminho}.type: use um de ${TIPOS_JSON.join(', ')}`);
  if (e.enum !== undefined && (!Array.isArray(e.enum) || !e.enum.length || e.enum.some((v) => v !== null && !['string', 'number', 'boolean'].includes(typeof v)))) {
    p.push(`${caminho}.enum: lista não vazia de valores simples`);
  }
  for (const k of ['minLength', 'maxLength', 'minItems', 'maxItems']) if (e[k] !== undefined && !(Number.isInteger(e[k]) && e[k] >= 0)) p.push(`${caminho}.${k}: inteiro >= 0`);
  for (const k of ['minimum', 'maximum']) if (e[k] !== undefined && !Number.isFinite(e[k])) p.push(`${caminho}.${k}: número finito`);
  if (e.pattern !== undefined) {
    if (typeof e.pattern !== 'string' || e.pattern.length > 200) p.push(`${caminho}.pattern: texto de até 200 caracteres`);
    else {
      try { new RegExp(e.pattern); } catch { p.push(`${caminho}.pattern: expressão inválida`); }
      if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{)/.test(e.pattern)) p.push(`${caminho}.pattern: quantificador dentro de grupo quantificado (risco de ReDoS)`);
      if (!(Number.isInteger(e.maxLength) && e.maxLength <= 2000)) p.push(`${caminho}.pattern: exige maxLength (até 2000) para limitar o custo da expressão`);
    }
  }
  if (e.type === 'object' || e.properties !== undefined) {
    if (e.type !== 'object') p.push(`${caminho}: properties exige type: object`);
    if (!ehObjetoSimples(e.properties)) p.push(`${caminho}.properties: deve ser um objeto`);
    else for (const [k, v] of Object.entries(e.properties)) p.push(...verificarEsquema(v, `${caminho}.properties.${nomeSeguro(k)}`, prof + 1));
    if (e.additionalProperties !== false) p.push(`${caminho}: declare additionalProperties: false (esquema aberto deixa o modelo inventar campos)`);
    if (e.required !== undefined) {
      if (!Array.isArray(e.required) || e.required.some((k) => typeof k !== 'string' || !ehObjetoSimples(e.properties) || !Object.hasOwn(e.properties, k))) {
        p.push(`${caminho}.required: lista de campos que existem em properties`);
      }
    }
  } else if (e.required !== undefined) p.push(`${caminho}.required: só vale em objetos`);
  if (e.type === 'array') {
    if (e.items === undefined) p.push(`${caminho}.items: obrigatório em arrays`);
    else p.push(...verificarEsquema(e.items, `${caminho}.items`, prof + 1));
  } else if (e.items !== undefined) p.push(`${caminho}.items: só vale em arrays`);
  return p;
}

/** Valida `valor` contra o subconjunto de JSON Schema usado em function calling. Devolve uma lista de problemas. */
export function validarEsquema(esquema, valor, caminho = 'argumentos', prof = 0) {
  if (prof > PROFUNDIDADE_MAX + 2) return [`${caminho}: aninhamento excessivo`];
  const p = [];
  const tipoDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  const t = tipoDe(valor);
  if (t === 'number' && !Number.isFinite(valor)) return [`${caminho}: número inválido`];
  if (t === 'object' && !ehObjetoSimples(valor)) return [`${caminho}: objeto inválido (use JSON puro)`];
  if (esquema.type) {
    const ok = esquema.type === t || (esquema.type === 'number' && t === 'integer');
    if (!ok) return [`${caminho}: esperado ${esquema.type}, veio ${t}`];
  }
  if (esquema.enum && !esquema.enum.includes(valor)) p.push(`${caminho}: deve ser um de ${esquema.enum.join(', ')}`);
  if (t === 'string') {
    if (esquema.minLength !== undefined && valor.length < esquema.minLength) p.push(`${caminho}: mínimo de ${esquema.minLength} caracteres`);
    if (esquema.maxLength !== undefined && valor.length > esquema.maxLength) p.push(`${caminho}: máximo de ${esquema.maxLength} caracteres`);
    if (esquema.pattern) {
      if (valor.length > 5000) p.push(`${caminho}: longo demais para conferir o formato`);
      else if (!new RegExp(esquema.pattern).test(valor)) p.push(`${caminho}: formato inválido`);
    }
  }
  if (t === 'integer' || t === 'number') {
    if (esquema.minimum !== undefined && valor < esquema.minimum) p.push(`${caminho}: mínimo ${esquema.minimum}`);
    if (esquema.maximum !== undefined && valor > esquema.maximum) p.push(`${caminho}: máximo ${esquema.maximum}`);
  }
  if (t === 'array') {
    if (valor.length > 10_000) return [`${caminho}: lista longa demais`];
    if (esquema.minItems !== undefined && valor.length < esquema.minItems) p.push(`${caminho}: mínimo de ${esquema.minItems} itens`);
    if (esquema.maxItems !== undefined && valor.length > esquema.maxItems) p.push(`${caminho}: máximo de ${esquema.maxItems} itens`);
    if (esquema.items) valor.forEach((v, i) => p.push(...validarEsquema(esquema.items, v, `${caminho}[${i}]`, prof + 1)));
  }
  if (t === 'object' && (esquema.properties || esquema.additionalProperties === false || esquema.required)) {
    const props = ehObjetoSimples(esquema.properties) ? esquema.properties : {};
    for (const k of esquema.required ?? []) if (!Object.hasOwn(valor, k)) p.push(`${caminho}.${nomeSeguro(k)}: obrigatório`);
    for (const [k, v] of Object.entries(valor)) {
      if (Object.hasOwn(props, k)) p.push(...validarEsquema(props[k], v, `${caminho}.${nomeSeguro(k)}`, prof + 1));
      else if (esquema.additionalProperties === false) p.push(`${caminho}.${nomeSeguro(k)}: campo não previsto`);
    }
  }
  return p;
}

function congelar(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); }
  return o;
}

/**
 * @param {object} [opcoes]
 * @param {string[]} [opcoes.permissoes] níveis de risco liberados (padrão: só leitura)
 * @param {(info: {ferramenta: string, risco: string, argumentos: object, resumo: string, quem: string}) => Promise<boolean>|boolean} [opcoes.aprovar]
 *        pede aprovação humana para riscos "irreversivel" (sem esta função, eles são sempre negados). `resumo` é um texto
 *        já mascarado e sem caracteres de controle, próprio para mostrar a quem decide.
 * @param {(evento: object) => void} [opcoes.auditoria] recebe um evento por chamada (e um "iniciada" antes de escrita/irreversível)
 * @param {number} [opcoes.timeoutMs] tempo máximo por chamada
 * @param {number} [opcoes.limiteSaida] máximo de caracteres devolvidos ao modelo
 */
export function criarRegistro({ permissoes = ['leitura'], aprovar, auditoria = () => {}, timeoutMs = 10_000, limiteSaida = 20_000 } = {}) {
  if (!Array.isArray(permissoes) || permissoes.some((r) => !RISCOS.includes(r))) throw new Error(`permissoes deve ser uma lista com valores de: ${RISCOS.join(', ')}`);
  if (!(Number.isFinite(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 600_000)) throw new Error('timeoutMs deve estar entre 1 e 600000');
  if (!(Number.isInteger(limiteSaida) && limiteSaida >= 10 && limiteSaida <= 1_000_000)) throw new Error('limiteSaida deve ser um inteiro entre 10 e 1000000');
  if (aprovar !== undefined && typeof aprovar !== 'function') throw new Error('aprovar deve ser uma função');
  if (typeof auditoria !== 'function') throw new Error('auditoria deve ser uma função');
  const ferramentas = new Map();
  const liberadas = new Set(permissoes);
  const ocupadas = new Set(); // ferramentas que estouraram o tempo e ainda não terminaram
  let falhasDeAuditoria = 0;

  /** Entrega o evento à auditoria. Nunca lança; devolve false se a auditoria falhou. */
  function emitir(evento) {
    try {
      const r = auditoria(evento);
      if (r && typeof r.then === 'function') r.then(undefined, () => { falhasDeAuditoria += 1; });
      return true;
    } catch {
      falhasDeAuditoria += 1;
      return false;
    }
  }

  function registrar(f) {
    const erros = [];
    if (!f || typeof f !== 'object') throw new Error('ferramenta inválida');
    const { nome, descricao, esquema, risco, executar: fn } = f;
    if (typeof nome !== 'string' || !NOME.test(nome)) erros.push('nome: use snake_case de 3 a 41 caracteres (a-z, 0-9, _)');
    if (typeof descricao !== 'string' || descricao.trim().length < 20) erros.push('descricao: explique em pelo menos 20 caracteres o que faz e quando usar (o modelo escolhe pela descrição)');
    else if (descricao.length > 1000 || temControle(descricao)) erros.push('descricao: até 1000 caracteres, sem caracteres de controle (a descrição vai para o modelo)');
    if (!esquema || esquema.type !== 'object' || typeof esquema.properties !== 'object' || esquema.properties === null) erros.push('esquema: deve ser um objeto JSON Schema com `properties`');
    else erros.push(...verificarEsquema(esquema));
    if (!RISCOS.includes(risco)) erros.push(`risco: declare um de ${RISCOS.join(', ')}`);
    if (typeof fn !== 'function') erros.push('executar: deve ser uma função');
    if (typeof nome === 'string' && ferramentas.has(nome)) erros.push(`nome: já existe uma ferramenta chamada ${nome}`);
    let copia;
    if (!erros.length) {
      try { copia = congelar(structuredClone(esquema)); } catch { erros.push('esquema: deve conter só JSON puro'); }
    }
    if (erros.length) throw new Error(`ferramenta "${typeof nome === 'string' ? nomeSeguro(nome) : '?'}" rejeitada:\n- ${erros.join('\n- ')}`);
    // guarda uma cópia congelada: mudar o objeto original depois (risco, esquema, descrição) não altera a política em vigor
    ferramentas.set(nome, Object.freeze({ nome, descricao, esquema: copia, risco, executar: fn }));
    return registro;
  }

  /** Definições no formato de function calling (nome, descrição, esquema): o `risco` e o `executar` não saem daqui. */
  const definicoes = () => [...ferramentas.values()].map(({ nome, descricao, esquema }) => ({ name: nome, description: descricao, inputSchema: structuredClone(esquema) }));

  async function executar(nome, argumentos, { quem = 'agente' } = {}) {
    const t0 = Date.now();
    const f = typeof nome === 'string' ? ferramentas.get(nome) : undefined;
    const rotuloNome = paraTerminal(String(nome)).slice(0, 60);
    const rotuloQuem = paraTerminal(String(quem)).slice(0, 64);
    const chavesDosArgumentos = ehObjetoSimples(argumentos) ? Object.keys(argumentos).sort().slice(0, 20).map((k) => paraTerminal(k).slice(0, 40)) : []; // só os nomes, nunca os valores
    const fim = (resultado, extra = {}) => {
      emitir({ quando: new Date(t0).toISOString(), quem: rotuloQuem, ferramenta: rotuloNome, risco: f?.risco ?? null, argumentos: chavesDosArgumentos, resultado, ms: Date.now() - t0 });
      return resultado === 'ok' ? { ok: true, ...extra.corpo } : { ok: false, erro: extra.erro };
    };
    const falha = (codigo, mensagem, extra = {}) => fim(codigo, { erro: { codigo, mensagem, ...extra } });

    if (!f) return falha('ferramenta_desconhecida', `não existe a ferramenta "${rotuloNome}"`);

    let args;
    let problemas;
    if (!ehObjetoSimples(argumentos)) problemas = ['argumentos: deve ser um objeto'];
    else {
      try { args = structuredClone(argumentos); } catch { problemas = ['argumentos: devem ser JSON puro']; }
    }
    problemas ??= validarEsquema(f.esquema, args);
    if (problemas.length) return falha('argumentos_invalidos', 'corrija os argumentos e tente de novo', { problemas: problemas.slice(0, MAX_PROBLEMAS) });

    if (!liberadas.has(f.risco)) return falha('sem_permissao', `o risco "${f.risco}" não está liberado neste harness`);
    if (ocupadas.has(f.nome)) return falha('ferramenta_ocupada', 'a execução anterior desta ferramenta estourou o tempo e ainda não terminou; tente depois');

    if (f.risco === 'irreversivel') {
      let aprovado = false;
      if (aprovar) {
        let resumo;
        try { resumo = paraTerminal(mascararSegredos(JSON.stringify(args))).slice(0, 1000); } catch { resumo = '[argumentos não exibíveis]'; }
        try { aprovado = (await aprovar({ ferramenta: f.nome, risco: f.risco, argumentos: structuredClone(args), resumo, quem: rotuloQuem })) === true; } catch { aprovado = false; }
      }
      if (!aprovado) return falha('aprovacao_negada', 'ação irreversível sem aprovação humana');
    }
    if (f.risco !== 'leitura') {
      const registrada = emitir({ quando: new Date(t0).toISOString(), quem: rotuloQuem, ferramenta: rotuloNome, risco: f.risco, argumentos: chavesDosArgumentos, resultado: 'iniciada', ms: 0 });
      if (!registrada && f.risco === 'irreversivel') return falha('auditoria_indisponivel', 'a auditoria falhou; ação irreversível não executada');
    }

    const controle = new AbortController();
    const erroDeTempo = Object.assign(new Error('tempo esgotado'), { codigo: 'timeout' });
    const execucao = new Promise((ok) => ok(f.executar(args, { signal: controle.signal, quem: rotuloQuem })));
    const liberar = () => { ocupadas.delete(f.nome); };
    execucao.then(liberar, liberar);
    let relogio;
    try {
      const bruto = await Promise.race([
        execucao,
        new Promise((_, rej) => {
          relogio = setTimeout(() => {
            ocupadas.add(f.nome);
            // rejeitar ANTES de abortar: uma ferramenta que reage ao abort lançando erro não pode "ganhar" a corrida
            rej(erroDeTempo);
            controle.abort();
          }, timeoutMs);
        }),
      ]);
      let texto;
      try {
        texto = typeof bruto === 'string' ? bruto : bruto === undefined ? '' : JSON.stringify(bruto, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
      } catch { texto = undefined; }
      if (typeof texto !== 'string') return falha('erro_na_ferramenta', 'o resultado da ferramenta não pôde ser convertido em texto');
      const truncado = texto.length > limiteSaida;
      return fim('ok', { corpo: { resultado: mascararSegredos(texto.slice(0, limiteSaida * 4)).slice(0, limiteSaida), truncado } });
    } catch (e) {
      if (e === erroDeTempo) return falha('timeout', 'tempo esgotado');
      return falha('erro_na_ferramenta', paraTerminal(limparSaida(String(e?.message ?? e ?? 'erro'))).slice(0, 500));
    } finally {
      clearTimeout(relogio);
    }
  }

  const registro = { registrar, definicoes, executar, nomes: () => [...ferramentas.keys()], falhasDeAuditoria: () => falhasDeAuditoria };
  return registro;
}
