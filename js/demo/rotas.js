// A "recepção" do servidor de mentira: recebe o endereço (ex.: POST /api/vendas),
// descobre qual regra do banco.js atende e devolve a resposta no mesmo formato
// do sistema real.

import { ErroApi } from './erro.js';
import {
    abrirCaixa, alterarProduto, arred, banco, cadastrarProduto, cadastrarUsuario, cancelarVenda, caixaAberto,
    confirmarPagamento, criarDespesa, criarVenda, fecharCaixa, movimentarCaixa, noPeriodoDaData, pagarDespesa,
    pagarRepasses, REGEX_WHATSAPP, respostaCaixa, respostaDespesa, respostaProduto, respostaRepasse,
    respostaUsuario, respostaVenda, soma
} from './banco.js';
import {
    comprasMensaisPeixaria, relatorioGeral, relatorioPastelaria, relatorioPeixaria, resumoRepasses
} from './relatorios.js';
import { semear } from './semente.js';

semear();

// ── Ajudas ───────────────────────────────────────────────────────────────────

const rotas = [];

function rota(metodo, padrao, funcao) {
    rotas.push({ metodo, regex: new RegExp(`^${padrao}$`), funcao });
}

function exigir(condicao, mensagem, status = 422) {
    if (!condicao) throw new ErroApi(status, mensagem);
}

/** Quem está logado; sem ninguém, o mesmo "faça login" do sistema real. */
function logado() {
    if (!banco.usuarioLogado) throw new ErroApi(401, 'Faça login para continuar.');
    return banco.usuarioLogado;
}

/** Relatórios e equipe são só do administrador. */
function administrador() {
    const usuario = logado();
    if (usuario.papel !== 'ADMIN') throw new ErroApi(403, 'Acesso negado.');
    return usuario;
}

function achar(lista, id, nome) {
    const item = lista.find((x) => x.id === Number(id));
    if (!item) throw new ErroApi(404, `${nome} não encontrado.`);
    return item;
}

const negocioDaConsulta = (consulta) => {
    const negocio = consulta.get('negocio');
    exigir(['PASTELARIA', 'PEIXARIA'].includes(negocio), 'Escolha o negócio.');
    return negocio;
};

/** O corpo "feio" que a tela pode mandar (vazio, nulo) vira um objeto, para não quebrar. */
const corpoDe = (corpo) => corpo ?? {};

export function atender(metodo, caminho, corpo) {
    const url = new URL(caminho, 'http://demonstracao.local');
    for (const candidata of rotas) {
        if (candidata.metodo !== metodo) continue;
        const encontrada = candidata.regex.exec(url.pathname);
        if (encontrada) return candidata.funcao(encontrada, url.searchParams, corpo);
    }
    throw new ErroApi(404, 'Esse endereço não existe na demonstração.');
}

// ── Entrar e sair ────────────────────────────────────────────────────────────
// Na demonstração, qualquer senha entra. O usuário "bruno" entra como equipe;
// qualquer outro entra como administrador.

const usuarioLogadoResposta = (u) => ({ username: u.username, nome: u.nome, papel: u.papel });

rota('GET', '/api/auth/me', () => usuarioLogadoResposta(logado()));

rota('POST', '/api/auth/login', (_, __, corpo) => {
    const { username, senha } = corpoDe(corpo);
    exigir(username?.trim() && senha, 'Informe o usuário e a senha.');
    const encontrado = banco.usuarios.find((u) => u.username === username.trim().toLowerCase());
    exigir(!encontrado || encontrado.ativo, 'Usuário ou senha inválidos.', 401);
    banco.usuarioLogado = encontrado ?? banco.usuarios[0];
    return usuarioLogadoResposta(banco.usuarioLogado);
});

rota('POST', '/api/auth/logout', () => {
    banco.usuarioLogado = null;
    return null;
});

rota('PUT', '/api/auth/senha', (_, __, corpo) => {
    logado();
    const { senhaAtual, senhaNova } = corpoDe(corpo);
    exigir(senhaAtual, 'Informe a senha atual.');
    exigir((senhaNova ?? '').length >= 12, 'A senha nova precisa ter pelo menos 12 caracteres.');
    exigir(senhaNova !== senhaAtual, 'A senha nova precisa ser diferente da atual.');
    return null; // Na demonstração, nada é guardado.
});

// ── Cardápio público e loja ──────────────────────────────────────────────────

