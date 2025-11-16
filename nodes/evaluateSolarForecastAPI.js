const axios = require("axios");

module.exports = function (RED) {
    function EvaluateSolarForecastAPINode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.url = config.url || "http://localhost:7070/api/tariff/solar";

        node.on("input", async function (msg) {
            // Defaults to provided URL or local API
            msg.url = typeof msg.url !== "undefined" ? msg.url : node.url;

            // Funktion, um die Energie-Erträge für einen bestimmten Tag zu berechnen
            // rates enthalten Leistung in W, wir berechnen Energie in Wh
            function calculateTotalForDay(rates, day) {
                return rates.reduce((sum, item) => {
                    const startDate = new Date(item.start);
                    if (startDate.toISOString().split("T")[0] === day) {
                        return sum + item.energy;
                    }
                    return sum;
                }, 0);
            }

            try {
                // HTTP request
                try {
                    const response = await axios.get(msg.url);
                    msg.payload = response.data;
                } catch (error) {
                    node.error("HTTP request error: " + error, msg);
                    return;
                }

				const rates = msg.payload.rates.map((item) => {
                    // Überprüfung, ob entweder 'price' oder 'value' existiert
                    const powerInWatts = item.value !== undefined ? item.value : item.price;

                    // Berechne Zeitdauer in Stunden
                    const startTime = new Date(item.start);
                    const endTime = new Date(item.end);
                    const durationHours = (endTime - startTime) / (1000 * 3600);

                    // Energie (Wh) = Leistung (W) × Zeit (h)
                    const energyWh = powerInWatts * durationHours;

                    return {
                        ...item,
                        // Convert Wh to kWh (assumes energyWh is in Wh from power calculation above)
                        value: energyWh / 1000, // kWh für Ausgabe
                        energy: energyWh, // Wh für interne Berechnungen
                    };
				});

                // Aktuelles Datum und Zeit
                const now = new Date();

                // Berechnung der heutigen und morgigen Erträge
                const today = now.toISOString().split("T")[0];
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowDateString = tomorrow.toISOString().split("T")[0];

                const todayTotal = calculateTotalForDay(rates, today);
                const tomorrowTotal = calculateTotalForDay(rates, tomorrowDateString);

                // Berechnung der verbleibenden Erträge für heute
                const remainderToday = rates.reduce((sum, item) => {
                    const startDate = new Date(item.start);
                    if (startDate > now && startDate.toISOString().split("T")[0] === today) {
                        return sum + item.energy;
                    }
                    return sum;
                }, 0);

                // Funktion zur Formatierung des Zeitstempels nach ISO
                const formatTimestamp = (timestamp) => {
                    const date = new Date(timestamp);
                    return date.toISOString().replace(/\.\d{1,7}Z$/, "Z");
                };

                // Array durchlaufen und Zeitstempel formatieren
                const formattedData = rates.map((item) => ({
                    start: formatTimestamp(item.start),
                    end: formatTimestamp(item.end),
                    value: item.value,
                }));

                // Forward the JSON response as payload
                msg.payload.rates = formattedData;

                msg.payload.today = Math.floor(todayTotal * 100) / 100;
                msg.payload.tomorrow = Math.floor(tomorrowTotal * 100) / 100;
                msg.payload.remain = Math.floor(remainderToday * 100) / 100;
                msg.payload.lastchange = new Date().getTime();

                // cleanup
                delete msg.payload.result;

                node.send(msg);
            } catch (error) {
                node.error("general error: " + error, msg);
                return;
            }
        });
    }
    RED.nodes.registerType("@iseeberg79/EvaluateSolarForecastAPI", EvaluateSolarForecastAPINode, {
        defaults: {
            name: { value: "" },
            url: { value: "http://localhost:7070/api/tariff/solar" },
        },
    });
};
