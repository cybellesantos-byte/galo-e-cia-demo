// O pedido que vai para o WhatsApp: monta o texto e o link.
//
// São só funções de texto e de conta, sem tela e sem internet, para poderem ser
// testadas sozinhas. Tudo em CENTAVOS INTEIROS: em reais quebrados, 5,20 + 4,40
// dá 9,600000000000001.
//
// Segurança: o que o cliente digita (nome, endereço, observação) vai para dentro
// do texto e do link. Por isso é limpo aqui: sem quebra de linha estranha, sem
// caracteres de controle e com tamanho máximo. E o número do WhatsApp só vira
// link se for exatamente no formato esperado, mesmo vindo do nosso servidor.

export const LIMITES = { nome: 60, endereco: 150, observacao: 200 };

const NUMERO_VALIDO = /^55\d{10,11}$/;

/** "R$ 36,00" com espaço comum (e não o espaço "colado" do Intl), para o texto ficar limpo. */
export function reais(centavos) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
        .format(centavos / 100)
        .replace(/ /g, ' ');
}

/** Reais digitados ("8,50" ou "8.50") em centavos. NaN se não for um valor com até 2 casas. */
export function lerCentavos(texto) {
    let limpo = String(texto ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return NaN;
    return Math.round(Number(limpo) * 100);
}

/**
 * Deixa um texto digitado pelo cliente seguro para a mensagem: quebras de linha e
 * caracteres de controle viram espaço, espaços repetidos viram um, e corta no máximo.
 */
export function limparTexto(texto, maximo) {
    return String(texto ?? '')
        .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maximo);
}

/** O número só vale se for 55 + DDD + número, só dígitos. Qualquer outra coisa: null. */
export function numeroDoWhatsapp(numero) {
    return typeof numero === 'string' && NUMERO_VALIDO.test(numero) ? numero : null;
}

/** Soma dos itens (preço × quantidade, em centavos). */
export function subtotal(itens) {
    return itens.reduce((soma, item) => soma + item.precoCentavos * item.quantidade, 0);
}

/**
 * O texto do pedido.
 *
 * pedido: {
 *   itens: [{ nome, quantidade, precoCentavos }],
 *   tipo: 'RETIRADA' | 'ENTREGA',
 *   local: { nome, taxaCentavos } | null,      // só na entrega
 *   endereco, nome, observacao,                 // texto livre do cliente
 *   pagamento: 'PIX' | 'DINHEIRO',
 *   trocoParaCentavos: número | null            // só no dinheiro, opcional
 * }
 */
export function montarMensagem(pedido) {
    const entrega = pedido.tipo === 'ENTREGA';
    const taxa = entrega ? pedido.local.taxaCentavos : 0;
    const total = subtotal(pedido.itens) + taxa;

    // Curta de propósito: no WhatsApp, texto grande cansa quem atende e quem pede.
    // Os itens e o total ficam juntos; o resto (como e para onde) vem logo abaixo.
    const linhas = ['Olá! Quero fazer um pedido:', ''];
    for (const item of pedido.itens) {
        linhas.push(`${item.quantidade}x ${limparTexto(item.nome, 120)} - ${reais(item.precoCentavos * item.quantidade)}`);
    }
    if (entrega) {
        linhas.push(`Entrega (${limparTexto(pedido.local.nome, 120)}): ${reais(taxa)}`);
    }
    linhas.push(`*Total estimado: ${reais(total)}*`);
    linhas.push('');

    if (entrega) {
        linhas.push(`*Entrega* em ${limparTexto(pedido.local.nome, 120)}, ref.: ${limparTexto(pedido.endereco, LIMITES.endereco)}`);
    } else {
        linhas.push('*Retirada* na pastelaria');
    }

    if (pedido.pagamento === 'PIX') {
        linhas.push('Pagamento: Pix');
    } else if (pedido.trocoParaCentavos) {
        linhas.push(`Pagamento: dinheiro, troco para ${reais(pedido.trocoParaCentavos)}`);
    } else {
        linhas.push('Pagamento: dinheiro, sem troco');
    }

    linhas.push(`Nome: ${limparTexto(pedido.nome, LIMITES.nome)}`);
    const observacao = limparTexto(pedido.observacao, LIMITES.observacao);
    if (observacao) {
        linhas.push(`Obs.: ${observacao}`);
    }
    return linhas.join('\n');
}

/** O link oficial que abre a conversa com o pedido escrito. Recusa número fora do formato. */
export function linkDoWhatsapp(numero, mensagem) {
    const valido = numeroDoWhatsapp(numero);
    if (!valido) {
        throw new Error('Número de WhatsApp inválido.');
    }
    return `https://wa.me/${valido}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Confere o pedido antes de montar a mensagem. Devolve a lista de problemas, em
 * português, para mostrar ao cliente. Lista vazia = pode enviar.
 */
export function problemasDoPedido(pedido, totalCentavos) {
    const problemas = [];
    if (pedido.itens.length === 0) {
        problemas.push('Escolha pelo menos um item.');
    }
    if (!limparTexto(pedido.nome, LIMITES.nome)) {
        problemas.push('Diga o seu nome.');
    }
    if (pedido.tipo === 'ENTREGA') {
        if (!pedido.local) problemas.push('Escolha o local da entrega.');
        if (!limparTexto(pedido.endereco, LIMITES.endereco)) problemas.push('Informe um ponto de referência para a entrega.');
    }
    if (pedido.pagamento === 'DINHEIRO' && pedido.trocoParaCentavos != null) {
        if (Number.isNaN(pedido.trocoParaCentavos)) {
            problemas.push('O valor do troco está errado. Use um valor como 50 ou 50,00.');
        } else if (pedido.trocoParaCentavos < totalCentavos) {
            problemas.push(`O troco precisa ser para um valor maior ou igual ao total (${reais(totalCentavos)}).`);
        }
    }
    return problemas;
}
