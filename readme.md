# AcodeX - IDE • Code • Build

<p align="center">
  <img src='res/logo_1.png' width='250'>
</p>

## • Overview

AcodeX é um editor de código e IDE completo para Android, construído a partir do projeto Acode. Edite HTML, CSS, JavaScript, Python, Java e dezenas de outras linguagens direto do seu celular, com terminal embutido, suporte a plugins e um fluxo de build pensado para quem programa em movimento.

## • Features

- Edite e crie sites, com preview instantâneo no navegador.
- Edição de código-fonte para Python, Java, JavaScript e muitas outras linguagens.
- Console JavaScript embutido.
- Integração S/FTP e terminal SSH.
- Terminal embutido (Alpine).
- Suporte multi-idioma com ferramentas de gerenciamento simples.
- Grande coleção de plugins da comunidade para expandir o editor.

## • Project Structure

<pre>
AcodeX/
|
|- src/   - Código principal e arquivos de idioma
|
|- www/   - Documentos públicos, arquivos compilados e templates HTML
|
|- utils/ - Ferramentas de CLI para build, manipulação de strings e mais
|
|- codemirror-lsp-client/ - Submódulo git fornecendo @codemirror/lsp-client (clone com --recurse-submodules)
</pre>

## • Multi-language Support

Adicione novos idiomas facilmente criando um arquivo com o código do idioma (ex.: en-us para inglês) em `src/lang/` e incluindo-o em `src/lib/lang.js`. Gerencie strings entre idiomas com comandos utilitários:

```shell
pnpm run lang add
pnpm run lang remove
pnpm run lang search
pnpm run lang update
```

## • Contributing & Building the Application

Veja CONTRIBUTING.md para instruções detalhadas de build e contribuição.

## • Developing a Plugin for AcodeX

AcodeX mantém compatibilidade com o sistema de plugins do Acode. Para documentação completa sobre criação de plugins, veja o repositório https://github.com/Acode-Foundation/acode-plugin e a documentação em https://docs.acode.app/

## • Créditos

AcodeX é baseado no projeto open-source Acode, da Foxdebug / Acode Foundation (https://github.com/Acode-Foundation/Acode), distribuído sob licença MIT. Agradecimentos a toda a comunidade de contribuidores do projeto original.

## License

Este projeto é distribuído sob a licença MIT. Veja license.txt para detalhes.
