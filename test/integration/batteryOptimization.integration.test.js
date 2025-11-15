/**
 * Integration Tests für Battery Optimization Flow
 * Testet das Zusammenspiel mehrerer Nodes
 */

const NodeRedHelper = require('../helpers/node-red-helper');

describe('Battery Optimization Integration Tests', () => {
    let helper;

    beforeEach(() => {
        helper = new NodeRedHelper();
    });

    afterEach(() => {
        helper.cleanup();
    });

    describe('Vollständiger Optimierungs-Flow', () => {
        test('sollte korrekten Batteriemodus bei hoher PV-Prognose und niedrigem SOC bestimmen', () => {
            const RED = helper.createRED();

            // Lade DetermineBatteryMode Node
            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            // Simuliere Sommer-Szenario: Hohe PV-Prognose, niedriger SOC
            const msg = {
                soc: 30,  // niedrig
                optimize: true,
                price: 0.25,
                pvforecast: 25000,  // hoch (Sommer)
                energy_req: 15000,
                feedin: 0.079,
                minimum: 0.079,
                average: 0.25
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei hoher PV-Prognose sollte Batterie normal entladen werden dürfen
            expect(outputs[2].targetMode).toBe('normal');
            expect(node.status).toHaveBeenCalledWith(
                expect.objectContaining({ fill: 'green', text: 'normal' })
            );
        });

        test('sollte Netzladung bei Winter-Szenario mit günstigem Preis aktivieren', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            // Simuliere Winter (Dezember)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15T03:00:00'));

            // Winter-Szenario: Niedrige PV-Prognose, sehr günstiger Preis, niedriger SOC
            const msg = {
                soc: 25,  // niedrig - unter enableGridchargeThreshold
                optimize: true,
                enableGridcharge: true,
                price: 0.08,  // sehr günstig
                pvforecast: 5000,  // niedrig (Winter)
                energy_req: 15000,
                feedin: 0.079,
                minimum: 0.079,
                average: 0.25,
                avgGridPriceWeekly: 0.25
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei Winter, niedrigem SOC und günstigem Preis sollte Netzladung aktiv sein
            expect(outputs[2].targetMode).toBe('charge');
            expect(node.status).toHaveBeenCalledWith(
                expect.objectContaining({ fill: 'red', text: 'charge' })
            );

            // lastGridchargePrice sollte aktualisiert worden sein
            expect(outputs[1]).not.toBeNull();
            expect(outputs[1].lastGridchargePrice).toBeGreaterThan(0.079);

            jest.useRealTimers();
        });

        test('sollte Batterie sperren bei Winter-Szenario mit normalem Preis', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            // Simuliere Winter (Januar)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-01-20T14:00:00'));

            // Winter-Szenario: Niedrige PV-Prognose, normaler Preis, mittlerer SOC
            const msg = {
                soc: 35,  // niedrig aber nicht sehr niedrig
                optimize: true,
                enableGridcharge: true,
                price: 0.25,  // durchschnittlicher Preis
                pvforecast: 6000,  // niedrig (Winter)
                energy_req: 15000,
                feedin: 0.079,
                minimum: 0.079,
                average: 0.25,
                avgGridPriceWeekly: 0.25,
                lastGridchargePrice: 0.079
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei normalem Preis sollte Batterie gesperrt sein (hold)
            expect(outputs[2].targetMode).toBe('hold');
            expect(node.status).toHaveBeenCalledWith(
                expect.objectContaining({ fill: 'orange', text: 'hold' })
            );

            jest.useRealTimers();
        });

        test('sollte Batterieentladung bei hohem Preis erlauben', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            // Simuliere Winter (Dezember)
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15T18:00:00'));

            // Abends: Hoher Preis, Batterie wurde günstig geladen
            const msg = {
                soc: 75,
                optimize: true,
                price: 0.40,  // sehr hoher Preis
                pvforecast: 5000,  // niedrig (Winter, abends)
                energy_req: 5000,  // nur noch wenig bis Tagesende
                feedin: 0.079,
                minimum: 0.079,
                average: 0.25,
                avgGridPriceWeekly: 0.25,
                lastGridchargePrice: 0.10  // wurde günstig geladen
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei hohem Preis sollte Entladung erlaubt sein
            expect(outputs[2].targetMode).toBe('normal');

            jest.useRealTimers();
        });

        test('sollte Batterie NICHT entladen wenn teuer geladen wurde', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15T18:00:00'));

            // Batterie wurde teuer geladen, aktueller Preis nur moderat hoch
            const msg = {
                soc: 75,
                optimize: true,
                price: 0.30,
                pvforecast: 5000,
                energy_req: 5000,
                feedin: 0.079,
                minimum: 0.079,
                average: 0.25,
                avgGridPriceWeekly: 0.25,
                lastGridchargePrice: 0.28  // teuer geladen
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Entladung sollte gesperrt sein, da Preis nicht deutlich höher als Ladepreis
            expect(outputs[2].targetMode).toBe('hold');

            jest.useRealTimers();
        });
    });

    describe('Edge Cases', () => {
        test('sollte mit fehlenden msg-Properties umgehen können', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            // Minimale Nachricht
            const msg = {};

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Sollte mit Standardwerten arbeiten
            expect(outputs[2].targetMode).toBeDefined();
        });

        test('sollte bei SOC = 100% highSOC-Modus verwenden', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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
                soc: 100,
                optimize: true,
                price: 0.08,  // sehr günstig
                enableGridcharge: true
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei SOC=100% sollte keine Ladung erfolgen
            expect(outputs[2].targetMode).not.toBe('charge');
        });

        test('sollte bei SOC = 0% lowSOC-Modus verwenden', () => {
            const RED = helper.createRED();

            const determineBatteryModeModule = require('../../nodes/determineBatteryMode.js');
            determineBatteryModeModule(RED);
            const DetermineBatteryModeNode = RED.nodes.registerType.mock.calls[0][1];

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

            jest.useFakeTimers();
            jest.setSystemTime(new Date('2025-12-15'));

            const msg = {
                soc: 0,
                optimize: true,
                price: 0.08,
                enableGridcharge: true,
                pvforecast: 5000,
                energy_req: 15000,
                minimum: 0.079,
                average: 0.25,
                avgGridPriceWeekly: 0.25
            };

            node.receive(msg);

            expect(node.send).toHaveBeenCalled();
            const outputs = node.send.mock.calls[0][0];

            // Bei SOC=0% und günstigem Preis sollte Ladung möglich sein
            expect(outputs[2].targetMode).toBe('charge');

            jest.useRealTimers();
        });
    });
});
