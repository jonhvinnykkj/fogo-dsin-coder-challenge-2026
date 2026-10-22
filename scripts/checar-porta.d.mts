// Tipos de scripts/checar-porta.mjs (o script é JavaScript puro, como scripts/checar-node.mjs).
export declare const PORTA_PADRAO: number;
export declare class ErroDePorta extends Error {}
export declare function lerPorta(valor: string | undefined): number;
export declare function mensagemPortaOcupada(porta: number): string;
export declare function enderecosParaTestar(host: string): string[];
/** false só quando a porta está ocupada em algum endereço em que o servidor é alcançado (em loopback: 127.0.0.1, ::1 e ::). */
export declare function portaLivre(porta: number, host?: string): Promise<boolean>;
