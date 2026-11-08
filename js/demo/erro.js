// O mesmo erro do sistema real: tem o status HTTP e a mensagem para a pessoa ler.

export class ErroApi extends Error {
    constructor(status, mensagem) {
        super(mensagem);
        this.status = status;
    }
}
