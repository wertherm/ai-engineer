// Registro de ferramentas de um harness de agentes. Sem dependências (Node 22+).
//
// Versão "endurecida" do padrão `tools/index.js` do jps-agents (estudo-de-caso/): o mesmo formato simples de
// ferramenta ({nome, descrição, esquema, executar}), acrescido do que o original não tinha:
//   - contrato validado no cadastro (nome, descrição útil, esquema fechado, nível de risco declarado);
//   - validação dos argumentos contra o esquema ANTES de executar (o modelo erra, mente e é induzido por injeção);
//   - permissões por nível de risco e aprovação humana para o que é irreversível;
//   - timeout, limite de saída e erros estruturados (sem stack trace);
//   - auditoria de cada chamada (quem, o quê, risco, resultado, duração) sem gravar os VALORES dos argumentos.
import { limparSaida } from '../../../ferramentas/comum.mjs';

export const RISCOS = ['leitura', 'escrita', 'irreversivel'];
const NOME = /^[a-z][a-z0-9_]{2,40}$/;

/** Valida `valor` contra o subconjunto de JSON Schema usado em function calling. Devolve uma lista de problemas. */
export function validarEsquema(esquema, valor, caminho = 'argumentos') {
  const p = [];
  const tipoDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  const t = tipoDe(valor);
  if (esquema.type) {
    const ok = esquema.type === t || (esquema.type === 'number' && t === 'integer');
    if (!ok) return [`${caminho}: esperado ${esquema.type}, veio ${t}`];
  }
  if (esquema.enum && !esquema.enum.includes(valor)) p.push(`${caminho}: deve ser um de ${esquema.enum.join(', ')}`);
  if (t === 'string') {
    if (esquema.minLength !== undefined && valor.length < esquema.minLength) p.push(`${caminho}: mínimo de ${esquema.minLength} caracteres`);
    if (esquema.maxLength !== undefined && valor.length > esquema.maxLength) p.push(`${caminho}: máximo de ${esquema.maxLength} caracteres`);
    if (esquema.pattern && !new RegExp(esquema.pattern).test(valor)) p.push(`${caminho}: formato inválido`);
  }
  if (t === 'integer' || t === 'number') {
    if (esquema.minimum !== undefined && valor < esquema.minimum) p.push(`${caminho}: mínimo ${esquema.minimum}`);
    if (esquema.maximum !== undefined && valor > esquema.maximum) p.push(`${caminho}: máximo ${esquema.maximum}`);
  }
  if (t === 'array' && esquema.items) valor.forEach((v, i) => p.push(...validarEsquema(esquema.items, v, `${caminho}[${i}]`)));
  if (t === 'object' && esquema.properties) {
    for (const k of esquema.required ?? []) if (!(k in valor)) p.push(`${caminho}.${k}: obrigatório`);
    for (const [k, v] of Object.entries(valor)) {
      if (esquema.properties[k]) p.push(...validarEsquema(esquema.properties[k], v, `${caminho}.${k}`));
      else if (esquema.additionalProperties === false) p.push(`${caminho}.${k}: campo não previsto`);
    }
  }
  return p;
}

/**
 * @param {object} [opcoes]
 * @param {string[]} [opcoes.permissoes] níveis de risco liberados (padrão: só leitura)
 * @param {(info: {ferramenta: string, risco: string, argumentos: object, quem: string}) => Promise<boolean>|boolean} [opcoes.aprovar]
 *        pede aprovação humana para riscos "irreversivel" (sem esta função, eles são sempre negados)
 * @param {(evento: object) => void} [opcoes.auditoria] recebe um evento por chamada
 * @param {number} [opcoes.timeoutMs] tempo máximo por chamada
 * @param {number} [opcoes.limiteSaida] máximo de caracteres devolvidos ao modelo
 */
