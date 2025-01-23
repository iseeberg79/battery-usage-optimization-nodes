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

		node.on('input', function(msg) {
			if (typeof msg.debug !== 'undefined') { debug = msg.debug; }

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

			    // Schritt 1: Den Index des höchsten Importpreises finden, ohne das Array zu verändern
			    for (let i = 0; i < data.length; i++) {
			        if (data[i].importPrice > maxPrice) {
			            maxPrice = data[i].importPrice;
			            maxPriceIndex = i;
			        }
			    }

			    // Schritt 2: Daten nach dem aktuellen Zeitpunkt und vor dem höchsten Importpreis filtern
			    let loadableHours = 0;
			    for (let i = 0; i < maxPriceIndex; i++) {
			        if (data[i].start > currentTime && data[i].importPrice < threshold) {
			            loadableHours++;
			        }
			    }

			    // Mögliche Netzladungsmenge berechnen (pro Stunde maximal maxCharge kWh)
			    const loadableEnergy = (Math.min(loadableHours * maxCharge, battery_capacity) * 0.9); // Annahme etwas reduzieren!
				if (debug) { node.warn("Loadable Energy: " + loadableEnergy + ", Hours: " + loadableHours + ", Threshold: " + threshold); }
				
			    return { loadableHours, loadableEnergy };
			}

			
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
			};

			function calculateAverage(data) {
				const sum = data.reduce((total, entry) => total + entry.importPrice, 0);
				const average = sum / data.length;
				return average;
			}

			function getMaximumSoC(data) {
				return data.reduce((maxEntry, entry) => {
					return (entry.soc > maxEntry.soc) ? entry : maxEntry;
				});
			}


			function getCurrentHourIndex(data) {
				const currentTime = new Date().toISOString();
				return data.findIndex(entry => {
					return entry.start.substring(0, 13) === currentTime.substring(0, 13);
				});
			}

			function getMaximumAbs(data) {
				return data.reduce((maxEntry, currentEntry) => {
					return (currentEntry.importPrice > maxEntry.importPrice) ? currentEntry : maxEntry;
				});
			}

			function getMinimumPriceAbs(data) {
				return data.reduce((prev, curr) => {
					return (prev.importPrice < curr.importPrice) ? prev : curr;
				});
			}

			function getMinimumPrice(data) {
				const maxImportIndex = data.reduce((maxIdx, current, idx, array) => {
					return current.importPrice > array[maxIdx].importPrice ? idx : maxIdx;
				}, 0);

				const dataBeforeMaxImport = data.slice(0, maxImportIndex);

				const cheapestEntry = dataBeforeMaxImport.reduce((prev, curr) => {
					return (prev.importPrice < curr.importPrice) ? prev : curr;
				}, dataBeforeMaxImport[0]);

				return cheapestEntry;
			}

			function getMaximumPrice(data) {
				const startIndex = getCurrentHourIndex(data);
				const dataFromStart = data.slice(startIndex);

				return dataFromStart.reduce((maxEntry, currentEntry) => {
					return (currentEntry.importPrice > maxEntry.importPrice) ? currentEntry : maxEntry;
				});
			}

			function getMaximumPriceGap(data) {
				const max = getMaximumPrice(data);
				const min = getMinimumPrice(data);
				const diff = Math.floor((max.importPrice - min.importPrice) * 1000) / 1000;
				if (debug) { node.warn("Diff: " + diff); }
				return diff;
			}

			function calcPerformance(min) {
				return ((min.importPrice * factor) * rate);
			}

			const consumptionForecast = extendForecast(msg.payload.consumptionForecast);

			// Zusammengefasste PV-Produktion (stundenbasiert)
			const productionForecast = summarizeSolarByHour(msg.payload.productionForecast);

			//let batteryPower = startBatteryPower;
			let batteryPower = 0; // es wird mit leerer Batterie gestartet, um den maximalen morgigen Füllstand zu berechnen

			const energyNeeded = priceData.reduce((result, price, i) => {
				const timestamp = new Date(price.start).getTime();
				if (timestamp > recent) {
					let mode = "hold";
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
					}
					let batterySoc = Math.floor(Math.min(batteryBuffer + (batteryPower / battery_capacity * 100), 100)); // mehr als 100 geht nicht
					result.push({ start: price.start, value: netEnergy, importPrice: price.importPrice, cost: energyCost, soc: batterySoc, mode: mode });
				}
				return result;
			}, []);

			const estimatedMaximumSoc = getMaximumSoC(energyNeeded);
			const diff = getMaximumPriceGap(energyNeeded);
			const avg = Math.floor(calculateAverage(energyNeeded) * 1000) / 1000;
			const minimumPriceEntry = getMinimumPrice(energyNeeded);
			const maximumPriceEntry = getMaximumPrice(energyNeeded);
			const energyAvailable = JSON.parse(JSON.stringify(energyNeeded));

			// hier wird die Batterienutzungsoptimierung/-glättung durchgeführt
			lastGridchargePrice = Math.max(lastGridchargePrice, avg);

			if (debug) { node.warn("min:" + JSON.stringify(minimumPriceEntry)); }
			if (debug) { node.warn("min-abs:" + JSON.stringify(getMinimumPriceAbs(energyNeeded))); }
			if (debug) { node.warn("max:" + JSON.stringify(maximumPriceEntry)); }

			const gridchargePerformance = (calcPerformance(minimumPriceEntry) < avg);
			if (debug) { node.warn("Preisgrenze: " + lastGridchargePrice); }

			// Prognose verwerfen und Startwert annehmen
			let currentbatteryPower = startBatteryPower;
			let breakevenPoint = estimatedMaximumSoc.start;
			let estimatedbatteryPower = batteryCapacity / 100 * estimatedMaximumSoc.soc; // erwartete, maximale Batterieleistung
			if (gridchargePerformance) {
				if (minimumPriceEntry.start < estimatedMaximumSoc.start) {
					breakevenPoint = minimumPriceEntry.start;
					const energy = calculateLoadableHours(energyNeeded, (avg / rate / factor)).loadableEnergy; 
					estimatedbatteryPower = batteryCapacity * Math.min(1,(energy/battery_capacity)); // Netzladung wird für eine volle Batterie sorgen
				}
			}
			if (debug) { node.warn("Optimierungszeitpunkt: " + breakevenPoint); }

			if (debug) { node.warn("aktuell verfügbare batteryPower: " + currentbatteryPower); }
			if (debug) { node.warn("erwartete verfügbare batteryPower: " + estimatedbatteryPower); }

			energyAvailable.sort((a, b) => b.importPrice - a.importPrice);

			const batteryModes = energyAvailable.map(hour => {
				// Verwendung des aktuellen Batteriespeichers bis zum Entscheidungszeitpunkt
				if ((hour.value > 0) && (hour.start < breakevenPoint)) {
					if (debug) { node.warn(hour.start + " " + hour.value + " " + estimatedMaximumSoc.start + " " + estimatedMaximumSoc.soc); }
					if ((currentbatteryPower >= 0) && (lastGridchargePrice < hour.importPrice)) {
						const dischargeAmount = Math.min(hour.value, currentbatteryPower);
						currentbatteryPower -= dischargeAmount;
						hour.value -= dischargeAmount;
						hour.cost = dischargeAmount * batteryEnergyPrice;
						hour.mode = "normal";
					}
				}
				// prognostizierte Verwendung, nachdem PV geladen wurde
				if ((hour.value > 0) && (hour.start >= breakevenPoint)) {
					if (debug) { node.warn(hour.start + " " + hour.value + " " + estimatedMaximumSoc.start + " " + estimatedMaximumSoc.soc); }
					if ((estimatedbatteryPower > 0) && (lastGridchargePrice < hour.importPrice)) {
						const dischargeAmount = Math.min(hour.value, estimatedbatteryPower);
						estimatedbatteryPower -= dischargeAmount;
						hour.value -= dischargeAmount;
						hour.cost = dischargeAmount * batteryEnergyPrice;
						hour.mode = "normal";
					}
				}
				// interne Steuerung der Batterie, wenn niedriger Ladungszustand
				if ((hour.mode != "normal") && (hour.value > 0) && (hour.start < breakevenPoint) && (currentbatteryPower <= 0)) {
					if (debug) { node.warn(hour.start + ": Batterieladungszustand zu gering, interne Steuerung zulassen."); }
					hour.mode = "normal";
				}
				delete hour.soc;
				return hour;
			});

			// mögliche Netzladung berechnen, wenn effektiv - Sortierung nach günstigstem Preis
			batteryModes.sort((a, b) => a.importPrice - b.importPrice);

			if (debug) { node.warn("working-min: " + JSON.stringify(batteryModes[0])); }
			if (debug) { node.warn("working-min-2nd: " + JSON.stringify(batteryModes[1])); }
			if (debug) { node.warn("working-min-3rd: " + JSON.stringify(batteryModes[2])); }

			let hours = 0;
			if (gridchargePerformance) {
				if (debug) { node.warn("Calculated efficient grid charge option, 1st hour"); }
				batteryModes[0].mode = "charge";
				hours += 1;
				if (calcPerformance(batteryModes[1]) < avg) {
					if (debug) { node.warn("Calculated efficient grid charge option, 2nd hour"); }
					batteryModes[1].mode = "charge";
					hours += 1;
					if (calcPerformance(batteryModes[2]) < avg) {
						if (debug) { node.warn("Calculated efficient grid charge option, 3rd hour"); }
						batteryModes[2].mode = "charge";
						hours += 1;
					}
				}
			}

			// Sortierung nach Zeitstempeln wiederherstellen
			batteryModes.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

			// Preisermittlung
			const totalCost = energyNeeded.reduce((sum, entry) => sum + entry.cost, 0);
			const totalCostOptimized = batteryModes.reduce((sum, entry) => sum + entry.cost, 0);

			msg.payload.batteryModes = batteryModes;
			msg.payload.stats = { totalCost: totalCost, totalCostOptimized: totalCostOptimized, minimumEntry: minimumPriceEntry, maximumEntry: maximumPriceEntry, diff: diff, avg: avg, chargeHours: hours };

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
			performance: { value: 20, exportable: true }
		},
		inputs: 1,
		outputs: 1
	});
};

