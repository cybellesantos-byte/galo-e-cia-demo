// O "banco de dados" da demonstração e as regras de negócio, tudo na memória.
//
// Cada função aqui faz o que o servidor Java faz no sistema real: confere o
// pedido, aplica a regra e devolve o resultado, ou um ErroApi com a mensagem
// que a tela mostra para a pessoa. Os dados começam vazios; quem os enche é
// semente.js, usando estas mesmas funções (por isso tudo fica coerente).

import { ErroApi } from './erro.js';

// ── Pequenas ajudas ──────────────────────────────────────────────────────────

/** Arredonda sem os erros de conta do JavaScript (0.1 + 0.2). */
export function arred(numero, casas = 2) {
    const fator = 10 ** casas;
    return Math.round((numero + Number.EPSILON) * fator) / fator;
}

export const soma = (lista, campo) => arred(lista.reduce((total, item) => total + campo(item), 0), 3);

const dois = (n) => String(n).padStart(2, '0');

/** "2026-11-08": a data, no relógio do navegador, de um instante. */
export function dataLocal(instante) {
    const d = new Date(instante);
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export const REGEX_WHATSAPP = /^55\d{10,11}$/;

/** Uma data "2026-11-08" está entre o início e o fim (inclusive)? Datas nesse formato comparam como texto. */
export const noPeriodoDaData = (data, inicio, fim) => data >= inicio && data <= fim;

// ── O banco ──────────────────────────────────────────────────────────────────

export const banco = {
    usuarioLogado: null,
    contadores: {},
    usuarios: [],
    produtos: [],
    localidades: [],
    lojas: {},
    caixas: [],
    vendas: [],
    despesas: [],
    repasses: [],
    chavesDeVenda: new Map()
};

export function novoId(tipo) {
    banco.contadores[tipo] = (banco.contadores[tipo] ?? 0) + 1;
    return banco.contadores[tipo];
}

function exigir(condicao, mensagem, status = 422) {
    if (!condicao) throw new ErroApi(status, mensagem);
}

const nomeDe = (usuario) => usuario?.nome ?? 'Sistema';

// ── Caixa ────────────────────────────────────────────────────────────────────

export const caixaAberto = (negocio) => banco.caixas.find((c) => c.negocio === negocio && c.aberto) ?? null;

function achar(lista, id, nomeDaCoisa) {
    const item = lista.find((x) => x.id === Number(id));
    if (!item) throw new ErroApi(404, `${nomeDaCoisa} não encontrado.`);
    return item;
}

/** A conta aberta do "esperado na gaveta": parcela por parcela. */
export function composicao(caixa) {
    const movimentos = caixa.movimentacoes;
    const reforcos = soma(movimentos.filter((m) => m.tipo === 'REFORCO'), (m) => m.valor);
    const sangrias = soma(movimentos.filter((m) => m.tipo === 'SANGRIA'), (m) => m.valor);
    const vendasDinheiro = soma(
        banco.vendas.filter((v) => v.caixaId === caixa.id && !v.cancelada && v.formaPagamento === 'DINHEIRO'),
        (v) => v.total
    );
    const despesas = soma(
        banco.despesas.filter((d) => d.caixaId === caixa.id && d.situacao === 'PAGO'),
        (d) => d.valor
    );
    const repasses = soma(
        banco.repasses.filter((r) => r.caixaId === caixa.id && r.situacao === 'PAGO'),
        (r) => r.valor
    );
    return { saldoInicial: caixa.saldoInicial, reforcos, sangrias, vendasDinheiro, despesas, repasses };
}

export function esperadoDe(caixa) {
    const c = composicao(caixa);
    return arred(c.saldoInicial + c.reforcos - c.sangrias + c.vendasDinheiro - c.despesas - c.repasses);
}

export function respostaCaixa(caixa) {
    return {
        id: caixa.id,
        negocio: caixa.negocio,
        aberto: caixa.aberto,
        saldoInicial: caixa.saldoInicial,
        abertoEm: caixa.abertoEm,
        abertoPor: caixa.abertoPor,
        fechadoEm: caixa.fechadoEm,
        fechadoPor: caixa.fechadoPor,
        esperado: caixa.aberto ? esperadoDe(caixa) : caixa.esperado,
        composicao: caixa.aberto ? composicao(caixa) : null,
        valorContado: caixa.valorContado,
        diferenca: caixa.diferenca,
        observacaoFechamento: caixa.observacaoFechamento,
        movimentacoes: caixa.movimentacoes
    };
}

export function abrirCaixa({ negocio, saldoInicial }, usuario, quando = new Date()) {
    exigir(['PASTELARIA', 'PEIXARIA'].includes(negocio), 'Escolha o negócio.');
    exigir(Number.isFinite(saldoInicial) && saldoInicial >= 0, 'O saldo inicial não pode ser negativo.');
    exigir(!caixaAberto(negocio), 'Já existe um caixa aberto para este negócio.', 409);
    const caixa = {
        id: novoId('caixa'),
        negocio,
        aberto: true,
        saldoInicial: arred(saldoInicial),
        abertoEm: quando.toISOString(),
        abertoPor: nomeDe(usuario),
        fechadoEm: null,
        fechadoPor: null,
        esperado: null,
        valorContado: null,
        diferenca: null,
        observacaoFechamento: null,
        movimentacoes: []
    };
    banco.caixas.push(caixa);
    return caixa;
}

export function movimentarCaixa(caixaId, tipo, { valor, observacao }, usuario, quando = new Date()) {
    const caixa = achar(banco.caixas, caixaId, 'Caixa');
    exigir(caixa.aberto, 'Este caixa já está fechado.', 409);
    exigir(Number.isFinite(valor) && valor >= 0.01, 'Informe um valor maior que zero.');
    if (tipo === 'SANGRIA') {
        exigir(valor <= esperadoDe(caixa), 'Não há dinheiro suficiente na gaveta para essa sangria.');
    }
    caixa.movimentacoes.push({
        id: novoId('movimento'),
        tipo,
        valor: arred(valor),
        quando: quando.toISOString(),
        usuario: nomeDe(usuario),
        observacao: observacao?.trim() || null
    });
    return caixa;
}

export function fecharCaixa(caixaId, { valorContado, observacao }, usuario, quando = new Date()) {
    const caixa = achar(banco.caixas, caixaId, 'Caixa');
    exigir(caixa.aberto, 'Este caixa já está fechado.', 409);
    exigir(Number.isFinite(valorContado) && valorContado >= 0, 'Informe o valor contado na gaveta.');
    const esperado = esperadoDe(caixa);
    caixa.esperado = esperado;
    caixa.valorContado = arred(valorContado);
    caixa.diferenca = arred(valorContado - esperado);
    caixa.observacaoFechamento = observacao?.trim() || null;
    caixa.fechadoEm = quando.toISOString();
    caixa.fechadoPor = nomeDe(usuario);
    caixa.aberto = false;
    // O esperado gravado no fechamento vale daqui para frente.
    caixa.composicaoFinal = composicao(caixa);
    return caixa;
}

// ── Produtos e loja ──────────────────────────────────────────────────────────

export const respostaProduto = (p) => ({
    id: p.id,
    negocio: p.negocio,
    nome: p.nome,
    categoria: p.categoria,
    unidadeVenda: p.unidadeVenda,
    preco: p.preco,
    custoEstimado: p.custoEstimado,
    descricao: p.descricao,
    ativo: p.ativo,
    disponivel: p.disponivel
});

function validarProduto(dados, ignorarId = null) {
    exigir(dados.nome?.trim(), 'Informe o nome do produto.');
    exigir(dados.categoria?.trim(), 'Informe a categoria.');
    exigir(Number.isFinite(dados.preco) && dados.preco >= 0.01, 'O preço precisa ser maior que zero.');
    exigir(dados.custoEstimado == null || dados.custoEstimado >= 0, 'O custo não pode ser negativo.');
    exigir((dados.descricao ?? '').length <= 200, 'A descrição pode ter no máximo 200 caracteres.');
    const nome = dados.nome.trim().toLowerCase();
    exigir(
        !banco.produtos.some((p) => p.id !== ignorarId && p.negocio === dados.negocio && p.nome.toLowerCase() === nome),
        'Já existe um produto com esse nome.',
        409
    );
}

export function cadastrarProduto(dados) {
    exigir(['PASTELARIA', 'PEIXARIA'].includes(dados.negocio), 'Escolha o negócio.');
    validarProduto(dados);
    const produto = {
        id: novoId('produto'),
        negocio: dados.negocio,
        nome: dados.nome.trim(),
        categoria: dados.categoria.trim(),
        unidadeVenda: dados.unidadeVenda,
        preco: arred(dados.preco),
        custoEstimado: dados.custoEstimado == null ? null : arred(dados.custoEstimado),
        descricao: dados.descricao?.trim() || null,
        ativo: true,
        disponivel: true
    };
    banco.produtos.push(produto);
    return produto;
}

export function alterarProduto(id, dados) {
    const produto = achar(banco.produtos, id, 'Produto');
    validarProduto({ ...dados, negocio: produto.negocio }, produto.id);
    Object.assign(produto, {
        nome: dados.nome.trim(),
        categoria: dados.categoria.trim(),
        preco: arred(dados.preco),
        custoEstimado: dados.custoEstimado == null ? null : arred(dados.custoEstimado),
        descricao: dados.descricao?.trim() || null
    });
    return produto;
}

// ── Vendas ───────────────────────────────────────────────────────────────────

export function respostaVenda(v) {
    return {
        id: v.id,
        caixaId: v.caixaId,
        origem: v.origem,
        tipo: v.tipo,
        localidadeId: v.localidadeId,
        taxaPadrao: v.taxaPadrao,
        taxaEntrega: v.taxaEntrega,
        subtotal: v.subtotal,
        total: v.total,
        formaPagamento: v.formaPagamento,
        situacaoPagamento: v.situacaoPagamento,
        valorRecebido: v.valorRecebido,
        troco: v.troco,
        observacao: v.observacao,
        cancelada: v.cancelada,
        motivoCancelamento: v.motivoCancelamento,
        criadoEm: v.criadoEm,
        criadoPor: v.criadoPor,
        itens: v.itens
    };
}

/**
 * Quem decide preço, taxa e total é o sistema, nunca a tela: o preço do produto
 * e a taxa da localidade são copiados para a venda no momento em que ela é feita.
 */
export function criarVenda(dados, usuario, quando = new Date()) {
    // A mesma chave devolve a mesma venda: clicar duas vezes não vende duas vezes.
    if (dados.chaveDaVenda && banco.chavesDeVenda.has(dados.chaveDaVenda)) {
        return banco.chavesDeVenda.get(dados.chaveDaVenda);
    }
    const caixa = caixaAberto(dados.negocio);
    exigir(caixa, 'Abra o caixa antes de vender.', 409);
    exigir(Array.isArray(dados.itens) && dados.itens.length > 0, 'Escolha pelo menos um item.');

    const itens = dados.itens.map(({ produtoId, quantidade }) => {
        const produto = achar(banco.produtos, produtoId, 'Produto');
        exigir(produto.negocio === dados.negocio, 'Esse produto é de outro negócio.');
        exigir(produto.ativo, `${produto.nome} está desativado.`);
        exigir(produto.disponivel, `${produto.nome} está esgotado.`);
        exigir(Number.isFinite(quantidade) && quantidade > 0, 'A quantidade precisa ser maior que zero.');
        exigir(
            produto.unidadeVenda === 'KG' || Number.isInteger(quantidade),
            `${produto.nome} é vendido por unidade inteira.`
        );
        return {
            produtoId: produto.id,
            nome: produto.nome,
            precoUnitario: produto.preco,
            quantidade: arred(quantidade, 3),
            total: arred(produto.preco * quantidade)
        };
    });
    const subtotal = soma(itens, (i) => i.total);

    let localidade = null;
    let taxaPadrao = null;
    let taxa = 0;
    if (dados.tipo === 'ENTREGA') {
        localidade = achar(banco.localidades, dados.localidadeId, 'Local de entrega');
        exigir(localidade.ativo, 'Esse local de entrega está desativado.');
        taxaPadrao = localidade.taxa;
        taxa = dados.taxaEntrega ?? taxaPadrao;
        exigir(taxa >= 0, 'A taxa de entrega não pode ser negativa.');
    } else {
        exigir(dados.taxaEntrega == null, 'Venda para retirada não tem taxa de entrega.');
    }
    const total = arred(subtotal + taxa);

    // Pix e cartão ficam pendentes até confirmar. Dinheiro: o valor recebido cobre o total e a diferença é o troco.
    let situacao = 'PENDENTE';
    let recebido = null;
    let troco = null;
    if (dados.formaPagamento === 'DINHEIRO') {
        exigir(Number.isFinite(dados.valorRecebido), 'Informe o valor recebido em dinheiro.');
        exigir(dados.valorRecebido >= total, 'O valor recebido não cobre o total da venda.');
        situacao = 'PAGO';
        recebido = arred(dados.valorRecebido);
        troco = arred(recebido - total);
    }

    const venda = {
        id: novoId('venda'),
        negocio: dados.negocio,
        caixaId: caixa.id,
        origem: dados.origem,
        tipo: dados.tipo,
        localidadeId: localidade?.id ?? null,
        taxaPadrao,
        taxaEntrega: dados.tipo === 'ENTREGA' ? arred(taxa) : null,
        subtotal,
        total,
        formaPagamento: dados.formaPagamento,
        situacaoPagamento: situacao,
        valorRecebido: recebido,
        troco,
        observacao: dados.observacao?.trim() || null,
        cancelada: false,
        motivoCancelamento: null,
        criadoEm: quando.toISOString(),
        criadoPor: nomeDe(usuario),
        itens
    };
    banco.vendas.push(venda);
    if (dados.chaveDaVenda) banco.chavesDeVenda.set(dados.chaveDaVenda, venda);

    // Entrega gera, junto, o valor a repassar ao entregador.
    if (venda.tipo === 'ENTREGA') {
        banco.repasses.push({
            id: novoId('repasse'),
            vendaId: venda.id,
            localidade: localidade.nome,
            valor: arred(Math.max(taxaPadrao, taxa)),
            dataEntrega: dataLocal(quando),
            situacao: 'PENDENTE',
            formaPagamento: null,
            pagoEm: null,
            pagoPor: null,
            caixaId: null,
            criadoEm: quando.toISOString()
        });
    }
    return venda;
}

export function confirmarPagamento(vendaId) {
    const venda = achar(banco.vendas, vendaId, 'Venda');
    exigir(!venda.cancelada, 'Esta venda foi cancelada.', 409);
    exigir(venda.situacaoPagamento === 'PENDENTE', 'O pagamento desta venda já foi confirmado.', 409);
    venda.situacaoPagamento = 'PAGO';
    return venda;
}

export function cancelarVenda(vendaId, { motivo }) {
    const venda = achar(banco.vendas, vendaId, 'Venda');
    exigir(!venda.cancelada, 'Esta venda já foi cancelada.', 409);
    exigir(motivo?.trim(), 'Informe o motivo do cancelamento.');
    const repasse = banco.repasses.find((r) => r.vendaId === venda.id);
    exigir(
        !repasse || repasse.situacao !== 'PAGO',
        'Esta entrega já foi repassada ao entregador e não pode ser cancelada.',
        409
    );
    if (repasse) repasse.situacao = 'CANCELADO';
    venda.cancelada = true;
    venda.motivoCancelamento = motivo.trim();
    return venda;
}

// ── Despesas ─────────────────────────────────────────────────────────────────

export function respostaDespesa(d) {
    return {
        id: d.id,
        negocio: d.negocio,
        descricao: d.descricao,
        categoria: d.categoria,
        valor: d.valor,
        data: d.data,
        responsavel: d.responsavel,
        situacao: d.situacao,
        formaPagamento: d.formaPagamento,
        pagoEm: d.pagoEm,
        caixaId: d.caixaId,
        pesoKg: d.pesoKg,
        observacao: d.observacao,
        criadoEm: d.criadoEm,
        criadoPor: d.criadoPor,
        itens: d.itens
    };
}

/** Dinheiro sai da gaveta do caixa aberto do negócio; Pix e cartão não mexem na gaveta. */
function pagarDespesaInterna(despesa, forma, quando) {
    let caixaId = null;
    if (forma === 'DINHEIRO') {
        const caixa = caixaAberto(despesa.negocio);
        exigir(caixa, 'Abra o caixa para pagar em dinheiro.', 409);
        exigir(despesa.valor <= esperadoDe(caixa), 'Não há dinheiro suficiente na gaveta para pagar essa despesa.');
        caixaId = caixa.id;
    }
    despesa.situacao = 'PAGO';
    despesa.formaPagamento = forma;
    despesa.pagoEm = quando.toISOString();
    despesa.caixaId = caixaId;
}

export function criarDespesa(dados, usuario, quando = new Date()) {
    exigir(['PASTELARIA', 'PEIXARIA'].includes(dados.negocio), 'Escolha o negócio.');
    exigir(dados.descricao?.trim(), 'Informe a descrição.');
    exigir(dados.categoria, 'Escolha a categoria.');
    exigir(dados.data, 'Informe a data.');
    exigir(dados.responsavel?.trim(), 'Informe quem comprou ou pagou.');

    const itens = (dados.itens ?? []).map((item) => {
        exigir(item.descricao?.trim(), 'Cada item precisa de descrição.');
        exigir(item.quantidade > 0, 'A quantidade de cada item precisa ser maior que zero.');
        return {
            id: novoId('item-despesa'),
            descricao: item.descricao.trim(),
            quantidade: arred(item.quantidade, 3),
            unidade: item.unidade,
            precoUnitario: arred(item.precoUnitario),
            total: arred(item.quantidade * item.precoUnitario)
        };
    });
    const valor = itens.length > 0 ? soma(itens, (i) => i.total) : dados.valor;
    exigir(Number.isFinite(valor) && valor >= 0.01, 'Informe o valor da despesa.');

    const despesa = {
        id: novoId('despesa'),
        negocio: dados.negocio,
        descricao: dados.descricao.trim(),
        categoria: dados.categoria,
        valor: arred(valor),
        data: dados.data,
        responsavel: dados.responsavel.trim(),
        situacao: 'PENDENTE',
        formaPagamento: null,
        pagoEm: null,
        caixaId: null,
        pesoKg: dados.pesoKg == null ? null : arred(dados.pesoKg, 3),
        observacao: dados.observacao?.trim() || null,
        criadoEm: quando.toISOString(),
        criadoPor: nomeDe(usuario),
        itens
    };
    if (dados.formaPagamento) pagarDespesaInterna(despesa, dados.formaPagamento, quando);
    banco.despesas.push(despesa);
    return despesa;
}

export function pagarDespesa(id, { formaPagamento }, quando = new Date()) {
    const despesa = achar(banco.despesas, id, 'Despesa');
    exigir(despesa.situacao === 'PENDENTE', 'Esta despesa já foi paga.', 409);
    exigir(formaPagamento, 'Escolha a forma de pagamento.');
    pagarDespesaInterna(despesa, formaPagamento, quando);
    return despesa;
}

// ── Repasses ao entregador ───────────────────────────────────────────────────

export const respostaRepasse = (r) => ({ ...r });

export function pagarRepasses({ ids, formaPagamento }, usuario, quando = new Date()) {
    exigir(Array.isArray(ids) && ids.length > 0, 'Escolha pelo menos uma entrega.');
    exigir(formaPagamento, 'Escolha a forma de pagamento.');
    const escolhidos = ids.map((id) => achar(banco.repasses, id, 'Entrega'));
    for (const r of escolhidos) {
        exigir(r.situacao === 'PENDENTE', `Nenhuma entrega foi paga: a entrega ${r.id} já foi paga ou foi cancelada.`, 409);
    }
    const total = soma(escolhidos, (r) => r.valor);
    let caixaId = null;
    if (formaPagamento === 'DINHEIRO') {
        const caixa = caixaAberto('PASTELARIA');
        exigir(caixa, 'Abra o caixa da pastelaria para pagar o entregador em dinheiro.', 409);
        exigir(total <= esperadoDe(caixa), 'Não há dinheiro suficiente na gaveta para esse pagamento.');
        caixaId = caixa.id;
    }
    for (const r of escolhidos) {
        r.situacao = 'PAGO';
        r.formaPagamento = formaPagamento;
        r.pagoEm = quando.toISOString();
        r.pagoPor = nomeDe(usuario);
        r.caixaId = caixaId;
    }
    return { quantidade: escolhidos.length, total, repasses: escolhidos.map(respostaRepasse) };
}

// ── Equipe ───────────────────────────────────────────────────────────────────

export const respostaUsuario = (u) => ({
    id: u.id,
    username: u.username,
    nome: u.nome,
    papel: u.papel,
    ativo: u.ativo,
    criadoEm: u.criadoEm,
    ultimoLoginEm: u.ultimoLoginEm
});

export function cadastrarUsuario({ username, nome, senha, papel }, quando = new Date()) {
    exigir(username?.trim(), 'Informe o usuário.');
    exigir(nome?.trim(), 'Informe o nome.');
    exigir(['ADMIN', 'EQUIPE'].includes(papel), 'Escolha o perfil.');
    exigir((senha ?? '').length >= 12, 'A senha precisa ter pelo menos 12 caracteres.');
    const chave = username.trim().toLowerCase();
    exigir(!banco.usuarios.some((u) => u.username === chave), 'Já existe uma pessoa com esse usuário.', 409);
    const usuario = {
        id: novoId('usuario'),
        username: chave,
        nome: nome.trim(),
        papel,
        ativo: true,
        criadoEm: quando.toISOString(),
        ultimoLoginEm: null
    };
    banco.usuarios.push(usuario);
    return usuario;
}
