# Trilha · Ganhar tempo (e, com realismo, dinheiro)

> Para quem quer que o que constrói pague o próprio esforço. Aqui o ganho é medido, não prometido: contas simples, perguntas para fazer antes de investir horas, custo real de inferência e um mapa do que existe (e do que costuma dar errado) para ganhar dinheiro com automação.
> O que esta trilha NÃO é: não promete renda, não traz faixa de preço de mercado nem "renda típica" (a pesquisa não achou fonte independente com metodologia) e não é aconselhamento jurídico, contábil ou tributário.
> Todo número de exemplo que aparece sem fonte é FICTÍCIO e diz isso. Pesquisa lida em 2026-10-21. Preços, taxas e leis mudam: confirme na fonte antes de decidir. As marcas [verificado] e [não verificado] seguem a pesquisa; "via resumo" quer dizer que a leitura veio de um resumo feito por um modelo auxiliar, então reconfira os números críticos na página.

## Regras desta trilha
- Ganhar tempo vem antes de ganhar dinheiro, e se mede: cronometre a tarefa antes e depois, incluindo a revisão. A percepção engana (veja PH-GAN-02).
- Qualquer "R$ X mil por mês com IA" sem metodologia visível é propaganda e não entra aqui como argumento. A pesquisa não encontrou nenhum dado de renda de quem fatura com bots ou automação com amostra e método: o que circula costuma ser depoimento.
- O erro da IA que fala com terceiros é seu. Tudo que sai para um cliente ou usuário passa por aprovação humana (veja [segurança](../seguranca.md)).
- Dependência de plataforma é risco real, não detalhe: os termos do WhatsApp Business (seção 4.7) restringem provedores de IA cuja IA seja a função principal, e a cobrança por mensagem mudou em 1/10/2026 (veja PH-GAN-07). O Telegram diz nos termos que pode mudar a plataforma "a qualquer momento e sem aviso" (§13).
- Formalização, imposto e LGPD: procure um contador e, quando houver dados de terceiros, um advogado. O que está aqui são pontos de partida lidos em fontes oficiais ou em resumos, e parte deles não foi verificada.

## Dicas

### PH-GAN-01 · Vale automatizar? A conta antes do código
**Sabia que você pode** calcular, antes de escrever uma linha, quantas semanas uma automação leva para se pagar (horas economizadas vezes o valor da sua hora, menos manutenção e uso) **para melhorar** a escolha do que automatizar e descartar o que nunca vai valer a pena?

- **Faça:** 1) liste a tarefa, quantas vezes ela acontece por semana e quanto tempo leva hoje; 2) estime a economia LÍQUIDA, já descontando o tempo de revisão humana; 3) estime as horas para construir, as horas de manutenção por mês (API que muda, credencial que expira) e o custo de uso (API, mensageria, hospedagem); 4) rode [retorno.mjs](../referencia/retorno.mjs): `retornoDaAutomacao` dá o ganho semanal e o payback, e `cenarioPessimista` refaz a conta com metade da economia; `horasQueValeInvestir` aplica a regra de bolso do xkcd 1205 (tempo economizado vezes frequência, ao longo de alguns anos); 5) descarte o que só se paga no cenário otimista e guarde a conta, para comparar depois com o que você mediu.
- **Tempo e custo:** 20 a 30 min por ideia · R$ 0
- **Cuidado:** exemplo FICTÍCIO (nada disto é mercado nem ganho típico): relatório semanal de 2 h que cai para 0,5 h de revisão (economia líquida de 1,5 h), hora de R$ 40, 12 h para construir, 1 h de manutenção por mês e R$ 5 de API por mês dão ganho semanal de R$ 49,62, payback de cerca de 9,7 semanas e cerca de R$ 2.100 no primeiro ano, se a tarefa continuar existindo e nada quebrar. Com metade da economia, o payback vai para cerca de 24,5 semanas. Uma tarefa que roda 2 vezes por ano (1,5 h cada) não paga as 12 h de construção nem em 4 anos. As contas não medem o tempo real economizado, não preveem quebra de API e não incluem o seu tempo de revisão se você não o descontar da economia. A regra do xkcd serve para descartar tarefa rara, não para provar retorno.
- **Entra em:** qualquer momento
- **Vira projeto?** sim: PP-10
- **Fontes:** https://xkcd.com/1205/ [verificado]; fórmula de payback e exemplo numérico [opinião], reproduzidos nos testes de `retorno.mjs`

