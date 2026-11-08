// A página do cliente: o cardápio, o pedido e o botão "Pedir pelo WhatsApp".
//
// É PÚBLICA, então desconfia de tudo o que recebe e de tudo o que o cliente digita:
//  - todo texto que vem do servidor passa por escapar() antes de entrar na página;
//  - o texto do cliente é limpo e limitado antes de entrar na mensagem (mensagem.js);
//  - o total é só uma ESTIMATIVA: quem confirma o valor é a pastelaria, pelo WhatsApp;
//  - na hora de enviar, o cardápio é conferido de novo, e se algo mudou (item
//    esgotou, loja fechou, preço mudou), o pedido NÃO sai: o cliente confere antes.
//
// A página não grava nada no servidor. O pedido só existe na cabeça do cliente, no
// navegador dele e, depois do envio, na conversa do WhatsApp.

import { escapar } from '../util.js';
import { api } from '../api.js';
import { mostrarMensagemDaDemo } from '../demo/whatsapp.js';
import { compararCategorias, semAcento } from '../categorias.js';
import {
    LIMITES, lerCentavos, linkDoWhatsapp, montarMensagem, numeroDoWhatsapp,
    problemasDoPedido, reais, subtotal
} from './mensagem.js';

const INTERVALO_MS = 10000;          // a cada quanto tempo pergunta de novo se algo esgotou
const ESPERA_APOS_LIMITE_MS = 60000; // se o servidor pedir calma (429), espera um minuto
const QUANTIDADE_MAXIMA = 50;        // por item: acima disso é erro de dedo
const CHAVE_CARRINHO = 'galo-carrinho-v1';

const $ = (id) => document.getElementById(id);

const estado = {
    cardapio: null,          // a última resposta do servidor
    carrinho: new Map(),     // nome do produto -> quantidade
    avisoExtra: null,        // ex.: "estes itens acabaram e saíram do seu pedido"
    conexaoPerdida: false,
    limiteAtingido: false
};

// ── O que fica guardado no aparelho do cliente ─────────────────────────────

/** O pedido sobrevive a um "recarregar a página" sem querer. Nunca quebra a página se falhar. */
function lerCarrinhoSalvo() {
    try {
        const bruto = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) ?? '{}');
        const carrinho = new Map();
        for (const [nome, quantidade] of Object.entries(bruto)) {
            if (Number.isInteger(quantidade) && quantidade > 0 && quantidade <= QUANTIDADE_MAXIMA) {
                carrinho.set(nome, quantidade);
            }
        }
        return carrinho;
    } catch {
        return new Map();
    }
}

function salvarCarrinho() {
    try {
        localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(Object.fromEntries(estado.carrinho)));
    } catch {
        // Navegador sem armazenamento (aba privativa, etc.): a página funciona do mesmo jeito.
    }
}

// ── Conversa com o servidor ────────────────────────────────────────────────

/** Busca o cardápio. Devolve a resposta, ou null se não deu (e a página se ajusta). */
async function carregar() {
    try {
        // Demonstração: em vez de ir ao servidor, pergunta ao "servidor de mentira".
        const resposta = { ok: true, status: 200, json: () => api.get('/api/publico/cardapio') };
        if (resposta.status === 429) {
            estado.limiteAtingido = true;
            desenharTudo();
            return null;
        }
        if (!resposta.ok) throw new Error('resposta ' + resposta.status);
        const novo = await resposta.json();
        estado.limiteAtingido = false;
        estado.conexaoPerdida = false;
        aplicarCardapio(novo);
        return novo;
    } catch {
        estado.conexaoPerdida = true;
        desenharTudo();
        return null;
    }
}

/** Guarda o cardápio novo e tira do pedido o que esgotou ou saiu da lista. */
function aplicarCardapio(novo) {
    const mudou = JSON.stringify(novo) !== JSON.stringify(estado.cardapio);
    estado.cardapio = novo;

    const disponiveis = new Set(novo.itens.filter((i) => !i.esgotado).map((i) => i.nome));
    const removidos = [];
    for (const nome of [...estado.carrinho.keys()]) {
        if (!disponiveis.has(nome)) {
            estado.carrinho.delete(nome);
            removidos.push(nome);
        }
    }
    if (removidos.length) {
        salvarCarrinho();
        estado.avisoExtra = 'Estes itens acabaram e saíram do seu pedido: ' + removidos.join(', ') + '.';
    }
    if (mudou || removidos.length) {
        desenharTudo();
    } else {
        desenharSituacao();
    }
    return removidos;
}

// ── Contas do pedido (tudo em centavos) ────────────────────────────────────

function precoDe(nome) {
    const item = estado.cardapio?.itens.find((i) => i.nome === nome);
    return item ? Math.round(item.preco * 100) : null;
}

