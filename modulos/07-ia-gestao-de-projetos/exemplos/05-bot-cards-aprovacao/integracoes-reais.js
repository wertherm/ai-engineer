// Integrações com as APIs REAIS (Jira, Slack, Asana, Notion). NÃO EXECUTADO LOCALMENTE: exige contas e tokens.
// Cada função lê o token do ambiente e falha cedo se ele não existir (nada de chave no código).
// Uso: node integracoes-reais.js jira|slack|asana|notion   (com as variáveis de ambiente de cada uma)

const exigir = (nome) => {
  const v = process.env[nome];
  if (!v) throw new Error(`defina ${nome} no ambiente`);
  return v;
};

async function post(url, headers, corpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${url}: ${r.status} ${texto}`);
  return JSON.parse(texto);
}

// Jira Cloud REST v3: Basic auth com e-mail + API token; description em Atlassian Document Format (ADF).
export function criarIssueJira({ resumo, descricao, projeto = process.env.JIRA_PROJECT ?? 'PB', tipo = 'Task' }) {
  const site = exigir('JIRA_SITE'); // ex.: https://sua-empresa.atlassian.net
  const basic = Buffer.from(`${exigir('JIRA_EMAIL')}:${exigir('JIRA_API_TOKEN')}`).toString('base64');
  return post(`${site}/rest/api/3/issue`, { Authorization: `Basic ${basic}` }, {
    fields: {
      project: { key: projeto },
      issuetype: { name: tipo },
      summary: resumo,
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: descricao }] }] },
    },
  });
}

// Slack Web API chat.postMessage: Bearer token de bot (xoxb-...). Slack responde 200 com ok:false em erro.
export async function postarSlack(canal, texto) {
  const r = await post('https://slack.com/api/chat.postMessage', { Authorization: `Bearer ${exigir('SLACK_BOT_TOKEN')}` }, { channel: canal, text: texto });
  if (!r.ok) throw new Error(`Slack: ${r.error}`);
  return r;
}

// Asana: Personal Access Token como Bearer; corpo sempre embrulhado em { data: ... }.
export function criarTarefaAsana({ nome, venceEm }) {
  return post('https://app.asana.com/api/1.0/tasks', { Authorization: `Bearer ${exigir('ASANA_PAT')}` }, {
    data: { name: nome, projects: [exigir('ASANA_PROJECT_GID')], due_on: venceEm },
  });
}

// Notion: a partir da versão 2025-09-03 o parent de uma página de banco é o data_source_id.
export function criarPaginaNotion({ titulo }) {
  return post('https://api.notion.com/v1/pages', {
    Authorization: `Bearer ${exigir('NOTION_TOKEN')}`,
    'Notion-Version': '2026-03-11',
  }, {
    parent: { type: 'data_source_id', data_source_id: exigir('NOTION_DATA_SOURCE_ID') },
    properties: { Name: { title: [{ text: { content: titulo } }] } },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const alvo = process.argv[2];
  const acoes = {
    jira: () => criarIssueJira({ resumo: 'Regra dos 60 dias', descricao: 'Criado pelo bot do módulo 07' }),
    slack: () => postarSlack(process.env.SLACK_CANAL ?? '#portal-boletos', 'Lembrete: homologação vence amanhã'),
    asana: () => criarTarefaAsana({ nome: 'Subir homologação', venceEm: '2026-11-04' }),
    notion: () => criarPaginaNotion({ titulo: 'Ata 2026-11-02' }),
  };
  if (!acoes[alvo]) { console.log('uso: node integracoes-reais.js jira|slack|asana|notion'); process.exit(1); }
  console.log(await acoes[alvo]());
}