### PH-GAN-02 · Cronometre antes e depois
**Sabia que você pode** cronometrar as suas próprias tarefas com e sem a automação ou a IA **para melhorar** a sua decisão de manter, ajustar ou abandonar o que você construiu, em vez de confiar no que "parece" mais rápido?

- **Faça:** 1) escolha 5 tarefas que você repete; 2) cronometre cada uma do jeito de sempre, e depois com a automação ou a IA, sempre incluindo a revisão e a correção do resultado; 3) anote numa planilha: tarefa, tempo antes, tempo depois, quantas correções; 4) refaça a medição depois de 2 semanas, quando a novidade passar; 5) alimente o `retorno.mjs` (PH-GAN-01) com os tempos medidos, não com os previstos.
- **Tempo e custo:** 1 h para montar a planilha, mais alguns minutos por tarefa · R$ 0
- **Cuidado:** a percepção engana, e há dado público disso: num estudo randomizado do METR (16 desenvolvedores experientes, 246 tarefas, início de 2025), com a IA liberada eles levaram 19% mais tempo, embora tivessem previsto 24% mais rápido e, depois, achassem que tinham sido 20% mais rápidos (via resumo). É um estudo pequeno e de um contexto específico; as suas tarefas podem ser diferentes, então o recado é "meça", não "IA atrasa". Na pesquisa Stack Overflow Developer Survey 2025, 66% dos respondentes dizem que a saída da IA é "quase certa, mas não totalmente"; só 33% confiam na precisão e 46% desconfiam ativamente (via resumo). Não cronometre tarefa com dado de cliente ou segredo enviando-o à nuvem só para o teste: use exemplos sintéticos.
- **Entra em:** qualquer momento
- **Vira projeto?** sim: PP-10
- **Fontes:** https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ [verificado]; https://survey.stackoverflow.co/2025/ai [verificado]

### PH-GAN-03 · Modelo pequeno na triagem, grande nos casos difíceis
**Sabia que você pode** usar um modelo leve para classificar e extrair e chamar um modelo maior só nos casos difíceis, e calcular o custo por usuário médio e por usuário pesado, **para melhorar** a margem de qualquer automação ou bot antes de ele existir?

- **Faça:** 1) separe a tarefa em triagem, classificação e extração (modelo leve) e raciocínio difícil (modelo maior); 2) monte 20 a 30 exemplos reais seus, anonimizados ou sintéticos, como teste fixo; 3) meça quanto o modelo leve acerta nesse teste; 4) roteie: o leve primeiro, e escale quando a confiança for baixa ou a saída for inválida; 5) calcule o custo por usuário médio e por um usuário 5 vezes mais pesado com `margemDaAssinatura` e `custoDeInferencia` de [retorno.mjs](../referencia/retorno.mjs), contando o histórico que volta a cada mensagem.
- **Tempo e custo:** 30 a 60 min · R$ 0 para fazer as contas; o teste com a API custa centavos
- **Cuidado:** a ordem de grandeza entre os modelos é de dezenas de vezes: na tabela de preços da API da Anthropic lida em 2026-10-21 (US$ por milhão de tokens), o Claude Haiku 5.5 custa US$ 0,10 de entrada e US$ 0,50 de saída (prompts até 100 mil tokens), e o Claude Sonnet 5.5, US$ 2 e US$ 10. Preço muda: confirme na página e anote a data. O modelo pequeno erra mais, e o roteamento só vale com um teste seu. O erro clássico é dimensionar pelo usuário médio: no exemplo FICTÍCIO de assinatura de R$ 49 por mês (200 mensagens, 4.000 tokens de entrada e 600 de saída por mensagem, câmbio fictício de R$ 5,50, taxas de pagamento fictícias), o usuário médio deixa cerca de R$ 30,91, e o de uso 5 vezes maior gasta R$ 77 só de inferência, mais do que o preço. Não envie dados de clientes ou segredos a nenhum modelo sem saber para onde vão.
- **Entra em:** etapa 1, etapa 8
- **Vira projeto?** não
- **Fontes:** https://platform.claude.com/docs/en/about-claude/pricing [verificado]; exemplo de assinatura e roteamento [opinião], com a conta reproduzida nos testes de `retorno.mjs`

