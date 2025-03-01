const axios = require("axios");

module.exports = function (RED) {
    function EvaluateSolarForecastAPI(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.url = config.url || "http://localhost:7070/api/tariff/solar";

        node.on("input", async function (msg) {
            // Defaults to provided URL or local API
            msg.url = typeof msg.url !== "undefined" ? msg.url : node.url;

            // HTTP request
            try {
                const response = await axios.get(msg.url);
                msg.payload = response.data;
            } catch (error) {
                node.error("HTTP-Anfrage Fehler: " + error, msg);
                return;
            }

            // Umbenennen von 'price' in 'value' und Umrechnung in kWh
            const rates = msg.payload.result.rates.map((item) => {
                return {
                    ...item,
                    value: item.price / 1000, // Umrechnung von Wh in kWh
                };
            });

            // Aktuelles Datum und Zeit
            const now = new Date();

            // Funktion, um die Erträge für einen bestimmten Tag zu berechnen
            function calculateTotalForDay(day) {
                return rates.reduce((sum, item) => {
                    const startDate = new Date(item.start);
                    if (startDate.toISOString().split("T")[0] === day) {
                        return sum + item.value;
                    }
                    return sum;
                }, 0);
            }

            // Berechnung der heutigen und morgigen Erträge
            const today = now.toISOString().split("T")[0];
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowDateString = tomorrow.toISOString().split("T")[0];

            const todayTotal = calculateTotalForDay(today);
            const tomorrowTotal = calculateTotalForDay(tomorrowDateString);

            // Berechnung der verbleibenden Erträge für heute
            const remainderToday = rates.reduce((sum, item) => {
                const startDate = new Date(item.start);
                if (startDate > now && startDate.toISOString().split("T")[0] === today) {
                    return sum + item.value;
                }
                return sum;
            }, 0);

            // Forward the JSON response as payload
            msg.payload.rates = rates;

            msg.payload.lastchange = new Date().getTime();
            msg.payload.todayTotal = Math.floor(todayTotal * 100) / 100;
            msg.payload.tomorrowTotal = Math.floor(tomorrowTotal * 100) / 100;
            msg.payload.remainderToday = Math.floor(remainderToday * 100) / 100;

            // cleanup
            delete msg.payload.result;

            node.send(msg);
        });
    }
    RED.nodes.registerType("@iseeberg79/EvaluateSolarForecastAPI", EvaluateSolarForecastAPI, {
        defaults: {
            name: { value: "" },
            url: { value: "http://localhost:7070/api/tariff/solar" },
        },
    });
};
