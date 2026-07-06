**🇬🇧 English** · [🇩🇪 Deutsch](README.de.md)

[![92C08093-CA7B-463E-8BE3-9F03C6622BD6_klein](https://github.com/user-attachments/assets/7716fdb4-b872-445b-ae45-9caabe0a44a3)](## "generated using a public AI image generator")

# Optimizing home battery storage usage with Node-RED, evcc and a dynamic electricity tariff

## How it works

The battery storage is preferentially charged with surplus PV power. Discharging during periods of cheap grid electricity is avoided. If the price difference is high enough (e.g. > 15 ct/kWh), grid charging can take place at the cheapest time of day to charge the battery up to 80 %. The grid-charging price is taken into account for further control: the battery only releases energy when the grid electricity price is clearly above the grid-charging price (~130 %).

To avoid inefficient charging and discharging, the battery is only charged once its state of charge drops below 30 %. The control focuses on shifting energy use and optimizing storage deployment.

The thresholds for grid charging are configurable and set high by default, since grid charging is often not economical. If sufficient PV generation is forecast for the following day to cover the expensive price periods, no grid charging takes place.

## Input factors

The optimized control is only active when the forecast daily PV generation is below the daily electricity demand (PV forecast < 17.5 kWh). Forecast data can be obtained from [SOLCAST](https://solcast.com/free-rooftop-solar-forecasting) via a personal home-use API. Throughout the day, the remaining PV yield is dynamically fed into the control.

A predefined standard load profile for a 4-person household with working parents and school-age children (approx. 15 kWh/day) is used. Consumption is calculated from the current hour until the next morning (8 a.m.), taking the hourly demand into account.

If electricity prices for the current and the upcoming day are available, they are included in the optimization. Prices can be obtained via [evcc](https://evcc.io/) through its HTTP API, or alternatively from the Fraunhofer ISE [Energy-Charts](https://www.energy-charts.info/).

## Controlling the battery storage

The calculation determines the optimal battery mode. Actually controlling a (hybrid) inverter must be implemented separately due to hardware-dependent factors:

- Grid charging can be controlled by passing the grid-charging price to an [evcc](https://evcc.io/) instance via the MQTT/HTTP API.
- Blocking the battery can, if evcc supports it, be realized based on the information in the [evcc wiki](https://github.com/evcc-io/evcc/wiki/aaa-Lifehacks#entladung-eines-steuerbaren-hausspeicher-preisgesteuert-oder-manuell-sperren). Either the calculated price can be used directly, or the mode can be controlled via the MQTT/HTTP API (charge/discharge mode).

## Node-RED integration

The Node-RED package contains several nodes for optimizing battery usage. The nodes are flexible and can be combined with external data sources. It is also possible to integrate your own nodes for additional data sources. This way the solution can be run with or without evcc. The nodes come preconfigured with default values, while the message inputs allow configuration overrides. The modular design makes it easy to reuse and adapt them to different installations.

### Available nodes

#### Main components
- **DetermineBatteryMode** - Determines the optimal battery mode based on price, SOC and forecasts ([documentation](nodes/determineBatteryMode.html))
- **EstimateBatterymode** - Builds 24-hour charging schedules with cost optimization ([documentation](nodes/estimateBatterymode.html) | [JSDoc](build/docs/module-EstimateBatterymode.html))
- **BatteryModeControl** - Controls the battery mode ([documentation](nodes/batteryModeControl.html))
- **ControlBattery** - Battery control ([documentation](nodes/controlBattery.html))

#### Forecast & data sources
- **EvaluateSolarForecast** - Processes Solcast PV forecasts ([documentation](nodes/evaluateSolarForecast.html))
- **EvaluateSolarForecastAPI** - Fetches Solcast data from the API ([documentation](nodes/evaluateSolarForecastAPI.html))
- **EvaluateSolarForecastOpenMeteo** - Open-Meteo solar forecasts ([documentation](nodes/evaluateSolarForecastOpenMeteo.html))
- **CombinePVForecasts** - Combines multiple PV forecasts ([documentation](nodes/combinePVForecasts.html))
- **EstimateSolarEnergy** - Estimates solar energy from forecasts ([documentation](nodes/estimateSolarEnergy.html))
- **EstimateHouseholdConsumption** - Estimates household consumption ([documentation](nodes/estimateHouseholdConsumption.html))
- **EvaluateGridEnergyPrices** - Processes electricity prices ([documentation](nodes/evaluateGridEnergyPrices.html))
- **EvaluateGridEnergyPricesAPI** - Fetches electricity prices from the API ([documentation](nodes/evaluateGridEnergyPricesAPI.html))
- **TibberApiPrices** - Tibber electricity prices ([documentation](nodes/tibberApiPrices.html))
- **PrepareForecastData** - Prepares forecast data ([documentation](nodes/prepareForecastData.html))

#### Helper functions
- **DetermineControlMode** - Determines the control mode ([documentation](nodes/determineControlMode.html))
- **DeterminePowerValues** - Calculates power values ([documentation](nodes/determinePowerValues.html))

### Examples

Complete flow examples for all nodes can be found in the [`examples/`](examples/) directory. Import them into Node-RED via Menu → Import → Clipboard.

An external control can be integrated that still takes the status of the evcc charging control and current energy values into account.

The control's forecast function represents such an external input. It returns a JSON that can be used for control:

| Start time                | Energy | Import price (€/kWh) | Est. cost (€) | Mode    | Consumption (-kWh) | Production (+kWh) | Discharge (-kWh) | SoC (%) | Eff. price (€/kWh) | Opt. cost (€) |
|--------------------------|------|---------------------|------------|---------|------------------|------------------|---------------|---------|------------------------|--------------|
| 2025-03-03 06:00:00+01:00 | 1    | 0.3150              | 0.3150     | normal  | 1                | 0                | 0             | 5       | 0.0948                 | 0.3150       |
| 2025-03-03 07:00:00+01:00 | 0.427| 0.3453              | 0.2016     | normal  | 1                | 0.00265          | 0.57          | 5       | 0.0948                 | 0.2016       |
| 2025-03-03 08:00:00+01:00 | 0.239| 0.3269              | 0.0780     | normal  | 0.4              | 0.1613           | 0             | 5       | 0.0948                 | 0.0780       |
| 2025-03-03 09:00:00+01:00 | 0.115| 0.2784              | 0.0320     | normal  | 0.4              | 0.28515          | 0             | 5       | 0.0948                 | 0.0320       |
| 2025-03-03 10:00:00+01:00 | -0.334| 0.2375             | 0          | hold    | 0.4              | 0.7343           | 0             | 7.95    | 0.0790                 | 0            |
| 2025-03-03 11:00:00+01:00 | -2.382| 0.1590             | 0          | hold    | 0.4              | 2.7824           | 0             | 30.64   | 0.0790                 | 0            |
| 2025-03-03 12:00:00+01:00 | -3.796| 0.1517             | 0          | hold    | 1                | 4.79605          | 0             | 66.79   | 0.0790                 | 0            |
| 2025-03-03 13:00:00+01:00 | -5.208| 0.1514             | 0          | hold    | 1                | 6.20825          | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 14:00:00+01:00 | -6.678| 0.2244             | 0          | hold    | 0.4              | 7.07795          | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 15:00:00+01:00 | -6.742| 0.2514             | 0          | hold    | 0.4              | 7.1421           | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 16:00:00+01:00 | -5.781| 0.2779             | 0          | hold    | 0.4              | 6.1807           | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 17:00:00+01:00 | -3.360| 0.3284             | 0          | hold    | 1                | 4.3602           | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 18:00:00+01:00 | 0    | 0.3702              | 0.0375     | normal  | 1                | 0.6044           | 0.3956        | 96.23   | 0.0948                 | 0.0375       |
| 2025-03-03 19:00:00+01:00 | 0    | 0.3607              | 0.0948     | normal  | 1                | 0                | 1             | 86.71   | 0.0948                 | 0.0948       |
| 2025-03-03 20:00:00+01:00 | 0    | 0.3304              | 0.0948     | normal  | 1                | 0                | 1             | 77.18   | 0.0948                 | 0.0948       |


The optimized trajectory of the known forecast data (price, PV forecast) is calculated, including an optional grid charge. Statistics and calculation data are returned.
The example above is for a day with sufficient solar yield and high prices outside the hours of solar generation. Control is not required here, but would be used during hours with low electricity prices.

The statistics allow you to calculate whether an optimization leads to price savings:

![image](https://github.com/user-attachments/assets/c19cf251-4244-4232-b647-efa5c4d7c611)

The supplied standard distribution of the forecast electricity demand determines the accuracy of the result.



## Usage and further development

I use the npm building blocks within a Node-RED instance on ioBroker. They should, however, also be compatible with other platforms such as Home Assistant.

The package has since been published; further real-world experience and optimizations are still needed.

---

*Provided without warranty. Use of the provided content is at your own risk!*


<h1>@iseeberg79/battery-usage-optimization-nodes</h1>
<h2>Introduction</h2>

Example flow

![image](https://github.com/user-attachments/assets/90dec152-1f59-4d89-aa5f-c28893201788)


Flow context data

![image](https://github.com/user-attachments/assets/68014f67-9ed2-49fe-8f56-b0fb2f8dc44f)


<h2>Installation</h2>


For example as an upload in the palette manager of Node-RED in ioBroker, or:

npm install @iseeberg79/battery-usage-optimization-nodes


![image](https://github.com/user-attachments/assets/9afcea44-369a-4fdb-aa09-dfb67c39c39e)

![image](https://github.com/user-attachments/assets/3f2a643e-9f1b-456b-8e06-8c512cbb9ee5)

![image](https://github.com/user-attachments/assets/2c84af6d-33d7-43c3-afb8-75ec90aca0e8)



<h2>Links</h2>

[evcc](https://evcc.io)

[solcast](https://solcast.com.au)

[Open-Meteo](https://open-meteo.com/)

[Energy-Charts](https://www.energy-charts.info/)

[iobroker.net](https://www.iobroker.net)

[node-red](https://nodered.org)
