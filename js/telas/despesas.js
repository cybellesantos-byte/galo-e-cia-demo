// Tela de despesas e compras (qualquer papel), do negócio escolhido.
//
//   Resumo do mês → gasto, pago, pendente (e, na peixaria, kg comprados e preço médio).
//   Registrar     → descrição, categoria, data, valor (ou itens), quem comprou, pagamento.
//   Lista do mês  → pagas e pendentes; as pendentes podem ser pagas depois.
//
// Regras de verdade no backend: compra de peixe só na peixaria, peso só em compra
// de peixe, data não pode ser futura, dinheiro exige caixa aberto, itens só em
// ingredientes (e o valor é a soma deles). A tela só ajuda a acertar de primeira.

import { api } from '../api.js';
import { avisar, confirmar, escapar, quilos, reais } from '../util.js';

const NOMES_NEGOCIO = { PASTELARIA: 'Pastelaria', PEIXARIA: 'Peixaria' };

const CATEGORIAS = {
    INGREDIENTES: 'Ingredientes',
    EMBALAGENS: 'Embalagens',
    GAS_E_ENERGIA: 'Gás e energia',
    COMBUSTIVEL: 'Combustível',
    MANUTENCAO: 'Manutenção',
    COMPRA_DE_PEIXE: 'Compra de peixe',
    OUTROS: 'Outros'
};

const FORMAS = { PIX: 'Pix', CARTAO: 'Cartão', DINHEIRO: 'Dinheiro' };

const UNIDADES = { UNIDADE: 'unidade', KG: 'kg', G: 'g', LITRO: 'litro', ML: 'ml' };

