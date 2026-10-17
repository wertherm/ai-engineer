// Observabilidade "de bolso": um callback do LangChain que emite uma linha JSON por evento.
// Cada linha tem run_id e parent_run_id: dá para reconstruir a árvore de execução (um "trace")
// e responder "qual passo demorou?", "quantos tokens gastou?", "onde falhou?".
// Em produção, a mesma ideia vira LangSmith, Langfuse ou OpenTelemetry.
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

export class LogJson extends BaseCallbackHandler {
  name = "log-json";
  inicio = new Map();

  emitir(evento, runId, extra = {}) {
    const ms = this.inicio.has(runId) ? Date.now() - this.inicio.get(runId) : undefined;
    console.log(JSON.stringify({ ts: new Date().toISOString().slice(11, 23), evento, run: runId.slice(0, 8), ms, ...extra }));
  }

  handleChainStart(_chain, _inputs, runId, parentRunId, _tags, _meta, _type, runName) {
    this.inicio.set(runId, Date.now());
    // Só logamos passos nomeados (withConfig({ runName })) para não poluir com runnables internos.
    if (runName?.startsWith("rag.")) this.emitir("passo.inicio", runId, { passo: runName, pai: parentRunId?.slice(0, 8) });
    this.nomes = { ...this.nomes, [runId]: runName };
  }
  handleChainEnd(_out, runId) {
    const passo = this.nomes?.[runId];
    if (passo?.startsWith("rag.")) this.emitir("passo.fim", runId, { passo });
  }
  handleChainError(err, runId) {
    const passo = this.nomes?.[runId];
    if (passo?.startsWith("rag.")) this.emitir("passo.erro", runId, { passo, erro: err.message.slice(0, 80) });
  }
  handleChatModelStart(_llm, _msgs, runId) {
    this.inicio.set(runId, Date.now());
  }
  handleLLMEnd(output, runId) {
    const u = output.llmOutput?.tokenUsage ?? {};
    this.emitir("llm.fim", runId, { tokens_entrada: u.promptTokens, tokens_saida: u.completionTokens });
  }
  handleLLMError(err, runId) {
    this.emitir("llm.erro", runId, { erro: err.message.slice(0, 80) });
  }
}
