// Os relatórios: contas feitas em cima das vendas, despesas, caixas e repasses
// que já estão na memória. No sistema real, quem faz essas contas é o servidor.

import { arred, banco, dataLocal, soma } from './banco.js';

const noPeriodo = (data, inicio, fim) => data >= inicio && data <= fim;
const instanteNoPeriodo = (instante, inicio, fim) => instante != null && noPeriodo(dataLocal(instante), inicio, fim);

function agrupar(lista, chave) {
    const grupos = new Map();
    for (const item of lista) {
        const k = chave(item);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(item);
    }
    return grupos;
}

function dadosDoNegocio(negocio, inicio, fim) {
    const todas = banco.vendas.filter((v) => v.negocio === negocio && instanteNoPeriodo(v.criadoEm, inicio, fim));
    return {
        todas,
        validas: todas.filter((v) => !v.cancelada),
        canceladas: todas.filter((v) => v.cancelada),
        despesas: banco.despesas.filter((d) => d.negocio === negocio && noPeriodo(d.data, inicio, fim)),
        fechados: banco.caixas.filter((c) => c.negocio === negocio && !c.aberto && instanteNoPeriodo(c.fechadoEm, inicio, fim))
    };
}

function comum(negocio, inicio, fim) {
    const { validas, canceladas, despesas, fechados } = dadosDoNegocio(negocio, inicio, fim);
    const porForma = (forma) => soma(validas.filter((v) => v.formaPagamento === forma), (v) => v.total);

    const vendidos = new Map();
    for (const venda of validas) {
        for (const item of venda.itens) {
            const atual = vendidos.get(item.nome) ?? { nome: item.nome, quantidade: 0, total: 0 };
            atual.quantidade = arred(atual.quantidade + item.quantidade, 3);
            atual.total = arred(atual.total + item.total);
            vendidos.set(item.nome, atual);
        }
    }

    return {
        negocio,
        inicio,
        fim,
        quantidadeVendas: validas.length,
        quantidadeCanceladas: canceladas.length,
        faturamento: soma(validas, (v) => v.total),
        recebido: soma(validas.filter((v) => v.situacaoPagamento === 'PAGO'), (v) => v.total),
        pendente: soma(validas.filter((v) => v.situacaoPagamento === 'PENDENTE'), (v) => v.total),
        cancelado: soma(canceladas, (v) => v.total),
        pix: porForma('PIX'),
        cartao: porForma('CARTAO'),
        dinheiro: porForma('DINHEIRO'),
        despesasPagas: soma(despesas.filter((d) => d.situacao === 'PAGO'), (d) => d.valor),
        despesasPendentes: soma(despesas.filter((d) => d.situacao === 'PENDENTE'), (d) => d.valor),
        diferencaCaixa: soma(fechados, (c) => c.diferenca),
        maisVendidos: [...vendidos.values()].sort((a, b) => b.total - a.total).slice(0, 5),
        fechamentos: fechados
            .map((c) => ({
                caixaId: c.id,
                abertoEm: c.abertoEm,
                fechadoEm: c.fechadoEm,
                esperado: c.esperado,
                valorContado: c.valorContado,
                diferenca: c.diferenca
            }))
            .sort((a, b) => b.fechadoEm.localeCompare(a.fechadoEm))
    };
}

export function resumoRepasses(inicio, fim) {
    const doPeriodo = banco.repasses.filter((r) => r.situacao !== 'CANCELADO' && noPeriodo(r.dataEntrega, inicio, fim));
    return {
        inicio,
        fim,
        totalPendente: soma(doPeriodo.filter((r) => r.situacao === 'PENDENTE'), (r) => r.valor),
        totalPago: soma(doPeriodo.filter((r) => r.situacao === 'PAGO'), (r) => r.valor)
    };
}

