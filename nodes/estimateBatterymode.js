module.exports = function(RED) {
    function EstimateBatteryMode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Konfigurationsparameter
        const batteryBuffer = config.batteryBuffer || 5; // minsoc %
        const batteryCapacity = config.batteryCapacity || 10; // capacity kWh
        const maxCharge = config.maxCharge || 5; // max. charging capability kWh
        const feedin = config.feedin || 0.079;

        const batteryEnergyPrice = feedin * 1.2; // Einspeisetarif inkl. Wandlungsverluste
        const battery_capacity = batteryCapacity - (batteryCapacity / 100 * batteryBuffer); // available energy kWh

        node.on('input', function(msg) {
            let startBatteryPower = (msg.payload.soc - batteryBuffer) / 100 * battery_capacity;  // batteryPower aus dem Nachrichtenfluss (Energiemenge des Batteriespeichers)
            const priceData = msg.payload.priceData;

            const now = (new Date()).getTime();

            // Zeitverschiebung der Verbrauchsprognose um 24 Stunden und Erweiterung auf 48 Felder
            function extendForecast(forecast) {
                const extendedForecast = [...forecast];
                const oneHour = 60 * 60 * 1000; // eine Stunde in Millisekunden
                const numberOfHoursToExtend = 24;

                for (let i = 0; i < numberOfHoursToExtend; i++) {
                    const lastEntry = new Date(extendedForecast[extendedForecast.length - 1].start);
                    const newTimestamp = new Date(lastEntry.getTime() + oneHour);
                    const newValue = forecast[i % forecast.length].value; // Verwenden Sie die Werte aus dem ursprünglichen Array, um die neuen Einträge zu füllen

                    extendedForecast.push({
                        start: newTimestamp.toISOString(),
                        value: newValue
                    });
                }

                return extendedForecast;
            }

            // Funktion, um die Werte pro Stunde zu summieren
            const summarizeSolarByHour = (array) => {
                const summary = {};

                array.forEach(item => {
                    const hour = item.start.slice(0, 13); // Nur das Stundenformat beibehalten
                    if (!summary[hour]) {
                        summary[hour] = 0;
                    }
                    summary[hour] += item.value;
                });

                return Object.keys(summary).map(hour => ({
                    timestamp: hour + ':00:00.0000000Z', // Stundenformat zurück in vollständigen Zeitstempel
                    value: summary[hour]
                }));
            }

            function getMaximumSoC(data) {
                return data.reduce((maxEntry, entry) => { 
                    return (entry.soc > maxEntry.soc) ? entry : maxEntry; 
                }, { soc: 0 }); // Entry
            }

            const consumptionForecast = extendForecast(msg.payload.consumptionForecast);

            // Zusammengefasste PV-Produktion (stundenbasiert)
            const productionForecast = summarizeSolarByHour(msg.payload.productionForecast);

            let batteryPower = startBatteryPower;
            const energyNeeded = priceData.reduce((result, price, i) => {
                const timestamp = new Date(price.start).getTime();
                if (timestamp > now) {
                    let mode = "grid";
                    const consumption = consumptionForecast[i].value;
                    const production = productionForecast[i].value;
                    const netEnergy = consumption - production;
                    let energyCost = 0;
                    if (netEnergy > 0) {
                        energyCost = netEnergy * price.importPrice;
                    }
                    let chargedEnergy = 0;
                    if (netEnergy < 0) {
                        chargedEnergy += Math.abs(Math.min(netEnergy, maxCharge));
                        if (batteryPower + chargedEnergy > battery_capacity) {
                            batteryPower = battery_capacity;
                        } else {
                            batteryPower += chargedEnergy;
                        }
                        mode = "charging";
                    }
                    let batterySoc = Math.floor(Math.min(batteryBuffer + (batteryPower / battery_capacity * 100), 100)); // mehr als 100 geht nicht
                    result.push({ start: price.start, value: netEnergy, importPrice: price.importPrice, cost: energyCost, soc: batterySoc, mode: mode });
                }
                return result;
            }, []);

            const estimatedMaximumSoc = getMaximumSoC(energyNeeded);

            // Prognose verwerfen und Startwert annehmen
            let currentbatteryPower = batteryCapacity / 100 * estimatedMaximumSoc.soc; // erwartete, maximale Batterieleistung
            node.warn("erwartete verfügbare batteryPower: " + currentbatteryPower);

            const energyAvailable = JSON.parse(JSON.stringify(energyNeeded));
            energyAvailable.sort((a, b) => b.importPrice - a.importPrice);

            const batteryStatus = energyAvailable.map(hour => {
                if ((hour.value > 0) && (hour.start >= estimatedMaximumSoc.start)) {
                    node.warn(hour.start + " " + hour.value + " " + estimatedMaximumSoc.start + " " + estimatedMaximumSoc.soc);
                    if (currentbatteryPower > 0) {
                        const dischargeAmount = Math.min(hour.value, currentbatteryPower);
                        currentbatteryPower -= dischargeAmount;
                        hour.value -= dischargeAmount;
                        hour.cost = dischargeAmount * batteryEnergyPrice;
                        hour.mode = "battery";
                    }
                }
                delete hour.soc;
                return hour;
            });

            // Sortierung nach Zeitstempeln
            batteryStatus.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

            msg.payload.batteryStatus = batteryStatus;

            node.send(msg);
        });
    }
    RED.nodes.registerType("@iseeberg79/estimateBatterymode", EstimateBatteryMode, {
        defaults: {
            batteryBuffer: { value: 5, exportable: true },
            batteryCapacity: { value: 10, exportable: true },
            maxCharge: { value: 5, exportable: true },
            feedin: { value: 0.079, exportable: true }
        },
        inputs: 1,
        outputs: 1
    });
};

