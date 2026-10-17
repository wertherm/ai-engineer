// Cliente REST da API do Micro-SaaS (contrato em /openapi.json). Caminhos relativos: em produção o
// nginx serve a UI e encaminha /v1 e /mcp para a API (mesma origem, sem CORS); em dev, o proxy do ng serve.
import { Injectable } from '@angular/core';

export interface Citacao { n?: number; fonte: string; trecho?: string }
export interface Resposta { resposta: string; citacoes: Citacao[]; verificado: boolean; cache: boolean; ms: number; tokens?: number }
export interface Tenant { id: string; nome: string; plano: string }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private async chamar<T>(chave: string, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await fetch(caminho, {
      method: metodo,
      headers: { authorization: `Bearer ${chave}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro ?? dados.message ?? `HTTP ${r.status}`);
    return dados as T;
  }

  me(chave: string) {
    return this.chamar<Tenant>(chave, 'GET', '/v1/me');
  }

  perguntar(chave: string, pergunta: string, modo: 'rag' | 'agente') {
    return this.chamar<Resposta>(chave, 'POST', '/v1/perguntas', { pergunta, modo });
  }
}
