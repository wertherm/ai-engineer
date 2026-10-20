// Um timeout que vale para a tentativa INTEIRA. Rode:  node academia/licoes/02-apis-erros-e-integracao/exemplos/timeout-do-fetch.mjs
// Usa o servidor falso do kit (127.0.0.1, nenhum LLM): um cenário que responde só depois de 3 s e outro que manda o corpo em conta-gotas por 4 s.
import { CENARIOS, iniciarServidor } from '../kit/servidor-falso.mjs';

async function medir(descricao, cenario, opcoes) {
  const servidor = await iniciarServidor({ passos: CENARIOS[cenario].passos });
  const t0 = performance.now();
  let resultado;
  try {
    const r = await fetch(`${servidor.url}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [] }), ...opcoes });
    resultado = `HTTP ${r.status}, corpo de ${(await r.text()).length} caracteres`;
  } catch (e) {
    resultado = `${e.name}: ${e.message}`;
  }
  console.log(`${descricao.padEnd(58)} → ${String(Math.round(performance.now() - t0)).padStart(5)} ms · ${resultado}`);
  await servidor.fechar();
}

await medir('servidor lento (3 s), SEM timeout próprio', 'lento', {});
await medir('servidor lento (3 s), AbortSignal.timeout(400)', 'lento', { signal: AbortSignal.timeout(400) });
await medir('corpo em conta-gotas (4 s), AbortSignal.timeout(400)', 'gotejamento', { signal: AbortSignal.timeout(400) });
console.log('\nO fetch sozinho espera o quanto o servidor quiser (o padrão do undici, que está por trás do fetch do Node, é de minutos). AbortSignal.timeout cobre a tentativa inteira,');
console.log('inclusive a leitura do corpo (a terceira linha): um servidor que manda um byte a cada 100 ms não escapa dele. Em Python, o `timeout` de urllib/http.client vale por operação de rede;');
console.log('para um prazo total é preciso conferir um prazo a cada leitura, como faz referencia/chamar.py.');