### PH-GAN-04 · Cache e lote para baratear o que se repete
**Sabia que você pode** reaproveitar com cache o trecho do prompt que se repete e mandar em lote o que não é urgente **para melhorar** o custo por execução de tarefas repetitivas, medido no log do seu script?

- **Faça:** 1) identifique o trecho grande que se repete em toda chamada (instruções, documentos de referência); 2) leia na documentação do seu provedor as regras do cache (duração, mínimo de tokens) antes de montar o prompt; 3) separe o que pode esperar (relatórios, classificação de acervo) e envie em lote, de forma assíncrona; 4) registre o custo por execução antes e depois, no log; 5) confira que o cache não passou a servir dado de um usuário para outro.
- **Tempo e custo:** 1 a 2 h · R$ 0 para ler e medir
- **Cuidado:** na página de preços lida em 2026-10-21, a leitura de cache no Claude Sonnet 5.5 custa US$ 0,10 por milhão de tokens, contra US$ 2 da entrada normal, e a API em lote tem 50% de desconto; confirme os valores antes de contar com eles. As regras do cache (duração, mínimo de tokens) a pesquisa não detalhou [não verificado]: leia a documentação. O lote é assíncrono, então não serve para o que precisa de resposta na hora. A economia depende do seu padrão de uso: meça, não presuma. Dados de clientes em prompt com cache continuam sendo dados enviados a um terceiro.
- **Entra em:** etapa 8
- **Vira projeto?** não
- **Fontes:** https://platform.claude.com/docs/en/about-claude/pricing [verificado]

### PH-GAN-05 · Oito perguntas antes de investir horas
**Sabia que você pode** responder oito perguntas por escrito antes de começar um projeto **para melhorar** a chance de ele ser útil e para descobrir cedo os que não valem as horas?

- **Faça:** responda por escrito, com um número ou uma pessoa em cada uma. 1) Dor frequente: quem sente isso, quantas vezes por semana, e já paga (em tempo ou dinheiro) para resolver? Se roda 2 vezes por ano, em geral não vale. 2) Cliente real: você fala com 3 pessoas com essa dor esta semana, antes de escrever código? 3) Dados acessíveis: estão disponíveis por API, exportação ou consentimento, sem raspagem proibida? 4) Resultado verificável: um humano confere em minutos, ou há métrica objetiva? 5) Risco baixo se errar: qual o pior dano e quem responde por ele? 6) Margem que sobrevive ao custo variável: calculada para o usuário pesado, não para o médio (PH-GAN-03). 7) Dependência de plataforma: você tem plano B se a API, o preço ou a regra mudar? 8) Manutenção e formalização: quem mantém por 6 meses e como você vai faturar legalmente (PH-GAN-07)?
- **Tempo e custo:** 20 min · R$ 0
- **Cuidado:** a pergunta 3 tem exemplo concreto: os termos do Telegram para desenvolvedores proíbem coletar conteúdo público para formar grandes conjuntos de dados, modelos de aprendizado de máquina e produtos de IA (§4.3, via resumo). Na pergunta 5, o caso Air Canada (2024: a empresa foi responsabilizada por informação errada do próprio chatbot) só foi lido em resumos de escritórios de advocacia [não verificado] e é de outra jurisdição: serve de ilustração, não de regra no Brasil. As perguntas são uma lista de verificação de quem escreveu a trilha [opinião], não um método validado.
- **Entra em:** qualquer momento
- **Vira projeto?** não
- **Fontes:** https://telegram.org/tos/bot-developers [verificado]; https://survey.stackoverflow.co/2025/ai [verificado]; lista de perguntas [opinião]

