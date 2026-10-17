# 04 · Segurança e governança de MCPs

## Objetivo

Proteger um servidor MCP exposto a LLMs e agentes: autenticação com service tokens e OAuth, escopos,
rate limiting contra abuso e custo, WAF e proteções de borda, auditoria, e os ataques específicos de MCP
(prompt injection via tool, tool poisoning, confused deputy, DNS rebinding).

## Explicação

### Por que MCP muda o modelo de ameaça

Numa API comum, quem chama é um código que você escreveu. Num MCP, quem decide a chamada é um **LLM**, que pode
ter sido manipulado por um texto que ele leu (um e-mail, uma página, a resposta de outra tool). Então:

- todo argumento é **entrada não confiável**, mesmo vindo de um client "seu";
- a autorização tem de ser **no servidor**, por tool, nunca "o prompt diz para não fazer";
- o volume de chamadas é imprevisível (loops de agente), então limite e custo viram problema de segurança.

### Autenticação

| Cenário | Mecanismo | Observação |
|---|---|---|
| stdio local | nenhum na conexão (o processo é do usuário) | credenciais do sistema por `env` |
| HTTP máquina-a-máquina (agente, BFF, automação) | **service token** no `Authorization: Bearer` | token por cliente, com escopos e expiração; guarde só o hash |
| HTTP em nome de um usuário (IDE, assistente) | **OAuth 2.1** conforme a spec de autorização do MCP | o servidor publica *Protected Resource Metadata*; o client descobre o authorization server |

Regras da especificação de autorização que valem decorar:

- O servidor MCP é um **resource server** OAuth: valida tokens emitidos *para ele* (audiência/`resource`, RFC 8707).
- **Proibido "token passthrough"**: não aceite um token emitido para outra API e não repasse o token do client
  para APIs downstream. Para chamar o CRM, o servidor usa a credencial dele próprio (ou faz token exchange).
- 401 traz `WWW-Authenticate` (e, com OAuth, o `resource_metadata`); 403 para escopo insuficiente.

No SDK, `requireBearerAuth({ verifier, requiredScopes })` faz a parte HTTP: lê o header, chama
`verifier.verifyAccessToken(token)`, checa escopos e expiração e coloca o resultado em `req.auth`, que chega ao
handler como `extra.authInfo`.

### Autorização fina (escopos por tool)

`requiredScopes` no middleware vale para o endpoint inteiro. Para escopo por tool, há duas camadas
(ambas no [exercício 02](../exercicios/02-escopos-e-limite-por-token/)):

1. **Não registrar** a tool para quem não tem o escopo. Em modo stateless, o servidor é criado por requisição,
   então dá para montar o `tools/list` sob medida para o token: o modelo nem vê a tool.
2. **Checar de novo no handler** (`extra.authInfo.scopes`): defesa em profundidade.

### Rate limiting contra abuso e custo

Limites por **cliente autenticado** (não só por IP), em camadas:

- **Gateway/WAF**: limite grosso por IP e por rota, antes de gastar CPU com auth.
- **Servidor MCP**: limite por `clientId` e plano (janela fixa no [exemplo 04](../exemplos/04-mcp-http-producao/),
  token bucket por plano no exercício 02). Responda **429** com `Retry-After`.
- **Por tool cara**: limite menor para tools que chamam LLM (sampling), consultas pesadas ou APIs pagas.
- **Orçamento**: teto de chamadas/custo por dia por cliente; um agente em loop pode gerar milhares de chamadas.

Em várias réplicas, o contador vai para um store compartilhado (Redis) ou fica no gateway.

### WAF e proteções de borda

Ao expor um MCP na internet ou na rede corporativa:

- **TLS** sempre (termina no gateway/ingress) e o servidor ouvindo só na rede interna.
- **WAF/API gateway** na frente (Cloudflare, AWS WAF, Kong, NGINX, Route do OpenShift + gateway): regras OWASP,
  bloqueio de IP/país, limite de tamanho de corpo, rate limit por IP, bloqueio de métodos não usados.
- **Limite de corpo**: o `express.json()` padrão aceita 100 kB; reduza se as tools recebem pouco dado.
- **Validação de `Host`/`Origin`** contra **DNS rebinding**: um site malicioso faz o navegador da vítima chamar seu
  MCP em `localhost`. O SDK liga isso sozinho com `createMcpExpressApp({ host: '127.0.0.1' })` (Host forjado → 403,
  testado no exemplo 04). Servidor local: escute em `127.0.0.1`, nunca `0.0.0.0`.
