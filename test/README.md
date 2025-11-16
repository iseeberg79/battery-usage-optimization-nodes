# Test-Dokumentation

## Übersicht

Dieses Projekt verwendet **Jest** als Test-Framework für Unit- und Integration-Tests der Node-RED Nodes.

## Verzeichnisstruktur

```
test/
├── helpers/                    # Test-Hilfsfunktionen
│   └── node-red-helper.js     # Helper für Node-RED Mocks
├── integration/                # Integration-Tests
│   └── batteryOptimization.integration.test.js
├── determineBatteryMode.test.js   # Unit-Tests für DetermineBatteryMode
└── README.md                   # Diese Datei
```

## Tests ausführen

### Alle Tests
```bash
npm test
```

### Mit Coverage-Report
```bash
npm run test:coverage
```

### Nur Unit-Tests
```bash
npm run test:unit
```

### Nur Integration-Tests
```bash
npm run test:integration
```

### Watch-Modus (für Entwicklung)
```bash
npm run test:watch
```

### Verbose-Modus (detaillierte Ausgabe)
```bash
npm run test:verbose
```

## Test-Kategorien

### Unit-Tests
Unit-Tests testen einzelne Funktionen und Logik-Komponenten isoliert:
- `determineBatteryMode.test.js` - Testet die Batteriemodus-Entscheidungslogik
- Konfigurationswerte
- SOC-Bewertung (highSOC, lowSOC, mediumSOC)
- Batteriemodus-Bestimmung mit/ohne Optimierung
- Output-Struktur
- Node-Status
- Fehlerbehandlung

### Integration-Tests
Integration-Tests prüfen das Zusammenspiel mehrerer Komponenten:
- `batteryOptimization.integration.test.js` - Testet vollständige Optimierungs-Flows
- Sommer-/Winter-Szenarien
- Netzladung bei günstigen Preisen
- Batteriesperrung
- Preisgesteuerte Entladung

## Test-Helper

### NodeRedHelper
Der `NodeRedHelper` in `test/helpers/node-red-helper.js` bietet Mock-Funktionen für Node-RED:

```javascript
const NodeRedHelper = require('./helpers/node-red-helper');

const helper = new NodeRedHelper();
const RED = helper.createRED();
const node = helper.createNode('TestNode');
```

**Wichtige Funktionen:**
- `createRED()` - Erstellt Mock für Node-RED Runtime
- `createNode(type, id)` - Erstellt Mock für einen Node
- `node.receive(msg)` - Simuliert Input-Ereignis
- `waitForEvent(node, event, timeout)` - Wartet auf Events
- `cleanup()` - Bereinigt alle Test-Nodes

## Neue Tests schreiben

### Unit-Test Beispiel

```javascript
const NodeRedHelper = require('./helpers/node-red-helper');

describe('MeinNode', () => {
    let helper;
    let RED;

    beforeEach(() => {
        helper = new NodeRedHelper();
        RED = helper.createRED();

        // Lade Node-Modul
        const nodeModule = require('../nodes/meinNode.js');
        nodeModule(RED);

        // Extrahiere Konstruktor
        const MeinNode = RED.nodes.registerType.mock.calls[0][1];
    });

    afterEach(() => {
        helper.cleanup();
        jest.clearAllMocks();
    });

    test('sollte korrekt funktionieren', () => {
        const config = { /* ... */ };
        const node = helper.createNode('MeinNode');
        MeinNode.call(node, config);

        const msg = { /* ... */ };
        node.receive(msg);

        expect(node.send).toHaveBeenCalled();
    });
});
```

### Integration-Test Beispiel

```javascript
describe('Flow Integration', () => {
    test('sollte kompletten Flow verarbeiten', () => {
        // Setup mehrerer Nodes
        // Simuliere Datenfluss
        // Verifiziere Endergebnis
    });
});
```

## Best Practices

1. **Isolierte Tests**: Jeder Test sollte unabhängig sein
2. **Klare Namen**: Beschreibende Test-Namen (`sollte X tun wenn Y`)
3. **Arrange-Act-Assert**: Klare Struktur (Setup - Ausführung - Verifikation)
4. **Mock externe Abhängigkeiten**: APIs, Datenbanken, etc.
5. **Test Edge Cases**: Grenzfälle und Fehlerbedingungen testen

## Coverage-Ziele

- **Minimum**: 70% Code Coverage
- **Ziel**: 80%+ Code Coverage
- **Kritische Pfade**: 100% Coverage für Batteriemodus-Logik

## Continuous Integration

Tests werden automatisch bei jedem Push und Pull Request ausgeführt via GitHub Actions.

Siehe `.github/workflows/ci.yml` für Details.

## Probleme & Debugging

### Tests schlagen fehl
```bash
# Verbose-Modus für mehr Details
npm run test:verbose

# Einzelnen Test ausführen
npx jest test/determineBatteryMode.test.js
```

### Coverage-Report ansehen
Nach `npm run test:coverage`:
```bash
# HTML-Report öffnen
open coverage/lcov-report/index.html  # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

## Weitere Ressourcen

- [Jest Dokumentation](https://jestjs.io/)
- [Node-RED Testing Guide](https://nodered.org/docs/creating-nodes/first-node#testing-your-node)
