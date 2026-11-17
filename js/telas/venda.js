// Venda rápida: escolher produtos, origem, entrega, pagamento e registrar.
// O backend recalcula tudo (preço, taxa, total e troco). Aqui os valores
// são só para a pessoa ver enquanto monta o pedido.
//
// Visual do estilo B (docs/PLANO_VISUAL.md): cartões grandes por categoria,
// busca, e o pedido ao lado (computador) ou num painel que sobe (celular).

import { api, ErroApi } from '../api.js';
import { avisar, emCentavos, escapar, horaDaCasa, novoUuid, quilos, reais } from '../util.js';
import { compararCategorias, semAcento } from '../categorias.js';

const ORIGENS = [['BALCAO', 'Balcão'], ['WHATSAPP', 'WhatsApp']];
const FORMAS = [['DINHEIRO', 'Dinheiro'], ['PIX', 'Pix'], ['CARTAO', 'Cartão']];

/**
 * Peso digitado do jeito brasileiro: "1,35" ou "1.35" → 1.35. Se tiver vírgula,
 * o ponto é separador de milhar e sai. Devolve NaN se não for um número.
 */
function lerDecimal(texto) {
    let limpo = String(texto ?? '').trim().replace(/\s/g, '');
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    return limpo === '' ? NaN : Number(limpo);
}

/**
 * Preço × quantidade em centavos, arredondado como o backend (meio centavo
 * para cima). A quantidade vira milésimos (1,350 kg → 1350) para a conta ser
 * toda com números inteiros, que não erram.
 */
function totalDoItemCentavos(produto, quantidade) {
    const milesimos = Math.round(Number(quantidade) * 1000);
    return Math.floor((emCentavos(produto.preco) * milesimos + 500) / 1000);
}

