module.exports = function(RED) {
    const axios = require('axios');

    function EvaluateGridEnergyPricesNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.bzn = config.bzn;
        node.url = config.url;
        node.charges = config.charges;
        node.tax = config.tax;

        node.on('input', async function(msg) {
            // Zeitstempel-Node
            let heute = (new Date()).setHours(0, 0, 0, 0);            
            msg.start = Math.floor(heute / 1000);
            msg.end = Math.floor(new Date((new Date(heute).getTime() + (1000 * 3600 * 24))).setHours(23, 59, 59, 999) / 1000);

            // BZN aus der Konfiguration
            msg.bzn = (typeof msg.bzn !== 'undefined') ? msg.bzn : (node.bzn || "DE-LU"); // Standardwert

            // Vorbereiten
            msg.payload = {
                bzn: msg.bzn,
                start: msg.start,
                end: msg.end
            };

            msg.url = (typeof msg.url !== 'undefined') ? msg.url : (node.url || 'https://api.energy-charts.info/price'); // ISE

            // HTTP-Anfrage
            try {
                const response = await axios.get(msg.url, { params: msg.payload });
                msg.payload = response.data;
            } catch (error) {
                node.error('HTTP-Anfrage Fehler: ' + error, msg);
                return;
            }

            // Konvertierungs-Node
            const data = msg.payload;
            const result = data.unix_seconds.map((timestamp, index) => {
                return { start: timestamp, end: (timestamp + 3600), price: data.price[index] / 10 };
            });

            const pricesInCtPerKWh = data.price.map(price => price / 10);
            const minPrice = Math.min(...pricesInCtPerKWh);
            const maxPrice = Math.max(...pricesInCtPerKWh);
            const avgPrice = pricesInCtPerKWh.reduce((sum, price) => sum + price, 0) / pricesInCtPerKWh.length;

            msg.payload.prices = result;
            const maximum = maxPrice;
            const minimum = minPrice;
            const average = avgPrice;

            // Änderungs-Node
            msg.charges = (typeof msg.charges !== 'undefined') ? msg.charges : (node.charges || 0);
            if (typeof msg.charges === 'string') {
                msg.charges = parseFloat(msg.charges);
            }
            const charges = msg.charges; // Beispielwert, diesen ggf. dynamisch auslesen
            const tax_percent = (typeof msg.tax !== 'undefined') ? msg.tax : (node.tax || 19); // Beispielwert, diesen ggf. dynamisch auslesen
            const tax = msg.tax = 1 + (tax_percent / 100);
            msg.payload.minimum = Math.round((minimum + charges) * tax * 1000) / 1000;
            msg.payload.maximum = Math.round((maximum + charges) * tax * 1000) / 1000;
            msg.payload.average = Math.round((average + charges) * tax * 1000) / 1000;

            // Differenz-Node
            msg.payload.diff = Math.round((msg.payload.maximum - msg.payload.minimum) * 1000) / 1000;
            msg.payload.deviation = Math.round(Math.max((msg.payload.average - msg.payload.minimum), (msg.payload.maximum - msg.payload.average)) * 1000) / 1000;

            // clean-up
            delete msg.payload.unix_seconds;
            delete msg.payload.price;
            delete msg.payload.unit;

            node.send(msg);
        });
    }
    RED.nodes.registerType('@iseeberg79/EvaluateGridEnergyPrices', EvaluateGridEnergyPricesNode, {
        defaults: {
            name: { value: "" },
            bzn: { value: "DE-LU" },
            url: { value: "https://api.energy-charts.info/price" },
            charges: { value: 0 },

