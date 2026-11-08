// Categorias dos produtos: a ordem em que aparecem e a grafia certa.
// Usado pela Venda (seções dos cartões) e por Produtos (grupos e sugestões),
// para as duas telas seguirem a mesma regra.

/**
 * Ordem das seções. As de pastel primeiro, na ordem combinada com a dona;
 * Bebidas sempre por último; qualquer outra categoria entra no meio, em
 * ordem alfabética. A comparação ignora maiúsculas e acentos.
 */
export const ORDEM_DAS_CATEGORIAS = ['Simples', 'Com queijo', 'Com Catupiry', 'Com cheddar', 'Doces'];
export const CATEGORIA_FINAL = 'Bebidas';

/** Sugestões para o campo "Categoria" de cada negócio. */
export const CATEGORIAS_SUGERIDAS = {
    PASTELARIA: [...ORDEM_DAS_CATEGORIAS, CATEGORIA_FINAL],
    PEIXARIA: ['Peixe', 'Frutos do mar']
};

/** "Brócolis" → "brocolis": para comparar e buscar com ou sem acento. */
export function semAcento(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function posicao(categoria) {
    const chave = semAcento(categoria);
    const fixa = ORDEM_DAS_CATEGORIAS.findIndex((c) => semAcento(c) === chave);
    if (fixa >= 0) return [0, fixa, ''];
    if (chave === semAcento(CATEGORIA_FINAL)) return [2, 0, ''];
    return [1, 0, chave];
}

/** Para usar em sort(): as fixas na ordem combinada, as outras no meio, Bebidas no fim. */
export function compararCategorias(a, b) {
    const [ga, ia, na] = posicao(a);
    const [gb, ib, nb] = posicao(b);
    return ga - gb || ia - ib || na.localeCompare(nb, 'pt-BR');
}

/**
 * A grafia "oficial" de uma categoria digitada. Se já existe uma igual,
 * ignorando maiúsculas, acentos e espaços nas pontas ("bebidas", "BEBIDAS "),
 * devolve a que existe ("Bebidas"). Assim não nascem dois grupos para a mesma
 * coisa. Se é nova de verdade, devolve o texto como foi digitado.
 */
export function grafiaDaCategoria(digitada, conhecidas) {
    const texto = String(digitada ?? '').trim().replace(/\s+/g, ' ');
    const chave = semAcento(texto);
    return conhecidas.find((c) => semAcento(c) === chave) ?? texto;
}
