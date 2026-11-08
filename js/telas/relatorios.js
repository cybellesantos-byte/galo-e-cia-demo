// Tela de relatórios (só ADMIN).
//
// Três abas: Pastelaria, Peixaria e Os dois juntos. Cada aba pede ao backend o
// relatório do período escolhido; a tela só desenha. Nenhuma conta de dinheiro
// é feita aqui: os totais vêm prontos do backend (BigDecimal, centavo certo).
// A única conta da tela é o tamanho de cada barra, que é só desenho.
//
// Os nomes importam, e são sempre os mesmos:
//   - Faturamento: tudo o que foi vendido no período (pago ou não), sem os cancelados.
//   - Recebido: a parte do faturamento que já entrou (o pendente ainda não).
//   - Sobrou: recebido − despesas pagas − repasse ao entregador. É um lucro
//     aproximado: só conta o que já entrou e o que já foi pago.
//     (Por enquanto a subtração é feita aqui, em centavos; o certo é o backend
//     mandar esse número pronto, como já faz na peixaria.)

import { api } from '../api.js';
import { avisar, emCentavos, escapar, quilos, reais } from '../util.js';

const ABAS = { PASTELARIA: 'Pastelaria', PEIXARIA: 'Peixaria', GERAL: 'Os dois juntos' };
const ORIGENS = { BALCAO: 'Balcão', WHATSAPP: 'WhatsApp' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ── Datas (sempre no horário de Brasília) ──────────────────────────────────

function hoje() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Soma dias a uma data "AAAA-MM-DD". O meio-dia UTC evita surpresas com fuso. */
function somarDias(data, dias) {
    const d = new Date(`${data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

function semanaDe(data) {
    const diaDaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();   // 0 = domingo
    const segunda = somarDias(data, -((diaDaSemana + 6) % 7));
    return { inicio: segunda, fim: somarDias(segunda, 6) };
}

/** Mês passado inteiro: do dia 1 até o dia antes do 1º deste mês. */
function mesPassado() {
    const primeiroDesteMes = `${hoje().slice(0, 7)}-01`;
    const ultimo = somarDias(primeiroDesteMes, -1);
    return { inicio: `${ultimo.slice(0, 7)}-01`, fim: ultimo };
}

const PERIODOS = {
    'hoje': () => ({ inicio: hoje(), fim: hoje() }),
    'esta-semana': () => semanaDe(hoje()),
    'este-mes': () => ({ inicio: `${hoje().slice(0, 7)}-01`, fim: hoje() }),
    'mes-passado': mesPassado
};

/** "2026-10-29" → "29/10/2026". */
function dataBr(data) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

function textoPeriodo({ inicio, fim }) {
    return inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;
}

// ── Pedaços de tela reaproveitados ─────────────────────────────────────────

function cartaoNumero(rotulo, valor, { destaque = false, detalhe = '' } = {}) {
    return `
        <div class="resumo-numero ${destaque ? 'resumo-destaque' : ''}">
            <span class="resumo-rotulo">${rotulo}</span>
            <span class="resumo-valor">${valor}</span>
            ${detalhe ? `<span class="resumo-rotulo">${detalhe}</span>` : ''}
        </div>`;
}

function secao(titulo, conteudo, explicacao = '') {
    return `
        <section class="card rel-secao">
            <div class="card-body">
                <h2 class="h6 fw-bold mb-1">${titulo}</h2>
                ${explicacao ? `<p class="small text-secondary mb-3">${explicacao}</p>` : '<div class="mb-2"></div>'}
                ${conteudo}
            </div>
        </section>`;
}

/** Seção que começa fechada: o detalhe fica a um toque, sem poluir a tela. */
function secaoRecolhida(titulo, conteudo) {
    return `
        <details class="card rel-secao">
            <summary class="card-body fw-bold h6 mb-0">${titulo}</summary>
            <div class="card-body pt-0">${conteudo}</div>
        </details>`;
}

/**
 * Barras deitadas: nome | barra | valor. Uma cor só (é tamanho, não categoria),
 * e o valor sempre escrito ao lado: a barra ajuda a comparar, o número é o dado.
 * linhas: [{ nome, valor, texto, detalhe }]; o maior valor ocupa a barra inteira.
 */
function barras(linhas, vazio = 'Nada neste período.') {
    const maior = Math.max(0, ...linhas.map((l) => Number(l.valor)));
    if (!linhas.length || maior === 0) {
        return `<p class="text-secondary small mb-0">${vazio}</p>`;
    }
    return `
        <div class="rel-barras">
            ${linhas.map((l) => {
                const largura = Number(l.valor) > 0 ? Math.max(1, (Number(l.valor) / maior) * 100) : 0;
                return `
                    <div class="rel-barra">
                        <span class="rel-barra-nome">${escapar(l.nome)}</span>
                        <span class="rel-barra-trilho" aria-hidden="true">
                            <span class="rel-barra-cheia" style="width:${largura.toFixed(1)}%"></span>
                        </span>
                        <span class="rel-barra-valor">${l.texto}${l.detalhe ? ` <small>${l.detalhe}</small>` : ''}</span>
                    </div>`;
            }).join('')}
        </div>`;
}

/**
 * Colunas em pé, para o que muda com o tempo (dias, meses). Cada coluna tem o
 * valor no "title" (aparece ao parar o mouse) e, embaixo, a mesma informação
 * em tabela, para ler os números exatos e para leitores de tela.
 * colunas: [{ rotulo, valor, dica }], tabela: { cabecalho: [...], linhas: [[...]] }
 */
function colunas(lista, tabela, descricao) {
    const maior = Math.max(0, ...lista.map((c) => Number(c.valor)));
    if (maior === 0) {
        return '<p class="text-secondary small mb-0">Nada neste período.</p>';
    }
    // Com muitas colunas, nem todo rótulo cabe: mostra alguns e sempre o último.
    const passo = lista.length <= 14 ? 1 : Math.ceil(lista.length / 7);
    return `
        <div class="rel-escala small text-secondary">maior: ${reais(maior)}</div>
        <div class="rel-colunas" role="img" aria-label="${escapar(descricao)}">
            ${lista.map((c, i) => {
                const altura = Number(c.valor) > 0 ? Math.max(2, (Number(c.valor) / maior) * 100) : 0;
                const mostrar = i % passo === 0 || i === lista.length - 1;
                return `
                    <div class="rel-coluna" title="${escapar(c.dica)}">
                        <span class="rel-coluna-area"><span class="rel-coluna-cheia" style="height:${altura.toFixed(1)}%"></span></span>
                        <span class="rel-coluna-rotulo">${mostrar ? escapar(c.rotulo) : ''}</span>
                    </div>`;
            }).join('')}
        </div>
        <details class="mt-2">
            <summary class="small">Ver em tabela</summary>
            <div class="table-responsive mt-2">
                <table class="table table-sm small mb-0">
                    <thead><tr>${tabela.cabecalho.map((t, i) => `<th class="${i ? 'text-end' : ''}">${t}</th>`).join('')}</tr></thead>
                    <tbody>${tabela.linhas.map((linha) => `<tr>${linha.map((t, i) => `<td class="${i ? 'text-end' : ''}">${t}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
            </div>
        </details>`;
}

function porcentagem(parte, todo) {
    return Number(todo) > 0 ? `${Math.round((Number(parte) / Number(todo)) * 100)}%` : '';
}

// ── Seções iguais nos três relatórios ──────────────────────────────────────

function cartoesPrincipais(r) {
    return `
        <div class="row g-2 mb-3">
            <div class="col-12 col-md-3">${cartaoNumero('Vendeu', reais(r.faturamento), { destaque: true })}</div>
            <div class="col-6 col-md-3">${cartaoNumero('Recebido', reais(r.recebido))}</div>
            <div class="col-6 col-md-3">${cartaoNumero('A receber', reais(r.pendente))}</div>
            <div class="col-12 col-md-3">${cartaoNumero('Cancelado', reais(r.cancelado))}</div>
        </div>`;
}

function comoPagaram(r) {
    return secao('Como os clientes pagaram', barras([
        { nome: 'Pix', valor: r.pix, texto: reais(r.pix), detalhe: porcentagem(r.pix, r.faturamento) },
        { nome: 'Cartão', valor: r.cartao, texto: reais(r.cartao), detalhe: porcentagem(r.cartao, r.faturamento) },
        { nome: 'Dinheiro', valor: r.dinheiro, texto: reais(r.dinheiro), detalhe: porcentagem(r.dinheiro, r.faturamento) }
    ]));
}

function despesas(r) {
    return secao('Despesas', `
        <dl class="resumo-fechamento mb-0">
            <dt>Já pagas</dt><dd>${reais(r.despesasPagas)}</dd>
            <dt>A pagar</dt><dd>${reais(r.despesasPendentes)}</dd>
        </dl>`);
}

function maisVendidos(comum, unidade) {
    return secao('Mais vendidos', barras(comum.maisVendidos.map((p) => ({
        nome: p.nome,
        valor: p.total,
        texto: reais(p.total),
        detalhe: unidade === 'kg' ? `${quilos(p.quantidade)} kg` : `${Number(p.quantidade)} un.`
    }))));
}

// ── Pastelaria ─────────────────────────────────────────────────────────────

/**
 * Quanto sobrou: recebido − despesas pagas − repasse pago ao entregador.
 * A conta é em centavos inteiros (número quebrado erra no último centavo).
 */
function sobrou(c, repasses) {
    const centavos = emCentavos(c.recebido) - emCentavos(c.despesasPagas) - emCentavos(repasses.totalPago);
    const valor = centavos / 100;
    const negativo = centavos < 0;
    return secao('Sobrou', `
        <div class="rel-resultado ${negativo ? 'rel-resultado-negativo' : ''}">
            <span class="resumo-valor">${negativo ? '−' : ''}${reais(Math.abs(valor))}</span>
            <span class="small">${negativo ? 'Saiu mais do que entrou.' : 'Lucro aproximado.'}</span>
        </div>
        <dl class="resumo-fechamento mt-3 mb-0">
            <dt>Recebido</dt><dd>${reais(c.recebido)}</dd>
            <dt>− Despesas pagas</dt><dd>${reais(c.despesasPagas)}</dd>
            <dt>− Repasse ao entregador</dt><dd>${reais(repasses.totalPago)}</dd>
        </dl>`);
}

function htmlPastelaria(r) {
    const c = r.comum;
    return `
        ${cartoesPrincipais(c)}
        ${sobrou(c, r.repasses)}
        <div class="rel-grade">
            ${maisVendidos(c, 'un')}
            ${comoPagaram(c)}
            ${despesas(c)}
        </div>
        ${secaoRecolhida('De onde vieram os pedidos', barras(r.origens.map((o) => ({
            nome: ORIGENS[o.origem] ?? o.origem,
            valor: o.total,
            texto: reais(o.total),
            detalhe: `${o.quantidade} ${o.quantidade === 1 ? 'pedido' : 'pedidos'}`
        }))))}
        ${secaoRecolhida('Entregas', `
            <dl class="resumo-fechamento mb-0">
                <dt>Entregas feitas</dt><dd>${r.taxasEntrega.quantidadeEntregas}</dd>
                <dt>Taxas cobradas</dt><dd>${reais(r.taxasEntrega.totalTaxas)}</dd>
                <dt>Já repassado ao entregador</dt><dd>${reais(r.repasses.totalPago)}</dd>
                <dt>Falta repassar</dt><dd>${reais(r.repasses.totalPendente)}</dd>
            </dl>`)}`;
}

// ── Peixaria ───────────────────────────────────────────────────────────────

function resultadoPeixaria(r) {
    const valor = Number(r.resultado);
    const sinal = valor < 0 ? '−' : '';
    return secao('Sobrou', `
        <div class="rel-resultado ${valor < 0 ? 'rel-resultado-negativo' : ''}">
            <span class="resumo-valor">${sinal}${reais(Math.abs(valor))}</span>
            <span class="small">${valor < 0 ? 'Saiu mais do que entrou.' : 'Lucro aproximado.'}</span>
        </div>
        <dl class="resumo-fechamento mt-3 mb-0">
            <dt>Recebido</dt><dd>${reais(r.comum.recebido)}</dd>
            <dt>− Compras de peixe</dt><dd>${reais(r.compras.total)}</dd>
            <dt>− Outras despesas</dt><dd>${reais(r.outrasDespesas)}</dd>
        </dl>`);
}

/**
 * O backend manda só os dias que tiveram venda. Para o gráfico não "pular"
 * dias, a tela completa os que faltam com zero (até 62 dias; num período
 * maior, colunas finas demais não ajudam, e ficam só os dias com venda).
 */
function completarDias(lista, { inicio, fim }) {
    const porData = new Map(lista.map((d) => [d.data, d]));
    const dias = [];
    for (let data = inicio; data <= fim && dias.length <= 62; data = somarDias(data, 1)) {
        dias.push(porData.get(data) ?? { data, quantidade: 0, faturamento: 0 });
    }
    return dias.length > 62 ? lista : dias;
}

function vendasPorDia(lista, periodo) {
    const dados = completarDias(lista, periodo).map((d) => {
        const [, mes, dia] = d.data.split('-');
        const semana = DIAS[new Date(`${d.data}T12:00:00Z`).getUTCDay()];
        return { ...d, dia, mes, semana };
    });
    return secao('Vendas por dia', colunas(
        dados.map((d) => ({
            rotulo: d.dia,
            valor: d.faturamento,
            dica: `${d.dia}/${d.mes} (${d.semana}): ${reais(d.faturamento)} · ${d.quantidade} ${d.quantidade === 1 ? 'venda' : 'vendas'}`
        })),
        {
            cabecalho: ['Dia', 'Vendas', 'Faturamento'],
            linhas: dados.map((d) => [`${d.dia}/${d.mes} (${d.semana})`, d.quantidade, reais(d.faturamento)])
        },
        'Faturamento de cada dia do período'));
}

function comprasMensais(anual) {
    const meses = anual.meses.map((m, i) => ({ ...m, nome: MESES[i] }));
    return secao(`Compras de peixe mês a mês (${anual.ano})`, colunas(
        meses.map((m) => ({
            rotulo: m.nome,
            valor: m.total,
            dica: `${m.nome}: ${reais(m.total)} · ${quilos(m.kg)} kg`
                + (m.precoMedioPorKg == null ? '' : ` · ${reais(m.precoMedioPorKg)}/kg`)
        })),
        {
            cabecalho: ['Mês', 'Comprado', 'Kg', 'Preço médio/kg'],
            linhas: meses.map((m) => [m.nome, reais(m.total), quilos(m.kg),
                m.precoMedioPorKg == null ? '—' : reais(m.precoMedioPorKg)])
        },
        `Compras de peixe em cada mês de ${anual.ano}`));
}

function htmlPeixaria(r, anual, periodo) {
    const c = r.comum;
    return `
        ${cartoesPrincipais(c)}
        <div class="rel-grade">
            ${resultadoPeixaria(r)}
            ${secao('Compras de peixe no período', `
                <dl class="resumo-fechamento mb-0">
                    <dt>Total comprado</dt><dd>${reais(r.compras.total)}</dd>
                    <dt>Peso</dt><dd>${quilos(r.compras.kg)} kg</dd>
                    <dt>Preço médio</dt><dd>${r.compras.precoMedioPorKg == null ? '—' : `${reais(r.compras.precoMedioPorKg)}/kg`}</dd>
                </dl>`)}
        </div>
        ${vendasPorDia(r.vendasPorDia, periodo)}
        <div class="rel-grade">
            ${secao('Quilos vendidos por peixe', barras(r.kgPorPeixe.map((p) => ({
                nome: p.peixe,
                valor: p.kg,
                texto: `${quilos(p.kg)} kg`,
                detalhe: reais(p.total)
            }))))}
            ${comoPagaram(c)}
            ${despesas(c)}
        </div>
        ${anual ? comprasMensais(anual) : ''}`;
}

// ── Os dois juntos ─────────────────────────────────────────────────────────

function htmlGeral(r) {
    return `
        ${cartoesPrincipais(r)}
        <div class="rel-grade">
            ${comoPagaram(r)}
            ${despesas(r)}
        </div>`;
}

// ── A tela ─────────────────────────────────────────────────────────────────

export async function renderRelatorios(tela, contexto) {
    let aba = ABAS[contexto.estado.negocio] ? contexto.estado.negocio : 'PASTELARIA';
    let periodo = PERIODOS['este-mes']();
    let pedido = 0;   // descarta respostas que chegaram fora de ordem

    tela.innerHTML = `
        <div class="cabecalho-tela">
            <h1 class="h3 fw-bold mb-1">Relatórios</h1>
            <p class="text-secondary mb-0">Quanto vendeu, quanto entrou e quanto sobrou.</p>
        </div>

        <div class="card mb-3">
            <div class="card-body p-3">
                <div class="rel-abas mb-3" role="group" aria-label="Negócio">
                    ${Object.entries(ABAS).map(([codigo, nome]) => `
                        <input type="radio" class="btn-check" name="aba-rel" id="aba-${codigo}" value="${codigo}" ${codigo === aba ? 'checked' : ''}>
                        <label class="btn btn-outline-primary" for="aba-${codigo}">${codigo === 'GERAL'
                            ? '<span class="d-none d-sm-inline">Os dois juntos</span><span class="d-sm-none">Juntos</span>'
                            : nome}</label>`).join('')}
                </div>
                <div class="d-flex flex-wrap align-items-end gap-2">
                    <div class="periodo-atalhos" role="group" aria-label="Período">
                        ${[['hoje', 'Hoje'], ['esta-semana', 'Esta semana'], ['este-mes', 'Este mês'], ['mes-passado', 'Mês passado']]
                            .map(([codigo, nome]) => `
                                <input type="radio" class="btn-check" name="periodo-rel" id="p-${codigo}" value="${codigo}" ${codigo === 'este-mes' ? 'checked' : ''}>
                                <label class="btn btn-outline-secondary" for="p-${codigo}">${nome}</label>`).join('')}
                    </div>
                    <div class="periodo-datas ms-lg-auto">
                        <div>
                            <label class="form-label small mb-1" for="rel-inicio">De</label>
                            <input id="rel-inicio" type="date" class="form-control">
                        </div>
                        <div>
                            <label class="form-label small mb-1" for="rel-fim">Até</label>
                            <input id="rel-fim" type="date" class="form-control">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <p id="rel-titulo" class="fw-semibold mb-2"></p>
        <div id="rel-conteudo" aria-live="polite"><p class="text-secondary">Carregando…</p></div>`;

    const $ = (id) => tela.querySelector(`#${id}`);

    async function carregar() {
        const meuPedido = ++pedido;
        $('rel-inicio').value = periodo.inicio;
        $('rel-fim').value = periodo.fim;
        $('rel-titulo').textContent = `${ABAS[aba]} · ${textoPeriodo(periodo)}`;
        $('rel-conteudo').classList.add('rel-carregando');
        const consulta = `inicio=${periodo.inicio}&fim=${periodo.fim}`;
        try {
            let html;
            if (aba === 'PASTELARIA') {
                html = htmlPastelaria(await api.get(`/api/relatorios/pastelaria?${consulta}`));
            } else if (aba === 'PEIXARIA') {
                const [relatorio, anual] = await Promise.all([
                    api.get(`/api/relatorios/peixaria?${consulta}`),
                    api.get(`/api/relatorios/peixaria/compras-mensais?ano=${periodo.fim.slice(0, 4)}`)
                ]);
                html = htmlPeixaria(relatorio, anual, periodo);
            } else {
                html = htmlGeral(await api.get(`/api/relatorios/geral?${consulta}`));
            }
            if (meuPedido !== pedido) return;
            $('rel-conteudo').innerHTML = html;
        } catch (erro) {
            if (meuPedido !== pedido) return;
            $('rel-conteudo').innerHTML = `<p class="text-danger">${escapar(erro.message)}</p>`;
        } finally {
            if (meuPedido === pedido) $('rel-conteudo').classList.remove('rel-carregando');
        }
    }

    tela.querySelectorAll('input[name="aba-rel"]').forEach((opcao) => {
        opcao.addEventListener('change', () => {
            aba = opcao.value;
            carregar();
        });
    });

    tela.querySelectorAll('input[name="periodo-rel"]').forEach((opcao) => {
        opcao.addEventListener('change', () => {
            periodo = PERIODOS[opcao.value]();
            carregar();
        });
    });

    // Datas livres: ao mudar, desmarca os atalhos.
    const mudarDatas = () => {
        const inicio = $('rel-inicio').value;
        const fim = $('rel-fim').value;
        if (!inicio || !fim) return;
        if (inicio > fim) {
            avisar('A data "De" precisa ser antes da data "Até".', 'warning');
            return;
        }
        tela.querySelectorAll('input[name="periodo-rel"]').forEach((opcao) => { opcao.checked = false; });
        periodo = { inicio, fim };
        carregar();
    };
    $('rel-inicio').addEventListener('change', mudarDatas);
    $('rel-fim').addEventListener('change', mudarDatas);

    await carregar();
}