rota('GET', '/api/publico/cardapio', () => {
    const loja = banco.lojas.PASTELARIA;
    return {
        aberta: loja.aberta,
        whatsapp: loja.whatsapp,
        itens: banco.produtos
            .filter((p) => p.negocio === 'PASTELARIA' && p.ativo)
            .map((p) => ({ nome: p.nome, descricao: p.descricao, categoria: p.categoria, preco: p.preco, esgotado: !p.disponivel })),
        locais: banco.localidades.filter((l) => l.ativo).map((l) => ({ nome: l.nome, taxa: l.taxa }))
    };
});

const respostaLoja = (l) => ({ negocio: l.negocio, aberta: l.aberta, whatsapp: l.whatsapp, alteradoEm: l.alteradoEm, alteradoPor: l.alteradoPor });

rota('GET', '/api/loja/(PASTELARIA|PEIXARIA)', ([, negocio]) => {
    logado();
    return respostaLoja(banco.lojas[negocio]);
});

rota('PUT', '/api/loja/(PASTELARIA|PEIXARIA)/aberta', ([, negocio], _, corpo) => {
    const usuario = logado();
    exigir(typeof corpoDe(corpo).aberta === 'boolean', 'Informe se a loja está aberta.');
    Object.assign(banco.lojas[negocio], { aberta: corpo.aberta, alteradoEm: new Date().toISOString(), alteradoPor: usuario.nome });
    return respostaLoja(banco.lojas[negocio]);
});

rota('PUT', '/api/loja/(PASTELARIA|PEIXARIA)/whatsapp', ([, negocio], _, corpo) => {
    const usuario = logado();
    const numero = (corpoDe(corpo).whatsapp ?? '').trim();
    exigir(numero === '' || REGEX_WHATSAPP.test(numero), 'Use só números, com o 55 na frente e o DDD (ex.: 5583999990000).');
    Object.assign(banco.lojas[negocio], { whatsapp: numero || null, alteradoEm: new Date().toISOString(), alteradoPor: usuario.nome });
    return respostaLoja(banco.lojas[negocio]);
});

// ── Locais de entrega ────────────────────────────────────────────────────────

rota('GET', '/api/localidades', () => {
    logado();
    return banco.localidades.map((l) => ({ ...l }));
});

// ── Produtos ─────────────────────────────────────────────────────────────────

rota('GET', '/api/produtos', (_, consulta) => {
    logado();
    const negocio = negocioDaConsulta(consulta);
    return banco.produtos.filter((p) => p.negocio === negocio).map(respostaProduto);
});

rota('POST', '/api/produtos', (_, __, corpo) => {
    logado();
    return respostaProduto(cadastrarProduto(corpoDe(corpo)));
});

rota('PUT', '/api/produtos/(\\d+)', ([, id], _, corpo) => {
    logado();
    return respostaProduto(alterarProduto(id, corpoDe(corpo)));
});

rota('PUT', '/api/produtos/(\\d+)/disponivel', ([, id], _, corpo) => {
    logado();
    const produto = achar(banco.produtos, id, 'Produto');
    produto.disponivel = Boolean(corpoDe(corpo).disponivel);
    return respostaProduto(produto);
});

rota('POST', '/api/produtos/(\\d+)/(desativar|reativar)', ([, id, acao]) => {
    logado();
    const produto = achar(banco.produtos, id, 'Produto');
    produto.ativo = acao === 'reativar';
    return respostaProduto(produto);
});

// ── Caixa ────────────────────────────────────────────────────────────────────

rota('GET', '/api/caixas', (_, consulta) => {
    logado();
    const negocio = negocioDaConsulta(consulta);
    return banco.caixas.filter((c) => c.negocio === negocio).sort((a, b) => b.id - a.id).map(respostaCaixa);
});

rota('GET', '/api/caixas/aberto', (_, consulta) => {
    logado();
    const caixa = caixaAberto(negocioDaConsulta(consulta));
    if (!caixa) throw new ErroApi(404, 'Não há caixa aberto para este negócio.');
    return respostaCaixa(caixa);
});

rota('POST', '/api/caixas', (_, __, corpo) => respostaCaixa(abrirCaixa(corpoDe(corpo), logado())));

rota('POST', '/api/caixas/(\\d+)/(reforcos|sangrias)', ([, id, tipo], _, corpo) =>
    respostaCaixa(movimentarCaixa(id, tipo === 'reforcos' ? 'REFORCO' : 'SANGRIA', corpoDe(corpo), logado())));

rota('POST', '/api/caixas/(\\d+)/fechar', ([, id], _, corpo) => respostaCaixa(fecharCaixa(id, corpoDe(corpo), logado())));

// ── Vendas ───────────────────────────────────────────────────────────────────

rota('GET', '/api/vendas', (_, consulta) => {
    logado();
    const caixaId = Number(consulta.get('caixaId'));
    return banco.vendas.filter((v) => v.caixaId === caixaId).sort((a, b) => b.id - a.id).map(respostaVenda);
});

