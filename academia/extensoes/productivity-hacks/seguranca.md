# Segurança comum a todas as trilhas

Uma página para ler **antes** de ligar qualquer dica a uma conta, a um bot ou a uma API paga. As dicas e os projetos citam este arquivo em vez de repetir as regras. Fontes lidas em 2026-10-21 (marcas [verificado] e [não verificado] como nas trilhas; as listas de verificação são **boas práticas de quem escreveu**, apoiadas nas fontes citadas, e não um padrão). Nada aqui é aconselhamento jurídico.

## As sete regras

1. **Entrada é dado, não instrução.** E-mail, convite de calendário, formulário, página, PDF, nota, transcrição de áudio e mensagem de chat podem trazer instruções escondidas para o modelo. A OWASP chama isso de injeção de prompt indireta (LLM01:2025) e diz que nenhum método é infalível; o NCSC (Reino Unido) lembra que um LLM não separa instrução de dado como um banco de dados separa comando de valor, então o foco é reduzir probabilidade e impacto, com salvaguardas determinísticas. Fontes: https://genai.owasp.org/llmrisk/llm01-prompt-injection/ [verificado]; https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection [verificado].
2. **No máximo duas das três coisas.** Um agente não deve juntar, na mesma sessão: (a) processar conteúdo não confiável, (b) acessar dados privados e (c) agir ou comunicar para fora (enviar, apagar, publicar, pagar, buscar uma URL). É a "Rule of Two" da Meta e a "trifeta letal" de Simon Willison. Se precisar das três, contexto novo e aprovação humana. Fontes: https://ai.meta.com/blog/practical-ai-agent-security/ [verificado]; https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/ [verificado].
3. **O LLM propõe, o código valida e executa, o humano aprova o que tem efeito externo.** O formato JSON garante o formato, não a intenção: quem protege é a validação por código, a lista fechada de ações e o botão de aprovação. Mostre ao aprovador os **parâmetros exatos**, não um resumo escrito pelo modelo (senão a aprovação vira carimbo). O [registro de ferramentas](../harness-de-agentes/README.md) do repositório implementa risco, aprovação e auditoria; o [canal de aprovação](referencia/ponte-telegram.mjs) leva o "posso?" ao seu celular.
4. **Menor privilégio e somente leitura por padrão.** Uma credencial por automação, com os escopos mínimos (por exemplo `gmail.readonly` e `calendar.events.readonly`, nunca o acesso total). Pedir "enviar", "modificar" ou "acesso total" pede justificativa.
5. **Segredo não vai para o repositório, para um prompt, para um chat, para um log nem para um print.** Token de bot, chave de API, senha, código de uso único, frase-semente. Use variável de ambiente ou o cofre da plataforma; se vazou, revogue e troque (no Telegram, `/token` no @BotFather). `.env` no `.gitignore`. O `validar` do repositório procura segredos nos arquivos, mas é heurística: não é garantia.
6. **Mande à nuvem o mínimo.** O que não precisa sair da sua máquina não sai. Assinatura, texto citado, anexos, dados de terceiros e identificadores pessoais ficam de fora; redija CPF, cartão e códigos antes de enviar. Para o que é sensível, prefira modelo e ferramenta locais (Whisper, Ollama, Docling). LGPD: princípio da necessidade (art. 6º, III) e regras de transferência internacional (art. 33), texto lido em espelho não oficial [verificado, espelho]. Isto não é aconselhamento jurídico.
7. **Registre sem guardar o conteúdo, e ponha teto de custo.** A auditoria guarda quem, o quê, quando, a decisão e o custo, **não** o texto da mensagem nem os valores dos argumentos. Antes de ligar um agendador, defina a chave de idempotência (a mesma execução repetida não age duas vezes) e um limite de gasto; rode primeiro em modo "sombra" (só propõe e registra).

## O que nunca mandar a um bot, a um ditado em nuvem ou a um LLM em nuvem

