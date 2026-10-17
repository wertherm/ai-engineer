// Barramento de mensagens assíncrono: cada agente tem uma caixa de entrada (fila) e consome
// mensagens no próprio ritmo. Ninguém chama o outro diretamente: só publica mensagens.
// Em produção isto seria Redis Streams, NATS, SQS, Kafka... a ideia é a mesma.
export class Barramento {
  #filas = new Map();
  #esperando = new Map();
  #t0 = Date.now();
  historico = [];

  enviar(de, para, tipo, conteudo) {
    const msg = { de, para, tipo, conteudo, t: ((Date.now() - this.#t0) / 1000).toFixed(1) };
    this.historico.push(msg);
    console.log(`  [${msg.t}s] ${de} -> ${para} (${tipo})`);
    const espera = this.#esperando.get(para);
    if (espera) { this.#esperando.delete(para); espera(msg); } else {
      if (!this.#filas.has(para)) this.#filas.set(para, []);
      this.#filas.get(para).push(msg);
    }
  }

  /** Espera a próxima mensagem da caixa de entrada do agente (não bloqueia os outros). */
  receber(agente) {
    const fila = this.#filas.get(agente);
    if (fila?.length) return Promise.resolve(fila.shift());
    return new Promise((ok) => this.#esperando.set(agente, ok));
  }
}
