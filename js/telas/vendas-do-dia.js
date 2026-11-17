// Vendas do caixa aberto: ver o que foi vendido, confirmar o Pix/cartão que já
// caiu na conta e (só o ADMIN) cancelar uma venda lançada errada.
//
// Não existe "editar venda": o jeito de corrigir é cancelar e lançar de novo.
// O cancelamento só funciona enquanto o caixa da venda está aberto (regra do
// backend). Toda regra e todo valor vêm do backend; aqui só se mostra e se pede.

import { api, ErroApi } from '../api.js';
import { avisar, confirmar, emCentavos, escapar, horaDaCasa, reais } from '../util.js';

const FORMAS = { DINHEIRO: 'Dinheiro', PIX: 'Pix', CARTAO: 'Cartão' };
const NOMES_NEGOCIO = { PASTELARIA: 'Pastelaria', PEIXARIA: 'Peixaria' };

export async function renderVendasDoDia(tela, contexto) {
    const negocio = contexto.estado.negocio;
    if (!negocio) {
        contexto.irPara('#/negocio');
        return;
    }
    const admin = contexto.estado.usuario?.papel === 'ADMIN';

    tela.innerHTML = `
        <div class="cabecalho-tela cabecalho-com-acao">
            <div>
                <h1 class="h3 fw-bold mb-1">Vendas de hoje · ${escapar(NOMES_NEGOCIO[negocio] ?? negocio)}</h1>
                <p class="text-secondary mb-0">Confirme o Pix que caiu e cancele vendas lançadas errado.</p>
            </div>
            <button id="vd-atualizar" class="btn btn-sm btn-outline-secondary" type="button">Atualizar</button>
        </div>
        <div id="vd-conteudo" aria-live="polite"><p class="text-secondary">Carregando…</p></div>`;

    const area = tela.querySelector('#vd-conteudo');
    tela.querySelector('#vd-atualizar').addEventListener('click', () => carregar());

    let vendas = [];

    async function carregar() {
        try {
            const caixa = await api.get(`/api/caixas/aberto?negocio=${negocio}`);
            vendas = await api.get(`/api/vendas?caixaId=${caixa.id}`);
            desenhar();
        } catch (erro) {
            if (erro instanceof ErroApi && erro.status === 404) {
                area.innerHTML = `
                    <div class="alert alert-info">
                        O caixa está fechado, então não há vendas de hoje para mostrar.
                        <a href="#/venda" class="alert-link">Abrir o caixa</a>
                    </div>`;
                return;
            }
            area.innerHTML = `<div class="alert alert-danger">${escapar(erro.message)}</div>`;
        }
    }

    let filtro = 'ATIVAS';   // ATIVAS | RECEBER | CANCELADAS

    const FILTROS = [['ATIVAS', 'Vendas'], ['RECEBER', 'A receber'], ['CANCELADAS', 'Canceladas']];

    const passaNoFiltro = {
        ATIVAS: (v) => !v.cancelada,
        RECEBER: (v) => !v.cancelada && v.situacaoPagamento === 'PENDENTE',
        CANCELADAS: (v) => v.cancelada
    };

    const MENSAGEM_VAZIA = {
        ATIVAS: 'Nenhuma venda neste caixa ainda.',
        RECEBER: 'Nada a receber. Tudo confirmado!',
        CANCELADAS: 'Nenhuma venda cancelada.'
    };

    /** Soma em centavos inteiros (número quebrado erra no último centavo). */
    function somaReais(lista) {
        return lista.reduce((soma, v) => soma + emCentavos(v.total), 0) / 100;
    }

    function desenhar() {
        const ativas = vendas.filter(passaNoFiltro.ATIVAS);
        const aReceber = vendas.filter(passaNoFiltro.RECEBER);
        // Mais recente primeiro.
        const lista = vendas.filter(passaNoFiltro[filtro]).sort((a, b) => b.id - a.id);

        // Cada pílula mostra quantas vendas tem; "A receber" fica em destaque
        // enquanto houver Pix ou cartão esperando confirmação.
        const quantas = (codigo) => vendas.filter(passaNoFiltro[codigo]).length;
        const filtros = FILTROS.map(([codigo, nome]) => {
            const total = quantas(codigo);
            const alerta = codigo === 'RECEBER' && total > 0;
            return `
            <input type="radio" class="btn-check" name="vd-filtro" id="vd-f-${codigo}" value="${codigo}" ${filtro === codigo ? 'checked' : ''}>
            <label class="btn btn-sm vd-pilula" for="vd-f-${codigo}">
                <span>${nome}</span>
                <span class="vd-contagem ${alerta ? 'vd-contagem-alerta' : ''}">${total}</span>
            </label>`;
        }).join('');

        const corpo = lista.length === 0
            ? `<p class="text-secondary">${MENSAGEM_VAZIA[filtro]}</p>`
            : `<div class="vd-lista">${lista.map(linhaDaVenda).join('')}</div>`;

        area.innerHTML = `
            <div class="vd-resumo mb-3">
                <div><span class="small text-secondary">Vendeu</span><strong class="d-block fs-4">${reais(somaReais(ativas))}</strong></div>
                <div class="text-end"><span class="small text-secondary">A receber</span><strong class="d-block fs-4">${reais(somaReais(aReceber))}</strong></div>
            </div>
            <div class="vd-filtros mb-3" role="group" aria-label="Mostrar">${filtros}</div>
            ${corpo}`;
    }

    function selo(venda) {
        if (venda.cancelada) return '<span class="badge selo-inativo">Cancelada</span>';
        return venda.situacaoPagamento === 'PAGO'
            ? '<span class="badge selo-pago">Pago</span>'
            : '<span class="badge selo-pendente">A receber</span>';
    }

    /**
     * Uma linha curta por venda: hora, forma, valor e situação. Os itens e os
     * botões ficam escondidos até tocar na linha, para a lista não poluir.
     */
    function linhaDaVenda(venda) {
        const pendente = !venda.cancelada && venda.situacaoPagamento === 'PENDENTE';
        const itens = venda.itens.map((i) =>
            `<li><span>${Number(i.quantidade)}× ${escapar(i.nome)}</span><span>${reais(i.total)}</span></li>`).join('');
        return `
            <details class="vd-venda ${venda.cancelada ? 'vd-cancelada' : ''}" data-venda="${venda.id}">
                <summary>
                    <span class="vd-hora">${escapar(horaDaCasa(venda.criadoEm))}</span>
                    <span class="vd-forma">${FORMAS[venda.formaPagamento] ?? venda.formaPagamento}</span>
                    <strong class="vd-valor">${reais(venda.total)}</strong>
                    ${selo(venda)}
                </summary>
                <div class="vd-detalhe">
                    <ul class="vd-itens">${itens}</ul>
                    ${venda.observacao ? `<p class="small text-secondary mb-2">“${escapar(venda.observacao)}”</p>` : ''}
                    ${venda.cancelada && venda.motivoCancelamento
                        ? `<p class="small mb-0">Motivo: ${escapar(venda.motivoCancelamento)}</p>` : ''}
                    <div class="d-flex flex-wrap gap-2">
                        ${pendente ? '<button class="btn btn-sm btn-primary" type="button" data-acao="confirmar">Confirmar que recebi</button>' : ''}
                        ${admin && !venda.cancelada
                            ? '<button class="btn btn-sm btn-outline-danger" type="button" data-acao="cancelar">Cancelar venda</button>' : ''}
                    </div>
                    <div data-motivo-area></div>
                </div>
            </details>`;
    }

    area.addEventListener('change', (evento) => {
        if (evento.target.name === 'vd-filtro') {
            filtro = evento.target.value;
            desenhar();
        }
    });

    area.addEventListener('click', async (evento) => {
        const botao = evento.target.closest('button[data-acao]');
        if (!botao) return;
        const cartao = botao.closest('[data-venda]');
        const id = Number(cartao.dataset.venda);
        const venda = vendas.find((v) => v.id === id);
        if (!venda) return;

        if (botao.dataset.acao === 'confirmar') {
            const ok = await confirmar({
                titulo: 'Confirmar pagamento?',
                mensagem: `Confirme só se os ${reais(venda.total)} em ${FORMAS[venda.formaPagamento]} já caíram na conta.`,
                textoConfirmar: 'Sim, recebi'
            });
            if (!ok) return;
            await chamar(botao, () => api.post(`/api/vendas/${id}/confirmar-pagamento`), 'Pagamento confirmado.');
        } else if (botao.dataset.acao === 'cancelar') {
            pedirMotivo(cartao, id);
        } else if (botao.dataset.acao === 'enviar-cancelamento') {
            const campo = cartao.querySelector('[data-motivo]');
            const motivo = campo.value.trim();
            if (!motivo) {
                campo.classList.add('is-invalid');
                return;
            }
            await chamar(botao, () => api.post(`/api/vendas/${id}/cancelar`, { motivo }), 'Venda cancelada.');
        } else if (botao.dataset.acao === 'desistir') {
            cartao.querySelector('[data-motivo-area]').innerHTML = '';
        }
    });

    /** Mostra, dentro do cartão, o campo do motivo (o backend exige um). */
    function pedirMotivo(cartao, id) {
        cartao.querySelector('[data-motivo-area]').innerHTML = `
            <div class="mt-3">
                <label class="form-label small" for="motivo-${id}">Por que cancelar? (obrigatório)</label>
                <input id="motivo-${id}" data-motivo class="form-control" maxlength="200"
                       placeholder="Ex.: lancei no Pix, mas foi dinheiro">
                <div class="d-flex gap-2 mt-2">
                    <button class="btn btn-sm btn-danger" type="button" data-acao="enviar-cancelamento">Cancelar esta venda</button>
                    <button class="btn btn-sm btn-outline-secondary" type="button" data-acao="desistir">Voltar</button>
                </div>
            </div>`;
        cartao.querySelector('[data-motivo]').focus();
    }

    async function chamar(botao, chamada, mensagemOk) {
        botao.disabled = true;
        try {
            await chamada();
            avisar(mensagemOk);
            await carregar();
        } catch (erro) {
            avisar(erro.message, 'danger');
            botao.disabled = false;
        }
    }

    await carregar();
}