export function criarRegistro({ permissoes = ['leitura'], aprovar, auditoria = () => {}, timeoutMs = 10_000, limiteSaida = 20_000 } = {}) {
  const ferramentas = new Map();
  const liberadas = new Set(permissoes);

  function registrar(f) {
    const erros = [];
    if (!f || typeof f !== 'object') throw new Error('ferramenta inválida');
    if (!NOME.test(f.nome ?? '')) erros.push('nome: use snake_case de 3 a 41 caracteres (a-z, 0-9, _)');
    if (typeof f.descricao !== 'string' || f.descricao.trim().length < 20) erros.push('descricao: explique em pelo menos 20 caracteres o que faz e quando usar (o modelo escolhe pela descrição)');
    if (!f.esquema || f.esquema.type !== 'object' || typeof f.esquema.properties !== 'object') erros.push('esquema: deve ser um objeto JSON Schema com `properties`');
    else if (f.esquema.additionalProperties !== false) erros.push('esquema: declare additionalProperties: false (esquema aberto deixa o modelo inventar campos)');
    if (!RISCOS.includes(f.risco)) erros.push(`risco: declare um de ${RISCOS.join(', ')}`);
    if (typeof f.executar !== 'function') erros.push('executar: deve ser uma função');
    if (ferramentas.has(f.nome)) erros.push(`nome: já existe uma ferramenta chamada ${f.nome}`);
    if (erros.length) throw new Error(`ferramenta "${f?.nome}" rejeitada:\n- ${erros.join('\n- ')}`);
    ferramentas.set(f.nome, f);
    return registro;
  }

  /** Definições no formato de function calling (nome, descrição, esquema): o `risco` e o `executar` não saem daqui. */
  const definicoes = () => [...ferramentas.values()].map(({ nome, descricao, esquema }) => ({ name: nome, description: descricao, inputSchema: esquema }));

  async function executar(nome, argumentos, { quem = 'agente' } = {}) {
    const t0 = Date.now();
    const f = ferramentas.get(nome);
    const fim = (resultado, extra = {}) => {
      auditoria({
        quando: new Date(t0).toISOString(), quem, ferramenta: nome, risco: f?.risco ?? null,
        argumentos: argumentos && typeof argumentos === 'object' ? Object.keys(argumentos).sort() : [], // só os nomes, nunca os valores
        resultado, ms: Date.now() - t0, ...extra,
      });
      return resultado === 'ok' ? { ok: true, ...extra.corpo } : { ok: false, erro: extra.erro };
    };
    if (!f) return fim('ferramenta_desconhecida', { erro: { codigo: 'ferramenta_desconhecida', mensagem: `não existe a ferramenta "${nome}"` } });

    const problemas = argumentos && typeof argumentos === 'object' && !Array.isArray(argumentos)
      ? validarEsquema(f.esquema, argumentos) : ['argumentos: deve ser um objeto'];
    if (problemas.length) return fim('argumentos_invalidos', { erro: { codigo: 'argumentos_invalidos', mensagem: 'corrija os argumentos e tente de novo', problemas } });

    if (!liberadas.has(f.risco)) return fim('sem_permissao', { erro: { codigo: 'sem_permissao', mensagem: `o risco "${f.risco}" não está liberado neste harness` } });
    if (f.risco === 'irreversivel') {
      const aprovado = aprovar ? await aprovar({ ferramenta: nome, risco: f.risco, argumentos, quem }) : false;
      if (aprovado !== true) return fim('aprovacao_negada', { erro: { codigo: 'aprovacao_negada', mensagem: 'ação irreversível sem aprovação humana' } });
    }

    const controle = new AbortController();
    let relogio;
    try {
      const corrida = await Promise.race([
        Promise.resolve(f.executar(argumentos, { signal: controle.signal, quem })),
        new Promise((_, rej) => {
          relogio = setTimeout(() => {
            // rejeitar ANTES de abortar: uma ferramenta que reage ao abort lançando erro não pode "ganhar" a corrida
            rej(Object.assign(new Error('tempo esgotado'), { codigo: 'timeout' }));
            controle.abort();
          }, timeoutMs);
        }),
      ]);
      let texto = typeof corrida === 'string' ? corrida : JSON.stringify(corrida);
      let truncado = false;
      if (texto.length > limiteSaida) { texto = texto.slice(0, limiteSaida); truncado = true; }
      return fim('ok', { corpo: { resultado: texto, truncado } });
    } catch (e) {
      const codigo = e.codigo === 'timeout' ? 'timeout' : 'erro_na_ferramenta';
      return fim(codigo, { erro: { codigo, mensagem: limparSaida(e.message ?? 'erro') } });
    } finally {
      clearTimeout(relogio);
    }
  }

  const registro = { registrar, definicoes, executar, nomes: () => [...ferramentas.keys()] };
  return registro;
}