- **CORS** fechado: só os origins dos seus front-ends (e expondo o header `Mcp-Session-Id` se usar sessão).
- **Timeouts** de requisição e de chamadas downstream; **circuit breaker** para o sistema legado.
- Sem cabeçalhos que revelam stack (`app.disable('x-powered-by')`).

### Ataques específicos de MCP

| Ataque | O que é | Mitigação |
|---|---|---|
| **Prompt injection indireto** | dado lido pela tool (e-mail, ticket, página) contém instruções que o modelo obedece | tratar saída de tool como dado; confirmação humana para ações destrutivas; escopos mínimos |
| **Tool poisoning** | um servidor de terceiros esconde instruções na `description` da tool | só instalar servidores confiáveis/assinados; revisar descrições; fixar versões |
| **Rug pull** | servidor muda as tools depois de aprovado (`list_changed`) | pinning de versão, revisão em mudanças, allowlist de tools no host/gateway |
| **Confused deputy** | servidor-proxy OAuth usa seu client_id estático para dar acesso a quem não deveria | consentimento por client, validar `redirect_uri`, seguir as *security best practices* da spec |
| **Exfiltração entre servidores** | uma tool lê dado sensível e outra (de outro servidor) envia para fora | separar contextos, revisar composições, DLP no gateway |
| **Execução local** | servidor stdio de terceiros roda com seus privilégios | containers/sandbox, menor privilégio, revisar o comando antes de instalar |

### Governança e auditoria

- **Inventário** de servidores MCP aprovados (dono, dados acessados, escopos) e allowlist no host corporativo.
- **Log de auditoria** estruturado (JSON Lines) por chamada: quando, quem (`clientId`/usuário), método, tool,
  status, latência. **Nunca** o token e nunca argumentos sensíveis por inteiro. Mande para o SIEM.
- **Human-in-the-loop** para tools com `destructiveHint` ou acima de um valor.
- **Versionamento**: mudança de schema de tool é mudança de contrato; versione o servidor e teste com o Inspector no CI.
- **Rotação** de service tokens e expiração curta (o SDK exige `expiresAt`).

## Código mínimo

```js
const app = createMcpExpressApp({ host: '127.0.0.1' });       // anti DNS rebinding + express.json()
app.use('/mcp', auditoria);                                   // JSON Lines por requisição
app.use('/mcp', requireBearerAuth({ verifier, requiredScopes: ['produtos:ler'] })); // 401/403
app.use('/mcp', rateLimitPorCliente({ limite: 8, janelaMs: 60_000 }));            // 429 + Retry-After
app.post('/mcp', async (req, res) => {
  const server = criarServidor();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

## Na prática

- [Exemplo 04 · Streamable HTTP com service token, rate limit, auditoria e anti DNS rebinding](../exemplos/04-mcp-http-producao/)
- [Exercício 02 · escopos por tool e cota por plano](../exercicios/02-escopos-e-limite-por-token/)

## Armadilhas

- **`expiresAt` ausente** no retorno do `verifyAccessToken`: o `requireBearerAuth` do SDK responde 401
  "Token has no expiration time" mesmo com token válido.
- **Rate limit só por IP**: atrás de um gateway/NAT todo mundo tem o mesmo IP; limite pelo `clientId`.
- **Comparar token em texto puro** e guardá-lo em claro: guarde o hash (SHA-256) e compare hashes.
- **Logar o header `Authorization`** em log de acesso: vaza o token para quem lê os logs.
- **Escutar em `0.0.0.0` sem auth "porque é só local"**: qualquer máquina da rede (ou um ataque de DNS rebinding)
  chama suas tools.
- **Annotations como controle de segurança**: `readOnlyHint` é dica para o host; quem garante é o servidor.

## Fontes

- Autorização (spec 2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Security best practices (spec): https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
- Transportes (validação de Origin, sessões): https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- SDK TS (DNS rebinding, `createMcpExpressApp`, `requireBearerAuth`): https://github.com/modelcontextprotocol/typescript-sdk
- OWASP Top 10 para aplicações LLM: https://owasp.org/www-project-top-10-for-large-language-model-applications/
