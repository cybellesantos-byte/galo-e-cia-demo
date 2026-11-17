// VERSÃO DE DEMONSTRAÇÃO do guichê da API.
//
// No sistema real, este arquivo leva cada pedido da tela até o servidor Java.
// Aqui ele não sai do navegador: quem responde é o "servidor de mentira" da
// pasta demo/, com dados inventados, guardados só na memória da página.
// As telas continuam iguais, porque usam api.get / api.post / api.put do mesmo jeito.

import { ErroApi } from './demo/erro.js';
import { atender } from './demo/rotas.js';

export { ErroApi };

/** Uma pausa curta, para a tela mostrar o "carregando" como no sistema de verdade. */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function chamar(metodo, caminho, corpo) {
    await esperar(60 + Math.random() * 120);
    // Cópia profunda: a tela pode mexer no que recebeu sem estragar os dados guardados.
    const entrada = corpo === undefined ? undefined : structuredClone(corpo);
    const resposta = atender(metodo, caminho, entrada);
    return resposta === null || resposta === undefined ? null : structuredClone(resposta);
}

export const api = {
    get: (caminho) => chamar('GET', caminho),
    post: (caminho, corpo) => chamar('POST', caminho, corpo),
    put: (caminho, corpo) => chamar('PUT', caminho, corpo)
};
