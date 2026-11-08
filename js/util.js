// Funções pequenas que várias telas usam: valores, datas, avisos e escape de texto.

const reaisFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const quilosFormatado = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Valor em reais: 37.8 → "R$ 37,80". */
export function reais(valor) {
    return reaisFormatado.format(Number(valor ?? 0));
}

/**
 * Reais em centavos inteiros: 9.6 → 960. Conta de dinheiro na tela se faz
 * em centavos, porque número quebrado erra: 5.20 + 4.40 = 9.600000000000001.
 */
export function emCentavos(valor) {
    return Math.round(Number(valor ?? 0) * 100);
}

/** Quilos com 3 casas: 1.35 → "1,350". */
export function quilos(valor) {
    return quilosFormatado.format(Number(valor ?? 0));
}

/** Hora no horário de Brasília: "14:35". */
export function horaDaCasa(instante) {
    return new Date(instante).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    });
}

/** Dia e hora no horário de Brasília: "29/10 às 14:35". */
export function dataHoraDaCasa(instante) {
    const data = new Date(instante);
    const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
    return `${dia} às ${horaDaCasa(instante)}`;
}

/**
 * Pergunta "tem certeza?" numa janela (modal do Bootstrap) e devolve uma
 * Promise com true (confirmou) ou false (voltou, fechou ou apertou Esc).
 *
 * Uso:  if (await confirmar({ titulo: '...', mensagem: '...', textoConfirmar: 'Desativar', perigo: true })) { ... }
 *
 * Os textos entram com textContent: nunca viram HTML.
 */
export function confirmar({ titulo, mensagem, textoConfirmar = 'Confirmar', perigo = false }) {
    return new Promise((resolver) => {
        const caixa = document.createElement('div');
        caixa.className = 'modal fade';
        caixa.tabIndex = -1;
        caixa.setAttribute('aria-hidden', 'true');
        caixa.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title h5"></h2>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body"><p class="mb-0"></p></div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Voltar</button>
                        <button type="button" class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-confirmar></button>
                    </div>
                </div>
            </div>`;
        caixa.querySelector('.modal-title').textContent = titulo;
        caixa.querySelector('.modal-body p').textContent = mensagem;
        const botaoConfirmar = caixa.querySelector('[data-confirmar]');
        botaoConfirmar.textContent = textoConfirmar;
        document.body.appendChild(caixa);

        // O Bootstrap é carregado por um <script> comum (não módulo), por isso está em window.
        const modal = new window.bootstrap.Modal(caixa);
        let confirmou = false;
        botaoConfirmar.addEventListener('click', () => {
            confirmou = true;
            modal.hide();
        });
        // Só responde depois que a janela terminou de fechar, e então a remove da página.
        caixa.addEventListener('hidden.bs.modal', () => {
            modal.dispose();
            caixa.remove();
            resolver(confirmou);
        });
        modal.show();
    });
}

/**
 * Escapa texto antes de colocar no HTML. Nome de produto ou observação
 * digitada pela equipe nunca pode virar código na tela.
 */
export function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

/**
 * Um identificador novo para cada venda. Usa getRandomValues (e não
 * crypto.randomUUID) porque o navegador só oferece randomUUID em conexões
 * seguras, e a tela também é usada pelo celular na rede local, por HTTP.
 */
export function novoUuid() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Mostra um aviso no topo da tela e o retira sozinho. O texto entra com
 * textContent, então nunca é lido como HTML.
 */
export function avisar(mensagem, tipo = 'success') {
    const area = document.getElementById('avisos');
    const aviso = document.createElement('div');
    aviso.className = `alert alert-${tipo} shadow-sm py-2 mb-2`;
    aviso.setAttribute('role', 'alert');
    aviso.textContent = mensagem;
    area.appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === 'danger' ? 6000 : 3500);
}
