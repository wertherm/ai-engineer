// Mock em memória de um subconjunto da API REST do Trello (mesmos caminhos e parâmetros de /1/...).
// Serve para testar o bot sem conta: trocar TRELLO_BASE_URL para https://api.trello.com/1 usa o real.
import express from 'express';

const PORTA = Number(process.env.PORTA_MOCK ?? 30707);
let seq = 100;
const novoId = () => `id${++seq}`;

const db = {
  boards: [{ id: 'b1', name: 'Portal de Boletos' }],
  lists: [
    { id: 'l1', idBoard: 'b1', name: 'Backlog' },
    { id: 'l2', idBoard: 'b1', name: 'Fazendo' },
    { id: 'l3', idBoard: 'b1', name: 'Feito' },
  ],
  labels: [
    { id: 'lbA', idBoard: 'b1', name: 'alta', color: 'red' },
    { id: 'lbM', idBoard: 'b1', name: 'media', color: 'yellow' },
    { id: 'lbB', idBoard: 'b1', name: 'baixa', color: 'green' },
  ],
  cards: [
    { id: 'c1', idBoard: 'b1', idList: 'l1', name: 'Segunda via no portal', idLabels: ['lbM'], due: '2026-11-04T18:00:00.000Z', idMembers: ['ana'], closed: false },
    { id: 'c2', idBoard: 'b1', idList: 'l2', name: 'Regra dos 60 dias', idLabels: ['lbA'], due: '2026-11-03T18:00:00.000Z', idMembers: [], closed: false },
    { id: 'c3', idBoard: 'b1', idList: 'l1', name: 'Tema escuro no portal', idLabels: ['lbB'], due: null, idMembers: [], closed: false },
    { id: 'c4', idBoard: 'b1', idList: 'l2', name: 'Subir homologação', idLabels: ['lbA'], due: '2026-11-04T12:00:00.000Z', idMembers: [], closed: false },
    { id: 'c5', idBoard: 'b1', idList: 'l1', name: 'Texto do e-mail no jurídico', idLabels: ['lbM'], due: '2026-11-01T12:00:00.000Z', idMembers: ['marina'], closed: false },
  ],
};

const app = express();
app.use(express.json());

// Como no Trello: key e token na query. O mock só exige que existam.
app.use((req, res, next) => (req.query.key && req.query.token ? next() : res.status(401).send('invalid key')));

app.get('/1/boards/:id/lists', (req, res) => res.json(db.lists.filter((l) => l.idBoard === req.params.id)));
app.get('/1/boards/:id/labels', (req, res) => res.json(db.labels.filter((l) => l.idBoard === req.params.id)));
app.get('/1/boards/:id/cards', (req, res) => res.json(db.cards.filter((c) => c.idBoard === req.params.id && !c.closed)));

app.post('/1/cards', (req, res) => {
  const p = { ...req.query, ...req.body };
  const lista = db.lists.find((l) => l.id === p.idList);
  if (!lista) return res.status(400).send('invalid value for idList');
  const card = {
    id: novoId(), idBoard: lista.idBoard, idList: lista.id, name: p.name ?? '', desc: p.desc ?? '',
    idLabels: [].concat(p.idLabels ?? []), due: p.due ?? null, idMembers: [], closed: false,
  };
  db.cards.push(card);
  res.json(card);
});

app.put('/1/cards/:id', (req, res) => {
  const card = db.cards.find((c) => c.id === req.params.id);
  if (!card) return res.status(404).send('The requested resource was not found.');
  const p = { ...req.query, ...req.body };
  for (const campo of ['name', 'desc', 'idList', 'due']) if (p[campo] !== undefined) card[campo] = p[campo];
  if (p.idLabels !== undefined) card.idLabels = [].concat(p.idLabels);
  if (p.closed !== undefined) card.closed = String(p.closed) === 'true';
  res.json(card);
});

app.listen(PORTA, () => console.log(`mock Trello em http://localhost:${PORTA}/1`));
