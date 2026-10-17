# 11 · Drift e monitoramento de modelo

**Conceito novo:** **monitoramento de ML**. Depois do deploy, o modelo não "quebra": ele **envelhece**. Os
dados de produção deixam de se parecer com os de treino (**data drift**), as previsões mudam de perfil
(**prediction drift**) e, quando o rótulo verdadeiro chega, o desempenho cai.
**Pré-requisito:** [exemplo 02](../02-registro-e-promocao/) (usa o champion). Teoria em [docs/03](../../docs/03-monitoramento-e-drift.md).

## Como rodar

```bash
uv run python exemplos/04-drift-e-monitoramento/drift.py
```

## Saída esperada

Saída real (2026-10-13):

```
== A) produção normal: 0/30 colunas com drift (KS, p <= 0,05)
== B) produção com drift: 2/30 colunas com drift (KS, p <= 0,05)
   mean radius            p=7.58e-20  PSI=1.08
   mean texture           p=5.38e-18  PSI=2.00
== Prediction drift (fração prevista como maligno)
   treino=36.6%  produção A=37.1%  produção B=40.6%
== Desempenho com rótulo verdadeiro
   produção A: accuracy=0.986  recall_maligno=0.981
   produção B: accuracy=0.951  recall_maligno=0.981
```

O que observar:
- **Sem falso alarme** no cenário A e, no B, exatamente as 2 colunas alteradas.
- **PSI acima de 0,25** é a convenção da indústria para "mudança significativa". Ela não tem base
  estatística rigorosa (depende do tamanho da amostra e das faixas), mas é o ponto de partida comum.
- **O drift de previsão foi pequeno** (+3,5 pontos), mas a **acurácia caiu de 0,986 para 0,951**: o
  aparelho "novo" gerou falsos positivos. O drift de dados avisou **antes** de existir rótulo.
- Num aparelho real, perímetro e área (que dependem do raio) também mudariam. Aqui só duas colunas foram mexidas.

## Experimente

1. Troque `*= 1.25` por `*= 1.05` e veja se o KS ainda detecta.
2. Rode o mesmo relatório com o Evidently 0.7 (`Report([DataDriftPreset()])`) e compare com o KS manual.
3. Faça o drift só em `worst concave points` e veja o efeito no recall. Nem toda coluna pesa igual no modelo.
