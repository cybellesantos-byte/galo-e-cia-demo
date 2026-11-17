// No sistema real, o botão "Pedir pelo WhatsApp" abre a conversa da pastelaria
// com o pedido já escrito. Na demonstração, ninguém deve mandar mensagem de
// verdade: em vez de abrir o WhatsApp, esta janelinha mostra o que seria enviado.

import { escapar } from '../util.js';

export function mostrarMensagemDaDemo(mensagem) {
    let janela = document.getElementById('janela-whatsapp-demo');
    if (!janela) {
        janela = document.createElement('dialog');
        janela.id = 'janela-whatsapp-demo';
        janela.className = 'janela-demo';
        document.body.appendChild(janela);
    }
    janela.innerHTML = `
        <h2 class="h5">É aqui que o WhatsApp abriria</h2>
        <p class="mb-2">No sistema de verdade, esta mensagem aparece pronta na conversa com a pastelaria,
        e o cliente só aperta enviar. Na demonstração, nada é enviado.</p>
        <pre class="mensagem-demo">${escapar(mensagem)}</pre>
        <button type="button" class="btn btn-primary w-100">Entendi</button>`;
    janela.querySelector('button').addEventListener('click', () => janela.close());
    janela.showModal();
}
