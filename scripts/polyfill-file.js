/**
 * Polyfill pour l'API File dans Node.js
 * Certains modules npm utilisent l'API File du navigateur
 * Ce polyfill permet de les utiliser côté serveur
 */

if (typeof globalThis.File === 'undefined') {
  class File extends Blob {
    constructor(fileParts, fileName, options = {}) {
      super(fileParts, options);
      this.name = fileName;
      this.lastModified = options.lastModified || Date.now();
    }
  }
  globalThis.File = File;
}

if (typeof globalThis.Blob === 'undefined') {
  // Node.js 18+ a Blob natif, mais au cas où
  const { Blob } = require('buffer');
  globalThis.Blob = Blob;
}
