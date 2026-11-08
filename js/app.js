// Ponto de entrada da tela: decide qual tela mostrar, conforme o endereço (#/...)
// e se a pessoa está logada.

import { api } from './api.js';
import { renderLogin } from './telas/login.js';
import { renderNegocio } from './telas/negocio.js';
import { renderVenda } from './telas/venda.js';
import { renderProdutos } from './telas/produtos.js';
import { renderEquipe } from './telas/equipe.js';
import { renderSenha } from './telas/senha.js';
import { renderCaixa } from './telas/caixa.js';
import { renderDespesas } from './telas/despesas.js';
import { renderRepasses } from './telas/repasses.js';
import { renderRelatorios } from './telas/relatorios.js';
import { renderCardapioOnline } from './telas/cardapio-online.js';
import { renderVendasDoDia } from './telas/vendas-do-dia.js';
import { avisar } from './util.js';

const tela = document.getElementById('tela');
const NOMES_NEGOCIO = { PASTELARIA: 'Pastelaria', PEIXARIA: 'Peixaria' };
/** A logo do topo muda com o negócio: assim ninguém vende no negócio errado sem perceber. */
const LOGOS = { PASTELARIA: 'img/logo-galo.png', PEIXARIA: 'img/logo-peixaria.svg' };

/** Telas que ficam no "Mais" do celular: com uma delas aberta, o "Mais" fica destacado. */
const rotasDoMais = new Set(['#/vendas-do-dia', '#/repasses', '#/produtos', '#/cardapio-online', '#/relatorios', '#/equipe', '#/negocio', '#/senha']);

const estado = {
    usuario: null,
    // Guardado na aba (sessionStorage): cada aba pode estar num negócio diferente.
    negocio: sessionStorage.getItem('negocio')
};

const telas = {
    '#/login': renderLogin,
    '#/negocio': renderNegocio,
    '#/venda': renderVenda,
    '#/vendas-do-dia': renderVendasDoDia,
    '#/produtos': renderProdutos,
    '#/equipe': renderEquipe,
    '#/senha': renderSenha,
    '#/caixa': renderCaixa,
    '#/despesas': renderDespesas,
    '#/repasses': renderRepasses,
    '#/relatorios': renderRelatorios,
    '#/cardapio-online': renderCardapioOnline
};

/**
 * Telas que só o ADMIN abre. Esconder do menu é só conforto: quem garante de
 * verdade é o backend, que responde "Acesso negado" para a EQUIPE.
 */
const somenteAdmin = new Set(['#/equipe', '#/relatorios']);

/** O que as telas podem fazer com a aplicação, sem conhecer os detalhes uma da outra. */
const contexto = {
    estado,
    irPara(rota) {
        location.hash = rota;
    },
    definirNegocio(negocio) {
        estado.negocio = negocio;
        sessionStorage.setItem('negocio', negocio);
    },
    async sair() {
        try {
            await api.post('/api/auth/logout');
        } catch {
            // Mesmo sem resposta, a tela local fica deslogada.
        }
        estado.usuario = null;
        estado.negocio = null;
        sessionStorage.removeItem('negocio');
        contexto.irPara('#/login');
    }
};

