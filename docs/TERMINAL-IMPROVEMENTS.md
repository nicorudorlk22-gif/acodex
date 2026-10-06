# Terminal Stability Improvements para AcodeX

## Problema
O terminal caía ao abrir plugins instalados pelo servidor e sofria atualizações constantes.

## Causas Raiz Identificadas

1. **Timeout na criação de sessão** - Sessão demorava mais que o limite esperado
2. **Múltiplas instâncias de terminal abertas** - Causava vazamento de memória
3. **Falta de validação de estado** - Operações aconteciam em terminais inválidos
4. **Sincronização inadequada** - Race conditions entre plugin install e terminal init

---

## Soluções Implementadas

### 1. **Retry Logic com Backoff Exponencial**
```javascript
// Tenta criar sessão até 3 vezes
// Aguarda 1s, 2s, 3s entre tentativas
Terminal.createSession() → com retry automático
```

### 2. **Validação de Estado**
```javascript
// Antes de qualquer operação no terminal:
- Verifica se terminal existe
- Verifica se elemento DOM está presente
- Valida métodos de escrita
```

### 3. **Limpeza de Recursos**
```javascript
// Monitora e fecha terminais antigos
// Limpa WeakMaps automaticamente
// Evita vazamento de memória
```

### 4. **Isolamento de Plugin Install**
```javascript
// Fecha terminais extras antes de instalar plugin
// Evita conflitos de sincronização
// Previne múltiplas atualizações
```

---

## Como Usar

### 1. Integre no seu `main.js`:
```javascript
import { terminalStabilityFixes } from './src/components/terminal/terminal-stability.patch.js';

// Após inicializar o app
terminalStabilityFixes.improveServerModeHandling();
terminalStabilityFixes.addCrashRecovery(terminalManager);
```

### 2. Configure Timeouts Maiores (em `terminal.js`):
```javascript
// Aumente de 10s para 15s+
const TIMEOUT_MS = 15000;
```

### 3. Adicione Logs para Debugging:
```bash
# No Termux ou device, rode:
adb logcat | grep "Terminal\|stability"
```

---

## Testes Recomendados

```bash
# Teste 1: Abrir terminal após instalar plugin
1. Instale plugin via servidor
2. Abra Terminal
3. Verifique se carrega sem crash

# Teste 2: Múltiplos terminais
1. Abra 5+ abas de terminal
2. Instale plugin em background
3. Verifique se não congela

# Teste 3: Stress test
1. Abra/Feche terminal rapidamente
2. Instale plugins simultaneamente
3. Monitore memória (adb shell dumpsys meminfo)
```

---

## Próximos Passos

- [ ] Integrar `terminal-stability.patch.js` no fluxo de build
- [ ] Adicionar telemetria de crashes
- [ ] Implementar circuit breaker para fallback mode
- [ ] Criar dashboard de monitoramento terminal

---

## Referências
- `src/plugins/terminal/www/Terminal.js` - Plugin Alpine
- `src/components/terminal/terminal.js` - Componente Xterm
- `src/components/terminal/terminalManager.js` - Gerenciador de sessões