### PH-GAN-06 · Monetização no Telegram: o que existe e quais são as regras
**Sabia que você pode** conhecer as regras de pagamento do Telegram para bots e mini apps antes de planejar qualquer cobrança **para melhorar** a decisão de construir (ou não) um produto em cima dele?

- **Faça:** 1) leia a documentação de pagamentos em Stars e os termos para desenvolvedores de bots; 2) anote o que é obrigatório (bens digitais só em Stars, comandos de suporte, tratamento de disputas) e o que é proibido; 3) use o ambiente de teste de pagamentos em Stars em vez de dinheiro real; 4) calcule a sua margem sem supor nenhuma comissão que você não leu na fonte oficial; 5) escreva o plano B para o dia em que a regra mudar.
- **Tempo e custo:** 1 h para ler · R$ 0
- **Cuidado:** não é renda: não existe tabela oficial de receita, o saque depende de regras que mudam e a documentação oficial lida não traz o valor em dólar de uma Star. Fatos lidos: bens e serviços digitais devem ser cobrados exclusivamente em Telegram Stars (moeda `XTR`); o bot deve responder ao comando `/paysupport` e tratar as disputas; impostos e taxas são responsabilidade sua; existe reembolso (`refundStarPayment`) e ambiente de teste; o saque passa pela Fragment, para uma carteira TON (via resumo). Proibições dos termos incluem esquemas "MLM ou ponzi" e pedir senhas ou códigos de uso único do Telegram. CONFLITO NÃO RESOLVIDO entre as leituras: uma delas viu nos termos "0,013 USD de recompensa por Star", "até 21 dias" de espera e validade de 3 anos; a outra não achou esses valores na documentação oficial e só os viu em fontes secundárias, e também não achou comissão percentual. Trate esses números como não verificados e reabra os termos. O "25%" de comissão que circula não se confirmou em nenhuma leitura.
- **Entra em:** qualquer momento
- **Vira projeto?** não
- **Fontes:** https://core.telegram.org/bots/payments-stars [verificado]; https://telegram.org/tos/bot-developers [verificado]; https://core.telegram.org/bots/features [verificado]; https://core.telegram.org/api/stars [verificado]; os valores de Stars, o prazo de espera e a validade [não verificado]

### PH-GAN-07 · Do hack ao serviço: o primeiro cliente
**Sabia que você pode** transformar uma automação que já economiza o seu tempo em um serviço pequeno para um conhecido ou um negócio local, começando por um piloto medido, **para melhorar** o retorno das horas que você já investiu e descobrir cedo se alguém paga pelo resultado?

- **Faça:** 1) escolha uma dor concreta e frequente de alguém que você conhece e responda as oito perguntas (PH-GAN-05); 2) cronometre a tarefa manual dessa pessoa por 2 semanas (PH-GAN-02); 3) entregue uma versão em que tudo que sai para terceiros passa por aprovação humana (rascunho e aprovação, como no PP-11); 4) combine por escrito o escopo, o limite de horas de suporte e o que fica de fora; 5) meça depois e decida com o número, não com a impressão.
- **Tempo e custo:** 6 h ou mais, em semanas · custo de API e de mensageria do piloto, medido no log
- **Cuidado:** isto não é aconselhamento jurídico, contábil nem tributário; veja o quadro "Brasil" abaixo e fale com um contador. Pontos de atenção: formalização (a lista de ocupações do MEI lida não inclui desenvolvimento de software), LGPD para dados de clientes, termos do provedor de IA para revenda, responsabilidade pelo erro da IA, dependência de plataforma (WhatsApp 4.7, cobrança por mensagem desde 1/10/2026 [via resumo]) e promessa de resultado: não prometa. Dados de clientes não vão para a nuvem sem base legal e sem necessidade.
- **Entra em:** etapa 14, etapa 15
- **Vira projeto?** sim: PP-11
- **Fontes:** https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform [verificado]; https://developers.facebook.com/docs/whatsapp/pricing [verificado]; https://rr.agenciasebrae.com.br/dados/uso-de-ia-nos-pequenos-negocios-alcanca-quase-metade-das-empresas-e-aumenta-a-produtividade-e-a-competitividade/ [verificado]; passos do piloto [opinião]

