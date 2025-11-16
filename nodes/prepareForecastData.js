module.exports = function (RED) {
    function PrepareForecastDataNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Konfigurationsparameter
        const exportPrice = parseFloat(config.exportPrice) || 0.079;
        const timeInterval = config.timeInterval || "1h"; // "1h" oder "15m"
		const convertWhToKWh = config.convertWhToKWh !== false;

        let debug = false;

        node.on("input", function (msg) {
            // Debugging
            if (typeof msg.debug !== "undefined") {
                debug = msg.debug;
            }

            try {
                // Input validation
                if (!msg.input || typeof msg.input !== "object") {
                    node.error("msg.input object is required", msg);
                    node.status({ fill: "red", shape: "ring", text: "missing input" });
                    return;
                }

                // Schritt 1: Preisdaten konvertieren (falls nötig)
                let priceData = msg.input.priceData;

                // Fallback: Support für priceData15
                if (!priceData && msg.input.priceData15) {
                    priceData = msg.input.priceData15;
                }

                // Auto-detect: Berechne Intervall zwischen ersten zwei Einträgen
                let priceDataInterval = null;
                if (priceData && priceData.length >= 2 && priceData[0].start && priceData[1].start) {
                    const start1 = new Date(priceData[0].start).getTime();
                    const start2 = new Date(priceData[1].start).getTime();
                    priceDataInterval = start2 - start1;
                }

                const isPriceData15min = priceDataInterval === 15 * 60 * 1000;
                const isPriceDataHourly = priceDataInterval === 60 * 60 * 1000;

                if (isPriceData15min && timeInterval === "1h") {
                    if (debug) {
                        node.warn("Converting 15min price data to hourly averages");
                    }
                    priceData = convert15MinToHourly(priceData, debug);
                } else if (isPriceDataHourly && timeInterval === "15m") {
                    if (debug) {
                        node.warn("Converting hourly price data to 15min intervals");
                    }
                    priceData = convertHourlyTo15Min(priceData, debug);
                }

                // Schritt 2: PV-Forecasts kombinieren (falls zwei Arrays vorhanden)
                let pvForecast = msg.input.pvforecast;

                if (msg.pvforecast1 && msg.pvforecast2) {
                    if (debug) {
                        node.warn("Combining two PV forecasts");
                    }
                    pvForecast = combinePVForecasts(msg.pvforecast1, msg.pvforecast2, debug);
                    delete msg.pvforecast1;
                    delete msg.pvforecast2;
                } else if (msg.pvforecast1) {
                    // Nur ein Forecast vorhanden
                    pvForecast = msg.pvforecast1;
                    delete msg.pvforecast1;
                } else if (msg.pvforecast2) {
                    // Nur zweiter Forecast vorhanden
                    pvForecast = msg.pvforecast2;
                    delete msg.pvforecast2;
                }

                // Schritt 2b: PV-Forecast konvertieren (falls nötig)
                if (pvForecast) {
                    // Auto-detect: Berechne Intervall zwischen ersten zwei Einträgen
                    let pvForecastInterval = null;
                    if (pvForecast.length >= 2) {
                        // Unterstütze verschiedene Feld-Namen
                        const time1 = pvForecast[0].start || pvForecast[0].end || pvForecast[0].period_end;
                        const time2 = pvForecast[1].start || pvForecast[1].end || pvForecast[1].period_end;

                        if (time1 && time2) {
                            const t1 = new Date(time1).getTime();
                            const t2 = new Date(time2).getTime();
                            pvForecastInterval = Math.abs(t2 - t1);
                        }
                    }

                    const isPVForecast15min = pvForecastInterval === 15 * 60 * 1000;
                    const isPVForecastHourly = pvForecastInterval === 60 * 60 * 1000;

                    if (isPVForecast15min && timeInterval === "1h") {
                        if (debug) {
                            node.warn("Converting 15min PV forecast to hourly averages");
                        }
                        pvForecast = convert15MinToHourly(pvForecast, debug);
                    } else if (isPVForecastHourly && timeInterval === "15m") {
                        if (debug) {
                            node.warn("Converting hourly PV forecast to 15min intervals");
                        }
                        pvForecast = convertHourlyTo15Min(pvForecast, debug);
                    }
                }

                // Schritt 2c: Household consumption konvertieren (falls nötig)
                let household = msg.input.household;
                if (household) {
                    // Für household Array: Vergleiche Länge mit priceData
                    // Wenn priceData konvertiert wurde, nutze die Original-Info
                    let householdNeedsConversion = false;

                    if (priceDataInterval === 15 * 60 * 1000 && timeInterval === "1h") {
                        // Price war 15min, wurde zu hourly konvertiert
                        // Household sollte auch 15min sein → konvertieren zu hourly
                        if (household.length === priceData.length * 4) {
                            householdNeedsConversion = true;
                            if (debug) {
                                node.warn("Converting 15min household data to hourly averages");
                            }
                            household = convertArray15MinToHourly(household, debug);
                        }
                    } else if (priceDataInterval === 60 * 60 * 1000 && timeInterval === "15m") {
                        // Price war hourly, wurde zu 15min konvertiert
                        // Household sollte auch hourly sein → konvertieren zu 15min
                        if (household.length * 4 === priceData.length) {
                            householdNeedsConversion = true;
                            if (debug) {
                                node.warn("Converting hourly household data to 15min intervals");
                            }
                            household = convertArrayHourlyTo15Min(household, debug);
                        }
                    } else if (timeInterval === "15m" && household.length < priceData.length) {
                        // Fallback: Wenn timeInterval 15m ist und household kürzer als priceData
                        if (debug) {
                            node.warn("Converting hourly household data to 15min intervals (fallback)");
                        }
                        household = convertArrayHourlyTo15Min(household, debug);
                    } else if (timeInterval === "1h" && household.length > priceData.length) {
                        // Fallback: Wenn timeInterval 1h ist und household länger als priceData
                        if (debug) {
                            node.warn("Converting 15min household data to hourly averages (fallback)");
                        }
                        household = convertArray15MinToHourly(household, debug);
                    }
                }

                // Schritt 3: Daten transformieren für EstimateBatterymode
                if (debug) {
                    node.warn("Transforming data for EstimateBatterymode");
                }

                // Berechne Start-Timestamp
                // Wichtig: Consumption Array hat keine Zeitzone-Info, daher müssen wir eine annehmen
                // Standard: UTC Midnight (kann vom User überschrieben werden via msg.timezone)
                const now = new Date();
                let startTimestamp;

                // Wenn msg.timezone angegeben ist, verwende diese für Consumption
                // Beispiel: msg.timezone = "Europe/Berlin" oder offset in Minuten
                if (msg.timezone) {
                    // Vereinfachte Lösung: UTC-Offset in Minuten
                    const timezoneOffsetMinutes = typeof msg.timezone === 'number' ? msg.timezone : 0;
                    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    startTimestamp = localMidnight.getTime() - (timezoneOffsetMinutes * 60 * 1000);

                    if (debug) {
                        node.warn(`Using timezone offset: ${timezoneOffsetMinutes} minutes`);
                    }
                } else {
                    // Default: UTC Midnight
                    startTimestamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
                }

                const interval = timeInterval === "1h" ? 60 * 60 * 1000 : 15 * 60 * 1000;

                if (debug) {
                    node.warn(`Start timestamp: ${new Date(startTimestamp).toISOString()}`);
                }

                const transformedData = {
                    priceData: transformPriceData(priceData, exportPrice, debug),
                    productionForecast: transformProductionForecast(pvForecast, interval, debug),
                    consumptionForecast: transformConsumptionForecast(household, startTimestamp, interval, debug),
                    soc: msg.input.soc || 0,
                };

                // Cleanup und Output
                delete msg.input;
                msg.payload = transformedData;

                node.status({ fill: "green", shape: "dot", text: "ready" });
                node.send(msg);
            } catch (error) {
                node.error("Error preparing forecast data: " + error.message, msg);
                node.status({ fill: "red", shape: "ring", text: "error" });
                if (debug) {
                    node.warn("Full error: " + error.stack);
                }
            }
        });

        // Hilfsfunktion: 15min → Stundenwerte (Durchschnitt)
        function convert15MinToHourly(data, debug) {
            let grouped = {};

            for (let entry of data) {
                // Zeit in JS-Datum umwandeln
                let d = new Date(entry.start || entry.end);

                // Ganze Stunde als Schlüssel (UTC!)
                d.setMinutes(0, 0, 0);
                let hourKey = d.toISOString();

                if (!grouped[hourKey]) {
                    grouped[hourKey] = [];
                }
                // Unterstütze value, price und pv_estimate
                const val = entry.value ?? entry.price ?? entry.pv_estimate ?? 0;
                grouped[hourKey].push(val);
            }

            // Stundenmittel berechnen
            let result = Object.keys(grouped)
                .sort()
                .map((k) => {
                    let values = grouped[k];
                    let avg = values.reduce((a, b) => a + b, 0) / values.length;
                    return {
                        start: k,
                        end: new Date(new Date(k).getTime() + 60 * 60 * 1000).toISOString(),
                        value: parseFloat(avg.toFixed(4)),
                        price: parseFloat(avg.toFixed(4)),
                        pv_estimate: parseFloat(avg.toFixed(4)),
                    };
                });

            if (debug) {
                node.warn(`Converted ${data.length} 15min entries to ${result.length} hourly entries`);
            }

            return result;
        }

        // Hilfsfunktion: Stundenwerte → 15min (Wert auf 4 Intervalle verteilen)
        function convertHourlyTo15Min(data, debug) {
            let result = [];

            for (let entry of data) {
                const hourStart = new Date(entry.start);
                const value = entry.value ?? entry.price ?? entry.pv_estimate ?? 0;

                // Erstelle 4 Einträge à 15 Minuten mit gleichem Wert
                for (let i = 0; i < 4; i++) {
                    const start = new Date(hourStart.getTime() + i * 15 * 60 * 1000);
                    const end = new Date(start.getTime() + 15 * 60 * 1000);

                    result.push({
                        start: start.toISOString(),
                        end: end.toISOString(),
                        value: value,
                        price: value,
                        pv_estimate: value,
                    });
                }
            }

            if (debug) {
                node.warn(`Converted ${data.length} hourly entries to ${result.length} 15min entries`);
            }

            return result;
        }

        // Hilfsfunktion: Array 15min → Stundenwerte (Durchschnitt)
        function convertArray15MinToHourly(data, debug) {
            let result = [];

            // Gruppiere je 4 Werte zu einem Stundenwert
            for (let i = 0; i < data.length; i += 4) {
                const values = data.slice(i, i + 4);
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                result.push(parseFloat(avg.toFixed(4)));
            }

            if (debug) {
                node.warn(`Converted ${data.length} 15min values to ${result.length} hourly values`);
            }

            return result;
        }

        // Hilfsfunktion: Array Stundenwerte → 15min (Wert auf 4 Intervalle verteilen)
        function convertArrayHourlyTo15Min(data, debug) {
            let result = [];

            // Jeden Stundenwert auf 4x 15min verteilen
            for (let value of data) {
                for (let i = 0; i < 4; i++) {
                    result.push(value);
                }
            }

            if (debug) {
                node.warn(`Converted ${data.length} hourly values to ${result.length} 15min values`);
            }

            return result;
        }

        // Hilfsfunktion: Zwei PV-Forecasts kombinieren
        function combinePVForecasts(forecast1, forecast2, debug) {
            // Detect which time fields are available (support multiple formats)
            const matchKey = forecast1[0].end ? 'end' :
                           forecast1[0].period_end ? 'period_end' :
                           forecast1[0].start ? 'start' : null;

            const combined = forecast1.map((f1) => {
                const f2 = forecast2.find((f) => f[matchKey] === f1[matchKey]);

                // Combine pv_estimate values
                const result = {
                    ...f1,
                    pv_estimate: (f1.pv_estimate ?? 0) + (f2 ? (f2.pv_estimate ?? 0) : 0),
                };

                return result;
            });

            if (debug) {
                node.warn(`Combined ${forecast1.length} + ${forecast2.length} forecasts into ${combined.length} entries`);
            }

            return combined;
        }

        // Hilfsfunktion: Preisdaten transformieren
        function transformPriceData(data, exportPrice, debug) {
            if (!data || !Array.isArray(data)) {
                throw new Error("priceData must be an array");
            }

            return data.map((item, index) => {
                // Normalisiere Zeitstempel zu ISO-String (falls nicht schon)
                let startTime = item.start;
                if (typeof startTime === 'number') {
                    // Unix timestamp (Sekunden oder Millisekunden)
                    startTime = new Date(startTime > 9999999999 ? startTime : startTime * 1000).toISOString();
                } else if (startTime instanceof Date) {
                    startTime = startTime.toISOString();
                } else if (typeof startTime === 'string') {
                    // Stelle sicher, dass es ein gültiger ISO-String ist
                    startTime = new Date(startTime).toISOString();
                }

                if (debug && index === 0) {
                    node.warn(`Price data first entry: ${item.start} → ${startTime}`);
                }

                return {
                    value: item.price || item.value,
                    start: startTime,
                    exportPrice: exportPrice,
                    importPrice: item.price || item.value,
                };
            });
        }

        // Hilfsfunktion: ISO 8601 Period zu Millisekunden
        function parsePeriod(period) {
            if (!period) {
                return 30 * 60 * 1000; // Fallback: 30 Minuten
            }

            // Parse ISO 8601 duration (z.B. "PT30M", "PT1H", "PT15M")
            const match = period.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (!match) {
                return 30 * 60 * 1000; // Fallback
            }

            const hours = parseInt(match[1] || 0);
            const minutes = parseInt(match[2] || 0);
            const seconds = parseInt(match[3] || 0);

            return (hours * 3600 + minutes * 60 + seconds) * 1000;
        }

        // Hilfsfunktion: PV-Produktionsprognose transformieren
        function transformProductionForecast(data, interval, debug) {
            if (!data || !Array.isArray(data)) {
                throw new Error("productionForecast must be an array");
            }

            return data.map((item) => {
                let startTime;

                // Support multiple formats: start, end, start+end, period_end+period
                if (item.start && item.end) {
                    // Both start and end provided - use start
                    startTime = item.start;
                } else if (item.start) {
                    // Only start provided - use it directly (end can be calculated if needed)
                    startTime = item.start;
                } else if (item.end) {
                    // Only end provided - calculate start by subtracting interval
                    const endDate = new Date(item.end);
                    const startDate = new Date(endDate.getTime() - interval);
                    startTime = startDate.toISOString();
                } else if (item.period_end && item.period) {
                    // Calculate start from period_end and period
                    const periodEnd = new Date(item.period_end);
                    const periodDuration = parsePeriod(item.period);
                    const periodStart = new Date(periodEnd.getTime() - periodDuration);
                    startTime = periodStart.toISOString();
                } else if (item.period_end) {
                    // Only period_end provided - calculate start by subtracting interval
                    const endDate = new Date(item.period_end);
                    const startDate = new Date(endDate.getTime() - interval);
                    startTime = startDate.toISOString();
                } else {
                    throw new Error("PV forecast data must have 'start', 'end', or 'period_end' field");
                }
				
				let value = item.pv_estimate ?? item.value ?? 0;

				if (convertWhToKWh) {
				    value = value / 1000; // Wh → kWh
				}

				if (debug && data.indexOf(item) === 0) {
				    node.warn(`PV Forecast first entry: start=${startTime}, value=${value}`);
				}

				return {
				    start: startTime,
				    value: parseFloat(value.toFixed(4)), // optional runden
				};
            });
        }

        // Hilfsfunktion: Verbrauchsprognose transformieren
        function transformConsumptionForecast(data, startTimestamp, interval, debug) {
            if (!data || !Array.isArray(data)) {
                throw new Error("consumptionForecast must be an array");
            }

            return data.map((value, index) => ({
                start: new Date(startTimestamp + index * interval).toISOString(),
                value: value,
            }));
        }
    }

    RED.nodes.registerType("@iseeberg79/PrepareForecastData", PrepareForecastDataNode, {
        defaults: {
            name: { value: "" },
            exportPrice: { value: 0.079, exportable: true },
            timeInterval: { value: "1h", exportable: true },
        },
        inputs: 1,
        outputs: 1,
    });
};