function atualizarCabecalho() {
    const logado = Boolean(estado.usuario);
    // Menus, conta e negócio só aparecem para quem entrou.
    document.querySelectorAll('.so-logado').forEach((parte) => parte.classList.toggle('d-none', !logado));
    document.getElementById('usuario-logado').textContent = logado ? estado.usuario.nome : '';
    document.getElementById('papel-logado').textContent = logado
        ? `Perfil: ${estado.usuario.papel === 'ADMIN' ? 'administrador' : 'equipe'}`
        : '';
    document.getElementById('usuario-logado-mais').textContent = logado ? `Entrou como ${estado.usuario.nome}` : '';

    // O negócio escolhido fica sempre à vista: vender no negócio errado é o erro mais caro.
    const selo = document.getElementById('negocio-atual');
    selo.textContent = NOMES_NEGOCIO[estado.negocio] ?? 'Escolher negócio';
    selo.dataset.negocio = estado.negocio ?? '';
    // A paleta também muda: vermelho na pastelaria, azul-marinho na peixaria (app.css).
    // Sem ninguém logado (tela de login), fica a do Galo & Cia, vermelha.
    const negocioDaTela = logado && estado.negocio ? estado.negocio : '';
    if (document.body.dataset.negocio !== negocioDaTela) {
        document.body.dataset.negocio = negocioDaTela;
        document.querySelector('meta[name="theme-color"]')
            .setAttribute('content', negocioDaTela === 'PEIXARIA' ? '#0F4C75' : '#B3191E');
    }
    const logo = LOGOS[estado.negocio] ?? LOGOS.PASTELARIA;
    const logoTopo = document.getElementById('logo-topo');
    if (!logoTopo.src.endsWith(logo)) logoTopo.src = logo;

    // Destaca a tela em que a pessoa está (nos dois menus) e esconde o que o papel dela não permite.
    const rotaAtual = location.hash || '#/login';
    const papel = estado.usuario?.papel;
    document.querySelectorAll('.menu-link[data-rota], .menu-item[data-rota]').forEach((link) => {
        const aqui = link.dataset.rota === rotaAtual;
        link.classList.toggle('active', aqui);
        if (aqui) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
        link.classList.toggle('d-none', Boolean(link.dataset.papel) && link.dataset.papel !== papel);
    });
    document.getElementById('botao-mais').classList.toggle('active', rotasDoMais.has(rotaAtual));
    // No computador, o "Mais" e o menu da conta ficam destacados quando a tela atual está dentro deles.
    for (const [botao, menu] of [['botao-mais-topo', 'menu-mais-topo'], ['botao-conta', 'menu-conta']]) {
        const dentro = Boolean(document.querySelector(`#${menu} .menu-item[data-rota="${rotaAtual}"]`));
        document.getElementById(botao).classList.toggle('active', dentro);
    }

    // Trocou de tela pelo "Mais": o painel fecha sozinho.
    const painelMais = document.getElementById('menu-mais');
    bootstrap.Offcanvas.getInstance(painelMais)?.hide();
}

/**
 * Um painel aberto dentro da tela (ex.: o pedido no celular) some junto com a
 * tela ao trocar de rota, mas o fundo escurecido dele fica no <body>. Aqui ele
 * é retirado e a página volta a rolar normalmente.
 */
function fecharPaineisDaTela() {
    tela.querySelectorAll('.offcanvas, .offcanvas-lg').forEach((painel) => bootstrap.Offcanvas.getInstance(painel)?.dispose());
    document.querySelectorAll('.offcanvas-backdrop').forEach((fundo) => fundo.remove());
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
}

async function carregarSessao() {
    try {
        estado.usuario = await api.get('/api/auth/me');
    } catch {
        estado.usuario = null;
    }
}

async function mostrarTela() {
    const rota = location.hash || '#/login';

    if (!estado.usuario) {
        await carregarSessao();
    }
    if (!estado.usuario && rota !== '#/login') {
        contexto.irPara('#/login');
        return;
    }
    if (estado.usuario && rota === '#/login') {
        contexto.irPara(estado.negocio ? '#/venda' : '#/negocio');
        return;
    }
    if (somenteAdmin.has(rota) && estado.usuario.papel !== 'ADMIN') {
        avisar('Essa tela é só para administradores.', 'warning');
        contexto.irPara(estado.negocio ? '#/venda' : '#/negocio');
        return;
    }

    // Sem ninguém logado, a tela de login ocupa a página inteira (sem barra e sem margens).
    const modoLogin = !estado.usuario;
    document.body.classList.toggle('modo-login', modoLogin);
    tela.classList.toggle('container', !modoLogin);
    tela.classList.toggle('py-3', !modoLogin);

    atualizarCabecalho();
    const renderizar = telas[rota] ?? renderLogin;
    fecharPaineisDaTela();
    tela.innerHTML = '';
    await renderizar(tela, contexto);
}

window.addEventListener('hashchange', mostrarTela);
window.addEventListener('sessao-expirada', () => {
    // Só age se havia alguém logado. Sem isso, a tela de login se redesenharia
    // em loop, e cada redesenho refaz a consulta da sessão.
    if (!estado.usuario) return;
    estado.usuario = null;
    // Se já estiver no login, não há mudança de endereço para avisar: mostra a tela direto.
    if (location.hash === '#/login') {
        mostrarTela();
    } else {
        contexto.irPara('#/login');
    }
});
document.querySelectorAll('.acao-sair').forEach((botao) => botao.addEventListener('click', () => contexto.sair()));

mostrarTela();