## Brasil: formalizar, nota fiscal, pagamento e dados de clientes

Pontos de partida lidos em 2026-10-21. **Isto NÃO é aconselhamento jurídico nem contábil**: confirme com um contador e nas fontes oficiais.

- **Quem usa IA:** pesquisa do Sebrae e da FGV IBRE: 46% das micro e pequenas empresas e 42% dos MEIs já usam IA, sobretudo em marketing e atendimento, e 23% dos MEIs dizem não saber como aplicar a tecnologia ao próprio negócio. A pesquisa interpreta isso como uma lacuna de implementação (interpretação, não fato) [verificado, via resumo]. https://rr.agenciasebrae.com.br/dados/uso-de-ia-nos-pequenos-negocios-alcanca-quase-metade-das-empresas-e-aumenta-a-produtividade-e-a-competitividade/
- **MEI, teto:** R$ 81 mil por ano. O PLP 186/2026 (R$ 110 mil em 2027 e R$ 140 mil em 2028) foi aprovado no Senado em 15/10/2026 e constava "aguardando sanção" em 20/10/2026; o que aconteceu depois não foi verificado [verificado até 20/10/2026]. https://www25.senado.leg.br/web/atividade/materias/-/materia/175969
- **MEI e serviços de tecnologia:** na lista de ocupações permitidas (Anexo XI da Resolução CGSN 140/2018, em um PDF da Receita sem data de versão visível) a pesquisa não encontrou desenvolvimento de software (CNAE 62xx); constavam, por exemplo, "instrutor de informática" (8599-6/03) e "técnico de manutenção de computador" (9511-8/00). As Resoluções CGSN 178/2024 e 182/2025 alteraram o Anexo XI e a versão consolidada atual NÃO foi conferida. Blogs de contabilidade dizem que os CNAEs 6201-5/01, 6202-3/00, 6203-1/00, 6204-0/00 e 6209-1/00 não são permitidos ao MEI e que o caminho comum é ME no Simples Nacional [não verificado]. Conclusão prudente: desenvolvimento de software provavelmente não se enquadra como MEI; confirme no Portal do Empreendedor (que não abriu na pesquisa) e com um contador antes de abrir ou faturar. https://www8.receita.fazenda.gov.br/simplesnacional/arquivos/manual/anexo_xi.pdf [verificado]
- **Nota fiscal:** segundo o Sebrae RN, o MEI deve emitir nota fiscal quando vende para outra empresa; para pessoa física, só se o cliente pedir [verificado]. https://blog.rn.sebrae.com.br/nota-fiscal-mei/ A emissão de NFS-e no padrão nacional é assunto de cada prefeitura: não verificado na fonte oficial.
- **Pagamento:** a tarifa do Pix para quem recebe depende do banco (pessoa física em geral não paga; pessoa jurídica pode pagar) [não verificado: só resumo de busca]. Plataformas de pagamento cobram taxas que variam por contrato: compare antes de integrar.
- **LGPD e dados de clientes:** a Resolução CD/ANPD nº 2/2022 dá tratamento simplificado a agentes de pequeno porte (inclui o MEI): dispensa a indicação de encarregado (com canal para os titulares), simplifica o registro das operações e a política de segurança e dobra alguns prazos. Não isenta das bases legais, dos princípios e dos direitos dos titulares, e não vale para tratamento de alto risco. A multa simples pode chegar a 2% do faturamento, limitada a R$ 50 milhões por infração (art. 52, II) [verificado, via resumo]. Interpretação da pesquisa: um bot com IA que decide sozinho sobre pessoas ou trata dados sensíveis tem mais chance de cair em alto risco. https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022
- **Termos do provedor de IA:** nos Termos Comerciais da Anthropic (lidos por resumo; versão com data de 17/jun/2025 no cabeçalho), revender o serviço é proibido salvo aprovação, mas usá-lo para alimentar produtos e serviços que você oferece aos seus clientes é permitido, e é preciso avisar os usuários de que as saídas podem ser imprecisas. Os termos da OpenAI não abriram (403). Confirme a versão vigente e a política de uso de cada provedor antes de lançar. https://www.anthropic.com/legal/commercial-terms
- **Direito autoral da saída de IA:** o relatório do Copyright Office dos EUA (parte 2, jan/2025) conclui que material puramente gerado por IA não é protegido e que "prompts" sozinhos não dão controle suficiente; vale para os EUA, e o Brasil não foi pesquisado. https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf [verificado]
- **Responsabilidade civil por erro de IA no Brasil** e **faixas de preço de serviços de automação:** não pesquisadas ou sem fonte independente com metodologia. Por isso esta trilha não traz preço de mercado.

