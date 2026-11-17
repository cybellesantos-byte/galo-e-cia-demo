// Tela de login: um cartão só, centralizado, com logos, nome e formulário dentro.

import { api } from '../api.js';

export async function renderLogin(tela, contexto) {
    tela.innerHTML = `
        <div class="login-palco">
            <div class="card login-cartao">
                <div class="card-body p-4 p-md-5">
                    <header class="login-marca">
                        <div class="login-logos">
                            <img src="img/logo-galo.png" alt="Pastelaria do Galo" width="140" height="130">
                            <img src="img/logo-peixaria.svg" alt="Peixaria" width="140" height="130">
                        </div>
                        <h1 class="login-titulo">Galo <span>&amp; Cia</span></h1>
                    </header>

                    <div>
                        <div id="login-erro" class="alert alert-danger py-2 d-none" role="alert"></div>

                        <form id="form-login" novalidate>
                            <div class="form-floating mb-3">
                                <input id="login-usuario" class="form-control form-control-lg" placeholder="Usuário"
                                       autocomplete="username" autocapitalize="none" spellcheck="false"
                                       maxlength="60" required>
                                <label for="login-usuario">Usuário</label>
                            </div>

                            <div class="mb-4">
                                <div class="input-group">
                                    <div class="form-floating">
                                        <input id="login-senha" type="password" class="form-control form-control-lg"
                                               placeholder="Senha" autocomplete="current-password"
                                               maxlength="128" required>
                                        <label for="login-senha">Senha</label>
                                    </div>
                                    <button id="mostrar-senha" class="btn btn-outline-secondary btn-lg" type="button"
                                            aria-pressed="false" aria-controls="login-senha">Mostrar</button>
                                </div>
                                <span id="aviso-caps" class="aviso-caps d-none">Caps Lock está ligado</span>
                            </div>

                            <button class="btn btn-primary btn-lg w-100" type="submit">Entrar</button>
                        </form>
                        <p class="dica-demo">🧪 Demonstração: entre com <strong>qualquer</strong> usuário e senha.<br>Use <code>bruno</code> para ver o perfil da equipe, ou <code>admin</code> para o de administradora.</p>
                    </div>
                </div>
            </div>
        </div>`;

    const form = tela.querySelector('#form-login');
    const campoUsuario = tela.querySelector('#login-usuario');
    const campoSenha = tela.querySelector('#login-senha');
    const botaoEntrar = form.querySelector('button[type="submit"]');
    const botaoMostrar = tela.querySelector('#mostrar-senha');
    const avisoCaps = tela.querySelector('#aviso-caps');
    const caixaErro = tela.querySelector('#login-erro');

    // O erro aparece DENTRO do cartão, perto de onde a pessoa está olhando.
    const mostrarErro = (mensagem) => {
        caixaErro.textContent = mensagem;   // textContent: nunca vira HTML
        caixaErro.classList.toggle('d-none', !mensagem);
    };

    // Enquanto espera a resposta, o botão avisa e não aceita um segundo clique.
    const aguardando = (sim) => {
        botaoEntrar.disabled = sim;
        botaoEntrar.innerHTML = sim
            ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Entrando…'
            : 'Entrar';
    };

    botaoMostrar.addEventListener('click', () => {
        const visivel = campoSenha.type === 'text';
        campoSenha.type = visivel ? 'password' : 'text';
        botaoMostrar.textContent = visivel ? 'Mostrar' : 'Esconder';
        botaoMostrar.setAttribute('aria-pressed', String(!visivel));
        campoSenha.focus();
    });

    // Caps Lock ligado é a causa mais comum de "senha errada" que não é senha errada.
    const conferirCaps = (evento) => {
        if (typeof evento.getModifierState === 'function') {
            avisoCaps.classList.toggle('d-none', !evento.getModifierState('CapsLock'));
        }
    };
    campoSenha.addEventListener('keydown', conferirCaps);
    campoSenha.addEventListener('keyup', conferirCaps);

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const usuario = campoUsuario.value.trim();
        const senha = campoSenha.value;
        if (!usuario || !senha) {
            mostrarErro('Preencha usuário e senha.');
            (usuario ? campoSenha : campoUsuario).focus();
            return;
        }

        mostrarErro('');
        aguardando(true);
        try {
            contexto.estado.usuario = await api.post('/api/auth/login', { username: usuario, senha });
            campoSenha.value = '';
            contexto.irPara(contexto.estado.negocio ? '#/venda' : '#/negocio');
        } catch (erro) {
            mostrarErro(erro.message);
            campoSenha.select();
        } finally {
            aguardando(false);
        }
    });

    campoUsuario.focus();
}
