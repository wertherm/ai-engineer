// Cliente mínimo da API do Trello. Funciona igual no mock e no api.trello.com.
const BASE = process.env.TRELLO_BASE_URL ?? 'http://localhost:30707/1';
const auth = `key=${process.env.TRELLO_KEY ?? 'mock'}&token=${process.env.TRELLO_TOKEN ?? 'mock'}`;

async function chamar(metodo, caminho, corpo) {
  const sep = caminho.includes('?') ? '&' : '?';
  const r = await fetch(`${BASE}${caminho}${sep}${auth}`, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`Trello ${metodo} ${caminho}: ${r.status} ${await r.text()}`);
  return r.json();
}

export const trello = {
  listas: (board) => chamar('GET', `/boards/${board}/lists`),
  etiquetas: (board) => chamar('GET', `/boards/${board}/labels`),
  cards: (board) => chamar('GET', `/boards/${board}/cards`),
  criarCard: (dados) => chamar('POST', '/cards', dados),
  atualizarCard: (id, dados) => chamar('PUT', `/cards/${id}`, dados),
};
