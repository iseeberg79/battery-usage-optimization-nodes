module.exports = function(RED) {
	function EstimateSolarEnergyNode(config) {
		RED.nodes.createNode(this, config);
		const node = this;

		node.on('input', function(msg) {
			if (Array.isArray(msg.payload.forecasts) && msg.payload.forecasts.length > 0) {
				
				//				const today = msg.datum = new Date().toISOString().split('T')[0];
				//				const tomorrow = (new Date((new Date()).getTime() + (24 * 3600000)).toISOString().split('T')[0]);
				//				const now = new Date();
				
				const now = new Date().getTime();	
				const timezoneOffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
				const today = new Date(now - timezoneOffset).toISOString().split('T')[0];
				const tomorrow = (new Date(now - timezoneOffset + (24 * 3600000)).toISOString().split('T')[0]);

				const { todayTotal, tomorrowTotal, remainderToday } = msg.payload.forecasts.reduce((acc, { pv_estimate, pv_estimate10, pv_estimate90, period_end }) => {
					const periodDate = new Date(period_end);
					const periodDay = periodDate.toISOString().split('T')[0];
					if (periodDay === today) {
						if (periodDate > now) {
							acc.remainderToday.pv_estimate += pv_estimate * 1000 / 2;
							acc.remainderToday.pv_estimate10 += pv_estimate10 * 1000 / 2;
							acc.remainderToday.pv_estimate90 += pv_estimate90 * 1000 / 2;
						}
						acc.todayTotal.pv_estimate += pv_estimate * 1000 / 2;
						acc.todayTotal.pv_estimate10 += pv_estimate10 * 1000 / 2;
						acc.todayTotal.pv_estimate90 += pv_estimate90 * 1000 / 2;
					} else if (periodDay === tomorrow) {
						acc.tomorrowTotal.pv_estimate += pv_estimate * 1000 / 2;
						acc.tomorrowTotal.pv_estimate10 += pv_estimate10 * 1000 / 2;
						acc.tomorrowTotal.pv_estimate90 += pv_estimate90 * 1000 / 2;
					}
					return acc;
				}, {
					todayTotal: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
					tomorrowTotal: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 },
					remainderToday: { pv_estimate: 0, pv_estimate10: 0, pv_estimate90: 0 }
				});

				msg.payload.today = Math.round(todayTotal.pv_estimate);
				msg.payload.remain = Math.round(remainderToday.pv_estimate);
				msg.payload.tomorrow = Math.round(tomorrowTotal.pv_estimate);
			} else {
				node.warn("ungültige Eingabe eines Arrays");
				msg = null;
			}
			node.send(msg);
		});
	}
	RED.nodes.registerType("@iseeberg79/EstimateSolarEnergy", EstimateSolarEnergyNode, {
		defaults: {
			name: { value: "" }
		}
	});
};