rota('POST', '/api/vendas', (_, __, corpo) => respostaVenda(criarVenda(corpoDe(corpo), logado())));

rota('POST', '/api/vendas/(\\d+)/confirmar-pagamento', ([, id]) => {
    logado();
    return respostaVenda(confirmarPagamento(id));
});

rota('POST', '/api/vendas/(\\d+)/cancelar', ([, id], _, corpo) => {
    logado();
    return respostaVenda(cancelarVenda(id, corpoDe(corpo)));
});

// ── Despesas ─────────────────────────────────────────────────────────────────

function despesasDoMes(consulta) {
    const negocio = negocioDaConsulta(consulta);
    const mes = consulta.get('mes') ?? '';
    exigir(/^\d{4}-\d{2}$/.test(mes), 'Escolha o mês.');
    return banco.despesas.filter((d) => d.negocio === negocio && d.data.startsWith(mes));
}

rota('GET', '/api/despesas', (_, consulta) => {
    logado();
    return despesasDoMes(consulta).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id).map(respostaDespesa);
});

rota('GET', '/api/despesas/resumo', (_, consulta) => {
    logado();
    const doMes = despesasDoMes(consulta);
    const compras = doMes.filter((d) => d.categoria === 'COMPRA_DE_PEIXE');
    const kg = soma(compras, (d) => d.pesoKg ?? 0);
    return {
        negocio: negocioDaConsulta(consulta),
        mes: consulta.get('mes'),
        totalGasto: soma(doMes, (d) => d.valor),
        totalPago: soma(doMes.filter((d) => d.situacao === 'PAGO'), (d) => d.valor),
        totalPendente: soma(doMes.filter((d) => d.situacao === 'PENDENTE'), (d) => d.valor),
        kgComprados: kg,
        precoMedioPorKg: kg > 0 ? arred(soma(compras, (d) => d.valor) / kg) : 0
    };
});

rota('POST', '/api/despesas', (_, __, corpo) => respostaDespesa(criarDespesa(corpoDe(corpo), logado())));

rota('POST', '/api/despesas/(\\d+)/pagar', ([, id], _, corpo) => {
    logado();
    return respostaDespesa(pagarDespesa(id, corpoDe(corpo)));
});

// ── Repasses ao entregador ───────────────────────────────────────────────────

rota('GET', '/api/repasses', (_, consulta) => {
    logado();
    const [inicio, fim] = [consulta.get('inicio'), consulta.get('fim')];
    return banco.repasses
        .filter((r) => noPeriodoDaData(r.dataEntrega, inicio, fim))
        .sort((a, b) => b.dataEntrega.localeCompare(a.dataEntrega) || b.id - a.id)
        .map(respostaRepasse);
});

rota('GET', '/api/repasses/resumo', (_, consulta) => {
    logado();
    return resumoRepasses(consulta.get('inicio'), consulta.get('fim'));
});

rota('POST', '/api/repasses/pagar', (_, __, corpo) => pagarRepasses(corpoDe(corpo), logado()));

// ── Relatórios (só administrador) ────────────────────────────────────────────

const periodo = (consulta) => [consulta.get('inicio'), consulta.get('fim')];

rota('GET', '/api/relatorios/geral', (_, consulta) => {
    administrador();
    return relatorioGeral(...periodo(consulta));
});

rota('GET', '/api/relatorios/pastelaria', (_, consulta) => {
    administrador();
    return relatorioPastelaria(...periodo(consulta));
});

rota('GET', '/api/relatorios/peixaria', (_, consulta) => {
    administrador();
    return relatorioPeixaria(...periodo(consulta));
});

rota('GET', '/api/relatorios/peixaria/compras-mensais', (_, consulta) => {
    administrador();
    return comprasMensaisPeixaria(consulta.get('ano'));
});

// ── Equipe (só administrador) ────────────────────────────────────────────────

rota('GET', '/api/usuarios', () => {
    administrador();
    return banco.usuarios.map(respostaUsuario);
});

rota('POST', '/api/usuarios', (_, __, corpo) => {
    administrador();
    return respostaUsuario(cadastrarUsuario(corpoDe(corpo)));
});

rota('POST', '/api/usuarios/(\\d+)/(desativar|reativar)', ([, id, acao]) => {
    const eu = administrador();
    const pessoa = achar(banco.usuarios, id, 'Pessoa');
    exigir(!(acao === 'desativar' && pessoa.id === eu.id), 'Você não pode desativar a si mesma.', 409);
    pessoa.ativo = acao === 'reativar';
    return respostaUsuario(pessoa);
});
