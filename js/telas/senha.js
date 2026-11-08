// Tela "Minha senha": cada pessoa troca a PRÓPRIA senha (qualquer papel).
//
// O backend exige a senha atual e, depois da troca, derruba as outras sessões
// dessa pessoa (outros aparelhos), mantendo esta aberta.
// As conferências daqui (confirmação igual, tamanho) só avisam antes de enviar.

import { api } from '../api.js';

const SENHA_MINIMA = 12;

export async function renderSenha(tela) {
    tela.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-12 col-md-8 col-lg-6">
                <div class="cabecalho-tela">
                    <h1 class="h3 fw-bold mb-1">Minha senha</h1>
                    <p class="text-secondary mb-0">
                        Troque a senha que você recebeu por uma só sua. Ao trocar, quem estiver
                        usando a sua conta em outro aparelho sai na hora.
                    </p>
                </div>

                <div class="card">
                    <div class="card-body p-4">
                        <div id="senha-ok" class="alert alert-success py-2 d-none" role="status"></div>
                        <div id="senha-erro" class="alert alert-danger py-2 d-none" role="alert"></div>

                        <form id="form-senha" novalidate>
                            <div class="mb-3">
                                <label class="form-label" for="senha-atual">Senha atual</label>
                                <input id="senha-atual" type="password" class="form-control campo-senha"
                                       autocomplete="current-password" maxlength="128" required>
                                <div class="invalid-feedback" id="erro-atual">Informe a sua senha atual.</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label" for="senha-nova">Nova senha</label>
                                <input id="senha-nova" type="password" class="form-control campo-senha"
                                       autocomplete="new-password" maxlength="128" required
                                       aria-describedby="contador-senha">
                                <div id="contador-senha" class="form-text contador-senha">
                                    0 de ${SENHA_MINIMA} caracteres
                                </div>
                                <div class="invalid-feedback" id="erro-nova"></div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label" for="senha-confirma">Repita a nova senha</label>
                                <input id="senha-confirma" type="password" class="form-control campo-senha"
                                       autocomplete="new-password" maxlength="128" required>
                                <div class="invalid-feedback">As duas senhas novas não são iguais.</div>
                            </div>

                            <div class="form-check form-switch mb-4">
                                <input class="form-check-input" type="checkbox" role="switch" id="mostrar-senhas">
                                <label class="form-check-label" for="mostrar-senhas">Mostrar senhas</label>
                            </div>

                            <button class="btn btn-primary btn-lg w-100" type="submit">Trocar senha</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>`;

    const form = tela.querySelector('#form-senha');
    const campoAtual = tela.querySelector('#senha-atual');
    const campoNova = tela.querySelector('#senha-nova');
    const campoConfirma = tela.querySelector('#senha-confirma');
    const contador = tela.querySelector('#contador-senha');
    const erroNova = tela.querySelector('#erro-nova');
    const erroAtual = tela.querySelector('#erro-atual');
    const caixaOk = tela.querySelector('#senha-ok');
    const caixaErro = tela.querySelector('#senha-erro');
    const botao = form.querySelector('button[type="submit"]');

    const mostrar = (caixa, mensagem) => {
        caixa.textContent = mensagem;   // textContent: nunca vira HTML
        caixa.classList.toggle('d-none', !mensagem);
    };

    // Uma chave só mostra/esconde os três campos.
    tela.querySelector('#mostrar-senhas').addEventListener('change', (evento) => {
        tela.querySelectorAll('.campo-senha').forEach((campo) => {
            campo.type = evento.target.checked ? 'text' : 'password';
        });
    });

    // Contador ao vivo: a regra dos 12 caracteres fica visível enquanto digita.
    // O "ok" vem em texto, não só na cor.
    campoNova.addEventListener('input', () => {
        const tamanho = campoNova.value.length;
        const atingiu = tamanho >= SENHA_MINIMA;
        contador.textContent = atingiu
            ? `${tamanho} caracteres: tamanho ok`
            : `${tamanho} de ${SENHA_MINIMA} caracteres`;
        contador.classList.toggle('contador-ok', atingiu);
    });

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrar(caixaOk, '');
        mostrar(caixaErro, '');

        const atual = campoAtual.value;
        const nova = campoNova.value;
        const confirmacao = campoConfirma.value;

        // Cada problema marca o campo exato onde corrigir.
        let problemaNova = '';
        if (nova.length < SENHA_MINIMA) {
            problemaNova = `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
        } else if (nova === atual) {
            problemaNova = 'A nova senha precisa ser diferente da atual.';
        }
        erroAtual.textContent = 'Informe a sua senha atual.';
        erroNova.textContent = problemaNova;
        campoAtual.classList.toggle('is-invalid', atual === '');
        campoNova.classList.toggle('is-invalid', problemaNova !== '');
        campoConfirma.classList.toggle('is-invalid', !problemaNova && nova !== confirmacao);

        const primeiroComProblema = form.querySelector('.is-invalid');
        if (primeiroComProblema) {
            primeiroComProblema.focus();
            return;
        }

        botao.disabled = true;
        botao.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Trocando…';
        try {
            await api.put('/api/auth/senha', { senhaAtual: atual, senhaNova: nova });
            form.reset();
            tela.querySelectorAll('.campo-senha').forEach((campo) => { campo.type = 'password'; });
            contador.textContent = `0 de ${SENHA_MINIMA} caracteres`;
            contador.classList.remove('contador-ok');
            mostrar(caixaOk, 'Senha trocada. Nos outros aparelhos, será preciso entrar de novo com a senha nova.');
        } catch (erro) {
            // Ex.: "A senha atual está incorreta." (vem do backend)
            if (erro.status === 422 && erro.message.includes('atual')) {
                erroAtual.textContent = erro.message;
                campoAtual.classList.add('is-invalid');
                campoAtual.select();
            } else {
                mostrar(caixaErro, erro.message);
            }
        } finally {
            botao.disabled = false;
            botao.textContent = 'Trocar senha';
        }
    });

    campoAtual.focus();
}
