const axios = require("axios");

module.exports = function (RED) {
    function EvaluateGridEnergyPricesAPINode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.url = config.url;

        node.on("input", async function (msg) {
            // Defaults to local API provided by evcc on default port
            msg.url = typeof msg.url !== "undefined" ? msg.url : node.url || "http://localhost:7070/api/tariff/grid";

            // HTTP request
            try {
                const response = await axios.get(msg.url);
                msg.response = response.data;

                // Ensure response contains expected structure
                if (!msg.response || !msg.response.result || !msg.response.result.rates) {
                    throw new Error("Invalid response structure");
                }

				// Conversion node
                const data = msg.response.result.rates
                    .filter((item) => item && (item.value !== undefined || item.price !== undefined))
                    .map((item) => ({
                        ...item,
                        price: item.value !== undefined ? item.value : item.price // Einheitliches Mapping auf price (Umstellung evcc API)
                    }));
				
				// Extract prices from the JSON object
                const prices = data.map((item) => item.price);
				
                // Calculate maximum, minimum, and average values
                const maximal = parseFloat(Math.max(...prices).toFixed(3));
                const minimal = parseFloat(Math.min(...prices).toFixed(3));
                const average = parseFloat((prices.reduce((acc, val) => +acc + val, 0) / prices.length).toFixed(3));
                const diff = parseFloat(((maximal - minimal) * 100).toFixed(1));

                // Calculate deviation
                const deviation = parseFloat(Math.max((Math.abs(maximal - average), Math.abs(minimal - average)) * 100).toFixed(1));

                // Assign calculated values to msg
                msg.payload = {
                    prices: data,
                    maximum: maximal,
                    absMinimum: minimal,
                    average: average,
                    diff: diff,
                    deviation: deviation,
                };

				// Sicherstellen, dass wir gültige Intervalle haben
                const validData = data.filter((item) => item.start !== undefined);
				
                // Find the interval with the maximum price
                const maxPriceInterval = validData.reduce((max, interval) => (interval.price > max.price ? interval : max), validData[0]);
                const maxPriceStartTime = new Date(maxPriceInterval.start);

                // Filter the intervals before the maximum price
                const validIntervals = validData.filter((interval) => new Date(interval.start) < maxPriceStartTime);

                // Find and assign the lowest price from the valid intervals
                msg.payload.minimum = validIntervals.reduce((min, interval) => (interval.price < min.price ? interval : min), validIntervals[0]).price;

                //clean-up
                delete msg.response;

                node.send(msg);
            } catch (error) {
                node.error("general error: " + error, msg);
                return;
            }
        });
    }
    RED.nodes.registerType("@iseeberg79/EvaluateGridEnergyPricesAPI", EvaluateGridEnergyPricesAPINode, {
        defaults: {
            name: { value: "" },
            url: { value: "http://localhost:7070/api/tariff/grid" },
        },
    });
};
