// Tela do caixa do dia (qualquer papel): o dinheiro da GAVETA do negócio escolhido.
//
//   Fechado → abrir com o troco inicial (e ver o último fechamento).
//   Aberto  → quanto deveria ter na gaveta, a conta aberta desse valor,
//             reforço (pôr troco), sangria (tirar dinheiro), histórico e fechamento.
//
// Toda conta de dinheiro é feita pelo BACKEND (esperado, composição, diferença final).
// A tela só mostra. A única conta daqui é a prévia da diferença enquanto a pessoa
// digita o valor contado, e o resultado oficial vem do backend ao fechar.

import { api } from '../api.js';
import { avisar, confirmar, dataHoraDaCasa, emCentavos, escapar, horaDaCasa, reais } from '../util.js';

const NOMES_NEGOCIO = { PASTELARIA: 'Pastelaria', PEIXARIA: 'Peixaria' };

export async function renderCaixa(tela, contexto) {
    const negocio = contexto.estado.negocio;
    if (!negocio) {
        contexto.irPara('#/negocio');
        return;
    }
    const nomeNegocio = NOMES_NEGOCIO[negocio] ?? negocio;

    tela.innerHTML = `
        <div class="cabecalho-tela cabecalho-com-acao">
            <div>
                <h1 class="h3 fw-bold mb-1">Caixa da ${escapar(nomeNegocio)}</h1>
                <p class="text-secondary mb-0">Veja quanto vendeu no dia e feche o caixa.</p>
            </div>
            <button id="caixa-atualizar" class="btn btn-sm btn-outline-secondary" type="button">Atualizar</button>
        </div>
        <div id="caixa-conteudo" aria-live="polite"><p class="text-secondary">Carregando…</p></div>`;

    const area = tela.querySelector('#caixa-conteudo');
    tela.querySelector('#caixa-atualizar').addEventListener('click', () => carregar());

    async function carregar() {
        let caixa = null;
        try {
            caixa = await api.get(`/api/caixas/aberto?negocio=${negocio}`);
        } catch (erro) {
            // 404 = não há caixa aberto. Qualquer outro erro é problema de verdade.
            if (erro.status !== 404) {
                area.innerHTML = `<div class="alert alert-danger">${escapar(erro.message)}</div>`;
                return;
            }
        }
        if (caixa) {
            desenharAberto(caixa);
        } else {
            await desenharFechado();
        }
    }

    // ── Caixa fechado: abrir ─────────────────────────────────────────────────

    async function desenharFechado() {
        let ultimo = null;
        try {
            const historico = await api.get(`/api/caixas?negocio=${negocio}`);
            ultimo = historico.find((c) => !c.aberto) ?? null;
        } catch {
            // O resumo do último fechamento é só informativo: sem ele, a tela segue.
        }

        area.innerHTML = `
            <div class="row g-4">
                <div class="col-12 col-lg-6">
                    <div class="card">
                        <div class="card-body p-4">
                            <span class="estado-caixa estado-fechado">Caixa fechado</span>
                            <h2 class="h4 fw-bold mt-3 mb-1">Abrir o caixa</h2>
                            <p class="text-secondary">Conte o dinheiro que já está na gaveta (o troco para começar).</p>
                            <form id="form-abrir" novalidate>
                                <label class="form-label" for="saldo-inicial">Dinheiro na gaveta agora</label>
                                <div class="input-group input-group-lg mb-3">
                                    <span class="input-group-text">R$</span>
                                    <input id="saldo-inicial" type="number" inputmode="decimal" class="form-control"
                                           min="0" step="0.01" placeholder="0,00" required>
                                </div>
                                <div id="abrir-erro" class="text-danger small mb-2 d-none" role="alert"></div>
                                <button class="btn btn-primary btn-lg w-100" type="submit">Abrir caixa</button>
                            </form>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-6">${ultimo ? cartaoUltimoFechamento(ultimo) : ''}</div>
            </div>`;

        const form = area.querySelector('#form-abrir');
        const campo = area.querySelector('#saldo-inicial');
        const erro = area.querySelector('#abrir-erro');
        form.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const saldo = lerReais(campo.value, { permitirZero: true });
            if (saldo.erro) {
                mostrarErroCampo(campo, erro, saldo.erro);
                return;
            }
            mostrarErroCampo(campo, erro, '');
            await enviar(form, () => api.post('/api/caixas', { negocio, saldoInicial: saldo.valor }), 'Caixa aberto.');
        });
        campo.focus();
    }

    function cartaoUltimoFechamento(c) {
        return `
            <div class="card h-100">
                <div class="card-body p-4">
                    <h2 class="h6 text-uppercase text-secondary fw-bold mb-3">Último fechamento</h2>
                    <p class="mb-3">${escapar(dataHoraDaCasa(c.fechadoEm))}, por ${escapar(c.fechadoPor)}</p>
                    ${c.resumoDoDia ? `
                        <dl class="resumo-fechamento mb-3">
                            <dt>Vendeu</dt><dd><strong>${reais(c.resumoDoDia.vendido)}</strong></dd>
                            <dt>Sobrou</dt><dd><strong>${reais(c.resumoDoDia.sobrou)}</strong></dd>
                        </dl>` : ''}
                    <dl class="resumo-fechamento mb-0">
                        <dt>Deveria ter</dt><dd>${reais(c.esperado)}</dd>
                        <dt>Foi contado</dt><dd>${reais(c.valorContado)}</dd>
                        <dt>Resultado</dt><dd>${textoDiferenca(Number(c.diferenca))}</dd>
                    </dl>
                    ${c.observacaoFechamento ? `<p class="small text-secondary mt-3 mb-0">“${escapar(c.observacaoFechamento)}”</p>` : ''}
                </div>
            </div>`;
    }

    // ── Resumo do dia ────────────────────────────────────────────────────────

    /**
     * Quanto vendeu e quanto sobrou. Os números vêm prontos do backend (campo
     * "resumoDoDia"); se ele ainda não mandar, o bloco simplesmente não aparece.
     */
    function resumoDoDia(r) {
        if (!r) return '';
        const negativo = Number(r.sobrou) < 0;
        return `
            <div class="card mb-4">
                <div class="card-body p-4">
                    <h2 class="h5 fw-bold mb-3">Resumo do dia</h2>
                    <div class="caixa-rotulo">Vendeu</div>
                    <div class="caixa-valor mb-3">${reais(r.vendido)}</div>
                    <dl class="resumo-fechamento mb-3">
                        <dt>No Pix</dt><dd>${reais(r.pix)}</dd>
                        <dt>No cartão</dt><dd>${reais(r.cartao)}</dd>
                        <dt>Em dinheiro</dt><dd>${reais(r.dinheiro)}</dd>
                    </dl>
                    <dl class="resumo-fechamento mb-0">
                        <dt>− Despesas pagas</dt><dd>${reais(r.despesasPagas)}</dd>
                        <dt>− Repasse ao entregador</dt><dd>${reais(r.repassesPagos)}</dd>
                        <dt><strong>= Sobrou</strong></dt>
                        <dd><strong>${negativo ? '−' : ''}${reais(Math.abs(Number(r.sobrou)))}</strong></dd>
                    </dl>
                </div>
            </div>`;
    }

    // ── Caixa aberto ─────────────────────────────────────────────────────────

    function desenharAberto(caixa) {
        area.innerHTML = `
            <div class="row g-4">
                <div class="col-12 col-lg-7">
                    ${resumoDoDia(caixa.resumoDoDia)}
                    <div class="card caixa-destaque mb-4">
                        <div class="card-body p-4">
                            <span class="estado-caixa estado-aberto">Caixa aberto</span>
                            <span class="small ms-2">desde ${escapar(horaDaCasa(caixa.abertoEm))}, por ${escapar(caixa.abertoPor)}</span>
                            <div class="caixa-rotulo mt-3">Deveria ter na gaveta agora</div>
                            <div class="caixa-valor">${reais(caixa.esperado)}</div>
                            <div class="d-flex flex-wrap gap-2 mt-3">
                                <button class="btn btn-warning" type="button" data-movimento="reforco">+ Pôr troco (reforço)</button>
                                <button class="btn btn-outline-light" type="button" data-movimento="sangria">− Tirar dinheiro (sangria)</button>
                            </div>
                        </div>
                    </div>

                    <div id="painel-movimento"></div>

                    <details class="card mb-4">
                        <summary class="card-body p-4 fw-bold h5 mb-0">De onde vem o dinheiro da gaveta</summary>
                        <div class="card-body px-4 pb-4 pt-0">
                            ${tabelaComposicao(caixa.composicao, caixa.esperado)}
                            <p class="small text-secondary mt-3 mb-0">Pix e cartão não entram: esse dinheiro não passa pela gaveta.</p>
                        </div>
                    </details>

                    <details class="card">
                        <summary class="card-body p-4 fw-bold h5 mb-0">Reforços e sangrias</summary>
                        <div class="card-body px-4 pb-4 pt-0">
                            ${listaMovimentos(caixa.movimentacoes)}
                        </div>
                    </details>
                </div>

                <div class="col-12 col-lg-5">
                    <div class="card caixa-fechar">
                        <div class="card-body p-4">
                            <h2 class="h5 fw-bold mb-3">Fechar o caixa</h2>
                            <form id="form-fechar" novalidate>
                                <label class="form-label" for="valor-contado">Dinheiro contado na gaveta</label>
                                <div class="input-group input-group-lg mb-2">
                                    <span class="input-group-text">R$</span>
                                    <input id="valor-contado" type="number" inputmode="decimal" class="form-control"
                                           min="0" step="0.01" placeholder="0,00" required>
                                </div>
                                <div id="fechar-erro" class="text-danger small mb-2 d-none" role="alert"></div>
                                <div id="previa-diferenca" class="previa-diferenca mb-3">
                                    Digite o valor contado para ver a diferença.
                                </div>
                                <label class="form-label" for="obs-fechamento" id="obs-rotulo">Observação (opcional)</label>
                                <textarea id="obs-fechamento" class="form-control mb-3" rows="2" maxlength="500"
                                          placeholder="Ex.: faltou R$ 2 no troco de uma venda"></textarea>
                                <button class="btn btn-primary btn-lg w-100" type="submit">Fechar caixa</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>`;

        prepararMovimentos(caixa);
        prepararFechamento(caixa);
    }

    /** A conta aberta: cada parcela com o seu sinal escrito, e o total. */
    function tabelaComposicao(c, esperado) {
        if (!c) return '';
        const linhas = [
            ['', 'Troco ao abrir', c.saldoInicial],
            ['+', 'Reforços (troco colocado)', c.reforcos],
            ['−', 'Sangrias (dinheiro retirado)', c.sangrias],
            ['+', 'Vendas em dinheiro', c.vendasDinheiro],
            ['−', 'Despesas pagas com dinheiro da gaveta', c.despesas],
            ['−', 'Repasses ao entregador pagos da gaveta', c.repasses]
        ];
        return `
            <div class="composicao">
                ${linhas.map(([sinal, nome, valor]) => `
                    <div class="composicao-linha ${Number(valor) === 0 && sinal ? 'composicao-zerada' : ''}">
                        <span class="composicao-sinal">${sinal}</span>
                        <span class="composicao-nome">${nome}</span>
                        <span class="composicao-valor">${reais(valor)}</span>
                    </div>`).join('')}
                <div class="composicao-linha composicao-total">
                    <span class="composicao-sinal">=</span>
                    <span class="composicao-nome">Deveria ter na gaveta</span>
                    <span class="composicao-valor">${reais(esperado)}</span>
                </div>
            </div>`;
    }

    function listaMovimentos(movimentos) {
        if (!movimentos?.length) {
            return '<p class="text-secondary mb-0">Nenhum reforço ou sangria neste caixa ainda.</p>';
        }
        // Mais recente primeiro.
        return `<ul class="lista-movimentos">${[...movimentos].reverse().map((m) => {
            const reforco = m.tipo === 'REFORCO';
            return `
                <li class="movimento">
                    <span class="movimento-hora">${escapar(horaDaCasa(m.quando))}</span>
                    <span class="movimento-texto">
                        <strong>${reforco ? 'Reforço' : 'Sangria'}</strong> por ${escapar(m.usuario)}
                        ${m.observacao ? `<span class="d-block small text-secondary">${escapar(m.observacao)}</span>` : ''}
                    </span>
                    <span class="movimento-valor ${reforco ? 'valor-entra' : 'valor-sai'}">
                        ${reforco ? '+' : '−'} ${reais(m.valor)}
                    </span>
                </li>`;
        }).join('')}</ul>`;
    }

    // ── Reforço e sangria ────────────────────────────────────────────────────

    function prepararMovimentos(caixa) {
        const painel = area.querySelector('#painel-movimento');

        area.querySelectorAll('[data-movimento]').forEach((botao) => {
            botao.addEventListener('click', () => {
                const reforco = botao.dataset.movimento === 'reforco';
                painel.innerHTML = `
                    <div class="card mb-4 painel-movimento">
                        <div class="card-body p-4">
                            <h2 class="h5 fw-bold mb-1">${reforco ? 'Pôr troco na gaveta' : 'Tirar dinheiro da gaveta'}</h2>
                            <p class="small text-secondary">${reforco
                                ? 'Use quando colocar mais dinheiro na gaveta, por exemplo para ter troco.'
                                : 'Use quando retirar dinheiro, por exemplo para guardar ou levar ao banco.'}</p>
                            <form id="form-movimento" novalidate>
                                <div class="row g-2">
                                    <div class="col-12 col-sm-5">
                                        <label class="form-label" for="mov-valor">Valor</label>
                                        <div class="input-group">
                                            <span class="input-group-text">R$</span>
                                            <input id="mov-valor" type="number" inputmode="decimal" class="form-control"
                                                   min="0.01" step="0.01" placeholder="0,00" required>
                                        </div>
                                    </div>
                                    <div class="col-12 col-sm-7">
                                        <label class="form-label" for="mov-obs">Observação (opcional)</label>
                                        <input id="mov-obs" class="form-control" maxlength="500"
                                               placeholder="${reforco ? 'Ex.: troco do dia' : 'Ex.: levado para o banco'}">
                                    </div>
                                </div>
                                <div id="mov-erro" class="text-danger small mt-2 d-none" role="alert"></div>
                                <div class="d-flex gap-2 mt-3">
                                    <button class="btn btn-primary" type="submit">${reforco ? 'Registrar reforço' : 'Registrar sangria'}</button>
                                    <button class="btn btn-outline-secondary" type="button" data-cancelar>Cancelar</button>
                                </div>
                            </form>
                        </div>
                    </div>`;

                const form = painel.querySelector('#form-movimento');
                const campoValor = painel.querySelector('#mov-valor');
                const erro = painel.querySelector('#mov-erro');
                painel.querySelector('[data-cancelar]').addEventListener('click', () => { painel.innerHTML = ''; });
                form.addEventListener('submit', async (evento) => {
                    evento.preventDefault();
                    const valor = lerReais(campoValor.value, { permitirZero: false });
                    if (valor.erro) {
                        mostrarErroCampo(campoValor, erro, valor.erro);
                        return;
                    }
                    mostrarErroCampo(campoValor, erro, '');
                    const observacao = painel.querySelector('#mov-obs').value.trim() || null;
                    const caminho = `/api/caixas/${caixa.id}/${reforco ? 'reforcos' : 'sangrias'}`;
                    await enviar(form, () => api.post(caminho, { valor: valor.valor, observacao }),
                        reforco ? 'Reforço registrado.' : 'Sangria registrada.', erro);
                });
                campoValor.focus();
            });
        });
    }

    // ── Fechamento ───────────────────────────────────────────────────────────

    function prepararFechamento(caixa) {
        const form = area.querySelector('#form-fechar');
        const campo = area.querySelector('#valor-contado');
        const erro = area.querySelector('#fechar-erro');
        const previa = area.querySelector('#previa-diferenca');
        const rotuloObs = area.querySelector('#obs-rotulo');
        const esperado = Number(caixa.esperado);

        // Prévia da diferença enquanto digita (o valor oficial vem do backend ao fechar).
        campo.addEventListener('input', () => {
            const contado = lerReais(campo.value, { permitirZero: true });
            if (campo.value === '' || contado.erro) {
                previa.className = 'previa-diferenca mb-3';
                previa.textContent = 'Digite o valor contado para ver a diferença.';
                rotuloObs.textContent = 'Observação (opcional)';
                return;
            }
            const diferenca = emCentavos(contado.valor) - emCentavos(esperado);
            previa.className = `previa-diferenca mb-3 ${classeDiferenca(diferenca)}`;
            previa.textContent = textoDiferenca(diferenca / 100);
            rotuloObs.textContent = diferenca === 0 ? 'Observação (opcional)' : 'Explique a diferença (recomendado)';
        });

        form.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const contado = lerReais(campo.value, { permitirZero: true });
            if (contado.erro) {
                mostrarErroCampo(campo, erro, contado.erro);
                return;
            }
            mostrarErroCampo(campo, erro, '');

            const diferenca = (emCentavos(contado.valor) - emCentavos(esperado)) / 100;
            const ok = await confirmar({
                titulo: `Fechar o caixa da ${nomeNegocio}?`,
                mensagem: `Deveria ter ${reais(esperado)} e foi contado ${reais(contado.valor)}. `
                    + `${textoDiferenca(diferenca)} Depois de fechado, nada mais entra neste caixa.`,
                textoConfirmar: 'Fechar caixa'
            });
            if (!ok) return;

            const observacao = area.querySelector('#obs-fechamento').value.trim() || null;
            await enviar(form, () => api.post(`/api/caixas/${caixa.id}/fechar`, { valorContado: contado.valor, observacao }),
                'Caixa fechado.', erro);
        });
    }

    // ── Utilidades da tela ───────────────────────────────────────────────────

    /** Envia, avisa e recarrega a tela. Em erro, mostra a mensagem do backend. */
    async function enviar(form, chamada, mensagemOk, caixaErro) {
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        try {
            await chamada();
            avisar(mensagemOk);
            await carregar();
        } catch (erro) {
            if (caixaErro) {
                caixaErro.textContent = erro.message;
                caixaErro.classList.remove('d-none');
            } else {
                avisar(erro.message, 'danger');
            }
            botao.disabled = false;
        }
    }

    await carregar();
}

