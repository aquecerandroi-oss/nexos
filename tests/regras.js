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

  // 29. persistência
  await new Promise(r => setTimeout(r, 400));
  const foto = () => JSON.stringify([S.filamentos, S.produtos, S.vendas, S.ordens, S.insumos, S.lancamentos, S.contas, S.pessoas].map(l => [...l].sort((a, b) => a.id.localeCompare(b.id))));
  const antes = foto();
  ok('sem pendências de gravação', !temPendencias(), [PEND.size, PEND_DEL.size]);
  await carregarTudo();
  ok('dados iguais depois de recarregar', antes === foto(), 0);

  localStorage.removeItem(DEMO_KEY); await carregarTudo(); render();
  const falhas = R.filter(x => x.startsWith('FALHOU'));
  console.log((falhas.length ? falhas.join('\n') + '\n' : '') + (R.length - falhas.length) + ' de ' + R.length + ' verificações passaram');
  return falhas;
})();
