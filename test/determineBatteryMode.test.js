/**
 * Unit Tests für DetermineBatteryMode Node
 */

const NodeRedHelper = require('./helpers/node-red-helper');

describe('DetermineBatteryMode Node', () => {
    let helper;
    let RED;
    let DetermineBatteryModeNode;

    beforeEach(() => {
        helper = new NodeRedHelper();
        RED = helper.createRED();

        // Node-Modul laden
        const nodeModule = require('../nodes/determineBatteryMode.js');
        nodeModule(RED);

        // Konstruktor aus registerType extrahieren
        DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];
    });

    afterEach(() => {
        helper.cleanup();
        jest.clearAllMocks();
    });

    describe('Konfiguration', () => {
        test('sollte mit Standardwerten initialisiert werden', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            expect(node.enableGridchargeThreshold).toBe(50);
            expect(node.disableGridchargeThreshold).toBe(80);
            expect(node.batteryCapacity).toBe(10000);
            expect(node.efficiency).toBe(80);
        });

        test('sollte als Node-RED Node registriert sein', () => {
            expect(RED.nodes.registerType).toHaveBeenCalledWith(
                '@iseeberg79/DetermineBatteryMode',
                expect.any(Function),
                expect.objectContaining({
                    defaults: expect.any(Object),
                    outputs: 3
                })
            );
        });
    });

    describe('SOC Bewertung', () => {
        test('sollte highSOC bei SOC > disableGridchargeThreshold erkennen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 85,  // > 80
                optimize: false
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei highSOC und optimize=false sollte targetMode "normal" sein
            expect(outputs[2].targetMode).toBe('normal');
        });

        test('sollte lowSOC bei SOC <= enableGridchargeThreshold erkennen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 45,  // <= 50
                optimize: false
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];
            expect(outputs[2].targetMode).toBe('normal');
        });

        test('sollte mediumSOC bei SOC zwischen Schwellenwerten erkennen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 65,  // zwischen 50 und 80
                optimize: false
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
        });
    });

    describe('Batteriemodus-Bestimmung ohne Optimierung', () => {
        test('sollte "normal" zurückgeben wenn optimize=false', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 60,
                optimize: false,
                price: 0.25
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];
            expect(outputs[2].targetMode).toBe('normal');
        });
    });

    describe('Batteriemodus-Bestimmung mit Optimierung', () => {
        test('sollte "hold" bei niedriger PV-Prognose und normalem Preis setzen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            // Simuliere Dezember (Winter)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15'));

            const msg = {
                soc: 45,  // lowSOC
                optimize: true,
                enableGridcharge: true,
                price: 0.25,
                minimum: 0.079,
                average: 0.25,
                pvforecast: 5000,  // niedrig
                energy_req: 7000,
                feedin: 0.079
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei lowSOC, optimize=true und insufficientPV sollte hold gesetzt werden
            expect(outputs[2].targetMode).toBe('hold');

            jest.useRealTimers();
        });

        test('sollte "charge" bei sehr günstigem Preis und lowSOC setzen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            // Simuliere Dezember (Winter)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15'));

            const msg = {
                soc: 45,  // lowSOC
                optimize: true,
                enableGridcharge: true,
                price: 0.08,  // sehr günstig (nahe am Minimum)
                minimum: 0.079,
                average: 0.25,
                pvforecast: 5000,  // niedrig
                energy_req: 7000,
                feedin: 0.079,
                avgGridPriceWeekly: 0.25
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei sehr günstigem Preis sollte Netzladung aktiviert werden
            expect(outputs[2].targetMode).toBe('charge');

            // lastGridchargePrice sollte gesetzt sein
            expect(outputs[1]).not.toBeNull();

            jest.useRealTimers();
        });

        test('sollte "normal" bei hoher PV-Prognose setzen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 60,
                optimize: true,
                price: 0.25,
                pvforecast: 20000,  // hoch
                energy_req: 7000,
                feedin: 0.079
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];
            expect(outputs[2].targetMode).toBe('normal');
        });

        test('sollte "normal" bei hohem Strompreis setzen (Entladung erlaubt)', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            // Simuliere Dezember (Winter)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15'));

            const msg = {
                soc: 70,
                optimize: true,
                price: 0.35,  // hoch
                minimum: 0.079,
                average: 0.25,
                pvforecast: 5000,  // niedrig
                energy_req: 7000,
                feedin: 0.079,
                lastGridchargePrice: 0.095,  // niedriger als aktueller Preis
                avgGridPriceWeekly: 0.25
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei hohem Preis sollte Entladung erlaubt sein
            expect(outputs[2].targetMode).toBe('normal');

            jest.useRealTimers();
        });
    });

    describe('Output-Struktur', () => {
        test('sollte 3 Outputs haben', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 60,
                optimize: false
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];
            expect(outputs).toHaveLength(3);
        });

        test('sollte batterymode im ersten Output setzen wenn sich Modus ändert', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 60,
                optimize: false,
                batterymode: 'hold'  // alter Modus
            };

            node.receive(msg);

            const outputs = node.send.mock.calls[0][0];

            // Output 0 sollte gesetzt sein da sich Modus ändert (hold -> normal)
            expect(outputs[0]).not.toBeNull();
            expect(outputs[0].batterymode).toBe('normal');
            expect(outputs[0].payload).toBe('normal');
        });

        test('sollte vollständige Nachricht im dritten Output haben', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 60,
                optimize: false,
                price: 0.25
            };

            node.receive(msg);

            const outputs = node.send.mock.calls[0][0];
            expect(outputs[2]).toBeDefined();
            expect(outputs[2].targetMode).toBeDefined();
            expect(outputs[2].soc).toBe(60);
        });
    });

    describe('Node-Status', () => {
        test('sollte grünen Status bei "normal" setzen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const msg = {
                soc: 60,
                optimize: false
            };

            node.receive(msg);

            expect(node.status).toHaveBeenCalledWith({
                fill: 'green',
                shape: 'dot',
                text: 'normal'
            });
        });

        test('sollte orangen Status bei "hold" setzen', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            // Simuliere Dezember (Winter)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15'));

            const msg = {
                soc: 45,
                optimize: true,
                enableGridcharge: true,
                price: 0.25,
                minimum: 0.079,
                average: 0.25,
                pvforecast: 5000,
                energy_req: 7000,
                feedin: 0.079
            };

            node.receive(msg);

            expect(node.status).toHaveBeenCalledWith({
                fill: 'orange',
                shape: 'dot',
                text: 'hold'
            });

            jest.useRealTimers();
        });
    });

    describe('Fehlerbehandlung', () => {
        test('sollte Fehler bei Exception protokollieren', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            // Überschreibe node.send um Fehler zu provozieren
            node.send = jest.fn(() => {
                throw new Error('Test error');
            });

            const msg = { soc: 60 };
            node.receive(msg);

            expect(node.error).toHaveBeenCalled();
        });
    });

    describe('Externe Prognose (Estimator)', () => {
        test('sollte externe Prognose verwenden wenn msg.estimator gesetzt ist', () => {
            const config = {
                enableGridchargeThreshold: 50,
                disableGridchargeThreshold: 80,
                batteryCapacity: 10000,
                minsoc: 10,
                maxsoc: 90,
                efficiency: 80
            };

            const node = helper.createNode('DetermineBatteryMode');
            DetermineBatteryModeNode.call(node, config);

            const currentTime = new Date('2025-12-15T10:30:00');
            jest.useFakeTimers();
            jest.setSystemTime(currentTime);

            const msg = {
                soc: 60,
                optimize: true,
                estimator: [
                    { start: '2025-12-15T10:00:00', mode: 'hold' },
                    { start: '2025-12-15T11:00:00', mode: 'normal' }
                ]
            };

            node.receive(msg);

            const outputs = node.send.mock.calls[0][0];
            // Aktuelle Zeit ist 10:30, sollte also 'hold' sein
            expect(outputs[2].targetMode).toBe('hold');

            jest.useRealTimers();
        });
    });
});
