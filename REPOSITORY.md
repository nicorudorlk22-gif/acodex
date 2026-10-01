# 📚 Acode Original - Repository Overview

## 📖 Sobre este Repositório

**Acode Original** é uma aplicação de código aberto sob a licença **MIT** que faz parte do ecossistema do Acode Foundation. Este repositório contém uma aplicação baseada em **Cordova** com suporte multi-plataforma (iOS e Android).

### 📊 Informações Principais
- **Proprietário:** [rlkbiloga-coder](https://github.com/rlkbiloga-coder)
- **Repositório:** [acode_original](https://github.com/rlkbiloga-coder/acode_original)
- **Licença:** MIT License
- **Status:** Ativo e Público
- **Branch Padrão:** main
- **Criado:** 35 minutos atrás
- **Última atualização:** 3 minutos atrás

---

## 🗂️ Estrutura do Projeto

### Diretórios Principais

| Diretório | Descrição |
|-----------|-----------|
| **`src/`** | Código-fonte principal da aplicação |
| **`www/`** | Arquivos web estáticos e recursos |
| **`res/`** | Recursos de aplicação (ícones, imagens, etc) |
| **`hooks/`** | Scripts Cordova para customização do build |
| **`tests/`** | Testes automatizados |
| **`utils/`** | Utilitários e funções auxiliares |
| **`fastlane/`** | Configuração Fastlane para CI/CD |
| **`gradle/`** | Configurações Gradle para Android |
| **`.github/`** | GitHub Actions e workflows |
| **`.vscode/`** | Configurações VS Code |
| **`.devcontainer/`** | Ambiente de desenvolvimento containerizado |

### Arquivos de Configuração Importantes

| Arquivo | Propósito |
|---------|----------|
| `config.xml` | Configuração principal do Cordova |
| `package.json` | Dependências e scripts npm |
| `tsconfig.json` | Configuração TypeScript |
| `jsconfig.json` | Configuração JavaScript |
| `biome.json` | Configuração Biome (linter/formatter) |
| `rspack.config.js` | Configuração Rspack (bundler) |
| `webpack.config.js` | Configuração Webpack alternativa |
| `.babelrc` | Configuração Babel para transpilação |
| `vitest.config.js` | Configuração Vitest para testes |
| `postcss.config.js` | Configuração PostCSS |

---

## 💻 Stack Tecnológico

### Linguagens de Programação
```
├── JavaScript      59.8% ████████████████████████████
├── Java           15.6% ██████████
├── TypeScript     15.4% ██████████
├── SCSS            5.8% ████
├── Kotlin          1.5% █
├── CSS             1.0% 
└── Outro           0.9%
```

### Principais Tecnologias

**Frontend:**
- ⚛️ **JavaScript/TypeScript** - Linguagem principal
- 🎨 **SCSS/CSS** - Estilização
- 📦 **Rspack/Webpack** - Bundlers
- 🧪 **Vitest** - Framework de testes

**Backend/Native:**
- ☕ **Java** - Código Android nativo
- 🎯 **Kotlin** - Suporte Kotlin para Android
- 🔧 **Cordova** - Framework multi-plataforma

**Ferramentas de Desenvolvimento:**
- 🌳 **Git** - Controle de versão
- 📝 **Babel** - Transpilador JavaScript
- 🎯 **Biome** - Linter e formatter
- 🔍 **PostCSS** - Processador CSS
- 🏗️ **Gradle** - Build Android
- 🚀 **Fastlane** - Automação CI/CD

---

## 📦 Plugins Cordova Inclusos

### AdMob Plus
- **Descrição:** Sistema de publicidade integrado
- **Recursos:**
  - App Open Ads
  - Banner Ads
  - Interstitial Ads
  - Rewarded Ads
  - Rewarded Interstitial Ads
  - Native Ads
  - WebView Ads
  - User Consent

### FTP Plugin
- **Descrição:** Cliente FTP para acesso a servidores
- **Recursos:**
  - Listar diretórios
  - Criar/deletar diretórios
  - Upload/Download de arquivos
  - Controle de progresso
  - Suporte iOS e Android

---

## 🚀 Começando

### Pré-requisitos
- Node.js e npm/yarn instalados
- Git
- Cordova CLI: `npm install -g cordova`
- Dependências específicas de plataforma (Android SDK, Xcode, etc)

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/rlkbiloga-coder/acode_original.git
cd acode_original

# Instalar dependências
npm install
# ou
yarn install
# ou
bun install
```

### Desenvolvimento

```bash
# Build da aplicação
npm run build

# Modo desenvolvimento
npm run dev

# Executar testes
npm test

# Lint e format
npm run lint
npm run format
```

### Build para Plataformas

```bash
# Android
cordova build android

# iOS
cordova build ios
```

---

## 📋 Principais Features

### 1. **Suporte Multi-Plataforma**
   - iOS nativo com CFNetwork.framework
   - Android com suporte Java/Kotlin

### 2. **Integração com Publicidade**
   - Google AdMob integrado
   - Múltiplos formatos de anúncios

### 3. **Conectividade FTP**
   - Upload/Download de arquivos
   - Gerenciamento de diretórios remotos

### 4. **Build Moderno**
   - Rspack para builds otimizadas
   - TypeScript para type safety
   - Tests com Vitest

---

## 🔧 Configurações de Build

### Rspack Config
Bundler principal otimizado para performance

### Webpack Config
Alternativa para build com Webpack tradicional

### Gradle
Configuração específica para Android com suporte a ProGuard

---

## 📄 Documentação

| Documento | Link |
|-----------|------|
| **README** | [readme.md](./readme.md) |
| **CHANGELOG** | [CHANGELOG.md](./CHANGELOG.md) |
| **Contribuindo** | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| **Código de Conduta** | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |

### Documentação de Plugins
- [Hooks Cordova](./hooks/README.md)
- [AdMob Plus](./src/plugins/admob/README.md)
- [FTP Plugin](./src/plugins/ftp/README.md)

---

## 🤝 Contribuindo

Este projeto segue um Código de Conduta e encorajamos contribuições da comunidade!

### Passos para Contribuir

1. **Fork** o repositório
2. **Clone** seu fork: `git clone https://github.com/seu-usuario/acode_original.git`
3. **Crie uma branch** para sua feature: `git checkout -b feature/MinhaFeature`
4. **Commit** suas mudanças: `git commit -m 'Add some AmazingFeature'`
5. **Push** para a branch: `git push origin feature/MinhaFeature`
6. **Abra um Pull Request**

Verifique [CONTRIBUTING.md](./CONTRIBUTING.md) para diretrizes detalhadas.

---

## ⚖️ Licença

Este projeto está licenciado sob a **MIT License** - veja o arquivo [LICENSE](./LICENSE) para detalhes.

---

## 📚 Recursos Adicionais

### Ferramentas de Análise
- **Biome** para linting e formatting
- **Vitest** para testes unitários
- **Typos** para verificação ortográfica (_typos.toml)

### Configurações de Ambiente
- **VSCode** - Configurações específicas em `.vscode/`
- **Dev Container** - Ambiente containerizado em `.devcontainer/`
- **Git Modules** - Submódulos gerenciados em `.gitmodules`

### Ciência de Dados
- **Package Locks** - package-lock.json (568KB)
- **Bun Lock** - bun.lock (296KB)
- **Gitignore** - Controle de arquivos ignorados

---

## 🐛 Reportar Issues

Se encontrar um bug ou tiver uma sugestão de melhoria, abra uma [Issue](https://github.com/rlkbiloga-coder/acode_original/issues).

---

## 🌟 Estatísticas do Repositório

- **Forks:** 0
- **Watchers:** 0
- **Stars:** 0
- **Open Issues:** 0
- **Discussões:** Habilitadas
- **GitHub Pages:** Habilitado
- **Projetos:** Habilitados
- **Wiki:** Habilitado

---

## 📞 Contato

- **Proprietário:** [@rlkbiloga-coder](https://github.com/rlkbiloga-coder)
- **GitHub:** [acode_original](https://github.com/rlkbiloga-coder/acode_original)

---

*Última atualização: 30 de setembro de 2026*
