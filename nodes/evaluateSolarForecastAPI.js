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
                msg.response = response.data;
            } catch (error) {
                node.error("HTTP-Anfrage Fehler: " + error, msg);
                return;
            }

            // Forward the JSON response as payload
            msg.payload = msg.response;

            delete msg.response;

            node.send(msg);
        });
    }
    RED.nodes.registerType("EvaluateSolarForecastAPI", EvaluateSolarForecastAPI, {
        defaults: {
            name: { value: "" },
            url: { value: "http://localhost:7070/api/tariff/solar" },
        },
    });
};
