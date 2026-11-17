// Tela de repasses ao entregador (pastelaria).
//
// Cada venda com entrega gera um repasse: a taxa daquela entrega pertence ao
// entregador. No fim da semana, o ADMIN marca as entregas e paga todas de uma
// vez. O backend paga no esquema TUDO OU NADA: se uma delas já tiver sido paga
// (por outra pessoa, em outro aparelho), nenhuma é paga e a tela avisa.
//
// A EQUIPE consulta, mas não paga: os botões nem aparecem (e o backend barra).

import { api } from '../api.js';
import { avisar, confirmar, escapar, reais } from '../util.js';

const FORMAS = { PIX: 'Pix', DINHEIRO: 'Dinheiro da gaveta' };
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ── Datas (sempre no horário de Brasília) ──────────────────────────────────

/** Hoje no horário de Brasília: "2026-10-29". */
function hoje() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Soma dias a uma data "AAAA-MM-DD". O meio-dia UTC evita surpresas com fuso. */
function somarDias(data, dias) {
    const d = new Date(`${data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/** Segunda a domingo da semana que contém a data. */
function semanaDe(data) {
    const diaDaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();   // 0 = domingo
    const segunda = somarDias(data, -((diaDaSemana + 6) % 7));
    return { inicio: segunda, fim: somarDias(segunda, 6) };
}

const PERIODOS = {
    'esta-semana': () => semanaDe(hoje()),
    'semana-passada': () => semanaDe(somarDias(hoje(), -7)),
    'este-mes': () => ({ inicio: `${hoje().slice(0, 7)}-01`, fim: hoje() })
};

function formatarDia(data) {
    const [, mes, dia] = data.split('-');
    const semana = DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()];
    return { dia, mes, semana };
}

export async function renderRepasses(tela, contexto) {
    const souAdmin = contexto.estado.usuario?.papel === 'ADMIN';
    let periodo = PERIODOS['esta-semana']();
    let repasses = [];

    tela.innerHTML = `
        <div class="cabecalho-tela">
            <h1 class="h3 fw-bold mb-1">Repasses ao entregador</h1>
            <p class="text-secondary mb-0">
                A taxa de cada entrega é do entregador. Aqui você confere o que ele tem a receber
                ${souAdmin ? 'e registra o pagamento do acerto.' : '(o pagamento é registrado pelo administrador).'}
            </p>
        </div>

        <div class="card mb-4">
            <div class="card-body p-3 d-flex flex-wrap align-items-end gap-2">
                <div class="periodo-atalhos" role="group" aria-label="Período">
                    <input type="radio" class="btn-check" name="periodo" id="p-esta-semana" value="esta-semana" checked>
                    <label class="btn btn-outline-secondary" for="p-esta-semana">Esta semana</label>
                    <input type="radio" class="btn-check" name="periodo" id="p-semana-passada" value="semana-passada">
                    <label class="btn btn-outline-secondary" for="p-semana-passada">Semana passada</label>
                    <input type="radio" class="btn-check" name="periodo" id="p-este-mes" value="este-mes">
                    <label class="btn btn-outline-secondary" for="p-este-mes">Este mês</label>
                </div>
                <div class="periodo-datas ms-lg-auto">
                    <div>
                        <label class="form-label small mb-1" for="data-inicio">De</label>
                        <input id="data-inicio" type="date" class="form-control">
                    </div>
                    <div>
                        <label class="form-label small mb-1" for="data-fim">Até</label>
                        <input id="data-fim" type="date" class="form-control">
                    </div>
                </div>
            </div>
        </div>

        <div id="resumo-repasses" class="mb-4"></div>

        <div class="card">
            <div class="card-body p-0">
                ${souAdmin ? `
                    <div class="repasse-cabecalho">
                        <div class="form-check mb-0">
                            <input class="form-check-input" type="checkbox" id="marcar-todas">
                            <label class="form-check-label fw-semibold" for="marcar-todas">Marcar todas as pendentes</label>
                        </div>
                    </div>` : ''}
                <div id="lista-repasses" aria-live="polite"><p class="text-secondary p-4 mb-0">Carregando…</p></div>
            </div>
        </div>

        ${souAdmin ? `
            <div id="barra-pagamento" class="barra-pagamento d-none" role="region" aria-label="Pagamento ao entregador">
                <div class="barra-pagamento-conteudo">
                    <div class="barra-pagamento-total">
                        <span id="qtd-selecionadas" class="small"></span>
                        <strong id="total-selecionado"></strong>
                    </div>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <div class="btn-group" role="group" aria-label="Forma de pagamento">
                            ${Object.entries(FORMAS).map(([codigo, nome], i) => `
                                <input type="radio" class="btn-check" name="forma-repasse" id="forma-${codigo}" value="${codigo}" ${i === 0 ? 'checked' : ''}>
                                <label class="btn btn-outline-secondary" for="forma-${codigo}">${nome}</label>`).join('')}
                        </div>
                        <button id="pagar-entregador" class="btn btn-primary" type="button">Pagar ao entregador</button>
                    </div>
                </div>
                <div id="pagamento-erro" class="text-danger small mt-2 d-none" role="alert"></div>
            </div>` : ''}`;

    const $ = (id) => tela.querySelector(`#${id}`);

    // ── Carregar ─────────────────────────────────────────────────────────────

    async function carregar() {
        $('data-inicio').value = periodo.inicio;
        $('data-fim').value = periodo.fim;
        try {
            const [resumo, lista] = await Promise.all([
                api.get(`/api/repasses/resumo?inicio=${periodo.inicio}&fim=${periodo.fim}`),
                api.get(`/api/repasses?inicio=${periodo.inicio}&fim=${periodo.fim}`)
            ]);
            repasses = lista;
            $('resumo-repasses').innerHTML = cartoesResumo(resumo, lista);
            $('lista-repasses').innerHTML = lista.length
                ? lista.map(linhaRepasse).join('')
                : '<p class="text-secondary p-4 mb-0">Nenhuma entrega neste período.</p>';
            if (souAdmin) {
                $('marcar-todas').checked = false;
                $('marcar-todas').disabled = !lista.some((r) => r.situacao === 'PENDENTE');
                atualizarBarra();
            }
        } catch (erro) {
            $('lista-repasses').innerHTML = `<p class="text-danger p-4 mb-0">${escapar(erro.message)}</p>`;
        }
    }

    function cartoesResumo(resumo, lista) {
        const entregas = lista.filter((r) => r.situacao !== 'CANCELADO').length;
        return `
            <div class="row g-2">
                <div class="col-12 col-md-4">
                    <div class="resumo-numero ${Number(resumo.totalPendente) > 0 ? 'resumo-alerta' : ''}">
                        <span class="resumo-rotulo">Falta pagar ao entregador</span>
                        <span class="resumo-valor">${reais(resumo.totalPendente)}</span>
                    </div>
                </div>
                <div class="col-6 col-md-4">
                    <div class="resumo-numero">
                        <span class="resumo-rotulo">Já pago</span>
                        <span class="resumo-valor">${reais(resumo.totalPago)}</span>
                    </div>
                </div>
                <div class="col-6 col-md-4">
                    <div class="resumo-numero">
                        <span class="resumo-rotulo">Entregas no período</span>
                        <span class="resumo-valor">${entregas}</span>
                    </div>
                </div>
            </div>`;
    }

    function linhaRepasse(r) {
        const { dia, mes, semana } = formatarDia(r.dataEntrega);
        const pendente = r.situacao === 'PENDENTE';
        let situacao;
        if (r.situacao === 'PAGO') {
            situacao = `<span class="badge selo-pago">Pago · ${r.formaPagamento === 'DINHEIRO' ? 'Dinheiro' : 'Pix'}</span>`;
        } else if (r.situacao === 'CANCELADO') {
            situacao = '<span class="badge selo-inativo">Cancelado</span>';
        } else {
            situacao = '<span class="badge selo-pendente">Pendente</span>';
        }
        // Só o ADMIN marca, e só o que está pendente.
        const marcador = souAdmin
            ? (pendente
                ? `<input class="form-check-input repasse-marcar" type="checkbox" value="${r.id}"
                          aria-label="Pagar a entrega ${escapar(r.localidade ?? '')} de ${dia}/${mes}">`
                : '<span class="repasse-marcar-vazio"></span>')
            : '';
        return `
            <label class="repasse ${pendente ? '' : 'repasse-fechado'} ${souAdmin ? 'repasse-com-marcador' : ''}">
                ${marcador}
                <span class="despesa-data">
                    <span class="despesa-dia">${dia}</span><span class="despesa-mes">/${mes}</span>
                    <span class="repasse-semana">${semana}</span>
                </span>
                <span class="repasse-info">
                    <span class="fw-bold d-block">${escapar(r.localidade ?? 'Entrega')}</span>
                    <span class="small text-secondary">Venda nº ${r.vendaId}${r.pagoPor ? ` · pago por ${escapar(r.pagoPor)}` : ''}</span>
                </span>
                <span class="despesa-lado">
                    <span class="despesa-valor d-block">${reais(r.valor)}</span>
                    ${situacao}
                </span>
            </label>`;
    }

    // ── Seleção e barra de pagamento (só ADMIN) ──────────────────────────────

    function selecionadas() {
        const ids = [...tela.querySelectorAll('.repasse-marcar:checked')].map((c) => Number(c.value));
        return repasses.filter((r) => ids.includes(r.id));
    }

    function atualizarBarra() {
        const escolhidas = selecionadas();
        const centavos = escolhidas.reduce((soma, r) => soma + Math.round(Number(r.valor) * 100), 0);
        $('barra-pagamento').classList.toggle('d-none', escolhidas.length === 0);
        $('qtd-selecionadas').textContent = `${escolhidas.length} ${escolhidas.length === 1 ? 'entrega marcada' : 'entregas marcadas'}`;
        $('total-selecionado').textContent = reais(centavos / 100);
        $('pagamento-erro').classList.add('d-none');
    }

    if (souAdmin) {
        $('lista-repasses').addEventListener('change', (evento) => {
            if (evento.target.classList.contains('repasse-marcar')) {
                const todas = tela.querySelectorAll('.repasse-marcar');
                $('marcar-todas').checked = todas.length > 0 && [...todas].every((c) => c.checked);
                atualizarBarra();
            }
        });

        $('marcar-todas').addEventListener('change', (evento) => {
            tela.querySelectorAll('.repasse-marcar').forEach((c) => { c.checked = evento.target.checked; });
            atualizarBarra();
        });

        $('pagar-entregador').addEventListener('click', async () => {
            const escolhidas = selecionadas();
            if (!escolhidas.length) return;
            const forma = tela.querySelector('input[name="forma-repasse"]:checked').value;
            const total = $('total-selecionado').textContent;
            const ok = await confirmar({
                titulo: `Pagar ${total} ao entregador?`,
                mensagem: `${escolhidas.length} ${escolhidas.length === 1 ? 'entrega' : 'entregas'}, `
                    + (forma === 'DINHEIRO'
                        ? 'com dinheiro da gaveta do caixa da pastelaria (sai do caixa).'
                        : 'pagas por Pix (não mexe na gaveta).')
                    + ' Depois de pago, não dá para desfazer.',
                textoConfirmar: 'Pagar'
            });
            if (!ok) return;

            const botao = $('pagar-entregador');
            botao.disabled = true;
            try {
                const resultado = await api.post('/api/repasses/pagar', {
                    ids: escolhidas.map((r) => r.id),
                    formaPagamento: forma
                });
                avisar(`${resultado.quantidade} ${resultado.quantidade === 1 ? 'entrega paga' : 'entregas pagas'}: ${reais(resultado.total)}.`);
                await carregar();
            } catch (erro) {
                // Ex.: "Nenhuma entrega foi paga: a entrega 12 já foi paga..." ou caixa fechado.
                // A lista é recarregada para mostrar o que mudou, e o erro fica visível.
                await carregar();
                $('barra-pagamento').classList.remove('d-none');
                $('pagamento-erro').textContent = erro.message;
                $('pagamento-erro').classList.remove('d-none');
            } finally {
                botao.disabled = false;
            }
        });
    }

    // ── Período ──────────────────────────────────────────────────────────────

    tela.querySelectorAll('input[name="periodo"]').forEach((opcao) => {
        opcao.addEventListener('change', async () => {
            periodo = PERIODOS[opcao.value]();
            await carregar();
        });
    });

    // Datas livres: ao mudar, desmarca os atalhos.
    const mudarDatas = async () => {
        const inicio = $('data-inicio').value;
        const fim = $('data-fim').value;
        if (!inicio || !fim) return;
        if (inicio > fim) {
            avisar('A data "De" precisa ser antes da data "Até".', 'warning');
            return;
        }
        tela.querySelectorAll('input[name="periodo"]').forEach((opcao) => { opcao.checked = false; });
        periodo = { inicio, fim };
        await carregar();
    };
    $('data-inicio').addEventListener('change', mudarDatas);
    $('data-fim').addEventListener('change', mudarDatas);

    await carregar();
}
