// Corpus pequeno com DOIS índices (políticas internas × produtos) e perguntas com gabarito.
// Metade das perguntas é paráfrase (busca vetorial brilha) e metade cita códigos exatos quase iguais
// (CCB-77 × CCB-78, POL-SEC-14 × POL-SEC-15), onde o embedding confunde e o full-text acerta.
import { embed, vetor } from '../../comum/llm.js';

export const INDICES = {
  politicas: 'Políticas internas para colaboradores: RH, férias, viagens, segurança da informação, TI, trabalho remoto',
  produtos: 'Produtos financeiros para clientes: antecipação de recebíveis, crédito, tarifas, CCB, liquidação',
};

export const DOCS = [
  { id: 'p1', indice: 'politicas', texto: 'Reembolso de despesas de viagem: o colaborador tem 30 dias para enviar as notas fiscais pelo portal.' },
  { id: 'p2', indice: 'politicas', texto: 'Trabalho remoto é permitido até 3 dias por semana, com aprovação do gestor direto.' },
  { id: 'p3', indice: 'politicas', texto: 'Política POL-SEC-14: senhas com no mínimo 14 caracteres e troca obrigatória a cada 90 dias.' },
  { id: 'p7', indice: 'politicas', texto: 'Política POL-SEC-15: notebooks corporativos com disco criptografado e bloqueio de tela em 5 minutos.' },
  { id: 'p4', indice: 'politicas', texto: 'Férias devem ser solicitadas com 45 dias de antecedência no sistema de RH.' },
  { id: 'p5', indice: 'politicas', texto: 'Uso de IA generativa: é proibido colar dados de clientes em ferramentas externas sem anonimizar.' },
  { id: 'p6', indice: 'politicas', texto: 'O suporte de TI atende das 8h às 18h em dias úteis.' },
  { id: 'd1', indice: 'produtos', texto: 'Antecipação de recebíveis: o lojista recebe hoje as vendas parceladas no cartão, com taxa a partir de 1,9% ao mês.' },
  { id: 'd2', indice: 'produtos', texto: 'CCB-77 (Cédula de Crédito Bancário): prazo de 6 a 48 meses, indexada ao CDI.' },
  { id: 'd7', indice: 'produtos', texto: 'CCB-78 (Cédula de Crédito Bancário): prazo de 12 a 60 meses, com taxa prefixada.' },
  { id: 'd3', indice: 'produtos', texto: 'Tarifa TAC-02 de cadastro: cobrada uma única vez na abertura da operação, valor de R$ 150.' },
  { id: 'd4', indice: 'produtos', texto: 'Recebível chipado: cada parcela ganha um identificador único registrado em blockchain, o que impede a dupla cessão.' },
  { id: 'd5', indice: 'produtos', texto: 'O limite de crédito é revisado a cada trimestre com base no faturamento dos últimos 12 meses.' },
  { id: 'd6', indice: 'produtos', texto: 'A liquidação da antecipação ocorre em D+1 útil na conta bancária cadastrada do lojista.' },
];

export const PERGUNTAS = [
  { q: 'Quanto tempo tenho para mandar as notas de uma viagem a trabalho?', gabarito: 'p1' },
  { q: 'Posso trabalhar de casa?', gabarito: 'p2' },
  { q: 'O que diz a POL-SEC-14?', gabarito: 'p3' },
  { q: 'Posso usar o ChatGPT com informações de clientes?', gabarito: 'p5' },
  { q: 'Qual o prazo da CCB-77?', gabarito: 'd2' },
  { q: 'Quanto custa a TAC-02?', gabarito: 'd3' },
  { q: 'Qual o prazo da CCB-78?', gabarito: 'd7' },
  { q: 'O que exige a POL-SEC-15?', gabarito: 'p7' },
  { q: 'Como evitar que a mesma parcela seja vendida duas vezes?', gabarito: 'd4' },
  { q: 'Quando o dinheiro antecipado cai na conta?', gabarito: 'd6' },
];

// O qwen3-embedding foi treinado com instrução na CONSULTA (não no documento): melhora a busca assimétrica.
export const comInstrucao = (q) => `Instruct: Given a question, retrieve passages that answer it\nQuery: ${q}`;

/** Cria m08.rag_docs (vetor + tsvector gerado) e indexa o corpus. Idempotente. */
export async function indexar(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS m08.rag_docs (
      id text PRIMARY KEY, indice text NOT NULL, texto text NOT NULL, emb vector(1024) NOT NULL,
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', texto)) STORED);
    CREATE INDEX IF NOT EXISTS rag_docs_tsv ON m08.rag_docs USING gin (tsv);`);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM m08.rag_docs');
  if (rows[0].n === DOCS.length) return;
  const embs = await embed(DOCS.map((d) => d.texto));
  for (const [i, d] of DOCS.entries()) {
    await pool.query(
      `INSERT INTO m08.rag_docs (id, indice, texto, emb) VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, emb = EXCLUDED.emb, indice = EXCLUDED.indice`,
      [d.id, d.indice, d.texto, vetor(embs[i])],
    );
  }
}
