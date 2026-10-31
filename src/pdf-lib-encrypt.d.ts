declare module 'pdf-lib-encrypt' {
  export function configure(pdfLib: unknown): void;
  export function lock(
    bytes: Uint8Array,
    password: string,
    options: {algo: 'aes256'},
  ): Promise<Uint8Array>;
}
