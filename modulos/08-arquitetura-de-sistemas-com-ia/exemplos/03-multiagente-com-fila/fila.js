// Duas filas com a MESMA interface (Clear Interfaces): trocar memória por Postgres não muda os agentes.
//   publicar(topico, payload)          -> grava/enfileira a mensagem
//   consumir(topico, handler)          -> handler(payload) é chamado para cada mensagem; se lançar erro,
//                                         a mensagem volta para a fila até maxTentativas, depois vai para DLQ
import { EventEmitter } from 'node:events';
import pg from 'pg';

export class FilaMemoria {
  constructor({ maxTentativas = 3 } = {}) {
    this.bus = new EventEmitter();
    this.maxTentativas = maxTentativas;
    this.dlq = []; // dead-letter queue: mensagens que esgotaram as tentativas
  }
  async publicar(topico, payload) {
    // setImmediate = entrega assíncrona, como numa fila real (o produtor não espera o consumidor).
    setImmediate(() => this.bus.emit(topico, { payload, tentativas: 0 }));
  }
  consumir(topico, handler) {
    const processar = async (msg) => {
      try {
        await handler(msg.payload);
      } catch (err) {
        msg.tentativas += 1;
        if (msg.tentativas >= this.maxTentativas) this.dlq.push({ topico, ...msg, erro: err.message });
        else setTimeout(() => processar(msg), 20 * 2 ** msg.tentativas); // backoff exponencial
      }
    };
    this.bus.on(topico, processar);
  }
  async fechar() {
    this.bus.removeAllListeners();
  }
}

/**
 * Fila durável no Postgres: a tabela é a fonte da verdade e o LISTEN/NOTIFY só "acorda" o consumidor.
 * Se o processo cair, as mensagens 'pendente' continuam lá (o NOTIFY sozinho se perderia).
 * Claim com FOR UPDATE SKIP LOCKED permite vários consumidores sem processar a mesma mensagem duas vezes.
 */
export class FilaPostgres {
  constructor({ connectionString, maxTentativas = 3 }) {
    this.pool = new pg.Pool({ connectionString, max: 3 });
    this.listener = new pg.Client({ connectionString });
    this.maxTentativas = maxTentativas;
    this.handlers = new Map();
  }
  async iniciar() {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS m08;
      CREATE TABLE IF NOT EXISTS m08.mensagens (
        id bigserial PRIMARY KEY, topico text NOT NULL, payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pendente', tentativas int NOT NULL DEFAULT 0,
        erro text, criado_em timestamptz NOT NULL DEFAULT now());
      TRUNCATE m08.mensagens;`);
    await this.listener.connect();
    this.listener.on('notification', (n) => this.#drenar(n.channel));
  }
  async publicar(topico, payload) {
    // INSERT e NOTIFY na mesma transação: o aviso só sai se a mensagem foi gravada (commit).
    await this.pool.query(
      `WITH m AS (INSERT INTO m08.mensagens (topico, payload) VALUES ($1, $2) RETURNING id)
       SELECT pg_notify($1, id::text) FROM m`,
      [topico, payload],
    );
  }
  async consumir(topico, handler) {
    this.handlers.set(topico, handler);
    await this.listener.query(`LISTEN "${topico}"`);
    await this.#drenar(topico); // processa o que já estava pendente antes de assinar
  }
  async #drenar(topico) {
    const handler = this.handlers.get(topico);
    for (;;) {
      const { rows } = await this.pool.query(
        `UPDATE m08.mensagens SET status = 'processando', tentativas = tentativas + 1
         WHERE id = (SELECT id FROM m08.mensagens WHERE topico = $1 AND status = 'pendente'
                     ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
         RETURNING id, payload, tentativas`,
        [topico],
      );
      if (rows.length === 0) return;
      const { id, payload, tentativas } = rows[0];
      try {
        await handler(payload);
        await this.pool.query(`UPDATE m08.mensagens SET status = 'feito' WHERE id = $1`, [id]);
      } catch (err) {
        const status = tentativas >= this.maxTentativas ? 'dlq' : 'pendente';
        await this.pool.query(`UPDATE m08.mensagens SET status = $2, erro = $3 WHERE id = $1`, [id, status, err.message]);
      }
    }
  }
  async fechar() {
    await this.listener.end();
    await this.pool.end();
  }
}