/** Hoje no horário de Brasília, no formato do campo de data: "2026-10-29". */
function hojeNaCasa() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export async function renderDespesas(tela, contexto) {
    const negocio = contexto.estado.negocio;
    if (!negocio) {
        contexto.irPara('#/negocio');
        return;
    }
    const nomeNegocio = NOMES_NEGOCIO[negocio] ?? negocio;
    const peixaria = negocio === 'PEIXARIA';
    // Compra de peixe só aparece como opção na peixaria (o backend também barra).
    const categorias = Object.entries(CATEGORIAS).filter(([codigo]) => peixaria || codigo !== 'COMPRA_DE_PEIXE');
    let mes = hojeNaCasa().slice(0, 7);

    tela.innerHTML = `
        <div class="cabecalho-tela d-flex flex-wrap justify-content-between align-items-end gap-2">
            <div>
                <h1 class="h3 fw-bold mb-1">Despesas da ${escapar(nomeNegocio)}</h1>
                <p class="text-secondary mb-0">${peixaria
                    ? 'Compras de peixe e os outros gastos da peixaria.'
                    : 'Ingredientes, embalagens, gás e os outros gastos da pastelaria.'}</p>
            </div>
            <div class="d-flex align-items-end gap-2">
                <div>
                    <label class="form-label small mb-1" for="filtro-mes">Mês</label>
                    <input id="filtro-mes" type="month" class="form-control" value="${mes}" max="${mes}">
                </div>
            </div>
        </div>

        <div class="row g-4">
            <div class="col-12 col-lg-5 order-lg-2">
                <div class="card despesa-form-cartao">
                    <div class="card-body p-4">
                        <h2 class="h5 fw-bold mb-3">Registrar despesa</h2>
                        <div id="despesa-erro" class="alert alert-danger py-2 d-none" role="alert"></div>
                        <form id="form-despesa" novalidate>
                            <div class="mb-3">
                                <label class="form-label" for="desp-descricao">Descrição</label>
                                <input id="desp-descricao" class="form-control" maxlength="120" required
                                       placeholder="${peixaria ? 'Ex.: Tilápia do fornecedor' : 'Ex.: Farinha e óleo do mercado'}">
                                <div class="invalid-feedback">Diga o que foi comprado ou pago.</div>
                            </div>

                            <div class="row g-2 mb-3">
                                <div class="col-7">
                                    <label class="form-label" for="desp-categoria">Categoria</label>
                                    <select id="desp-categoria" class="form-select" required>
                                        <option value="">Escolha…</option>
                                        ${categorias.map(([codigo, nome]) => `<option value="${codigo}">${nome}</option>`).join('')}
                                    </select>
                                    <div class="invalid-feedback">Escolha a categoria.</div>
                                </div>
                                <div class="col-5">
                                    <label class="form-label" for="desp-data">Data</label>
                                    <input id="desp-data" type="date" class="form-control" value="${hojeNaCasa()}"
                                           max="${hojeNaCasa()}" required>
                                    <div class="invalid-feedback">Informe a data.</div>
                                </div>
                            </div>

                            <!-- Itens detalhados: só para ingredientes (opcional). -->
                            <div id="bloco-itens" class="mb-3 d-none">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" role="switch" id="detalhar-itens">
                                    <label class="form-check-label" for="detalhar-itens">Detalhar os itens da compra</label>
                                </div>
                                <div id="itens-area" class="d-none mt-2">
                                    <div id="itens-lista"></div>
                                    <button id="add-item" class="btn btn-sm btn-outline-secondary mt-1" type="button">+ Adicionar item</button>
                                    <div class="small text-secondary mt-2">
                                        Total dos itens: <strong id="itens-total">R$ 0,00</strong>
                                        (o valor final é a soma, calculada pelo sistema)
                                    </div>
                                </div>
                            </div>

                            <div class="row g-2 mb-3">
                                <div class="col-7" id="bloco-valor">
                                    <label class="form-label" for="desp-valor">Valor</label>
                                    <div class="input-group has-validation">
                                        <span class="input-group-text">R$</span>
                                        <input id="desp-valor" type="number" inputmode="decimal" class="form-control"
                                               min="0.01" step="0.01" placeholder="0,00">
                                        <div class="invalid-feedback" id="erro-valor">Informe um valor maior que zero.</div>
                                    </div>
                                </div>
                                <div class="col-5 d-none" id="bloco-peso">
                                    <label class="form-label" for="desp-peso">Peso (kg)</label>
                                    <input id="desp-peso" type="number" inputmode="decimal" class="form-control"
                                           min="0.001" step="0.001" placeholder="opcional">
                                    <div class="invalid-feedback">Use até 3 casas (gramas).</div>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label" for="desp-responsavel">Quem comprou ou pagou</label>
                                <input id="desp-responsavel" class="form-control" maxlength="60" required
                                       value="${escapar(contexto.estado.usuario?.nome ?? '')}">
                                <div class="invalid-feedback">Informe quem comprou ou pagou.</div>
                            </div>

                            <fieldset class="mb-3">
                                <legend class="form-label fs-6">Pagamento</legend>
                                <div class="opcoes-pagamento">
                                    ${opcaoPagamento('PENDENTE', 'Ainda não paga')}
                                    ${opcaoPagamento('PIX', 'Pix')}
                                    ${opcaoPagamento('CARTAO', 'Cartão')}
                                    ${opcaoPagamento('DINHEIRO', 'Dinheiro da gaveta')}
                                </div>
                                <div id="erro-pagamento" class="text-danger small mt-1 d-none">Escolha como foi (ou não) paga.</div>
                                <div id="aviso-dinheiro" class="small mt-2 d-none aviso-dinheiro">
                                    Sai da gaveta do caixa aberto e aparece na conta do caixa.
                                </div>
                            </fieldset>

                            <div class="mb-4">
                                <label class="form-label" for="desp-obs">Observação (opcional)</label>
                                <input id="desp-obs" class="form-control" maxlength="500">
                            </div>

                            <button class="btn btn-primary btn-lg w-100" type="submit">Registrar despesa</button>
                        </form>
                    </div>
                </div>
            </div>

            <div class="col-12 col-lg-7 order-lg-1">
                <div id="resumo-despesas" class="mb-4"></div>
                <div class="card">
                    <div class="card-body p-0" id="lista-despesas" aria-live="polite">
                        <p class="text-secondary p-4 mb-0">Carregando…</p>
                    </div>
                </div>
            </div>
        </div>`;

    const $ = (id) => tela.querySelector(`#${id}`);
    const form = $('form-despesa');

    // ── Resumo e lista do mês ────────────────────────────────────────────────

    async function carregar() {
        try {
            const [resumo, despesas] = await Promise.all([
                api.get(`/api/despesas/resumo?mes=${mes}&negocio=${negocio}`),
                api.get(`/api/despesas?mes=${mes}&negocio=${negocio}`)
            ]);
            $('resumo-despesas').innerHTML = cartoesResumo(resumo);
            $('lista-despesas').innerHTML = despesas.length
                ? despesas.map(linhaDespesa).join('')
                : '<p class="text-secondary p-4 mb-0">Nenhuma despesa registrada neste mês.</p>';
        } catch (erro) {
            $('lista-despesas').innerHTML = `<p class="text-danger p-4 mb-0">${escapar(erro.message)}</p>`;
        }
    }

    function cartoesResumo(r) {
        const extras = peixaria ? `
            <div class="col-6 col-md-4">
                <div class="resumo-numero">
                    <span class="resumo-rotulo">Peixe comprado</span>
                    <span class="resumo-valor">${quilos(r.kgComprados)} kg</span>
                </div>
            </div>
            <div class="col-6 col-md-4">
                <div class="resumo-numero">
                    <span class="resumo-rotulo">Preço médio do kg</span>
                    <span class="resumo-valor">${r.precoMedioPorKg == null ? '—' : reais(r.precoMedioPorKg)}</span>
                </div>
            </div>` : '';
        return `
            <div class="row g-2">
                <div class="col-12 col-md-4">
                    <div class="resumo-numero resumo-destaque">
                        <span class="resumo-rotulo">Gasto no mês</span>
                        <span class="resumo-valor">${reais(r.totalGasto)}</span>
                    </div>
                </div>
                <div class="col-6 col-md-4">
                    <div class="resumo-numero">
                        <span class="resumo-rotulo">Já pago</span>
                        <span class="resumo-valor">${reais(r.totalPago)}</span>
                    </div>
                </div>
                <div class="col-6 col-md-4">
                    <div class="resumo-numero ${Number(r.totalPendente) > 0 ? 'resumo-alerta' : ''}">
                        <span class="resumo-rotulo">A pagar</span>
                        <span class="resumo-valor">${reais(r.totalPendente)}</span>
                    </div>
                </div>
                ${extras}
            </div>`;
    }

    function linhaDespesa(d) {
        const [ano, mesDia, dia] = d.data.split('-');
        const detalhePeso = d.pesoKg != null
            ? ` · ${quilos(d.pesoKg)} kg (${reais(Number(d.valor) / Number(d.pesoKg))}/kg)`
            : '';
        const situacao = d.situacao === 'PAGO'
            ? `<span class="badge selo-pago">Paga · ${FORMAS[d.formaPagamento] ?? ''}</span>`
            : '<span class="badge selo-pendente">Pendente</span>';
        const itens = d.itens?.length ? `
            <details class="itens-despesa mt-1">
                <summary class="small">Ver ${d.itens.length} ${d.itens.length === 1 ? 'item' : 'itens'}</summary>
                <ul class="small mb-0">${d.itens.map((i) => `
                    <li>${escapar(i.descricao)}: ${quilos(i.quantidade).replace(/,000$/, '')} ${UNIDADES[i.unidade] ?? ''}
                        × ${reais(i.precoUnitario)} = <strong>${reais(i.total)}</strong></li>`).join('')}
                </ul>
            </details>` : '';
        return `
            <div class="despesa" data-id="${d.id}">
                <div class="despesa-data" aria-label="Dia ${dia}/${mesDia}/${ano}">
                    <span class="despesa-dia">${dia}</span><span class="despesa-mes">/${mesDia}</span>
                </div>
                <div class="despesa-info">
                    <div class="fw-bold">${escapar(d.descricao)}</div>
                    <div class="small text-secondary">${CATEGORIAS[d.categoria] ?? d.categoria} · ${escapar(d.responsavel)}${detalhePeso}</div>
                    ${d.observacao ? `<div class="small text-secondary">“${escapar(d.observacao)}”</div>` : ''}
                    ${itens}
                </div>
                <div class="despesa-lado">
                    <div class="despesa-valor">${reais(d.valor)}</div>
                    ${situacao}
                    ${d.situacao === 'PAGO' ? '' : `
                        <div class="despesa-pagar mt-2">
                            <button class="btn btn-sm btn-primary" type="button" data-pagar="${d.id}">Pagar</button>
                        </div>`}
                </div>
            </div>`;
    }

    // ── Pagar uma pendente ───────────────────────────────────────────────────

    $('lista-despesas').addEventListener('click', async (evento) => {
        const abrirPagamento = evento.target.closest('[data-pagar]');
        if (abrirPagamento) {
            // Troca o botão "Pagar" pelas três formas de pagamento.
            abrirPagamento.parentElement.innerHTML = `
                <div class="d-flex flex-wrap gap-1 justify-content-end">
                    ${Object.entries(FORMAS).map(([codigo, nome]) => `
                        <button class="btn btn-sm btn-outline-secondary" type="button"
                                data-forma="${codigo}" data-id="${abrirPagamento.dataset.pagar}">${nome}</button>`).join('')}
                    <button class="btn btn-sm btn-link text-secondary" type="button" data-cancelar-pagamento>Cancelar</button>
                </div>`;
            return;
        }
        if (evento.target.closest('[data-cancelar-pagamento]')) {
            await carregar();
            return;
        }
        const forma = evento.target.closest('[data-forma]');
        if (!forma) return;

        const linha = forma.closest('.despesa');
        const valor = linha.querySelector('.despesa-valor').textContent;
        const descricao = linha.querySelector('.despesa-info .fw-bold').textContent;
        // Dinheiro mexe na gaveta: pede confirmação.
        if (forma.dataset.forma === 'DINHEIRO') {
            const ok = await confirmar({
                titulo: 'Pagar com dinheiro da gaveta?',
                mensagem: `Vai sair ${valor} da gaveta do caixa da ${nomeNegocio} para pagar "${descricao}".`,
                textoConfirmar: 'Pagar'
            });
            if (!ok) return;
        }
        try {
            await api.post(`/api/despesas/${forma.dataset.id}/pagar`, { formaPagamento: forma.dataset.forma });
            avisar('Despesa paga.');
            await carregar();
        } catch (erro) {
            // Ex.: "Abra o caixa da peixaria antes de pagar em dinheiro."
            avisar(erro.message, 'danger');
        }
    });

    // ── Formulário: mostra só os campos que fazem sentido ────────────────────

    const campoCategoria = $('desp-categoria');
    campoCategoria.addEventListener('change', () => {
        const categoria = campoCategoria.value;
        // Peso: só em compra de peixe.
        $('bloco-peso').classList.toggle('d-none', categoria !== 'COMPRA_DE_PEIXE');
        if (categoria !== 'COMPRA_DE_PEIXE') $('desp-peso').value = '';
        // Itens: só em ingredientes.
        $('bloco-itens').classList.toggle('d-none', categoria !== 'INGREDIENTES');
        if (categoria !== 'INGREDIENTES') {
            $('detalhar-itens').checked = false;
            alternarItens(false);
        }
    });

    form.querySelectorAll('input[name="desp-pagamento"]').forEach((opcao) => {
        opcao.addEventListener('change', () => {
            $('erro-pagamento').classList.add('d-none');
            $('aviso-dinheiro').classList.toggle('d-none', opcao.value !== 'DINHEIRO' || !opcao.checked);
        });
    });

    // ── Itens detalhados ─────────────────────────────────────────────────────

    $('detalhar-itens').addEventListener('change', (evento) => alternarItens(evento.target.checked));
    $('add-item').addEventListener('click', () => adicionarItem());

    function alternarItens(ligado) {
        $('itens-area').classList.toggle('d-none', !ligado);
        // Com itens, o valor é a soma deles: o campo de valor some.
        $('bloco-valor').classList.toggle('d-none', ligado);
        if (ligado && !$('itens-lista').children.length) {
            adicionarItem();
        }
        if (!ligado) {
            $('itens-lista').innerHTML = '';
        }
        atualizarTotalItens();
    }

    function adicionarItem() {
        const linha = document.createElement('div');
        linha.className = 'item-linha';
        linha.innerHTML = `
            <input class="form-control form-control-sm item-desc" maxlength="120" placeholder="Item (ex.: Farinha)" aria-label="Item">
            <input class="form-control form-control-sm item-qtd" type="number" inputmode="decimal" min="0.001" step="0.001"
                   placeholder="Qtd" aria-label="Quantidade">
            <select class="form-select form-select-sm item-unidade" aria-label="Unidade">
                ${Object.entries(UNIDADES).map(([codigo, nome]) => `<option value="${codigo}">${nome}</option>`).join('')}
            </select>
            <input class="form-control form-control-sm item-preco" type="number" inputmode="decimal" min="0" step="0.01"
                   placeholder="R$ cada" aria-label="Preço por unidade">
            <button class="btn btn-sm btn-link text-danger item-remover" type="button" aria-label="Remover item">✕</button>`;
        linha.querySelector('.item-remover').addEventListener('click', () => {
            linha.remove();
            atualizarTotalItens();
        });
        linha.addEventListener('input', atualizarTotalItens);
        $('itens-lista').appendChild(linha);
        linha.querySelector('.item-desc').focus();
    }

    function lerItens() {
        return [...$('itens-lista').querySelectorAll('.item-linha')].map((linha) => ({
            descricao: linha.querySelector('.item-desc').value.trim(),
            quantidade: linha.querySelector('.item-qtd').value,
            unidade: linha.querySelector('.item-unidade').value,
            precoUnitario: linha.querySelector('.item-preco').value
        }));
    }

    /** Só uma prévia: o total oficial é calculado pelo backend. */
    function atualizarTotalItens() {
        const centavos = lerItens().reduce((soma, i) =>
            soma + Math.round(Number(i.quantidade || 0) * Number(i.precoUnitario || 0) * 100), 0);
        $('itens-total').textContent = reais(centavos / 100);
    }

    // ── Enviar ───────────────────────────────────────────────────────────────

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        $('despesa-erro').classList.add('d-none');

        const descricao = $('desp-descricao').value.trim();
        const categoria = campoCategoria.value;
        const data = $('desp-data').value;
        const responsavel = $('desp-responsavel').value.trim();
        const pagamento = form.querySelector('input[name="desp-pagamento"]:checked')?.value;
        const usaItens = $('detalhar-itens').checked;
        const valorTexto = $('desp-valor').value;
        const pesoTexto = $('desp-peso').value;

        const valorOk = usaItens || (Number(valorTexto) > 0 && centavosExatos(valorTexto, 2));
        const pesoOk = pesoTexto === '' || (Number(pesoTexto) > 0 && centavosExatos(pesoTexto, 3));
        const marcar = (id, ok) => $(id).classList.toggle('is-invalid', !ok);
        marcar('desp-descricao', descricao !== '');
        marcar('desp-categoria', categoria !== '');
        marcar('desp-data', data !== '');
        marcar('desp-responsavel', responsavel !== '');
        marcar('desp-valor', valorOk);
        marcar('desp-peso', pesoOk);
        $('erro-pagamento').classList.toggle('d-none', Boolean(pagamento));

        const itens = usaItens ? lerItens() : null;
        const itensOk = !usaItens || (itens.length > 0 && itens.every((i) =>
            i.descricao && Number(i.quantidade) > 0 && i.precoUnitario !== '' && Number(i.precoUnitario) >= 0));
        if (!itensOk) {
            mostrarErro('Preencha item, quantidade e preço de cada linha (ou remova as linhas vazias).');
        }

        if (!descricao || !categoria || !data || !responsavel || !valorOk || !pesoOk || !pagamento || !itensOk) {
            form.querySelector('.is-invalid')?.focus();
            return;
        }

        const corpo = {
            negocio,
            descricao,
            categoria,
            data,
            responsavel,
            valor: usaItens ? null : Number(valorTexto),
            pesoKg: pesoTexto === '' ? null : Number(pesoTexto),
            formaPagamento: pagamento === 'PENDENTE' ? null : pagamento,
            observacao: $('desp-obs').value.trim() || null,
            itens: usaItens ? itens.map((i) => ({
                descricao: i.descricao,
                quantidade: Number(i.quantidade),
                unidade: i.unidade,
                precoUnitario: Number(i.precoUnitario)
            })) : null
        };

        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        try {
            await api.post('/api/despesas', corpo);
            avisar(pagamento === 'PENDENTE' ? 'Despesa registrada como pendente.' : 'Despesa registrada.');
            limparFormulario();
            // Mostra o mês da despesa que acabou de entrar.
            mes = data.slice(0, 7);
            $('filtro-mes').value = mes;
            await carregar();
        } catch (erro) {
            // Ex.: "Abra o caixa da pastelaria antes de pagar em dinheiro."
            mostrarErro(erro.message);
        } finally {
            botao.disabled = false;
        }
    });

    function mostrarErro(mensagem) {
        $('despesa-erro').textContent = mensagem;
        $('despesa-erro').classList.remove('d-none');
    }

    function limparFormulario() {
        const responsavel = $('desp-responsavel').value;
        form.reset();
        $('desp-responsavel').value = responsavel;   // quem comprou costuma ser a mesma pessoa
        $('desp-data').value = hojeNaCasa();
        $('aviso-dinheiro').classList.add('d-none');
        campoCategoria.dispatchEvent(new Event('change'));
        form.querySelectorAll('.is-invalid').forEach((c) => c.classList.remove('is-invalid'));
    }

    $('filtro-mes').addEventListener('change', async (evento) => {
        if (!evento.target.value) return;
        mes = evento.target.value;
        await carregar();
    });

    await carregar();
}

function opcaoPagamento(valor, rotulo) {
    const id = `pag-${valor.toLowerCase()}`;
    return `
        <input type="radio" class="btn-check" name="desp-pagamento" id="${id}" value="${valor}">
        <label class="btn btn-outline-secondary" for="${id}">${rotulo}</label>`;
}

/** true se o número digitado tem no máximo "casas" casas depois da vírgula. */
function centavosExatos(texto, casas) {
    const fator = 10 ** casas;
    const valor = Number(texto);
    return Math.round(valor * fator) / fator === valor;
}
