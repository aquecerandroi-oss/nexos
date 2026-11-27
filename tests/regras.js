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
    'ordem igual: o cursor começa em "Criar mais uma" (o Enter cria, como o OK) e "Não criar" é o último botão (no celular, onde estava o Salvar)',
    'ordem igual: fechar a pergunta volta para a janela como estava', 'ordem igual: "Não criar" fecha a janela e avisa que nada entrou', 'ordem igual: "Criar mais uma" cria'], async () => {
    opNovaOrdem('prod-e1', '', 4);
    $('#modal form').requestSubmit();
    await pausa(100);
    const p = $('#modal .caixa.pergunta'), bs = p ? $$('.pergunta-botoes .btn', p) : [];
    ok('ordem igual: a janela pergunta com botões grandes, no lugar dela, antes de criar', !!p && $('#modal form').hidden && bs.length === 2 && S.ordens.filter(o => o.produtoId === 'prod-e1' && num(o.qtd) === 4).length === 1, !!p);
    ok('ordem igual: o cursor começa em "Criar mais uma" (o Enter cria, como o OK) e "Não criar" é o último botão (no celular, onde estava o Salvar)',
      document.activeElement === bs[0] && /Criar mais uma/.test(bs[0].textContent) && /Não criar/.test((bs[1] || {}).textContent || ''), [document.activeElement && document.activeElement.textContent, bs.map(b => b.textContent)]);
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
  window.confirm = m => { perguntas32.push(String(m)); return respostaConfirmar; };     // as perguntas do navegador nesta seção
  await tenta(['Desfazer: o Concluir mostra o botão Desfazer no aviso', 'Desfazer: com outra ordem imprimindo, pergunta antes de pôr as duas imprimindo (como o Iniciar)',
    'Desfazer: o banco volta exatamente ao que era, com a mesma hora de início',
    'Desfazer: se o outro aparelho mudou a ordem depois, nada é desfeito e o aviso explica', 'Desfazer: gravação recusada leva junto o aviso de sucesso e o Desfazer'], async () => {
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 3 }); iniciarOrdem(o);
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
    const o3 = novaOrdem({ produtoId: 'prod-e1b', qtd: 1 }); iniciarOrdem(o3);
    await pausa();
    const l3 = DBDemo._ler().linhas['ordens/' + o3.id];
    outroPC([{ n: 16, ops: [{ c: 'ordens', i: o3.id, t: 'mudar', se: l3.v, p: [{ s: { status: 'concluido', fim: hoje() } }] }] }]);
    opConcluir(o3.id);                                           // este PC ainda não sabe
    const tinha = $$('#toasts .toast.com-acao').length;
    await pausa(300);
    ok('Desfazer: gravação recusada leva junto o aviso de sucesso e o Desfazer', tinha === 1 && !$$('#toasts .toast.com-acao').length && avisos32().some(t => /Outro aparelho mudou a ordem/.test(t)), tinha);
  });
  await tenta(['Desfazer: se o outro aparelho já vendeu as peças que o Concluir pôs no estoque, pergunta antes (o estoque ficaria negativo); "Cancelar" deixa tudo como está'], async () => {
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 4 }); iniciarOrdem(o);
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
    const o = novaOrdem({ produtoId: 'prod-e1b', qtd: 2 }); iniciarOrdem(o);
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