## Golpes e promessas para evitar

- Promessa de **retorno fixo ou garantido** em "robô de investimento": a CVM lista isso como sinal de possível fraude e lembra que o retorno de valores mobiliários é sempre incerto (https://www.gov.br/investidor/pt-br/investir/como-investir/profissionais-do-mercado/robos-de-investimentos [verificado, via resumo]). Confira se quem oferece é registrado na CVM.
- **Renda passiva "movida por IA"**, depoimentos de "mais de US$ 100 mil por mês" e pagamento antecipado alto: foram o padrão de esquemas alvo de ações da FTC dos EUA (Operation AI Comply, 2024), com perdas alegadas de dezenas de milhões de dólares (https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes [verificado, via resumo]).
- Bot que pede **depósito por Pix para "ativar o robô"**, senha, frase-semente ou código de uso único do Telegram: os termos do Telegram proíbem pedir senhas e códigos de uso único, e bots assim podem ser removidos.
- Curso ou comunidade que vende "o método" mostrando só prints de ganho, sem metodologia, e tendo o acesso como produto principal [propaganda, opinião].
- A pesquisa **não encontrou um alerta oficial brasileiro específico** sobre "bots de renda automática com IA". Resultados de busca citaram uma operação da Polícia Civil do RS sobre falsos investimentos com IA e o tema de IA e fraude no Relatório de Estabilidade Financeira do Banco Central, mas essas páginas não foram abertas [não verificado].

## Projetos desta trilha
- [PP-10](../projetos-que-rendem.md) · "Vale automatizar?": calculadora de retorno
- [PP-11](../projetos-que-rendem.md) · Assistente de rascunho e aprovação para um pequeno negócio

## O que não foi verificado
- Comissão do Telegram sobre Stars, espera de 21 dias, mínimo de saque, validade de 3 anos e valor em dólar por Star: as duas leituras da pesquisa discordam e a documentação oficial lida não traz o valor em dólar (PH-GAN-06). Também não se confirmou o que Apple e Google retêm na compra de Stars.
- Termos do WhatsApp: lidos por resumo, sem conferir o texto integral em inglês; o valor de cerca de US$ 0,0068 por mensagem utilitária no Brasil veio como estimativa da própria página, sem a tabela completa.
- Anexo XI atual do MEI (depois das Resoluções CGSN 178/2024 e 182/2025), tolerância de 20% sobre o teto, regras de desenquadramento, Anexo III ou V do Simples e fator r: só por resumos de busca ou versão sem data.
- Sanção do PLP 186/2026 depois de 20/10/2026, NFS-e nacional e tarifas do Pix: não verificados em fonte oficial.
- Termos de uso da OpenAI para revenda (403); responsabilidade civil por erro de IA e propriedade intelectual no Brasil: não pesquisados.
- Caso Air Canada e o relatório "GenAI Divide" do MIT NANDA (muito criticado pela metodologia): só resumos secundários, por isso o segundo não é usado como estatística.
- Preços de serviços de automação, renda de freelancers e tamanho do mercado de bots e mini apps: nenhuma fonte independente com metodologia visível.
- Todas as leituras desta trilha vieram de resumos de um modelo auxiliar; números críticos (taxas, limites, multas) devem ser reconferidos na fonte antes de virarem decisão.
