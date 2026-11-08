// Escolha do negócio: pastelaria ou peixaria. A escolha vale para esta aba.

import { escapar } from '../util.js';

export async function renderNegocio(tela, contexto) {
    const primeiroNome = (contexto.estado.usuario?.nome ?? '').split(' ')[0];

    tela.innerHTML = `
        <div class="cabecalho-tela text-center my-4">
            <p class="text-uppercase small fw-bold text-secondary mb-1">Olá, ${escapar(primeiroNome)}</p>
            <h1 class="h3">Qual negócio você vai atender agora?</h1>
            <p class="text-secondary mb-0">Dá para trocar depois, tocando no selo amarelo do topo.</p>
        </div>
        <div class="row justify-content-center g-3">
            <div class="col-12 col-md-5">
                <button id="escolher-pastelaria" class="escolha-negocio escolha-pastelaria" type="button">
                    <span class="escolha-icone" aria-hidden="true">🥟</span>
                    <span>
                        <span class="escolha-titulo">Pastelaria</span>
                        <span class="escolha-detalhe">Pastéis e bebidas, por unidade</span>
                    </span>
                </button>
            </div>
            <div class="col-12 col-md-5">
                <button id="escolher-peixaria" class="escolha-negocio escolha-peixaria" type="button">
                    <span class="escolha-icone" aria-hidden="true">🐟</span>
                    <span>
                        <span class="escolha-titulo">Peixaria</span>
                        <span class="escolha-detalhe">Peixes vendidos por quilo</span>
                    </span>
                </button>
            </div>
        </div>`;

    const escolher = (negocio) => {
        contexto.definirNegocio(negocio);
        contexto.irPara('#/venda');
    };
    tela.querySelector('#escolher-pastelaria').addEventListener('click', () => escolher('PASTELARIA'));
    tela.querySelector('#escolher-peixaria').addEventListener('click', () => escolher('PEIXARIA'));
}