function itensDoPedido() {
    return [...estado.carrinho.entries()]
        .map(([nome, quantidade]) => ({ nome, quantidade, precoCentavos: precoDe(nome) }))
        .filter((item) => item.precoCentavos !== null);
}

function tipoEscolhido() {
    return document.querySelector('input[name="tipo"]:checked').value;
}

function pagamentoEscolhido() {
    return document.querySelector('input[name="pagamento"]:checked').value;
}

function localEscolhido() {
    if (tipoEscolhido() !== 'ENTREGA') return null;
    const local = estado.cardapio?.locais.find((l) => l.nome === $('p-local').value);
    return local ? { nome: local.nome, taxaCentavos: Math.round(local.taxa * 100) } : null;
}

function totalEmCentavos() {
    const local = localEscolhido();
    return subtotal(itensDoPedido()) + (local ? local.taxaCentavos : 0);
}

/** O pedido como está no formulário agora. */
function pedidoDoFormulario() {
    const trocoTexto = $('p-troco').value.trim();
    return {
        itens: itensDoPedido(),
        tipo: tipoEscolhido(),
        local: localEscolhido(),
        endereco: $('p-endereco').value,
        nome: $('p-nome').value,
        observacao: $('p-observacao').value,
        pagamento: pagamentoEscolhido(),
        trocoParaCentavos: pagamentoEscolhido() === 'DINHEIRO' && trocoTexto !== '' ? lerCentavos(trocoTexto) : null
    };
}

// ── Desenho da página ──────────────────────────────────────────────────────

function desenharTudo() {
    desenharSituacao();
    desenharLista();
    desenharLocais();
    desenharPedido();
}

function podePedir() {
    return Boolean(estado.cardapio?.aberta) && numeroDoWhatsapp(estado.cardapio?.whatsapp) !== null;
}

function desenharSituacao() {
    const pilula = $('situacao');
    const aviso = $('aviso');
    const c = estado.cardapio;

    let texto = 'Carregando…';
    let classe = '';
    if (c) {
        texto = c.aberta ? 'Estamos abertos' : 'Fechados no momento';
        classe = c.aberta ? 'aberta' : 'fechada';
    } else if (estado.conexaoPerdida) {
        texto = 'Sem conexão';
        classe = 'fechada';
    }
    pilula.textContent = texto;
    pilula.className = 'cardapio-situacao ' + classe;

    // O aviso mais importante primeiro. O texto é fixo (ou nomes de produtos, escapados pelo textContent).
    let mensagem = null;
    if (estado.limiteAtingido) {
        mensagem = 'Muitos acessos em pouco tempo. Em instantes o cardápio volta a atualizar sozinho.';
    } else if (estado.conexaoPerdida && !c) {
        mensagem = 'Não consegui carregar o cardápio. Confira a internet; vou tentar de novo sozinho.';
    } else if (estado.avisoExtra) {
        mensagem = estado.avisoExtra;
    } else if (c && !c.aberta) {
        mensagem = 'Estamos fechados agora. Dá para olhar o cardápio, mas o pedido só pode ser enviado quando abrirmos.';
    } else if (c && numeroDoWhatsapp(c.whatsapp) === null) {
        mensagem = 'Os pedidos pelo WhatsApp ainda não estão disponíveis. Volte daqui a pouco.';
    }
    aviso.textContent = mensagem ?? '';
    aviso.classList.toggle('d-none', mensagem === null);
}

/** Os itens que passam na busca, agrupados por categoria, na ordem combinada. */
function gruposVisiveis() {
    const termo = semAcento($('busca').value);
    const grupos = new Map();
    for (const item of estado.cardapio.itens) {
        // A busca olha o nome e a descrição: quem procura "catupiry" acha tudo que leva Catupiry.
        if (termo && !semAcento(item.nome + ' ' + (item.descricao ?? '')).includes(termo)) continue;
        const categoria = item.categoria?.trim() || 'Outros';
        if (!grupos.has(categoria)) grupos.set(categoria, []);
        grupos.get(categoria).push(item);
    }
    return [...grupos.keys()].sort(compararCategorias)
        .map((categoria, i) => ({ categoria, ancora: 'secao-' + i, itens: grupos.get(categoria) }));
}

/**
 * Um item do cardápio, numa linha: o texto à esquerda e, à direita, o botão redondo "+".
 * Depois de escolhido, o botão vira "− 2 +". Só os botões mexem no pedido (tocar no resto
 * da linha não faz nada), para ninguém adicionar sem querer ao rolar a lista com o dedo.
 */
