// "Agentes" com contrato estável: recebem um estado e devolvem um estado enriquecido.
// Aqui são determinísticos e com latência simulada para que o foco seja a ARQUITETURA (coordenação,
// falhas, estado). Em produção, o corpo de cada um seria uma chamada de LLM (ver módulo 04).
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const agentes = {
  async extrator(estado) {
    await dormir(30);
    const valor = Number(estado.pedido.match(/R\$ ?([\d.]+)/)?.[1].replace('.', '') ?? 0);
    return { ...estado, valor, cliente: estado.pedido.split(':')[0] };
  },
  async risco(estado) {
    await dormir(50);
    return { ...estado, risco: estado.valor > 50000 ? 'alto' : 'baixo' };
  },
  async fraude(estado) {
    await dormir(40);
    return { ...estado, fraude: estado.cliente === 'ACME' ? 'suspeita' : 'ok' };
  },
  async redator(estado) {
    await dormir(20);
    const aprova = estado.risco === 'baixo' && estado.fraude !== 'suspeita';
    return { ...estado, parecer: `${estado.cliente}: ${aprova ? 'APROVADO' : 'ENCAMINHAR PARA ANALISTA'}` };
  },
};

/** Embrulha um agente para falhar nas N primeiras chamadas (simula nó instável / rede). */
export function instavel(fn, falhasIniciais) {
  let chamadas = 0;
  return async (estado) => {
    chamadas += 1;
    if (chamadas <= falhasIniciais) throw new Error(`falha simulada #${chamadas}`);
    return fn(estado);
  };
}

/** Embrulha um agente para demorar demais (simula nó travado). */
export const lento = (fn, ms) => async (estado) => { await dormir(ms); return fn(estado); };

/**
 * Política de resiliência do chamador: timeout por tentativa + retry com backoff exponencial.
 * Sem timeout, um agente travado trava o sistema inteiro; sem limite de tentativas, um bug vira loop caro.
 */
export async function comResiliencia(nome, fn, estado, { tentativas = 3, timeoutMs = 200, log = () => {} } = {}) {
  for (let i = 1; i <= tentativas; i++) {
    let timer;
    try {
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout ${timeoutMs} ms`)), timeoutMs); });
      return await Promise.race([fn(estado), timeout]);
    } catch (err) {
      log(`  ${nome}: tentativa ${i}/${tentativas} falhou (${err.message})`);
      if (i === tentativas) throw new Error(`${nome} esgotou ${tentativas} tentativas: ${err.message}`);
      await dormir(10 * 2 ** i);
    } finally {
      clearTimeout(timer);
    }
  }
}
