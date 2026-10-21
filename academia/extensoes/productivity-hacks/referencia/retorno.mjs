// "Vale automatizar?": contas simples de retorno, sem dependências (Node 22+). Servem ao hack PH-GAN-01 e ao projeto PP-10.
//
// Nenhum preço, câmbio ou taxa mora neste arquivo: tudo entra como PARÂMETRO, porque preços de API e de plataforma mudam.
// Os exemplos dos testes usam números FICTÍCIOS, só para conferir a conta.
//
// O que estas contas NÃO fazem: não medem o tempo real economizado (cronometre antes e depois), não incluem o seu tempo de
// revisão se você não o colocar em `horasEconomizadasPorSemana` (informe a economia LÍQUIDA, já descontada a revisão) e não
// preveem quebra de API. Servem para descartar o que não paga, não para provar que o que sobrou paga.

const SEMANAS_POR_MES = 52 / 12;

function numero(nome, v, { min = 0, inteiro = false, maiorQueMin = false } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${nome} deve ser um número finito`);
  if (maiorQueMin ? v <= min : v < min) throw new RangeError(`${nome} deve ser ${maiorQueMin ? 'maior que' : 'pelo menos'} ${min}`);
  if (inteiro && !Number.isInteger(v)) throw new RangeError(`${nome} deve ser um número inteiro`);
  return v;
}

/**
 * Retorno de uma automação de uso próprio ou para um cliente.
 * @param {object} p
 * @param {number} p.horasEconomizadasPorSemana economia LÍQUIDA (já descontada a revisão humana)
 * @param {number} p.valorDaHora quanto vale uma hora do seu tempo, na moeda que usar
 * @param {number} p.horasParaConstruir
 * @param {number} [p.horasDeManutencaoPorMes] conserto, atualização de API, troca de credencial
 * @param {number} [p.custoDeUsoPorMes] API, mensageria, hospedagem
 * @param {number} [p.semanasDeUso] por quanto tempo a tarefa vai existir (padrão 52)
 */
export function retornoDaAutomacao(p) {
  const horasEconomizadasPorSemana = numero('horasEconomizadasPorSemana', p.horasEconomizadasPorSemana);
  const valorDaHora = numero('valorDaHora', p.valorDaHora);
  const horasParaConstruir = numero('horasParaConstruir', p.horasParaConstruir);
  const horasDeManutencaoPorMes = numero('horasDeManutencaoPorMes', p.horasDeManutencaoPorMes ?? 0);
  const custoDeUsoPorMes = numero('custoDeUsoPorMes', p.custoDeUsoPorMes ?? 0);
  const semanasDeUso = numero('semanasDeUso', p.semanasDeUso ?? 52, { min: 1, inteiro: true });

  const ganhoBrutoSemanal = horasEconomizadasPorSemana * valorDaHora;
  const custoDeManutencaoSemanal = (horasDeManutencaoPorMes * valorDaHora) / SEMANAS_POR_MES;
  const custoDeUsoSemanal = custoDeUsoPorMes / SEMANAS_POR_MES;
  const ganhoSemanal = ganhoBrutoSemanal - custoDeManutencaoSemanal - custoDeUsoSemanal;
  const custoParaConstruir = horasParaConstruir * valorDaHora;
  const paybackEmSemanas = ganhoSemanal > 0 ? custoParaConstruir / ganhoSemanal : Infinity;
  const ganhoNoPeriodo = ganhoSemanal * semanasDeUso - custoParaConstruir;
  return {
    ganhoBrutoSemanal, custoDeManutencaoSemanal, custoDeUsoSemanal, ganhoSemanal, custoParaConstruir,
    paybackEmSemanas, semanasDeUso, ganhoNoPeriodo, vale: ganhoNoPeriodo > 0,
  };
}

/** O mesmo cálculo com a economia real menor que a prevista (a revisão sempre toma mais tempo do que se imagina). */
export function cenarioPessimista(p, fatorDaEconomia = 0.5) {
  numero('fatorDaEconomia', fatorDaEconomia, { min: 0, maiorQueMin: true });
  if (fatorDaEconomia > 1) throw new RangeError('fatorDaEconomia deve ser no máximo 1');
  return retornoDaAutomacao({ ...p, horasEconomizadasPorSemana: p.horasEconomizadasPorSemana * fatorDaEconomia });
}

/**
 * Regra de bolso (xkcd 1205): quantas horas, no máximo, vale gastar para automatizar uma tarefa, olhando só a economia
 * bruta ao longo de alguns anos. Descarta tarefa rara; não prova retorno (ignora manutenção e revisão).
 */
export function horasQueValeInvestir({ minutosEconomizadosPorVez, vezesPorSemana, anos = 5 }) {
  numero('minutosEconomizadosPorVez', minutosEconomizadosPorVez);
  numero('vezesPorSemana', vezesPorSemana);
  numero('anos', anos, { min: 0, maiorQueMin: true });
  return (minutosEconomizadosPorVez * vezesPorSemana * 52 * anos) / 60;
}

/** Custo de inferência por milhão de tokens (MTok), na moeda do preço informado. */
export function custoDeInferencia({ tokensEntrada, tokensSaida, precoEntradaPorMTok, precoSaidaPorMTok }) {
  numero('tokensEntrada', tokensEntrada);
  numero('tokensSaida', tokensSaida);
  numero('precoEntradaPorMTok', precoEntradaPorMTok);
  numero('precoSaidaPorMTok', precoSaidaPorMTok);
  return (tokensEntrada / 1e6) * precoEntradaPorMTok + (tokensSaida / 1e6) * precoSaidaPorMTok;
}

/**
 * Margem mensal de um bot por assinatura para UM usuário. A armadilha clássica: dimensionar pelo usuário médio e ser
 * quebrado pelo pesado. Use `fatorDeUso` (1 = médio, 5 = cinco vezes o uso médio) para ver o pior caso.
 * @param {object} p
 * @param {number} p.precoMensal cobrado do usuário
 * @param {number} p.mensagensPorMes uso médio
 * @param {number} p.tokensEntradaPorMensagem inclua o histórico que volta a cada mensagem
 * @param {number} p.tokensSaidaPorMensagem
 * @param {number} p.precoEntradaPorMTok em USD (ou a moeda do provedor)
 * @param {number} p.precoSaidaPorMTok
 * @param {number} p.cambio quanto vale 1 unidade da moeda do provedor na moeda do preço mensal (1 se for a mesma)
 * @param {number} [p.taxaPercentual] soma das taxas proporcionais do meio de pagamento (0.0469 = 4,69%)
 * @param {number} [p.taxaFixa] taxa fixa por cobrança, na moeda do preço mensal
 * @param {number} [p.fatorDeUso]
 */
export function margemDaAssinatura(p) {
  const precoMensal = numero('precoMensal', p.precoMensal);
  const fatorDeUso = numero('fatorDeUso', p.fatorDeUso ?? 1, { min: 0, maiorQueMin: true });
  const cambio = numero('cambio', p.cambio, { min: 0, maiorQueMin: true });
  const taxaPercentual = numero('taxaPercentual', p.taxaPercentual ?? 0);
  const taxaFixa = numero('taxaFixa', p.taxaFixa ?? 0);
  const mensagens = numero('mensagensPorMes', p.mensagensPorMes) * fatorDeUso;
  const custoNaMoedaDoProvedor = custoDeInferencia({
    tokensEntrada: mensagens * numero('tokensEntradaPorMensagem', p.tokensEntradaPorMensagem),
    tokensSaida: mensagens * numero('tokensSaidaPorMensagem', p.tokensSaidaPorMensagem),
    precoEntradaPorMTok: p.precoEntradaPorMTok,
    precoSaidaPorMTok: p.precoSaidaPorMTok,
  });
  const custoDeInferenciaMensal = custoNaMoedaDoProvedor * cambio;
  const taxasDePagamento = precoMensal * taxaPercentual + taxaFixa;
  const sobra = precoMensal - custoDeInferenciaMensal - taxasDePagamento;
  return { custoDeInferenciaMensal, taxasDePagamento, sobra, margem: precoMensal > 0 ? sobra / precoMensal : -Infinity, dandoPrejuizo: sobra < 0 };
}