function cartao(item) {
    const quantidade = estado.carrinho.get(item.nome) ?? 0;
    const nome = escapar(item.nome);
    const preco = reais(Math.round(item.preco * 100));

    let controle = '';
    if (!item.esgotado && quantidade === 0) {
        controle = `<button type="button" class="prod-mais" data-acao="mais" data-nome="${nome}"
                            aria-label="Adicionar ${nome}, ${preco}">+</button>`;
    } else if (!item.esgotado) {
        controle = `
            <div class="prod-passo" role="group" aria-label="Quantidade de ${nome}">
                <button type="button" data-acao="menos" data-nome="${nome}" aria-label="Tirar um ${nome}">−</button>
                <span class="prod-qtd" aria-live="polite">${quantidade}</span>
                <button type="button" data-acao="mais" data-nome="${nome}" aria-label="Mais um ${nome}">+</button>
            </div>`;
    }
    return `
        <div class="produto-item prod-linha ${quantidade ? 'escolhido' : ''} ${item.esgotado ? 'esgotado' : ''}">
            <div class="prod-texto">
                <span class="produto-nome">${nome}</span>
                ${item.descricao ? `<span class="produto-descricao">${escapar(item.descricao)}</span>` : ''}
                <span class="produto-preco">${item.esgotado ? 'Esgotado hoje' : preco}</span>
            </div>
            ${controle}
        </div>`;
}

function desenharLista() {
    if (!estado.cardapio) return;
    const grupos = gruposVisiveis();
    if (estado.cardapio.itens.length === 0) {
        $('lista').innerHTML = '<p class="venda-vazio">O cardápio ainda está vazio. Volte daqui a pouco.</p>';
    } else if (grupos.length === 0) {
        $('lista').innerHTML = `<p class="venda-vazio">Nada encontrado com “${escapar($('busca').value)}”.</p>`;
    } else {
        $('lista').innerHTML = grupos.map((g) => `
            <section id="${g.ancora}" class="venda-secao" aria-label="${escapar(g.categoria)}">
                <h2 class="venda-secao-titulo">${escapar(g.categoria)}</h2>
                <div class="venda-cartoes">${g.itens.map(cartao).join('')}</div>
            </section>`).join('');
    }
}

function desenharLocais() {
    const locais = estado.cardapio?.locais ?? [];
    const selecionado = $('p-local').value;
    // Começa sem nada escolhido: quem pede entrega precisa dizer onde está, em vez de
    // mandar o pedido para o primeiro local da lista sem perceber.
    $('p-local').innerHTML = '<option value="">Escolha o local…</option>' + locais
        .map((l) => `<option value="${escapar(l.nome)}">${escapar(l.nome)} · taxa ${reais(Math.round(l.taxa * 100))}</option>`)
        .join('');
    if (locais.some((l) => l.nome === selecionado)) $('p-local').value = selecionado;
}

function desenharPedido() {
    const itens = itensDoPedido();
    const local = localEscolhido();
    const entrega = tipoEscolhido() === 'ENTREGA';
    const taxa = local ? local.taxaCentavos : 0;
    const total = subtotal(itens) + taxa;
    const unidades = itens.reduce((soma, i) => soma + i.quantidade, 0);

    $('lista-pedido').innerHTML = itens.length === 0
        ? '<li class="pedido-vazio">Nenhum item ainda. Toque nos produtos para adicionar.</li>'
        : itens.map((item) => {
            const nome = escapar(item.nome);
            return `
                <li class="pedido-item">
                    <span class="pedido-item-nome"><strong>${item.quantidade}×</strong> ${nome}</span>
                    <span class="pedido-item-valor">${reais(item.precoCentavos * item.quantidade)}</span>
                    <span class="pedido-botoes">
                        <button type="button" class="pedido-botao" data-acao="menos" data-nome="${nome}" aria-label="Tirar um ${nome}">−</button>
                        <button type="button" class="pedido-botao" data-acao="mais" data-nome="${nome}" aria-label="Mais um ${nome}">+</button>
                    </span>
                </li>`;
        }).join('');

    $('r-itens').textContent = reais(subtotal(itens));
    $('r-taxa-rotulo').classList.toggle('d-none', !entrega);
    $('r-taxa').classList.toggle('d-none', !entrega);
    $('r-taxa').textContent = reais(taxa);
    $('r-total').textContent = reais(total);

    const barra = $('barra-pedido');
    barra.classList.toggle('vazia', itens.length === 0);
    barra.innerHTML = itens.length === 0
        ? '<span>Toque num produto para começar</span>'
        : `<span>Ver pedido · ${unidades} ${unidades === 1 ? 'item' : 'itens'}</span><strong>${reais(total)}</strong>`;

    const botao = $('enviar');
    botao.disabled = itens.length === 0 || !podePedir();
    botao.textContent = !estado.cardapio ? 'Carregando…'
        : !estado.cardapio.aberta ? 'Fechados no momento'
            : numeroDoWhatsapp(estado.cardapio.whatsapp) === null ? 'WhatsApp indisponível'
                : 'Pedir pelo WhatsApp';
}

