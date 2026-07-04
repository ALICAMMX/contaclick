declare module "pdfjs-dist/build/pdf.mjs" {
  const pdfjs: any;
  export = pdfjs;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const url: string;
  export default url;
}