Senhas, chaves de API e tokens (inclusive o do próprio bot), frases-semente e chaves privadas, códigos 2FA ou de uso único, documentos pessoais (CPF, RG, CNH), dados de cartão e de conta, dados de saúde, dados de menores, e-mails e documentos sob sigilo profissional (jurídico, médico), segredos de clientes ou da empresa, conversas e dados de terceiros sem necessidade e sem base legal, e código proprietário que você não tem permissão para enviar. Os chats do Telegram em nuvem não têm criptografia de ponta a ponta e um bot recebe o texto em claro (https://tsf.telegram.org/manuals/e2ee-simple [verificado]).

## Checklist: dar a um agente acesso ao seu e-mail ou à sua agenda

1. Qual conta? Teste numa conta separada ou num alias, não na principal.
2. Escopo mínimo: leitura. Se o agente pede enviar, modificar ou acesso total, pare e justifique. (IMAP do Gmail só aceita o escopo total: não existe IMAP "somente leitura"; só o seu código garante a leitura [verificado].)
3. Quem mais consegue colocar texto no que o agente lê? Qualquer pessoa que possa lhe mandar e-mail ou convite. Trate tudo como não confiável.
4. O agente reúne as três coisas da regra 2? Se sim, redesenhe.
5. Existe um passo humano antes de qualquer ação que saia do seu nome ou apague algo?
6. A saída pode conter imagens, links ou HTML? Bloqueie (veja [saida-segura.mjs](referencia/saida-segura.mjs)): imagens e links com dados na URL foram o canal de vazamento sem clique em casos documentados.
7. Há lista de permissão de destinatários e de domínios? Mantenha-a curta: em casos documentados, um domínio "confiável" foi o canal.
8. Onde ficam os tokens? Fora do repositório, com permissão restrita, revogáveis.
9. Existe registro de auditoria que você realmente lê?
10. O que vai ao LLM em nuvem? Só o necessário, com redação de CPF, cartão e códigos; sem anexos.
11. O fornecedor usa os seus dados para treinar? Confirme a política de cada provedor (para a API comercial da Anthropic, a página lida diz que, por padrão, não se usam entradas e saídas de produtos comerciais para treino; a retenção não foi verificada).
12. Teste mandando a si mesmo um e-mail com instrução maliciosa, numa caixa de teste, e veja o que acontece.
13. Você sabe revogar o acesso em um minuto? (Google: https://myaccount.google.com/permissions.)
14. É conta de trabalho? Veja a política da empresa antes.

## Checklist: bot pessoal no Telegram

- Token só em variável de ambiente ou cofre; se vazou, `/token` no @BotFather e troque em todos os serviços; confira o que o bot fez.
- Lista de **IDs numéricos** no início de **todo** tratador; quem não está nela recebe silêncio. Em grupo, confira também o chat e mantenha o modo de privacidade ligado.
- Webhook: HTTPS, `secret_token` aleatório (32 ou mais caracteres, só os permitidos), comparação em tempo constante, resposta 200 rápida e fila para o trabalho longo.
- Idempotência por `update_id` (chave única) antes de qualquer efeito.
- `callback_data` leva só um id curto, nunca o comando; valide quem clicou e se o pedido ainda existe; sempre `answerCallbackQuery`.
- Ação irreversível (apagar, enviar, pagar) só depois de confirmação por botão.
- Respeite os limites (20 MB de download, 4096 caracteres, cerca de 1 mensagem por segundo por chat) e trate o 429 esperando o `retry_after`.
- Não registre token, URL completa (ela carrega o token), cabeçalho do segredo, corpo inteiro do update nem texto de usuário em nível INFO.
- Um bot de teste separado do de produção (um webhook por bot).
- Atualize a biblioteca e confira a versão da Bot API que ela cobre.
- Não mande ao bot nada que você não colocaria num chat sem criptografia de ponta a ponta.

Fontes: https://core.telegram.org/bots/features [verificado]; https://core.telegram.org/bots/api [verificado]; https://core.telegram.org/bots/faq [verificado]; https://core.telegram.org/bots/tutorial [verificado].

## Checklist: governança de automações

- **Permissões:** uma credencial por automação; no MCP, escopos progressivos e sem curingas; no n8n, limite as ferramentas que o agente enxerga e desative o que não usa; no GitHub Actions, `permissions:` mínimas; prefira credenciais de curta duração a chaves estáticas.
- **Registro:** quem, o quê, quando, hash da entrada, decisão, resultado e custo. Defina a retenção. Configure um fluxo de erro que avise você. A retenção da plataforma pode ser menor do que a sua necessidade: exporte.
- **Custo:** limite de gasto mensal no provedor, limite por execução (`--max-budget-usd`, contagem de tokens), alarme em uma porcentagem do orçamento, modelo leve para triagem.
- **Cadeia de suprimentos:** skills, plugins, pacotes de expansor de texto e servidores MCP de terceiros são código executável: leia antes de instalar e fixe a versão.
- **Teste:** conjunto fixo de exemplos, modo sombra por alguns dias, botão de desligar e plano de reversão, revisão trimestral de credenciais e permissões.
- **O que nunca automatizar sem aprovação humana** [opinião]: pagamentos e transferências; mensagens a terceiros em seu nome; apagar ou sobrescrever dados; mudar permissões, compartilhamento ou senhas; deploy e merge; publicar em redes sociais; emitir ou cancelar documento fiscal; decisões que afetem pessoas (contratar, crédito, saúde); qualquer ação irreversível ou cara.

Fontes: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices [verificado]; https://docs.n8n.io/build/integrate-ai/mcp-servers.md [verificado]; https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions [verificado]; https://docs.stripe.com/api/idempotent_requests [verificado].

## A própria pesquisa também é entrada não confiável

Durante a pesquisa que deu origem a este catálogo, **quatro dos cinco agentes** que liam páginas da web relataram texto com instruções embutido no que a ferramenta devolveu: numa página da documentação do n8n, numa página de termos da Meta e, em dois casos, num trecho que alegava que o e-mail e a memória do usuário teriam mudado. Todos trataram como dado e ignoraram. Não foi verificado de onde veio cada trecho (a página, a ferramenta de leitura ou outro ponto da cadeia). Serve de exemplo concreto da regra 1: se o seu assistente lê páginas, uma delas pode tentar dar ordens a ele.

## Casos documentados (para ler com calma)

Todos foram corrigidos ou contestados pelos fornecedores e as fontes abertas lidas não relatam exploração em larga escala; são provas de conceito e relatos de pesquisadores. Veja a lista, com fonte e marca, na [trilha de e-mail e agenda](trilhas/email-e-agenda.md) (casos 0DIN, EchoLeak, PromptArmor, Nassi et al. e LayerX) e o incidente de tokens de bot embutidos em pacotes maliciosos na [trilha do Telegram](trilhas/telegram.md).
