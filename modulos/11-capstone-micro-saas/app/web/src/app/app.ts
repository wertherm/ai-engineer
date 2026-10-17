import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Resposta, Tenant } from './api.service';
import { McpService, ToolInfo } from './mcp.service';

interface Documento { fonte: string; titulo: string; chunks: number }
interface Trecho { fonte: string; trecho: string; similaridade: number }

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private api = inject(ApiService);
  private mcp = inject(McpService);

  // Estado da tela em signals: a UI re-renderiza sozinha quando eles mudam (Angular zoneless).
  chave = signal('sk-acme-demo');
  tenant = signal<Tenant | null>(null);
  tools = signal<ToolInfo[]>([]);
  documentos = signal<Documento[]>([]);
  pergunta = signal('Qual o valor do auxílio home office?');
  modo = signal<'rag' | 'agente'>('rag');
  resposta = signal<Resposta | null>(null);
  trechos = signal<Trecho[]>([]);
  carregando = signal(false);
  erro = signal('');

  async conectar() {
    this.erro.set('');
    this.resposta.set(null);
    this.trechos.set([]);
    this.tenant.set(null);
    try {
      // Carrega tudo e só então publica: a tela nunca mostra o tenant novo com os documentos do anterior.
      const tenant = await this.api.me(this.chave());
      const tools = await this.mcp.conectar(this.chave());
      this.documentos.set(await this.mcp.chamar<Documento[]>('listar_documentos'));
      this.tools.set(tools);
      this.tenant.set(tenant);
    } catch (e) {
      this.erro.set(`Falha ao conectar: ${(e as Error).message}`);
    }
  }

  async perguntar() {
    await this.executar(async () => this.resposta.set(await this.api.perguntar(this.chave(), this.pergunta(), this.modo())));
  }

  async buscarViaMcp() {
    await this.executar(async () =>
      this.trechos.set(await this.mcp.chamar<Trecho[]>('buscar_politicas', { consulta: this.pergunta(), k: 3 })),
    );
  }

  private async executar(acao: () => Promise<void>) {
    this.carregando.set(true);
    this.erro.set('');
    try {
      await acao();
    } catch (e) {
      this.erro.set((e as Error).message);
    } finally {
      this.carregando.set(false);
    }
  }
}