/** Lê um valor em reais digitado. Devolve { valor } ou { erro } com uma mensagem clara. */
function lerReais(texto, { permitirZero }) {
    if (texto === '' || texto === null || texto === undefined) {
        return { erro: 'Informe o valor.' };
    }
    const valor = Number(texto);
    if (!Number.isFinite(valor) || valor < 0 || (!permitirZero && valor === 0)) {
        return { erro: permitirZero ? 'Informe um valor de zero para cima.' : 'Informe um valor maior que zero.' };
    }
    if (emCentavos(valor) / 100 !== valor) {
        return { erro: 'Use no máximo 2 casas depois da vírgula (centavos).' };
    }
    return { valor };
}


function mostrarErroCampo(campo, caixaErro, mensagem) {
    campo.classList.toggle('is-invalid', Boolean(mensagem));
    caixaErro.textContent = mensagem;
    caixaErro.classList.toggle('d-none', !mensagem);
}

/** Diferença em texto: o sentido está nas palavras, não só na cor. */
function textoDiferenca(diferenca) {
    if (diferenca === 0) return 'Bateu certinho.';
    return diferenca > 0
        ? `Sobrando ${reais(diferenca)} na gaveta.`
        : `Faltando ${reais(Math.abs(diferenca))} na gaveta.`;
}

function classeDiferenca(diferencaEmCentavos) {
    if (diferencaEmCentavos === 0) return 'diferenca-ok';
    return diferencaEmCentavos > 0 ? 'diferenca-sobra' : 'diferenca-falta';
}
