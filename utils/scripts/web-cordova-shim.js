// web-cordova-shim.js — gera www/cordova.js para o build web (Vercel).
// No Android o cordova.js real é gerado pelo Cordova; este stub só existe
// no deploy web, para a página dar boot (deviceready) no navegador.
// www/cordova.js está no .gitignore — nunca comitar.

const fs = require("node:fs");
const path = require("node:path");

const pkg = require("../../package.json");
const dest = path.join(__dirname, "..", "..", "www", "cordova.js");

const stub = `/*
 * cordova.js (stub web) — gerado por utils/scripts/web-cordova-shim.js
 * Plataforma: browser (deploy Vercel). Plugins nativos indisponíveis.
 */
(function () {
  "use strict";

  window.cordova = window.cordova || {
    platformId: "browser",
    version: "${pkg.version}",
    plugins: {},
    exec: function (success, fail) {
      if (typeof fail === "function") {
        fail("Plugin nativo indisponivel no navegador");
      }
    },
  };

  // Globais que o boot do app espera dos plugins
  window.BuildInfo = window.BuildInfo || {
    packageName: "${pkg.name}",
    version: "${pkg.version}",
    versionCode: 1,
  };

  var memFS = {
    // caminhos ficticios em memoria para o boot
    applicationDirectory: "file:///app/",
    externalDataDirectory: "file:///data/",
    externalCacheDirectory: "file:///cache/external/",
    dataDirectory: "file:///data/",
    cacheDirectory: "file:///cache/",
  };
  window.cordova.file = memFS;
  window.resolveLocalFileSystemURL =
    window.resolveLocalFileSystemURL ||
    function (url, success, fail) {
      // Entrada de diretorio vazia em memoria
      if (typeof success === "function") {
        success({
          isFile: false,
          isDirectory: true,
          name: String(url).split("/").filter(Boolean).pop() || "root",
          fullPath: url,
          toURL: function () { return url; },
          toInternalURL: function () { return url; },
        });
      }
    };

  // dispara deviceready como o Cordova faria
  function fireReady() {
    var evt;
    try {
      evt = new Event("deviceready");
    } catch (e) {
      evt = document.createEvent("Events");
      evt.initEvent("deviceready", true, false);
    }
    document.dispatchEvent(evt);
  }
  if (document.readyState === "complete") {
    setTimeout(fireReady, 50);
  } else {
    window.addEventListener("load", function () { setTimeout(fireReady, 50); });
  }
})();
`;

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, stub);
console.log("web-cordova-shim: www/cordova.js gerado (stub browser)");
