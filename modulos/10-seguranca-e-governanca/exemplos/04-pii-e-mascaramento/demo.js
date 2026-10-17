// Fluxo completo: mensagem do cliente -> mascarar -> LLM só vê marcadores -> desmascarar a resposta.
// Uso: node exemplos/04-pii-e-mascaramento/demo.js [--sem-llm]
import { chat, config } from '../../comum/llm.js';
import { mascarar, desmascarar, logSeguro } from './pii.js';

// Dados de TESTE (CPF e cartão gerados para passar nas validações; não pertencem a ninguém).
const mensagem =
  'Oi, sou a Ana (CPF 529.982.247-25). Meu cartão 4111 1111 1111 1111 foi cobrado 2x. ' +
  'Me responda em ana.souza@exemplo.com.br ou (11) 98765-4321. Protocolo 2024-000123.';

const { texto, cofre, contagem } = mascarar(mensagem);
console.log('Original (fica só no backend):\n ', mensagem);
console.log('\nO que vai para o LLM:\n ', texto);
console.log('\nPII encontrada:', contagem);

// O log de auditoria também passa pelo mascaramento (mesmo se alguém logar o texto cru por engano).
console.log('\nLog seguro:');
logSeguro('mensagem_recebida', { canal: 'chat', texto: mensagem });

if (process.argv.includes('--sem-llm')) process.exit(0);

console.log(`\nChamando ${config.modeloChat} (pode levar alguns minutos)...`);
const { texto: resposta, ms } = await chat(
  [
    {
      role: 'system',
      content:
        'Você é do suporte. Os dados pessoais vêm como marcadores [TIPO_N]. ' +
        'Copie os marcadores exatamente como estão, nunca invente valores. Responda em 2 frases.',
    },
    { role: 'user', content: texto },
  ],
  { maxTokens: 90 },
);
console.log(`\nResposta do LLM (${(ms / 1000).toFixed(0)} s), ainda mascarada:\n `, resposta.trim());
// Cartão e CPF não voltam inteiros nem para o próprio cliente: só os 4 últimos dígitos.
console.log('\nResposta desmascarada (o que o cliente recebe):\n ', desmascarar(resposta, cofre, { parciais: ['CARTAO', 'CPF'] }).trim());
