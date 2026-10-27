// Gera bookmarklet.min.txt e atualiza o codigo embutido no index.html.
// Uso:  npm i esbuild  &&  node build.js
const fs = require("fs");
const path = require("path");
const { transformSync } = require("esbuild");

const PLACEHOLDER = "__NIMO_CHANNEL__";

(async () => {
  const dir = __dirname;
  const src = fs.readFileSync(path.join(dir, "bookmarklet.js"), "utf8");

  const out = transformSync(src, { minify: true, charset: "ascii", legalComments: "none" });
  const code = out.code.trim().replace(/;$/, "");

  // O codigo vira um favorito (javascript:), entao nao pode ter estes caracteres.
  const bad = code.match(/[#%\r\n]/);
  if (bad) throw new Error("O codigo minificado tem um caractere proibido: " + JSON.stringify(bad[0]));

  const quoted = '"' + PLACEHOLDER + '"';
  const count = code.split(quoted).length - 1;
  if (count !== 1) throw new Error("O marcador " + PLACEHOLDER + " deveria aparecer 1 vez e apareceu " + count);

  // 1) Versao pronta para colar no favorito (sem canal fixo: pergunta na primeira vez).
  const plain = "javascript:" + code.replace(quoted, '""') + ";void 0";
  fs.writeFileSync(path.join(dir, "bookmarklet.min.txt"), plain + "\n");

  // 2) Codigo-modelo dentro do index.html (a pagina troca o marcador pelo canal digitado).
  const htmlPath = path.join(dir, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const literal = JSON.stringify(code).replace(/</g, "\\u003c");
  const next = html.replace(
    /\/\*TN_CODE_START\*\/[\s\S]*?\/\*TN_CODE_END\*\//,
    () => "/*TN_CODE_START*/" + literal + "/*TN_CODE_END*/"
  );
  if (next === html && !html.includes(literal)) throw new Error("Marcadores TN_CODE nao encontrados no index.html");
  fs.writeFileSync(htmlPath, next);

  console.log("ok: " + code.length + " caracteres de codigo");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
