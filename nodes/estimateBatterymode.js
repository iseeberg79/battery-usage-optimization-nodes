module.exports = function (RED) {
    function EstimateBatteryMode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        let debug = false; // debugging
        let estimation = false; // estimate 48h
        let error = false;

        // Konfigurationsparameter
        const batteryBuffer = config.batteryBuffer || 5; // minsoc %
        const batteryCapacity = config.batteryCapacity || 10; // capacity kWh
        const maxCharge = config.maxCharge || 5; // max. charging capability kWh
        const feedin = config.feedin || 0.079; // Einspeisetarif pro kWh
        const efficiency = config.efficiency || 80; // Wirkungsgrad %
        const performance = config.performance || 20; // Vorteil %
        let soc = 0; // state of charge
        let charge = true; // Netzladung aktivieren
        //TODO es fehlt der lastGridchargePrice als Übergabe für eine Verschiebung der Feedin-Grenze

        node.on("input", function (msg) {
            // Debugging
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            // grid charging
            if (typeof msg.charge !== "undefined") {
                charge = charge && msg.charge;
            }
            if (debug) {
                node.warn("Netzladung aktiviert (conf): " + charge);
            }

            // full estimation
            if (typeof msg.estimation !== "undefined") {
                estimation = msg.estimation;
            }

            // use soc from message flow
            if (typeof msg.payload.soc !== "undefined") {
                soc = msg.payload.soc;
            }

            // abort on missing forecast input
            if (typeof msg.payload.priceData == "undefined" || typeof msg.payload.productionForecast == "undefined" || typeof msg.payload.consumptionForecast == "undefined") {
                node.status({ fill: "red", shape: "ring", text: "missing forecasts" });
                msg.error = "no forecasts";
                error = true;
            } else {
                node.status({ fill: "orange", shape: "dot", text: "processing" });
            }

            const factor = 1 + (100 - efficiency) / 100;
            const rate = 1 + performance / 100;

            const batteryEnergyPrice = feedin * factor; // Einspeisetarif inkl. Wandlungsverluste
            let lastGridchargePrice = typeof msg.lastGridchargePrice !== "undefined" ? msg.lastGridchargePrice : batteryEnergyPrice; // Netzladungspreis pro kWh
            const battery_capacity = batteryCapacity - (batteryCapacity / 100) * batteryBuffer; // available energy kWh

            const startPower = ((soc - batteryBuffer) / 100) * battery_capacity; // batteryPower aus dem Nachrichtenfluss (Energiemenge des Batteriespeichers)
            let startBatteryPower = startPower;

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
                    node.warn("Loadable Energy: " + loadableEnergy + ", Hours: " + loadableHours + ", Threshold: " + threshold);
                }

                return {
                    loadableHours,
                    loadableEnergy,
                    avgPrice: (avgPrice / loadableHours) * factor,
                };
            }

            // TODO das Folgende auch für die Preise machen, um das maximale zur Prognose beizutragen?
            // sinnlos, das mit dem Durchschnittspreis auszuführen - bräuchte bessere Prognose

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

            // Energiekosten berechnen
            function calculateEnergyCosts2(modes, batteryCapacity, batteryBuffer, feedin, factor, startBatteryPower, debug) {
                // Sortierung nach Zeitstempeln wiederherstellen
                modes.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                // nochmal über das Array iterieren und Kosten nachrechnen
                // refine costs and battery-soc
                let minEnergy = (batteryCapacity / 100) * batteryBuffer;
                let energyPrice = feedin * factor;
                let estimatedbatteryPower = Math.max(minEnergy, Math.min(batteryCapacity + minEnergy, startBatteryPower));
                let gridCharged = false;
                let costTotal = 0;

                for (let i = 0; i < modes.length; i++) {
                    let chargedEnergy = 0;

                    if (modes[i].mode == "charge" && typeof modes[i].energy !== "undefined") {
                        // bei nachfolgenden den richtigen Preis verwenden
                        let power = Math.max(minEnergy, Math.min(batteryCapacity + minEnergy, estimatedbatteryPower + Math.abs(modes[i].energy)));
                        chargedEnergy = power - estimatedbatteryPower;
                        if (chargedEnergy > 0) {
                            gridCharged = true;
                        }
                        let grid = chargedEnergy * modes[i].importPrice * factor;
                        let old = estimatedbatteryPower * energyPrice;
                        energyPrice = (grid + old) / power;

                        if (debug) {
                            console.warn(i + ": Power: " + power + " / Grid: " + grid + " / Old: " + old + " / homePrice: " + energyPrice);
                        }
                        estimatedbatteryPower = power;
                    } else {
                        // geladene PV Leistung reduziert den Netzladungspreis
                        if (modes[i].mode == "hold" && modes[i].value < 0) {
                            let power = Math.max(minEnergy, Math.min(batteryCapacity + minEnergy, estimatedbatteryPower + Math.abs(modes[i].value)));
                            let pv = Math.abs(modes[i].value) * feedin * factor;
                            let old = estimatedbatteryPower * energyPrice;

                            if (power - estimatedbatteryPower > 0 && gridCharged) {
                                // neue Preisberechnung nur, wenn Netzgeladen wurde, sonst bleibt's beim alten
                                energyPrice = Math.max((pv + old) / power, feedin * factor);
                            }

                            if (debug) {
                                console.warn(i + ": Power: " + power + " / PV: " + pv + " / Old: " + old + " / homePrice: " + energyPrice);
                            }
                            estimatedbatteryPower = power;
                        }

                        // die Batterie wird zu den mittleren Kosten PV/Netz entladen
                        if (modes[i].mode == "normal" && typeof modes[i].energy !== "undefined") {
                            // berücksichtigt Entladung
                            //let power = Math.max(minEnergy, Math.min(batteryCapacity + minEnergy, estimatedbatteryPower - Math.max(0, modes[i].energy)));
                            // berücksichtigt Entladung und Ladung
                            let power = Math.max(minEnergy, Math.min(batteryCapacity + minEnergy, estimatedbatteryPower - modes[i].value - Math.max(0, modes[i].energy)));
                            estimatedbatteryPower = power;
                            if (debug) {
                                console.warn(i + ": Power: " + power + " / homePrice: " + energyPrice);
                            }
                            // TODO Rücksetzungszeitpunkt ggf. anpassen (20% = (20-batteryBuffer)*(batteryCapacity/100))
                            if (estimatedbatteryPower <= 0) {
                                gridCharged = false;
                                energyPrice = feedin * factor;
                            }
                        }
                    }

                    modes[i].soc = Math.max(batteryBuffer, Math.min(100, (estimatedbatteryPower / (batteryCapacity + minEnergy)) * 100));
                    modes[i].homePrice = energyPrice;

                    // Kosten nachrechnen
                    if (modes[i].mode == "hold") {
                        if (modes[i].value > 0) {
                            // Bezugskosten
                            modes[i].homePrice = modes[i].importPrice;
                            modes[i].cost2 = modes[i].value * modes[i].importPrice;
                        } else {
                            // Überschuss
                            modes[i].homePrice = feedin;
                            modes[i].cost2 = 0; // bzw. Feedin-Kosten
                        }
                    }
                    if (modes[i].mode == "charge") {
                        // Netzladungskosten
                        modes[i].cost2 = modes[i].importPrice * chargedEnergy * factor + modes[i].value * modes[i].importPrice;
                    }
                    if (modes[i].mode == "normal") {
                        if (modes[i].energy > 0) {
                            // Bezug und Speicherkosten (Kosten inkl. Verluste sicherstellen)
                            energyPrice = Math.max(energyPrice, feedin * factor);
                            modes[i].homePrice = energyPrice;
                        }
                        //modes[i].cost2 = energyPrice * modes[i].energy + modes[i].value * modes[i].importPrice;
                        modes[i].cost2 = energyPrice * modes[i].energy + Math.max(0, modes[i].value) * modes[i].importPrice;
                    }

                    // formatieren
                    let cost = Math.round(modes[i].cost2 * 10000) / 10000;
                    costTotal += cost;
                    modes[i].cost2 = cost;
                }

                //return parseFloat(costTotal.toFixed(2));
                return Math.round(costTotal * 100) / 100;
            }

            const priceData = alignArray(msg.payload.priceData, recent);
            msg.payload.priceData = priceData;

            const consumptionForecast = alignArray(extendForecast(msg.payload.consumptionForecast), recent);
            msg.payload.consumptionForecast = consumptionForecast;

            // Zusammengefasste PV-Produktion (stundenbasiert)
            const productionForecast = alignArray(transformSolarProductionArray(msg.payload.productionForecast), recent);
            msg.payload.productionForecast = productionForecast;

            //TODO falsch bei viel PV Energieüberschuss
            //let batteryPower = startBatteryPower;
            //TODO unsicher, was richtig ist - 0 führt zu falschen Ergebnissen, wenn wenig PV, aber Batterie gefüllt - aber gridcharge klappt nicht (soc > 30)
            // Lösungsidee - hier 0, aber nach dem Optimierungspunkt wird die Batterie mit der verbleibenden Energie ergänzt aus dem vorherigen Zeitraum festgelegt
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
                        consumption: consumption,
                        production: production,
                    });
                }
                return result;
            }, []);
            msg.payload.energyNeeded = JSON.parse(JSON.stringify(energyNeeded));

            const totalCost = Math.round(energyNeeded.reduce((sum, entry) => sum + entry.cost, 0) * 100) / 100;

            let estimatedMaximumSoc = getMaximumSoC(energyNeeded);
            let lowestEnergyEntry = getLowestEnergyEntry(energyNeeded);
            if (estimatedMaximumSoc.start < lowestEnergyEntry.start) {
                if (debug) {
                    node.warn("uneindeutig: estimatedMaximumSoc.start < lowestEnergyEntry.start, replaced by " + lowestEnergyEntry.start);
                }
                estimatedMaximumSoc = lowestEnergyEntry;
            }
            const diff = getMaximumPriceGap(energyNeeded);
            const avg = Math.floor(calculateAverage(energyNeeded) * 1000) / 1000;
            const minimumPriceEntry = getMinimumPrice(energyNeeded);
            const maximumPriceEntry = getMaximumPrice(energyNeeded);

            // Kopie des Arrays anlegen
            const energyAvailable = JSON.parse(JSON.stringify(energyNeeded));
            const energyUnoptimized = JSON.parse(JSON.stringify(energyNeeded));

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
            if (debug && charge) {
                node.warn("Netzladungsperformance: " + gridchargePerformance);
            }

            // Prognose verwerfen und aktuellen Batterieleistungswert annehmen
            let currentbatteryPower = startPower;
            if (debug) {
                node.warn("aktuell verfügbare batteryPower: " + startPower);
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
                        node.warn(minimumPriceEntry.start + ": ersetzen, liegt nach dem errechneten Maximum um: " + estimatedMaximumSoc.start);
                    }
                    breakevenPoint = minimumPriceEntry.start;
                }
                const energy = calculateLoadableHours(energyNeeded, avg / rate / factor);
                //TODO der Ladungsstand der Batterie muss berücksichtigt werden.
                estimatedbatteryPower = batteryCapacity * Math.min(1, energy.loadableEnergy / battery_capacity); // Netzladung wird vorher für eine volle Batterie sorgen
                if (debug) {
                    node.warn("erwartete verfügbare batteryPower (Netzladung): " + estimatedbatteryPower);
                }
                chargedEnergyPrice = energy.avgPrice;
            }
            if (debug) {
                node.warn("finaler Optimierungszeitpunkt: " + breakevenPoint);
            }

            // Vergleichsbasis bestimmen (ohne Optimierung)
            if (debug) {
                node.warn("vor der Vergleichsberechnung");
            }

            let comparedBatteryPower = startPower; // ensure valid starting value
            if (debug) {
                node.warn("compared starting - battery: " + comparedBatteryPower);
            }

            energyUnoptimized.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
            const comparedUsage = energyUnoptimized.map((hour) => {
                hour.mode = "normal";

                const dischargeAmount = Math.min(Math.max(0, hour.value), comparedBatteryPower);
                comparedBatteryPower -= dischargeAmount;
                hour.value -= dischargeAmount;
                hour.energy = dischargeAmount; // nicht kleiner für die spätere Berechnung
                hour.cost = hour.energy * batteryEnergyPrice + Math.max(0, hour.value) * hour.importPrice;

                if (debug) {
                    node.warn("compared: " + hour.start + " / " + hour.value + " / " + dischargeAmount + " / " + comparedBatteryPower);
                }

                // Ladung berücksichtigen
                if (hour.value < 0) {
                    // ausreichende PV Produktion
                    hour.cost = 0;
                    hour.energy = 0;
                    comparedBatteryPower += Math.abs(hour.value);
                }
                delete hour.soc; // Bereinigung
                return hour;
            });

            currentbatteryPower = startPower; // ensure valid starting value

            if (debug) {
                node.warn("vor dem Sortieren");
            }
            energyAvailable.sort((a, b) => b.importPrice - a.importPrice);

            if (debug) {
                node.warn("nach dem Sortieren");
            }
            const batteryModes = energyAvailable.map((hour) => {
                hour.energy = 0;
                let usedEnergy = 0;
                // Verwendung des aktuellen Batteriespeichers bis zum Entscheidungszeitpunkt
                if (hour.value > 0 && hour.start < breakevenPoint) {
                    if (debug) {
                        node.warn("vor dem Entscheidungszeitpunkt: " + breakevenPoint);
                    }
                    if (currentbatteryPower >= 0 && lastGridchargePrice < hour.importPrice) {
                        if (debug) {
                            node.warn(hour.start + " " + hour.value + " " + estimatedMaximumSoc.start + " " + estimatedMaximumSoc.soc);
                        }
                        const dischargeAmount = Math.min(hour.value, currentbatteryPower);
                        currentbatteryPower -= dischargeAmount;
                        hour.value -= dischargeAmount;
                        hour.energy = dischargeAmount;
                        hour.cost = dischargeAmount * batteryEnergyPrice + hour.value * hour.importPrice;
                        hour.mode = "normal";
                        if (debug) {
                            node.warn(hour.value + "/" + hour.mode + ": currentbatteryPower: " + currentbatteryPower);
                        }
                        usedEnergy += dischargeAmount;
                    }
                }

                if (debug) {
                    node.warn("initialer Batterieleistung: " + startBatteryPower);
                }
                if (debug) {
                    node.warn("aktueller Batterieleistung: " + currentbatteryPower);
                }
                if (debug) {
                    node.warn("verbrauchte Batterieleistung: " + usedEnergy);
                }

                // Berechnung der verbleibenden Batterieleistung
                let remainingEnergy = Math.max(0, startBatteryPower - usedEnergy);
                if (debug) {
                    node.warn("verbleibende batteryPower: " + remainingEnergy);
                }

                // Berechnung der erwarteten Batterieleistung inkl. PV Überschuss / Netzladung
                let minEnergy = (batteryCapacity / 100) * batteryBuffer;
                estimatedbatteryPower = Math.max(
                    minEnergy,
                    estimatedbatteryPower + Math.min(battery_capacity + minEnergy, remainingEnergy + (batteryCapacity / 100) * estimatedMaximumSoc.soc),
                );
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
                            node.warn(hour.start + " / " + hour.value + " " + estimatedMaximumSoc.start + " " + estimatedMaximumSoc.soc);
                        }
                        const dischargeAmount = Math.min(hour.value, estimatedbatteryPower);
                        estimatedbatteryPower -= dischargeAmount;
                        hour.value -= dischargeAmount;
                        hour.energy = dischargeAmount;
                        hour.cost = dischargeAmount * chargedEnergyPrice + hour.value * hour.importPrice;
                        hour.mode = "normal";
                        if (debug) {
                            node.warn(hour.value + "/" + hour.mode + ": estimatedbatteryPower: " + estimatedbatteryPower);
                        }
                    }
                }
                if (debug) {
                    node.warn("Prüfung, ob Batterieleistung verfügbar");
                }
                // interne Steuerung der Batterie, wenn niedriger Ladungszustand vor dem Entscheidungszeitpunkt
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

            if (debug && charge) {
                node.warn("mögliche Netzladung, vorher neu sortieren");
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
			// TODO prüfen, könnte zufällig mit maximaler PV Leistung übereinstimmen (Bedingung ergänzt, prüfen!)
            // maximale drei Stunden Netzladung - es wird nicht immer mit maximaler Ladeleistung geladen
            if (gridchargePerformance && charge && batteryModes[0].value > (-1 * maxCharge)) {
                if (debug) {
                    node.warn("Calculated efficient grid charge option, 1st hour");
                }
                batteryModes[0].mode = "charge";
                batteryModes[0].energy = -1 * maxCharge;
                if (debug) {
                    node.warn("grid charging - option #1");
                }
                batteryModes[0].cost = batteryModes[0].cost + batteryModes[0].importPrice * maxCharge; // worst-case
                hours += 1;
                if (calcPerformance(batteryModes[1]) < avg && batteryModes[1].value > (-1 * maxCharge)) {
                    if (debug) {
                        node.warn("Calculated efficient grid charge option, 2nd hour");
                    }
                    batteryModes[1].mode = "charge";
                    batteryModes[1].energy = -1 * maxCharge;
                    if (debug) {
                        node.warn("grid charging - option #2");
                    }
                    batteryModes[1].cost = batteryModes[1].cost + batteryModes[1].importPrice * maxCharge; // worst-case
                    hours += 1;
                    if (calcPerformance(batteryModes[2]) < avg && batteryModes[2].value > (-1 * maxCharge)) {
                        if (debug) {
                            node.warn("Calculated efficient grid charge option, 3rd hour");
                        }
                        batteryModes[2].mode = "charge";
                        batteryModes[2].energy = -1 * maxCharge;
                        if (debug) {
                            node.warn("grid charging - option #3");
                        }
                        batteryModes[2].cost = batteryModes[2].cost + batteryModes[2].importPrice * maxCharge; // worst-case
                        hours += 1;
                    }
                }
            }

            // Preisermittlung
            // auch die nicht optimierte Verwendung der Batterie berechnen und vielleicht die drei Werte (Netzladung/Batterie/ohne) vergleichen // charge ist aber zu ungenau

            startBatteryPower = startPower; // ensure correct starting value
            const totalCostOptimized = calculateEnergyCosts2(batteryModes, batteryCapacity, batteryBuffer, feedin, factor, startBatteryPower, debug);

            startBatteryPower = startPower; // ensure correct starting value
            const totalCostNotOptimized = calculateEnergyCosts2(comparedUsage, batteryCapacity, batteryBuffer, feedin, factor, startBatteryPower, debug);

            msg.payload.batteryModes = batteryModes;
            msg.payload.unoptimized = comparedUsage;
            msg.payload.stats = {
                totalCosts: totalCost,
                totalCostOptimized: totalCostOptimized,
                totalCostNotOptimized: totalCostNotOptimized,
                minimumEntry: minimumPriceEntry,
                maximumEntry: maximumPriceEntry,
                diff: diff,
                avg: avg,
                chargeHours: hours,
            };

            if (!error) {
                node.status({ fill: "green", shape: "dot", text: "ready" });
            }
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
