module.exports = function(RED) {
    function EstimateBatteryMode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Debugging
        let debug = false;

        // Konfigurationsparameter
        const batteryBuffer = config.batteryBuffer || 5; // minsoc %
        const batteryCapacity = config.batteryCapacity || 10; // capacity kWh
        const maxCharge = config.maxCharge || 5; // max. charging capability kWh
        const feedin = config.feedin || 0.079; // Einspeisetarif pro kWh
        const efficiency = config.efficiency || 80; // Wirkungsgrad %
        const performance = config.performance || 20; // Vorteil %
        let charge = true; // Netzladung aktivieren

        node.on('input', function(msg) {
            if (typeof msg.debug !== 'undefined') { debug = msg.debug; }
            if (typeof msg.charge !== 'undefined') { charge = charge && msg.charge; }
            
            const factor = (1 + ((100 - efficiency) / 100));
            const rate = (1 + (performance / 100));

            const batteryEnergyPrice = feedin * factor; // Einspeisetarif inkl. Wandlungsverluste
            let lastGridchargePrice = (typeof msg.lastGridchargePrice !== 'undefined') ? msg.lastGridchargePrice : batteryEnergyPrice; // Netzladungspreis pro kWh
            const battery_capacity = batteryCapacity - (batteryCapacity / 100 * batteryBuffer); // available energy kWh

            let startBatteryPower = (msg.payload.soc - batteryBuffer) / 100 * battery_capacity;  // batteryPower aus dem Nachrichtenfluss (Energiemenge des Batteriespeichers)
            const priceData = msg.payload.priceData;

            //const now = (new Date()).getTime();
            const recent = new Date((new Date()).getTime() - 60 * 60 * 1000).getTime();

            function calculateLoadableHours(data, threshold) {
                const currentTime = new Date().toISOString();
                let maxPrice = -Infinity;
                let maxPriceIndex = -1;
                let avgPrice = 0;

                if (debug) { node.warn("importPrice #19"); }
                // Schritt 1: Den Index des höchsten Importpreises finden, ohne das Array zu verändern
                for (let i = 0; i < data.length; i++) {
                    if (data[i].importPrice > maxPrice) {
                        maxPrice = data[i].importPrice;
                        maxPriceIndex = i;
                    }
                }

                // Schritt 2: Daten nach dem aktuellen Zeitpunkt und vor dem höchsten Importpreis filtern
                let loadableHours = 0;
                if (debug) { node.warn("importPrice #20"); }
                for (let i = 0; i < maxPriceIndex; i++) {
                    if (data[i].start > currentTime && data[i].importPrice < threshold) {
                        loadableHours++;
                        avgPrice += data[i].importPrice;
                    }
                }

                // Mögliche Netzladungsmenge berechnen (pro Stunde maximal maxCharge kWh)
                const loadableEnergy = (Math.min(loadableHours * maxCharge, battery_capacity) * 0.9); // Annahme etwas reduzieren!
                if (debug) { node.warn("Loadable Energy: " + loadableEnergy + ", Hours: " + loadableHours + ", Threshold: " + threshold); }
                
                return { loadableHours, loadableEnergy, avgPrice: (avgPrice / loadableHours * factor) };
            }

            // Weitere Logik
        });
    }
    RED.nodes.registerType("@iseeberg79/EstimateBatterymode", EstimateBatteryMode, {
        defaults: {
            batteryBuffer: { value: 5, exportable: true },
            batteryCapacity: { value: 10, exportable: true },
            maxCharge: { value: 5, exportable: true },
            feedin: { value: 0.079, exportable: true },
            efficiency: { value: 80, exportable: true },
            performance: { value: 20, exportable: true }
        },
        inputs: 1,
        outputs: 1
    });
};