function mostrarErro(mensagem) {
    $('erro-pedido').textContent = mensagem ?? '';
    $('erro-pedido').classList.toggle('d-none', !mensagem);
}

// ── Mudanças feitas pelo cliente ───────────────────────────────────────────

function mudarQuantidade(nome, delta) {
    const item = estado.cardapio?.itens.find((i) => i.nome === nome);
    if (!item || item.esgotado) return;
    const nova = Math.min(QUANTIDADE_MAXIMA, (estado.carrinho.get(nome) ?? 0) + delta);
    if (nova > 0) estado.carrinho.set(nome, nova); else estado.carrinho.delete(nome);
    estado.avisoExtra = null;
    mostrarErro(null);
    salvarCarrinho();
    desenharTudo();
}

function aoClicar(evento) {
    const botao = evento.target.closest('button');
    if (!botao) return;
    if (botao.dataset.acao === 'mais') {
        mudarQuantidade(botao.dataset.nome, 1);
    } else if (botao.dataset.acao === 'menos') {
        mudarQuantidade(botao.dataset.nome, -1);
    }
}

function alternarCampos() {
    const entrega = tipoEscolhido() === 'ENTREGA';
    const dinheiro = pagamentoEscolhido() === 'DINHEIRO';
    $('bloco-entrega').classList.toggle('d-none', !entrega);
    $('bloco-troco').classList.toggle('d-none', !dinheiro);
    $('ajuda-pix').classList.toggle('d-none', dinheiro);
    desenharPedido();
}

// ── Enviar o pedido ────────────────────────────────────────────────────────

async function enviar(evento) {
    evento.preventDefault();
    mostrarErro(null);

    const total = totalEmCentavos();
    const problemas = problemasDoPedido(pedidoDoFormulario(), total);
    if (problemas.length) {
        mostrarErro(problemas.join(' '));
        return;
    }

    const botao = $('enviar');
    botao.disabled = true;
    botao.textContent = 'Conferindo o cardápio…';
    try {
        // Antes de mandar, pergunta de novo ao servidor: o que o cliente viu pode estar velho.
        const antes = new Map(estado.carrinho);
        const fresco = await carregar();
        if (!fresco) {
            mostrarErro('Não consegui conferir o cardápio agora. Confira a internet e tente de novo.');
            return;
        }
        if (!fresco.aberta) {
            mostrarErro('Acabamos de fechar. O pedido só pode ser enviado quando abrirmos.');
            return;
        }
        if (antes.size !== estado.carrinho.size) {
            mostrarErro('Alguns itens acabaram enquanto você montava o pedido. Confira o pedido e envie de novo.');
            return;
        }
        if (totalEmCentavos() !== total) {
            mostrarErro('Os valores mudaram. Confira o total e envie de novo.');
            return;
        }

        // Demonstração: no sistema real, aqui abre o WhatsApp da pastelaria com o pedido pronto.
        // Na demo, o pedido é só mostrado: ninguém manda mensagem de verdade.
        mostrarMensagemDaDemo(montarMensagem(pedidoDoFormulario()));
    } catch {
        mostrarErro('Não foi possível montar o pedido. Confira os dados e tente de novo.');
    } finally {
        desenharPedido();
    }
}

function limparPedido() {
    estado.carrinho.clear();
    estado.avisoExtra = null;
    salvarCarrinho();
    $('form-pedido').reset();
    $('link-reserva').classList.add('d-none');
    mostrarErro(null);
    alternarCampos();
    desenharTudo();
}

// ── Início ─────────────────────────────────────────────────────────────────

let temporizador = null;

/** Pergunta de novo a cada poucos segundos, mas só com a página à vista. */
function agendar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
        if (!document.hidden) await carregar();
        agendar();
    }, estado.limiteAtingido ? ESPERA_APOS_LIMITE_MS : INTERVALO_MS);
}

async function iniciar() {
    estado.carrinho = lerCarrinhoSalvo();
    $('lista').addEventListener('click', aoClicar);
    $('lista-pedido').addEventListener('click', aoClicar);
    $('busca').addEventListener('input', desenharLista);
    $('form-pedido').addEventListener('submit', enviar);
    $('limpar').addEventListener('click', limparPedido);
    for (const campo of document.querySelectorAll('input[name="tipo"], input[name="pagamento"]')) {
        campo.addEventListener('change', alternarCampos);
    }
    $('p-local').addEventListener('change', desenharPedido);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });

    $('p-nome').maxLength = LIMITES.nome;
    $('p-endereco').maxLength = LIMITES.endereco;
    $('p-observacao').maxLength = LIMITES.observacao;

    await carregar();
    alternarCampos();
    agendar();
}

iniciar();