export function relatorioPastelaria(inicio, fim) {
    const { validas } = dadosDoNegocio('PASTELARIA', inicio, fim);
    const entregas = validas.filter((v) => v.tipo === 'ENTREGA');

    const margens = new Map();
    for (const venda of validas) {
        for (const item of venda.itens) {
            const produto = banco.produtos.find((p) => p.id === item.produtoId);
            const atual = margens.get(item.nome) ?? { produto: item.nome, receita: 0, custoEstimado: 0, margem: 0 };
            atual.receita = arred(atual.receita + item.total);
            atual.custoEstimado = arred(atual.custoEstimado + (produto?.custoEstimado ?? 0) * item.quantidade);
            atual.margem = arred(atual.receita - atual.custoEstimado);
            margens.set(item.nome, atual);
        }
    }

    return {
        comum: comum('PASTELARIA', inicio, fim),
        taxasEntrega: { quantidadeEntregas: entregas.length, totalTaxas: soma(entregas, (v) => v.taxaEntrega ?? 0) },
        origens: ['BALCAO', 'WHATSAPP'].map((origem) => {
            const daOrigem = validas.filter((v) => v.origem === origem);
            return { origem, quantidade: daOrigem.length, total: soma(daOrigem, (v) => v.total) };
        }),
        margens: [...margens.values()].sort((a, b) => b.margem - a.margem),
        repasses: resumoRepasses(inicio, fim)
    };
}

function resumoDeCompras(despesas) {
    const compras = despesas.filter((d) => d.categoria === 'COMPRA_DE_PEIXE');
    const total = soma(compras, (d) => d.valor);
    const kg = soma(compras, (d) => d.pesoKg ?? 0);
    return { total, kg, precoMedioPorKg: kg > 0 ? arred(total / kg) : 0 };
}

export function relatorioPeixaria(inicio, fim) {
    const { validas, despesas } = dadosDoNegocio('PEIXARIA', inicio, fim);
    const base = comum('PEIXARIA', inicio, fim);

    const vendasPorDia = [...agrupar(validas, (v) => dataLocal(v.criadoEm))]
        .map(([data, lista]) => ({ data, quantidade: lista.length, faturamento: soma(lista, (v) => v.total) }))
        .sort((a, b) => a.data.localeCompare(b.data));

    const porPeixe = new Map();
    for (const venda of validas) {
        for (const item of venda.itens) {
            const atual = porPeixe.get(item.nome) ?? { peixe: item.nome, kg: 0, total: 0 };
            atual.kg = arred(atual.kg + item.quantidade, 3);
            atual.total = arred(atual.total + item.total);
            porPeixe.set(item.nome, atual);
        }
    }

    const compras = resumoDeCompras(despesas);
    const outrasDespesas = soma(despesas.filter((d) => d.categoria !== 'COMPRA_DE_PEIXE'), (d) => d.valor);
    return {
        comum: base,
        vendasPorDia,
        kgPorPeixe: [...porPeixe.values()].sort((a, b) => b.kg - a.kg),
        compras,
        outrasDespesas,
        resultado: arred(base.faturamento - compras.total - outrasDespesas),
        observacao: 'Resultado = faturamento menos compras de peixe e outras despesas do período.'
    };
}

export function relatorioGeral(inicio, fim) {
    const partes = [comum('PASTELARIA', inicio, fim), comum('PEIXARIA', inicio, fim)];
    const somar = (campo) => soma(partes, (p) => p[campo]);
    return {
        inicio,
        fim,
        faturamento: somar('faturamento'),
        recebido: somar('recebido'),
        pendente: somar('pendente'),
        cancelado: somar('cancelado'),
        pix: somar('pix'),
        cartao: somar('cartao'),
        dinheiro: somar('dinheiro'),
        despesasPagas: somar('despesasPagas'),
        despesasPendentes: somar('despesasPendentes')
    };
}

export function comprasMensaisPeixaria(ano) {
    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
        const chave = `${ano}-${String(mes).padStart(2, '0')}`;
        const doMes = banco.despesas.filter((d) => d.negocio === 'PEIXARIA' && d.data.startsWith(chave));
        meses.push({ mes: chave, ...resumoDeCompras(doMes) });
    }
    return { ano: Number(ano), meses };
}
