/* Teste das regras de negócio do Nexos (custo, estoque, venda, fila, caixa, relatórios).
   Como rodar: na pasta do projeto, ligue um servidor local (python -m http.server 8768 --bind 127.0.0.1),
   abra http://localhost:8768/?demo=1 (modo demonstração, dados só no navegador; não existe no endereço público),
   abra o console do navegador (F12) e cole este arquivo inteiro. Ele limpa os dados de demonstração
   antes e depois, e imprime quantas verificações passaram. Não use fora do modo demonstração. */
(async () => {
  if (!DEMO) return console.error('Rode este teste só no modo demonstração (?demo=1).');
  localStorage.removeItem(DEMO_KEY); await carregarTudo();
  const R = [];
  const perto = (a, b, t = 0.006) => Math.abs(a - b) <= t;
  const ok = (nome, cond, info) => R.push((cond ? 'OK  ' : 'FALHOU ') + nome + (cond ? '' : ' -> ' + JSON.stringify(info)));

  // 1. filamento + compra (preço médio)
  const F = put('filamentos', { nome: 'PLA Teste', tipo: 'PLA', cor: '#e3182d', precoKg: 100, estoqueG: 500 });
  const forn = put('fornecedores', { nome: 'Fornecedor A' });
  const compra = registrarCompra({ data: hoje(), filamentoId: F.id, fornecedorId: forn.id, pesoG: 1000, valor: 80 });
  ok('compra: preço médio', perto(F.precoKg, 86.67), F.precoKg);
  ok('compra: estoque', F.estoqueG === 1500, F.estoqueG);
  ok('fornecedor: resumo', perto(resumoFornecedores()[0].precoKg, 80), resumoFornecedores()[0]);

  // 2. insumo + reposição
  const I = put('insumos', { nome: 'Caixa', unidade: 'un', custo: 0.5, estoque: 10, minimo: 5 });
  reporInsumo(I, 10, 8, hoje());
  ok('insumo: custo médio', perto(I.custo, 0.65, 0.0001), I.custo);
  ok('insumo: estoque', I.estoque === 20, I.estoque);
  ok('insumo: lançou gasto', S.lancamentos.length === 1 && S.lancamentos[0].valor === 8, S.lancamentos);

  // 3. produto e custo (config padrão: 0,95/kWh, 150 W, impressora 2500 em 5000 h, manutenção 0,30/h, mão de obra 20/h, falha 5%, imposto 6%, margem 40%)
  const P = put('produtos', { nome: 'Peça Teste', materiais: [{ filamentoId: F.id, pesoG: 100 }], horas: 2, maoObraMin: 15, insumos: [{ insumoId: I.id, qtd: 2 }], extras: 1, precos: { shopee: 60, direta: 50 }, estoque: 0 });
  const c = custoProduto(P);
  const base = 0.1 * 86.67 + 0.285 + 1.6;
  const custoEsperado = base + base * 0.05 + 5 + 1.3 + 1;
  ok('custo do produto', perto(c.custo, custoEsperado), [c.custo, custoEsperado]);
  const sh = precoNoCanal(P, byId('canais', 'shopee'));
  ok('shopee: taxa', perto(sh.taxa, 16), sh.taxa);
  ok('shopee: imposto', perto(sh.imposto, 3.6), sh.imposto);
  ok('shopee: lucro', perto(sh.lucro, 60 - custoEsperado - 16 - 3.6), sh.lucro);
  ok('shopee: sugerido dá a margem', perto(precoNoCanal(P, byId('canais', 'shopee'), sh.sugerido).margem, 40, 0.01), sh.sugerido);

  // 4. ordem: fila -> imprimindo -> concluída
  const O = novaOrdem({ produtoId: P.id, qtd: 3, prazo: addDias(hoje(), -1) });
  ok('ordem atrasada', statusPrazo(O) === 'atrasada', statusPrazo(O));
  iniciarOrdem(O);
  ok('ordem imprimindo', O.status === 'imprimindo' && !!O.inicio, O);
  concluirOrdem(O);
  ok('concluir: filamento', F.estoqueG === 1200, F.estoqueG);
  ok('concluir: insumo', I.estoque === 14, I.estoque);
  ok('concluir: peças', P.estoque === 3, P.estoque);
  ok('concluir: horímetro', horimetro() === 6, horimetro());
  ok('concluir: custo guardado', perto(O.custoUnit, custoEsperado), O.custoUnit);

  // 5. venda
  const V = registrarVenda({ produtoId: P.id, qtd: 2, canalId: 'shopee', precoUnit: 60 });
  ok('venda: bruto', V.bruto === 120, V.bruto);
  ok('venda: taxa', perto(V.taxa, 32), V.taxa);
  ok('venda: imposto', perto(V.imposto, 7.2), V.imposto);
  ok('venda: lucro', perto(V.lucro, 120 - 2 * custoEsperado - 32 - 7.2), V.lucro);
  ok('venda: estoque', P.estoque === 1, P.estoque);

  // 6. falha
  const FA = registrarFalha({ produtoId: P.id, filamentoId: F.id, gramas: 50, motivo: 'Entupimento' });
  ok('falha: estoque', F.estoqueG === 1150, F.estoqueG);
  ok('falha: custo', perto(FA.custo, 4.3335), FA.custo);
  const tf = taxaFalha();
  ok('taxa de falha: fixa enquanto há pouco dado', !tf.real && tf.pct === 5 && perto(tf.realPct, 50 / 300 * 100, 0.01), tf);

  // 7. reabrir e concluir de novo
  reabrirOrdem(O, 'fila');
  ok('reabrir: devolve tudo', F.estoqueG === 1450 && I.estoque === 20 && P.estoque === -2 && horimetro() === 0, [F.estoqueG, I.estoque, P.estoque, horimetro()]);
  ok('alerta de estoque negativo', alertas().some(a => /Estoque negativo/.test(a.texto)), alertas());
  concluirOrdem(O);
  ok('concluir de novo', F.estoqueG === 1150 && I.estoque === 14 && P.estoque === 1, [F.estoqueG, I.estoque, P.estoque]);

  // 8. editar ordem concluída (3 -> 4 peças)
  editarOrdem(O, { produtoId: P.id, qtd: 4, data: O.data, prazo: O.prazo });
  ok('editar concluída', F.estoqueG === 1050 && I.estoque === 12 && P.estoque === 2 && O.horasTotal === 8 && O.status === 'concluido', [F.estoqueG, I.estoque, P.estoque, O.horasTotal, O.status]);

  // 9. excluir venda devolve estoque
  excluirVenda(V);
  ok('excluir venda', P.estoque === 4 && S.vendas.length === 0, P.estoque);
  const V2 = registrarVenda({ produtoId: P.id, qtd: 2, canalId: 'shopee', precoUnit: 60 });

  // 10. caixa do mês
  const cx = caixaDoMes(mesAtual());
  ok('caixa: líquido', perto(cx.liquido, 88), cx.liquido);
  ok('caixa: compras e gastos', cx.compras === 80 && cx.gastos === 8, [cx.compras, cx.gastos]);
  ok('caixa: resultado', perto(cx.resultado, 88 - 7.2 - 80 - 8), cx.resultado);
  put('lancamentos', { data: hoje(), tipo: 'retirada', categoria: 'Retirada', descricao: 'Pró-labore', valor: 10, fixo: false });
  ok('caixa: saldo com retirada', perto(caixaDoMes(mesAtual()).saldo, 88 - 7.2 - 80 - 8 - 10), caixaDoMes(mesAtual()).saldo);

  // 11. manutenção
  const MI = put('manutItens', { nome: 'Trocar bico', intervaloH: 5, ultimaH: 0 });
  ok('manutenção vencida', statusManutencao(MI).estado === 'vencida', statusManutencao(MI));
  registrarManutencao({ itemId: MI.id, custo: 25 });
  ok('manutenção feita', statusManutencao(MI).estado === 'ok' && MI.ultimaH === 8, MI);
  ok('manutenção: custo real por hora', perto(manutencaoRealHora().porHora, 25 / 8), manutencaoRealHora());
  ok('caixa: manutenção', caixaDoMes(mesAtual()).manutencao === 25, caixaDoMes(mesAtual()).manutencao);

  // 12. orçamento
  ok('orçamento: total', totalOrcamento({ itens: [{ qtd: 2, precoUnit: 50 }, { qtd: 1, precoUnit: 30 }], desconto: 10 }).total === 120, 0);

  // 13. fila e previsão
  const A = novaOrdem({ produtoId: P.id, qtd: 1 });
  await new Promise(r => setTimeout(r, 5));
  const B = novaOrdem({ produtoId: P.id, qtd: 2, prazo: hoje() });
  const h = x => (x.fim - Date.now()) / 36e5;
  let fila = filaProducao();
  ok('fila: ordem de chegada', fila[0].o.id === A.id && fila[1].o.id === B.id, fila.map(x => x.o.id));
  ok('fila: previsões', perto(h(fila[0]), 2, 0.01) && perto(h(fila[1]), 6, 0.01), fila.map(h));
  moverOrdem(B, -1); fila = filaProducao();
  ok('fila: subir', fila[0].o.id === B.id, fila.map(x => x.o.id));
  iniciarOrdem(A); fila = filaProducao();
  ok('fila: quem imprime vem primeiro', fila[0].o.id === A.id && perto(h(fila[1]), 6, 0.01), fila.map(x => [x.o.status, h(x)]));
  excluirOrdem(A); excluirOrdem(B);

  // 14. relatórios
  const sm = serieMensal(3), ult = sm[sm.length - 1];
  ok('série: faturamento, lucro e consumo', ult.fat === 120 && perto(ult.lucro, V2.lucro) && ult.consumoG === 450, ult);
  ok('ranking de produtos', rankingProdutos(mesAtual(), mesAtual())[0].qtd === 2, rankingProdutos(mesAtual(), mesAtual()));
  ok('ranking de canais', rankingCanais(mesAtual(), mesAtual())[0].nome === 'Shopee', rankingCanais(mesAtual(), mesAtual()));
  const cm = consumoPorMaterial(mesAtual(), mesAtual())[0];
  ok('consumo por material', cm.g === 450 && cm.falhaG === 50, cm);

  // 15. excluir compra e falha
  excluirCompra(compra);
  ok('excluir compra', F.estoqueG === 50, F.estoqueG);
  excluirFalha(FA);
  ok('excluir falha', F.estoqueG === 100, F.estoqueG);

  // 16. mão de obra por pessoa
  const ana = put('pessoas', { nome: 'Ana', valorHora: 30 });
  const PM = put('produtos', { nome: 'Peça Mão', materiais: [{ filamentoId: F.id, pesoG: 10 }], horas: 0,
    maoObra: [{ etapa: 'Acabamento', pessoaId: ana.id, minutos: 30 }, { etapa: 'Embalagem', pessoaId: '', minutos: 6 }], estoque: 0 });
  ok('mão de obra por pessoa', perto(custoProduto(PM).maoObra, 0.5 * 30 + 0.1 * 20), custoProduto(PM).maoObra);
  rm('pessoas', ana.id);
  ok('mão de obra: pessoa excluída usa o valor geral', perto(custoProduto(PM).maoObra, 0.5 * 20 + 0.1 * 20), custoProduto(PM).maoObra);

  // 17. margem por canal
  const CM = put('canais', { id: 'teste-margem', nome: 'Canal Teste', pct: 10, fixa: 0, frete: 0, margem: 25 });
  ok('margem por canal: sugerido dá a margem do canal', perto(precoNoCanal(P, CM, precoNoCanal(P, CM).sugerido).margem, 25, 0.01), precoNoCanal(P, CM));
  ok('margem por canal: sem margem usa a geral', margemDoCanal({ margem: 0 }) === num(S.config.margem), margemDoCanal({ margem: 0 }));
  rm('canais', CM.id);

  // 18. pedido com vários itens
  const P3 = put('produtos', { nome: 'Chaveiro', materiais: [{ filamentoId: F.id, pesoG: 5 }], horas: 0.5, maoObraMin: 0, precos: { shopee: 20 }, estoque: 10 });
  const estP = P.estoque, estP3 = P3.estoque;
  const PED = registrarVenda({ data: hoje(), canalId: 'shopee', frete: 10, itens: [{ produtoId: P.id, qtd: 1, precoUnit: 60 }, { produtoId: P3.id, qtd: 3, precoUnit: 20 }] });
  ok('pedido: total e peças', PED.bruto === 120 && PED.qtd === 4 && PED.itens.length === 2, [PED.bruto, PED.qtd]);
  ok('pedido: taxa por unidade', perto(PED.taxa, 120 * 0.2 + 4 * 4), PED.taxa);
  ok('pedido: frete uma vez só', PED.frete === 10, PED.frete);
  ok('pedido: estoque dos dois produtos', P.estoque === estP - 1 && P3.estoque === estP3 - 3, [P.estoque, P3.estoque]);
  ok('pedido: lucro dos itens fecha com o do pedido', perto(soma(itensVenda(PED), 'lucro'), PED.lucro), [soma(itensVenda(PED), 'lucro'), PED.lucro]);
  ok('pedido: frete repartido pelo valor', perto(itensVenda(PED)[0].frete, 5), itensVenda(PED)[0].frete);
  ok('pedido: número', PED.numero === Math.max(...S.vendas.map(v => num(v.numero))), PED.numero);
  ok('pedido: nome curto', resumoItensVenda(PED) === 'Peça Teste + 1 item', resumoItensVenda(PED));

  // 19. devolução vira perda
  const lucroAntes = PED.lucro, custoChaveiros = itensVenda(PED)[1].custo;
  registrarDevolucao(PED, { item: 1, qtd: 1, motivo: 'Defeito', custoExtra: 8 });
  ok('devolução: peça não volta ao estoque', P3.estoque === estP3 - 3, P3.estoque);
  ok('devolução: valor sai da venda', perto(PED.bruto, 100) && PED.qtd === 3 && PED.devolvido === 1, [PED.bruto, PED.qtd, PED.devolvido]);
  ok('devolução: lucro (valor − taxa − imposto devolvidos + gasto extra)', perto(PED.lucro, lucroAntes - (20 - 8 - 1.2) - 8), [PED.lucro, lucroAntes]);
  ok('devolução: perda = custo da peça + gasto extra', perto(PED.perdaDevolucao, custoChaveiros / 3 + 8), PED.perdaDevolucao);
  ok('devolução: gasto extra no caixa', perto(caixaDoMes(mesAtual()).devolucoes, 8), caixaDoMes(mesAtual()).devolucoes);
  desfazerDevolucao(PED, PED.devolucoes[0].id);
  ok('desfazer devolução', perto(PED.lucro, lucroAntes) && PED.qtd === 4 && PED.devolvido === 0, [PED.lucro, PED.qtd]);
  registrarDevolucao(PED, { item: 1, qtd: 1, custoExtra: 0 });
  excluirVenda(PED);
  ok('excluir pedido: as devolvidas não voltam', P3.estoque === estP3 - 1 && P.estoque === estP, [P3.estoque, P.estoque]);

  // 20. contas a pagar e a receber
  const conta = criarConta({ tipo: 'pagar', descricao: 'Aluguel', valor: 500, vencimento: addDias(hoje(), -2), categoria: 'Aluguel', recorrente: true });
  ok('conta vencida', situacaoConta(conta) === 'vencida', situacaoConta(conta));
  ok('aviso de conta vencida', alertas().some(a => a.tipo === 'bad' && /Conta vencida: Aluguel/.test(a.texto)), alertas());
  const gastosAntes = caixaDoMes(mesAtual()).gastos;
  const prox = pagarConta(conta, { data: hoje() });
  ok('pagar conta: vira gasto no caixa', perto(caixaDoMes(mesAtual()).gastos, gastosAntes + 500), caixaDoMes(mesAtual()).gastos);
  ok('pagar conta: a do mês seguinte já fica criada', !!prox && prox.vencimento === addMesesData(conta.vencimento, 1) && !prox.pagoEm && prox.recorrente, prox);
  desfazerPagamento(conta);
  ok('desfazer pagamento: sai do caixa', perto(caixaDoMes(mesAtual()).gastos, gastosAntes) && !conta.pagoEm, caixaDoMes(mesAtual()).gastos);
  excluirConta(conta); if (prox) excluirConta(prox);
  const rec = criarConta({ tipo: 'receber', descricao: 'Empréstimo', valor: 200, vencimento: hoje() });
  pagarConta(rec, { data: hoje() });
  ok('receber conta avulsa: vira entrada', perto(caixaDoMes(mesAtual()).entradas, 200), caixaDoMes(mesAtual()).entradas);
  excluirConta(rec);
  ok('excluir conta recebida: a entrada sai', perto(caixaDoMes(mesAtual()).entradas, 0) && !S.contas.length, caixaDoMes(mesAtual()).entradas);
  ok('31/01 + 1 mês = 28/02', addMesesData('2026-01-31', 1) === '2026-02-28', addMesesData('2026-01-31', 1));

  // 21. sócios
  const ret1 = put('lancamentos', { data: hoje(), tipo: 'retirada', categoria: 'Retirada', descricao: 'Retirada', valor: 30, socio: '1' });
  const dv = divisaoSocios(mesAtual(), mesAtual());
  ok('sócios: meio a meio', perto(dv.socios[0].parte, dv.resultado / 2) && perto(dv.socios[1].parte, dv.resultado / 2), dv);
  ok('sócios: retirada de cada um', perto(dv.socios[0].retirado, 30) && perto(dv.socios[1].retirado, 0) && perto(dv.semSocio, 10), dv);
  rm('lancamentos', ret1.id);

  // 22. acabamento
  const PA = put('produtos', { nome: 'Vaso pintado', materiais: [{ filamentoId: F.id, pesoG: 20 }], horas: 1, maoObraMin: 0, acabamento: true, estoque: 0 });
  const OA = novaOrdem({ produtoId: PA.id, qtd: 2 }), fAntes = F.estoqueG, hAntes = horimetro();
  iniciarOrdem(OA); concluirOrdem(OA);
  ok('acabamento: impressão terminada vai para Em acabamento', OA.status === 'acabamento' && PA.estoque === 0 && perto(F.estoqueG, fAntes - 40), [OA.status, PA.estoque, F.estoqueG]);
  ok('acabamento: sai da fila e conta no horímetro', !filaProducao().some(x => x.o.id === OA.id) && ordensEmAcabamento().some(o => o.id === OA.id) && perto(horimetro(), hAntes + 2), horimetro());
  concluirOrdem(OA);
  ok('acabamento pronto: peças no estoque', OA.status === 'concluido' && PA.estoque === 2, [OA.status, PA.estoque]);
  reabrirOrdem(OA, 'acabamento');
  ok('reabrir para o acabamento', OA.status === 'acabamento' && PA.estoque === 0 && perto(F.estoqueG, fAntes - 40), [OA.status, PA.estoque]);
  excluirOrdem(OA);
  ok('excluir ordem em acabamento devolve o material', perto(F.estoqueG, fAntes) && perto(horimetro(), hAntes), F.estoqueG);

  // 23. estoque mínimo
  PA.estoqueMinimo = 5; put('produtos', PA);
  let sg = sugestoesProducao().find(s => s.p.id === PA.id);
  ok('estoque mínimo: sugere produzir', !!sg && sg.falta === 5, sg);
  const OB = novaOrdem({ produtoId: PA.id, qtd: 3 });
  sg = sugestoesProducao().find(s => s.p.id === PA.id);
  ok('estoque mínimo: conta o que já está em produção', !!sg && sg.falta === 2, sg);
  ok('estoque mínimo: aviso', alertas().some(a => /Abaixo do mínimo: Vaso pintado/.test(a.texto)), 0);
  excluirOrdem(OB);

  // 24. sinal do orçamento e venda no formato antigo
  const tS = totalOrcamento({ itens: [{ qtd: 1, precoUnit: 200 }], desconto: 0, sinalPct: 50 });
  ok('orçamento: sinal e restante', tS.sinal === 100 && tS.restante === 100, tS);
  const antiga = put('vendas', { id: uid(), data: hoje(), produtoId: P3.id, produtoNome: P3.nome, qtd: 2, canalId: 'direta', canalNome: 'Instagram / WhatsApp',
    precoUnit: 25, custoUnit: 3, bruto: 50, taxa: 0, frete: 0, imposto: 3, lucro: 41, criadoEm: agoraISO() });
  ok('venda antiga: vira um item', itensVenda(antiga).length === 1 && itensVenda(antiga)[0].qtd === 2 && resumoVendas([antiga]).custo === 6, itensVenda(antiga));
  registrarDevolucao(antiga, { item: 0, qtd: 1, custoExtra: 0 });
  ok('venda antiga: devolução funciona', antiga.qtd === 1 && perto(antiga.bruto, 25) && Array.isArray(antiga.itens) && !('produtoId' in antiga), antiga);
  rm('vendas', antiga.id);

  // 25. venda a prazo: o caixa conta o que entrou; pagamento parcial e desconto
  const pedAPrazo = registrarVenda({ data: hoje(), canalId: 'direta', frete: 0, itens: [{ produtoId: P3.id, qtd: 1, precoUnit: 100 }] });
  const contaPed = criarConta({ tipo: 'receber', descricao: 'Pedido a prazo', valor: 100, vencimento: addDias(hoje(), 10), origem: 'venda', origemId: pedAPrazo.id, parte: 'saldo' });
  const cx0 = caixaDoMes(mesAtual());
  ok('a prazo: só entra no caixa quando o cliente paga', perto(cx0.aPrazo, 100) && perto(cx0.recebidoContas, 0), [cx0.aPrazo, cx0.recebidoContas]);
  pagarConta(contaPed, { data: hoje(), valor: 60, parcial: true });
  const restoPed = S.contas.find(c => c.origemId === pedAPrazo.id && !c.pagoEm);
  ok('pagamento parcial: o que falta continua em aberto', !!restoPed && perto(restoPed.valor, 40) && perto(contaPed.valor, 60), [restoPed, contaPed.valor]);
  ok('pagamento parcial: o caixa recebe só o que entrou', perto(caixaDoMes(mesAtual()).liquido - cx0.liquido, 60), caixaDoMes(mesAtual()).liquido - cx0.liquido);
  pagarConta(restoPed, { data: hoje(), valor: 30 });
  ok('desconto: a conta fecha e entra só o que foi pago', !contasAbertas('receber').some(c => c.origemId === pedAPrazo.id) && perto(caixaDoMes(mesAtual()).recebidoContas, 90), caixaDoMes(mesAtual()).recebidoContas);
  ok('a prazo: "ainda a receber" só conta o que o cliente não pagou', perto(cx0.aPrazoAberto, 100) && perto(caixaDoMes(mesAtual()).aPrazoAberto, 0), [cx0.aPrazoAberto, caixaDoMes(mesAtual()).aPrazoAberto]);
  const pedDev = registrarVenda({ data: hoje(), canalId: 'direta', frete: 0, itens: [{ produtoId: P3.id, qtd: 2, precoUnit: 50 }] });
  const contaDev = criarConta({ tipo: 'receber', descricao: 'Pedido com devolução', valor: 100, vencimento: hoje(), origem: 'venda', origemId: pedDev.id });
  registrarDevolucao(pedDev, { item: 0, qtd: 1 });
  ok('devolução abate o que o cliente deve', perto(byId('contas', contaDev.id).valor, 50), byId('contas', contaDev.id));
  desfazerDevolucao(pedDev, pedDev.devolucoes[0].id);
  ok('desfazer a devolução volta o valor para a conta', perto(byId('contas', contaDev.id).valor, 100), byId('contas', contaDev.id));
  excluirVenda(pedDev); excluirVenda(pedAPrazo);
  ok('excluir os pedidos leva as contas junto', !S.contas.some(c => c.origemId === pedDev.id || c.origemId === pedAPrazo.id), S.contas.length);

  // 26. conta que repete: mesmo dia do mês e ids fixos (dois aparelhos não duplicam)
  const aluguel = criarConta({ tipo: 'pagar', descricao: 'Aluguel 31', valor: 100, vencimento: '2026-01-31', recorrente: true });
  const fev = pagarConta(aluguel, { data: '2026-01-31' }), mar = pagarConta(fev, { data: '2026-02-28' });
  ok('conta que repete volta para o dia 31', fev.vencimento === '2026-02-28' && mar.vencimento === '2026-03-31', [fev.vencimento, mar.vencimento]);
  ok('conta que repete: ids fixos', fev.id === aluguel.id + '-202602' && !!byId('lancamentos', 'pg-' + aluguel.id), fev.id);
  const outroAparelho = { ...aluguel, pagoEm: '', valorPago: 0, lancamentoId: '' };
  const segunda = pagarConta(outroAparelho, { data: '2026-01-31' });
  ok('pagar a mesma conta em outro aparelho não duplica', segunda === null && S.lancamentos.filter(l => l.contaId === aluguel.id).length === 1 &&
    S.contas.filter(c => c.id === aluguel.id + '-202602').length === 1, [segunda, S.lancamentos.filter(l => l.contaId === aluguel.id).length]);
  S.contas.filter(c => c.id === aluguel.id || c.serie === aluguel.id).forEach(c => excluirConta(c));
  ok('excluir as contas tira os lançamentos', !S.lancamentos.some(l => String(l.contaId || '').startsWith(aluguel.id)), 0);

  // 27. peças que estragaram no acabamento
  const OR = novaOrdem({ produtoId: PA.id, qtd: 1 }), fR = F.estoqueG, hR = horimetro(), nFalhas = S.falhas.length;
  iniciarOrdem(OR); concluirOrdem(OR); refazerOrdem(OR);
  ok('estragou no acabamento: filamento continua gasto e vai para Falhas', perto(F.estoqueG, fR - 20) && S.falhas.length === nFalhas + 1 && OR.status === 'fila', [F.estoqueG, S.falhas.length, OR.status]);
  ok('estragou no acabamento: as horas continuam no horímetro', perto(horimetro(), hR + 1), horimetro());
  excluirFalha(S.falhas.find(x => x.semBaixa));
  ok('excluir essa falha não devolve filamento', perto(F.estoqueG, fR - 20), F.estoqueG);
  excluirOrdem(OR);

  // 28. copiar fixos: a retirada de cada sócio é uma
  const mesAnt = addMeses(mesAtual(), -1);
  put('lancamentos', { id: 'fx1', data: mesAnt + '-05', tipo: 'retirada', categoria: 'Retirada', descricao: 'Retirada do mês', valor: 10, socio: '1', fixo: true });
  put('lancamentos', { id: 'fx2', data: mesAnt + '-05', tipo: 'retirada', categoria: 'Retirada', descricao: 'Retirada do mês', valor: 10, socio: '2', fixo: true });
  put('lancamentos', { id: 'fx3', data: mesAtual() + '-05', tipo: 'retirada', categoria: 'Retirada', descricao: 'Retirada do mês', valor: 10, socio: '1', fixo: true });
  ok('copiar fixos: copia a retirada do outro sócio', copiarFixos(mesAtual()) === 1, 0);
  S.lancamentos.filter(l => l.descricao === 'Retirada do mês').map(l => l.id).forEach(id => rm('lancamentos', id));

  // 30. PDF do orçamento: arquivo de verdade, montado no navegador
  ok('pdf: tabelas de largura completas', pdfLarguras.F1.length === 224 && pdfLarguras.F2.length === 224, [pdfLarguras.F1.length, pdfLarguras.F2.length]);
  ok('pdf: acentos na WinAnsi', pdfCodificar('Orçamento nº 7 – São João') === 'Or\xe7amento n\xba 7 \x96 S\xe3o Jo\xe3o', pdfCodificar('Orçamento nº 7 – São João'));
  const semWinAnsi = 'ŭ ﬁ 中' + String.fromCharCode(0x200b);
  ok('pdf: fora da WinAnsi vira a letra simples ou ?', pdfCodificar(semWinAnsi) === 'u fi ?', pdfCodificar(semWinAnsi));
  ok('pdf: emoji some do texto', pdfCodificar('Natal🎄✨👍🏽🇧🇷❤️!') === 'Natal!' && pdfCodificar('© ® ™') === '\xa9 \xae \x99', [pdfCodificar('Natal🎄✨👍🏽🇧🇷❤️!'), pdfCodificar('© ® ™')]);
  ok('pdf: largura da Helvetica', perto(pdfMedir('Total', 'F2', 10), 23.89, 0.001) && perto(pdfMedir('R$ 1', 'F1', 10), 21.12, 0.001), [pdfMedir('Total', 'F2', 10), pdfMedir('R$ 1', 'F1', 10)]);
  const textoLongo = 'Peça personalizada com nome gravado em relevo e acabamento pintado à mão '.repeat(3) + 'Supercalifragilisticexpialidocious'.repeat(3);
  const quebradas = pdfQuebrar(textoLongo + '\n\nSegunda linha', 'F1', 10, 200);
  ok('pdf: quebra respeita a largura', quebradas.length > 4 && quebradas.every(l => pdfMedir(l, 'F1', 10) <= 200.001), quebradas);
  ok('pdf: quebra mantém as linhas digitadas', quebradas.slice(-2).join('|') === '|Segunda linha', quebradas.slice(-2));
  ok('pdf: nome do arquivo sem caractere proibido', pdfNomeArquivo('Orçamento 7 - A/B: "C" <D>?') === 'Orçamento 7 - A-B- -C- -D-.pdf', pdfNomeArquivo('Orçamento 7 - A/B: "C" <D>?'));
  const orcPdf = put('orcamentos', { id: 'orcpdf', numero: 99, data: hoje(), validade: addDias(hoje(), 7), clienteNome: 'Cliente (Teste) \\ PDF', prazo: '5 dias', pagamento: 'Pix', status: 'aberto', desconto: 5, sinalPct: 50,
    obs: 'Linha 1\nLinha 2', itens: Array.from({ length: 70 }, (_, i) => ({ produtoId: '', descricao: 'Item ' + (i + 1) + ' com descrição', qtd: 1, precoUnit: 10 })) });
  const dPdf = comDadosOrcamento(orcPdf);
  ok('pdf: dados do orçamento', dPdf.total === brl(695) && dPdf.desconto === brl(-5) && dPdf.itens.length === 70 && !!dPdf.sinal && dPdf.sinal.valor === brl(347.5), dPdf);
  const lerPdf = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('');
  const conferirPdf = (txt, nome) => {
    const sx = Number((/startxref\n(\d+)\n%%EOF\n$/.exec(txt) || [])[1]);
    const pos = txt.slice(sx).split('\n').slice(3).filter(l => / n $/.test(l)).map(l => Number(l.slice(0, 10)));
    ok(nome + ': começo e fim do arquivo', txt.startsWith('%PDF-1.4\n') && txt.endsWith('%%EOF\n'), txt.slice(0, 12));
    ok(nome + ': startxref aponta para a tabela', txt.slice(sx, sx + 5) === 'xref\n', sx);
    ok(nome + ': cada objeto está onde a tabela diz', pos.length > 5 && pos.every((p, i) => txt.startsWith((i + 1) + ' 0 obj\n', p)), pos.slice(0, 6));
    ok(nome + ': tamanho de cada stream confere', [...txt.matchAll(/\/Length (\d+) >>\nstream\n/g)].every(m => txt.startsWith('\nendstream', m.index + m[0].length + Number(m[1]))), 0);
  };
  const semLogo = lerPdf(pdfOrcamento(dPdf, null));
  conferirPdf(semLogo, 'pdf sem logo');
  const nPaginas = Number((/\/Count (\d+)/.exec(semLogo) || [])[1]);
  ok('pdf: 70 itens viram mais de uma página', nPaginas >= 2 && (semLogo.match(/\/Type \/Page\b/g) || []).length === nPaginas && semLogo.includes('(P\xe1gina 2 de ' + nPaginas + ')'), nPaginas);
  ok('pdf: parênteses e barra escapados', semLogo.includes('(Cliente \\(Teste\\) \\\\ PDF)'), 0);
  const logoNexos = await pdfPrepararLogo('');
  ok('pdf: logo da Nexos vira JPEG', !!logoNexos && logoNexos.dados.startsWith('\xff\xd8') && logoNexos.alturaPt === 60 && logoNexos.larguraPt > 60, logoNexos && [logoNexos.w, logoNexos.h]);
  const telaLogo = document.createElement('canvas'); telaLogo.width = 400; telaLogo.height = 100;
  telaLogo.getContext('2d').fillRect(0, 0, 40, 40);
  const logoPropria = await pdfPrepararLogo(telaLogo.toDataURL('image/png'));
  ok('pdf: logo do perfil cabe na caixa', !!logoPropria && logoPropria.larguraPt <= 170.001 && logoPropria.alturaPt <= 64.001, logoPropria && [logoPropria.larguraPt, logoPropria.alturaPt]);
  const comLogo = lerPdf(pdfOrcamento(dPdf, logoNexos));
  conferirPdf(comLogo, 'pdf com logo');
  ok('pdf: logo entra como imagem JPEG', comLogo.includes('/Subtype /Image') && comLogo.includes('/DCTDecode') && comLogo.includes('/Im1 Do'), 0);
  ok('pdf: símbolos com equivalente legível', pdfCodificar('≈ → ≤ ≥ ✓ ★ ⅓') === '~ -> <= >= \x95 * 1/3' && pdfCodificar('200 μm ⌀ ☐ ↑↓ ▲') === '200 \xb5m \xd8 [ ] ^v \x95',
    [pdfCodificar('≈ → ≤ ≥ ✓ ★ ⅓'), pdfCodificar('200 μm ⌀ ☐ ↑↓ ▲')]);
  const recuadas = pdfQuebrar('Itens:\n   - primeiro\n\t- segundo', 'F1', 10, 300);
  ok('pdf: recuo das observações continua', recuadas.join('|') === 'Itens:|\xa0\xa0\xa0- primeiro|\xa0\xa0\xa0\xa0- segundo', recuadas);
  ok('pdf: quantidade e valor como digitados', comQtdTxt(0.335) === '0,335' && comPrecoTxt(99.9) === brl(99.9) &&
    comPrecoTxt(0.335) === (0.335).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }), [comQtdTxt(0.335), comPrecoTxt(0.335)]);
  ok('pdf: a logo fica pronta uma vez só', pdfPrepararLogo('') === pdfPrepararLogo(''), 0);
  // item maior que uma página: continua nas seguintes (nada some) e a tabela não fica sozinha no fim da página 1
  const itemGigante = 'COMECO-DO-ITEM ' + Array.from({ length: 160 }, (_, i) => 'Etapa ' + (i + 1) + ': modelagem, impressão e acabamento.').join(' ') + ' FIM-DO-ITEM';
  const dGigante = { ...dPdf, itens: [{ descricao: itemGigante, qtd: '1', unit: brl(10), total: brl(10) }], obs: '',
    rodape: Array.from({ length: 30 }, (_, i) => 'Contato número ' + (i + 1)).join(' · ') };
  const gigante = lerPdf(pdfOrcamento(dGigante, null));
  conferirPdf(gigante, 'pdf com item gigante');
  const conteudos = [...gigante.matchAll(/<< \/Length (\d+) >>\nstream\n/g)].map(m => gigante.substr(m.index + m[0].length, Number(m[1])));
  ok('pdf: item gigante começa na página 1 e sai inteiro', conteudos.length >= 3 && conteudos[0].includes('(COMECO-DO-ITEM') && gigante.includes('FIM-DO-ITEM)'), conteudos.length);
  ok('pdf: rodapé comprido termina em … sem ponto solto', gigante.includes(' \x85)') && !/\xb7\) Tj/.test(gigante), 0);
  rm('orcamentos', 'orcpdf');

  // 31. dois aparelhos: o "outro PC" grava direto no banco local da demonstração (mesmas regras da função gravar)
  const pausa = (ms = 150) => new Promise(r => setTimeout(r, ms));
  const outroPC = grupos => { const e = DBDemo._ler(); const r = bancoGravar(e, grupos, agoraISO()); localStorage.setItem(DEMO_KEY, JSON.stringify(e)); return r; };
  const noBanco = (c, i) => { const l = DBDemo._ler().linhas[c + '/' + i]; return l ? l.d : null; };
  await pausa();
  const X = put('produtos', { nome: 'Peça dois PCs', materiais: [{ filamentoId: F.id, pesoG: 10 }], horas: 1, estoque: 10, precos: { direta: 30 } });
  await pausa();
  outroPC([{ n: 1, ops: [{ c: 'produtos', i: X.id, t: 'mudar', p: [{ a: { estoque: 5 } }] }] }]);           // outro PC produziu 5
  registrarVenda({ data: hoje(), canalId: 'direta', itens: [{ produtoId: X.id, qtd: 3, precoUnit: 30 }] });  // este PC vende 3 sem saber
  ok('dois PCs: a tela mostra a venda na hora', byId('produtos', X.id).estoque === 7, byId('produtos', X.id).estoque);
  await pausa();
  ok('dois PCs: estoque somado no banco (10 + 5 − 3)', noBanco('produtos', X.id).estoque === 12, noBanco('produtos', X.id).estoque);
  ok('dois PCs: a tela fica igual ao banco depois da resposta', byId('produtos', X.id).estoque === 12, byId('produtos', X.id).estoque);
  const ordemX = novaOrdem({ produtoId: X.id, qtd: 2 });
  await pausa();
  const filAntes = byId('filamentos', F.id).estoqueG;
  outroPC([{ n: 2, ops: [{ c: 'ordens', i: ordemX.id, t: 'mudar', p: [{ s: { status: 'imprimindo', inicio: agoraISO() } }] }] }]);
  concluirOrdem(byId('ordens', ordemX.id));                                                                 // este PC conclui em cima da versão velha
  await pausa();
  ok('dois PCs: movimento em cima de versão velha volta inteiro', noBanco('ordens', ordemX.id).status === 'imprimindo' && byId('ordens', ordemX.id).status === 'imprimindo', [noBanco('ordens', ordemX.id).status, byId('ordens', ordemX.id).status]);
  ok('dois PCs: e o material que ele baixaria não sai', byId('filamentos', F.id).estoqueG === filAntes && noBanco('filamentos', F.id).estoqueG === filAntes, [filAntes, byId('filamentos', F.id).estoqueG]);
  ok('dois PCs: aviso explica o que houve', $$('#toasts .toast').some(t => /Outro aparelho mudou a ordem/.test(t.textContent)), $$('#toasts .toast').map(t => t.textContent).slice(-2));
  const nPrevisto = proximoNumeroPedido();
  outroPC([{ n: 3, ops: [{ c: 'vendas', i: 'vendaOutroPC', t: 'novo', d: { numero: nPrevisto, itens: [], devolucoes: [] } }] }]);
  const vMeu = registrarVenda({ data: hoje(), canalId: 'direta', itens: [{ produtoId: X.id, qtd: 1, precoUnit: 30 }] });
  criarConta({ tipo: 'receber', descricao: `Pedido nº ${vMeu.numero} — teste`, valor: 30, vencimento: hoje(), origem: 'venda', origemId: vMeu.id, parte: 'saldo' });
  await pausa(300);
  const contaMinha = S.contas.find(c => c.origemId === vMeu.id);
  ok('dois PCs: número repetido vira o próximo', byId('vendas', vMeu.id).numero === nPrevisto + 1 && noBanco('vendas', vMeu.id).numero === nPrevisto + 1, [nPrevisto, byId('vendas', vMeu.id).numero]);
  ok('dois PCs: a conta acompanha o número novo', contaMinha && contaMinha.descricao === `Pedido nº ${nPrevisto + 1} — teste` && noBanco('contas', contaMinha.id).descricao === contaMinha.descricao, contaMinha && contaMinha.descricao);
  const Y = put('produtos', { nome: 'Produto Y', categoria: 'A', materiais: [{ filamentoId: F.id, pesoG: 5 }], horas: 1, estoque: 4 });
  await pausa();
  cadEditarProduto(Y.id);
  outroPC([{ n: 4, ops: [{ c: 'produtos', i: Y.id, t: 'mudar', p: [{ s: { categoria: 'B' }, a: { estoque: -1 } }] }] }]);
  $('#modal [name="nome"]').value = 'Produto Y2';
  $('#modal form').requestSubmit();
  await pausa(300);
  ok('dois PCs: formulário grava só o que a pessoa mudou', noBanco('produtos', Y.id).nome === 'Produto Y2' && noBanco('produtos', Y.id).categoria === 'B' && noBanco('produtos', Y.id).estoque === 3, noBanco('produtos', Y.id));
  ok('dois PCs: e a tela fica com as duas mudanças', byId('produtos', Y.id).categoria === 'B' && byId('produtos', Y.id).nome === 'Produto Y2', byId('produtos', Y.id));
  outroPC([{ n: 5, ops: [{ c: 'meta', i: 'config', t: 'mesclar', p: [{ s: { imposto: 9 } }] }] }]);
  S.config.kwh = 1.2; saveMeta('config');
  await pausa();
  ok('dois PCs: configuração grava só o campo mudado', noBanco('meta', 'config').imposto === 9 && noBanco('meta', 'config').kwh === 1.2 && S.config.imposto === 9, [noBanco('meta', 'config').imposto, S.config.imposto]);
  outroPC([{ n: 6, ops: [{ c: 'meta', i: 'config', t: 'mesclar', p: [{ s: { imposto: 6 } }] }] }]);
  S.config.imposto = 6; saveMeta('config');
  const Z = put('clientes', { nome: 'Cliente Z' });
  await pausa();
  comEditarCliente(Z.id);
  outroPC([{ n: 7, ops: [{ c: 'clientes', i: Z.id, t: 'apagar' }] }]);
  $('#modal [name="nome"]').value = 'Cliente Z2';
  $('#modal form').requestSubmit();
  await pausa(300);
  ok('dois PCs: edição de algo excluído no outro PC não recria', !noBanco('clientes', Z.id) && !byId('clientes', Z.id), noBanco('clientes', Z.id));
  if ($('#modal.open')) fecharModal();
  const g1 = await DBDemo.gravarLote([{ n: 1, id: 'teste-repetido', ops: [{ c: 'produtos', i: X.id, t: 'mudar', p: [{ a: { estoque: 1 } }] }] }]);
  const g2 = await DBDemo.gravarLote([{ n: 1, id: 'teste-repetido', ops: [{ c: 'produtos', i: X.id, t: 'mudar', p: [{ a: { estoque: 1 } }] }] }]);
  ok('dois PCs: o mesmo grupo reenviado não grava duas vezes', g1[0].ok && g2[0].ja && noBanco('produtos', X.id).estoque === 12, [g2[0], noBanco('produtos', X.id).estoque]);
  ok('dois PCs: diferença de campo vira soma no estoque e o id nunca muda',
    iguais(diferenca('produtos', { id: 'a', estoque: 2, nome: 'x' }, { id: 'b', estoque: 5, nome: 'y' }, {}, null), { s: { nome: 'y' }, a: { estoque: 3 } }), 0);
  await carregarTudo();                                    // a gravação direta acima não passou pela tela: relê do banco
  // editar pela janela a quantidade de uma ordem já concluída: continua concluída e o estoque é refeito uma vez
  const W = put('produtos', { nome: 'Produto W', materiais: [{ filamentoId: F.id, pesoG: 10 }], horas: 1, estoque: 0 });
  const oW = novaOrdem({ produtoId: W.id, qtd: 2 });
  await pausa();
  concluirOrdem(byId('ordens', oW.id));
  await pausa();
  const filW = byId('filamentos', F.id).estoqueG;
  opEditarOrdem(oW.id);
  $('#modal [name="qtd"]').value = '3';
  $('#modal form').requestSubmit();
  await pausa(300);
  const oW2 = noBanco('ordens', oW.id);
  ok('editar ordem concluída pela janela: continua concluída, com custo e data', oW2.status === 'concluido' && oW2.qtd === 3 && oW2.custoUnit > 0 && !!oW2.fim && byId('ordens', oW.id).status === 'concluido', [oW2.status, oW2.custoUnit, oW2.fim]);
  ok('editar ordem concluída pela janela: estoque e filamento refeitos uma vez', noBanco('produtos', W.id).estoque === 3 && noBanco('filamentos', F.id).estoqueG === filW - 10, [noBanco('produtos', W.id).estoque, filW, noBanco('filamentos', F.id).estoqueG]);
  // estoque digitado no formulário com o banco já diferente do que a janela mostrava: não soma, volta com aviso
  cadEditarProduto(W.id);
  outroPC([{ n: 8, ops: [{ c: 'produtos', i: W.id, t: 'mudar', p: [{ a: { estoque: -1 } }] }] }]);   // outro PC vendeu 1
  $('#modal [name="estoque"]').value = '10';
  $('#modal form').requestSubmit();
  await pausa(300);
  ok('estoque digitado: outra mudança no meio faz a correção voltar (não soma)', noBanco('produtos', W.id).estoque === 2 && byId('produtos', W.id).estoque === 2, [noBanco('produtos', W.id).estoque, byId('produtos', W.id).estoque]);
  cadEditarProduto(W.id);
  $('#modal [name="estoque"]').value = '10';
  $('#modal form').requestSubmit();
  await pausa(300);
  ok('estoque digitado: sem mudança no meio, vale o número digitado', noBanco('produtos', W.id).estoque === 10, noBanco('produtos', W.id).estoque);
  // gastos fixos: o que se repete no mês em dias diferentes é copiado todo; dois iguais no mesmo dia e com o mesmo valor
  // (duas parcelas, duas retiradas) também, nunca juntados, com aviso só na primeira cópia
  const mesAntFix = addMeses(mesAtual(), -1);
  ['05', '20'].forEach((dia, n) => put('lancamentos', { id: 'quinz' + n, data: mesAntFix + '-' + dia, tipo: 'retirada', categoria: 'Retirada', descricao: 'Pró-labore quinzenal', valor: 1000, fixo: true, socio: '1', criadoEm: agoraISO() }));
  ['dup0', 'dup1'].forEach(id => put('lancamentos', { id, data: mesAntFix + '-10', tipo: 'gasto', categoria: 'Outros', descricao: 'Internet repetida', valor: 99, fixo: true, criadoEm: agoraISO() }));
  await pausa();
  const infoFix = {};
  copiarFixos(mesAtual(), infoFix);
  const doMes = S.lancamentos.filter(l => noPeriodo(l.data, mesAtual(), mesAtual()));
  ok('gastos fixos: quinzenal copiado duas vezes e dois iguais no mesmo dia também (nada some)', doMes.filter(l => l.descricao === 'Pró-labore quinzenal').length === 2 && doMes.filter(l => l.descricao === 'Internet repetida').length === 2,
    doMes.map(l => l.descricao));
  ok('gastos fixos: a cópia avisa dos iguais', iguais(infoFix.iguais, ['Internet repetida']), infoFix.iguais);
  // cópia de um mês levada para outra data (internet de março paga adiantada, em fevereiro): copiar março não repete e diz
  // onde ela está; abril copia de novo, no dia de sempre
  put('lancamentos', { id: 'movida', data: '2032-02-10', tipo: 'gasto', categoria: 'Outros', descricao: 'Internet movida', valor: 120, fixo: true, criadoEm: agoraISO() });
  await pausa();
  copiarFixos('2032-03');
  const copiaMar = byId('lancamentos', 'fx-movida-203203');
  put('lancamentos', { ...copiaMar, data: '2032-02-27' });
  await pausa();
  const infoMov = {}, nMov = copiarFixos('2032-03', infoMov);
  copiarFixos('2032-04');
  const movidas = S.lancamentos.filter(l => l.descricao === 'Internet movida').map(l => l.data).sort();
  ok('gastos fixos: cópia levada para outro mês não é repetida, o aviso diz onde está e o mês seguinte continua no dia de sempre',
    nMov === 0 && iguais(infoMov.fora, [{ descricao: 'Internet movida', data: '2032-02-27' }]) && iguais(movidas, ['2032-02-10', '2032-02-27', '2032-04-10']),
    [nMov, infoMov.fora, movidas]);
  // paga atrasada: a cópia de fevereiro levada para 02/03 antes de copiar março; março ainda ganha a sua (no dia 10), e
  // abril segue a de março, não a atrasada
  put('lancamentos', { id: 'atrasada', data: '2033-01-10', tipo: 'gasto', categoria: 'Outros', descricao: 'Aluguel atrasado', valor: 1000, fixo: true, criadoEm: agoraISO() });
  await pausa();
  copiarFixos('2033-02');
  put('lancamentos', { ...byId('lancamentos', 'fx-atrasada-203302'), data: '2033-03-02' });
  await pausa();
  const nAtr = copiarFixos('2033-03');
  copiarFixos('2033-04');
  const atrasadas = S.lancamentos.filter(l => l.descricao === 'Aluguel atrasado').map(l => l.data).sort();
  ok('gastos fixos: cópia paga atrasada no mês seguinte não impede a cópia desse mês, e a série segue no dia de sempre',
    nAtr === 1 && iguais(atrasadas, ['2033-01-10', '2033-03-02', '2033-03-10', '2033-04-10']), [nAtr, atrasadas]);
  ok('gastos fixos: a sugestão do rateio conta a cópia pelo mês dela, não pelo dia do pagamento',
    caixaDoMes('2033-02').fixos === 1000 && caixaDoMes('2033-03').fixos === 1000, [caixaDoMes('2033-02').fixos, caixaDoMes('2033-03').fixos]);
  // com o mês seguinte já copiado, a atrasada (paga com multa) não vira a fonte do outro mês: segue o valor de agora
  put('lancamentos', { id: 'multa', data: '2034-01-10', tipo: 'gasto', categoria: 'Outros', descricao: 'Internet com multa', valor: 100, fixo: true, criadoEm: agoraISO() });
  await pausa();
  copiarFixos('2034-02'); copiarFixos('2034-03');
  put('lancamentos', { ...byId('lancamentos', 'fx-multa-203402'), data: '2034-03-05', valor: 105 });
  await pausa();
  copiarFixos('2034-04');
  const abrilMulta = S.lancamentos.filter(l => l.descricao === 'Internet com multa' && noPeriodo(l.data, '2034-04', '2034-04')).map(l => [l.data, l.valor]);
  ok('gastos fixos: a cópia paga atrasada com multa não vira a fonte do mês seguinte', iguais(abrilMulta, [['2034-04-10', 100]]), abrilMulta);
  // fixos nos dias 30 e 31 de janeiro: em fevereiro os dois caem no dia 28 e continuam dois; em março voltam aos dias 30 e 31
  ['30', '31'].forEach((dia, n) => put('lancamentos', { id: 'diar' + n, data: '2031-01-' + dia, tipo: 'gasto', categoria: 'Outros', descricao: 'Diarista fim de mês', valor: 150, fixo: true, criadoEm: agoraISO() }));
  await pausa();
  const diarista = mes => S.lancamentos.filter(l => l.descricao === 'Diarista fim de mês' && noPeriodo(l.data, mes, mes)).map(l => l.data).sort();
  copiarFixos('2031-02'); copiarFixos('2031-03'); copiarFixos('2031-04');
  ok('gastos fixos: dois fixos que o mês curto junta no mesmo dia continuam dois nos meses seguintes',
    iguais(diarista('2031-02'), ['2031-02-28', '2031-02-28']) && iguais(diarista('2031-03'), ['2031-03-30', '2031-03-31']) && iguais(diarista('2031-04'), ['2031-04-30', '2031-04-30']),
    [diarista('2031-02'), diarista('2031-03'), diarista('2031-04')]);
  // "Feito" na mesma manutenção nos dois PCs, com as janelas abertas na mesma contagem do item: registra uma vez só
  const itM = put('manutItens', { nome: 'Item dois PCs', intervaloH: 100, ultimaH: 0 });
  await pausa();
  opFeito(itM.id);
  outroPC([{ n: 9, ops: [{ c: 'manutHist', i: ('mh-' + itM.id).slice(0, 40) + '-0', t: 'novo', d: { data: hoje(), itemId: itM.id, descricao: 'feito no outro PC', custo: 0 } },
    { c: 'manutItens', i: itM.id, t: 'mudar', p: [{ s: { feitos: 1 } }] }] }]);
  $('#modal form').requestSubmit();
  await pausa(300);
  const histBanco = Object.values(DBDemo._ler().linhas).filter(l => l.d.itemId === itM.id && /^mh-/.test(l.d.id));
  ok('manutenção feita nos dois PCs: o segundo não registra em dobro', histBanco.length === 1 && histBanco[0].d.descricao === 'feito no outro PC', histBanco.map(l => l.d.descricao));
  if ($('#modal.open')) fecharModal();
  await carregarTudo();
  // um PC só: dois "Feito" seguidos sem impressão no meio, apagar um registro errado e refazer, e o item excluído e
  // criado de novo com o mesmo código: todos registram
  const itN = put('manutItens', { id: 'item-feito-seguido', nome: 'Item feito seguido', intervaloH: 100, ultimaH: horimetro() });
  await pausa();
  const feito = async () => { opFeito(itN.id); $('#modal form').requestSubmit(); await pausa(200); if ($('#modal.open')) fecharModal(); };
  const doItem = () => Object.values(DBDemo._ler().linhas).filter(l => l.d.itemId === itN.id && /^mh-/.test(l.d.id)).map(l => l.d.id).sort();
  await feito(); await feito();
  ok('manutenção: dois "Feito" seguidos no mesmo item registram os dois', doItem().length === 2 && byId('manutItens', itN.id).feitos === 2, [doItem(), byId('manutItens', itN.id).feitos]);
  rm('manutHist', doItem()[1]);
  await pausa();
  await feito();
  ok('manutenção: apagar um registro errado e refazer registra de novo', doItem().length === 2, doItem());
  rm('manutItens', itN.id);
  await pausa();
  put('manutItens', { id: 'item-feito-seguido', nome: 'Item feito seguido', intervaloH: 100, ultimaH: horimetro() });
  await pausa();
  await feito();
  ok('manutenção: item excluído e criado de novo com o mesmo código também registra', doItem().length === 3, doItem());
  // editar o item com a janela aberta enquanto o outro PC dá "Feito": sem mexer no horímetro, o "Feito" dele continua
  const itE = put('manutItens', { id: 'item-editado', nome: 'Item editado', intervaloH: 100, ultimaH: 0.28 });
  await pausa();
  opEditarItem(itE.id);
  outroPC([{ n: 10, ops: [{ c: 'manutItens', i: itE.id, t: 'mudar', p: [{ s: { ultimaH: 50, feitos: 1 } }] }] }]);
  await carregarTudo(true);
  $('#modal [name="intervaloH"]').value = '120';
  $('#modal form').requestSubmit();
  await pausa(300);
  const itBanco = noBanco('manutItens', itE.id) || {};
  ok('manutenção: editar o item não desfaz o "Feito" que o outro PC deu com a janela aberta', itBanco.ultimaH === 50 && itBanco.intervaloH === 120 && itBanco.feitos === 1, itBanco);
  if ($('#modal.open')) fecharModal();
  // salvamento que grava o mesmo registro duas vezes (editar ordem já impressa): campo que a pessoa não mexeu não volta
  // ao valor de quando a janela abriu, e o que a primeira gravação mudou continua valendo
  const snapO = { id: 'o', obs: 'nº 3', status: 'concluido', qtd: 2 };
  ok('formulário: 1ª gravação do registro só leva o que a pessoa mexeu',
    iguais(diferenca('ordens', { id: 'o', obs: 'nº 4', status: 'concluido', qtd: 2 }, { id: 'o', obs: 'nº 3', status: 'fila', qtd: 2 }, {}, { snap: snapO }, undefined), { s: { status: 'fila' } }), 0);
  ok('formulário: na 2ª gravação a observação acertada fica, e status e quantidade entram',
    iguais(diferenca('ordens', { id: 'o', obs: 'nº 4', status: 'fila', qtd: 2 }, { id: 'o', obs: 'nº 3', status: 'concluido', qtd: 3 }, {}, { snap: snapO }, { t: 'mudar', p: [{ s: { status: 'fila' } }] }), { s: { status: 'concluido', qtd: 3 } }), 0);

  // 32. versão 17, etapa 1: nada em dobro (código fixo em sugestão, falha, compra e reposição; ordem e pedido iguais perguntam),
  // Desfazer, avisos e o cursor ao abrir a janela. O "outro PC" grava direto no banco local, como na seção 31.
  // tenta(nomes, fn): se o bloco der erro (ex.: função que o código antigo não tem), cada verificação dele que faltou conta como falha
  const tenta = async (nomes, fn) => {
    const ja = R.length;
    try { await fn(); } catch (e) {
      const feitos = R.slice(ja).map(x => x.replace(/^(OK {2}|FALHOU )/, '').split(' -> ')[0]);
      nomes.filter(n => !feitos.includes(n)).forEach(n => ok(n, false, 'erro: ' + String(e && e.message || e)));
    }
    if ($('#modal.open')) { if (FORM) FORM.sujo = false; fecharModal(); }
  };
  await carregarTudo();
  const dia32 = hoje().replace(/-/g, ''), linhas32 = filtro => Object.values(DBDemo._ler().linhas).filter(l => filtro(l.d));
  const bancoTexto = () => { const e = DBDemo._ler().linhas, o = {}; Object.keys(e).sort().forEach(k => { o[k] = e[k].d; }); return JSON.stringify(o); };
  const avisos32 = () => $$('#toasts .toast').map(t => t.textContent);
  put('filamentos', { id: 'fil-e1', nome: 'PLA Etapa Um', tipo: 'PLA', cor: '#123456', precoKg: 100, estoqueG: 1000 });
  put('insumos', { id: 'ins-e1', nome: 'Caixa Etapa Um', unidade: 'un', custo: 1, estoque: 10, minimo: 0 });
  put('produtos', { id: 'prod-e1', nome: 'Vaso Etapa Um', materiais: [{ filamentoId: 'fil-e1', pesoG: 10 }], horas: 1, estoque: 0, estoqueMinimo: 4, precos: { direta: 30 } });
  put('produtos', { id: 'prod-e1b', nome: 'Luminária Etapa Um', materiais: [{ filamentoId: 'fil-e1', pesoG: 20 }], horas: 1, estoque: 5, precos: { direta: 50 } });
  await pausa();
  const dCompra = { data: hoje(), filamentoId: 'fil-e1', fornecedorId: '', pesoG: 1000, valor: 104.5 };
  await tenta(['nada em dobro: o código da compra é o material, o dia, o peso, o valor e um contador', 'nada em dobro: registrarCompra aceita o código de fora',
    'nada em dobro: a mesma compra feita no outro PC entra uma vez (estoque +1 kg uma vez)', 'nada em dobro: o aviso diz que o outro aparelho já registrou e nada entrou em dobro',
    'nada em dobro: com a primeira já na tela, a segunda compra igual ganha outro código e entra'], async () => {
    const cod = codigoCompra(dCompra);
    ok('nada em dobro: o código da compra é o material, o dia, o peso, o valor e um contador', cod === `cp-fil-e1-${dia32}-100000-10450-0`, cod);
    outroPC([{ n: 11, ops: [{ c: 'compras', i: cod, t: 'novo', d: { ...dCompra, precoKg: 104.5, obs: '', criadoEm: agoraISO() } }, { c: 'filamentos', i: 'fil-e1', t: 'mudar', p: [{ a: { estoqueG: 1000 } }] }] }]);
    const c = registrarCompra({ ...dCompra, id: cod });                                   // este PC salva a mesma compra sem saber
    ok('nada em dobro: registrarCompra aceita o código de fora', c.id === cod, c.id);
    await pausa(300);
    ok('nada em dobro: a mesma compra feita no outro PC entra uma vez (estoque +1 kg uma vez)', noBanco('filamentos', 'fil-e1').estoqueG === 2000 && byId('filamentos', 'fil-e1').estoqueG === 2000 &&
      linhas32(d => /^cp-fil-e1-/.test(d.id)).length === 1, [noBanco('filamentos', 'fil-e1').estoqueG, byId('filamentos', 'fil-e1').estoqueG]);
    ok('nada em dobro: o aviso diz que o outro aparelho já registrou e nada entrou em dobro', avisos32().some(t => /Outro aparelho já tinha registrado a compra de 1 kg de PLA Etapa Um\. Nada foi gravado em dobro/.test(t)), avisos32().slice(-2));
    ok('nada em dobro: com a primeira já na tela, a segunda compra igual ganha outro código e entra', codigoCompra(dCompra) === `cp-fil-e1-${dia32}-100000-10450-1`, codigoCompra(dCompra));
  });
  await tenta(['nada em dobro: o código da reposição vai no lançamento do gasto', 'nada em dobro: a mesma reposição feita no outro PC entra uma vez (estoque 10 + 5)'], async () => {
    const cod = codigoReposicao('ins-e1', 5, 20, hoje());
    ok('nada em dobro: o código da reposição vai no lançamento do gasto', cod === `rp-ins-e1-${dia32}-5000-2000-0`, cod);
    outroPC([{ n: 12, ops: [{ c: 'lancamentos', i: cod, t: 'novo', d: { data: hoje(), tipo: 'gasto', categoria: 'Insumos', descricao: 'Reposição: Caixa Etapa Um (5 un)', valor: 20, fixo: false, criadoEm: agoraISO() } },
      { c: 'insumos', i: 'ins-e1', t: 'mudar', p: [{ a: { estoque: 5 } }] }] }]);
    reporInsumo(byId('insumos', 'ins-e1'), 5, 20, hoje(), cod);
    await pausa(300);
    ok('nada em dobro: a mesma reposição feita no outro PC entra uma vez (estoque 10 + 5)', noBanco('insumos', 'ins-e1').estoque === 15 && byId('insumos', 'ins-e1').estoque === 15 &&
      linhas32(d => /^rp-ins-e1-/.test(d.id)).length === 1, [noBanco('insumos', 'ins-e1').estoque, linhas32(d => /^rp-ins-e1-/.test(d.id)).length]);
  });
  await tenta(['nada em dobro: o código da ordem da sugestão é o produto e quantas ordens ele já teve', 'nada em dobro: a ordem da mesma sugestão criada nos dois PCs entra uma vez'], async () => {
    const cod = codigoSugestao('prod-e1');
    ok('nada em dobro: o código da ordem da sugestão é o produto e quantas ordens ele já teve', cod === 'sg-prod-e1-0', cod);
    outroPC([{ n: 13, ops: [{ c: 'ordens', i: cod, t: 'novo', d: { produtoId: 'prod-e1', qtd: 4, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: agoraISO(), ordem: Date.now() + 1e6 } }] }]);
    opCriarSugerida('prod-e1', 4);                                                      // a janela de sempre, com a quantidade
    $('#modal form').requestSubmit();
    await pausa(300);
    ok('nada em dobro: a ordem da mesma sugestão criada nos dois PCs entra uma vez', linhas32(d => d.produtoId === 'prod-e1').length === 1 && S.ordens.filter(o => o.produtoId === 'prod-e1').length === 1,
      linhas32(d => d.produtoId === 'prod-e1').map(d => d.id));
  });
  let oF = null;
  await tenta(['falha da ordem: o código é a ordem, o filamento e quantas falhas ela já teve', 'falha da ordem: guarda a ordem, a ordem conta 1 falha e o filamento baixa', 'falha da ordem: a próxima falha dela ganha outro código',
    'nada em dobro: a mesma falha registrada nos dois PCs entra uma vez (o filamento baixa uma vez)'], async () => {
    oF = novaOrdem({ produtoId: 'prod-e1b', qtd: 2 }); iniciarOrdem(oF);
    await pausa();
    const n0 = falhasDaOrdem(byId('ordens', oF.id)), cod = codigoFalha(byId('ordens', oF.id), 'fil-e1', n0), fil0 = byId('filamentos', 'fil-e1').estoqueG;
    ok('falha da ordem: o código é a ordem, o filamento e quantas falhas ela já teve', cod === 'fa-' + oF.id + '-fil-e1-0' && n0 === 0, cod);
    registrarFalha({ id: cod, ordemId: oF.id, data: hoje(), produtoId: 'prod-e1b', filamentoId: 'fil-e1', gramas: 15, motivo: 'Entupimento' });
    await pausa();
    ok('falha da ordem: guarda a ordem, a ordem conta 1 falha e o filamento baixa', (noBanco('falhas', cod) || {}).ordemId === oF.id && noBanco('ordens', oF.id).falhas === 1 &&
      noBanco('ordens', oF.id).status === 'imprimindo' && noBanco('filamentos', 'fil-e1').estoqueG === fil0 - 15, [noBanco('falhas', cod), noBanco('ordens', oF.id).falhas]);
    const cod2 = codigoFalha(byId('ordens', oF.id), 'fil-e1', falhasDaOrdem(byId('ordens', oF.id)));
    ok('falha da ordem: a próxima falha dela ganha outro código', cod2 === 'fa-' + oF.id + '-fil-e1-1', cod2);
    outroPC([{ n: 14, ops: [{ c: 'filamentos', i: 'fil-e1', t: 'mudar', p: [{ a: { estoqueG: -15 } }] }, { c: 'falhas', i: cod2, t: 'novo', d: { data: hoje(), produtoId: 'prod-e1b', filamentoId: 'fil-e1', gramas: 15, motivo: 'Entupimento', ordemId: oF.id, custo: 1.5, criadoEm: agoraISO() } },
      { c: 'ordens', i: oF.id, t: 'mudar', p: [{ s: { falhas: 2 } }] }] }]);
    registrarFalha({ id: cod2, ordemId: oF.id, data: hoje(), produtoId: 'prod-e1b', filamentoId: 'fil-e1', gramas: 15, motivo: 'Entupimento' });
    await pausa(300);
    ok('nada em dobro: a mesma falha registrada nos dois PCs entra uma vez (o filamento baixa uma vez)', noBanco('filamentos', 'fil-e1').estoqueG === fil0 - 30 && linhas32(d => d.ordemId === oF.id).length === 2 &&
      noBanco('ordens', oF.id).falhas === 2 && byId('filamentos', 'fil-e1').estoqueG === fil0 - 30, [noBanco('filamentos', 'fil-e1').estoqueG, fil0, linhas32(d => d.ordemId === oF.id).length]);
  });
  // limpa os avisos da tela (para ler só os que a cena seguinte mostrar)
  const limparAvisos = () => $$('#toasts .toast').forEach(t => (t._sair ? t._sair() : t.remove()));
  await tenta(['falha da ordem: o outro aparelho mudou a ordem antes (voltou para a fila): a falha e a baixa do filamento entram do mesmo jeito, sem aviso',
    'falha da ordem: a perda de outro filamento da mesma ordem, registrada ao mesmo tempo no outro aparelho, entra também'], async () => {
    put('filamentos', { id: 'fil-e2', nome: 'PETG Etapa Um', tipo: 'PETG', cor: '#654321', precoKg: 120, estoqueG: 1000 });
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 1 }); iniciarOrdem(o);
    await pausa();
    const fil0 = noBanco('filamentos', 'fil-e1').estoqueG, l = DBDemo._ler().linhas['ordens/' + o.id], n = falhasDaOrdem(byId('ordens', o.id));
    outroPC([{ n: 21, ops: [{ c: 'ordens', i: o.id, t: 'mudar', se: l.v, p: [{ s: { status: 'fila', inicio: '' } }] }] }]);   // este PC ainda não sabe
    limparAvisos();
    const cod = codigoFalha(byId('ordens', o.id), 'fil-e1', n);
    registrarFalha({ id: cod, ordemId: o.id, data: hoje(), produtoId: 'prod-e1b', filamentoId: 'fil-e1', gramas: 12, motivo: 'Entupimento' });
    await pausa(300);
    ok('falha da ordem: o outro aparelho mudou a ordem antes (voltou para a fila): a falha e a baixa do filamento entram do mesmo jeito, sem aviso',
      !!noBanco('falhas', cod) && noBanco('filamentos', 'fil-e1').estoqueG === fil0 - 12 && noBanco('ordens', o.id).status === 'fila' && noBanco('ordens', o.id).falhas === 1 &&
      byId('ordens', o.id).status === 'fila' && !avisos32().some(t => /Outro aparelho|não foi gravad/.test(t)), [!!noBanco('falhas', cod), noBanco('filamentos', 'fil-e1').estoqueG, fil0, noBanco('ordens', o.id), avisos32()]);
    const n2 = falhasDaOrdem(byId('ordens', o.id)), outro = codigoFalha(byId('ordens', o.id), 'fil-e2', n2), meu = codigoFalha(byId('ordens', o.id), 'fil-e1', n2);
    const pla0 = noBanco('filamentos', 'fil-e1').estoqueG, petg0 = noBanco('filamentos', 'fil-e2').estoqueG;
    outroPC([{ n: 22, ops: [{ c: 'filamentos', i: 'fil-e2', t: 'mudar', p: [{ a: { estoqueG: -40 } }] }, { c: 'falhas', i: outro, t: 'novo', d: { data: hoje(), produtoId: 'prod-e1b', filamentoId: 'fil-e2', gramas: 40, motivo: 'Entupimento', ordemId: o.id, custo: 4.8, criadoEm: agoraISO() } },
      { c: 'ordens', i: o.id, t: 'mudar', p: [{ s: { falhas: n2 + 1 } }] }] }]);
    registrarFalha({ id: meu, ordemId: o.id, data: hoje(), produtoId: 'prod-e1b', filamentoId: 'fil-e1', gramas: 30, motivo: 'Entupimento' });
    await pausa(300);
    ok('falha da ordem: a perda de outro filamento da mesma ordem, registrada ao mesmo tempo no outro aparelho, entra também', outro !== meu && !!noBanco('falhas', outro) && !!noBanco('falhas', meu) &&
      noBanco('filamentos', 'fil-e1').estoqueG === pla0 - 30 && noBanco('filamentos', 'fil-e2').estoqueG === petg0 - 40 && linhas32(d => d.ordemId === o.id).length === 3,
      [outro, meu, noBanco('filamentos', 'fil-e1').estoqueG, pla0, linhas32(d => d.ordemId === o.id).length]);
  });
  await tenta(['Produção: a ordem que já falhou mostra "Falhou 2 vezes" na fila', 'Falhou: a janela avisa que a ordem já tem falha registrada'], async () => {
    const x = filaProducao().find(y => y.o.id === oF.id);
    ok('Produção: a ordem que já falhou mostra "Falhou 2 vezes" na fila', !!x && /Falhou 2 vezes/.test(opLinhaFila(x, [], false)), x && opLinhaFila(x, [], false).slice(0, 300));
    opFalhou(oF.id);
    ok('Falhou: a janela avisa que a ordem já tem falha registrada', /Esta ordem já tem 2 falhas registradas: a última, 15 g de PLA Etapa Um, agora há pouco/.test(($('#modal form .aviso') || {}).textContent || ''), ($('#modal form .aviso') || {}).textContent);
  });
  await tenta(['nada em dobro: a compra do outro PC que chega com a janela aberta não entra de novo (o código é contado ao abrir a janela) e quem salva é avisado',
    'nada em dobro: a reposição do outro PC que chega com a janela aberta não entra de novo, e quem salva é avisado'], async () => {
    const est0 = noBanco('filamentos', 'fil-e1').estoqueG, n0 = linhas32(d => /^cp-fil-e1-/.test(d.id)).length;
    cadNovaCompra('fil-e1');                                        // a janela abre: os códigos que estão na tela são contados agora
    setCampo('pesoG', 500); setCampo('valor', 61);
    const cod = codigoCompra({ data: hoje(), filamentoId: 'fil-e1', pesoG: 500, valor: 61 });
    outroPC([{ n: 23, ops: [{ c: 'compras', i: cod, t: 'novo', d: { data: hoje(), filamentoId: 'fil-e1', fornecedorId: '', pesoG: 500, valor: 61, precoKg: 122, obs: '', criadoEm: agoraISO() } },
      { c: 'filamentos', i: 'fil-e1', t: 'mudar', p: [{ a: { estoqueG: 500 } }] }] }]);
    await carregarTudo(true);                                       // a compra do outro PC chega aqui com a janela aberta (a lista atrás não muda)
    limparAvisos();
    $('#modal form').requestSubmit();
    await pausa(300);
    ok('nada em dobro: a compra do outro PC que chega com a janela aberta não entra de novo (o código é contado ao abrir a janela) e quem salva é avisado',
      linhas32(d => /^cp-fil-e1-/.test(d.id)).length === n0 + 1 && noBanco('filamentos', 'fil-e1').estoqueG === est0 + 500 && !$('#modal.open') &&
      avisos32().some(t => /Outro aparelho já registrou esta compra \(500 g de PLA Etapa Um, R\$\s?61,00\) enquanto esta janela estava aberta\. Nada foi gravado em dobro/.test(t)),
      [linhas32(d => /^cp-fil-e1-/.test(d.id)).length, n0, noBanco('filamentos', 'fil-e1').estoqueG, est0, avisos32()]);
    const ins0 = noBanco('insumos', 'ins-e1').estoque, r0 = linhas32(d => /^rp-ins-e1-/.test(d.id)).length;
    cadReporInsumo('ins-e1');
    setCampo('qtd', 3); setCampo('valor', 9);
    const codR = codigoReposicao('ins-e1', 3, 9, hoje());
    outroPC([{ n: 24, ops: [{ c: 'lancamentos', i: codR, t: 'novo', d: { data: hoje(), tipo: 'gasto', categoria: 'Insumos', descricao: 'Reposição: Caixa Etapa Um (3 un)', valor: 9, fixo: false, criadoEm: agoraISO() } },
      { c: 'insumos', i: 'ins-e1', t: 'mudar', p: [{ a: { estoque: 3 } }] }] }]);
    await carregarTudo(true);
    limparAvisos();
    $('#modal form').requestSubmit();
    await pausa(300);
    ok('nada em dobro: a reposição do outro PC que chega com a janela aberta não entra de novo, e quem salva é avisado',
      linhas32(d => /^rp-ins-e1-/.test(d.id)).length === r0 + 1 && noBanco('insumos', 'ins-e1').estoque === ins0 + 3 && avisos32().some(t => /Outro aparelho já registrou esta reposição .*Nada foi gravado em dobro/.test(t)),
      [linhas32(d => /^rp-ins-e1-/.test(d.id)).length, r0, noBanco('insumos', 'ins-e1').estoque, ins0, avisos32()]);
  });
  await tenta(['nada em dobro: "Criar ordem" com a tela parada embaixo do mouse (a ordem da mesma sugestão chegou do outro PC, com outra quantidade) pergunta antes'], async () => {
    put('produtos', { id: 'prod-e1c', nome: 'Caixinha Etapa Um', materiais: [{ filamentoId: 'fil-e1', pesoG: 5 }], horas: 0.5, estoque: 0, estoqueMinimo: 3, precos: { direta: 10 } });
    await pausa();
    const m = /data-id="prod-e1c" data-qtd="(\d+)" data-cod="([^"]+)"/.exec(opListaSugestoes(sugestoesProducao()));   // o botão como estava na tela
    outroPC([{ n: 25, ops: [{ c: 'ordens', i: m[2], t: 'novo', d: { produtoId: 'prod-e1c', qtd: 8, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: agoraISO(), ordem: Date.now() + 3e6 } }] }]);
    await carregarTudo(true);                                       // a ordem do outro PC chega; a tela ficou parada com o botão antigo
    opCriarSugerida('prod-e1c', m[1], m[2]);
    $('#modal form').requestSubmit();
    await pausa(100);
    const p = $('#modal .caixa.pergunta');
    ok('nada em dobro: "Criar ordem" com a tela parada embaixo do mouse (a ordem da mesma sugestão chegou do outro PC, com outra quantidade) pergunta antes',
      !!p && /8× Caixinha Etapa Um/.test(p.textContent) && S.ordens.filter(o => o.produtoId === 'prod-e1c').length === 1, [m && m[2], p && p.textContent]);
  });
  await tenta(['ordem igual: mesmo produto, quantidade e cliente, criada há pouco', 'ordem igual: quantidade diferente, outro cliente ou criada há mais tempo não contam'], async () => {
    ok('ordem igual: mesmo produto, quantidade e cliente, criada há pouco', (ordemIgualRecente({ produtoId: 'prod-e1', qtd: 4, clienteId: '' }) || {}).id === 'sg-prod-e1-0', ordemIgualRecente({ produtoId: 'prod-e1', qtd: 4, clienteId: '' }));
    put('ordens', { id: 'ord-velha-e1', produtoId: 'prod-e1', qtd: 9, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: new Date(Date.now() - 10 * 60000).toISOString(), ordem: Date.now() + 2e6 });
    ok('ordem igual: quantidade diferente, outro cliente ou criada há mais tempo não contam', !ordemIgualRecente({ produtoId: 'prod-e1', qtd: 5, clienteId: '' }) &&
      !ordemIgualRecente({ produtoId: 'prod-e1', qtd: 4, clienteId: 'outro' }) && !ordemIgualRecente({ produtoId: 'prod-e1', qtd: 9, clienteId: '' }), 0);
  });
  await tenta(['pedido igual: os mesmos produtos e quantidades, em qualquer ordem, e o mesmo cliente', 'pedido igual: outra quantidade não conta'], async () => {
    const v = registrarVenda({ data: hoje(), canalId: 'direta', clienteId: '', itens: [{ produtoId: 'prod-e1', qtd: 2, precoUnit: 30 }, { produtoId: 'prod-e1b', qtd: 1, precoUnit: 50 }] });
    ok('pedido igual: os mesmos produtos e quantidades, em qualquer ordem, e o mesmo cliente', (pedidoIgualRecente({ clienteId: '', itens: [{ produtoId: 'prod-e1b', qtd: 1 }, { produtoId: 'prod-e1', qtd: 2 }] }) || {}).id === v.id, 0);
    ok('pedido igual: outra quantidade não conta', !pedidoIgualRecente({ clienteId: '', itens: [{ produtoId: 'prod-e1b', qtd: 1 }, { produtoId: 'prod-e1', qtd: 3 }] }), 0);
    await pausa();
  });
  await tenta(['ordem igual: a janela pergunta com botões grandes, no lugar dela, antes de criar',
    'ordem igual: o cursor começa em "Não criar", o último botão (no celular, onde estava o Salvar): o Enter não cria em dobro',
    'ordem igual: fechar a pergunta volta para a janela como estava', 'ordem igual: "Não criar" fecha a janela e avisa que nada entrou', 'ordem igual: "Criar mais uma" cria'], async () => {
    opNovaOrdem('prod-e1', '', 4);
    $('#modal form').requestSubmit();
    await pausa(100);
    const p = $('#modal .caixa.pergunta'), bs = p ? $$('.pergunta-botoes .btn', p) : [];
    ok('ordem igual: a janela pergunta com botões grandes, no lugar dela, antes de criar', !!p && $('#modal form').hidden && bs.length === 2 && S.ordens.filter(o => o.produtoId === 'prod-e1' && num(o.qtd) === 4).length === 1, !!p);
    ok('ordem igual: o cursor começa em "Não criar", o último botão (no celular, onde estava o Salvar): o Enter não cria em dobro',
      document.activeElement === bs[1] && /Criar mais uma/.test(bs[0].textContent) && /Não criar/.test((bs[1] || {}).textContent || ''), [document.activeElement && document.activeElement.textContent, bs.map(b => b.textContent)]);
    responder(-1);
    ok('ordem igual: fechar a pergunta volta para a janela como estava', !$('#modal .caixa.pergunta') && !$('#modal form').hidden && $('#modal [name=qtd]').value === '4', 0);
    $('#modal form').requestSubmit();
    await pausa(100);
    limparAvisos();
    responder(1);                                                    // Não criar
    await pausa(100);
    ok('ordem igual: "Não criar" fecha a janela e avisa que nada entrou', !$('#modal.open') && S.ordens.filter(o => o.produtoId === 'prod-e1' && num(o.qtd) === 4).length === 1 &&
      avisos32().some(t => /^Nada foi criado\./.test(t)), avisos32());
    opNovaOrdem('prod-e1', '', 4);
    $('#modal form').requestSubmit();
    await pausa(100);
    responder(0);                                                    // Criar mais uma
    await pausa(300);
    ok('ordem igual: "Criar mais uma" cria', S.ordens.filter(o => o.produtoId === 'prod-e1' && num(o.qtd) === 4).length === 2 && linhas32(d => d.produtoId === 'prod-e1' && d.qtd === 4).length === 2, S.ordens.filter(o => o.produtoId === 'prod-e1').map(o => o.qtd));
  });
  const confirmarDeVerdade = window.confirm, perguntas32 = [];
  let respostaConfirmar = true;
  // a ordem começou a imprimir há 10 minutos (desde a etapa 2, Concluir uma ordem iniciada há menos de 2 minutos pergunta antes)
  const iniciadaHa10 = o => { iniciarOrdem(o); o.inicio = new Date(Date.now() - 10 * 60000).toISOString(); put('ordens', o); };
  window.confirm = m => { perguntas32.push(String(m)); return respostaConfirmar; };     // as perguntas do navegador nesta seção
  await tenta(['Desfazer: o Concluir mostra o botão Desfazer no aviso', 'Desfazer: com outra ordem imprimindo, pergunta antes de pôr as duas imprimindo (como o Iniciar)',
    'Desfazer: o banco volta exatamente ao que era, com a mesma hora de início',
    'Desfazer: se o outro aparelho mudou a ordem depois, nada é desfeito e o aviso explica', 'Desfazer: gravação recusada leva junto o aviso de sucesso e o Desfazer'], async () => {
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 3 }); iniciadaHa10(o);
    await pausa();
    const antes = bancoTexto(), inicio = byId('ordens', o.id).inicio;
    opConcluir(o.id);
    await pausa();
    const b = $$('#toasts .toast.com-acao button').pop();
    ok('Desfazer: o Concluir mostra o botão Desfazer no aviso', !!b && /Desfazer/.test(b.textContent) && bancoTexto() !== antes, avisos32().slice(-1));
    perguntas32.length = 0;
    b.click();
    await pausa(300);
    ok('Desfazer: com outra ordem imprimindo, pergunta antes de pôr as duas imprimindo (como o Iniciar)', perguntas32.length === 1 &&
      /^Já existe outra ordem imprimindo \(.+\)\. Desfazendo, as duas ficam imprimindo\.\n\nDesfazer mesmo assim\?$/.test(perguntas32[0]), perguntas32);
    ok('Desfazer: o banco volta exatamente ao que era, com a mesma hora de início', bancoTexto() === antes && byId('ordens', o.id).status === 'imprimindo' && byId('ordens', o.id).inicio === inicio, byId('ordens', o.id).status);
    opConcluir(o.id);
    await pausa();
    const b2 = $$('#toasts .toast.com-acao button').pop(), l = DBDemo._ler().linhas['ordens/' + o.id];
    outroPC([{ n: 15, ops: [{ c: 'ordens', i: o.id, t: 'mudar', se: l.v, p: [{ s: { obs: 'mexida no outro PC' } }] }] }]);
    await carregarTudo(true);                                    // a mudança do outro PC chega aqui
    const antes2 = bancoTexto();
    b2.click();
    await pausa(300);
    ok('Desfazer: se o outro aparelho mudou a ordem depois, nada é desfeito e o aviso explica', bancoTexto() === antes2 && avisos32().some(t => /Isto já mudou depois\. Nada foi desfeito\./.test(t)), avisos32().slice(-2));
    const o3 = novaOrdem({ produtoId: 'prod-e1b', qtd: 1 }); iniciadaHa10(o3);
    await pausa();
    const l3 = DBDemo._ler().linhas['ordens/' + o3.id];
    outroPC([{ n: 16, ops: [{ c: 'ordens', i: o3.id, t: 'mudar', se: l3.v, p: [{ s: { status: 'concluido', fim: hoje() } }] }] }]);
    opConcluir(o3.id);                                           // este PC ainda não sabe
    const tinha = $$('#toasts .toast.com-acao').length;
    await pausa(300);
    ok('Desfazer: gravação recusada leva junto o aviso de sucesso e o Desfazer', tinha === 1 && !$$('#toasts .toast.com-acao').length && avisos32().some(t => /Outro aparelho mudou a ordem/.test(t)), tinha);
  });
  await tenta(['Desfazer: se o outro aparelho já vendeu as peças que o Concluir pôs no estoque, pergunta antes (o estoque ficaria negativo); "Cancelar" deixa tudo como está'], async () => {
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 4 }); iniciadaHa10(o);
    await pausa();
    opConcluir(o.id);
    await pausa();
    const b = $$('#toasts .toast.com-acao button').pop(), est = noBanco('produtos', 'prod-e1b').estoque;
    outroPC([{ n: 26, ops: [{ c: 'produtos', i: 'prod-e1b', t: 'mudar', p: [{ a: { estoque: 1 - est } }] }] }]);   // o outro PC vende e sobra 1 peça
    await carregarTudo(true);
    const antes = bancoTexto();
    perguntas32.length = 0; respostaConfirmar = false;
    b.click();
    await pausa(300);
    respostaConfirmar = true;
    ok('Desfazer: se o outro aparelho já vendeu as peças que o Concluir pôs no estoque, pergunta antes (o estoque ficaria negativo); "Cancelar" deixa tudo como está',
      perguntas32.some(m => /Atenção: hoje há 1 peça pronta deste produto, então o estoque vai ficar negativo\.[\s\S]*Desfazer mesmo assim\?$/.test(m)) && bancoTexto() === antes &&
      byId('ordens', o.id).status === 'concluido', [perguntas32, byId('ordens', o.id).status]);
  });
  await tenta(['Desfazer clicado antes da resposta de uma ação que o outro aparelho já tinha feito: um aviso só (o de que o outro mudou), sem "dependia de outra"'], async () => {
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 2 }); iniciadaHa10(o);
    await pausa();
    const l = DBDemo._ler().linhas['ordens/' + o.id];
    outroPC([{ n: 27, ops: [{ c: 'ordens', i: o.id, t: 'mudar', se: l.v, p: [{ s: { status: 'concluido', fim: hoje() } }] }] }]);
    limparAvisos();
    opConcluir(o.id);                                               // este PC ainda não sabe
    $$('#toasts .toast.com-acao button').pop().click();             // e desfaz antes da resposta do banco
    await pausa(400);
    const ruins = avisos32().filter(t => /Outro aparelho|não foi gravad|dependia/.test(t));
    ok('Desfazer clicado antes da resposta de uma ação que o outro aparelho já tinha feito: um aviso só (o de que o outro mudou), sem "dependia de outra"',
      ruins.length === 1 && /^Outro aparelho mudou a ordem de produção/.test(ruins[0]) && noBanco('ordens', o.id).status === 'concluido' && !avisos32().some(t => /^Desfeito/.test(t)), avisos32());
  });
  window.confirm = confirmarDeVerdade;
  await tenta(['celular: a coluna presa da tabela é a do nome (Compras: o filamento; Pedidos: os itens; Contas: a descrição), não a da data ou do número'], async () => {
    const preso = cols => (/class="scroll preso-(\d)"/.exec(tabela(cols, '')) || [])[1];
    const r = [preso(['Data', 'Filamento', 'Fornecedor']), preso(['Nº', 'Data', 'Itens', 'Canal']), preso(['Produto', { t: 'Qtd', r: 1 }]), preso(['Vencimento', 'Descrição', { t: 'Valor', r: 1 }, '']),
      preso(['Data', 'Tipo', 'Categoria ou sócio', { t: 'Descrição', nome: 1 }]), preso(['Mês', { t: 'Faturamento', r: 1 }])];
    ok('celular: a coluna presa da tabela é a do nome (Compras: o filamento; Pedidos: os itens; Contas: a descrição), não a da data ou do número', r.join() === '2,3,1,2,4,1', r);
  });
  await tenta(['janelas: o orçamento começa na lista Cliente (digitar já escolhe o cliente cadastrado), novo ou editado'], async () => {
    comEditarOrcamento();
    const a = document.activeElement;
    const novo = !!a && a.tagName === 'SELECT' && a.name === 'clienteId';
    if (FORM) FORM.sujo = false; fecharModal();
    const orc = S.orcamentos[0];
    if (orc) comEditarOrcamento(orc.id);
    const b = document.activeElement;
    ok('janelas: o orçamento começa na lista Cliente (digitar já escolhe o cliente cadastrado), novo ou editado', novo && (!orc || (b.tagName === 'SELECT' && b.name === 'clienteId')), [a && a.name, b && b.name, !!orc]);
  });
  await tenta(['avisos: tocar no texto do aviso só fecha o aviso (o toque não passa para o que está embaixo)', 'teclado: depois de uma ação feita pelo teclado, o cursor vai para o Desfazer'], async () => {
    const t = toast('Aviso para tocar.'), q = t.getBoundingClientRect(), e = document.elementFromPoint(q.left + 20, q.top + q.height / 2);
    const dentro = !!e && t.contains(e);
    e.click();
    ok('avisos: tocar no texto do aviso só fecha o aviso (o toque não passa para o que está embaixo)', dentro && !t.isConnected && getComputedStyle(t).pointerEvents !== 'none', [dentro, t.isConnected]);
    ultimoTeclado = Date.now();
    const t2 = toast('Feito.', '', { rotulo: 'Desfazer', fn: () => {}, grupos: [] });
    ok('teclado: depois de uma ação feita pelo teclado, o cursor vai para o Desfazer', document.activeElement === t2.querySelector('button'), document.activeElement && document.activeElement.outerHTML.slice(0, 80));
    t2._sair(); ultimoTeclado = 0;
  });
  await tenta(['avisos: ficam o tempo de ler (3,2 s; importantes até 16 s, com ✕; com Desfazer, 8 s)'], async () => {
    const t1 = toast('Pronto.'), t2 = toast('x'.repeat(300), 'bad'), t3 = toast('Feito.', '', { rotulo: 'Desfazer', fn: () => {}, grupos: [] });
    ok('avisos: ficam o tempo de ler (3,2 s; importantes até 16 s, com ✕; com Desfazer, 8 s)', t1.style.getPropertyValue('--tempo') === '3200ms' && !t1.querySelector('.x') &&
      t2.style.getPropertyValue('--tempo') === '16000ms' && !!t2.querySelector('.x') && t3.style.getPropertyValue('--tempo') === '8000ms', 0);
    [t1, t2, t3].forEach(t => t._sair());
  });
  await tenta(['janelas: ao abrir Vender o cursor vai para a quantidade, nunca para a data'], async () => {
    comNovaVenda();
    const a = document.activeElement;
    ok('janelas: ao abrir Vender o cursor vai para a quantidade, nunca para a data', !!a && a.type !== 'date' && a.dataset.col === 'qtd', [a && a.tagName, a && a.type, a && (a.name || a.dataset.col)]);
  });
  await carregarTudo();

  // 33. versão 18, etapa 2: a impressora na frente. O bloco Próxima > Na impressora > Em acabamento (Painel e Produção), a fila
  // que mostra o filamento, Falhou em 3 toques e as listas do Painel com o botão que resolve. Começa de um banco limpo; o
  // "outro PC" grava direto no banco local, como nas seções 31 e 32.
  for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100);
  localStorage.removeItem(DEMO_KEY); await carregarTudo(); render();
  const perguntas33 = [];
  window.confirm = m => { perguntas33.push(String(m)); return true; };       // OK nas perguntas do navegador desta seção
  const ha = min => new Date(Date.now() - min * 60000).toISOString();
  const pergunta33 = () => { const c = $('#modal .caixa.pergunta'); return c ? { titulo: ($('h3', c) || {}).textContent || '', texto: ($('.pergunta-txt', c) || {}).textContent || '', botoes: $$('.pergunta-botoes .btn', c).map(b => b.textContent) } : null; };
  const resposta33 = rotulo => { const i = PERGUNTA ? PERGUNTA.botoes.findIndex(b => b.rotulo === rotulo) : -1; if (i < 0) throw new Error('a pergunta não tem "' + rotulo + '"'); responder(i); };
  const desfazer33 = () => { const b = $$('#toasts .toast.com-acao button').pop(); if (!b) throw new Error('sem Desfazer no aviso'); b.click(); };
  const st33 = id => (noBanco('ordens', id) || {}).status;
  put('filamentos', { id: 'e2-preto', nome: 'PLA Preto E2', tipo: 'PLA', cor: '#111111', precoKg: 100, estoqueG: 165 });
  put('filamentos', { id: 'e2-branco', nome: 'PLA Branco E2', tipo: 'PLA', cor: '#eeeeee', precoKg: 100, estoqueG: 2000 });
  put('filamentos', { id: 'e2-azul', nome: 'PLA Azul E2', tipo: 'PLA', cor: '#2255cc', precoKg: 100, estoqueG: 1275 });
  put('produtos', { id: 'e2-dragao', nome: 'Dragão E2', materiais: [{ filamentoId: 'e2-azul', pesoG: 88 }], horas: 3, estoque: 0, precos: { direta: 50 } });
  put('produtos', { id: 'e2-chave', nome: 'Chaveiro E2', materiais: [{ filamentoId: 'e2-preto', pesoG: 9 }, { filamentoId: 'e2-branco', pesoG: 3 }], horas: 0.6, estoque: 0, precos: { direta: 10 } });
  put('produtos', { id: 'e2-suporte', nome: 'Suporte E2', materiais: [{ filamentoId: 'e2-preto', pesoG: 48 }], horas: 2.4, estoque: 0, precos: { direta: 30 } });
  put('produtos', { id: 'e2-arvore', nome: 'Árvore E2', materiais: [{ filamentoId: 'e2-branco', pesoG: 95 }, { filamentoId: 'e2-azul', pesoG: 14 }], horas: 4.6, estoque: 0, precos: { direta: 69 } });
  put('produtos', { id: 'e2-noel', nome: 'Noel E2', materiais: [{ filamentoId: 'e2-branco', pesoG: 30 }], horas: 2, estoque: 0, acabamento: true, etapasAcabamento: 'lixar e pintar', precos: { direta: 59 } });
  const o1 = novaOrdem({ id: 'e2-o1', produtoId: 'e2-dragao', qtd: 2 }); iniciarOrdem(o1); o1.inicio = ha(240); put('ordens', o1);
  novaOrdem({ id: 'e2-o2', produtoId: 'e2-chave', qtd: 20 });
  novaOrdem({ id: 'e2-o3', produtoId: 'e2-suporte', qtd: 4 });
  novaOrdem({ id: 'e2-o4', produtoId: 'e2-dragao', qtd: 13 });
  await pausa();
  await tenta(['fila com filamento: cada ordem desconta o que as da frente (e a que imprime) vão gastar: falta 15 g e 192 g, 207 g na fila inteira',
    'fila com filamento: sozinha, cada ordem mostraria 15 g e 27 g (a conta de antes, que não vê a fila)',
    'fila com filamento: a linha da fila mostra cada filamento com o visto ou "falta 15 g"',
    'falta para iniciar agora: o estoque menos o que as que já imprimem vão gastar (as da fila na frente não contam)',
    'bloco: falta filamento para a próxima: o botão vermelho vira só Concluir, com Comprei (já com aquele filamento) e Escolher outra',
    'fila com filamento: só leitura (nenhum estoque, custo ou registro muda)'], async () => {
    const antes = bancoTexto(), est = S.filamentos.map(f => f.id + ':' + f.estoqueG + ':' + f.precoKg).join();
    const m = materialDaFila(), preto = id => m.por.get(id).fils.find(x => x.id === 'e2-preto');
    ok('fila com filamento: cada ordem desconta o que as da frente (e a que imprime) vão gastar: falta 15 g e 192 g, 207 g na fila inteira',
      preto('e2-o2').falta === 15 && preto('e2-o3').falta === 192 && preto('e2-o2').falta + preto('e2-o3').falta === 207, [preto('e2-o2'), preto('e2-o3')]);
    const sozinha = id => { const o = byId('ordens', id); return Math.ceil(opNecessidade(byId('produtos', o.produtoId), num(o.qtd), { fil: new Map(), ins: new Map() }).fils.find(x => x.fil.id === 'e2-preto').falta); };
    ok('fila com filamento: sozinha, cada ordem mostraria 15 g e 27 g (a conta de antes, que não vê a fila)', sozinha('e2-o2') === 15 && sozinha('e2-o3') === 27, [sozinha('e2-o2'), sozinha('e2-o3')]);
    const linha = opLinhaFila(filaProducao().find(x => x.o.id === 'e2-o2'), [], false, m.por.get('e2-o2'));
    ok('fila com filamento: a linha da fila mostra cada filamento com o visto ou "falta 15 g"', /PLA Preto E2<\/span>\s*<b>180 g<\/b>\s*<em>falta 15 g<\/em>/.test(linha) && /PLA Branco E2<\/span>\s*<b>60 g<\/b>\s*<svg/.test(linha), linha.slice(0, 700));
    const f3 = faltaParaIniciar(byId('ordens', 'e2-o3')), f4 = faltaParaIniciar(byId('ordens', 'e2-o4'));
    ok('falta para iniciar agora: o estoque menos o que as que já imprimem vão gastar (as da fila na frente não contam)',
      f3.length === 1 && f3[0].id === 'e2-preto' && f3[0].falta === 27 && f4.length === 1 && f4[0].id === 'e2-azul' && f4[0].falta === 45, [f3, f4]);
    const b = opBloco('painel');
    ok('bloco: falta filamento para a próxima: o botão vermelho vira só Concluir, com Comprei (já com aquele filamento) e Escolher outra',
      /class="btn op-btn op-acao" data-id="e2-o1" onclick="opConcluir\(this\.dataset\.id\)">Concluir<small>2 peças entram no estoque<\/small>/.test(b) && !/opConcluirEIniciar/.test(b) &&
      /A próxima \(20× Chaveiro E2\) precisa de mais <b>15 g de PLA Preto E2<\/b>/.test(b) && /data-id="e2-preto" onclick="cadNovaCompra\(this\.dataset\.id\)">Comprei<\/button>/.test(b) && /onclick="opEscolherOutra\(\)">Escolher outra/.test(b), b.slice(0, 600));
    VIEWS.painel(); VIEWS.producao();
    ok('fila com filamento: só leitura (nenhum estoque, custo ou registro muda)', bancoTexto() === antes && S.filamentos.map(f => f.id + ':' + f.estoqueG + ':' + f.precoKg).join() === est, 0);
  });
  // compra de preto (a próxima passa a ter filamento) e a ordem grande de azul sai da fila
  put('filamentos', { ...byId('filamentos', 'e2-preto'), estoqueG: 400 }); excluirOrdem(byId('ordens', 'e2-o4'));
  await pausa();
  await tenta(['bloco: o botão vermelho diz o que vai acontecer ("Concluir e iniciar a próxima": 2 peças entram no estoque, inicia 20× Chaveiro E2), com Só concluir e Falhou',
    'bloco: o mesmo bloco no Painel e na Produção, com Próxima, Na impressora e Em acabamento',
    'bloco: as 6 situações (imprimindo, passou da hora, duas imprimindo, livre, sem fila e falta filamento, esta acima)'], async () => {
    const b = opBloco('painel');
    ok('bloco: o botão vermelho diz o que vai acontecer ("Concluir e iniciar a próxima": 2 peças entram no estoque, inicia 20× Chaveiro E2), com Só concluir e Falhou',
      /data-id="e2-o1" data-prox="e2-o2" onclick="opConcluirEIniciar\(this\.dataset\.id, this\.dataset\.prox\)">Concluir e iniciar a próxima<small>2 peças entram no estoque · inicia 20× Chaveiro E2<\/small>/.test(b) &&
      /onclick="opConcluir\(this\.dataset\.id\)">Só concluir/.test(b) && /onclick="opFalhou\(this\.dataset\.id\)">Falhou/.test(b) && /faltam 2h/.test(b) && /66%/.test(b), b.slice(0, 900));
    const p = VIEWS.painel(), pr = VIEWS.producao(), ids = h => ['op-prox', 'op-imp', 'op-emacab'].map(i => h.includes(`id="${i}"`)).join();
    ok('bloco: o mesmo bloco no Painel e na Produção, com Próxima, Na impressora e Em acabamento', /id="op-agora"/.test(p) && /id="op-agora"/.test(pr) && ids(p) === 'true,true,true' && ids(pr) === 'true,true,true' &&
      /Próxima/.test(p) && /Na impressora/.test(p) && /Em acabamento/.test(p), [ids(p), ids(pr)]);
    const sit = {};
    const a1 = byId('ordens', 'e2-o1'), ini0 = a1.inicio;
    a1.inicio = ha(7 * 60); put('ordens', a1); sit.passou = opBloco('painel');
    a1.inicio = ini0; put('ordens', a1); iniciarOrdem(byId('ordens', 'e2-o3')); sit.duas = opBloco('painel');
    reabrirOrdem(byId('ordens', 'e2-o3'), 'fila'); reabrirOrdem(byId('ordens', 'e2-o1'), 'fila'); sit.livre = opBloco('producao');
    const ativas = S.ordens.filter(ORDEM_ATIVA).map(copia); ativas.forEach(o => rm('ordens', o.id)); sit.vazia = opBloco('painel');
    ativas.forEach(o => put('ordens', o)); const a2 = byId('ordens', 'e2-o1'); iniciarOrdem(a2); a2.inicio = ini0; put('ordens', a2);
    await pausa();
    const r = { passou: /Passou da hora/.test(sit.passou) && /passou 1h/.test(sit.passou), duas: /2 ordens imprimindo/.test(sit.duas) && (sit.duas.match(/onclick="opConcluir\(this\.dataset\.id\)">Concluir</g) || []).length === 2,
      livre: /Impressora livre/.test(sit.livre) && /onclick="opIniciar\(this\.dataset\.id\)">Iniciar<small>termina/.test(sit.livre) && /Depois dela/.test(sit.livre),
      vazia: /Impressora livre/.test(sit.vazia) && /Nenhuma ordem na fila\./.test(sit.vazia) && /onclick="opNovaOrdem\(\)">\+ Nova ordem/.test(sit.vazia) && /sem-prox/.test(sit.vazia), voltou: st33('e2-o1') === 'imprimindo' && byId('ordens', 'e2-o1').inicio === ini0 };
    ok('bloco: as 6 situações (imprimindo, passou da hora, duas imprimindo, livre, sem fila e falta filamento, esta acima)', Object.values(r).every(Boolean), r);
  });
  await tenta(['Concluir e iniciar a próxima: duas gravações separadas (a conclusão e o início)', 'Concluir e iniciar a próxima: as peças entram no estoque e a próxima começa agora',
    'Concluir e iniciar a próxima: Desfazer volta as duas (o banco fica igual ao de antes, com a mesma hora de início)',
    'Concluir e iniciar a próxima: Desfazer não desfaz nada se o outro aparelho mexeu na próxima depois'], async () => {
    const antes = bancoTexto(), ini = byId('ordens', 'e2-o1').inicio, marca = seqGrupo;
    opConcluirEIniciar('e2-o1', 'e2-o2');
    const gs = FILA.filter(g => g.n > marca), gA = gs.find(g => g.ops.has('ordens/e2-o1')), gB = gs.find(g => g.ops.has('ordens/e2-o2'));
    ok('Concluir e iniciar a próxima: duas gravações separadas (a conclusão e o início)', !!gA && !!gB && gA !== gB && !gA.ops.has('ordens/e2-o2') && !gB.ops.has('ordens/e2-o1'), gs.map(g => [...g.ops.keys()]));
    await pausa(300);
    ok('Concluir e iniciar a próxima: as peças entram no estoque e a próxima começa agora', st33('e2-o1') === 'concluido' && noBanco('produtos', 'e2-dragao').estoque === 2 && st33('e2-o2') === 'imprimindo' &&
      Date.now() - Date.parse(noBanco('ordens', 'e2-o2').inicio) < 60000 && avisos32().some(t => /^2 peças entraram no estoque de prontas\. Iniciou: 20× Chaveiro E2\./.test(t)), [st33('e2-o1'), st33('e2-o2'), avisos32().slice(-1)]);
    desfazer33();
    await pausa(300);
    ok('Concluir e iniciar a próxima: Desfazer volta as duas (o banco fica igual ao de antes, com a mesma hora de início)', bancoTexto() === antes && byId('ordens', 'e2-o1').inicio === ini && st33('e2-o2') === 'fila', [st33('e2-o1'), st33('e2-o2')]);
    opConcluirEIniciar('e2-o1', 'e2-o2');
    await pausa(300);
    const l = DBDemo._ler().linhas['ordens/e2-o2'];
    outroPC([{ n: 41, ops: [{ c: 'ordens', i: 'e2-o2', t: 'mudar', se: l.v, p: [{ s: { obs: 'mexida no outro PC' } }] }] }]);
    await carregarTudo(true);
    const antes2 = bancoTexto();
    $$('#toasts .toast:not(.com-acao)').forEach(t => (t._sair ? t._sair() : t.remove())); desfazer33();
    await pausa(300);
    ok('Concluir e iniciar a próxima: Desfazer não desfaz nada se o outro aparelho mexeu na próxima depois', bancoTexto() === antes2 && avisos32().some(t => /Isto já mudou depois\. Nada foi desfeito\./.test(t)), avisos32());
  });
  // de volta: e2-o1 imprimindo (iniciou há 4 h) e e2-o2 na fila
  reabrirOrdem(byId('ordens', 'e2-o2'), 'fila'); reabrirOrdem(byId('ordens', 'e2-o1'), 'imprimindo'); await pausa();
  await tenta(['Concluir e iniciar a próxima: o outro aparelho já tinha concluído a que imprimia: a próxima inicia assim mesmo, nada entra em dobro e o aviso diz isso (com Desfazer da próxima), sem mandar repetir'], async () => {
    const l = DBDemo._ler().linhas['ordens/e2-o1'], est0 = noBanco('produtos', 'e2-dragao').estoque, azul0 = noBanco('filamentos', 'e2-azul').estoqueG;
    outroPC([{ n: 42, ops: [{ c: 'ordens', i: 'e2-o1', t: 'mudar', se: l.v, p: [{ s: { status: 'concluido', fim: hoje(), fimEm: agoraISO() } }] }, { c: 'produtos', i: 'e2-dragao', t: 'mudar', p: [{ a: { estoque: 2 } }] },
      { c: 'filamentos', i: 'e2-azul', t: 'mudar', p: [{ a: { estoqueG: -176 } }] }] }]);
    limparAvisos();
    opConcluirEIniciar('e2-o1', 'e2-o2');                          // este PC ainda não sabe
    const tinha = $$('#toasts .toast.com-acao').length;
    await pausa(300);
    const desf = $$('#toasts .toast.com-acao').map(t => t.textContent);
    ok('Concluir e iniciar a próxima: o outro aparelho já tinha concluído a que imprimia: a próxima inicia assim mesmo, nada entra em dobro e o aviso diz isso (com Desfazer da próxima), sem mandar repetir',
      tinha === 1 && st33('e2-o2') === 'imprimindo' && st33('e2-o1') === 'concluido' && noBanco('produtos', 'e2-dragao').estoque === est0 + 2 && noBanco('filamentos', 'e2-azul').estoqueG === azul0 - 176 &&
      desf.length === 1 && /^A ordem de 2× Dragão E2 já tinha sido concluída em outro aparelho\. Iniciou: 20× Chaveiro E2\.Desfazer$/.test(desf[0]) && !avisos32().some(t => /não foi gravada|repita/.test(t)),
      [tinha, st33('e2-o1'), st33('e2-o2'), noBanco('produtos', 'e2-dragao').estoque, est0, avisos32()]);
  });
  await tenta(['Concluir uma ordem que iniciou há menos de 2 minutos pergunta antes, em botões grandes ("Não, foi engano" não conclui)', 'Concluir de uma ordem que iniciou há pouco: "Sim, concluir" conclui',
    'Concluir e iniciar a próxima também pergunta quando a que imprime iniciou há menos de 2 minutos'], async () => {
    perguntas33.length = 0;
    opConcluir('e2-o2');                                             // e2-o2 começou agora mesmo (o teste de cima)
    const p = pergunta33();
    resposta33('Não, foi engano');
    await pausa();
    ok('Concluir uma ordem que iniciou há menos de 2 minutos pergunta antes, em botões grandes ("Não, foi engano" não conclui)', !!p && p.titulo === 'Iniciou agora mesmo' && /^20× Chaveiro E2 iniciou há \d+ segundos?\. Já terminou mesmo\?$/.test(p.texto) &&
      p.botoes.join('|') === 'Não, foi engano|Sim, concluir' && st33('e2-o2') === 'imprimindo' && !perguntas33.length, [p, st33('e2-o2'), perguntas33]);
    opConcluir('e2-o2'); resposta33('Sim, concluir');
    await pausa(300);
    ok('Concluir de uma ordem que iniciou há pouco: "Sim, concluir" conclui', st33('e2-o2') === 'concluido', st33('e2-o2'));
    const a = novaOrdem({ id: 'e2-o5', produtoId: 'e2-suporte', qtd: 1 }); iniciarOrdem(a); novaOrdem({ id: 'e2-o6', produtoId: 'e2-chave', qtd: 2 });
    await pausa();
    opConcluirEIniciar('e2-o5', 'e2-o6');
    const p2 = pergunta33();
    resposta33('Não, foi engano');
    await pausa();
    ok('Concluir e iniciar a próxima também pergunta quando a que imprime iniciou há menos de 2 minutos', !!p2 && p2.titulo === 'Iniciou agora mesmo' && st33('e2-o5') === 'imprimindo' && st33('e2-o6') === 'fila', [p2, st33('e2-o5'), st33('e2-o6')]);
    reabrirOrdem(byId('ordens', 'e2-o5'), 'fila'); excluirOrdem(byId('ordens', 'e2-o5')); excluirOrdem(byId('ordens', 'e2-o6'));
    await pausa();
  });
  await tenta(['Iniciar sem filamento pergunta em botões grandes (Comprei, Iniciar assim mesmo, Cancelar), no lugar do OK do navegador', '"Comprei" abre a janela de compra de hoje já com aquele filamento',
    '"Iniciar assim mesmo" inicia', 'Iniciar com a impressora ocupada pergunta em botões grandes (Concluir a atual e iniciar esta, Deixar as duas imprimindo, Cancelar)',
    '"Deixar as duas imprimindo" inicia esta também', '"Concluir a atual e iniciar esta" conclui a que imprimia e inicia esta'], async () => {
    put('filamentos', { ...byId('filamentos', 'e2-preto'), estoqueG: 100 });
    novaOrdem({ id: 'e2-o7', produtoId: 'e2-suporte', qtd: 4 });                  // precisa de 192 g de preto
    await pausa();
    perguntas33.length = 0;
    opIniciar('e2-o7');
    const p = pergunta33();
    ok('Iniciar sem filamento pergunta em botões grandes (Comprei, Iniciar assim mesmo, Cancelar), no lugar do OK do navegador', !!p && p.titulo === 'Falta filamento' &&
      p.texto === 'Para 4× Suporte E2 falta 92 g de PLA Preto E2 (precisa 192 g).' && p.botoes.join('|') === 'Comprei PLA Preto E2|Iniciar assim mesmo|Cancelar' && !perguntas33.length && st33('e2-o7') === 'fila', [p, perguntas33]);
    resposta33('Comprei PLA Preto E2');
    ok('"Comprei" abre a janela de compra de hoje já com aquele filamento', ($('#modal h3') || {}).textContent === 'Registrar compra de filamento' && ($('#modal [name=filamentoId]') || {}).value === 'e2-preto', ($('#modal h3') || {}).textContent);
    if (FORM) FORM.sujo = false; fecharModal();
    opIniciar('e2-o7'); resposta33('Iniciar assim mesmo');
    await pausa(300);
    ok('"Iniciar assim mesmo" inicia', st33('e2-o7') === 'imprimindo', st33('e2-o7'));
    novaOrdem({ id: 'e2-o8', produtoId: 'e2-chave', qtd: 2 });
    put('filamentos', { ...byId('filamentos', 'e2-preto'), estoqueG: 500 });
    await pausa();
    opIniciar('e2-o8');
    const p2 = pergunta33();
    ok('Iniciar com a impressora ocupada pergunta em botões grandes (Concluir a atual e iniciar esta, Deixar as duas imprimindo, Cancelar)', !!p2 && p2.titulo === 'A impressora está ocupada' &&
      p2.texto === '4× Suporte E2 está imprimindo.' && p2.botoes.join('|') === 'Concluir a atual e iniciar esta|Deixar as duas imprimindo|Cancelar' && !perguntas33.length, [p2, perguntas33]);
    resposta33('Deixar as duas imprimindo');
    await pausa(300);
    ok('"Deixar as duas imprimindo" inicia esta também', st33('e2-o8') === 'imprimindo' && st33('e2-o7') === 'imprimindo', [st33('e2-o7'), st33('e2-o8')]);
    desfazer33();                                                    // e2-o8 volta para a fila
    await pausa(300);
    const o7 = byId('ordens', 'e2-o7'); o7.inicio = ha(30); put('ordens', o7); await pausa();
    opIniciar('e2-o8'); resposta33('Concluir a atual e iniciar esta');
    await pausa(300);
    ok('"Concluir a atual e iniciar esta" conclui a que imprimia e inicia esta', st33('e2-o7') === 'concluido' && st33('e2-o8') === 'imprimindo', [st33('e2-o7'), st33('e2-o8')]);
  });
  await tenta(['Reabrir: duas saídas claras (Voltar a imprimir, com a hora de início, ou Voltar para a fila), em botões grandes',
    'Reabrir: "Voltar a imprimir" com outra ordem imprimindo pergunta antes, como o Iniciar (A impressora está ocupada), e nada muda até a resposta',
    'Reabrir: "Voltar a imprimir" guarda a hora de início',
    'Reabrir: "Voltar para a fila" tira a hora de início', 'Reabrir uma que passou pelo acabamento: volta para o acabamento'], async () => {
    perguntas33.length = 0;
    const ini = noBanco('ordens', 'e2-o7').inicio;
    opReabrir('e2-o7');
    const p = pergunta33();
    ok('Reabrir: duas saídas claras (Voltar a imprimir, com a hora de início, ou Voltar para a fila), em botões grandes', !!p && p.titulo === 'Reabrir a ordem' && p.botoes.length === 3 &&
      /^Voltar a imprimir \(iniciou (hoje|ontem) às \d\d:\d\d\)$/.test(p.botoes[0]) && p.botoes[1] === 'Voltar para a fila' && p.botoes[2] === 'Cancelar' && !perguntas33.length, [p, perguntas33]);
    resposta33(p.botoes[0]);                                         // a 2× Chaveiro (e2-o8) está imprimindo
    await pausa(300);
    const pOc = pergunta33();
    ok('Reabrir: "Voltar a imprimir" com outra ordem imprimindo pergunta antes, como o Iniciar (A impressora está ocupada), e nada muda até a resposta', !!pOc && pOc.titulo === 'A impressora está ocupada' &&
      pOc.texto === '2× Chaveiro E2 está imprimindo.' && pOc.botoes.join('|') === 'Voltar para a fila|Deixar as duas imprimindo|Cancelar' && st33('e2-o7') === 'concluido' && st33('e2-o8') === 'imprimindo', [pOc, st33('e2-o7')]);
    if (pOc) resposta33('Deixar as duas imprimindo');
    await pausa(300);
    ok('Reabrir: "Voltar a imprimir" guarda a hora de início', st33('e2-o7') === 'imprimindo' && noBanco('ordens', 'e2-o7').inicio === ini, [st33('e2-o7'), noBanco('ordens', 'e2-o7').inicio, ini]);
    opConcluir('e2-o7'); await pausa(300);
    opReabrir('e2-o7'); resposta33('Voltar para a fila');
    await pausa(300);
    ok('Reabrir: "Voltar para a fila" tira a hora de início', st33('e2-o7') === 'fila' && !noBanco('ordens', 'e2-o7').inicio, noBanco('ordens', 'e2-o7'));
    const n = novaOrdem({ id: 'e2-o9', produtoId: 'e2-noel', qtd: 1 }); iniciarOrdem(n); n.inicio = ha(60); put('ordens', n); concluirOrdem(n); concluirOrdem(n);
    await pausa(300);
    opReabrir('e2-o9');
    const p2 = pergunta33();
    if (p2) resposta33('Voltar para o acabamento');
    await pausa(300);
    ok('Reabrir uma que passou pelo acabamento: volta para o acabamento', !!p2 && p2.botoes.join('|') === 'Voltar para o acabamento|Cancelar' && st33('e2-o9') === 'acabamento', [p2, st33('e2-o9')]);
  });
  await tenta(['Na frente: a ordem passa a ser a próxima', 'Na frente: Desfazer devolve o lugar (o banco fica igual ao de antes)'], async () => {
    const fila = () => filaProducao().filter(x => x.o.status === 'fila').map(x => x.o.id);
    const antes = bancoTexto(), ult = fila().pop();
    opFrente(ult);
    await pausa(300);
    ok('Na frente: a ordem passa a ser a próxima', fila()[0] === ult && avisos32().some(t => /^Passou para a frente: .+\. É a próxima\./.test(t)), fila());
    desfazer33();
    await pausa(300);
    ok('Na frente: Desfazer devolve o lugar (o banco fica igual ao de antes)', bancoTexto() === antes && fila().pop() === ult, fila());
  });
  // Falhou: a árvore (duas cores, 9h12 de impressão) imprimindo há 4h36 (metade)
  S.ordens.filter(o => o.status === 'imprimindo').forEach(o => reabrirOrdem(o, 'fila'));
  const oF2 = novaOrdem({ id: 'e2-of', produtoId: 'e2-arvore', qtd: 2 }); iniciarOrdem(oF2); oF2.inicio = ha(276); put('ordens', oF2);
  await pausa();
  const chip33 = txt => { const b = $$('#modal .op-chip').find(x => x.textContent.trim().startsWith(txt)); if (!b) throw new Error('sem o botão ' + txt); b.click(); };
  await tenta(['Falhou: o motivo em 8 botões e as gramas já calculadas pelo tempo impresso (50% = 95 g + 14 g), à vista para trocar',
    'Falhou: sem tocar no motivo, nada é gravado e a janela avisa', 'Falhou: "Voltar para a fila" registra uma falha por filamento, com o código fixo e a ordem, e a ordem volta para a fila',
    'Falhou: a perda dos dois filamentos de uma peça de duas cores conta como uma falha só ("Falhou 1 vez")', 'Falhou: Desfazer tira as falhas e a ordem volta como estava (o banco fica igual ao de antes)',
    'Falhou: "Imprimir de novo agora" registra e a impressão recomeça agora', 'Falhou: "Continua imprimindo" registra e a ordem continua com a mesma hora de início',
    'Falhou: a janela avisa quando a ordem já tem falha registrada'], async () => {
    const antes = bancoTexto(), branco0 = noBanco('filamentos', 'e2-branco').estoqueG, azul0 = noBanco('filamentos', 'e2-azul').estoqueG;
    opFalhou('e2-of');
    const f = $('#modal form.op-falha'), motivos = $$('#op-motivos .op-chip').map(b => b.textContent), g = i => (campoDoForm(f, 'g' + i) || {}).value;
    ok('Falhou: o motivo em 8 botões e as gramas já calculadas pelo tempo impresso (50% = 95 g + 14 g), à vista para trocar', !!f && motivos.length === 8 && motivos.join('|') === opMotivos.join('|') &&
      g(0) === '95' && g(1) === '14' && /^50% já impresso/.test(($('#modal .op-chip.on') || {}).textContent || '') && /Imprimir de novo agora/.test($('#modal button[type=submit]').textContent) &&
      $$('#modal .actions .op-manter').map(b => b.textContent).join('|') === 'Continua imprimindo|Voltar para a fila', [motivos, g(0), g(1)]);
    f.requestSubmit();
    await pausa(200);
    ok('Falhou: sem tocar no motivo, nada é gravado e a janela avisa', bancoTexto() === antes && !!$('#modal.open') && $('#op-motivos').classList.contains('erro') && avisos32().some(t => /Toque no que aconteceu/.test(t)), 0);
    chip33('Entupimento'); campoDoForm(f, 'g0').value = '100';
    opSaidaFalha('fila');
    await pausa(300);
    const cods = ['fa-e2-of-e2-branco-0', 'fa-e2-of-e2-azul-0'].map(c => noBanco('falhas', c));
    ok('Falhou: "Voltar para a fila" registra uma falha por filamento, com o código fixo e a ordem, e a ordem volta para a fila', !$('#modal.open') && cods.every(x => x && x.ordemId === 'e2-of' && x.motivo === 'Entupimento') &&
      cods[0].gramas === 100 && cods[1].gramas === 14 && noBanco('filamentos', 'e2-branco').estoqueG === branco0 - 100 && noBanco('filamentos', 'e2-azul').estoqueG === azul0 - 14 && st33('e2-of') === 'fila' && !noBanco('ordens', 'e2-of').inicio,
      [cods, st33('e2-of')]);
    const x = filaProducao().find(y => y.o.id === 'e2-of');
    ok('Falhou: a perda dos dois filamentos de uma peça de duas cores conta como uma falha só ("Falhou 1 vez")', falhasDaOrdem(byId('ordens', 'e2-of')) === 1 && cods[1].evento === cods[0].id &&
      /Falhou 1 vez/.test(opLinhaFila(x, [x], false)) && noBanco('ordens', 'e2-of').falhas === 1, [falhasDaOrdem(byId('ordens', 'e2-of')), cods[1]]);
    desfazer33();
    await pausa(300);
    ok('Falhou: Desfazer tira as falhas e a ordem volta como estava (o banco fica igual ao de antes)', bancoTexto() === antes && st33('e2-of') === 'imprimindo', st33('e2-of'));
    const ini0 = noBanco('ordens', 'e2-of').inicio;
    opFalhou('e2-of'); chip33('Suporte falhou'); $('#modal form').requestSubmit();
    await pausa(300);
    ok('Falhou: "Imprimir de novo agora" registra e a impressão recomeça agora', st33('e2-of') === 'imprimindo' && Date.now() - Date.parse(noBanco('ordens', 'e2-of').inicio) < 60000 && noBanco('ordens', 'e2-of').inicio !== ini0 &&
      !!noBanco('falhas', 'fa-e2-of-e2-branco-0') && avisos32().some(t => /^Falha registrada \(109 g, Suporte falhou\)\. A impressão recomeçou agora\./.test(t)), [st33('e2-of'), avisos32().slice(-1)]);
    const ini1 = noBanco('ordens', 'e2-of').inicio;
    opFalhou('e2-of');
    const aviso = ($('#modal form .aviso') || {}).textContent || '';
    chip33('Descolou da mesa'); opSaidaFalha('continua');
    await pausa(300);
    // o código da falha seguinte conta os registros (os 2 filamentos da falha de antes), como a versão 17: termina em -2
    ok('Falhou: "Continua imprimindo" registra e a ordem continua com a mesma hora de início', st33('e2-of') === 'imprimindo' && noBanco('ordens', 'e2-of').inicio === ini1 && !!noBanco('falhas', 'fa-e2-of-e2-branco-2') &&
      falhasDaOrdem(byId('ordens', 'e2-of')) === 2, [st33('e2-of'), falhasDaOrdem(byId('ordens', 'e2-of')), S.falhas.filter(f => f.ordemId === 'e2-of').map(f => f.id)]);
    ok('Falhou: a janela avisa quando a ordem já tem falha registrada', /^Esta ordem já tem 1 falha registrada: a última, \d+ g de PLA (Branco|Azul) E2, agora há pouco\. Registre de novo só se for outra\.$/.test(aviso), aviso);
  });
  await tenta(['Falhou: a mesma falha registrada no outro aparelho ao mesmo tempo entra uma vez só (o filamento baixa uma vez)',
    'Falhou: a mesma falha, que chegou do outro aparelho com a janela aberta, não entra de novo e quem salva é avisado',
    'Falhou: a ordem mudou no outro aparelho com a janela aberta: nada é gravado e aparece o aviso',
    'Falhou: a ordem mudou no outro aparelho e este ainda não sabia: a falha entra uma vez e a mudança da ordem não; o aviso diz que a falha foi registrada e que a ordem não mudou (com Desfazer), sem mandar repetir',
    'Falhou: o Desfazer desse aviso tira só a falha (o filamento volta) e a ordem fica como o outro aparelho deixou'], async () => {
    // o outro PC (também na versão 18) registra a mesma falha (os mesmos códigos: o n conta os registros, nCodigoFalha) direto no
    // banco; este PC ainda não sabe e salva a sua
    const nOutro = () => [nCodigoFalha(byId('ordens', 'e2-of')), falhasDaOrdem(byId('ordens', 'e2-of'))];
    let [n, nEv] = nOutro();
    const gravarOutro = (num, n1, ev1) => outroPC([{ n: num, ops: [{ c: 'filamentos', i: 'e2-branco', t: 'mudar', p: [{ a: { estoqueG: -95 } }] }, { c: 'filamentos', i: 'e2-azul', t: 'mudar', p: [{ a: { estoqueG: -14 } }] },
      { c: 'falhas', i: 'fa-e2-of-e2-branco-' + n1, t: 'novo', d: { data: hoje(), produtoId: 'e2-arvore', filamentoId: 'e2-branco', gramas: 95, motivo: 'Entupimento', ordemId: 'e2-of', custo: 9.5, criadoEm: agoraISO() } },
      { c: 'falhas', i: 'fa-e2-of-e2-azul-' + n1, t: 'novo', d: { data: hoje(), produtoId: 'e2-arvore', filamentoId: 'e2-azul', gramas: 14, motivo: 'Entupimento', ordemId: 'e2-of', evento: 'fa-e2-of-e2-branco-' + n1, custo: 1.4, criadoEm: agoraISO() } },
      { c: 'ordens', i: 'e2-of', t: 'mudar', p: [{ s: { falhas: ev1 + 1 } }] }] }]);
    let branco0 = noBanco('filamentos', 'e2-branco').estoqueG;
    opFalhou('e2-of'); campoDoForm($('#modal form'), 'g0').value = '95'; campoDoForm($('#modal form'), 'g1').value = '14';
    gravarOutro(51, n, nEv);
    limparAvisos(); chip33('Entupimento'); opSaidaFalha('continua');
    await pausa(400);
    ok('Falhou: a mesma falha registrada no outro aparelho ao mesmo tempo entra uma vez só (o filamento baixa uma vez)', linhas32(d => d.ordemId === 'e2-of').length === 2 * (nEv + 1) &&
      ['fa-e2-of-e2-branco-' + n, 'fa-e2-of-e2-azul-' + n].every(c => !!noBanco('falhas', c)) && noBanco('filamentos', 'e2-branco').estoqueG === branco0 - 95 && byId('filamentos', 'e2-branco').estoqueG === branco0 - 95 &&
      avisos32().some(t => /Outro aparelho já tinha registrado a falha de 95 g de PLA Branco E2\. Nada foi gravado em dobro/.test(t)), [noBanco('filamentos', 'e2-branco').estoqueG, branco0, avisos32()]);
    [n, nEv] = nOutro(); branco0 = noBanco('filamentos', 'e2-branco').estoqueG;
    opFalhou('e2-of'); campoDoForm($('#modal form'), 'g0').value = '95'; campoDoForm($('#modal form'), 'g1').value = '14';
    gravarOutro(52, n, nEv);
    await carregarTudo(true);                                         // chega aqui com a janela aberta
    const antes = bancoTexto();
    limparAvisos(); chip33('Entupimento'); opSaidaFalha('fila');
    await pausa(300);
    ok('Falhou: a mesma falha, que chegou do outro aparelho com a janela aberta, não entra de novo e quem salva é avisado', bancoTexto() === antes && !$('#modal.open') &&
      avisos32().some(t => /^Outro aparelho já registrou esta falha \(95 g de PLA Branco E2\) enquanto esta janela estava aberta\. Nada foi gravado em dobro/.test(t)), avisos32());
    opFalhou('e2-of');
    const l = DBDemo._ler().linhas['ordens/e2-of'];
    outroPC([{ n: 53, ops: [{ c: 'ordens', i: 'e2-of', t: 'mudar', se: l.v, p: [{ s: { status: 'fila', inicio: '' } }] }] }]);
    await carregarTudo(true);
    const antes2 = bancoTexto();
    limparAvisos(); chip33('Outro'); $('#modal form').requestSubmit();
    await pausa(300);
    ok('Falhou: a ordem mudou no outro aparelho com a janela aberta: nada é gravado e aparece o aviso', bancoTexto() === antes2 && avisos32().some(t => /^Outro aparelho mexeu nesta ordem enquanto esta janela estava aberta\. Nada foi gravado/.test(t)), avisos32());
    const o = byId('ordens', 'e2-of'); iniciarOrdem(o); o.inicio = ha(276); put('ordens', o);
    await pausa();
    [n, nEv] = nOutro(); branco0 = noBanco('filamentos', 'e2-branco').estoqueG;
    opFalhou('e2-of');
    const l2 = DBDemo._ler().linhas['ordens/e2-of'];
    outroPC([{ n: 54, ops: [{ c: 'ordens', i: 'e2-of', t: 'mudar', se: l2.v, p: [{ s: { status: 'fila', inicio: '' } }] }] }]);   // este PC ainda não sabe
    limparAvisos(); chip33('Outro'); campoDoForm($('#modal form'), 'g0').value = '50'; campoDoForm($('#modal form'), 'g1').value = '0';
    $('#modal form').requestSubmit();                                // Imprimir de novo agora
    await pausa(400);
    const vistos = $$('#toasts .toast').map(t => t.textContent);
    ok('Falhou: a ordem mudou no outro aparelho e este ainda não sabia: a falha entra uma vez e a mudança da ordem não; o aviso diz que a falha foi registrada e que a ordem não mudou (com Desfazer), sem mandar repetir',
      !!noBanco('falhas', 'fa-e2-of-e2-branco-' + n) && noBanco('filamentos', 'e2-branco').estoqueG === branco0 - 50 && st33('e2-of') === 'fila' && !noBanco('ordens', 'e2-of').inicio &&
      falhasDaOrdem(byId('ordens', 'e2-of')) === nEv + 1 && vistos.length === 1 && $$('#toasts .toast.com-acao').length === 1 &&
      /^Falha registrada \(50 g, Outro\)\. A ordem de 2× Árvore E2 não mudou: outro aparelho mexeu nela pouco antes, e a tela já mostra como ela ficou\.Desfazer$/.test(vistos[0]) &&
      !avisos32().some(t => /não foi gravada|repita/.test(t)), [noBanco('ordens', 'e2-of'), noBanco('filamentos', 'e2-branco').estoqueG, branco0, vistos]);
    const antesDesf = bancoTexto();
    desfazer33();
    await pausa(300);
    ok('Falhou: o Desfazer desse aviso tira só a falha (o filamento volta) e a ordem fica como o outro aparelho deixou', !noBanco('falhas', 'fa-e2-of-e2-branco-' + n) && noBanco('filamentos', 'e2-branco').estoqueG === branco0 &&
      st33('e2-of') === 'fila' && !noBanco('ordens', 'e2-of').inicio && bancoTexto() !== antesDesf && avisos32().some(t => /^Desfeito: a falha saiu/.test(t)), [noBanco('filamentos', 'e2-branco').estoqueG, branco0, st33('e2-of'), avisos32().slice(-2)]);
  });
  await tenta(['+ Registrar falha: com uma ordem imprimindo, abre o Falhou dela, com o link para a falha de outra peça', 'falha avulsa: nenhum filamento vem marcado (a pessoa escolhe)'], async () => {
    S.ordens.filter(o => o.status === 'imprimindo').forEach(o => reabrirOrdem(o, 'fila'));
    const o = byId('ordens', 'e2-of'); iniciarOrdem(o); put('ordens', o);
    await pausa();
    opRegistrarFalha();
    ok('+ Registrar falha: com uma ordem imprimindo, abre o Falhou dela, com o link para a falha de outra peça', ($('#modal h3') || {}).textContent === 'Falhou: 2× Árvore E2' && /Registrar falha de outra peça/.test(($('#modal form') || {}).textContent || ''), ($('#modal h3') || {}).textContent);
    opFalhaAvulsa();
    const s = $('#modal [name=filamentoId]');
    ok('falha avulsa: nenhum filamento vem marcado (a pessoa escolhe)', ($('#modal h3') || {}).textContent === 'Registrar falha' && !!s && s.value === '' && s.options[0].textContent === '— escolha o filamento —', s && s.value);
  });
  // Painel: um aviso de cada tipo de hoje (os de ordem, manutenção, material, produto, conta e alíquota) e um orçamento aprovado
  for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100);
  localStorage.removeItem(DEMO_KEY); await carregarTudo();
  Object.assign(S.config, { impostoConfirmado: false, alertaEstoque: 200 }); saveMeta('config');
  put('filamentos', { id: 'p2-f1', nome: 'PLA Pouco', tipo: 'PLA', cor: '#aa0000', precoKg: 100, estoqueG: 150 });
  put('filamentos', { id: 'p2-f2', nome: 'PLA Zero', tipo: 'PLA', cor: '#00aa00', precoKg: 100, estoqueG: 0 });
  put('filamentos', { id: 'p2-f3', nome: 'PLA Muito', tipo: 'PLA', cor: '#0000aa', precoKg: 100, estoqueG: 5000 });
  put('insumos', { id: 'p2-i1', nome: 'Caixa Pouca', unidade: 'un', custo: 1, estoque: 3, minimo: 5 });
  put('insumos', { id: 'p2-i2', nome: 'Caixa Zero', unidade: 'un', custo: 1, estoque: 0, minimo: 5 });
  put('produtos', { id: 'p2-a', nome: 'Peça A', materiais: [{ filamentoId: 'p2-f3', pesoG: 50 }], horas: 60, estoque: 0, estoqueMinimo: 4, precos: { direta: 30 } });
  put('produtos', { id: 'p2-b', nome: 'Peça B', materiais: [{ filamentoId: 'p2-f3', pesoG: 20 }], horas: 1, estoque: -2, precos: { direta: 30 } });
  put('produtos', { id: 'p2-c', nome: 'Peça C', materiais: [{ filamentoId: 'p2-f3', pesoG: 20 }], horas: 1, estoque: 0, acabamento: true, precos: { direta: 30 } });
  const o_ = (id, produtoId, ordem, extra = {}) => put('ordens', { id, produtoId, qtd: 1, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: ha(120), ordem, ...extra });
  o_('p2-o0', 'p2-b', 101);                                                          // a primeira da fila (sem "Na frente")
  o_('p2-o1', 'p2-b', 102, { prazo: addDias(hoje(), -1) });                           // atrasada
  o_('p2-o2', 'p2-b', 103, { prazo: hoje() });                                         // vence hoje
  o_('p2-o3', 'p2-a', 104, { prazo: addDias(hoje(), 1) });                            // 60 h de impressão: pela fila passa do prazo
  o_('p2-o4', 'p2-c', 4000, { status: 'acabamento', prazo: addDias(hoje(), -1), fimImpressao: hoje(), fimImpressaoEm: ha(60), passouAcabamento: true, consumo: [], insumosUsados: [] });
  put('manutItens', { id: 'p2-m1', nome: 'Limpar a mesa', intervaloH: 1, ultimaH: horimetro() - 2 });   // vencida
  put('manutItens', { id: 'p2-m2', nome: 'Trocar o bico', intervaloH: 100, ultimaH: horimetro() - 90 });  // próxima
  put('clientes', { id: 'p2-c1', nome: 'Cliente Painel' });
  criarConta({ id: 'p2-ct1', tipo: 'pagar', descricao: 'Conta vencida', valor: 100, vencimento: addDias(hoje(), -1) });
  criarConta({ id: 'p2-ct2', tipo: 'pagar', descricao: 'Conta de hoje', valor: 50, vencimento: hoje() });
  criarConta({ id: 'p2-ct3', tipo: 'receber', descricao: 'A receber atrasada', valor: 80, vencimento: addDias(hoje(), -2), clienteId: 'p2-c1' });
  criarConta({ id: 'p2-ct4', tipo: 'pagar', descricao: 'Conta da semana', valor: 30, vencimento: addDias(hoje(), 3) });
  put('orcamentos', { id: 'p2-orc', numero: 7, data: hoje(), validade: addDias(hoje(), 7), clienteId: 'p2-c1', clienteNome: '', itens: [{ produtoId: 'p2-a', descricao: 'Peça A', qtd: 2, precoUnit: 30 }], desconto: 0, sinalPct: 0, status: 'aprovado', ordensGeradas: false });
  await pausa(300);
  // desde a versão 19 (etapa 3), os avisos de filamento e insumo ficam em O que comprar (#op-material, no lugar de Material
  // acabando), com Comprei e Repor no lugar do Abrir: as verificações abaixo conferem o mesmo, na lista nova
  await tenta(['Painel: os avisos de hoje continuam todos, cada um na sua lista (Precisa de atenção, Contas e O que comprar)',
    'Painel: cada linha tem o botão que resolve (Feito, Na frente, Pronto, Criar ordem com o código fixo, Produzir, Pagar, Receber, Comprei e Repor)',
    'Painel: no celular, três ícones no alto pulam até as listas'], async () => {
    ['atencao', 'contas', 'comprar'].forEach(k => { opListaAberta[k] = true; });          // "Ver mais" aberto nas três listas
    const av = alertas(), at = opItensAtencao(), ct = opItensContas(), mt = materiaisParaComprar().comprar, p = VIEWS.painel();
    ['atencao', 'contas', 'comprar'].forEach(k => { opListaAberta[k] = false; });
    const kinds = [...new Set(av.map(a => a.k + ':' + a.tipo))].sort();
    const nome = a => (a.k === 'filamento' ? byId('filamentos', a.id) : a.k === 'insumo' ? byId('insumos', a.id) : byId('produtos', a.id) || {}).nome;
    const naLista = a => (['conta-vencida', 'conta-hoje', 'receber'].includes(a.k) ? ct.some(x => x.b.id === a.id)
      : ['filamento', 'insumo'].includes(a.k) ? mt.some(m => m.id === a.id && m.t === (a.k === 'filamento' ? 'fil' : 'ins')) && p.includes(`data-id="${a.id}"`)
        : ['atrasada', 'hoje', 'estoura'].includes(a.k) ? at.some(x => x.k === a.k && x.titulo === esc(opOrdemTxt(byId('ordens', a.id))))
          : ['manut-vencida', 'manut-proxima', 'minimo'].includes(a.k) ? at.some(x => x.k === a.k && x.b && x.b.id === a.id)
            : a.k === 'negativo' ? at.some(x => x.k === a.k && x.titulo === esc(nome(a))) : a.k === 'aliquota' && at.some(x => x.k === 'aliquota'));
    ok('Painel: os avisos de hoje continuam todos, cada um na sua lista (Precisa de atenção, Contas e O que comprar)', av.length === 16 && kinds.length === 15 && av.every(naLista) &&
      at.length === 10 && ct.length === 4 && mt.length === 4 && /id="op-atencao"/.test(p) && /id="op-contas"/.test(p) && /id="op-material"/.test(p), { av: av.map(a => a.k + ':' + a.tipo), kinds, faltam: av.filter(a => !naLista(a)).map(a => a.texto), at: at.length, ct: ct.length, mt: mt.length });
    const tem = (fn, id, rot) => new RegExp(`data-id="${id}"[^>]*onclick="${fn}\\(this\\.dataset\\.id[^"]*\\)">${rot}<`).test(p);
    const botoes = { feito: tem('opFeito', 'p2-m1', 'Feito') && tem('opFeito', 'p2-m2', 'Feito'), frente: tem('opFrente', 'p2-o1', 'Na frente') && tem('opFrente', 'p2-o2', 'Na frente') && tem('opFrente', 'p2-o3', 'Na frente'),
      primeira: !/data-id="p2-o0"[^>]*onclick="opFrente/.test(p), pronto: tem('opAcabamentoPronto', 'p2-o4', 'Pronto'), produzir: tem('comProduzirOrcamento', 'p2-orc', 'Produzir'),
      criar: new RegExp(`data-id="p2-a" data-qtd="3" data-cod="${codigoSugestao('p2-a')}" onclick="opCriarDaSugestao\\(this\\.dataset\\.id, this\\.dataset\\.qtd, this\\.dataset\\.cod\\)">Criar ordem<`).test(p),
      pagar: tem('ctaPagar', 'p2-ct1', 'Pagar') && tem('ctaPagar', 'p2-ct2', 'Pagar') && tem('ctaPagar', 'p2-ct4', 'Pagar'), receber: tem('ctaPagar', 'p2-ct3', 'Receber'),
      abrir: /href="#vendas">Abrir</.test(p) && /href="#config">Abrir</.test(p),
      comprei: ['p2-f1', 'p2-f2'].every(id => new RegExp(`data-t="fil" data-id="${id}" onclick="cadComprei\\(this\\.dataset\\.t, this\\.dataset\\.id\\)">Comprei<`).test(p)),
      repor: ['p2-i1', 'p2-i2'].every(id => new RegExp(`data-t="ins" data-id="${id}" onclick="cadComprei\\(this\\.dataset\\.t, this\\.dataset\\.id\\)">Repor<`).test(p)) };
    ok('Painel: cada linha tem o botão que resolve (Feito, Na frente, Pronto, Criar ordem com o código fixo, Produzir, Pagar, Receber, Comprei e Repor)', Object.values(botoes).every(Boolean), botoes);
    const saltos = (/class="op-saltos"[\s\S]*?<\/div>/.exec(p) || [''])[0];
    ok('Painel: no celular, três ícones no alto pulam até as listas', (saltos.match(/class="op-salto"/g) || []).length === 3 && /aria-label="Precisa de atenção: 10"/.test(saltos) && /aria-label="Contas: 4"/.test(saltos) &&
      /aria-label="O que comprar: 4"/.test(saltos) && /opIrBloco\('op-atencao'\)/.test(saltos) && /opIrBloco\('op-contas'\)/.test(saltos) && /opIrBloco\('op-material'\)/.test(saltos), saltos.slice(0, 400));
  });
  await tenta(['Painel: Feito, Pagar e Receber abrem as janelas de sempre', 'Painel: Produzir faz a pergunta de sempre e cria as ordens do orçamento',
    'Painel: Criar ordem cria a ordem da sugestão em um clique, com o código fixo, e tem Desfazer', 'Painel: a mesma sugestão criada no outro aparelho ao mesmo tempo entra uma vez só',
    'Painel: Criar ordem com a tela parada (a ordem da sugestão já chegou do outro aparelho) pergunta antes', 'Painel: Na frente tem Desfazer'], async () => {
    // os botões das linhas do Painel desenhado (não as funções direto)
    ir('painel'); render();
    const janela = (linha, rot) => { const li = $$('#main .op-lista li').find(x => x.textContent.includes(linha)), bt = li && $$('button', li).find(x => x.textContent.trim() === rot);
      if (!bt) return 'sem o botão ' + rot; bt.click(); const t = ($('#modal h3') || {}).textContent; if (FORM) FORM.sujo = false; fecharModal(); return t; };
    const j1 = janela('Limpar a mesa', 'Feito'), j2 = janela('Conta vencida', 'Pagar'), j3 = janela('A receber atrasada', 'Receber');
    ok('Painel: Feito, Pagar e Receber abrem as janelas de sempre', j1 === 'Manutenção feita' && j2 === 'Pagar conta' && j3 === 'Receber conta', [j1, j2, j3]);
    perguntas33.length = 0;
    comProduzirOrcamento('p2-orc');
    await pausa(300);
    ok('Painel: Produzir faz a pergunta de sempre e cria as ordens do orçamento', perguntas33.length === 1 && /^Criar as ordens de produção do orçamento nº 7\?/.test(perguntas33[0]) && S.ordens.filter(o => o.orcamentoId === 'p2-orc').length === 1 &&
      !opItensAtencao().some(x => x.k === 'orcamento'), perguntas33);
    const antes = bancoTexto(), cod = codigoSugestao('p2-a'), q = sugestoesProducao().find(s => s.p.id === 'p2-a').falta;
    opCriarDaSugestao('p2-a', q, cod);
    await pausa(300);
    ok('Painel: Criar ordem cria a ordem da sugestão em um clique, com o código fixo, e tem Desfazer', !$('#modal.open') && (noBanco('ordens', cod) || {}).qtd === q && noBanco('ordens', cod).status === 'fila' &&
      avisos32().some(t => /^Ordem criada: \d+× Peça A\. Ela entrou no fim da fila\.Desfazer$/.test(t)), [cod, noBanco('ordens', cod), avisos32().slice(-1)]);
    desfazer33();
    await pausa(300);
    const desfeito = bancoTexto() === antes;
    const cod2 = codigoSugestao('p2-a');
    outroPC([{ n: 61, ops: [{ c: 'ordens', i: cod2, t: 'novo', d: { produtoId: 'p2-a', qtd: q, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: agoraISO(), ordem: Date.now() + 9e6 } }] }]);
    limparAvisos();
    opCriarDaSugestao('p2-a', q, cod2);                               // este PC ainda não sabe
    await pausa(300);
    ok('Painel: a mesma sugestão criada no outro aparelho ao mesmo tempo entra uma vez só', desfeito && linhas32(d => /^sg-p2-a-/.test(d.id)).length === 1 &&
      avisos32().some(t => /^Outro aparelho já tinha registrado a ordem de produção de \d+× Peça A\. Nada foi gravado em dobro/.test(t)), [desfeito, linhas32(d => d.produtoId === 'p2-a').map(d => d.id), avisos32()]);
    put('produtos', { ...byId('produtos', 'p2-a'), estoqueMinimo: 12 });
    await pausa(300);
    const cod3 = codigoSugestao('p2-a'), q3 = sugestoesProducao().find(s => s.p.id === 'p2-a').falta;
    outroPC([{ n: 62, ops: [{ c: 'ordens', i: cod3, t: 'novo', d: { produtoId: 'p2-a', qtd: 2, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: agoraISO(), ordem: Date.now() + 9e6 } }] }]);
    await carregarTudo(true);                                         // chegou; a tela ficou parada com o botão antigo
    opCriarDaSugestao('p2-a', q3, cod3);
    const pg = pergunta33();
    if (pg) resposta33('Não criar');
    await pausa(300);
    ok('Painel: Criar ordem com a tela parada (a ordem da sugestão já chegou do outro aparelho) pergunta antes', !!pg && pg.titulo === 'Ordem igual' && /2× Peça A/.test(pg.texto) && linhas32(d => /^sg-p2-a-/.test(d.id)).length === 2, [pg, linhas32(d => d.produtoId === 'p2-a').map(d => d.id)]);
    const antes2 = bancoTexto();
    opFrente('p2-o2');
    await pausa(300);
    const primeira = filaProducao().find(x => x.o.status === 'fila').o.id;
    desfazer33();
    await pausa(300);
    ok('Painel: Na frente tem Desfazer', primeira === 'p2-o2' && bancoTexto() === antes2, primeira);
  });
  await tenta(['a tela mudou pelo outro aparelho: os botões do bloco e das listas esperam 1 s (e voltam a valer depois)', 'depois de uma ação deste aparelho, os botões não esperam'], async () => {
    ir('painel'); render();
    await pausa(1000);                                                // longe da última gravação daqui
    const b = BASE.get('ordens/p2-o2');
    aplicarRemoto({ tipo: 'UPSERT', colecao: 'ordens', id: 'p2-o2', dados: { ...b.d, status: 'imprimindo', inicio: agoraISO() }, versao: b.v + 50, atualizado_em: agoraISO() });
    await pausa(450);
    const esperando = $('#main').classList.contains('op-espera'), estilo = getComputedStyle($('#main .op-acao')).pointerEvents;
    await pausa(900);
    ok('a tela mudou pelo outro aparelho: os botões do bloco e das listas esperam 1 s (e voltam a valer depois)', esperando && estilo === 'none' && !$('#main').classList.contains('op-espera'), [esperando, estilo]);
    opFrente('p2-o3');
    await pausa(450);
    ok('depois de uma ação deste aparelho, os botões não esperam', !$('#main').classList.contains('op-espera'), 0);
  });

  // 33b. versão 18, correções da revisão da etapa 2 (cada verificação falha no código de antes delas). Banco limpo; o "outro PC"
  // grava direto no banco local, e o que ele fez chega aqui com carregarTudo(true) (ou nem chega: "este PC ainda não sabe").
  for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100);
  localStorage.removeItem(DEMO_KEY); await carregarTudo(); ir('painel'); render();
  limparAvisos();
  put('filamentos', { id: 'r2-f1', nome: 'PLA R2', tipo: 'PLA', cor: '#cc2222', precoKg: 100, estoqueG: 5000 });
  put('filamentos', { id: 'r2-f2', nome: 'PETG R2', tipo: 'PETG', cor: '#2222cc', precoKg: 120, estoqueG: 5000 });
  put('produtos', { id: 'r2-vaso', nome: 'Vaso R2', materiais: [{ filamentoId: 'r2-f1', pesoG: 15 }, { filamentoId: 'r2-f2', pesoG: 5 }], horas: 1, estoque: 0, precos: { direta: 40 } });
  put('produtos', { id: 'r2-lum', nome: 'Luminária R2', materiais: [{ filamentoId: 'r2-f1', pesoG: 25 }], horas: 1.5, estoque: 0, precos: { direta: 70 } });
  const ordemR2 = (id, produtoId, qtd, ordem, extra = {}) => put('ordens', { id, produtoId, qtd, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: ha(120), ordem, ...extra });
  const linhaR2 = id => DBDemo._ler().linhas['ordens/' + id];
  const imprimindoR2 = () => Object.values(DBDemo._ler().linhas).filter(l => l.d.status === 'imprimindo' && /^r2-/.test(l.d.id)).map(l => l.d.id).sort().join();
  const vistosR2 = () => $$('#toasts .toast').map(t => t.textContent);
  // o que o outro PC gravou chega aqui (a tela fica como estava: uma janela ou pergunta aberta continua aberta)
  const chegaR2 = async () => { for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100); for (let i = 0; i < 5 && (await carregarTudo(true)) === false; i++) await pausa(100); };
  // volta as ordens r2-a (imprimindo há 30 min) e r2-b (a próxima da fila) ao começo de cada cena, sem falhas
  const cenaR2 = async () => {
    await chegaR2();
    S.falhas.filter(f => /^r2-/.test(f.ordemId || '')).forEach(f => rm('falhas', f.id));
    S.ordens.filter(o => /^r2-/.test(o.id)).forEach(o => rm('ordens', o.id));
    ordemR2('r2-a', 'r2-vaso', 4, 1, { status: 'imprimindo', inicio: ha(30) }); ordemR2('r2-b', 'r2-lum', 2, 2);
    await pausa(300); for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100);
    limparAvisos();
  };
  await tenta(['impressora ocupada: o cursor começa em "Deixar as duas imprimindo" (o OK de antes): o Enter não conclui a impressão pela metade',
    'impressora ocupada: com a pergunta aberta, o outro aparelho concluiu a atual e iniciou outra: "Concluir a atual e iniciar esta" pergunta de novo, sem pôr duas imprimindo'], async () => {
    await cenaR2(); ordemR2('r2-c', 'r2-lum', 3, 3); await pausa();
    opIniciar('r2-c');
    const p = pergunta33(), foco = (document.activeElement || {}).textContent;
    ok('impressora ocupada: o cursor começa em "Deixar as duas imprimindo" (o OK de antes): o Enter não conclui a impressão pela metade', !!p && p.titulo === 'A impressora está ocupada' && foco === 'Deixar as duas imprimindo', [p, foco]);
    const la = linhaR2('r2-a'), lb = linhaR2('r2-b');
    outroPC([{ n: 71, ops: [{ c: 'ordens', i: 'r2-a', t: 'mudar', se: la.v, p: [{ s: { status: 'concluido', fim: hoje(), fimEm: agoraISO() } }] }] },
      { n: 72, ops: [{ c: 'ordens', i: 'r2-b', t: 'mudar', se: lb.v, p: [{ s: { status: 'imprimindo', inicio: agoraISO() } }] }] }]);
    await chegaR2();                                                  // chega aqui com a pergunta aberta
    resposta33('Concluir a atual e iniciar esta');
    await pausa(300);
    const p2 = pergunta33();
    ok('impressora ocupada: com a pergunta aberta, o outro aparelho concluiu a atual e iniciou outra: "Concluir a atual e iniciar esta" pergunta de novo, sem pôr duas imprimindo',
      !!p2 && p2.titulo === 'A impressora está ocupada' && p2.texto === '2× Luminária R2 está imprimindo.' && st33('r2-c') === 'fila' && imprimindoR2() === 'r2-b' &&
      avisos32().some(t => /^A ordem de 4× Vaso R2 já tinha sido concluída em outro aparelho\./.test(t)), [p2, st33('r2-c'), imprimindoR2(), avisos32()]);
    if (PERGUNTA) resposta33('Cancelar');
  });
  await tenta(['Concluir e iniciar a próxima: o outro aparelho recomeçou a que imprimia (não concluiu): o aviso diz que agora há duas imprimindo, com Desfazer da próxima',
    'Concluir e iniciar a próxima: esse Desfazer volta só a próxima para a fila'], async () => {
    await cenaR2();
    const la = linhaR2('r2-a');
    outroPC([{ n: 73, ops: [{ c: 'ordens', i: 'r2-a', t: 'mudar', se: la.v, p: [{ s: { inicio: agoraISO(), falhas: 1 } }] }] }]);   // Falhou "Imprimir de novo" no outro
    opConcluirEIniciar('r2-a', 'r2-b');                               // este PC ainda não sabe
    await pausa(400);
    const v = vistosR2();
    ok('Concluir e iniciar a próxima: o outro aparelho recomeçou a que imprimia (não concluiu): o aviso diz que agora há duas imprimindo, com Desfazer da próxima',
      imprimindoR2() === 'r2-a,r2-b' && v.length === 1 && $$('#toasts .toast.com-acao').length === 1 &&
      /^Outro aparelho mexeu na ordem de 4× Vaso R2 pouco antes, e ela continua imprimindo\. Iniciou: 2× Luminária R2\. Agora há 2 ordens imprimindo: confira\.Desfazer$/.test(v[0]), [imprimindoR2(), v]);
    desfazer33();
    await pausa(300);
    ok('Concluir e iniciar a próxima: esse Desfazer volta só a próxima para a fila', st33('r2-b') === 'fila' && !noBanco('ordens', 'r2-b').inicio && st33('r2-a') === 'imprimindo' && noBanco('ordens', 'r2-a').falhas === 1,
      [st33('r2-a'), st33('r2-b'), avisos32().slice(-1)]);
  });
  await tenta(['Concluir e iniciar a próxima: a conclusão valeu e o início da próxima não (o outro mexeu nela): o aviso diz isso, com Desfazer da conclusão'], async () => {
    await cenaR2();
    const lb = linhaR2('r2-b');
    outroPC([{ n: 74, ops: [{ c: 'ordens', i: 'r2-b', t: 'mudar', se: lb.v, p: [{ s: { obs: 'mexida no outro PC' } }] }] }]);
    opConcluirEIniciar('r2-a', 'r2-b');                               // este PC ainda não sabe
    await pausa(400);
    const v = vistosR2();
    ok('Concluir e iniciar a próxima: a conclusão valeu e o início da próxima não (o outro mexeu nela): o aviso diz isso, com Desfazer da conclusão', st33('r2-a') === 'concluido' && st33('r2-b') === 'fila' &&
      v.length === 1 && /^4 peças entraram no estoque de prontas\. 2× Luminária R2 não foi iniciada: outro aparelho mexeu nela pouco antes, e a tela já mostra como ela ficou\.Desfazer$/.test(v[0]), [st33('r2-a'), st33('r2-b'), v]);
  });
  await tenta(['Concluir e iniciar a próxima: Desfazer tocado antes da resposta, com a ordem já concluída no outro aparelho: a próxima volta para a fila e o aviso conta como ficou'], async () => {
    await cenaR2();
    const la = linhaR2('r2-a'), est0 = noBanco('produtos', 'r2-vaso').estoque;
    outroPC([{ n: 75, ops: [{ c: 'ordens', i: 'r2-a', t: 'mudar', se: la.v, p: [{ s: { status: 'concluido', fim: hoje(), fimEm: agoraISO() } }] }, { c: 'produtos', i: 'r2-vaso', t: 'mudar', p: [{ a: { estoque: 4 } }] }] }]);
    opConcluirEIniciar('r2-a', 'r2-b');                               // este PC ainda não sabe
    desfazer33();                                                     // e desfaz antes da resposta do banco
    await pausa(600);
    const v = vistosR2();
    ok('Concluir e iniciar a próxima: Desfazer tocado antes da resposta, com a ordem já concluída no outro aparelho: a próxima volta para a fila e o aviso conta como ficou',
      st33('r2-a') === 'concluido' && st33('r2-b') === 'fila' && noBanco('produtos', 'r2-vaso').estoque === est0 + 4 && byId('ordens', 'r2-b').status === 'fila' &&
      v.some(t => /^A ordem de 4× Vaso R2 já tinha sido concluída em outro aparelho\. 2× Luminária R2 está na fila\./.test(t)) && !v.some(t => /voltou a imprimir/.test(t)), [st33('r2-a'), st33('r2-b'), noBanco('produtos', 'r2-vaso').estoque, est0, v]);
  });
  await tenta(['Falhou: a saída da ordem não valeu e o aviso de sucesso já tinha saído (sem internet): o aviso diz que a falha foi registrada e que a ordem não mudou, sem Desfazer e sem mandar repetir'], async () => {
    await cenaR2();
    const la = linhaR2('r2-a');
    outroPC([{ n: 76, ops: [{ c: 'ordens', i: 'r2-a', t: 'mudar', se: la.v, p: [{ s: { status: 'fila', inicio: '' } }] }] }]);    // o outro voltou para a fila
    opFalhou('r2-a');                                                 // este PC ainda não sabe
    $$('#op-motivos .op-chip').find(b => b.textContent === 'Entupimento').click();
    opSaidaFalha('fila');
    $$('#toasts .toast.com-acao').forEach(t => t._sair());            // o aviso com o Desfazer já saiu (8 s sem internet)
    await pausa(400);
    const v = vistosR2();
    ok('Falhou: a saída da ordem não valeu e o aviso de sucesso já tinha saído (sem internet): o aviso diz que a falha foi registrada e que a ordem não mudou, sem Desfazer e sem mandar repetir',
      S.falhas.filter(f => f.ordemId === 'r2-a').length === 2 && st33('r2-a') === 'fila' && v.length === 1 && !$$('#toasts .toast.com-acao').length &&
      /^Falha registrada \(\d+ g, Entupimento\)\. A ordem de 4× Vaso R2 não mudou: outro aparelho mexeu nela pouco antes, e a tela já mostra como ela ficou\.✕?$/.test(v[0]) && !avisos32().some(t => /não foi gravada|repita/.test(t)), [st33('r2-a'), v]);
  });
  await tenta(['Falhou: no computador o cursor começa no primeiro motivo (não nas gramas)',
    'falha de uma peça de duas cores: o código da falha seguinte conta os registros, como a versão 17 (que ainda pode estar aberta noutra aba)',
    'aba antiga (versão 17) registra a mesma falha seguinte ao mesmo tempo: entra uma vez só (o filamento baixa uma vez)'], async () => {
    await cenaR2();
    opFalhou('r2-a');
    const a = document.activeElement;
    ok('Falhou: no computador o cursor começa no primeiro motivo (não nas gramas)', !!a && a === $('#op-motivos .op-chip') && a.textContent === opMotivos[0], [a && a.tagName, a && (a.name || a.textContent)]);
    $$('#op-motivos .op-chip').find(b => b.textContent === 'Entupimento').click();
    opSaidaFalha('continua');                                         // falha de duas cores: 2 registros, 1 falha
    await pausa(300);
    const o = byId('ordens', 'r2-a'), cod = codigoFalha(o, 'r2-f1', nCodigoFalha(o));
    const v17 = Math.max(num(o.falhas), S.falhas.filter(f => f.ordemId === 'r2-a').length);   // o n que a versão 17 usa
    ok('falha de uma peça de duas cores: o código da falha seguinte conta os registros, como a versão 17 (que ainda pode estar aberta noutra aba)', falhasDaOrdem(o) === 1 && cod === 'fa-r2-a-r2-f1-' + v17 && v17 === 2, [falhasDaOrdem(o), cod, v17]);
    const f10 = noBanco('filamentos', 'r2-f1').estoqueG;
    opFalhou('r2-a'); campoDoForm($('#modal form'), 'g0').value = '50'; campoDoForm($('#modal form'), 'g1').value = '0';
    // a aba antiga registra a mesma falha (50 g de PLA R2) com o código dela e a contagem dela (registros + 1); este PC ainda não sabe
    outroPC([{ n: 77, ops: [{ c: 'filamentos', i: 'r2-f1', t: 'mudar', p: [{ a: { estoqueG: -50 } }] }, { c: 'falhas', i: 'fa-r2-a-r2-f1-' + v17, t: 'novo', d: { data: hoje(), produtoId: 'r2-vaso', filamentoId: 'r2-f1', gramas: 50, motivo: 'Entupimento', ordemId: 'r2-a', custo: 5, criadoEm: agoraISO() } },
      { c: 'ordens', i: 'r2-a', t: 'mudar', p: [{ s: { falhas: v17 + 1 } }] }] }]);
    limparAvisos(); $$('#op-motivos .op-chip').find(b => b.textContent === 'Entupimento').click(); opSaidaFalha('continua');
    await pausa(400);
    ok('aba antiga (versão 17) registra a mesma falha seguinte ao mesmo tempo: entra uma vez só (o filamento baixa uma vez)', linhas32(d => d.ordemId === 'r2-a' && d.filamentoId === 'r2-f1').length === 2 &&
      noBanco('filamentos', 'r2-f1').estoqueG === f10 - 50 && avisos32().some(t => /Outro aparelho já tinha registrado a falha de 50 g de PLA R2\. Nada foi gravado em dobro/.test(t)),
      [linhas32(d => d.ordemId === 'r2-a').map(l => l.d.id), noBanco('filamentos', 'r2-f1').estoqueG, f10, avisos32()]);
  });
  await tenta(['fila com filamento: filamento excluído do cadastro aparece sem o visto (confira o cadastro)'], async () => {
    await cenaR2();
    put('produtos', { id: 'r2-sem', nome: 'Peça R2 sem filamento', materiais: [{ filamentoId: 'r2-f1', pesoG: 10 }, { filamentoId: 'r2-sumiu', pesoG: 20 }], horas: 1, estoque: 0, precos: { direta: 10 } });
    ordemR2('r2-s', 'r2-sem', 2, 9); await pausa();
    const h = opFios(materialDaFila().por.get('r2-s')), sumiu = h.split('<span class="op-fio').find(x => x.includes('Filamento excluído')) || '';
    ok('fila com filamento: filamento excluído do cadastro aparece sem o visto (confira o cadastro)', /Filamento excluído/.test(sumiu) && /confira o cadastro/.test(sumiu) && !/<svg/.test(sumiu), sumiu || h);
    excluirOrdem(byId('ordens', 'r2-s')); rm('produtos', 'r2-sem'); await pausa();
  });
  await tenta(['Precisa de atenção: a atrasada que está imprimindo e a primeira da fila que vence hoje têm o link para a Produção (Abrir)'], async () => {
    await cenaR2();
    const a = byId('ordens', 'r2-a'), b = byId('ordens', 'r2-b');
    a.prazo = addDias(hoje(), -1); put('ordens', a); b.prazo = hoje(); put('ordens', b); await pausa();
    const at = opItensAtencao(), la = at.find(x => x.titulo === esc(opOrdemTxt(a))), lb = at.find(x => x.titulo === esc(opOrdemTxt(b)));
    ok('Precisa de atenção: a atrasada que está imprimindo e a primeira da fila que vence hoje têm o link para a Produção (Abrir)', !!la && !!lb && !la.b && !lb.b &&
      /href="#producao">Abrir</.test(opLinhaLista(la)) && /href="#producao">Abrir</.test(opLinhaLista(lb)), [la, lb]);
  });
  await tenta(['Painel, Criar ordem com a tela parada: uma ordem igual feita à mão no outro aparelho (sem o código da sugestão) pergunta antes, como a janela de sempre',
    'Painel, Criar ordem: a sugestão é conferida de novo e a ordem sai com a quantidade de agora',
    'Painel, Criar ordem: o produto que já não está abaixo do mínimo não ganha outra ordem (e o aviso diz)'], async () => {
    await cenaR2();
    put('produtos', { id: 'r2-x', nome: 'Peça X R2', materiais: [{ filamentoId: 'r2-f1', pesoG: 5 }], horas: 0.5, estoque: 0, estoqueMinimo: 3, precos: { direta: 10 } });
    put('produtos', { id: 'r2-y', nome: 'Peça Y R2', materiais: [{ filamentoId: 'r2-f1', pesoG: 5 }], horas: 0.5, estoque: 0, estoqueMinimo: 3, precos: { direta: 10 } });
    put('produtos', { id: 'r2-z', nome: 'Peça Z R2', materiais: [{ filamentoId: 'r2-f1', pesoG: 5 }], horas: 0.5, estoque: 0, estoqueMinimo: 3, precos: { direta: 10 } });
    await pausa();
    const bt = id => (opItensAtencao().find(x => x.k === 'minimo' && x.b && x.b.id === id) || {}).b;   // o botão como estava na tela
    const [bx, by, bz] = ['r2-x', 'r2-y', 'r2-z'].map(bt);
    const manual = (n, id, produtoId, qtd, clienteId = '') => ({ n, ops: [{ c: 'ordens', i: id, t: 'novo', d: { produtoId, qtd, status: 'fila', data: hoje(), prazo: '', clienteId, obs: '', criadoEm: agoraISO(), ordem: Date.now() + n * 1e6 } }] });
    put('clientes', { id: 'r2-cli', nome: 'Cliente R2' }); await pausa();
    outroPC([manual(78, 'r2-manual-x', 'r2-x', 3), manual(79, 'r2-manual-y', 'r2-y', 2), manual(80, 'r2-manual-z', 'r2-z', 3, 'r2-cli')]);
    await chegaR2();                                                  // as ordens do outro chegam; a tela ficou parada com os botões antigos
    opCriarDaSugestao('r2-x', bx.qtd, bx.cod);
    const p = pergunta33();
    if (p) resposta33('Não criar');
    await pausa(300);
    ok('Painel, Criar ordem com a tela parada: uma ordem igual feita à mão no outro aparelho (sem o código da sugestão) pergunta antes, como a janela de sempre', !!p && p.titulo === 'Ordem igual' && /3× Peça X R2/.test(p.texto) &&
      linhas32(d => d.produtoId === 'r2-x').length === 1, [p, linhas32(d => d.produtoId === 'r2-x').map(l => l.d.id + ' ' + l.d.qtd)]);
    opCriarDaSugestao('r2-y', by.qtd, by.cod);
    await pausa(300);
    const ys = linhas32(d => d.produtoId === 'r2-y').map(l => l.d.qtd).sort().join();
    ok('Painel, Criar ordem: a sugestão é conferida de novo e a ordem sai com a quantidade de agora', by.qtd === 3 && ys === '1,2' && avisos32().some(t => /^Ordem criada: 1× Peça Y R2\./.test(t)), [by.qtd, ys, avisos32().slice(-1)]);
    limparAvisos();
    opCriarDaSugestao('r2-z', bz.qtd, bz.cod);
    await pausa(300);
    ok('Painel, Criar ordem: o produto que já não está abaixo do mínimo não ganha outra ordem (e o aviso diz)', linhas32(d => d.produtoId === 'r2-z').length === 1 &&
      avisos32().some(t => /^Peça Z R2 já não está abaixo do estoque mínimo .*Nada foi criado\./.test(t)), [linhas32(d => d.produtoId === 'r2-z').map(l => l.d.qtd), avisos32()]);
  });
  await tenta(['a tela mudou pelo outro aparelho só nas Contas: os botões do bloco que não mudaram nem saíram do lugar continuam valendo (só espera o que mudou)'], async () => {
    await cenaR2();
    criarConta({ id: 'r2-ct', tipo: 'pagar', descricao: 'Conta R2', valor: 10, vencimento: hoje() });
    ir('painel'); render();
    await pausa(1000);                                                // longe da última gravação daqui
    const b = BASE.get('contas/r2-ct');
    aplicarRemoto({ tipo: 'UPSERT', colecao: 'contas', id: 'r2-ct', dados: { ...b.d, pagoEm: hoje() }, versao: b.v + 50, atualizado_em: agoraISO() });
    await pausa(450);
    const so = $$('#op-imp .op-acao').find(x => /^Só concluir$/.test(x.textContent.trim())), pagar = $$('#op-contas button').filter(x => x.textContent.trim() === 'Pagar').length;
    ok('a tela mudou pelo outro aparelho só nas Contas: os botões do bloco que não mudaram nem saíram do lugar continuam valendo (só espera o que mudou)', !!so && !so.classList.contains('op-espera') && getComputedStyle(so).pointerEvents !== 'none' && !pagar,
      [!!so, so && getComputedStyle(so).pointerEvents, pagar]);
  });
  // 33c. versão 18, escolha do dono (27/11) na pergunta de pedido igual: só o pedido com cliente pergunta (a venda sem cliente,
  // a da feira, entra direto) e o cursor fica em "Não registrar"
  await tenta(['pedido igual: venda sem cliente (feira) repetida entra direto, sem pergunta',
    'pedido igual: com cliente, a segunda igual pergunta e o cursor começa em "Não registrar", o último botão: o Enter não registra em dobro',
    'pedido igual: "Não registrar" fecha a janela e avisa que nada entrou'], async () => {
    const pid = 'feira-e2', cid = 'feira-e2-cli';
    put('produtos', { id: pid, nome: 'Peça da feira', materiais: [], insumos: [], horas: 0, estoque: 20, estoqueMinimo: 0, precos: Object.fromEntries(S.canais.map(c => [c.id, 10])), maoObra: [] });
    put('clientes', { id: cid, nome: 'Cliente da feira', telefone: '', email: '', cidade: '', obs: '' });
    await pausa();
    const vendasDe = c => S.vendas.filter(v => (v.clienteId || '') === c && itensVenda(v).some(i => i.produtoId === pid)).length;
    const vender = async c => {
      comNovaVenda(pid); await pausa(100);
      if (c) { const s = $('#modal [name=clienteId]'); s.value = c; s.dispatchEvent(new Event('change', { bubbles: true })); }
      $('#modal form').requestSubmit(); await pausa(150);
    };
    await vender(''); await vender('');
    ok('pedido igual: venda sem cliente (feira) repetida entra direto, sem pergunta', vendasDe('') === 2 && !$('#modal .caixa.pergunta') && !$('#modal.open'), [vendasDe(''), !!$('#modal .caixa.pergunta')]);
    await vender(cid); await vender(cid);
    const p = $('#modal .caixa.pergunta'), bs = p ? $$('.pergunta-botoes .btn', p) : [];
    ok('pedido igual: com cliente, a segunda igual pergunta e o cursor começa em "Não registrar", o último botão: o Enter não registra em dobro',
      !!p && vendasDe(cid) === 1 && bs.length === 2 && /Registrar mais um/.test(bs[0].textContent) && /Não registrar/.test(bs[1].textContent) && document.activeElement === bs[1],
      [vendasDe(cid), document.activeElement && document.activeElement.textContent, bs.map(b => b.textContent)]);
    limparAvisos();
    if (p) responder(1);                                             // Não registrar
    await pausa(100);
    ok('pedido igual: "Não registrar" fecha a janela e avisa que nada entrou', !!p && !$('#modal.open') && vendasDe(cid) === 1 && avisos32().some(t => /^Nada foi registrado\./.test(t)), [vendasDe(cid), avisos32()]);
  });
  window.confirm = confirmarDeVerdade;
  await carregarTudo();

  // 34. versão 19, etapa 3: compras e estoque. O que comprar contando a fila inteira (Painel e Compras), Comprei já preenchido com a
  // última compra (Repor com a última reposição), valor fora do comum, Já pedi, A caminho e Chegou, e Acertar estoque numa janela de
  // 1 campo. Banco limpo; o "outro PC" grava direto no banco local, como nas seções 31 a 33.
  for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100);
  localStorage.removeItem(DEMO_KEY); localStorage.removeItem('nexos-carretel'); await carregarTudo(); ir('painel'); render();
  limparAvisos();
  window.confirm = () => true;
  const dom34 = h => { const d = document.createElement('div'); d.innerHTML = h; return d; };
  const txt34 = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const secao34 = (h, id) => $('#' + id, dom34(h));
  const linhas34 = (h, id) => { const s = secao34(h, id); return s ? $$('li', s) : []; };
  // uma linha da lista O que comprar: "nome | o que diz | botões"
  const linha34 = li => [txt34($('.op-t b', li)), txt34($('.op-t small', li)), $$('.cad-bts button', li).map(txt34).join(' ')].join(' | ');
  const dica34 = el => txt34(el && el.parentElement && $('.hint', el.parentElement));
  const tiraAvisos34 = () => $$('#toasts .toast:not(.com-acao)').forEach(t => (t._sair ? t._sair() : t.remove()));
  const assenta34 = async () => { for (let i = 0; i < 80 && temPendencias(); i++) await pausa(50); };   // o que a cena de antes gravou já entrou
  put('fornecedores', { id: 'e3-fo1', nome: 'Voolt E3', contato: '', obs: '' });
  put('fornecedores', { id: 'e3-fo2', nome: 'Lab E3', contato: '', obs: '' });
  const fil34 = (id, nome, cor, precoKg, estoqueG) => put('filamentos', { id, nome, tipo: 'PLA', cor, precoKg, estoqueG });
  fil34('e3-preto', 'PLA Preto E3', '#111111', 104, 165); fil34('e3-branco', 'PLA Branco E3', '#eeeeee', 98, 2000); fil34('e3-dour', 'PLA Dourado E3', '#c9a227', 139, 118);
  fil34('e3-verde', 'PLA Verde E3', '#157a3a', 101, 410); fil34('e3-transl', 'PETG Translúcido E3', '#cfe6ee', 118, 0); fil34('e3-cinza', 'PLA Cinza E3', '#8d8f94', 97, 930);
  const ins34 = (id, nome, custo, estoque, minimo) => put('insumos', { id, nome, unidade: 'un', custo, estoque, minimo });
  ins34('e3-cx', 'Caixa E3', 2.1, 7, 15); ins34('e3-ima', 'Ímã E3', 0.75, 12, 30); ins34('e3-arg', 'Argola E3', 0.18, 5, 0); ins34('e3-etq', 'Etiqueta E3', 0.06, 410, 100);
  put('produtos', { id: 'e3-chave', nome: 'Chaveiro E3', materiais: [{ filamentoId: 'e3-preto', pesoG: 9 }, { filamentoId: 'e3-branco', pesoG: 3 }], insumos: [{ insumoId: 'e3-arg', qtd: 1 }], horas: 0.6, estoque: 0, precos: { direta: 14 } });
  put('produtos', { id: 'e3-suporte', nome: 'Suporte E3', materiais: [{ filamentoId: 'e3-preto', pesoG: 48 }], insumos: [], horas: 2.4, estoque: 0, precos: { direta: 29 } });
  put('produtos', { id: 'e3-arvore', nome: 'Árvore E3', materiais: [{ filamentoId: 'e3-verde', pesoG: 95 }, { filamentoId: 'e3-dour', pesoG: 14 }], insumos: [{ insumoId: 'e3-cx', qtd: 1 }], horas: 4.6, estoque: 0, precos: { direta: 69 } });
  put('produtos', { id: 'e3-cabos', nome: 'Organizador E3', materiais: [{ filamentoId: 'e3-cinza', pesoG: 16 }], insumos: [], horas: 0.9, estoque: 14, precos: { direta: 19 } });
  const ord34 = (id, produtoId, qtd, ordem) => put('ordens', { id, produtoId, qtd, status: 'fila', data: hoje(), prazo: '', clienteId: '', obs: '', criadoEm: ha(120), ordem });
  ord34('e3-o1', 'e3-arvore', 4, 101); ord34('e3-o2', 'e3-chave', 20, 102); ord34('e3-o3', 'e3-suporte', 4, 103);
  const comp34 = (id, dd, f, fo, g, v) => put('compras', { id, data: addDias(hoje(), dd), filamentoId: f, fornecedorId: fo, pesoG: g, valor: v, precoKg: v / (g / 1000), obs: '', criadoEm: ha(6000 - dd) });
  comp34('e3-c1', -58, 'e3-preto', 'e3-fo2', 1000, 103.9); comp34('e3-c2', -21, 'e3-preto', 'e3-fo1', 1000, 104.5); comp34('e3-c3', -25, 'e3-dour', 'e3-fo2', 1000, 139);
  await pausa(300);
  await tenta(['O que comprar: os níveis (falta, acabou, acabando, vai e ok) e a falta da fila inteira (faltam 207 g e tem 165 g de preto; faltam 15 argolas)',
    'O que comprar: do mais urgente para o menos (falta, acabou, acabando, vai), filamento antes de insumo no empate',
    'O que comprar: a falta é a mesma conta da coluna Filamento da fila (a soma do que falta em cada ordem: 15 g + 192 g)',
    'O que comprar: o alerta de 200 g e o mínimo dos insumos continuam os de antes (todo aviso de filamento e insumo está na lista; o resto é a fila)',
    'O que comprar: só leitura (montar o Painel, Compras e a lista copiada não muda nada no banco)'], async () => {
    const sit = id => materiaisParaComprar().todos.find(m => m.id === id), p = sit('e3-preto'), a = sit('e3-arg');
    const niveis = ['e3-preto', 'e3-arg', 'e3-transl', 'e3-dour', 'e3-cx', 'e3-ima', 'e3-verde', 'e3-branco', 'e3-cinza', 'e3-etq'].map(id => id.slice(3) + ':' + sit(id).nivel).join();
    ok('O que comprar: os níveis (falta, acabou, acabando, vai e ok) e a falta da fila inteira (faltam 207 g e tem 165 g de preto; faltam 15 argolas)',
      niveis === 'preto:falta,arg:falta,transl:acabou,dour:acabando,cx:acabando,ima:acabando,verde:vai,branco:ok,cinza:ok,etq:ok' && p.falta === 207 && p.tem === 165 && p.fila === 372 &&
      a.falta === 15 && a.tem === 5 && a.fila === 20 && sit('e3-verde').sobra === 30, { niveis, p: [p.falta, p.tem, p.fila], a: [a.falta, a.tem, a.fila] });
    const ordem = materiaisParaComprar().comprar.map(m => m.id.slice(3)).join();
    ok('O que comprar: do mais urgente para o menos (falta, acabou, acabando, vai), filamento antes de insumo no empate', ordem === 'preto,arg,transl,dour,cx,ima,verde', ordem);
    const m = materialDaFila(), somaFalta = id => [...m.por.values()].reduce((s, r) => s + [...r.fils, ...r.ins].filter(x => x.id === id).reduce((t, x) => t + x.falta, 0), 0);
    ok('O que comprar: a falta é a mesma conta da coluna Filamento da fila (a soma do que falta em cada ordem: 15 g + 192 g)', somaFalta('e3-preto') === p.falta && somaFalta('e3-arg') === a.falta &&
      m.por.get('e3-o2').fils.find(x => x.id === 'e3-preto').falta === 15 && m.por.get('e3-o3').fils.find(x => x.id === 'e3-preto').falta === 192, [somaFalta('e3-preto'), somaFalta('e3-arg')]);
    const lista = materiaisParaComprar().comprar, ids = new Set(lista.map(x => x.id)), avisos = alertas().filter(x => x.k === 'filamento' || x.k === 'insumo').map(x => x.id);
    const sobra = lista.filter(x => x.nivel !== 'falta' && x.nivel !== 'vai' && !avisos.includes(x.id)).map(x => x.id);
    ok('O que comprar: o alerta de 200 g e o mínimo dos insumos continuam os de antes (todo aviso de filamento e insumo está na lista; o resto é a fila)', avisos.length === 5 && avisos.every(id => ids.has(id)) && !sobra.length &&
      lista.every(x => x.nivel !== 'ok'), { avisos, sobra });
    const antes = bancoTexto(), mats = JSON.stringify([S.filamentos, S.insumos]);
    VIEWS.painel(); VIEWS.compras(); cadListaComprar('painel'); cadTextoLista(lista);
    await pausa(200);
    ok('O que comprar: só leitura (montar o Painel, Compras e a lista copiada não muda nada no banco)', bancoTexto() === antes && JSON.stringify([S.filamentos, S.insumos]) === mats && !temPendencias(), 0);
  });
  await tenta(['Painel: O que comprar no lugar de Material acabando (#op-material), com Comprei ou Repor e Já pedi em cada linha e Copiar lista',
    'Painel: cada linha diz o que falta ou o que tem ("faltam 207 g · tem 165 g", "acabou", "vão sobrar 30 g") e o terceiro ícone do celular leva a O que comprar',
    'Painel: lista longa mostra os mais urgentes (5) e "Ver mais"', 'Compras: a lista completa, com o que a fila usa e a última compra'], async () => {
    const p = VIEWS.painel(), s = secao34(p, 'op-material'), li = linhas34(p, 'op-material'), b = (l, rot) => l && $$('button', l).find(x => x.textContent.trim() === rot);
    ok('Painel: O que comprar no lugar de Material acabando (#op-material), com Comprei ou Repor e Já pedi em cada linha e Copiar lista', !!s && s.classList.contains('op-bloco') && !/Material acabando/.test(p) &&
      txt34($('h2', s)) === 'O que comprar 7' && li.length === 5 && li.every(l => !!b(l, 'Já pedi') && (b(l, 'Comprei') || b(l, 'Repor'))) && b(li[0], 'Comprei').getAttribute('onclick') === 'cadComprei(this.dataset.t, this.dataset.id)' &&
      b(li[0], 'Comprei').dataset.id === 'e3-preto' && b(li[1], 'Repor').dataset.t === 'ins' && b(li[0], 'Já pedi').getAttribute('onclick') === 'cadPedi(this.dataset.t, this.dataset.id)' &&
      b(li[0], 'Comprei').classList.contains('op-acao') && !!$$('button', s).find(x => x.textContent === 'Copiar lista'), s && txt34(s).slice(0, 400));
    opListaAberta.comprar = true; const todas = linhas34(VIEWS.painel(), 'op-material').map(linha34); opListaAberta.comprar = false;
    ok('Painel: cada linha diz o que falta ou o que tem ("faltam 207 g · tem 165 g", "acabou", "vão sobrar 30 g") e o terceiro ícone do celular leva a O que comprar',
      todas.join(' / ') === 'PLA Preto E3 | faltam 207 g · tem 165 g | Comprei Já pedi / Argola E3 | faltam 15 un · tem 5 un | Repor Já pedi / PETG Translúcido E3 | acabou · aviso em 200 g | Comprei Já pedi / ' +
      'PLA Dourado E3 | tem 118 g · a fila usa 56 g | Comprei Já pedi / Caixa E3 | tem 7 un · mínimo 15 | Repor Já pedi / Ímã E3 | tem 12 un · mínimo 30 | Repor Já pedi / PLA Verde E3 | vão sobrar 30 g · tem 410 g | Comprei Já pedi' &&
      /aria-label="O que comprar: 7" onclick="opIrBloco\('op-material'\)"/.test(p), todas);
    ok('Painel: lista longa mostra os mais urgentes (5) e "Ver mais"', li.length === 5 && !!$$('button', s).find(x => x.textContent === 'Ver mais 2' && x.getAttribute('onclick') === "opAlternarLista('comprar')") && todas.length === 7, [li.length, todas.length]);
    const c = linhas34(VIEWS.compras(), 'cad-comprar').map(linha34);
    ok('Compras: a lista completa, com o que a fila usa e a última compra', c.length === 7 && /^PLA Preto E3 \| faltam 207 g · tem 165 g · a fila usa 372 g · última: R\$ 104,50 na Voolt E3 \(\d\d\/\d\d\) \| Comprei Já pedi$/.test(c[0]) &&
      /^PLA Dourado E3 \| tem 118 g · aviso em 200 g · a fila usa 56 g · última: R\$ 139,00 na Lab E3 \(\d\d\/\d\d\) \| Comprei Já pedi$/.test(c[3]), c);
  });
  await tenta(['Copiar lista: o texto para o WhatsApp tem o que comprar, em filamento e insumos, com a quantidade (rolos que cobrem o que falta) e a última compra',
    'Copiar lista: depois de copiar, o aviso oferece "Marcar tudo como pedido" (sem área de transferência, o texto abre numa janela para copiar à mão)',
    'Copiar lista: "Marcar tudo como pedido" marca tudo o que estava na lista, com Desfazer (o banco volta ao que era)'], async () => {
    await assenta34();
    const lista = materiaisParaComprar().comprar, t = cadTextoLista(lista);
    const esperado = `Lista de compras — Nexos (${dataBR(hoje())})\n\nFilamento\n• PLA Preto E3: 1 kg (última: ${brl(104.5)}, Voolt E3)\n• PETG Translúcido E3: 1 kg\n• PLA Dourado E3: 1 kg (última: ${brl(139)}, Lab E3)\n• PLA Verde E3: 1 kg` +
      '\n\nInsumos\n• Argola E3: 20 un\n• Caixa E3: 30 un\n• Ímã E3: 50 un';
    ok('Copiar lista: o texto para o WhatsApp tem o que comprar, em filamento e insumos, com a quantidade (rolos que cobrem o que falta) e a última compra', t === esperado, t);
    limparAvisos();
    await cadCopiarLista();
    const bt = $$('#toasts .toast.com-acao button').find(x => x.textContent === 'Marcar tudo como pedido'), janela = $('#cadListaTxt');
    ok('Copiar lista: depois de copiar, o aviso oferece "Marcar tudo como pedido" (sem área de transferência, o texto abre numa janela para copiar à mão)',
      (!!bt && avisos32().some(x => /^Lista copiada\. Cole no WhatsApp\./.test(x))) || (!!janela && janela.value === esperado), [!!bt, !!janela, avisos32()]);
    if ($('#modal.open')) fecharModal();
    $$('#toasts .toast').forEach(x => (x._sair ? x._sair() : x.remove()));
    const antes = bancoTexto();
    cadMarcarTudo(lista);
    await pausa(300);
    const marcados = lista.filter(m => !!(noBanco(m.t === 'fil' ? 'filamentos' : 'insumos', m.id) || {}).pedidoEm).length, aviso = avisos32().find(x => /^7 itens marcados como pedido\.Desfazer$/.test(x));
    const caminho = materiaisParaComprar().caminho.length;
    desfazer33();
    await pausa(300);
    ok('Copiar lista: "Marcar tudo como pedido" marca tudo o que estava na lista, com Desfazer (o banco volta ao que era)', marcados === 7 && caminho === 7 && !!aviso && bancoTexto() === antes &&
      avisos32().some(x => /^Desfeito: 7 itens voltaram para a lista do que comprar\./.test(x)), [marcados, caminho, avisos32()]);
  });
  await tenta(['Comprei: a janela de compra de hoje abre com o fornecedor, o peso e o valor da última compra, marcados "Igual à última", e o cursor no valor, selecionado',
    'Comprei: registrar sem mudar nada grava a compra igual à última e soma ao estoque',
    'Comprei: a compra guarda o preço médio e o estoque de antes e o preço médio que ficou depois',
    'Comprei: mudar um campo troca a marca dele para "Última: ..."; trocar o filamento na janela traz a última compra do novo (no que a pessoa não mexeu)',
    'Comprei: filamento sem compra anterior abre como sempre (1 kg, valor em branco, sem fornecedor)',
    'Comprei: Registrar compra sem filamento escolhido abre com o valor em branco (como sempre); escolher o filamento traz a última compra dele'], async () => {
    cadComprei('fil', 'e3-preto');
    const f = $('#modal form'), campo = k => campoDoForm(f, k), v = campo('valor');
    const selecionado = document.activeElement === v && v.selectionStart === 0 && v.selectionEnd === v.value.length;
    ok('Comprei: a janela de compra de hoje abre com o fornecedor, o peso e o valor da última compra, marcados "Igual à última", e o cursor no valor, selecionado',
      txt34($('#modal h3')) === 'Registrar compra de filamento' && campo('filamentoId').value === 'e3-preto' && campo('fornecedorId').value === 'e3-fo1' && campo('pesoG').value === '1000' && v.value === '104,50' &&
      ['fornecedorId', 'pesoG', 'valor'].every(k => /^Igual à última \(\d\d\/\d\d\)/.test(dica34(campo(k))) && campo(k).classList.contains('cad-igual')) && selecionado,
      { forn: campo('fornecedorId').value, peso: campo('pesoG').value, valor: v.value, dicas: ['fornecedorId', 'pesoG', 'valor'].map(k => dica34(campo(k))), ativo: document.activeElement && document.activeElement.name, selecionado });
    const est0 = noBanco('filamentos', 'e3-preto').estoqueG;
    f.requestSubmit();
    await pausa(300);
    const novas = linhas32(d => d.filamentoId === 'e3-preto' && /^cp-/.test(d.id)).map(l => l.d), c = novas[0] || {};
    ok('Comprei: registrar sem mudar nada grava a compra igual à última e soma ao estoque', !$('#modal.open') && novas.length === 1 && c.fornecedorId === 'e3-fo1' && c.pesoG === 1000 && c.valor === 104.5 &&
      c.data === hoje() && noBanco('filamentos', 'e3-preto').estoqueG === est0 + 1000, { novas, est: noBanco('filamentos', 'e3-preto').estoqueG, est0 });
    ok('Comprei: a compra guarda o preço médio e o estoque de antes e o preço médio que ficou depois', c.precoAntes === 104 && c.estAntes === 165 && c.precoDepois === arred((165 / 1000 * 104 + 104.5) / (1165 / 1000), 2) &&
      noBanco('filamentos', 'e3-preto').precoKg === c.precoDepois, c);
    cadComprei('fil', 'e3-preto');
    const f2 = $('#modal form'), c2 = k => campoDoForm(f2, k);
    c2('valor').value = '110'; c2('valor').dispatchEvent(new Event('input', { bubbles: true }));
    const marcaValor = dica34(c2('valor')), igualValor = c2('valor').classList.contains('cad-igual');
    c2('filamentoId').value = 'e3-dour'; c2('filamentoId').dispatchEvent(new Event('input', { bubbles: true }));
    ok('Comprei: mudar um campo troca a marca dele para "Última: ..."; trocar o filamento na janela traz a última compra do novo (no que a pessoa não mexeu)',
      /^Última: R\$\s104,50 \(\d\d\/\d\d\)/.test(marcaValor) && !igualValor && c2('valor').value === '110' && c2('fornecedorId').value === 'e3-fo2' && c2('pesoG').value === '1000' &&
      /^Igual à última/.test(dica34(c2('fornecedorId'))) && /^Última: R\$\s139,00/.test(dica34(c2('valor'))), { marcaValor, valor: c2('valor').value, forn: c2('fornecedorId').value, dicas: [dica34(c2('fornecedorId')), dica34(c2('valor'))] });
    if (FORM) FORM.sujo = false; fecharModal();
    cadComprei('fil', 'e3-cinza');
    const c3 = k => campoDoForm($('#modal form'), k);
    ok('Comprei: filamento sem compra anterior abre como sempre (1 kg, valor em branco, sem fornecedor)', c3('pesoG').value === '1000' && c3('valor').value === '' && c3('fornecedorId').value === '' &&
      !$$('#modal .cad-igual').length && document.activeElement === c3('valor'), [c3('pesoG').value, c3('valor').value, c3('fornecedorId').value]);
    if (FORM) FORM.sujo = false; fecharModal();
    cadNovaCompra();                                                  // Registrar compra, sem filamento escolhido
    const c4 = k => campoDoForm($('#modal form'), k), vazio = c4('valor').value === '' && !$$('#modal .cad-igual').length;
    c4('filamentoId').value = 'e3-preto'; c4('filamentoId').dispatchEvent(new Event('input', { bubbles: true }));
    ok('Comprei: Registrar compra sem filamento escolhido abre com o valor em branco (como sempre); escolher o filamento traz a última compra dele', vazio && c4('valor').value === '104,50' &&
      c4('fornecedorId').value === 'e3-fo1' && c4('valor').classList.contains('cad-igual'), [vazio, c4('valor').value, c4('fornecedorId').value]);
  });
  await tenta(['Comprei: valor fora do comum (1045 no lugar de 104,50) aparece em vermelho antes de gravar ("10 vezes o preço médio")',
    'Comprei: valor fora do comum pergunta ao salvar, com o cursor em "Corrigir o valor"; nada é gravado até a resposta',
    'Comprei: "Corrigir o valor" volta para a janela com o valor selecionado; "Registrar assim mesmo" grava',
    'Repor: valor fora do comum também aparece em vermelho e pergunta (pelo custo por unidade)'], async () => {
    await assenta34();
    cadComprei('fil', 'e3-preto');
    const f = $('#modal form'), v = campoDoForm(f, 'valor');
    v.value = '1045'; v.dispatchEvent(new Event('input', { bubbles: true }));
    const conf = txt34($('#modal .cad-conf'));
    ok('Comprei: valor fora do comum (1045 no lugar de 104,50) aparece em vermelho antes de gravar ("10 vezes o preço médio")', /^Confira o valor\. R\$\s1\.045,00 por kg é 10 vezes o preço médio \(R\$\s104,43\)\.$/.test(conf), conf);
    const antes = bancoTexto();
    f.requestSubmit();
    await pausa(100);
    const pq = pergunta33(), bs = $$('#modal .pergunta-botoes .btn');
    ok('Comprei: valor fora do comum pergunta ao salvar, com o cursor em "Corrigir o valor"; nada é gravado até a resposta', !!pq && pq.titulo === 'Confira o valor' && /PLA Preto E3 a R\$\s1\.045,00 por kg é 10 vezes o preço médio/.test(pq.texto) &&
      pq.botoes.join('|') === 'Registrar assim mesmo|Corrigir o valor' && document.activeElement === bs[1] && bancoTexto() === antes, { pq, ativo: document.activeElement && document.activeElement.textContent });
    resposta33('Corrigir o valor');
    const volta = !$('#modal .caixa.pergunta') && !f.hidden && document.activeElement === v && v.selectionStart === 0 && v.selectionEnd === v.value.length;
    if (FORM) FORM.sujo = false; fecharModal();
    cadComprei('fil', 'e3-cinza');
    setCampo('valor', 970);
    $('#modal form').requestSubmit();
    await pausa(100);
    const pq2 = pergunta33();
    resposta33('Registrar assim mesmo');
    await pausa(300);
    ok('Comprei: "Corrigir o valor" volta para a janela com o valor selecionado; "Registrar assim mesmo" grava', volta && !!pq2 && linhas32(d => d.filamentoId === 'e3-cinza' && d.valor === 970).length === 1 && !$('#modal.open'),
      [volta, !!pq2, linhas32(d => d.filamentoId === 'e3-cinza').length]);
    cadComprei('ins', 'e3-ima');
    const fi = $('#modal form');
    campoDoForm(fi, 'qtd').value = '10'; campoDoForm(fi, 'valor').value = '50'; campoDoForm(fi, 'valor').dispatchEvent(new Event('input', { bubbles: true }));
    const confI = txt34($('#modal .cad-conf'));
    fi.requestSubmit();
    await pausa(100);
    const pi = pergunta33();
    ok('Repor: valor fora do comum também aparece em vermelho e pergunta (pelo custo por unidade)', /^Confira o valor\. R\$\s5,00 por un é 6,7 vezes o preço médio \(R\$\s0,75\)\.$/.test(confI) && !!pi && pi.titulo === 'Confira o valor' &&
      !linhas32(d => d.insumoId === 'e3-ima').length, [confI, pi]);
  });
  await tenta(['Repor: a reposição de hoje abre com a quantidade e o valor da última (lida do lançamento no Financeiro), marcados "Igual à última", e o cursor no valor',
    'Repor: o lançamento guarda o insumo e a quantidade (a próxima já vem com ela), e repor tira a marca do "Já pedi"',
    'Repor: lançamento de antes da versão 19 (sem o código do insumo) também vale, pela descrição'], async () => {
    put('lancamentos', { id: 'e3-l-antigo', data: addDias(hoje(), -10), tipo: 'gasto', categoria: 'Insumos', descricao: 'Reposição: Caixa E3 (1.250,5 un)', valor: 2100, fixo: false, criadoEm: ha(14400) });
    await pausa();
    const u = ultimaReposicao(byId('insumos', 'e3-cx'));
    ok('Repor: lançamento de antes da versão 19 (sem o código do insumo) também vale, pela descrição', !!u && u.qtd === 1250.5 && u.valor === 2100 && u.id === 'e3-l-antigo', u);
    cadComprei('ins', 'e3-cx');
    const f = $('#modal form'), q = campoDoForm(f, 'qtd'), v = campoDoForm(f, 'valor');
    ok('Repor: a reposição de hoje abre com a quantidade e o valor da última (lida do lançamento no Financeiro), marcados "Igual à última", e o cursor no valor',
      txt34($('#modal h3')) === 'Repor Caixa E3' && q.value === '1250,5' && v.value === '2100,00' && /^Igual à última \(\d\d\/\d\d\)/.test(dica34(q)) && /^Igual à última/.test(dica34(v)) && document.activeElement === v,
      [q.value, v.value, dica34(q), dica34(v)]);
    marcarPedido('insumos', 'e3-cx', 'Ana');
    q.value = '50'; v.value = '105'; q.dispatchEvent(new Event('input', { bubbles: true }));
    f.requestSubmit();
    await pausa(300);
    const l = linhas32(d => d.categoria === 'Insumos' && d.insumoId === 'e3-cx').map(x => x.d), ins = noBanco('insumos', 'e3-cx');
    ok('Repor: o lançamento guarda o insumo e a quantidade (a próxima já vem com ela), e repor tira a marca do "Já pedi"', l.length === 1 && l[0].qtd === 50 && l[0].valor === 105 && /^rp-e3-cx-/.test(l[0].id) &&
      !ins.pedidoEm && !ins.pedidoPor && ins.estoque === 57 && (ultimaReposicao(byId('insumos', 'e3-cx')) || {}).qtd === 50, { l, ins });
  });
  await tenta(['Comprei: o preço médio, o estoque e o preço por kg da compra são exatamente a conta da versão 18 (300 compras sorteadas)',
    'Repor: o custo médio, o estoque e o lançamento são exatamente a conta da versão 18 (300 reposições sorteadas)'], async () => {
    // a conta da versão 18 (registrarCompra e reporInsumo de calc.js no commit f417176), sem gravar nada
    const v18Compra = (f, d) => { const g = num(d.pesoG), valor = num(d.valor), r = { f: { ...f } };
      if (g > 0) { const est = Math.max(0, num(r.f.estoqueG)); r.f.precoKg = arred((est / 1000 * num(r.f.precoKg) + valor) / ((est + g) / 1000), 2); r.f.estoqueG = arred(num(r.f.estoqueG) + g, 2); r.media = { p: 'precoKg', q: 'estoqueG', n: g, v: valor, e: 1000, k: 2 }; }
      r.c = { pesoG: g, valor, precoKg: g > 0 ? valor / (g / 1000) : 0 };
      return r; };
    const v18Repor = (i, qtd, valor) => { qtd = num(qtd); valor = num(valor); const r = { i: { ...i } };
      if (qtd <= 0) return r;
      const est = Math.max(0, num(r.i.estoque));
      if (valor > 0) r.i.custo = arred((est * num(r.i.custo) + valor) / (est + qtd), 4);
      r.i.estoque = arred(num(r.i.estoque) + qtd, 3);
      r.media = valor > 0 ? { p: 'custo', q: 'estoque', n: qtd, v: valor, e: 1, k: 4 } : null;
      r.l = valor > 0 ? { valor, descricao: `Reposição: ${i.nome} (${nf(qtd, 2)} ${i.unidade || 'un'})` } : null;
      return r; };
    let semente = 34;
    const sorte = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const putReal = put, gravados = [], certos = { compras: 0, reposicoes: 0 }, difs = [];
    try {
      put = (col, rec, opts = {}) => { gravados.push({ col, rec: copia(rec), opts: copia(opts) }); return rec; };   // nada vai para o banco
      for (let n = 0; n < 300; n++) {
        const f0 = { id: 'e3-sorteio-f', nome: 'Sorteio', precoKg: arred(sorte() * 300, sorte() < 0.5 ? 2 : 0), estoqueG: arred(sorte() * 4000 - 800, sorte() < 0.5 ? 2 : 0) }, f = { ...f0 };
        const d = { data: hoje(), filamentoId: f0.id, fornecedorId: '', pesoG: [250, 500, 1000, 2000, 750, arred(sorte() * 3000, 1), 0][Math.floor(sorte() * 7)], valor: arred(sorte() * 600, sorte() < 0.7 ? 2 : 0) };
        const e = v18Compra(f0, d);
        S.filamentos.push(f); gravados.length = 0;
        try { registrarCompra(d); } finally { S.filamentos.splice(S.filamentos.indexOf(f), 1); }
        const gf = gravados.find(x => x.col === 'filamentos'), gc = gravados.find(x => x.col === 'compras');
        const certoF = num(d.pesoG) > 0 ? !!gf && gf.rec.precoKg === e.f.precoKg && gf.rec.estoqueG === e.f.estoqueG && iguais(gf.opts.media, e.media) : !gf;
        if (certoF && !!gc && gc.rec.pesoG === e.c.pesoG && gc.rec.valor === e.c.valor && gc.rec.precoKg === e.c.precoKg) certos.compras++; else if (difs.length < 3) difs.push({ f0, d, gf, gc, e });
      }
      for (let n = 0; n < 300; n++) {
        const i0 = { id: 'e3-sorteio-i', nome: 'Sorteio', unidade: ['un', 'm', 'ml'][n % 3], custo: arred(sorte() * 5, 4), estoque: arred(sorte() * 300 - 50, sorte() < 0.5 ? 3 : 0), minimo: 0 }, i = { ...i0 };
        const qtd = [1, 10, 50, 0.5, arred(sorte() * 500, 2), 0][Math.floor(sorte() * 6)], valor = sorte() < 0.15 ? 0 : arred(sorte() * 300, 2);
        const e = v18Repor(i0, qtd, valor);
        S.insumos.push(i); gravados.length = 0;
        try { reporInsumo(i, qtd, valor, hoje(), 'e3-sorteio-l'); } finally { S.insumos.splice(S.insumos.indexOf(i), 1); }
        const gi = gravados.find(x => x.col === 'insumos'), gl = gravados.find(x => x.col === 'lancamentos');
        const certoI = num(qtd) > 0 ? !!gi && gi.rec.custo === e.i.custo && gi.rec.estoque === e.i.estoque && iguais(gi.opts.media || null, e.media) : !gi;
        if (certoI && (e.l ? !!gl && gl.rec.valor === e.l.valor && gl.rec.descricao === e.l.descricao && gl.rec.categoria === 'Insumos' && gl.rec.tipo === 'gasto' : !gl)) certos.reposicoes++;
        else if (difs.length < 3) difs.push({ i0, qtd, valor, gi, gl, e });
      }
    } finally { put = putReal; }
    ok('Comprei: o preço médio, o estoque e o preço por kg da compra são exatamente a conta da versão 18 (300 compras sorteadas)', certos.compras === 300, { certos, difs });
    ok('Repor: o custo médio, o estoque e o lançamento são exatamente a conta da versão 18 (300 reposições sorteadas)', certos.reposicoes === 300, { certos, difs });
  });
  await tenta(['Já pedi: 1 toque marca quem pediu e quando (no modo demonstração, "você")',
    'Já pedi: a linha fica no lugar (não pula debaixo do dedo), com "pedido hoje por você", Chegou e desfazer no lugar de Comprei e Já pedi',
    'Já pedi: o Desfazer do aviso tira a marca (o banco volta ao que era); o "desfazer" da linha também',
    'Já pedi: ao trocar de tela, a linha vai para A caminho, com Chegou ("Chegou tudo" quando há mais de um)',
    'Já pedi: Chegou abre a compra já preenchida com a última; registrar tira a marca sozinho'], async () => {
    ir('painel'); render(); await pausa(100); await assenta34();
    const antes = bancoTexto(), nomes0 = linhas34(VIEWS.painel(), 'op-material').map(l => txt34($('.op-t b', l))), n0 = materiaisParaComprar().comprar.length;
    cadPedi('fil', 'e3-dour');
    await pausa(300);
    const r = noBanco('filamentos', 'e3-dour') || {};
    ok('Já pedi: 1 toque marca quem pediu e quando (no modo demonstração, "você")', !!r.pedidoEm && Date.now() - Date.parse(r.pedidoEm) < 60000 && r.pedidoPor === 'você' && byId('filamentos', 'e3-dour').pedidoEm === r.pedidoEm, [r.pedidoEm, r.pedidoPor]);
    const lis = linhas34(VIEWS.painel(), 'op-material'), li = lis.map(linha34), s = secao34(VIEWS.painel(), 'op-material'), k = nomes0.indexOf('PLA Dourado E3');
    ok('Já pedi: a linha fica no lugar (não pula debaixo do dedo), com "pedido hoje por você", Chegou e desfazer no lugar de Comprei e Já pedi', k >= 0 && li[k] === 'PLA Dourado E3 | pedido hoje por você | Chegou desfazer' &&
      lis.map(l => txt34($('.op-t b', l))).join() === nomes0.join() && !/A caminho/.test(txt34(s)) && txt34($('h2', s)) === 'O que comprar ' + (n0 - 1), { nomes0, li });
    desfazer33();
    await pausa(300);
    const desfeito = bancoTexto() === antes && !byId('filamentos', 'e3-dour').pedidoEm && avisos32().some(t => /^Desfeito: PLA Dourado E3 voltou para a lista do que comprar\./.test(t));
    cadPedi('fil', 'e3-dour'); await pausa(300);
    cadDesmarcar('fil', 'e3-dour'); await pausa(300);
    ok('Já pedi: o Desfazer do aviso tira a marca (o banco volta ao que era); o "desfazer" da linha também', desfeito && bancoTexto() === antes && !$$('#toasts .toast.com-acao').length, [desfeito, avisos32().slice(-3)]);
    cadPedi('fil', 'e3-dour'); cadPedi('ins', 'e3-ima');
    await pausa(300);
    location.hash = 'compras'; await pausa(200); location.hash = 'painel'; await pausa(200);
    const s2 = secao34(VIEWS.painel(), 'op-material'), grupo = s2 && $('.cad-grupo', s2), caminho = s2 ? $$('.cad-grupo + .op-lista li', s2).map(linha34) : [];
    ok('Já pedi: ao trocar de tela, a linha vai para A caminho, com Chegou ("Chegou tudo" quando há mais de um)', !!grupo && txt34($('span', grupo)) === 'A caminho' && txt34($('button', grupo)) === 'Chegou tudo' &&
      caminho.join(' / ') === 'PLA Dourado E3 | pedido hoje por você · tem 118 g | Chegou / Ímã E3 | pedido hoje por você · tem 12 un | Chegou' &&
      !$$('#op-material .op-lista li', dom34(VIEWS.painel())).some(x => /Dourado/.test(x.textContent) && /Já pedi/.test(x.textContent)), caminho);
    cadComprei('fil', 'e3-dour');
    const f = $('#modal form'), pre = ['fornecedorId', 'pesoG', 'valor'].map(k => campoDoForm(f, k).value).join('|');
    f.requestSubmit();
    await pausa(300);
    const d2 = noBanco('filamentos', 'e3-dour') || {};
    ok('Já pedi: Chegou abre a compra já preenchida com a última; registrar tira a marca sozinho', pre === 'e3-fo2|1000|139,00' && !d2.pedidoEm && !d2.pedidoPor && d2.estoqueG === 1118 &&
      !materiaisParaComprar().caminho.some(m => m.id === 'e3-dour'), [pre, d2]);
  });
  await tenta(['Já pedi: os dois aparelhos marcando juntos deixam uma marca só (e a tela mostra uma linha em A caminho)',
    'Já pedi: o Desfazer não apaga a marca que outra pessoa pôs depois',
    'Já pedi: marca esquecida mostra "pedido há 9 dias por Ana" (em amarelo) e continua visível em A caminho, com Não veio em Compras',
    'Já pedi: Não veio (Compras) tira a marca esquecida, com Desfazer'], async () => {
    await assenta34();
    outroPC([{ n: 81, ops: [{ c: 'insumos', i: 'e3-arg', t: 'mudar', p: [{ s: { pedidoEm: agoraISO(), pedidoPor: 'Sócio' } }] }] }]);
    cadPedi('ins', 'e3-arg');                                        // este PC ainda não sabe
    await pausa(300);
    await carregarTudo(true);
    const b = noBanco('insumos', 'e3-arg') || {}, t = byId('insumos', 'e3-arg') || {};
    ok('Já pedi: os dois aparelhos marcando juntos deixam uma marca só (e a tela mostra uma linha em A caminho)', typeof b.pedidoEm === 'string' && !!b.pedidoEm && ['você', 'Sócio'].includes(b.pedidoPor) &&
      t.pedidoEm === b.pedidoEm && t.pedidoPor === b.pedidoPor && materiaisParaComprar().caminho.filter(m => m.id === 'e3-arg').length === 1, [b, t]);
    cadPedi('fil', 'e3-preto');
    await pausa(300);
    outroPC([{ n: 82, ops: [{ c: 'filamentos', i: 'e3-preto', t: 'mudar', p: [{ s: { pedidoEm: new Date(Date.now() + 1000).toISOString(), pedidoPor: 'Sócio' } }] }] }]);
    await carregarTudo(true);
    tiraAvisos34();
    desfazer33();
    await pausa(300);
    ok('Já pedi: o Desfazer não apaga a marca que outra pessoa pôs depois', (noBanco('filamentos', 'e3-preto') || {}).pedidoPor === 'Sócio' && avisos32().some(x => /Isto já mudou depois\. Nada foi desfeito\./.test(x)), [noBanco('filamentos', 'e3-preto'), avisos32()]);
    outroPC([{ n: 83, ops: [{ c: 'filamentos', i: 'e3-transl', t: 'mudar', p: [{ s: { pedidoEm: addDias(hoje(), -9), pedidoPor: 'Ana' } }] }] }]);
    await carregarTudo(true);
    const daTransl = (h, id) => $$('li', secao34(h, id) || document.createElement('div')).find(x => x.querySelector('[data-id="e3-transl"]'));
    const lp = daTransl(VIEWS.painel(), 'op-material'), lc = daTransl(VIEWS.compras(), 'cad-comprar');
    ok('Já pedi: marca esquecida mostra "pedido há 9 dias por Ana" (em amarelo) e continua visível em A caminho, com Não veio em Compras', !!lp && /pedido há 9 dias por Ana/.test(lp.textContent) && !!$('small .aviso', lp) &&
      /Chegou/.test(lp.textContent) && !/Não veio/.test(lp.textContent) && !!lc && /Não veio/.test(lc.textContent), [lp && txt34(lp), lc && txt34(lc)]);
    const antes = bancoTexto();
    cadNaoVeio('fil', 'e3-transl');
    await pausa(300);
    const tirou = !(noBanco('filamentos', 'e3-transl') || {}).pedidoEm && materiaisParaComprar().comprar.some(m => m.id === 'e3-transl');
    desfazer33();
    await pausa(300);
    ok('Já pedi: Não veio (Compras) tira a marca esquecida, com Desfazer', tirou && bancoTexto() === antes && (noBanco('filamentos', 'e3-transl') || {}).pedidoPor === 'Ana', [tirou, noBanco('filamentos', 'e3-transl')]);
  });
  await tenta(['Chegou tudo: com mais de um a caminho, uma compra de cada vez, cada janela já preenchida com a última ("1 de 3", "2 de 3"...)',
    'Chegou tudo: registrar uma abre a próxima; o segundo toque (ou Enter) logo depois não grava a próxima sem ela ser vista',
    'Chegou tudo: fechar a janela para por ali (o que faltou continua em A caminho)'], async () => {
    // a caminho, do mais urgente para o menos: o ímã (acabando), o preto e o dourado
    ['insumos/e3-arg', 'filamentos/e3-transl'].forEach(k => tirarPedido(...k.split('/')));
    marcarPedido('filamentos', 'e3-dour', 'Ana');
    await pausa(300);
    const titulo = () => txt34($('#modal.open h3'));
    const caminho = materiaisParaComprar().caminho.map(m => m.id).join();
    cadChegouTudo();
    const t1 = titulo();
    setCampo('qtd', 50); setCampo('valor', 37.5);
    $('#modal form').requestSubmit();
    await pausa(60);
    const t2 = titulo(), v2 = (campoDoForm($('#modal form'), 'valor') || {}).value, compras0 = linhas32(d => d.filamentoId === 'e3-preto' && /^cp-/.test(d.id)).length;
    ok('Chegou tudo: com mais de um a caminho, uma compra de cada vez, cada janela já preenchida com a última ("1 de 3", "2 de 3"...)', caminho === 'e3-ima,e3-preto,e3-dour' && t1 === 'Repor Ímã E3 (1 de 3)' &&
      t2 === 'Registrar compra de filamento (2 de 3)' && v2 === '104,50', [caminho, t1, t2, v2]);
    $('#modal form').requestSubmit();                                 // o segundo toque, logo em seguida
    await pausa(150);
    const ignorou = titulo() === t2 && linhas32(d => d.filamentoId === 'e3-preto' && /^cp-/.test(d.id)).length === compras0;
    await pausa(800);
    $('#modal form').requestSubmit();
    await pausa(300);
    const t3 = titulo(), entrou = linhas32(d => d.filamentoId === 'e3-preto' && /^cp-/.test(d.id)).length === compras0 + 1;
    ok('Chegou tudo: registrar uma abre a próxima; o segundo toque (ou Enter) logo depois não grava a próxima sem ela ser vista', ignorou && entrou && t3 === 'Registrar compra de filamento (3 de 3)' &&
      !(noBanco('insumos', 'e3-ima') || {}).pedidoEm && noBanco('insumos', 'e3-ima').estoque === 62 && !(noBanco('filamentos', 'e3-preto') || {}).pedidoEm, [ignorou, entrou, t3]);
    if (FORM) FORM.sujo = false;
    fecharForm();
    await pausa(300);
    ok('Chegou tudo: fechar a janela para por ali (o que faltou continua em A caminho)', !$('#modal.open') && materiaisParaComprar().caminho.map(m => m.id).join() === 'e3-dour', materiaisParaComprar().caminho.map(m => m.id));
    tirarPedido('filamentos', 'e3-dour');
  });
  await tenta(['Acertar estoque: peça pronta numa janela de 1 campo (no lugar dos 19 da janela do produto), com o número de hoje selecionado',
    'Acertar estoque: grava o número digitado ("agora tem 13 peças") e tem Desfazer, que volta ao número de antes',
    'Acertar estoque: rolo com atalhos (acabou, ¼, ½, 1 e 2 rolos), mais e menos e "pesei com o carretel" (desconta o carretel vazio)',
    'Acertar estoque: a janela lembra que perdeu na impressão é Falhou e chegou rolo é Comprei (no insumo, Repor)',
    'Acertar estoque: dois ajustes ao mesmo tempo nos dois aparelhos (13 e 12): o segundo é recusado com aviso (a proteção da versão 16)',
    'Acertar estoque: o estoque mudou no outro aparelho com a janela aberta (e chegou aqui): nada é gravado e o aviso explica',
    'Acertar estoque: o Desfazer não volta o número se o estoque mudou depois (aqui ou só no banco)'], async () => {
    await assenta34();
    cadAcertar('prod', 'e3-cabos');
    const f = $('#modal form'), campos = $$('input, select, textarea', f).filter(e => e.getClientRects().length && !['hidden', 'checkbox'].includes(e.type)), n = campoDoForm(f, 'novo');
    ok('Acertar estoque: peça pronta numa janela de 1 campo (no lugar dos 19 da janela do produto), com o número de hoje selecionado', campos.length === 1 && n === campos[0] && n.value === '14' &&
      document.activeElement === n && n.selectionStart === 0 && n.selectionEnd === 2 && txt34($('#modal h3')) === 'Acertar estoque' && /Organizador E3no sistema: 14 peças/.test(txt34($('#modal .cad-cab'))), [campos.length, n && n.value]);
    const antes = bancoTexto();
    n.value = '13'; n.dispatchEvent(new Event('input', { bubbles: true }));
    const dif = txt34($('#modal .cad-dif'));
    f.requestSubmit();
    await pausa(300);
    const agora = (noBanco('produtos', 'e3-cabos') || {}).estoque, aviso = avisos32().find(x => /^Organizador E3: agora tem 13 peças\.Desfazer$/.test(x));
    desfazer33();
    await pausa(300);
    ok('Acertar estoque: grava o número digitado ("agora tem 13 peças") e tem Desfazer, que volta ao número de antes', /^Diferença: −1 peça\. Não é venda nem produção: só corrige a contagem\.$/.test(dif) && agora === 13 && !!aviso &&
      bancoTexto() === antes && noBanco('produtos', 'e3-cabos').estoque === 14 && avisos32().some(x => /^Desfeito: Organizador E3 voltou para 14 peças\./.test(x)), [dif, agora, avisos32().slice(-2)]);
    const cinza = byId('filamentos', 'e3-cinza').estoqueG;
    cadAcertar('fil', 'e3-cinza');
    const chips = $$('#modal .cad-ficha').map(b => b.textContent), novo = () => campoDoForm($('#modal form'), 'novo').value;
    $$('#modal .cad-ficha').find(b => b.textContent === '½ rolo').click();
    const meio = novo();
    $('#modal [aria-label="Mais"]').click();
    const mais = novo();
    $$('#modal .cad-ficha').find(b => /carretel/.test(b.textContent)).click();
    $('#cadB2').value = '230'; $('#cadB1').value = '1.100'; $('#cadB1').dispatchEvent(new Event('input', { bubbles: true }));
    const pesou = novo(), lembraFil = txt34($('#modal .cad-dif'));
    ok('Acertar estoque: rolo com atalhos (acabou, ¼, ½, 1 e 2 rolos), mais e menos e "pesei com o carretel" (desconta o carretel vazio)', chips.join('|') === 'acabou|¼ de rolo|½ rolo|1 rolo|2 rolos|pesei com o carretel' &&
      meio === '500' && mais === '550' && pesou === '870' && txt34($('#cadB3')) === '870 g' && txt34($('#modal .cad-cab')) === 'PLA Cinza E3no sistema: ' + gramas(cinza), [chips, meio, mais, pesou, txt34($('#modal .cad-cab'))]);
    if (FORM) FORM.sujo = false; fecharModal();
    cadAcertar('ins', 'e3-etq');
    const lembraIns = txt34($('#modal .cad-dif'));
    if (FORM) FORM.sujo = false; fecharModal();
    ok('Acertar estoque: a janela lembra que perdeu na impressão é Falhou e chegou rolo é Comprei (no insumo, Repor)',
      lembraFil === `Diferença: −${gramas(cinza - 870)}. Só corrige a contagem. Perdeu numa impressão? Use Falhou. Chegou rolo? Use Comprei.`.replace(/\s+/g, ' ') &&
      /^Só corrige a contagem\. Chegou mais\? Use Repor\.$/.test(lembraIns), [lembraFil, lembraIns]);
    cadAcertar('prod', 'e3-cabos');                                   // as duas janelas abrem com 14
    outroPC([{ n: 91, ops: [{ c: 'produtos', i: 'e3-cabos', t: 'mudar', p: [{ e: { estoque: 14 }, s: { estoque: 13 } }] }] }]);   // o outro grava 13; este ainda não sabe
    campoDoForm($('#modal form'), 'novo').value = '12';
    limparAvisos();
    $('#modal form').requestSubmit();
    await pausa(400);
    ok('Acertar estoque: dois ajustes ao mesmo tempo nos dois aparelhos (13 e 12): o segundo é recusado com aviso (a proteção da versão 16)', noBanco('produtos', 'e3-cabos').estoque === 13 &&
      byId('produtos', 'e3-cabos').estoque === 13 && avisos32().some(x => /^Outro aparelho mudou o produto “Organizador E3” pouco antes\. Esta alteração não foi gravada/.test(x)) && !$$('#toasts .toast.com-acao').length,
      [noBanco('produtos', 'e3-cabos').estoque, avisos32()]);
    cadAcertar('prod', 'e3-cabos');                                   // 13
    outroPC([{ n: 92, ops: [{ c: 'produtos', i: 'e3-cabos', t: 'mudar', p: [{ a: { estoque: -1 } }] }] }]);   // o outro vendeu 1, e chega aqui
    await carregarTudo(true);
    campoDoForm($('#modal form'), 'novo').value = '10';
    limparAvisos();
    $('#modal form').requestSubmit();
    await pausa(300);
    ok('Acertar estoque: o estoque mudou no outro aparelho com a janela aberta (e chegou aqui): nada é gravado e o aviso explica', noBanco('produtos', 'e3-cabos').estoque === 12 && !$('#modal.open') &&
      avisos32().some(x => /^Outro aparelho mudou o estoque de Organizador E3 enquanto esta janela estava aberta \(agora: 12 peças\)\. Nada foi gravado/.test(x)), [noBanco('produtos', 'e3-cabos').estoque, avisos32()]);
    cadAcertar('prod', 'e3-cabos');                                   // 12
    campoDoForm($('#modal form'), 'novo').value = '15';
    $('#modal form').requestSubmit();
    await pausa(300);
    outroPC([{ n: 93, ops: [{ c: 'produtos', i: 'e3-cabos', t: 'mudar', p: [{ a: { estoque: -2 } }] }] }]);   // o outro vendeu 2, e chega aqui
    await carregarTudo(true);
    tiraAvisos34();
    desfazer33();
    await pausa(300);
    const aqui = noBanco('produtos', 'e3-cabos').estoque === 13 && avisos32().some(x => /Isto já mudou depois\. Nada foi desfeito\./.test(x));
    cadAcertar('prod', 'e3-cabos');                                   // 13
    campoDoForm($('#modal form'), 'novo').value = '11';
    $('#modal form').requestSubmit();
    await pausa(300);
    outroPC([{ n: 94, ops: [{ c: 'produtos', i: 'e3-cabos', t: 'mudar', p: [{ a: { estoque: -1 } }] }] }]);   // o outro vendeu 1; este ainda não sabe
    tiraAvisos34();
    desfazer33();
    await pausa(400);
    ok('Acertar estoque: o Desfazer não volta o número se o estoque mudou depois (aqui ou só no banco)', aqui && noBanco('produtos', 'e3-cabos').estoque === 10 && byId('produtos', 'e3-cabos').estoque === 10 &&
      avisos32().some(x => /^Outro aparelho mudou o produto “Organizador E3” pouco antes\. Esta alteração não foi gravada/.test(x)), [aqui, noBanco('produtos', 'e3-cabos').estoque, avisos32()]);
  });
  await tenta(['Filamentos, Insumos e Peças prontas: o estoque fica logo depois do nome e o próprio número abre o Acertar estoque; a linha tem Acertar e Comprei ou Repor (Chegou quando foi pedido)'], async () => {
    marcarPedido('filamentos', 'e3-verde', 'Ana');
    await pausa(200);
    const fil = dom34(VIEWS.filamentos()), ins = dom34(VIEWS.insumos()), ven = dom34(VIEWS.vendas()), th = d => $$('thead th', d).map(txt34);
    const num_ = (d, t, id) => { const b = $(`button.cad-num[data-t="${t}"][data-id="${id}"]`, d); return !!b && b.getAttribute('onclick') === 'cadAcertar(this.dataset.t, this.dataset.id)' && b.closest('td') === b.closest('tr').children[1]; };
    const bt = (d, id, rot) => !!$$(`tr button[data-id="${id}"]`, d).find(b => b.textContent.trim() === rot);
    const r = { fil: th(fil)[1] === 'Estoque' && num_(fil, 'fil', 'e3-cinza') && bt(fil, 'e3-cinza', 'Comprei') && bt(fil, 'e3-cinza', 'Acertar') && bt(fil, 'e3-verde', 'Chegou') && /pedido hoje por Ana/.test(txt34($$('tr', fil).find(x => /PLA Verde E3/.test(x.textContent)))),
      ins: th(ins)[1] === 'Estoque' && num_(ins, 'ins', 'e3-etq') && bt(ins, 'e3-etq', 'Repor') && bt(ins, 'e3-etq', 'Acertar') && txt34($('button.cad-num[data-id="e3-etq"]', ins)) === '410 un',
      ven: num_(ven, 'prod', 'e3-cabos') && bt(ven, 'e3-cabos', 'Acertar') && bt(ven, 'e3-cabos', 'Vender') };
    tirarPedido('filamentos', 'e3-verde');
    ok('Filamentos, Insumos e Peças prontas: o estoque fica logo depois do nome e o próprio número abre o Acertar estoque; a linha tem Acertar e Comprei ou Repor (Chegou quando foi pedido)', Object.values(r).every(Boolean), r);
  });
  window.confirm = confirmarDeVerdade;
  localStorage.removeItem('nexos-carretel');
  await carregarTudo();

  // 34b. versão 19, correções da revisão da etapa 3: o valor preenchido acompanha o peso (e a quantidade); o dobro, a metade e o zero
  // também avisam; a compra errada confirmada não vira o valor da próxima; a reposição antiga de outro insumo com nome parecido não
  // vale; o Desfazer do Já pedi, do Marcar tudo e o Não veio conferem a marca no banco; o Desfazer do Não veio não volta depois da
  // compra; Chegou tudo pula o que o outro aparelho registrou e pergunta antes de gravar; Chegou com a tela parada pergunta; Chegou
  // tudo abre só o que está em A caminho; Marcar tudo com um item excluído; "falta chegar"; A caminho com Ver mais; Acertar no fim
  // da linha. Banco limpo; o "outro PC" grava direto no banco local (outroPC), como nas seções 31 a 34.
  for (let i = 0; i < 40 && temPendencias(); i++) await pausa(100);
  localStorage.removeItem(DEMO_KEY); await carregarTudo(); ir('painel'); render();
  limparAvisos();
  window.confirm = () => true;
  {
    const dias = n => addDias(hoje(), -n);
    const fecha34b = () => { if ($('#modal.open')) { if (FORM) FORM.sujo = false; fecharModal(); } };
    put('fornecedores', { id: 'r3-fo', nome: 'Voolt R3', contato: '', obs: '' });
    const filR3 = (id, nome, precoKg, estoqueG) => put('filamentos', { id, nome, tipo: 'PLA', cor: '#222222', precoKg, estoqueG });
    const compR3 = (id, f, g, v, dd) => put('compras', { id, data: dias(dd), filamentoId: f, fornecedorId: 'r3-fo', pesoG: g, valor: v, precoKg: v / (g / 1000), obs: '', criadoEm: ha(60 * 24 * dd + 30) });
    filR3('r3-pla', 'PLA Dois Rolos R3', 104, 165); compR3('r3-c1', 'r3-pla', 1000, 104.5, 7);
    filR3('r3-zero', 'PLA Zero R3', 100, 500); compR3('r3-c2', 'r3-zero', 1000, 100, 9);
    filR3('r3-erro', 'PLA Erro R3', 104, 165); compR3('r3-c3', 'r3-erro', 1000, 104.5, 8);
    const insR3 = (id, nome, custo, estoque, minimo) => put('insumos', { id, nome, unidade: 'un', custo, estoque, minimo });
    insR3('r3-arg', 'Argola R3', 2, 5, 10); insR3('r3-cola', 'Cola R3', 1, 10, 0);
    insR3('r3-ima', 'Ímã R3', 0.75, 12, 0); insR3('r3-ima6', 'Ímã R3 (6x2 mm)', 0.9, 40, 0); insR3('r3-cx', 'Caixa R3', 2, 7, 0); insR3('r3-cxg', 'Caixa R3 (grande)', 2, 3, 0);
    const lancR3 = (id, dd, descricao, valor, extra = {}) => put('lancamentos', { id, data: dias(dd), tipo: 'gasto', categoria: 'Insumos', descricao, valor, fixo: false, criadoEm: ha(60 * 24 * dd + 30), ...extra });
    lancR3('r3-l1', 6, 'Reposição: Argola R3 (10 un)', 20, { insumoId: 'r3-arg', qtd: 10 }); lancR3('r3-l2', 6, 'Reposição: Cola R3 (10 un)', 10, { insumoId: 'r3-cola', qtd: 10 });
    // lançamentos de antes da versão 19 (sem o código do insumo): o do "Ímã R3 (6x2 mm)" é mais novo que o do "Ímã R3"
    lancR3('r3-l3', 20, 'Reposição: Ímã R3 (20 un)', 30); lancR3('r3-l4', 3, 'Reposição: Ímã R3 (6x2 mm) (100 un)', 90);
    lancR3('r3-l5', 10, 'Reposição: Caixa R3 (50 un)', 100); lancR3('r3-l6', 2, 'Reposição: Caixa R3 (grande) (30 un)', 60);
    // o outro aparelho: marca o "Já pedi" (com o número da marca) ou registra a chegada de 1 kg (a marca sai e o estoque soma)
    const marcaOutro = (n, col, id, por, em) => outroPC([{ n, ops: [{ c: col, i: id, t: 'mudar', p: [{ s: { pedidoEm: em || new Date(Date.now() + 1000).toISOString(), pedidoPor: por, pedidoN: n } }] }] }]);
    const chegadaOutro = (n, id, cod, valor = 100) => outroPC([{ n, ops: [{ c: 'filamentos', i: id, t: 'mudar', p: [{ m: [{ p: 'precoKg', q: 'estoqueG', n: 1000, v: valor, e: 1000, k: 2 }], x: ['pedidoEm', 'pedidoPor', 'pedidoN'], a: { estoqueG: 1000 } }] },
      { c: 'compras', i: cod, t: 'novo', d: { data: hoje(), filamentoId: id, fornecedorId: 'r3-fo', pesoG: 1000, valor, precoKg: valor, obs: '', criadoEm: agoraISO() } }] }]);
    const semMarcas = () => [...S.filamentos.filter(r => r.pedidoEm).map(r => ['filamentos', r.id]), ...S.insumos.filter(r => r.pedidoEm).map(r => ['insumos', r.id])].forEach(([c, id]) => tirarPedido(c, id));
    await pausa(300); await assenta34();

    await tenta(['Comprei preenchido: mudar só o peso (2 rolos) faz o valor acompanhar pelo preço da última (R$ 209,00, "pelo preço da última"), e o preço médio não cai para a metade',
      'Repor preenchido: mudar só a quantidade (20 no lugar de 10) faz o valor acompanhar (R$ 40,00), e o custo médio fica o mesmo',
      'Comprei preenchido: o valor que a pessoa digitou não muda com o peso'], async () => {
      cadComprei('fil', 'r3-pla');
      const f = $('#modal form'), peso = campoDoForm(f, 'pesoG'), v = campoDoForm(f, 'valor');
      peso.value = '2000'; peso.dispatchEvent(new Event('input', { bubbles: true }));
      const valor = v.value, dica = dica34(v), tracejado = v.classList.contains('cad-igual');
      f.requestSubmit();
      await pausa(300);
      const c = linhas32(d => d.filamentoId === 'r3-pla' && /^cp-/.test(d.id)).map(l => l.d)[0] || {}, pm = (noBanco('filamentos', 'r3-pla') || {}).precoKg;
      ok('Comprei preenchido: mudar só o peso (2 rolos) faz o valor acompanhar pelo preço da última (R$ 209,00, "pelo preço da última"), e o preço médio não cai para a metade',
        valor === '209,00' && /^Pelo preço da última: R\$\s104,50 o kg \(\d\d\/\d\d\)/.test(dica) && tracejado && !$('#modal.open') && c.pesoG === 2000 && c.valor === 209 &&
        pm === arred((165 / 1000 * 104 + 209) / (2165 / 1000), 2), { valor, dica, tracejado, c, pm });
      cadComprei('ins', 'r3-arg');
      const fi = $('#modal form'), q = campoDoForm(fi, 'qtd'), vi = campoDoForm(fi, 'valor'), q0 = q.value, v0 = vi.value;
      q.value = '20'; q.dispatchEvent(new Event('input', { bubbles: true }));
      const vi1 = vi.value, dicaI = dica34(vi);
      fi.requestSubmit();
      await pausa(300);
      const l = linhas32(d => d.categoria === 'Insumos' && d.insumoId === 'r3-arg' && /^rp-/.test(d.id)).map(x => x.d)[0] || {}, ins = noBanco('insumos', 'r3-arg') || {};
      ok('Repor preenchido: mudar só a quantidade (20 no lugar de 10) faz o valor acompanhar (R$ 40,00), e o custo médio fica o mesmo', q0 === '10' && v0 === '20,00' && vi1 === '40,00' &&
        /^Pelo preço da última: R\$\s2,00 por un \(\d\d\/\d\d\)/.test(dicaI) && l.qtd === 20 && l.valor === 40 && ins.custo === 2 && ins.estoque === 25, { q0, v0, vi1, dicaI, l, ins });
      cadComprei('fil', 'r3-erro');
      const f3 = $('#modal form'), v3 = campoDoForm(f3, 'valor'), p3 = campoDoForm(f3, 'pesoG');
      v3.value = '150'; v3.dispatchEvent(new Event('input', { bubbles: true }));
      p3.value = '2000'; p3.dispatchEvent(new Event('input', { bubbles: true }));
      ok('Comprei preenchido: o valor que a pessoa digitou não muda com o peso', v3.value === '150' && /^Última: R\$\s104,50/.test(dica34(v3)) && !v3.classList.contains('cad-igual'), [v3.value, dica34(v3)]);
      fecha34b();
    });
    await tenta(['Valor fora do comum: o dobro e a metade exatos do preço médio também aparecem em vermelho',
      'Valor fora do comum: a compra sem custo (R$ 0,00) com preço médio também avisa em vermelho e pergunta antes de gravar (nada é gravado até a resposta)'], async () => {
      cadComprei('fil', 'r3-zero');                                      // preço médio R$ 100,00 por kg; a última foi 1 kg por R$ 100,00
      const conf = v => { setCampo('valor', v); return txt34($('#modal .cad-conf')); };
      const dobro = conf(200), metade = conf(50), perto = conf(150), zero = conf(0);
      ok('Valor fora do comum: o dobro e a metade exatos do preço médio também aparecem em vermelho', /^Confira o valor\. R\$\s200,00 por kg é 2 vezes o preço médio \(R\$\s100,00\)\.$/.test(dobro) &&
        /^Confira o valor\. R\$\s50,00 por kg é 50% do preço médio \(R\$\s100,00\)\.$/.test(metade) && perto === '', { dobro, metade, perto });
      const antes = bancoTexto();
      $('#modal form').requestSubmit();
      await pausa(150);
      const pq = pergunta33(), bs = $$('#modal .pergunta-botoes .btn');
      ok('Valor fora do comum: a compra sem custo (R$ 0,00) com preço médio também avisa em vermelho e pergunta antes de gravar (nada é gravado até a resposta)',
        /^Confira o valor\. R\$\s0,00 por kg \(sem custo\) faz o preço médio cair \(R\$\s100,00\)\.$/.test(zero) && !!pq && pq.titulo === 'Confira o valor' &&
        /^PLA Zero R3 sem custo \(R\$\s0,00\) faz o preço médio cair \(R\$\s100,00 por kg\)\. O valor está certo\?$/.test(pq.texto) && document.activeElement === bs[1] && bancoTexto() === antes, { zero, pq });
      fecha34b();
    });
    await tenta(['Comprei: a compra errada confirmada em "Registrar assim mesmo" não vira o valor da próxima (vem em branco, com o aviso "ficou fora do comum")',
      'Repor: a reposição errada confirmada assim mesmo também não vira o valor da próxima (o lançamento guarda o custo médio de antes)'], async () => {
      await assenta34();
      cadComprei('fil', 'r3-erro');
      setCampo('valor', 1045);
      $('#modal form').requestSubmit();
      await pausa(150);
      resposta33('Registrar assim mesmo');
      await pausa(300);
      const c = linhas32(d => d.filamentoId === 'r3-erro' && d.valor === 1045).length;
      cadComprei('fil', 'r3-erro');
      const v = campoDoForm($('#modal form'), 'valor'), dica = dica34(v);
      ok('Comprei: a compra errada confirmada em "Registrar assim mesmo" não vira o valor da próxima (vem em branco, com o aviso "ficou fora do comum")', c === 1 && v.value === '' &&
        /^A última \(R\$\s1\.045,00, \d\d\/\d\d\) ficou fora do comum: digite o valor/.test(dica) && !v.classList.contains('cad-igual') && document.activeElement === v, { c, valor: v.value, dica });
      fecha34b();
      cadComprei('ins', 'r3-cola');                                     // custo R$ 1,00; a última foi 10 un por R$ 10,00
      setCampo('valor', 100);
      $('#modal form').requestSubmit();
      await pausa(150);
      resposta33('Registrar assim mesmo');
      await pausa(300);
      const l = linhas32(d => d.insumoId === 'r3-cola' && d.valor === 100).map(x => x.d)[0] || {};
      cadComprei('ins', 'r3-cola');
      const vi = campoDoForm($('#modal form'), 'valor'), dicaI = dica34(vi);
      ok('Repor: a reposição errada confirmada assim mesmo também não vira o valor da próxima (o lançamento guarda o custo médio de antes)', l.custoAntes === 1 && vi.value === '' &&
        /^A última \(R\$\s100,00, \d\d\/\d\d\) ficou fora do comum: digite o valor/.test(dicaI), { l, valor: vi.value, dicaI });
      fecha34b();
    });
    await tenta(['Repor: o lançamento de antes da versão 19 de outro insumo cujo nome começa igual ("Ímã R3 (6x2 mm)") não vira a última reposição do "Ímã R3" (a descrição inteira precisa bater)'], async () => {
      const r = ['r3-ima', 'r3-ima6', 'r3-cx', 'r3-cxg'].map(id => { const u = ultimaReposicao(byId('insumos', id)); return u ? u.qtd + '/' + u.valor : '-'; }).join(' ');
      ok('Repor: o lançamento de antes da versão 19 de outro insumo cujo nome começa igual ("Ímã R3 (6x2 mm)") não vira a última reposição do "Ímã R3" (a descrição inteira precisa bater)', r === '20/30 100/90 50/100 30/60', r);
    });
    await tenta(['Já pedi: o Desfazer não apaga a marca que o outro aparelho pôs por cima no banco antes de o aviso dela chegar aqui (o banco confere o número da marca)',
      'Marcar tudo: o Desfazer tira as marcas deste aparelho e deixa a que o outro pôs por cima no banco (o aviso conta as duas coisas)',
      'Não veio: não tira a marca que o outro aparelho pôs de novo no banco (o aviso ainda não tinha chegado aqui)'], async () => {
      await assenta34(); limparAvisos();
      cadPedi('fil', 'r3-zero');
      await pausa(300); await assenta34();
      marcaOutro(201, 'filamentos', 'r3-zero', 'Bruno');                // este aparelho ainda não sabe
      desfazer33();
      await pausa(400); await assenta34();
      const b = noBanco('filamentos', 'r3-zero') || {}, t = byId('filamentos', 'r3-zero') || {};
      ok('Já pedi: o Desfazer não apaga a marca que o outro aparelho pôs por cima no banco antes de o aviso dela chegar aqui (o banco confere o número da marca)', b.pedidoPor === 'Bruno' && b.pedidoN === 201 &&
        t.pedidoPor === 'Bruno' && avisos32().some(x => /^PLA Zero R3 continua a caminho: Bruno marcou como pedido pouco antes\. Nada foi desfeito\./.test(x)), { b, t: [t.pedidoEm, t.pedidoPor], avisos: avisos32() });
      limparAvisos();
      cadMarcarTudo([{ t: 'fil', id: 'r3-pla' }, { t: 'fil', id: 'r3-erro' }, { t: 'ins', id: 'r3-arg' }]);
      await pausa(300); await assenta34();
      marcaOutro(202, 'filamentos', 'r3-erro', 'Bruno');                // este aparelho ainda não sabe
      desfazer33();
      await pausa(500); await assenta34();
      const m = [noBanco('filamentos', 'r3-pla'), noBanco('filamentos', 'r3-erro'), noBanco('insumos', 'r3-arg')].map(r => (r || {}).pedidoPor || '-').join();
      ok('Marcar tudo: o Desfazer tira as marcas deste aparelho e deixa a que o outro pôs por cima no banco (o aviso conta as duas coisas)', m === '-,Bruno,-' &&
        avisos32().some(x => /^Desfeito: 2 itens voltaram para a lista do que comprar\. PLA Erro R3 continua a caminho: Bruno marcou como pedido pouco antes\./.test(x)), { m, avisos: avisos32() });
      limparAvisos();
      marcaOutro(203, 'filamentos', 'r3-pla', 'Sócio', ha(60 * 48));
      await carregarTudo(true);
      marcaOutro(204, 'filamentos', 'r3-pla', 'Bruno');                 // este aparelho ainda não sabe
      cadNaoVeio('fil', 'r3-pla');
      await pausa(400); await assenta34();
      const nv = noBanco('filamentos', 'r3-pla') || {};
      ok('Não veio: não tira a marca que o outro aparelho pôs de novo no banco (o aviso ainda não tinha chegado aqui)', nv.pedidoPor === 'Bruno' && nv.pedidoN === 204 &&
        avisos32().some(x => /^PLA Dois Rolos R3 continua a caminho: Bruno marcou como pedido pouco antes\.✕$/.test(x)), { nv, avisos: avisos32() });
    });
    await tenta(['Não veio: o Desfazer não devolve a marca se a compra do item já entrou e chegou a este aparelho',
      'Não veio: o Desfazer não devolve a marca se a compra do item entrou no banco e ainda não chegou aqui (o banco confere o estoque)'], async () => {
      await assenta34(); limparAvisos();
      marcaOutro(211, 'filamentos', 'r3-zero', 'Sócio', ha(60 * 48));
      await carregarTudo(true);
      cadNaoVeio('fil', 'r3-zero');
      await pausa(300); await assenta34();
      chegadaOutro(212, 'r3-zero', 'r3-outro-c1');
      await carregarTudo(true);
      desfazer33();
      await pausa(300); await assenta34();
      const a = noBanco('filamentos', 'r3-zero') || {};
      ok('Não veio: o Desfazer não devolve a marca se a compra do item já entrou e chegou a este aparelho', !a.pedidoEm && !byId('filamentos', 'r3-zero').pedidoEm && avisos32().some(x => /^Isto já mudou depois\. Nada foi desfeito\./.test(x)), { a, avisos: avisos32() });
      limparAvisos();
      marcaOutro(213, 'filamentos', 'r3-zero', 'Sócio', ha(60 * 48));
      await carregarTudo(true);
      cadNaoVeio('fil', 'r3-zero');
      await pausa(300); await assenta34();
      chegadaOutro(214, 'r3-zero', 'r3-outro-c2');                      // este aparelho ainda não sabe
      desfazer33();
      await pausa(400); await assenta34();
      const b = noBanco('filamentos', 'r3-zero') || {};
      ok('Não veio: o Desfazer não devolve a marca se a compra do item entrou no banco e ainda não chegou aqui (o banco confere o estoque)', !b.pedidoEm && b.estoqueG === 2500 &&
        avisos32().some(x => /^Isto já mudou no outro aparelho: PLA Zero R3 não voltou para A caminho\./.test(x)), { b, avisos: avisos32() });
    });
    await tenta(['Chegou tudo: o que o outro aparelho registrou depois do toque fica de fora, com aviso (a compra dele não abre de novo)',
      'Chegou tudo: a chegada registrada no outro aparelho com a janela aberta pergunta antes de gravar, com o cursor em "Não registrar" (nada entra em dobro)'], async () => {
      await assenta34(); limparAvisos(); fecha34b();
      semMarcas();
      ['r3-ch1', 'r3-ch2', 'r3-ch3'].forEach((id, k) => { filR3(id, 'PLA Chegou ' + (k + 1) + ' R3', 100, 50 + k * 10); compR3(id + '-c0', id, 1000, 100, 12); });
      await pausa(300); await assenta34();
      ['r3-ch1', 'r3-ch2', 'r3-ch3'].forEach((id, k) => marcaOutro(221 + k, 'filamentos', id, 'Sócio', ha(60 * 50)));
      await carregarTudo(true);
      ir('compras'); render(); await pausa(200);
      const fila0 = materiaisParaComprar().caminho.map(m => m.id).join();
      cadChegouTudo();
      const j1 = txt34($('#modal.open h3')), f1 = (campoDoForm($('#modal form'), 'filamentoId') || {}).value;
      chegadaOutro(231, 'r3-ch2', 'r3-ch2-outro');                       // o outro registra a chegada do 2º, e o aviso chega aqui
      await carregarTudo(true);
      $('#modal form').requestSubmit();
      await pausa(150);
      const j2 = txt34($('#modal.open h3')), f2 = (campoDoForm($('#modal form'), 'filamentoId') || {}).value, compras2 = linhas32(d => d.filamentoId === 'r3-ch2').length;
      ok('Chegou tudo: o que o outro aparelho registrou depois do toque fica de fora, com aviso (a compra dele não abre de novo)', fila0 === 'r3-ch1,r3-ch2,r3-ch3' && j1 === 'Registrar compra de filamento (1 de 3)' &&
        f1 === 'r3-ch1' && j2 === 'Registrar compra de filamento (3 de 3)' && f2 === 'r3-ch3' && compras2 === 2 &&
        avisos32().some(x => /^Outro aparelho já registrou a chegada de PLA Chegou 2 R3 \(1 kg, R\$\s100,00\)\. Esta compra ficou de fora, para não entrar em dobro\./.test(x)), { fila0, j1, f1, j2, f2, compras2, avisos: avisos32() });
      chegadaOutro(232, 'r3-ch3', 'r3-ch3-outro', 95);                    // com a janela do 3º aberta
      await carregarTudo(true);
      await pausa(850);
      const antes = bancoTexto();
      $('#modal form').requestSubmit();
      await pausa(150);
      const pq = pergunta33(), ativo = document.activeElement && document.activeElement.textContent;
      resposta33('Não registrar');
      await pausa(300);
      ok('Chegou tudo: a chegada registrada no outro aparelho com a janela aberta pergunta antes de gravar, com o cursor em "Não registrar" (nada entra em dobro)', !!pq && pq.titulo === 'Confira a chegada' &&
        /^Outro aparelho já registrou a chegada de PLA Chegou 3 R3 \(1 kg, R\$\s95,00\)\. Registrar outra compra\?$/.test(pq.texto) && pq.botoes.join('|') === 'Registrar outra|Não registrar' &&
        ativo === 'Não registrar' && bancoTexto() === antes && !$('#modal.open') && linhas32(d => d.filamentoId === 'r3-ch3').length === 2, { pq, ativo, n: linhas32(d => d.filamentoId === 'r3-ch3').length });
    });
    await tenta(['Chegou com a tela parada: o item que o outro aparelho já registrou não abre a compra sem perguntar (o cursor em "Não registrar")'], async () => {
      await assenta34(); limparAvisos(); fecha34b();
      filR3('r3-par', 'PLA Parado R3', 100, 40); compR3('r3-par-c0', 'r3-par', 1000, 100, 12);
      await pausa(300); await assenta34();
      marcaOutro(241, 'filamentos', 'r3-par', 'Sócio', ha(60 * 50));
      await carregarTudo(true);
      ir('compras'); render(); await pausa(200);
      const bt = $$('#cad-comprar li button').find(b => b.textContent.trim() === 'Chegou' && b.dataset.id === 'r3-par');
      chegadaOutro(242, 'r3-par', 'r3-par-outro');                       // a tela daqui ainda não redesenhou: o botão continua ali
      await carregarTudo(true);
      const antes = linhas32(d => d.filamentoId === 'r3-par').length;
      if (bt) bt.click();
      await pausa(150);
      const pq = pergunta33(), form = !!$('#modal form'), ativo = document.activeElement && document.activeElement.textContent;
      if (pq) resposta33('Não registrar');
      await pausa(200);
      ok('Chegou com a tela parada: o item que o outro aparelho já registrou não abre a compra sem perguntar (o cursor em "Não registrar")', !!bt && !!pq && pq.titulo === 'Confira a chegada' &&
        /^Outro aparelho já registrou a chegada de PLA Parado R3 \(1 kg, R\$\s100,00\)\. Registrar outra compra\?$/.test(pq.texto) && !form && ativo === 'Não registrar' && !$('#modal.open') &&
        linhas32(d => d.filamentoId === 'r3-par').length === antes, { bt: !!bt, pq, form, ativo });
    });
    await tenta(['Chegou tudo abre só o que está em A caminho na tela: a linha marcada agora há pouco (no alto da lista, com desfazer) fica de fora'], async () => {
      await assenta34(); limparAvisos(); fecha34b();
      semMarcas();
      ['r3-cj1', 'r3-cj2', 'r3-cj3'].forEach((id, k) => { filR3(id, 'PLA Junto ' + (k + 1) + ' R3', 100, 30 + k); compR3(id + '-c0', id, 1000, 100, 12); });
      await pausa(300); await assenta34();
      marcaOutro(251, 'filamentos', 'r3-cj1', 'Sócio', ha(60 * 50)); marcaOutro(252, 'filamentos', 'r3-cj2', 'Sócio', ha(60 * 50));
      await carregarTudo(true);
      ir('painel'); render(); await pausa(200);
      cadPedi('fil', 'r3-cj3');
      await pausa(300);
      const caminhoNaTela = $$('#op-material .cad-grupo + .op-lista li', dom34(VIEWS.painel())).length;
      cadChegouTudo();
      const j = txt34($('#modal.open h3')), f = (campoDoForm($('#modal form'), 'filamentoId') || {}).value, resto = cadFilaChegou.map(x => x.id);
      ok('Chegou tudo abre só o que está em A caminho na tela: a linha marcada agora há pouco (no alto da lista, com desfazer) fica de fora', caminhoNaTela === 2 && j === 'Registrar compra de filamento (1 de 2)' &&
        ['r3-cj1', 'r3-cj2'].includes(f) && resto.length === 1 && !resto.includes('r3-cj3'), { caminhoNaTela, j, f, resto });
      fecha34b(); cadFilaChegou = [];
    });
    await tenta(['Marcar tudo: um item que o outro aparelho excluiu (o aviso ainda não chegou) fica de fora sozinho: os outros ficam marcados, e o aviso diz isso'], async () => {
      await assenta34(); limparAvisos(); fecha34b();
      filR3('r3-mt1', 'PLA Marcar 1 R3', 100, 20); filR3('r3-mt2', 'PLA Marcar 2 R3', 100, 21); insR3('r3-mt3', 'Fita Marcar R3', 1, 1, 5);
      await pausa(300); await assenta34();
      outroPC([{ n: 261, ops: [{ c: 'filamentos', i: 'r3-mt2', t: 'apagar', p: [] }] }]);   // este aparelho ainda não sabe
      cadMarcarTudo([{ t: 'fil', id: 'r3-mt1' }, { t: 'fil', id: 'r3-mt2' }, { t: 'ins', id: 'r3-mt3' }]);
      await pausa(500); await assenta34();
      const m = [noBanco('filamentos', 'r3-mt1'), noBanco('insumos', 'r3-mt3')].map(r => (r || {}).pedidoPor || '-').join();
      ok('Marcar tudo: um item que o outro aparelho excluiu (o aviso ainda não chegou) fica de fora sozinho: os outros ficam marcados, e o aviso diz isso', m === 'você,você' && !noBanco('filamentos', 'r3-mt2') &&
        avisos32().some(x => /^2 itens marcados como pedido\. PLA Marcar 2 R3 ficou de fora: outro aparelho excluiu pouco antes\.Desfazer$/.test(x)), { m, avisos: avisos32() });
    });
    await tenta(['O que comprar: com tudo já pedido, a lista diz que falta chegar (sem o visto de "tem material para a fila inteira")',
      'Painel: A caminho mostra os primeiros 5 e "Ver mais" (em Compras, todos)'], async () => {
      await assenta34(); limparAvisos(); fecha34b();
      for (let k = 1; k <= 7; k++) filR3('r3-v' + k, 'PLA Vários ' + k + ' R3', 100, 10 + k);
      await pausa(300); await assenta34();
      cadMarcarTudo(materiaisParaComprar().comprar.slice());
      await pausa(300); await assenta34();
      location.hash = 'compras'; await pausa(200); location.hash = 'painel'; await pausa(200);
      const s = $('#op-material', dom34(VIEWS.painel())), certo = s && $('.op-certo', s), n = materiaisParaComprar().caminho.length;
      ok('O que comprar: com tudo já pedido, a lista diz que falta chegar (sem o visto de "tem material para a fila inteira")', materiaisParaComprar().comprar.length === 0 && n > 0 && !!certo && !$('.op-i', certo) &&
        txt34(certo) === 'Tudo já foi pedido. Falta chegar o que está em A caminho.', { certo: certo && txt34(certo), n });
      const linhasP = s ? $$('.cad-grupo + .op-lista li', s).length : 0, verMais = s && $$('.cad-grupo button', s).find(b => b.getAttribute('onclick') === "opAlternarLista('caminho')");
      const linhasC = $$('#cad-comprar .cad-grupo + .op-lista li', dom34(VIEWS.compras())).length;
      opListaAberta.caminho = true; const abertas = $$('#op-material .cad-grupo + .op-lista li', dom34(VIEWS.painel())).length; opListaAberta.caminho = false;
      ok('Painel: A caminho mostra os primeiros 5 e "Ver mais" (em Compras, todos)', n >= 7 && linhasP === 5 && !!verMais && txt34(verMais) === 'Ver mais ' + (n - 5) && linhasC === n && abertas === n, { n, linhasP, linhasC, abertas, verMais: verMais && txt34(verMais) });
    });
    await tenta(['Filamentos, Insumos e Peças prontas: Acertar vem no fim da linha (Comprei, Editar, Excluir e o Vender continuam onde estavam na versão 18)',
      'Filamentos e Insumos: o Chegou da linha leva a marca vista na tela, e "pedido há N dias por ..." pode quebrar a linha na coluna do nome'], async () => {
      put('produtos', { id: 'r3-peca', nome: 'Peça R3', materiais: [], insumos: [], horas: 1, estoque: 4, precos: { direta: 10 } });
      await pausa(200);
      const fil = dom34(VIEWS.filamentos()), ins = dom34(VIEWS.insumos()), ven = dom34(VIEWS.vendas());
      const comAcertar = d => $$('tr', d).filter(tr => $$('button', tr).some(b => b.textContent.trim() === 'Acertar'));
      const rotulos = tr => $$('.rowbtns button', tr).map(b => b.textContent.trim());
      const fimDaLinha = d => comAcertar(d).length > 0 && comAcertar(d).every(tr => { const r = rotulos(tr); return r[r.length - 1] === 'Acertar' && $$('.rowbtns button', tr).pop().classList.contains('cad-acertar'); });
      const peca = comAcertar(ven).find(tr => /Peça R3/.test(tr.textContent));
      const r = { fil: fimDaLinha(fil) && comAcertar(fil).every(tr => rotulos(tr).join(' ').endsWith('Editar Excluir Acertar')), ins: fimDaLinha(ins) && comAcertar(ins).every(tr => rotulos(tr).join(' ').endsWith('Editar Excluir Acertar')),
        ven: fimDaLinha(ven) && !!peca && rotulos(peca).join(' ') === 'Vender Acertar' };
      ok('Filamentos, Insumos e Peças prontas: Acertar vem no fim da linha (Comprei, Editar, Excluir e o Vender continuam onde estavam na versão 18)', Object.values(r).every(Boolean), { r, peca: peca && rotulos(peca) });
      const marcado = S.filamentos.find(f => f.pedidoEm), linha = marcado && $$('tr', fil).find(tr => tr.querySelector(`button[data-id="${marcado.id}"]`)), ch = linha && $$('button', linha).find(b => b.textContent.trim() === 'Chegou');
      const insM = S.insumos.find(i => i.pedidoEm), linhaI = insM && $$('tr', ins).find(tr => tr.querySelector(`button[data-id="${insM.id}"]`)), chI = linhaI && $$('button', linhaI).find(b => b.textContent.trim() === 'Chegou');
      ok('Filamentos e Insumos: o Chegou da linha leva a marca vista na tela, e "pedido há N dias por ..." pode quebrar a linha na coluna do nome', !!ch && ch.dataset.em === marcado.pedidoEm && ch.dataset.t === 'fil' &&
        ch.getAttribute('onclick') === 'cadComprei(this.dataset.t, this.dataset.id, this.dataset.em)' && !!$('small.cad-pedido', linha) && !!chI && chI.dataset.em === insM.pedidoEm && chI.dataset.t === 'ins' && !!$('small.cad-pedido', linhaI),
        { ch: ch && ch.outerHTML.slice(0, 300), chI: chI && chI.outerHTML.slice(0, 300) });
    });
  }
  window.confirm = confirmarDeVerdade;
  await carregarTudo();

  // 29. persistência
  await new Promise(r => setTimeout(r, 400));
  const foto = () => JSON.stringify([S.filamentos, S.produtos, S.vendas, S.ordens, S.insumos, S.lancamentos, S.contas, S.pessoas].map(l => [...l].sort((a, b) => a.id.localeCompare(b.id))));
  const antes = foto();
  ok('sem pendências de gravação', !temPendencias(), [FILA.length, VOO.length]);
  await carregarTudo();
  ok('dados iguais depois de recarregar', antes === foto(), 0);

  localStorage.removeItem(DEMO_KEY); await carregarTudo(); render();
  const falhas = R.filter(x => x.startsWith('FALHOU'));
  console.log((falhas.length ? falhas.join('\n') + '\n' : '') + (R.length - falhas.length) + ' de ' + R.length + ' verificações passaram');
  return falhas;
})();
