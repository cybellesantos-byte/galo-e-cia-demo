// Tela Equipe (só ADMIN): quem pode entrar no sistema.
// Ninguém é apagado: quem sai é DESATIVADO, e o histórico do que fez continua guardado.
//
// As regras de verdade (formato do usuário, senha mínima, não desativar a si
// mesmo nem o último admin) moram no backend. Aqui repetimos as de formato só
// para avisar a pessoa ANTES de enviar; se algo passar, o backend recusa.

import { api } from '../api.js';
import { avisar, confirmar, dataHoraDaCasa, escapar } from '../util.js';

// Mesmas regras do UsuarioService (backend).
const FORMATO_USUARIO = /^[a-zA-Z0-9._-]{3,60}$/;
const SENHA_MINIMA = 12;

const PAPEIS = {
    ADMIN: { nome: 'Administrador', classe: 'papel-admin' },
    EQUIPE: { nome: 'Equipe', classe: 'papel-equipe' }
};

export async function renderEquipe(tela, contexto) {
    tela.innerHTML = `
        <div class="cabecalho-tela">
            <h1 class="h3 fw-bold mb-1">Equipe</h1>
            <p class="text-secondary mb-0">
                Quem pode entrar no sistema. Quem sai é desativado, nunca apagado:
                o histórico do que a pessoa fez continua guardado.
            </p>
        </div>

        <div class="row g-4">
            <div class="col-12 col-lg-7">
                <div class="card">
                    <div class="card-body p-0" id="lista-equipe" aria-live="polite">
                        <p class="text-secondary p-4 mb-0">Carregando…</p>
                    </div>
                </div>
            </div>

            <div class="col-12 col-lg-5">
                <div class="card">
                    <div class="card-body p-4">
                        <h2 class="h5 fw-bold mb-3">Adicionar pessoa</h2>
                        <div id="cadastro-erro" class="alert alert-danger py-2 d-none" role="alert"></div>

                        <form id="form-cadastro" novalidate>
                            <div class="mb-3">
                                <label class="form-label" for="cad-nome">Nome</label>
                                <input id="cad-nome" class="form-control" maxlength="120" autocomplete="off" required>
                                <div class="invalid-feedback">Informe o nome da pessoa.</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label" for="cad-usuario">Usuário (para entrar)</label>
                                <input id="cad-usuario" class="form-control" maxlength="60" autocomplete="off"
                                       autocapitalize="none" spellcheck="false" required>
                                <div class="form-text">De 3 a 60 caracteres, sem espaços nem acentos. Ex.: ana.souza</div>
                                <div class="invalid-feedback">Use de 3 a 60 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label" for="cad-senha">Senha inicial</label>
                                <div class="input-group has-validation">
                                    <input id="cad-senha" type="password" class="form-control" maxlength="128"
                                           autocomplete="new-password" required>
                                    <button id="cad-mostrar" class="btn btn-outline-secondary" type="button"
                                            aria-pressed="false" aria-controls="cad-senha">Mostrar</button>
                                    <button id="cad-gerar" class="btn btn-outline-secondary" type="button">Gerar</button>
                                    <div class="invalid-feedback">A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.</div>
                                </div>
                                <div class="form-text">Passe a senha para a pessoa e peça para ela trocar no primeiro acesso.</div>
                            </div>

                            <fieldset class="mb-4">
                                <legend class="form-label fs-6">Papel</legend>
                                <div class="d-grid gap-2">
                                    <input type="radio" class="btn-check" name="cad-papel" id="papel-equipe" value="EQUIPE" checked>
                                    <label class="btn btn-outline-secondary opcao-papel" for="papel-equipe">
                                        <span class="opcao-titulo">Equipe</span>
                                        <span class="opcao-detalhe">Vende, abre e fecha o caixa, registra despesas.</span>
                                    </label>
                                    <input type="radio" class="btn-check" name="cad-papel" id="papel-admin" value="ADMIN">
                                    <label class="btn btn-outline-secondary opcao-papel" for="papel-admin">
                                        <span class="opcao-titulo">Administrador</span>
                                        <span class="opcao-detalhe">Tudo, inclusive cancelar vendas, pagar repasses e cuidar da equipe.</span>
                                    </label>
                                </div>
                            </fieldset>

                            <button class="btn btn-primary btn-lg w-100" type="submit">Adicionar à equipe</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>`;

    const lista = tela.querySelector('#lista-equipe');
    const form = tela.querySelector('#form-cadastro');
    const campoNome = tela.querySelector('#cad-nome');
    const campoUsuario = tela.querySelector('#cad-usuario');
    const campoSenha = tela.querySelector('#cad-senha');
    const botaoMostrar = tela.querySelector('#cad-mostrar');
    const botaoGerar = tela.querySelector('#cad-gerar');
    const botaoAdicionar = form.querySelector('button[type="submit"]');
    const caixaErro = tela.querySelector('#cadastro-erro');
    const meuUsuario = (contexto.estado.usuario?.username ?? '').toLowerCase();

    // ── Lista ────────────────────────────────────────────────────────────────

    async function carregarLista() {
        try {
            const pessoas = await api.get('/api/usuarios');
            lista.innerHTML = pessoas.map(cartaoPessoa).join('');
        } catch (erro) {
            lista.innerHTML = `<p class="text-danger p-4 mb-0">${escapar(erro.message)}</p>`;
        }
    }

    function cartaoPessoa(p) {
        const papel = PAPEIS[p.papel] ?? { nome: p.papel, classe: 'papel-equipe' };
        const souEu = p.username.toLowerCase() === meuUsuario;
        const ultimoAcesso = p.ultimoLoginEm ? `Último acesso: ${dataHoraDaCasa(p.ultimoLoginEm)}` : 'Ainda não entrou';

        // Ação: ninguém desativa a si mesmo (o backend também barra).
        let acao = '';
        if (souEu) {
            acao = '<span class="badge selo-voce">Você</span>';
        } else if (p.ativo) {
            acao = `<button class="btn btn-sm btn-outline-danger" type="button"
                            data-acao="desativar" data-id="${p.id}" data-nome="${escapar(p.nome)}">Desativar</button>`;
        } else {
            acao = `<button class="btn btn-sm btn-outline-secondary" type="button"
                            data-acao="reativar" data-id="${p.id}" data-nome="${escapar(p.nome)}">Reativar</button>`;
        }

        // O estado aparece em TEXTO ("Desativado"), não só pela cor apagada.
        return `
            <div class="pessoa ${p.ativo ? '' : 'pessoa-inativa'}">
                <div class="pessoa-avatar ${papel.classe}" aria-hidden="true">${escapar(iniciais(p.nome))}</div>
                <div class="pessoa-info">
                    <div class="d-flex flex-wrap align-items-center gap-2">
                        <span class="fw-bold">${escapar(p.nome)}</span>
                        <span class="badge ${papel.classe}">${papel.nome}</span>
                        ${p.ativo ? '' : '<span class="badge selo-inativo">Desativado</span>'}
                    </div>
                    <div class="small text-secondary">@${escapar(p.username)} · ${ultimoAcesso}</div>
                </div>
                <div class="pessoa-acao">${acao}</div>
            </div>`;
    }

    lista.addEventListener('click', async (evento) => {
        const botao = evento.target.closest('[data-acao]');
        if (!botao) return;
        const { acao, id, nome } = botao.dataset;

        if (acao === 'desativar') {
            const ok = await confirmar({
                titulo: `Desativar ${nome}?`,
                mensagem: `${nome} não vai mais conseguir entrar no sistema. Se estiver usando agora, `
                    + 'sai na próxima ação. O histórico continua guardado, e dá para reativar depois.',
                textoConfirmar: 'Desativar',
                perigo: true
            });
            if (!ok) return;
        }

        botao.disabled = true;
        try {
            await api.post(`/api/usuarios/${id}/${acao}`);
            avisar(acao === 'desativar' ? `${nome} foi desativado(a).` : `${nome} foi reativado(a).`);
            await carregarLista();
        } catch (erro) {
            avisar(erro.message, 'danger');
            botao.disabled = false;
        }
    });

    // ── Formulário ───────────────────────────────────────────────────────────

    // Sugere o usuário a partir do nome ("Ana Maria Souza" → "ana.souza"),
    // até a pessoa digitar um usuário por conta própria.
    let usuarioEditadoAMao = false;
    campoUsuario.addEventListener('input', () => {
        usuarioEditadoAMao = campoUsuario.value.trim() !== '';
    });
    campoNome.addEventListener('input', () => {
        if (!usuarioEditadoAMao) {
            campoUsuario.value = sugerirUsuario(campoNome.value);
        }
    });

    botaoMostrar.addEventListener('click', () => {
        const visivel = campoSenha.type === 'text';
        campoSenha.type = visivel ? 'password' : 'text';
        botaoMostrar.textContent = visivel ? 'Mostrar' : 'Esconder';
        botaoMostrar.setAttribute('aria-pressed', String(!visivel));
    });

    // A senha gerada aparece na tela, para o admin poder passar para a pessoa.
    botaoGerar.addEventListener('click', () => {
        campoSenha.value = gerarSenha();
        campoSenha.type = 'text';
        botaoMostrar.textContent = 'Esconder';
        botaoMostrar.setAttribute('aria-pressed', 'true');
        campoSenha.classList.remove('is-invalid');
    });

    const mostrarErro = (mensagem) => {
        caixaErro.textContent = mensagem;
        caixaErro.classList.toggle('d-none', !mensagem);
    };

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErro('');

        const nome = campoNome.value.trim();
        const usuario = campoUsuario.value.trim();
        const senha = campoSenha.value;
        const papel = form.querySelector('input[name="cad-papel"]:checked').value;

        // Marca cada campo com problema, para a pessoa ver exatamente onde corrigir.
        const nomeOk = nome !== '';
        const usuarioOk = FORMATO_USUARIO.test(usuario);
        const senhaOk = senha.length >= SENHA_MINIMA;
        campoNome.classList.toggle('is-invalid', !nomeOk);
        campoUsuario.classList.toggle('is-invalid', !usuarioOk);
        campoSenha.classList.toggle('is-invalid', !senhaOk);
        if (!nomeOk || !usuarioOk || !senhaOk) {
            form.querySelector('.is-invalid').focus();
            return;
        }

        botaoAdicionar.disabled = true;
        try {
            await api.post('/api/usuarios', { username: usuario, nome, senha, papel });
            avisar(`${nome} entrou para a equipe.`);
            form.reset();
            campoSenha.type = 'password';
            botaoMostrar.textContent = 'Mostrar';
            usuarioEditadoAMao = false;
            await carregarLista();
            campoNome.focus();
        } catch (erro) {
            // Ex.: "Já existe um usuário com esse nome de usuário." (vem do backend)
            mostrarErro(erro.message);
        } finally {
            botaoAdicionar.disabled = false;
        }
    });

    await carregarLista();
}

/** "Ana Maria Souza" → "AS". */
function iniciais(nome) {
    const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toUpperCase();
}

/** "Ana Maria Souza" → "ana.souza": sem acentos, minúsculo, primeiro e último nome. */
function sugerirUsuario(nome) {
    const partes = nome
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acentos: "João" → "Joao"
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (partes.length === 0) return '';
    const sugestao = partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}` : partes[0];
    return sugestao.slice(0, 60);
}

/**
 * Senha aleatória de 14 caracteres, sem letras que se confundem (l, 1, O, 0),
 * para ser fácil de ditar. Usa o gerador seguro do navegador (crypto).
 */
function gerarSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const limite = 256 - (256 % letras.length); // descarta sorteios que causariam viés
    let senha = '';
    while (senha.length < 14) {
        const [byte] = crypto.getRandomValues(new Uint8Array(1));
        if (byte < limite) {
            senha += letras[byte % letras.length];
        }
    }
    return senha;
}
