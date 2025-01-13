const axios = require('axios');
module.exports = function(RED) {
	function EvaluateGridEnergyPricesAPINode(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.url = config.url;

		node.on('input', async function(msg) {
			// Defaults to local API provided by evcc on default port
			msg.url = (typeof msg.url !== 'undefined') ? msg.url : (node.url || 'http://localhost:7070/api/tariff/grid');

			// HTTP-Anfrage
			try {
				const response = await axios.get(msg.url);
				msg.response = response.data;
			} catch (error) {
				node.error('HTTP-Anfrage Fehler: ' + error, msg);
				return;
			}

			// Konvertierungs-Node
			var data = msg.response.result.rates;

			// Extrahieren der Preise aus dem JSON-Objekt
			var prices = data.map(item => item.price);

			// Berechnung der maximalen, minimalen und durchschnittlichen Werte
			var maximal = parseFloat(Math.max(...prices).toFixed(3));
			var minimal = parseFloat(Math.min(...prices).toFixed(3));
			var average = parseFloat((prices.reduce((acc, val) => acc + val, 0) / prices.length).toFixed(3));
			var diff = parseFloat(((maximal - minimal) * 100).toFixed(1));

			// Berechnung der Abweichung
			var deviation = parseFloat(Math.max((Math.abs(maximal - average), Math.abs(minimal - average)) * 100).toFixed(1));

			// Zuweisung der berechneten Werte zu msg
			msg.payload = {
				prices: msg.response.result.rates,
				maximum: maximal,
				minimum: minimal,
				average: average,
				diff: diff,
				deviation: deviation
			};
			delete msg.response;

			node.send(msg);
		});
	}
	RED.nodes.registerType('@iseeberg79/EvaluateGridEnergyPricesAPI', EvaluateGridEnergyPricesAPINode, {
		defaults: {
			name: { value: "" },
			url: { value: "http://localhost:7070/api/tariff/grid" }
		}
	});
};
