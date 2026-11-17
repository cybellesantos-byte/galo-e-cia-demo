// Tela "Cardápio online": a equipe abre e fecha o cardápio que o cliente vê, confere o
// link e (só o administrador) informa o número do WhatsApp que recebe os pedidos.
//
// O cardápio do cliente é sempre o da PASTELARIA, qualquer que seja o negócio escolhido
// no topo do sistema. Esta tela só mexe nele.

import { api } from '../api.js';
import { avisar, confirmar, dataHoraDaCasa, escapar } from '../util.js';

const NEGOCIO = 'PASTELARIA';

/** "5583999998888" → "(83) 99999-8888". Se vier num formato inesperado, mostra como veio. */
function formatarWhatsapp(numero) {
    if (!/^55\d{10,11}$/.test(numero ?? '')) return numero ?? '';
    const ddd = numero.slice(2, 4);
    const resto = numero.slice(4);
    return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

export async function renderCardapioOnline(tela, contexto) {
    const souAdmin = contexto.estado.usuario?.papel === 'ADMIN';
    const link = `${location.origin}/cardapio`;
    let loja = null;

    tela.innerHTML = `
        <div id="cardapio-online-raiz">
            <div class="cabecalho-tela">
                <h1 class="h3 mb-1">Cardápio online</h1>
                <p class="text-secondary mb-0">
                    O cardápio que o cliente vê no celular, para pedir pelo WhatsApp.
                    Aqui você abre e fecha, e confere o link.
                </p>
            </div>

            <div class="row g-3">
                <div class="col-12 col-lg-6">
                    <div class="card">
                        <div class="card-body">
                            <h2 class="h5 mb-3">Estamos abertos?</h2>
                            <div id="situacao" class="loja-situacao fechada" role="status">Carregando…</div>
                            <p id="quem-mexeu" class="small text-secondary mt-2 mb-3"></p>
                            <button id="alternar" class="btn btn-primary btn-lg w-100" type="button" disabled>…</button>
                            <p class="small text-secondary mt-2 mb-0">
                                Fechado: o cliente vê o cardápio, mas não consegue enviar o pedido.
                            </p>
                        </div>
                    </div>

                    <div class="card mt-3">
                        <div class="card-body">
                            <h2 class="h5 mb-1">O link do cardápio</h2>
                            <p class="small text-secondary">É este endereço que vai para o Instagram e para o WhatsApp.</p>
                            <div class="input-group mb-2">
                                <input id="link" class="form-control" readonly value="${escapar(link)}" aria-label="Link do cardápio">
                                <button id="copiar" class="btn btn-outline-secondary" type="button">Copiar</button>
                            </div>
                            <a class="btn btn-outline-secondary w-100" href="${escapar(link)}" target="_blank" rel="noopener">
                                Abrir o cardápio como o cliente vê
                            </a>
                            <p class="small text-secondary mt-2 mb-0">
                                Por enquanto o link só abre em aparelhos ligados na mesma rede deste computador.
                                Para qualquer pessoa abrir de qualquer lugar, é preciso colocar o sistema num servidor.
                            </p>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-6">
                    <div class="card">
                        <div class="card-body">
                            <h2 class="h5 mb-1">WhatsApp que recebe os pedidos</h2>
                            <p class="small text-secondary">
                                É para este número que o cliente manda o pedido. Use o número com o DDD.
                            </p>
                            ${souAdmin ? `
                                <form id="form-whatsapp" novalidate>
                                    <label class="form-label" for="whatsapp">Número com DDD</label>
                                    <input id="whatsapp" class="form-control mb-2" inputmode="tel" autocomplete="off"
                                           maxlength="30" placeholder="(83) 99999-8888">
                                    <div id="whats-erro" class="alert alert-danger py-2 d-none" role="alert"></div>
                                    <button id="salvar-whatsapp" class="btn btn-primary w-100" type="submit">Salvar o número</button>
                                    <p class="small text-secondary mt-2 mb-0">
                                        Deixe em branco e salve para apagar o número: sem ele, ninguém consegue pedir.
                                    </p>
                                </form>` : `
                                <p class="fs-5 fw-bold mb-1" id="whatsapp-leitura">…</p>
                                <p class="small text-secondary mb-0">
                                    Só o administrador troca este número, porque é para ele que vão todos os pedidos.
                                </p>`}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    const raiz = tela.querySelector('#cardapio-online-raiz');
    const $ = (id) => raiz.querySelector('#' + id);

    function desenhar() {
        const aberta = loja.aberta;
        $('situacao').className = `loja-situacao ${aberta ? 'aberta' : 'fechada'}`;
        $('situacao').innerHTML = `<span class="ponto" aria-hidden="true"></span>
            ${aberta ? 'ABERTO: os clientes podem pedir' : 'FECHADO: ninguém consegue pedir'}`;
        $('quem-mexeu').textContent = loja.alteradoEm
            ? `Última mudança: ${loja.alteradoPor}, ${dataHoraDaCasa(loja.alteradoEm)}.`
            : 'Ainda ninguém abriu o cardápio.';
        const botao = $('alternar');
        botao.disabled = false;
        botao.textContent = aberta ? 'Fechar o cardápio' : 'Abrir o cardápio';
        botao.className = `btn btn-lg w-100 ${aberta ? 'btn-outline-secondary' : 'btn-primary'}`;

        if (souAdmin) {
            $('whatsapp').value = loja.whatsapp ? formatarWhatsapp(loja.whatsapp) : '';
        } else {
            $('whatsapp-leitura').textContent = loja.whatsapp ? formatarWhatsapp(loja.whatsapp) : 'Ainda não informado';
        }
        // Aberto sem número: o cliente veria "aberto" e não conseguiria pedir. Melhor avisar quem abriu.
        const semNumero = aberta && !loja.whatsapp;
        $('aviso-sem-numero')?.remove();
        if (semNumero) {
            $('situacao').insertAdjacentHTML('afterend', `
                <div id="aviso-sem-numero" class="alert alert-warning py-2 mt-2 mb-0" role="alert">
                    O cardápio está aberto, mas o <strong>número do WhatsApp</strong> ainda não foi informado:
                    o cliente não consegue enviar o pedido.
                    ${souAdmin ? 'Informe o número ao lado.' : 'Peça ao administrador para informar o número.'}
                </div>`);
        }
    }

    async function carregar() {
        try {
            loja = await api.get(`/api/loja/${NEGOCIO}`);
            desenhar();
        } catch (erro) {
            $('situacao').textContent = erro.message;
        }
    }

    $('alternar').addEventListener('click', async () => {
        const botao = $('alternar');
        botao.disabled = true;
        try {
            loja = await api.put(`/api/loja/${NEGOCIO}/aberta`, { aberta: !loja.aberta });
            desenhar();
            avisar(loja.aberta ? 'Cardápio aberto: os clientes já podem pedir.' : 'Cardápio fechado.');
        } catch (erro) {
            avisar(erro.message, 'danger');
            botao.disabled = false;
        }
    });

    $('copiar').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(link);
            avisar('Link copiado.');
        } catch {
            // Sem permissão (ex.: página aberta por http, fora do localhost): seleciona o texto para o Ctrl+C.
            $('link').select();
            avisar('Selecionei o link: aperte Ctrl+C (ou toque e segure) para copiar.', 'warning');
        }
    });

    if (souAdmin) {
        $('form-whatsapp').addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const erro = $('whats-erro');
            erro.classList.add('d-none');
            const digitado = $('whatsapp').value.trim();
            const ok = await confirmar({
                titulo: digitado ? 'Trocar o número que recebe os pedidos?' : 'Apagar o número dos pedidos?',
                mensagem: digitado
                    ? `A partir de agora, os pedidos do cardápio vão para ${digitado}. Confira se o número está certo.`
                    : 'Sem número, o cliente não consegue enviar o pedido.',
                textoConfirmar: digitado ? 'Trocar o número' : 'Apagar',
                perigo: !digitado
            });
            if (!ok) return;

            const botao = $('salvar-whatsapp');
            botao.disabled = true;
            try {
                loja = await api.put(`/api/loja/${NEGOCIO}/whatsapp`, { whatsapp: digitado });
                desenhar();
                avisar(loja.whatsapp ? 'Número salvo.' : 'Número apagado.');
            } catch (e) {
                erro.textContent = e.message;
                erro.classList.remove('d-none');
            } finally {
                botao.disabled = false;
            }
        });
    }

    await carregar();
}
