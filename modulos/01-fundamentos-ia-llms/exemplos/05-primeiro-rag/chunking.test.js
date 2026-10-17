// Teste do chunking por parágrafo (puro, sem banco nem embeddings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkPorParagrafo } from '../../lib/rag.js';

test('cada parágrafo vira um chunk prefixado com o título', () => {
  const doc = { fonte: 'x.md', titulo: 'Política X', texto: '# Política X\n\nPrimeiro.\n\nSegundo.\n' };
  assert.deepEqual(chunkPorParagrafo(doc), [
    { fonte: 'x.md', conteudo: 'Política X: Primeiro.' },
    { fonte: 'x.md', conteudo: 'Política X: Segundo.' },
  ]);
});
