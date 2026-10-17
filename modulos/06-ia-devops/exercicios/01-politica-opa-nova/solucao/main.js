// Solução do exercício 01: (1) testa a política nova com `conftest verify`; (2) prova que ela bloqueia
// um plano real; (3) roda o copilot do exemplo 01 com a política plugada e um pedido que a viola.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run } from '../../../comum/shell.js';
import { validarIac } from '../../../exemplos/01-iac-copilot-terraform/validar.js';

const AQUI = import.meta.dirname;
const POLITICA_NOVA = path.join(AQUI, 'politicas');
const POLITICA_BASE = path.join(AQUI, '../../../exemplos/01-iac-copilot-terraform/politicas');

// 1. Testes unitários da política (sem cluster, sem LLM, milissegundos).
console.log('== 1. conftest verify ==');
const v = await run('conftest', ['verify', '--no-color', '-p', POLITICA_NOVA]);
console.log(`   ${v.stdout.trim()}`);
if (!v.ok) process.exit(1);

// 2. Teste de integração: um HCL escrito à mão com senha fraca precisa ser reprovado no plano real.
console.log('\n== 2. plano real com senha fraca (sem LLM) ==');
const hclFraco = `terraform {
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
}
resource "random_password" "db" {
  length  = 16
  special = false
}
`;
const r = await validarIac(hclFraco, { dir: path.join(AQUI, 'trabalho'), politicas: [POLITICA_BASE, POLITICA_NOVA] });
console.log(`   etapa: ${r.etapa}`);
r.erros.forEach((e) => console.log(`   ✗ ${e}`));

// 3. Copilot com a política nova: o pedido pede 16 caracteres; a política exige 32.
//    O comportamento correto é o loop corrigir até passar (política > pedido) ou desistir e escalar.
if (process.argv.includes('--sem-llm')) process.exit(0);
console.log('\n== 3. copilot do exemplo 01 com a política nova ==');
const pedido = 'Gere uma senha aleatória de 16 caracteres para o banco do serviço estoque e grave em saida/estoque.senha.';
const filho = spawn('node', [path.join(AQUI, '../../../exemplos/01-iac-copilot-terraform/main.js'), pedido], {
  stdio: 'inherit',
  env: { ...process.env, POLITICAS_EXTRAS: POLITICA_NOVA, TRABALHO_DIR: path.join(AQUI, 'trabalho-copilot') },
});
filho.on('exit', (code) => process.exit(code ?? 1));
