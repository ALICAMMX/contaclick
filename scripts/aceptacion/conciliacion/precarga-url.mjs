// Permite importar los parsers reales fuera de Vite: resuelve los imports `?url`
// (usados por pdfjs) a una cadena, igual que hace el bundler en la aplicación.
import { plugin } from "bun";

plugin({
  name: "vite-url-imports",
  setup(build) {
    build.onLoad({ filter: /\?url$/ }, (args) => ({
      contents: `export default ${JSON.stringify(args.path.replace(/\?url$/, ""))};`,
      loader: "js",
    }));
  },
});
