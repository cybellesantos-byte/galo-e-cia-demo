// Tela de produtos: cadastrar, alterar preço e custo, esgotar e tirar da lista.
// Nada é apagado: "tirar da lista" e "esgotar" só mudam a situação do produto.
//
// Visual do estilo B (docs/PLANO_VISUAL.md): busca, filtro por situação,
// grupos por categoria (na mesma ordem da Venda) e o formulário num painel
// que abre ao lado (computador) ou por cima (celular).

import { api } from '../api.js';
import { avisar, escapar, reais } from '../util.js';
import { CATEGORIAS_SUGERIDAS, compararCategorias, grafiaDaCategoria, semAcento } from '../categorias.js';

const FILTROS = [
    ['TODOS', 'Todos', () => true],
    ['VENDA', 'Para venda', (p) => p.ativo && p.disponivel],
    ['ESGOTADOS', 'Esgotados', (p) => p.ativo && !p.disponivel],
    ['FORA', 'Fora da lista', (p) => !p.ativo]
];

/** Valor em reais digitado: aceita "8,50" e "8.50". Devolve NaN se não for número. */
function lerReais(texto) {
    let limpo = String(texto ?? '').trim().replace(/\s/g, '');
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    return limpo === '' ? NaN : Number(limpo);
}

/** Até 2 casas depois da vírgula (centavos). */
function centavosExatos(valor) {
    return Math.round(valor * 100) / 100 === valor;
}

