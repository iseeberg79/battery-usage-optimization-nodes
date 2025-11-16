# Testing Guide

## Quick Start

```bash
# Dependencies installieren
npm install

# Alle Tests ausführen
npm test

# Tests mit Coverage
npm run test:coverage
```

## Verfügbare Test-Kommandos

| Kommando | Beschreibung |
|----------|--------------|
| `npm test` | Führt alle Tests aus |
| `npm run test:coverage` | Tests mit Coverage-Report |
| `npm run test:watch` | Watch-Modus für Entwicklung |
| `npm run test:unit` | Nur Unit-Tests |
| `npm run test:integration` | Nur Integration-Tests |
| `npm run test:verbose` | Detaillierte Test-Ausgabe |

## Was wird getestet?

### ✅ Unit-Tests
- **DetermineBatteryMode Node**
  - Konfigurationswerte
  - SOC-Bewertung (high/medium/low)
  - Batteriemodus-Logik (normal/hold/charge)
  - Wintermodus-Erkennung
  - Preisbasierte Entscheidungen
  - Externe Prognosen
  - Output-Struktur
  - Fehlerbehandlung

### ✅ Integration-Tests
- **Vollständige Optimierungs-Flows**
  - Sommer-Szenario: Hohe PV-Prognose
  - Winter-Szenario: Niedrige PV-Prognose
  - Netzladung bei günstigem Preis
  - Batteriesperrung bei normalem Preis
  - Preisgesteuerte Entladung
  - Edge Cases (SOC 0%, 100%, fehlende Daten)

## Test-Struktur

```
test/
├── helpers/
│   └── node-red-helper.js              # Mock-Helper für Node-RED
├── integration/
│   └── batteryOptimization.integration.test.js  # Integration-Tests
├── determineBatteryMode.test.js        # Unit-Tests
└── README.md                           # Ausführliche Dokumentation
```

## Beispiel: Test ausführen

```bash
$ npm test

PASS test/determineBatteryMode.test.js
  DetermineBatteryMode Node
    Konfiguration
      ✓ sollte mit Standardwerten initialisiert werden (5ms)
      ✓ sollte als Node-RED Node registriert sein (2ms)
    SOC Bewertung
      ✓ sollte highSOC bei SOC > disableGridchargeThreshold erkennen (3ms)
      ✓ sollte lowSOC bei SOC <= enableGridchargeThreshold erkennen (2ms)
    ...

Test Suites: 2 passed, 2 total
Tests:       28 passed, 28 total
Snapshots:   0 total
Time:        1.234s
```

## Coverage-Report

Nach `npm run test:coverage` wird ein HTML-Report erstellt:

```bash
# Report öffnen
xdg-open coverage/lcov-report/index.html  # Linux
open coverage/lcov-report/index.html      # macOS
```

**Coverage-Ziele:**
- Minimum: 70%
- Ziel: 80%+
- Kritische Logik: 100%

## Continuous Integration

Tests werden automatisch bei jedem Push/PR ausgeführt:

- ✅ Linting (`npm run lint`)
- ✅ Tests auf Node.js 18.x, 20.x, 22.x
- ✅ Coverage-Report
- ✅ Package-Build

Status: ![CI](https://github.com/iseeberg79/battery-usage-optimization-nodes/workflows/CI/badge.svg)

## Weitere Tests hinzufügen

Siehe [test/README.md](test/README.md) für Details zum Schreiben neuer Tests.

### Beispiel: Neuen Node testen

```javascript
// test/meinNode.test.js
const NodeRedHelper = require('./helpers/node-red-helper');

describe('MeinNode', () => {
    let helper;

    beforeEach(() => {
        helper = new NodeRedHelper();
    });

    test('sollte X tun', () => {
        // Test implementieren
    });
});
```

## Probleme?

```bash
# Einzelnen Test debuggen
npx jest test/determineBatteryMode.test.js --verbose

# Cache löschen
npx jest --clearCache

# Node-Module neu installieren
rm -rf node_modules package-lock.json
npm install
```

## Nächste Schritte

Nach diesem Test-Setup:

1. **Weitere Nodes testen**: Tests für andere Nodes schreiben
   - `estimateBatterymode.js` (wichtig, hat TODOs!)
   - `controlBattery.js`
   - `evaluateGridEnergyPrices.js`

2. **API-Tests**: Externe API-Aufrufe mocken
   - Solcast API
   - Tibber API
   - Energy-Charts API

3. **E2E-Tests**: Komplette Flows in Node-RED testen

4. **Performance-Tests**: Benchmark für große Datenmengen

## Ressourcen

- [Jest Dokumentation](https://jestjs.io/)
- [Node-RED Testing](https://nodered.org/docs/creating-nodes/first-node#testing-your-node)
- [GitHub Actions](https://docs.github.com/en/actions)
