# Galo & Cia · Demonstração

Esta é uma **demonstração clicável** do Galo & Cia, o sistema que controla a pastelaria e a peixaria de uma família: caixa do dia, vendas, despesas, repasses ao entregador, relatórios e cardápio para o cliente.

> 🧪 **Tudo aqui é fictício.** Os produtos, as vendas, as pessoas e os valores foram inventados. Nada é salvo: ao recarregar a página, a demonstração volta ao começo.

## Como usar

- **Painel interno:** abra a página inicial. Você já entra como administradora. Para ver o perfil da equipe, saia e entre com o usuário `bruno` (qualquer senha serve).
- **Cardápio do cliente:** `cardapio.html`. Escolha os itens, retirada ou entrega e a forma de pagamento. O botão "Pedir pelo WhatsApp" só mostra a mensagem que seria enviada.

## Como funciona

O sistema de verdade tem um servidor em Java (Spring Boot) com banco PostgreSQL, que **não está neste repositório**. As telas conversam com ele por um único arquivo, `js/api.js`.

Aqui, esse arquivo foi trocado por um "servidor de mentira" que roda dentro do navegador (pasta `js/demo/`):

| Arquivo | O que faz |
|---|---|
| `js/api.js` | Recebe os pedidos das telas, como no sistema real |
| `js/demo/rotas.js` | Descobre qual regra atende cada endereço (ex.: `POST /api/vendas`) |
| `js/demo/banco.js` | Guarda os dados na memória e aplica as regras: caixa, venda, troco, repasse |
| `js/demo/relatorios.js` | Calcula os relatórios em cima das vendas e despesas |
| `js/demo/semente.js` | Cria 30 dias de histórico inventado, usando as mesmas regras |
| `js/demo/whatsapp.js` | Mostra o pedido em vez de abrir o WhatsApp |

As telas (`js/telas/`) são as mesmas do sistema real e nem sabem que o servidor mudou.

## Tecnologias

HTML, CSS, Bootstrap e JavaScript puro (módulos ES). Sem build e sem dependências para instalar.

## Rodar no seu computador

Os módulos de JavaScript precisam de um servidor local (abrir o arquivo direto não funciona):

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.
