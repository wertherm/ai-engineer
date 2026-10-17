# Model card · Triagem de câncer de mama (regressão logística)

Gerado por `model_card.py` em 2026-10-16 (scikit-learn, `random_state=42`).

## Detalhes do modelo
- Tipo: `StandardScaler` + `LogisticRegression(C=1.0)`; 30 atributos numéricos de imagens de punção (FNA).
- Saída: probabilidade de **maligno**; decisão com limiar **0.1**, o maior limiar que atinge
  recall >= 0.98 na validação cruzada de 5 folds do treino.
- Mesma receita da [trilha MLOps](../../../../../trilhas-extras/mlops/exemplos/01-experimentos-com-mlflow/).

## Uso pretendido
- **Pretendido:** apoio à triagem, priorizando laudos para revisão de um patologista.
- **Fora do escopo:** diagnóstico sem revisão humana; outras doenças; dados de outros equipamentos sem revalidação.

## Dados
- Breast Cancer Wisconsin (Diagnostic), 569 casos (212 malignos), embutido no scikit-learn.
- Split estratificado 75/25. **Sem atributos demográficos**: equidade por grupo não pode ser medida.

## Métricas (teste, n=143)
- ROC AUC: **0.9977**
- No limiar 0.1: recall maligno **1.000**, precisão 0.828,
  0 falso(s) negativo(s), 11 falso(s) positivo(s).

### Efeito do limiar
| limiar | recall_maligno | precisao | falsos_negativos | falsos_positivos |
|---|---|---|---|---|
| 0.500 | 0.981 | 0.981 | 1 | 1 |
| 0.400 | 0.981 | 0.912 | 1 | 5 |
| 0.300 | 0.981 | 0.897 | 1 | 6 |
| 0.200 | 0.981 | 0.897 | 1 | 6 |
| 0.100 | 1.000 | 0.828 | 0 | 11 |
| 0.050 | 1.000 | 0.716 | 0 | 21 |

### Desempenho por fatia (tamanho do tumor)
| fatia | n | malignos | recall_maligno | precisao | falsos_negativos | falsos_positivos |
|---|---|---|---|---|---|---|
| pequeno | 48 | 1 | 1.000 | 0.500 | 0 | 1 |
| médio | 48 | 11 | 1.000 | 0.647 | 0 | 6 |
| grande | 47 | 41 | 1.000 | 0.911 | 0 | 4 |

## Considerações éticas e limitações
- Fatias com poucos (ou zero) malignos têm recall instável ou indefinido ("n/a"): poucos exemplos.
- Explicação local disponível por contribuição linear (ver exemplo 01 do módulo 10).
- Decisão final é sempre humana (LGPD art. 20: direito de revisão de decisão automatizada).

## Matriz de risco (probabilidade x impacto, 1-5)
| risco | prob | impacto | nivel | classe | mitigacao | dono |
|---|---|---|---|---|---|---|
| Falso negativo: tumor maligno classificado como benigno | 3 | 5 | 15 | ALTO | limiar 0.1 (meta de recall 0.98) + revisão humana obrigatória de todo caso; monitorar recall por fatia | responsável clínico |
| Uso fora do escopo (outro equipamento/hospital, distribuição diferente) | 3 | 4 | 12 | MÉDIO | documentar escopo; monitorar drift (KS/PSI) na entrada; bloquear se drift alto | time de ML |
| Automação excessiva: médico confia cegamente (automation bias) | 3 | 4 | 12 | MÉDIO | UI mostra probabilidade + explicação local; modelo nunca decide sozinho | produto |
| Desempenho desigual por subgrupo não medido (sem dados demográficos) | 3 | 4 | 12 | MÉDIO | coletar idade/etnia com base legal (LGPD art. 11) e reavaliar por grupo | governança de dados |
| Dataset antigo e pequeno (569 casos, 1995) não representa a população atual | 4 | 3 | 12 | MÉDIO | validar em dados locais recentes antes de qualquer uso clínico | time de ML |
| Vazamento de dado de saúde (dado sensível, LGPD art. 5º II) | 2 | 5 | 10 | MÉDIO | pseudonimizar; acesso mínimo; logs sem identificadores | segurança |