export async function renderVenda(tela, contexto) {
    const negocio = contexto.estado.negocio;
    if (!negocio) {
        contexto.irPara('#/negocio');
        return;
    }
    const pastelaria = negocio === 'PASTELARIA';
    const nomeNegocio = pastelaria ? 'Pastelaria' : 'Peixaria';

    // A chave identifica esta venda: se a rede falhar e a pessoa tocar de novo,
    // o backend reconhece a mesma venda e não cobra duas vezes.
    const pedido = {
        quantidades: new Map(),   // produtoId -> { produto, quantidade }
        origem: 'BALCAO',
        tipo: 'RETIRADA',
        localidadeId: null,
        forma: 'DINHEIRO'
    };
    const pesando = new Set();    // produtos por kg com o campo de peso aberto
    let chave = novoUuid();
    let produtos = [];
    let localidades = [];
    let enviando = false;

    // Tudo fica dentro de uma raiz própria. Ao trocar de tela, a raiz inteira é
    // descartada, junto com os eventos dela, e nada antigo continua ativo.
    tela.innerHTML = `
        <div id="venda-raiz" class="venda">
            <div id="caixa-area" class="mb-3"></div>
            <div id="venda-area" class="venda-grade d-none">
                <section class="venda-produtos" aria-label="Produtos">
                    <label class="venda-busca">
                        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                        <span class="visually-hidden">Buscar produto</span>
                        <input id="busca-produto" type="search" autocomplete="off" placeholder="Buscar no cardápio…">
                    </label>
                    <div id="lista-produtos" aria-live="polite"></div>
                </section>

                <aside id="painel-pedido" class="venda-pedido offcanvas-lg offcanvas-bottom" tabindex="-1"
                       aria-labelledby="titulo-pedido">
                    <div class="offcanvas-header d-lg-none">
                        <h2 class="h4 mb-0">Seu pedido</h2>
                        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#painel-pedido"
                                aria-label="Voltar aos produtos"></button>
                    </div>
                    <div class="offcanvas-body">
                        <div class="card pedido-cartao">
                            <div class="card-body">
                                <h2 id="titulo-pedido" class="h4 mb-3">Pedido · ${escapar(nomeNegocio)}</h2>
                                <ul id="lista-pedido" class="pedido-lista"></ul>

                                <div class="mb-3">
                                    <div class="form-label">Origem</div>
                                    <div id="grupo-origem" class="btn-group grupo-grande w-100" role="group" aria-label="Origem"></div>
                                </div>

                                ${pastelaria ? `
                                <div class="mb-3">
                                    <div class="form-label">Tipo</div>
                                    <div id="grupo-tipo" class="btn-group grupo-grande w-100" role="group" aria-label="Tipo">
                                        <input type="radio" class="btn-check" name="tipo" id="tipo-retirada" value="RETIRADA" checked>
                                        <label class="btn btn-outline-secondary" for="tipo-retirada">Retirada</label>
                                        <input type="radio" class="btn-check" name="tipo" id="tipo-entrega" value="ENTREGA">
                                        <label class="btn btn-outline-secondary" for="tipo-entrega">Entrega</label>
                                    </div>
                                    <div id="bloco-entrega" class="row g-2 mt-2 d-none">
                                        <div class="col-7">
                                            <label class="form-label small" for="localidade">Localidade</label>
                                            <select id="localidade" class="form-select"></select>
                                        </div>
                                        <div class="col-5">
                                            <label class="form-label small" for="taxa-entrega">Taxa (R$)</label>
                                            <input id="taxa-entrega" type="number" inputmode="decimal" class="form-control" min="0" step="0.01">
                                        </div>
                                    </div>
                                </div>` : ''}

                                <div class="mb-3">
                                    <div class="form-label">Pagamento</div>
                                    <div id="grupo-forma" class="btn-group grupo-grande w-100" role="group" aria-label="Pagamento"></div>
                                    <div id="bloco-dinheiro" class="mt-2">
                                        <label class="form-label small" for="valor-recebido">Valor recebido (R$)</label>
                                        <input id="valor-recebido" type="number" inputmode="decimal" class="form-control form-control-lg" min="0" step="0.01">
                                        <div id="troco" class="small mt-1" aria-live="polite"></div>
                                    </div>
                                </div>

                                <div class="mb-1">
                                    <label class="form-label" for="observacao">Observação</label>
                                    <textarea id="observacao" class="form-control" rows="2" maxlength="500"></textarea>
                                </div>
                            </div>
                            <div class="card-footer pedido-rodape">
                                <div class="d-flex justify-content-between align-items-baseline mb-2">
                                    <span class="fw-bold">Total</span>
                                    <span id="total" class="pedido-total">R$ 0,00</span>
                                </div>
                                <button id="confirmar" class="btn btn-primary btn-lg w-100" type="button" disabled>
                                    Registrar venda
                                </button>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            <button id="barra-pedido" class="barra-pedido d-none" type="button"
                    data-bs-toggle="offcanvas" data-bs-target="#painel-pedido" aria-controls="painel-pedido"></button>
        </div>`;

    const raiz = tela.querySelector('#venda-raiz');
    const $ = (id) => raiz.querySelector('#' + id);

    // ── Caixa ────────────────────────────────────────────────────────────────

    /** Mostra o caixa aberto, ou o formulário para abrir. Devolve true se estiver aberto. */
    async function carregarCaixa() {
        try {
            const caixa = await api.get(`/api/caixas/aberto?negocio=${negocio}`);
            $('caixa-area').innerHTML = `
                <div class="venda-caixa">
                    <span><span class="ponto-aberto" aria-hidden="true"></span> Caixa aberto desde ${escapar(horaDaCasa(caixa.abertoEm))}</span>
                    <span>Na gaveta: <strong>${reais(caixa.esperado)}</strong></span>
                </div>`;
            $('venda-area').classList.remove('d-none');
            $('barra-pedido').classList.remove('d-none');
            return true;
        } catch (erro) {
            if (erro instanceof ErroApi && erro.status === 404) {
                mostrarAbrirCaixa();
                return false;
            }
            throw erro;
        }
    }

    function mostrarAbrirCaixa() {
        $('caixa-area').innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h2 class="h4">Caixa fechado</h2>
                    <p class="text-muted mb-3">Abra o caixa para começar as vendas deste ${escapar(nomeNegocio.toLowerCase())}.</p>
                    <form id="form-abrir-caixa" class="row g-2 align-items-end" novalidate>
                        <div class="col-8">
                            <label class="form-label" for="saldo-inicial">Dinheiro na gaveta ao abrir (R$)</label>
                            <input id="saldo-inicial" type="number" inputmode="decimal" class="form-control form-control-lg" min="0" step="0.01" required>
                        </div>
                        <div class="col-4">
                            <button class="btn btn-primary btn-lg w-100" type="submit">Abrir</button>
                        </div>
                    </form>
                </div>
            </div>`;
        $('venda-area').classList.add('d-none');
        $('barra-pedido').classList.add('d-none');

        $('form-abrir-caixa').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const saldo = $('saldo-inicial').value;
            if (saldo === '') {
                avisar('Informe o dinheiro que está na gaveta.', 'warning');
                return;
            }
            try {
                await api.post('/api/caixas', { negocio, saldoInicial: Number(saldo) });
                avisar('Caixa aberto.');
                // Recomeça a tela para carregar produtos e localidades com o caixa aberto.
                await renderVenda(tela, contexto);
            } catch (erro) {
                avisar(erro.message, 'danger');
            }
        });
    }

    // ── Produtos e localidades ───────────────────────────────────────────────

    async function carregarProdutos() {
        const todos = await api.get(`/api/produtos?negocio=${negocio}`);
        // Só entra na venda o que está na lista (ativo) e não está esgotado (disponível).
        produtos = todos
            .filter((p) => p.ativo && p.disponivel)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        desenharProdutos();
    }

    /** Os produtos que passam na busca, agrupados por categoria, na ordem da tela. */
    function gruposVisiveis() {
        const termo = semAcento($('busca-produto').value);
        const porCategoria = new Map();
        for (const produto of produtos) {
            if (termo && !semAcento(produto.nome).includes(termo)) continue;
            const categoria = produto.categoria?.trim() || 'Outros';
            if (!porCategoria.has(categoria)) porCategoria.set(categoria, []);
            porCategoria.get(categoria).push(produto);
        }
        return [...porCategoria.keys()].sort(compararCategorias)
            .map((categoria, i) => ({ categoria, ancora: `secao-${i}`, itens: porCategoria.get(categoria) }));
    }

    function desenharProdutos() {
        const area = $('lista-produtos');
        if (produtos.length === 0) {
            area.innerHTML = `
                <div class="alert alert-info mb-0">
                    Nenhum produto disponível para venda.
                    <a href="#/produtos" class="alert-link">Cadastre ou libere produtos</a> antes de vender.
                </div>`;
            return;
        }
        const grupos = gruposVisiveis();
        area.innerHTML = grupos.length === 0
            ? `<p class="venda-vazio">Nada encontrado com “${escapar($('busca-produto').value)}”.</p>`
            : grupos.map((g) => `
                <section id="${g.ancora}" class="venda-secao" aria-label="${escapar(g.categoria)}">
                    <h2 class="venda-secao-titulo">${escapar(g.categoria)}</h2>
                    <div class="venda-cartoes">${g.itens.map(cartaoDoProduto).join('')}</div>
                </section>`).join('');
    }

    /**
     * Um produto, numa linha, igual ao cardápio do cliente: nome e preço à esquerda e, à direita,
     * o botão redondo "+". Depois de escolhido, o botão vira "− 2 +". Só os botões mexem no
     * pedido (tocar no resto da linha não faz nada), para não somar sem querer ao rolar a lista.
     * Peixe por kg: o "+" abre o campo do peso, que aparece embaixo da linha.
     */
    function cartaoDoProduto(produto) {
        const porKg = produto.unidadeVenda === 'KG';
        const item = pedido.quantidades.get(produto.id);
        const quantidade = item?.quantidade ?? 0;
        const escolhido = quantidade > 0 || pesando.has(produto.id);
        const preco = `${reais(produto.preco)}${porKg ? ' / kg' : ''}`;
        const nome = escapar(produto.nome);

        let controle = '';
        let pesoAberto = '';
        if (porKg) {
            if (pesando.has(produto.id)) {
                pesoAberto = `
                    <div class="produto-kg">
                        <label class="visually-hidden" for="peso-${produto.id}">Peso de ${nome} em kg</label>
                        <input id="peso-${produto.id}" class="form-control produto-peso" data-id="${produto.id}" type="text"
                               inputmode="decimal" autocomplete="off" placeholder="0,000" value="${quantidade ? quilos(quantidade) : ''}">
                        <span>kg</span>
                        <button type="button" class="produto-remover" data-acao="remover" data-id="${produto.id}"
                                aria-label="Tirar ${nome} do pedido">✕</button>
                    </div>`;
            } else {
                controle = `<button type="button" class="prod-mais" data-acao="mais" data-id="${produto.id}"
                                    aria-label="Informar o peso de ${nome}, ${preco}">+</button>`;
            }
        } else if (quantidade === 0) {
            controle = `<button type="button" class="prod-mais" data-acao="mais" data-id="${produto.id}"
                                aria-label="Adicionar ${nome}, ${preco}">+</button>`;
        } else {
            controle = `
                <div class="prod-passo" role="group" aria-label="Quantidade de ${nome}">
                    <button type="button" data-acao="menos" data-id="${produto.id}" aria-label="Tirar um ${nome}">−</button>
                    <span class="prod-qtd" aria-live="polite">${quantidade}</span>
                    <button type="button" data-acao="mais" data-id="${produto.id}" aria-label="Mais um ${nome}">+</button>
                </div>`;
        }

        return `
            <div class="produto-item prod-linha ${escolhido ? 'escolhido' : ''}" data-item="${produto.id}">
                <div class="prod-texto">
                    <span class="produto-nome">${nome}</span>
                    <span class="produto-preco">${preco}</span>
                </div>
                ${controle}
                ${pesoAberto}
            </div>`;
    }

    /** Redesenha só um cartão (mantém o resto da tela e a rolagem como estão). */
    function atualizarCartao(id) {
        const antigo = raiz.querySelector(`[data-item="${id}"]`);
        const produto = produtos.find((p) => p.id === id);
        if (antigo && produto) antigo.outerHTML = cartaoDoProduto(produto);
    }

    async function carregarLocalidades() {
        if (!pastelaria) return;
        localidades = (await api.get('/api/localidades')).filter((l) => l.ativo);
        $('localidade').innerHTML = localidades
            .map((l) => `<option value="${l.id}" data-taxa="${l.taxa}">${escapar(l.nome)} — ${reais(l.taxa)}</option>`)
            .join('');
        if (localidades.length > 0) {
            pedido.localidadeId = localidades[0].id;
            $('taxa-entrega').value = localidades[0].taxa;
        }
    }

    // ── Mudar quantidades ────────────────────────────────────────────────────

    function somar(id, delta) {
        const produto = produtos.find((p) => p.id === id);
        if (!produto) return;
        const nova = (pedido.quantidades.get(id)?.quantidade ?? 0) + delta;
        if (nova > 0) {
            pedido.quantidades.set(id, { produto, quantidade: nova });
        } else {
            pedido.quantidades.delete(id);
        }
        atualizarCartao(id);
        desenharPedido();
    }

    function abrirPeso(id) {
        pesando.add(id);
        atualizarCartao(id);
        raiz.querySelector(`#peso-${id}`)?.focus();
    }

    function remover(id) {
        pedido.quantidades.delete(id);
        pesando.delete(id);
        atualizarCartao(id);
        desenharPedido();
    }

    // ── Cálculos mostrados na tela (o backend é quem decide) ─────────────────
    //
    // Tudo em CENTAVOS INTEIROS. Em reais quebrados, 5,20 + 4,40 dá
    // 9,600000000000001, e quem pagasse R$ 9,60 certinho via "Falta R$ 0,00".

    function subtotalCentavos() {
        let soma = 0;
        for (const { produto, quantidade } of pedido.quantidades.values()) {
            soma += totalDoItemCentavos(produto, quantidade);
        }
        return soma;
    }

    function taxaDaEntregaCentavos() {
        if (!pastelaria || pedido.tipo !== 'ENTREGA') return 0;
        return emCentavos($('taxa-entrega').value || 0);
    }

    function totalDoPedidoCentavos() {
        return subtotalCentavos() + taxaDaEntregaCentavos();
    }

    // ── Desenho do pedido ────────────────────────────────────────────────────

    function desenharPedido() {
        const itens = [...pedido.quantidades.values()];
        $('lista-pedido').innerHTML = itens.length === 0
            ? '<li class="pedido-vazio">Nenhum item ainda. Toque nos produtos para adicionar.</li>'
            : itens.map(({ produto, quantidade }) => {
                const porKg = produto.unidadeVenda === 'KG';
                const nome = escapar(produto.nome);
                return `
                    <li class="pedido-item">
                        <span class="pedido-item-nome"><strong>${porKg ? `${quilos(quantidade)} kg` : `${quantidade}×`}</strong> ${nome}</span>
                        <span class="pedido-item-valor">${reais(totalDoItemCentavos(produto, quantidade) / 100)}</span>
                        ${porKg
                            ? `<button type="button" class="pedido-botao" data-acao="remover" data-id="${produto.id}" aria-label="Tirar ${nome} do pedido">✕</button>`
                            : `<span class="pedido-botoes">
                                   <button type="button" class="pedido-botao" data-acao="menos" data-id="${produto.id}" aria-label="Tirar um ${nome}">−</button>
                                   <button type="button" class="pedido-botao" data-acao="mais" data-id="${produto.id}" aria-label="Mais um ${nome}">+</button>
                               </span>`}
                    </li>`;
            }).join('');

        const total = reais(totalDoPedidoCentavos() / 100);
        $('total').textContent = total;
        desenharTroco();
        $('confirmar').disabled = enviando || itens.length === 0;

        // Barra do celular: quantos itens e o total, sempre à vista.
        const unidades = itens.reduce((soma, { produto, quantidade }) => soma + (produto.unidadeVenda === 'KG' ? 1 : quantidade), 0);
        $('barra-pedido').innerHTML = itens.length === 0
            ? '<span>Toque num produto para começar</span>'
            : `<span>Ver pedido · ${unidades} ${unidades === 1 ? 'item' : 'itens'}</span><strong>${total}</strong>`;
        $('barra-pedido').classList.toggle('vazia', itens.length === 0);
    }

    function desenharTroco() {
        const dinheiro = pedido.forma === 'DINHEIRO';
        $('bloco-dinheiro').classList.toggle('d-none', !dinheiro);
        if (!dinheiro) return;

        const campo = $('valor-recebido');
        const saida = $('troco');
        if (campo.value === '' || totalDoPedidoCentavos() === 0) {
            saida.textContent = '';
            return;
        }
        const recebido = emCentavos(campo.value);
        const total = totalDoPedidoCentavos();
        if (recebido < total) {
            saida.className = 'small mt-1 text-danger fw-bold';
            saida.textContent = `Falta ${reais((total - recebido) / 100)}`;
        } else {
            saida.className = 'small mt-1 text-success fw-bold';
            saida.textContent = `Troco: ${reais((recebido - total) / 100)}`;
        }
    }

    function desenharGrupos() {
        $('grupo-origem').innerHTML = ORIGENS.map(([valor, rotulo]) => `
            <input type="radio" class="btn-check" name="origem" id="origem-${valor}" value="${valor}" ${pedido.origem === valor ? 'checked' : ''}>
            <label class="btn btn-outline-secondary" for="origem-${valor}">${rotulo}</label>`).join('');

        $('grupo-forma').innerHTML = FORMAS.map(([valor, rotulo]) => `
            <input type="radio" class="btn-check" name="forma" id="forma-${valor}" value="${valor}" ${pedido.forma === valor ? 'checked' : ''}>
            <label class="btn btn-outline-secondary" for="forma-${valor}">${rotulo}</label>`).join('');
    }

    // ── Eventos (ficam na raiz, que é descartada ao trocar de tela) ──────────

    raiz.addEventListener('input', (evento) => {
        const alvo = evento.target;
        if (alvo.id === 'busca-produto') {
            desenharProdutos();
            return;
        }
        if (alvo.classList.contains('produto-peso')) {
            // Peso: só atualiza o pedido; o campo não é redesenhado (perderia o cursor).
            const id = Number(alvo.dataset.id);
            const produto = produtos.find((p) => p.id === id);
            const kg = lerDecimal(alvo.value);
            const valido = Number.isFinite(kg) && kg > 0 && Math.round(kg * 1000) / 1000 === kg;
            alvo.classList.toggle('is-invalid', alvo.value.trim() !== '' && !valido);
            if (produto && valido) {
                pedido.quantidades.set(id, { produto, quantidade: kg });
            } else {
                pedido.quantidades.delete(id);
            }
            raiz.querySelector(`[data-item="${id}"]`)?.classList.add('escolhido');
        }
        desenharPedido();
    });

    raiz.addEventListener('change', (evento) => {
        const alvo = evento.target;
        if (alvo.name === 'origem') pedido.origem = alvo.value;
        if (alvo.name === 'forma') pedido.forma = alvo.value;
        if (alvo.name === 'tipo') {
            pedido.tipo = alvo.value;
            $('bloco-entrega').classList.toggle('d-none', pedido.tipo !== 'ENTREGA');
        }
        if (alvo.id === 'localidade') {
            pedido.localidadeId = Number(alvo.value);
            $('taxa-entrega').value = alvo.selectedOptions[0].dataset.taxa;
        }
        if (alvo.classList.contains('produto-peso')) {
            // Ao sair do campo, mostra o peso no formato da casa (1,350) e atualiza o selo.
            atualizarCartao(Number(alvo.dataset.id));
        }
        desenharPedido();
    });

    raiz.addEventListener('click', (evento) => {
        const botao = evento.target.closest('button');
        if (!botao) return;
        if (botao.id === 'confirmar') {
            registrarVenda();
            return;
        }
        const id = Number(botao.dataset.id);
        const produto = produtos.find((p) => p.id === id);
        if (!produto) return;
        const porKg = produto.unidadeVenda === 'KG';
        if (botao.dataset.acao === 'mais') {
            if (porKg) abrirPeso(id); else somar(id, 1);
        } else if (botao.dataset.acao === 'menos') {
            somar(id, -1);
        } else if (botao.dataset.acao === 'remover') {
            remover(id);
        }
    });

    async function registrarVenda() {
        if (enviando || pedido.quantidades.size === 0) return;

        const entrega = pastelaria && pedido.tipo === 'ENTREGA';
        // Só manda a taxa se ela for diferente da padrão da localidade.
        const taxaPadrao = entrega
            ? Number(localidades.find((l) => l.id === pedido.localidadeId)?.taxa)
            : null;
        const taxaTela = entrega ? Number($('taxa-entrega').value) : null;

        const corpo = {
            chaveDaVenda: chave,
            negocio,
            origem: pedido.origem,
            tipo: entrega ? 'ENTREGA' : 'RETIRADA',
            localidadeId: entrega ? pedido.localidadeId : null,
            formaPagamento: pedido.forma,
            valorRecebido: pedido.forma === 'DINHEIRO' ? Number($('valor-recebido').value) : null,
            observacao: $('observacao').value.trim() || null,
            itens: [...pedido.quantidades.values()].map(({ produto, quantidade }) => ({
                produtoId: produto.id,
                quantidade
            })),
            taxaEntrega: entrega && taxaTela !== taxaPadrao ? taxaTela : null
        };

        enviando = true;
        desenharPedido();
        try {
            await api.post('/api/vendas', corpo);
            const total = totalDoPedidoCentavos();
            const recebido = pedido.forma === 'DINHEIRO' ? emCentavos($('valor-recebido').value) : null;
            avisar(`Venda registrada: ${reais(total / 100)}` +
                (recebido !== null ? `. Troco ${reais((recebido - total) / 100)}` : ''));
            limparPedido();
            // No celular, o painel do pedido fecha e a pessoa volta aos produtos.
            bootstrap.Offcanvas.getInstance($('painel-pedido'))?.hide();
            await carregarCaixa();
        } catch (erro) {
            // A chave é mantida: se o erro foi de rede, a próxima tentativa não duplica.
            avisar(erro.message, 'danger');
        } finally {
            enviando = false;
            desenharPedido();
        }
    }

    function limparPedido() {
        pedido.quantidades.clear();
        pesando.clear();
        $('observacao').value = '';
        $('valor-recebido').value = '';
        $('busca-produto').value = '';
        desenharProdutos();
        // Venda concluída: a próxima começa com uma chave nova.
        chave = novoUuid();
    }

    // ── Início ───────────────────────────────────────────────────────────────

    desenharGrupos();
    desenharPedido();
    try {
        const caixaAberto = await carregarCaixa();
        if (caixaAberto) {
            await Promise.all([carregarProdutos(), carregarLocalidades()]);
            desenharPedido();
        }
    } catch (erro) {
        avisar(erro.message, 'danger');
    }
}