export async function renderProdutos(tela, contexto) {
    const negocio = contexto.estado.negocio;
    if (!negocio) {
        contexto.irPara('#/negocio');
        return;
    }
    const pastelaria = negocio === 'PASTELARIA';
    const nomeNegocio = pastelaria ? 'Pastelaria' : 'Peixaria';
    // A pastelaria vende por unidade e a peixaria por kg: a unidade é fixa por negócio.
    const unidadeFixa = pastelaria ? 'UNIDADE' : 'KG';
    const rotuloUnidade = pastelaria ? 'por unidade' : 'por quilo (kg)';

    let produtos = [];
    let editando = null;   // produto sendo alterado, ou null para cadastro novo
    let filtro = 'TODOS';

    tela.innerHTML = `
        <div id="produtos-raiz">
            <div class="cabecalho-tela d-flex flex-wrap justify-content-between align-items-end gap-2">
                <div>
                    <h1 class="h3 mb-1">Produtos da ${escapar(nomeNegocio)}</h1>
                    <p class="text-secondary mb-0">Cadastre, mude o preço, esgote ou tire da lista. Nada é apagado.</p>
                </div>
                <button id="novo-produto" class="btn btn-primary" type="button">+ Novo produto</button>
            </div>

            <div class="produtos-filtros">
                <label class="venda-busca">
                    <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <span class="visually-hidden">Buscar produto</span>
                    <input id="busca-produto" type="search" autocomplete="off" placeholder="Buscar produto…">
                </label>
                <div id="filtros-situacao" class="filtros-situacao" role="group" aria-label="Mostrar"></div>
            </div>

            <div id="lista-gestao" aria-live="polite"></div>

            <div id="painel-produto" class="offcanvas offcanvas-end painel-produto" tabindex="-1" aria-labelledby="titulo-form">
                <div class="offcanvas-header">
                    <h2 id="titulo-form" class="offcanvas-title h4">Novo produto</h2>
                    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fechar"></button>
                </div>
                <div class="offcanvas-body">
                    <form id="form-produto" novalidate>
                        <div class="mb-3">
                            <label class="form-label" for="p-nome">Nome</label>
                            <input id="p-nome" class="form-control" maxlength="120" autocomplete="off" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label" for="p-categoria">Categoria</label>
                            <input id="p-categoria" class="form-control" maxlength="60" autocomplete="off" required
                                   list="categorias-conhecidas" aria-describedby="p-categoria-ajuda">
                            <datalist id="categorias-conhecidas"></datalist>
                            <div id="p-categoria-ajuda" class="form-text">
                                Escolha uma das que já existem para o produto cair na seção certa da venda.
                            </div>
                            <div id="sugestoes-categoria" class="sugestoes-categoria mt-2"></div>
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <label class="form-label" for="p-preco">Preço (R$)</label>
                                <input id="p-preco" class="form-control" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
                            </div>
                            <div class="col-6">
                                <label class="form-label" for="p-custo">Custo (R$)</label>
                                <input id="p-custo" class="form-control" inputmode="decimal" autocomplete="off" placeholder="opcional">
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label" for="p-descricao">Descrição (opcional)</label>
                            <input id="p-descricao" class="form-control" maxlength="200" autocomplete="off"
                                   placeholder="Ex.: frango desfiado com Catupiry">
                            <div class="form-text">Aparece no cardápio que o cliente vê.</div>
                        </div>
                        <p class="small text-secondary">Vende ${rotuloUnidade}. O custo serve para a margem nos relatórios.</p>
                        <div id="p-erro" class="alert alert-danger py-2 d-none" role="alert"></div>
                        <div class="d-flex gap-2">
                            <button id="p-salvar" class="btn btn-primary flex-fill" type="submit">Cadastrar</button>
                            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="offcanvas">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    const raiz = tela.querySelector('#produtos-raiz');
    const $ = (id) => raiz.querySelector('#' + id);
    const painel = new bootstrap.Offcanvas($('painel-produto'));

    // ── Lista ────────────────────────────────────────────────────────────────

    async function carregarProdutos() {
        produtos = (await api.get(`/api/produtos?negocio=${negocio}`))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        desenharFiltros();
        desenharLista();
    }

    /** Categorias já usadas e as sugeridas para o negócio, sem repetir. */
    function categoriasConhecidas() {
        const todas = [...CATEGORIAS_SUGERIDAS[negocio], ...produtos.map((p) => p.categoria)];
        const unicas = [];
        for (const c of todas) {
            if (c && !unicas.some((u) => semAcento(u) === semAcento(c))) unicas.push(c);
        }
        return unicas.sort(compararCategorias);
    }

    function desenharFiltros() {
        $('filtros-situacao').innerHTML = FILTROS.map(([codigo, rotulo, passa]) => `
            <input type="radio" class="btn-check" name="filtro-situacao" id="filtro-${codigo}" value="${codigo}" ${filtro === codigo ? 'checked' : ''}>
            <label class="btn btn-outline-secondary" for="filtro-${codigo}">${rotulo} <span class="filtro-conta">${produtos.filter(passa).length}</span></label>`).join('');
    }

    function selo(produto) {
        // Situação sempre em texto; a cor só reforça.
        if (!produto.ativo) return '<span class="badge selo-inativo">Fora da lista</span>';
        if (!produto.disponivel) return '<span class="badge selo-pendente">Esgotado</span>';
        return '<span class="badge selo-pago">Para venda</span>';
    }

    function linha(produto) {
        const unidade = produto.unidadeVenda === 'KG' ? 'kg' : 'un';
        const custo = produto.custoEstimado != null ? ` · custo ${reais(produto.custoEstimado)}` : ' · sem custo';
        const nome = escapar(produto.nome);
        return `
            <li class="produto-linha ${produto.ativo ? '' : 'produto-fora'}">
                <div class="produto-linha-info">
                    <span class="produto-linha-nome">${nome} ${selo(produto)}</span>
                    ${produto.descricao ? `<span class="produto-linha-descricao">${escapar(produto.descricao)}</span>` : ''}
                    <span class="produto-linha-detalhe">${reais(produto.preco)} / ${unidade}${custo}</span>
                </div>
                <div class="dropdown">
                    <button class="btn produto-acoes" type="button" data-bs-toggle="dropdown" aria-expanded="false"
                            aria-label="Ações de ${nome}">
                        <svg aria-hidden="true"><use href="#i-mais"/></svg>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><button class="dropdown-item" type="button" data-acao="editar" data-id="${produto.id}">Editar nome, categoria e preço</button></li>
                        ${produto.ativo ? `<li><button class="dropdown-item" type="button" data-acao="disponivel" data-id="${produto.id}">
                            ${produto.disponivel ? 'Esgotar (some da venda até voltar)' : 'Voltar à venda'}</button></li>` : ''}
                        <li><hr class="dropdown-divider"></li>
                        <li><button class="dropdown-item" type="button" data-acao="lista" data-id="${produto.id}">
                            ${produto.ativo ? 'Tirar da lista' : 'Colocar de volta na lista'}</button></li>
                    </ul>
                </div>
            </li>`;
    }

    function desenharLista() {
        const area = $('lista-gestao');
        if (produtos.length === 0) {
            area.innerHTML = `
                <div class="produtos-vazio">
                    <p class="mb-2">Nenhum produto cadastrado ainda.</p>
                    <button class="btn btn-primary" type="button" data-acao="novo">+ Cadastrar o primeiro</button>
                </div>`;
            return;
        }
        const termo = semAcento($('busca-produto').value);
        const passa = FILTROS.find(([codigo]) => codigo === filtro)[2];
        const porCategoria = new Map();
        for (const produto of produtos) {
            if (!passa(produto)) continue;
            if (termo && !semAcento(produto.nome).includes(termo)) continue;
            const categoria = produto.categoria?.trim() || 'Outros';
            if (!porCategoria.has(categoria)) porCategoria.set(categoria, []);
            porCategoria.get(categoria).push(produto);
        }
        const categorias = [...porCategoria.keys()].sort(compararCategorias);
        area.innerHTML = categorias.length === 0
            ? '<p class="produtos-vazio">Nenhum produto com esse filtro.</p>'
            : categorias.map((categoria) => `
                <section class="produtos-grupo" aria-label="${escapar(categoria)}">
                    <h2 class="produtos-grupo-titulo">${escapar(categoria)} <span>${porCategoria.get(categoria).length}</span></h2>
                    <ul class="produtos-lista">${porCategoria.get(categoria).map(linha).join('')}</ul>
                </section>`).join('');
    }

    // ── Formulário ───────────────────────────────────────────────────────────

    function desenharSugestoes() {
        const conhecidas = categoriasConhecidas();
        $('categorias-conhecidas').innerHTML = conhecidas.map((c) => `<option value="${escapar(c)}"></option>`).join('');
        // Botões com as categorias: no celular, a lista do <datalist> nem sempre aparece.
        const atual = semAcento($('p-categoria').value);
        $('sugestoes-categoria').innerHTML = conhecidas.map((c) => `
            <button type="button" class="sugestao-categoria ${semAcento(c) === atual ? 'escolhida' : ''}"
                    data-categoria="${escapar(c)}" aria-pressed="${semAcento(c) === atual}">${escapar(c)}</button>`).join('');
    }

    function mostrarErro(mensagem) {
        $('p-erro').textContent = mensagem ?? '';
        $('p-erro').classList.toggle('d-none', !mensagem);
    }

    function abrirFormulario(produto) {
        editando = produto ?? null;
        $('form-produto').reset();
        mostrarErro(null);
        $('titulo-form').textContent = produto ? 'Alterar produto' : 'Novo produto';
        $('p-salvar').textContent = produto ? 'Salvar alterações' : 'Cadastrar';
        if (produto) {
            $('p-nome').value = produto.nome;
            $('p-categoria').value = produto.categoria;
            $('p-preco').value = String(produto.preco).replace('.', ',');
            $('p-custo').value = produto.custoEstimado != null ? String(produto.custoEstimado).replace('.', ',') : '';
            $('p-descricao').value = produto.descricao ?? '';
        }
        desenharSugestoes();
        painel.show();
    }

    async function salvar(evento) {
        evento.preventDefault();
        const nome = $('p-nome').value.trim();
        const categoria = grafiaDaCategoria($('p-categoria').value, categoriasConhecidas());
        const preco = lerReais($('p-preco').value);
        const custoTexto = $('p-custo').value.trim();
        const custo = custoTexto === '' ? null : lerReais(custoTexto);

        if (!nome || !categoria) {
            mostrarErro('Preencha o nome e a categoria.');
            return;
        }
        if (!Number.isFinite(preco) || preco <= 0 || !centavosExatos(preco)) {
            mostrarErro('Preço inválido. Use um valor maior que zero, com até 2 casas (ex.: 8,50).');
            return;
        }
        if (custo !== null && (!Number.isFinite(custo) || custo < 0 || !centavosExatos(custo))) {
            mostrarErro('Custo inválido. Deixe em branco ou use um valor como 3,20.');
            return;
        }
        mostrarErro(null);

        const dados = { nome, categoria, preco, custoEstimado: custo, descricao: $('p-descricao').value.trim() || null };
        const botao = $('p-salvar');
        botao.disabled = true;
        try {
            if (editando) {
                await api.put(`/api/produtos/${editando.id}`, dados);
                avisar(`"${nome}" alterado.`);
            } else {
                await api.post('/api/produtos', { negocio, unidadeVenda: unidadeFixa, ...dados });
                avisar(`"${nome}" cadastrado em ${categoria}.`);
            }
            painel.hide();
            await carregarProdutos();
        } catch (erro) {
            // Ex.: nome repetido. O painel fica aberto, com o que foi digitado.
            mostrarErro(erro.message);
        } finally {
            botao.disabled = false;
        }
    }

    // ── Ações da lista ───────────────────────────────────────────────────────

    async function acao(botao) {
        if (botao.dataset.acao === 'novo') {
            abrirFormulario(null);
            return;
        }
        const produto = produtos.find((p) => p.id === Number(botao.dataset.id));
        if (!produto) return;
        try {
            if (botao.dataset.acao === 'editar') {
                abrirFormulario(produto);
                return;
            }
            if (botao.dataset.acao === 'disponivel') {
                await api.put(`/api/produtos/${produto.id}/disponivel`, { disponivel: !produto.disponivel });
                avisar(produto.disponivel ? `"${produto.nome}" esgotado: sumiu da venda.` : `"${produto.nome}" de volta à venda.`);
            } else {
                await api.post(`/api/produtos/${produto.id}/${produto.ativo ? 'desativar' : 'reativar'}`);
                avisar(produto.ativo ? `"${produto.nome}" tirado da lista.` : `"${produto.nome}" de volta à lista.`);
            }
            await carregarProdutos();
        } catch (erro) {
            avisar(erro.message, 'danger');
        }
    }

    raiz.addEventListener('submit', salvar);
    raiz.addEventListener('input', (evento) => {
        if (evento.target.id === 'busca-produto') desenharLista();
        if (evento.target.id === 'p-categoria') desenharSugestoes();
    });
    raiz.addEventListener('change', (evento) => {
        if (evento.target.name === 'filtro-situacao') {
            filtro = evento.target.value;
            desenharLista();
        }
    });
    raiz.addEventListener('click', (evento) => {
        const botao = evento.target.closest('button');
        if (!botao) return;
        if (botao.id === 'novo-produto') {
            abrirFormulario(null);
        } else if (botao.classList.contains('sugestao-categoria')) {
            $('p-categoria').value = botao.dataset.categoria;
            desenharSugestoes();
        } else if (botao.dataset.acao) {
            acao(botao);
        }
    });
    // Ao abrir o painel, o cursor já vai para o nome.
    $('painel-produto').addEventListener('shown.bs.offcanvas', () => $('p-nome').focus());

    try {
        await carregarProdutos();
    } catch (erro) {
        avisar(erro.message, 'danger');
    }
}
