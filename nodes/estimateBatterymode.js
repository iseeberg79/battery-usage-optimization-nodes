module.exports = function (RED) {
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

        node.on("input", function (msg) {
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }
            if (typeof msg.charge !== "undefined") {
                charge = charge && msg.charge;
            }
			if (debug) {node.warn("Netzladung aktiviert: " + charge);}
            const factor = 1 + (100 - efficiency) / 100;
            const rate = 1 + performance / 100;

            const batteryEnergyPrice = feedin * factor; // Einspeisetarif inkl. Wandlungsverluste
            let lastGridchargePrice =
                typeof msg.lastGridchargePrice !== "undefined" ? msg.lastGridchargePrice : batteryEnergyPrice; // Netzladungspreis pro kWh
            const battery_capacity = batteryCapacity - (batteryCapacity / 100) * batteryBuffer; // available energy kWh

            let startBatteryPower = ((msg.payload.soc - batteryBuffer) / 100) * battery_capacity; // batteryPower aus dem Nachrichtenfluss (Energiemenge des Batteriespeichers)

            //const now = new Date().getTime();
            const recent = new Date(new Date().getTime() - 60 * 60 * 1000).getTime();

			// Filtern der Daten nach dem aktuellen Zeitpunkt, Vergleichbarkeit und Ausrichtung
            function alignArray(array, minStartTime) {
                return array.filter((entry) => new Date(entry.start).getTime() >= minStartTime);
            }

			// Berechnung der maximalen Netzladungsmenge
            function calculateLoadableHours(data, threshold) {
                if (debug) {
                    node.warn("calculateLoadableHours");
                }
                const currentTime = new Date().toISOString();

                let maxPrice = -Infinity;
                let maxPriceIndex = -1;
                let avgPrice = 0;

                if (debug) {
                    node.warn("importPrice #19");
                }

                // Schritt 1: Den Index des höchsten Importpreises finden, ohne das Array zu verändern
                for (let i = 0; i < data.length; i++) {
                    if (data[i].importPrice > maxPrice) {
                        maxPrice = data[i].importPrice;
                        maxPriceIndex = i;
                    }
                }

                // Schritt 2: Daten nach dem aktuellen Zeitpunkt und vor dem höchsten Importpreis filtern
                let loadableHours = 0;
                if (debug) {
                    node.warn("importPrice #20");
                }
                for (let i = 0; i < maxPriceIndex; i++) {
                    if (data[i].start > currentTime && data[i].importPrice < threshold) {
                        loadableHours++;
                        avgPrice += data[i].importPrice;
                    }
                }

                // Mögliche Netzladungsmenge berechnen (pro Stunde maximal maxCharge kWh)
                const loadableEnergy = Math.min(loadableHours * maxCharge, battery_capacity) * 0.9; // Annahme etwas reduzieren!
                if (debug) {
                    node.warn(
                        "Loadable Energy: " +
                            loadableEnergy +
                            ", Hours: " +
                            loadableHours +
                            ", Threshold: " +
                            threshold,
                    );
                }

                return {
                    loadableHours,
                    loadableEnergy,
                    avgPrice: (avgPrice / loadableHours) * factor,
                };
            }

            // Zeitverschiebung der Verbrauchsprognose um 24 Stunden und Erweiterung auf 48 Felder
            function extendForecast(forecast) {
                if (debug) {
                    node.warn("extendForecast");
                }
                const extendedForecast = [...forecast];
                const oneHour = 60 * 60 * 1000; // eine Stunde in Millisekunden
                const numberOfHoursToExtend = 24;

                for (let i = 0; i < numberOfHoursToExtend; i++) {
                    const lastEntry = new Date(extendedForecast[extendedForecast.length - 1].start);
                    const newTimestamp = new Date(lastEntry.getTime() + oneHour);
                    const newValue = forecast[i % forecast.length].value; // Verwenden Sie die Werte aus dem ursprünglichen Array, um die neuen Einträge zu füllen

                    extendedForecast.push({
                        start: newTimestamp.toISOString(),
                        value: newValue,
                    });
                }

                return extendedForecast;
            }

			// Zusammenfassen der PV-Produktion (stundenbasiert)
            function transformSolarProductionArray(array) {
                if (debug) {
                    node.warn("transformSolarProductionArray");
                }
                const hourlyProduction = {};

                array.forEach((entry) => {
                    const date = new Date(entry.start);
                    const hour = date.toISOString().slice(0, 13); // Extrahiert das Jahr, den Monat, den Tag und die Stunde

                    if (!hourlyProduction[hour]) {
                        hourlyProduction[hour] = {
                            totalValue: 0,
                            count: 0,
                            originalFormat: entry.start,
                        };
                    }
                    hourlyProduction[hour].totalValue += entry.value;
                    hourlyProduction[hour].count += 1;
                });

                const transformedArray = Object.keys(hourlyProduction).map((hour) => {
                    const { totalValue, count, originalFormat } = hourlyProduction[hour];
                    return {
                        start: originalFormat,
                        value: totalValue / count, // Durchschnittswert pro Stunde
                    };
                });

                return transformedArray;
            }

			// durchschnittlicher Importpreis
            function calculateAverage(data) {
                if (debug) {
                    node.warn("calculateAverage");
                }
                const sum = data.reduce((total, entry) => total + entry.importPrice, 0);
                const average = sum / data.length;
                return average;
            }

			// maximaler morgiger SoC
            function getMaximumSoC(data) {
                if (debug) {
                    node.warn("getMaximumSoC");
                }
                return data.reduce((maxEntry, entry) => {
                    return entry.soc > maxEntry.soc ? entry : maxEntry;
                });
            }

			// aktuelle Stunde (des Tages: 0-23)
            function getCurrentHourIndex(data) {
                if (debug) {
                    node.warn("getCurrentHourIndex");
                }
                const currentTime = new Date().toISOString();
                return data.findIndex((entry) => {
                    return entry.start.substring(0, 13) === currentTime.substring(0, 13);
                });
            }

			// höchster absoluter Preis
            function getMaximumAbs(data) {
                if (debug) {
                    node.warn("getMaximumAbs");
                }
                return data.reduce((maxEntry, currentEntry) => {
                    return currentEntry.importPrice > maxEntry.importPrice ? currentEntry : maxEntry;
                });
            }

			// niedrigster Energieverbrauch (Fallback)
            function getLowestEnergyEntry(data) {
                if (debug) {
                    node.warn("getLowestCostEntry");
                }
                return data.reduce((min, current) => (current.value < min.value ? current : min), { value: Infinity });
            }

			// niedrigster absoluter Preis
            function getMinimumPriceAbs(data) {
                if (debug) {
                    node.warn("getMinimumPriceAbs");
                }
                return data.reduce((prev, curr) => {
                    return prev.importPrice < curr.importPrice ? prev : curr;
                });
            }

			// niedrigster relativer Preis (vor dem Preismaximum)
            function getMinimumPrice(data) {
                if (debug) {
                    node.warn("getMinimumPrice");
                }
                const maxImportIndex = data.reduce((maxIdx, current, idx, array) => {
                    return current.importPrice > array[maxIdx].importPrice ? idx : maxIdx;
                }, 0);

                const dataBeforeMaxImport = data.slice(0, maxImportIndex);

                if (debug) {
                    node.warn("getMinimumPrice #2");
                }
                const cheapestEntry = dataBeforeMaxImport.reduce((prev, curr) => {
                    return prev.importPrice < curr.importPrice ? prev : curr;
                }, dataBeforeMaxImport[0]);

                // Wenn kein günstigerer Eintrag gefunden wurde, wird der günstigste Eintrag des gesamten Arrays zurückgegeben
                if (cheapestEntry === undefined) {
                    if (debug) {
                        node.warn("aktuell maximaler Wert, Fallback auf absolutes Minimum");
                    }
                    return getMinimumPriceAbs(data);
                } else {
                    return cheapestEntry;
                }
            }

			// höchster relativer Preis
            function getMaximumPrice(data) {
                const startIndex = getCurrentHourIndex(data);
                const dataFromStart = data.slice(startIndex);

                if (debug) {
                    node.warn("getMaximumPrice");
                }
                return dataFromStart.reduce((maxEntry, currentEntry) => {
                    return currentEntry.importPrice > maxEntry.importPrice ? currentEntry : maxEntry;
                });
            }

			// maximaler Preisunterschied
            function getMaximumPriceGap(data) {
                if (debug) {
                    node.warn("getMaximumPriceGap");
                }
                const max = getMaximumPrice(data);
                const min = getMinimumPriceAbs(data);
                if (debug) {
                    node.warn("Max: " + JSON.stringify(max));
                }
                if (debug) {
                    node.warn("Min: " + JSON.stringify(min));
                }
                if (debug) {
                    node.warn("importPrice #7");
                }
                const diff = Math.floor((max.importPrice - min.importPrice) * 1000) / 1000;
                if (debug) {
                    node.warn("Diff: " + diff);
                }
                return diff;
            }

			// Effizienz der Netzladung berechnen
            function calcPerformance(min) {
                if (debug) {
                    node.warn("calcPerformance");
                }
                return min.importPrice * factor * rate;
            }

            const priceData = alignArray(msg.payload.priceData, recent);
            msg.payload.priceData = priceData;

            const consumptionForecast = alignArray(extendForecast(msg.payload.consumptionForecast), recent);
            msg.payload.consumptionForecast = consumptionForecast;

            // Zusammengefasste PV-Produktion (stundenbasiert)
            const productionForecast = alignArray(
                transformSolarProductionArray(msg.payload.productionForecast),
                recent,
            );
            msg.payload.productionForecast = productionForecast;

			//TODO falsch bei viel PV Energieüberschuss
            //let batteryPower = startBatteryPower;
            //TODO unsicher, was richtig ist - 0 führt zu falschen Ergebnissen, wenn wenig PV, aber Batterie gefüllt - aber gridcharge klappt nicht (soc > 30)
			//TODO Lösungsidee - hier 0, aber nach dem Optimierungspunkt wird die Batterie mit der verbleibenden Energie ergänzt aus dem vorherigen Zeitraum festgelegt
            let batteryPower = 0; // es wird mit leerer Batterie gestartet, um den maximalen möglichen morgigen Füllstand zu berechnen
            if (debug) {
                node.warn("batteryPower: " + batteryPower);
            }

			// möglichen Energiespeicherbedarf berechnen inkl. PV-Überschuss (prog. Verbrauch - prog. Produktion)
            const energyNeeded = priceData.reduce((result, price, i) => {
                const timestamp = new Date(price.start).getTime();
                if (timestamp > recent) {
                    if (debug) {
                        node.warn("timestamp > recent");
                    }
                    let mode = "hold";
                    const consumption = consumptionForecast[i].value;
                    const production = productionForecast[i].value;
                    const netEnergy = consumption - production;
                    let energyCost = 0;

                    if (netEnergy > 0) {
                        if (debug) {
                            node.warn("energy > 0");
                        }
                        energyCost = netEnergy * price.importPrice;
                    }
                    let chargedEnergy = 0;
                    if (netEnergy < 0) {
                        if (debug) {
                            node.warn("energy < 0");
                        }
                        chargedEnergy += Math.abs(Math.min(netEnergy, maxCharge));
                        if (batteryPower + chargedEnergy > battery_capacity) {
                            batteryPower = battery_capacity;
                        } else {
                            batteryPower += chargedEnergy;
                        }
                    }
                    let batterySoc = Math.floor(Math.min(batteryBuffer + (batteryPower / battery_capacity) * 100, 100)); // mehr als 100 geht nicht
                    if (debug) {
                        node.warn(price.start + "/" + mode + ": batterySoC: " + batterySoc);
                    }
                    result.push({
                        start: price.start,
                        value: netEnergy,
                        importPrice: price.importPrice,
                        cost: energyCost,
                        soc: batterySoc,
                        mode: mode,
                    });
                }
                return result;
            }, []);
            msg.payload.energyNeeded = energyNeeded;

            const totalCost = energyNeeded.reduce((sum, entry) => sum + entry.cost, 0);

            let estimatedMaximumSoc = getMaximumSoC(energyNeeded);
            let lowestEnergyEntry = getLowestEnergyEntry(energyNeeded);
            if (estimatedMaximumSoc.start < lowestEnergyEntry.start) {
                if (debug) {
                    node.warn(
                        "uneindeutig: estimatedMaximumSoc.start < lowestEnergyEntry.start, replaced by " + lowestEnergyEntry.start,
                    );
                }
                estimatedMaximumSoc = lowestEnergyEntry;
            }
            const diff = getMaximumPriceGap(energyNeeded);
            const avg = Math.floor(calculateAverage(energyNeeded) * 1000) / 1000;
            const minimumPriceEntry = getMinimumPrice(energyNeeded);
            const maximumPriceEntry = getMaximumPrice(energyNeeded);
			
			// Kopie des Arrays anlegen
            const energyAvailable = JSON.parse(JSON.stringify(energyNeeded));

            // hier wird die Batterienutzungsoptimierung/-glättung durchgeführt
            lastGridchargePrice = Math.max(lastGridchargePrice, avg);
            if (debug) {
                node.warn("Preisgrenze: " + lastGridchargePrice);
            }

            if (debug) {
                node.warn("min:" + JSON.stringify(minimumPriceEntry));
            }
            if (debug) {
                node.warn("min-abs:" + JSON.stringify(getMinimumPriceAbs(energyNeeded)));
            }
            if (debug) {
                node.warn("max:" + JSON.stringify(maximumPriceEntry));
            }

            const gridchargePerformance = calcPerformance(minimumPriceEntry) < avg;
            if (debug) {
                node.warn("Netzladungsperformance: " + gridchargePerformance);
            }

            // Prognose verwerfen und aktuellen Batterieleistungswert annehmen
            let currentbatteryPower = startBatteryPower;
            if (debug) {
                node.warn("aktuell verfügbare batteryPower: " + currentbatteryPower);
            }

            let breakevenPoint = estimatedMaximumSoc.start;
            let chargedEnergyPrice = batteryEnergyPrice;
			let estimatedbatteryPower = 0;
			
            if (gridchargePerformance && charge) {
                if (debug) {
                    node.warn("Netzladung wird verwendet");
                }
                // wichtige Prüfung, ob das Maximum nach dem Minimum liegt
                if (minimumPriceEntry.start < estimatedMaximumSoc.start) {
                    if (debug) {
                        node.warn(
                            minimumPriceEntry.start +
                                ": ersetzen, liegt nach dem errechneten Maximum um: " +
                                estimatedMaximumSoc.start,
                        );
                    }
                    breakevenPoint = minimumPriceEntry.start;
                }
                const energy = calculateLoadableHours(energyNeeded, avg / rate / factor);
				//TODO der Ladungsstand der Batterie muss berücksichtigt werden.
                estimatedbatteryPower = batteryCapacity * Math.min(1, energy.loadableEnergy / battery_capacity); // Netzladung wird vorher für eine volle Batterie sorgen
                if (debug) {
                    node.warn("erwartete verfügbare batteryPower (d. Netzladung): " + estimatedbatteryPower);
                }
                chargedEnergyPrice = energy.avgPrice;
            }
            if (debug) {
                node.warn("finaler Optimierungszeitpunkt: " + breakevenPoint);
            }

            if (debug) {
                node.warn("vor dem Sortieren");
            }
            energyAvailable.sort((a, b) => b.importPrice - a.importPrice);

            if (debug) {
                node.warn("nach dem Sortieren");
            }
            const batteryModes = energyAvailable.map((hour) => {
				let usedEnergy = 0;
                // Verwendung des aktuellen Batteriespeichers bis zum Entscheidungszeitpunkt
                if (hour.value > 0 && hour.start < breakevenPoint) {
                    if (debug) {
                        node.warn("vor dem Entscheidungszeitpunkt: " + breakevenPoint);
                    }
                    if (currentbatteryPower >= 0 && lastGridchargePrice < hour.importPrice) {
                        if (debug) {
                            node.warn(
                                hour.start +
                                    " " +
                                    hour.value +
                                    " " +
                                    estimatedMaximumSoc.start +
                                    " " +
                                    estimatedMaximumSoc.soc,
                            );
                        }
                        const dischargeAmount = Math.min(hour.value, currentbatteryPower);
                        currentbatteryPower -= dischargeAmount;
                        hour.value -= dischargeAmount;
                        hour.cost = dischargeAmount * batteryEnergyPrice + hour.value * hour.importPrice;
                        hour.mode = "normal";
                        if (debug) {
                            node.warn(hour.value + "/" + hour.mode + ": currentbatteryPower: " + currentbatteryPower);
                        }
						usedEnergy += dischargeAmount;
                    }
                }
				
				//estimatedbatteryPower = (batteryCapacity / 100) * (estimatedMaximumSoc.soc - batteryBuffer); // erwartete, maximale Batterieleistung
				//if (debug) {
				//    node.warn("erwartete verfügbare batteryPower: " + estimatedbatteryPower);
				//}
				
				// Berechnung der verbleibenden Batterieleistung
				let remainingEnergy = Math.max(0,(startBatteryPower * (batteryCapacity / 100)) - usedEnergy);
				
				// Berechnung der erwarteten Batterieleistung inkl. PV Überschuss / Netzladung
				// TODO zwei Optionen - mehr als 100% erlauben - oder nicht... (da zeitlich versetzt, richtig?)
				let minEnergy = (batteryCapacity / 100) * batteryBuffer;
				//estimatedbatteryPower = Math.max(batteryCapacity, estimatedbatteryPower + remainingEnergy + (batteryCapacity / 100) * estimatedMaximumSoc.soc) - minEnergy;
				estimatedbatteryPower = estimatedbatteryPower + Math.max(batteryCapacity, remainingEnergy + (batteryCapacity / 100) * estimatedMaximumSoc.soc) - minEnergy; 
				if (debug) {
				    node.warn("erwartete verfügbare batteryPower (summiert): " + estimatedbatteryPower);
				}
				
                // prognostizierte Verwendung, nachdem PV/Netz geladen wurde
                if (hour.value > 0 && hour.start >= breakevenPoint) {
                    if (debug) {
                        node.warn("nach dem Entscheidungszeitpunkt: " + breakevenPoint);
                    }
                    if (estimatedbatteryPower > 0 && lastGridchargePrice < hour.importPrice) {
                        if (debug) {
                            node.warn(
                                hour.start +
                                    " " +
                                    hour.value +
                                    " " +
                                    estimatedMaximumSoc.start +
                                    " " +
                                    estimatedMaximumSoc.soc,
                            );
                        }
                        const dischargeAmount = Math.min(hour.value, estimatedbatteryPower);
                        estimatedbatteryPower -= dischargeAmount;
                        hour.value -= dischargeAmount;
                        hour.cost = dischargeAmount * chargedEnergyPrice + hour.value * hour.importPrice;
                        hour.mode = "normal";
                        if (debug) {
                            node.warn(
                                hour.value + "/" + hour.mode + ": estimatedbatteryPower: " + estimatedbatteryPower,
                            );
                        }
                    }
                }
                if (debug) {
                    node.warn("Prüfung, ob Batterieleistung verfügbar");
                }
                // interne Steuerung der Batterie, wenn niedriger Ladungszustand
                if (hour.mode == "hold" && hour.value > 0 && hour.start < breakevenPoint && currentbatteryPower <= 0) {
                    if (debug) {
                        node.warn(hour.start + ": Batterieladungszustand zu gering, interne Steuerung zulassen.");
                    }
                    hour.cost = hour.value * hour.importPrice;
                    hour.mode = "normal";
                }
                delete hour.soc;
                return hour;
            });

            if (debug) {
                node.warn("mögliche Netzladung prüfen, vorher neu sortieren");
            }
            // mögliche Netzladung berechnen, wenn effektiv - Sortierung nach günstigstem Preis
            batteryModes.sort((a, b) => a.importPrice - b.importPrice);

            if (debug && gridchargePerformance && charge) {
                node.warn("working-min: " + JSON.stringify(batteryModes[0]));
            }
            if (debug && gridchargePerformance && charge) {
                node.warn("working-min-2nd: " + JSON.stringify(batteryModes[1]));
            }
            if (debug && gridchargePerformance && charge) {
                node.warn("working-min-3rd: " + JSON.stringify(batteryModes[2]));
            }

            let hours = 0;
            // maximale drei Stunden Netzladung - es wird nicht immer mit maximaler Ladeleistung geladen
            if (gridchargePerformance && charge) {
                if (debug) {
                    node.warn("Calculated efficient grid charge option, 1st hour");
                }
                batteryModes[0].mode = "charge";
                if (debug) {
                    node.warn("importPrice #16");
                }
                batteryModes[0].cost = batteryModes[0].cost + batteryModes[0].importPrice * maxCharge; // worst-case
                hours += 1;
                if (calcPerformance(batteryModes[1]) < avg) {
                    if (debug) {
                        node.warn("Calculated efficient grid charge option, 2nd hour");
                    }
                    batteryModes[1].mode = "charge";
                    if (debug) {
                        node.warn("importPrice #17");
                    }
                    batteryModes[1].cost = batteryModes[1].cost + batteryModes[1].importPrice * maxCharge; // worst-case
                    hours += 1;
                    if (calcPerformance(batteryModes[2]) < avg) {
                        if (debug) {
                            node.warn("Calculated efficient grid charge option, 3rd hour");
                        }
                        batteryModes[2].mode = "charge";
                        if (debug) {
                            node.warn("importPrice #18");
                        }
                        batteryModes[2].cost = batteryModes[2].cost + batteryModes[2].importPrice * maxCharge; // worst-case
                        hours += 1;
                    }
                }
            }

            // Sortierung nach Zeitstempeln wiederherstellen
            batteryModes.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

            // Preisermittlung
			// TODO Idee: auch die nicht optimierte Verwendung der Batterie berechnen und später die drei Werte (Netzladung/Batterie/ohne) vergleichen
            //const totalCost = energyNeeded.reduce((sum, entry) => sum + entry.cost, 0);
            const totalCostOptimized = batteryModes.reduce((sum, entry) => sum + entry.cost, 0);

            msg.payload.batteryModes = batteryModes;
            msg.payload.stats = {
                totalCosts: totalCost,
                totalCostOptimized: totalCostOptimized,
                minimumEntry: minimumPriceEntry,
                maximumEntry: maximumPriceEntry,
                diff: diff,
                avg: avg,
                chargeHours: hours,
            };

            node.send(msg);
        });
    }
    RED.nodes.registerType("@iseeberg79/EstimateBatterymode", EstimateBatteryMode, {
        defaults: {
            batteryBuffer: { value: 5, exportable: true },
            batteryCapacity: { value: 10, exportable: true },
            maxCharge: { value: 5, exportable: true },
            feedin: { value: 0.079, exportable: true },
            efficiency: { value: 80, exportable: true },
            performance: { value: 20, exportable: true },
        },
        inputs: 1,
        outputs: 1,
    });
};
