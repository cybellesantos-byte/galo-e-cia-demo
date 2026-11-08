// Os dados inventados com que a demonstração começa.
//
// Nada aqui é real: nomes, preços, bairros e vendas foram criados para a
// demonstração. O histórico de 30 dias é montado com as mesmas funções que a
// tela usa (abrir caixa, vender, pagar...), então os números batem entre si:
// o que aparece no caixa é o que aparece nos relatórios.
// O "sorteio" usa uma semente fixa: no mesmo dia, toda visita vê o mesmo histórico
// (o histórico acompanha a data de hoje, então muda de um dia para o outro).

import {
    abrirCaixa, arred, banco, cadastrarProduto, cancelarVenda, confirmarPagamento, criarDespesa,
    criarVenda, esperadoDe, fecharCaixa, novoId, pagarRepasses
} from './banco.js';

function sorteador(semente) {
    let estado = semente;
    return () => {
        estado = (estado + 0x6d2b79f5) | 0;
        let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const PRODUTOS_PASTELARIA = [
    ['Simples', 'Carne moída', 7.5, 3.0, 'Carne moída temperada com cebola e cheiro-verde'],
    ['Simples', 'Frango desfiado', 7.5, 2.9, 'Frango desfiado com tempero caseiro'],
    ['Simples', 'Pizza', 8.0, 3.2, 'Queijo, presunto e orégano'],
    ['Com queijo', 'Queijo', 8.5, 3.4, null],
    ['Com queijo', 'Carne com queijo', 9.5, 3.9, null],
    ['Com Catupiry', 'Frango com Catupiry', 10.0, 4.2, null],
    ['Com Catupiry', 'Camarão com Catupiry', 14.0, 6.5, 'Camarão refogado com Catupiry'],
    ['Com cheddar', 'Carne com cheddar', 10.0, 4.1, null],
    ['Com cheddar', 'Bacon com cheddar', 11.0, 4.8, null],
    ['Doces', 'Chocolate', 9.0, 3.5, 'Chocolate ao leite derretido'],
    ['Doces', 'Banana com canela', 8.5, 3.0, null],
    ['Bebidas', 'Refrigerante lata', 5.0, 3.0, null],
    ['Bebidas', 'Suco natural', 6.0, 2.4, 'Sabor do dia'],
    ['Bebidas', 'Água mineral', 3.0, 1.2, null]
];

const PRODUTOS_PEIXARIA = [
    ['Peixe', 'Tilápia inteira', 18.0, 11.0],
    ['Peixe', 'Tambaqui (costela)', 32.0, 22.0],
    ['Peixe', 'Pescada (filé)', 38.0, 26.0],
    ['Peixe', 'Sardinha', 15.0, 9.0],
    ['Frutos do mar', 'Camarão cinza', 55.0, 40.0],
    ['Frutos do mar', 'Lula', 42.0, 30.0]
];

const LOCAIS = [
    ['Centro', 3], ['Bairro das Flores', 5], ['Vila Nova', 6], ['Residencial Sol', 8], ['Sítio Boa Vista', 12]
];

export function semear() {
    const rng = sorteador(2026);
    const inteiro = (de, ate) => Math.floor(de + rng() * (ate - de + 1));
    const escolher = (lista) => lista[Math.floor(rng() * lista.length)];
    const hoje = new Date();
    const quandoDia = (diasAtras, hora, minuto = 0) =>
        new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasAtras, hora, minuto);
    const dataDoDia = (diasAtras) => {
        const d = quandoDia(diasAtras, 12);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // ── Equipe ──
    const ha = (dias) => quandoDia(dias, 8).toISOString();
    const [admin, bruno] = [
        { id: novoId('usuario'), username: 'admin', nome: 'Ana Souza', papel: 'ADMIN', ativo: true, criadoEm: ha(60), ultimoLoginEm: ha(0) },
        { id: novoId('usuario'), username: 'bruno', nome: 'Bruno Lima', papel: 'EQUIPE', ativo: true, criadoEm: ha(45), ultimoLoginEm: ha(1) }
    ];
    banco.usuarios.push(admin, bruno,
        { id: novoId('usuario'), username: 'carla', nome: 'Carla Mendes', papel: 'EQUIPE', ativo: true, criadoEm: ha(30), ultimoLoginEm: ha(3) },
        { id: novoId('usuario'), username: 'diego', nome: 'Diego Alves', papel: 'EQUIPE', ativo: false, criadoEm: ha(50), ultimoLoginEm: ha(20) });
    banco.usuarioLogado = admin;
    const operadores = [admin, bruno];

    // ── Produtos e locais de entrega ──
    for (const [categoria, nome, preco, custoEstimado, descricao] of PRODUTOS_PASTELARIA) {
        cadastrarProduto({ negocio: 'PASTELARIA', unidadeVenda: 'UNIDADE', nome, categoria, preco, custoEstimado, descricao });
    }
    for (const [categoria, nome, preco, custoEstimado] of PRODUTOS_PEIXARIA) {
        cadastrarProduto({ negocio: 'PEIXARIA', unidadeVenda: 'KG', nome, categoria, preco, custoEstimado, descricao: null });
    }
    for (const [nome, taxa] of LOCAIS) {
        banco.localidades.push({ id: novoId('localidade'), nome, taxa, ativo: true });
    }
    banco.localidades.push({ id: novoId('localidade'), nome: 'Distrito Leste', taxa: 15, ativo: false });

    // ── Loja (o cardápio público) ──
    // O número é de mentira: na demonstração o botão nunca abre o WhatsApp.
    banco.lojas.PASTELARIA = { negocio: 'PASTELARIA', aberta: true, whatsapp: '5500000000000', alteradoEm: ha(1), alteradoPor: admin.nome };
    banco.lojas.PEIXARIA = { negocio: 'PEIXARIA', aberta: false, whatsapp: null, alteradoEm: null, alteradoPor: null };

    // ── Montagem de uma venda sorteada ──
    function montarVenda(negocio) {
        const produtos = banco.produtos.filter((p) => p.negocio === negocio && p.ativo && p.disponivel);
        const quantos = negocio === 'PASTELARIA' ? inteiro(1, 4) : inteiro(1, 2);
        const escolhidos = [...produtos].sort(() => rng() - 0.5).slice(0, quantos);
        const itens = escolhidos.map((produto) => ({
            produtoId: produto.id,
            quantidade: negocio === 'PASTELARIA' ? inteiro(1, 3) : escolher([0.5, 1, 1.5, 2, 2.5, 3, 4])
        }));
        const subtotal = itens.reduce((s, i) => s + banco.produtos.find((p) => p.id === i.produtoId).preco * i.quantidade, 0);

        const origem = rng() < 0.3 ? 'WHATSAPP' : 'BALCAO';
        const entrega = negocio === 'PASTELARIA' && origem === 'WHATSAPP' && rng() < 0.65;
        const local = entrega ? escolher(banco.localidades.filter((l) => l.ativo)) : null;
        const total = subtotal + (local?.taxa ?? 0);
        const sorteio = rng();
        const formaPagamento = sorteio < 0.4 ? 'PIX' : sorteio < 0.8 ? 'DINHEIRO' : 'CARTAO';
        return {
            chaveDaVenda: `semente-${novoId('chave')}`,
            negocio,
            origem,
            tipo: entrega ? 'ENTREGA' : 'RETIRADA',
            localidadeId: local?.id ?? null,
            formaPagamento,
            valorRecebido: formaPagamento === 'DINHEIRO' ? Math.ceil(total / 10) * 10 : null,
            observacao: null,
            itens,
            taxaEntrega: null
        };
    }

    const despesasPastelaria = [
        ['Carne e frango para os recheios', 'INGREDIENTES', 90, 240],
        ['Massa de pastel e óleo', 'INGREDIENTES', 60, 150],
        ['Embalagens e guardanapos', 'EMBALAGENS', 35, 90],
        ['Botijão de gás', 'GAS_E_ENERGIA', 110, 120],
        ['Combustível da entrega', 'COMBUSTIVEL', 40, 80]
    ];

    // ── Histórico: um caixa fechado por dia e por negócio ──
    for (let atras = 29; atras >= 1; atras--) {
        const diaDaSemana = quandoDia(atras, 12).getDay();
        for (const negocio of ['PASTELARIA', 'PEIXARIA']) {
            if (negocio === 'PEIXARIA' && diaDaSemana === 0) continue;
            const horaFim = negocio === 'PASTELARIA' ? 18 : 14;
            const caixa = abrirCaixa({ negocio, saldoInicial: negocio === 'PASTELARIA' ? 150 : 100 }, admin, quandoDia(atras, 8));

            const vendas = [];
            const quantidade = negocio === 'PASTELARIA' ? inteiro(10, 20) : inteiro(5, 10);
            for (let i = 0; i < quantidade; i++) {
                const hora = inteiro(9, horaFim - 2);
                const venda = criarVenda(montarVenda(negocio), escolher(operadores), quandoDia(atras, hora, inteiro(0, 59)));
                if (venda.situacaoPagamento === 'PENDENTE') confirmarPagamento(venda.id);
                vendas.push(venda);
            }
            if (rng() < 0.05) cancelarVenda(escolher(vendas).id, { motivo: 'Cliente desistiu do pedido' });

            // Despesas do dia: dinheiro da gaveta quando cabe, senão Pix.
            const despesaDoDia = (descricao, categoria, valor, extra = {}) => {
                const cabeNaGaveta = valor <= esperadoDe(caixa) * 0.7;
                criarDespesa({
                    negocio, descricao, categoria, valor, data: dataDoDia(atras), responsavel: escolher(['Ana', 'Bruno']),
                    formaPagamento: cabeNaGaveta && rng() < 0.5 ? 'DINHEIRO' : 'PIX', ...extra
                }, escolher(operadores), quandoDia(atras, 10));
            };
            if (negocio === 'PASTELARIA' && rng() < 0.55) {
                const [descricao, categoria, minimo, maximo] = escolher(despesasPastelaria);
                despesaDoDia(descricao, categoria, inteiro(minimo, maximo));
            }
            if (negocio === 'PEIXARIA' && [2, 5].includes(diaDaSemana)) {
                const itens = [
                    { descricao: 'Tilápia', quantidade: inteiro(20, 35), unidade: 'KG', precoUnitario: 11 },
                    { descricao: 'Tambaqui', quantidade: inteiro(10, 20), unidade: 'KG', precoUnitario: 21 }
                ];
                const pesoKg = itens.reduce((s, i) => s + i.quantidade, 0);
                despesaDoDia('Compra de peixe no atacado', 'COMPRA_DE_PEIXE', 0, { itens, pesoKg, formaPagamento: 'PIX' });
            }
            if (negocio === 'PEIXARIA' && rng() < 0.3) despesaDoDia('Gelo e sacos plásticos', 'EMBALAGENS', inteiro(25, 60));

            // Entregas de mais de uma semana atrás já foram repassadas ao entregador.
            if (negocio === 'PASTELARIA' && atras >= 5) {
                const aPagar = banco.repasses.filter((r) => r.situacao === 'PENDENTE' && vendas.some((v) => v.id === r.vendaId));
                if (aPagar.length > 0) pagarRepasses({ ids: aPagar.map((r) => r.id), formaPagamento: 'PIX' }, admin, quandoDia(atras, 18));
            }

            const esperado = esperadoDe(caixa);
            const erro = escolher([0, 0, 0, 0, 0, -1, 2, -5]);
            fecharCaixa(caixa.id, { valorContado: Math.max(0, arred(esperado + erro)), observacao: null }, admin, quandoDia(atras, horaFim));
        }
    }

    // ── Hoje: a pastelaria está com o caixa aberto; a peixaria ainda não abriu ──
    const abertura = new Date(hoje.getTime() - 5 * 3600 * 1000);
    abrirCaixa({ negocio: 'PASTELARIA', saldoInicial: 150 }, admin, abertura);
    for (let i = 0; i < 9; i++) {
        const quando = new Date(abertura.getTime() + (i + 1) * ((hoje - abertura) / 11));
        const dados = montarVenda('PASTELARIA');
        // Uma entrega pelo WhatsApp, paga no Pix, para sobrar um repasse pendente ao entregador.
        if (i === 6) {
            Object.assign(dados, {
                tipo: 'ENTREGA', origem: 'WHATSAPP', localidadeId: banco.localidades[1].id, formaPagamento: 'PIX', valorRecebido: null
            });
        }
        const venda = criarVenda(dados, escolher(operadores), quando);
        if (venda.situacaoPagamento === 'PENDENTE' && i < 4) confirmarPagamento(venda.id);
    }
    criarDespesa({
        negocio: 'PASTELARIA', descricao: 'Conta de energia', categoria: 'GAS_E_ENERGIA', valor: 214.9,
        data: dataDoDia(0), responsavel: 'Ana', formaPagamento: null
    }, admin, abertura);
    criarDespesa({
        negocio: 'PASTELARIA', descricao: 'Embalagens e guardanapos', categoria: 'EMBALAGENS', valor: 48,
        data: dataDoDia(0), responsavel: 'Bruno', formaPagamento: 'DINHEIRO'
    }, bruno, abertura);

    // Para mostrar o "esgotado" no cardápio e um produto desativado em Produtos.
    banco.produtos.find((p) => p.nome === 'Camarão com Catupiry').disponivel = false;
    const nutella = cadastrarProduto({
        negocio: 'PASTELARIA', unidadeVenda: 'UNIDADE', nome: 'Nutella com morango', categoria: 'Doces', preco: 12, custoEstimado: 5.5, descricao: null
    });
    nutella.ativo = false;
}
