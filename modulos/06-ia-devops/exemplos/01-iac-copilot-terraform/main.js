// IaC Copilot: linguagem natural → OpenTofu/Terraform → validação determinística → loop de correção.
// O LLM só PROPÕE o HCL. Quem aprova é o pipeline (fmt, validate, plan, conftest) e, no fim, um humano no PR.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chat, resumoUso, tirarCercas } from '../../comum/llm.js';
import { validarIac } from './validar.js';

const PEDIDO = process.argv[2] ??
  'Crie a configuração do serviço "pagamentos" no ambiente homolog: um arquivo saida/pagamentos.conf ' +
  'com as linhas porta=8080 e ambiente=homolog, e uma senha aleatória de 24 caracteres para o banco ' +
  'gravada em saida/pagamentos.senha.';
const MAX_TENTATIVAS = Number(process.env.MAX_TENTATIVAS ?? 5);
const DIR = process.env.TRABALHO_DIR ?? path.join(import.meta.dirname, 'trabalho');
// Diretórios de política extras (o exercício 01 usa isto para plugar uma regra nova).
const POLITICAS = [path.join(import.meta.dirname, 'politicas'), ...(process.env.POLITICAS_EXTRAS?.split(',').filter(Boolean) ?? [])];

// Prompt de infraestrutura: escopo fechado, formato rígido e GROUNDING das versões reais dos providers.
// Sem o esqueleto abaixo o qwen3.5:4b inventava "~> 3.0" para o local (que está na 2.x) e reprovava no init.
// As regras da casa (políticas OPA) NÃO vão no prompt de propósito: quem as garante é o conftest.
const SYSTEM = `Você é um gerador de código OpenTofu/Terraform (HCL).
Comece EXATAMENTE com este bloco e use só estes providers:
terraform {
  required_providers {
    local  = { source = "hashicorp/local", version = "~> 2.9" }
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
}
Recursos úteis: random_password (length, special), local_file e local_sensitive_file (filename, content, file_permission).
Caminhos sempre com "\${path.module}/...". Responda APENAS com o código HCL, sem explicações.`;

async function main() {
  console.log(`Pedido: ${PEDIDO}\n`);
  let ultimoHcl = '';
  let feedback = '';

  for (let t = 1; t <= MAX_TENTATIVAS; t++) {
    // Contexto enxuto: pedido + (último HCL + erros). Não acumulamos todas as tentativas no prompt.
    const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: PEDIDO }];
    if (feedback) {
      messages.push({ role: 'assistant', content: ultimoHcl });
      messages.push({ role: 'user', content: `O pipeline rejeitou o código:\n${feedback}\nDevolva o HCL completo corrigido.` });
    }
    const { msg, ms } = await chat(messages, { maxTokens: 450 });
    ultimoHcl = tirarCercas(msg.content);
    console.log(`── tentativa ${t} (LLM ${(ms / 1000).toFixed(1)}s, ${ultimoHcl.split('\n').length} linhas de HCL)`);

    const r = await validarIac(ultimoHcl, { dir: DIR, politicas: POLITICAS });
    if (r.formatado) console.log('   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)');
    console.log(`   resultado: ${r.ok ? 'APROVADO' : `REPROVADO na etapa ${r.etapa}`}`);
    for (const e of r.erros) console.log(`     ✗ ${e}`);

    if (r.ok) {
      // Workflow PR-first: o copilot não aplica nada. Ele entrega o arquivo + o resumo do plano
      // para um humano revisar num Pull Request; o `apply` acontece no pipeline após o merge.
      await writeFile(path.join(DIR, 'PR.md'), corpoDoPr(r, t));
      console.log('\nPlano (o que o PR vai criar):');
      for (const rec of r.recursos) console.log(`   + ${rec}`);
      console.log(`\nHCL aprovado:\n${r.hclFinal}`);
      console.log(`Corpo do PR gravado em ${path.relative(process.cwd(), path.join(DIR, 'PR.md'))}`);
      console.log(`\n${resumoUso()}`);
      return;
    }
    feedback = r.erros.map((e) => `- [${r.etapa}] ${e}`).join('\n');
  }
  console.log(`\nDesisti após ${MAX_TENTATIVAS} tentativas: escalar para um humano. ${resumoUso()}`);
  process.exitCode = 1;
}

function corpoDoPr(r, tentativas) {
  return `## IaC gerado pelo copilot (revisão humana obrigatória)

**Pedido:** ${PEDIDO}

**Checks determinísticos:** tofu fmt ✔ · tofu validate ✔ · tofu plan ✔ · conftest (${POLITICAS.length} diretório(s) de política) ✔
**Tentativas do LLM até passar:** ${tentativas}

### Plano
${r.recursos.map((x) => `- ${x}`).join('\n')}

### Código
\`\`\`hcl
${r.hclFinal}\`\`\`
`;
}

await main();
