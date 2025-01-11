module.exports = function(RED) {
    function DetermineControlModeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.minPvRequired = config.minPvRequired;
        node.minPriceDeviation = config.minPriceDeviation;
        node.minPriceDifference = config.minPriceDifference;
        node.priceLimit = config.priceLimit;
        node.avg = config.avg;

        node.on('input', function(msg) {
            // Konfiguration
            const minPvRequired = (typeof msg.minPvRequired !== 'undefined') ? msg.minPvRequired : (node.minPvRequired || 16000);
            const minPriceDeviation = (typeof msg.minPriceDeviation !== 'undefined') ? msg.minPriceDeviation : (node.minPriceDeviation || 6);
            const minPriceDifference = (typeof msg.minPriceDifference !== 'undefined') ? msg.minPriceDifference : (node.minPriceDifference || 15);
            const priceLimit = ((typeof msg.priceLimit !== 'undefined') ? msg.priceLimit : (node.priceLimit || 0.35)) * 100;

            // Werte zur Berechnung, mit sicheren Standards belegt
            const avgPriceWeekly = ((typeof msg.avgWeekly !== 'undefined') ? msg.avgWeekly : priceLimit) * 100;
            const avgPrice = ((typeof msg.average !== 'undefined') ? msg.avg : (node.avg || 0.24)) * 100;
            const pvForecast = (typeof msg.pvforecast !== 'undefined') ? msg.pvforecast : (node.pvforecast || minPvRequired);
            const priceDeviation = (typeof msg.deviation !== 'undefined') ? msg.deviation : (node.deviation || 0);
            const priceDifference = (typeof msg.diff !== 'undefined') ? msg.diff : (node.diff || 0);

            // Maximum zur Steuerung heranziehen: Glättung des Verbrauches
            const batteryControlLimit = Math.max(priceLimit, avgPriceWeekly);

            // Logik zur Bestimmung der Steuerung
            if (pvForecast < minPvRequired) {
                // msg.pvMIN = true;
                if (priceDifference > minPriceDifference) {
                    // msg.priceOK = true; msg.priceDIFFERENCE = minPriceDifference;
                    if (pvForecast * 1.6 < minPvRequired) {
                        msg.payload = { optimize: true, gridcharge: true, mode: 'GRID' };
                    } else {
                        msg.payload = { optimize: true, gridcharge: false, mode: 'LIMIT' };
                    }
                } else {
                    if (priceDeviation > minPriceDeviation) {
                        // msg.priceFallback = true; msg.priceDEVIATION = priceDeviation;
                        msg.payload = { optimize: true, gridcharge: false, mode: 'LIMIT' };
                    } else {
                        if (avgPrice > batteryControlLimit) {
                            // msg.averageOK = true;
                            msg.payload = { optimize: true, gridcharge: false, mode: 'LIMIT' };
                        } else {
                            // msg.evccOK = true;
                            msg.payload = { optimize: false, gridcharge: false, mode: 'evcc' };
                        }
                    }
                }
            } else {
                // msg.pvOK = true; msg.pvFORECAST = pvForecast;
                msg.payload = { optimize: false, gridcharge: false, mode: 'evcc' };
            }

            if (msg.payload.gridcharge) {
                node.status({ fill: "orange", shape: "dot", text: msg.payload.mode });
            } else {
                if (msg.payload.optimize) {
                    node.status({ fill: "yellow", shape: "dot", text: msg.payload.mode });
                } else {
                    node.status({ fill: "green", shape: "dot", text: msg.payload.mode });
                }
            }

            node.send(msg);
        });
    }
    RED.nodes.registerType('@iseeberg79/DetermineControlMode', DetermineControlModeNode, {
        defaults: {
            name: { value: "" },
            minPvRequired: { value: 16000 },
            minPriceDeviation: { value: 6 },
            minPriceDifference: { value: 15 },
            priceLimit: { value: 0.35 },
            avg: { value: 0.24 }
        }
    });
}

