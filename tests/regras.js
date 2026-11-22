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

  // 16. persistência
  await new Promise(r => setTimeout(r, 400));
  const foto = () => JSON.stringify([S.filamentos, S.produtos, S.vendas, S.ordens, S.insumos, S.lancamentos].map(l => [...l].sort((a, b) => a.id.localeCompare(b.id))));
  const antes = foto();
  ok('sem pendências de gravação', !temPendencias(), [PEND.size, PEND_DEL.size]);
  await carregarTudo();
  ok('dados iguais depois de recarregar', antes === foto(), 0);

  localStorage.removeItem(DEMO_KEY); await carregarTudo(); render();
  const falhas = R.filter(x => x.startsWith('FALHOU'));
  console.log((falhas.length ? falhas.join('\n') + '\n' : '') + (R.length - falhas.length) + ' de ' + R.length + ' verificações passaram');
  return falhas;
})();
