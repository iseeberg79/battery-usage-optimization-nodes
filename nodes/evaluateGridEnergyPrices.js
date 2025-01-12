module.exports = function(RED) {
	function EvaluateGridEnergyPrices(config) {
		RED.nodes.createNode(this, config);
		var node = this;
		node.bzn = config.bzn;
		node.url = config.url;

		node.on('input', async function(msg) {
			let heute = (new Date()).setHours(0, 0, 0, 0);
			msg.start = Math.floor(heute / 1000);
			msg.end = Math.floor(new Date((new Date(heute).getTime() + (1000 * 3600 * 24))).setHours(23, 59, 59, 999) / 1000);

			msg.bzn = (typeof msg.bzn !== 'undefined') ? msg.bzn : (node.bzn || "DE-LU");

			msg.payload = {
				bzn: msg.bzn,
				start: msg.start,
				end: msg.end
			};

			msg.url = (typeof msg.url !== 'undefined') ? msg.url : (node.url || 'https://api.energy-charts.info/price');

			try {
				const response = await axios.get(msg.url, { params: msg.payload });
				msg.payload = response.data;
			} catch (error) {
				node.error('HTTP-Anfrage Fehler: ' + error, msg);
				return;
			}

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

			msg.charges = (typeof msg.charges !== 'undefined') ? msg.charges : (node.charges || 0);
			if (typeof msg.charges === 'string') {
				msg.charges = parseFloat(msg.charges);
			}
			const charges = msg.charges;
			const tax_percent = (typeof msg.tax !== 'undefined') ? msg.tax : (node.tax || 19);
			const tax = msg.tax = 1 + (tax_percent / 100);
			msg.payload.minimum = Math.round((minimum + charges) * tax * 1000) / 1000;
			msg.payload.maximum = Math.round((maximum + charges) * tax * 1000) / 1000;
			msg.payload.average = Math.round((average + charges) * tax * 1000) / 1000;

			msg.payload.diff = Math.round((msg.payload.maximum - msg.payload.minimum) * 1000) / 1000;
			msg.payload.deviation = Math.round(Math.max((msg.payload.average - msg.payload.minimum), (msg.payload.maximum - msg.payload.average)) * 1000) / 1000;

			delete msg.payload.unix_seconds;
			delete msg.payload.price;
			delete msg.payload.unit;

			node.send(msg);
		});
	}
	RED.nodes.registerType('@iseeberg79/EvaluateGridEnergyPrices', EvaluateGridEnergyPrices, {
		defaults: {
			name: { value: "" },
			bzn: { value: "DE-LU" },
			url: { value: "https://api.energy-charts.info/price" }
		},
		inputs: 1,
		outputs: 1,
		icon: "file.png",
		label: function() {
			return this.name || "Evaluate Grid Energy Prices";
		}
	});
};

