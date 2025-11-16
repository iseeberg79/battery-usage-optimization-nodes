# Node-RED Flow Examples

This directory contains example flows for the battery usage optimization nodes.

## Available Examples

### Battery Mode Control
- **File**: `batteryModeControlExample.json`
- **Description**: Example flow for controlling battery mode based on pricing and forecasts

### Battery Optimization
- **File**: `batteryOptimizationExample.json`
- **Description**: Complete battery optimization workflow with all nodes

### Control Battery
- **File**: `controlBatteryExample.json`
- **Description**: Basic battery control example

### Determine Battery Mode
- **File**: `determineBatteryModeExample.json`
- **Description**: Example for determining optimal battery operation mode

### Determine Control Mode
- **File**: `determineControlModeExample.json`
- **Description**: Example for determining control mode based on conditions

### Determine Power Values
- **File**: `determinePowerValuesExample.json`
- **Description**: Example for calculating power values

### Estimate Battery Mode
- **File**: `estimateBatterymodeExample.json`
- **Description**: Example for creating 24-hour battery charging plans

### Estimate Household Consumption
- **File**: `estimateHouseholdConsumptionExample.json`
- **Description**: Example for estimating household energy consumption

### Estimate Solar Energy
- **File**: `estimateSolarEnergyExample.json`
- **Description**: Example for processing solar forecasts from Solcast

### Evaluate Grid Energy Prices
- **File**: `evaluateGridEnergyPricesExample.json`
- **Description**: Example for evaluating electricity grid prices

### Evaluate Grid Energy Prices API
- **File**: `evaluateGridEnergyPricesAPIExample.json`
- **Description**: Example for fetching grid prices from API

### Evaluate Solar Forecast
- **File**: `evaluateSolarForecastExample.json`
- **Description**: Example for processing and evaluating solar forecasts

### Combine PV Forecasts
- **File**: `combinePVForecastsExample.json`
- **Description**: Example for combining multiple PV forecast sources

### Prepare Forecast Data
- **File**: `prepareForecastDataExample.json`
- **Description**: Example for preparing forecast data for optimization

## How to Use

1. Open Node-RED
2. Go to Menu → Import → Clipboard
3. Copy the contents of an example JSON file
4. Paste into the import dialog
5. Click "Import"

## Note

These examples use default configuration values. You may need to adjust:
- Battery capacity and buffer settings
- Price thresholds
- Forecast API endpoints
- MQTT/HTTP connection details
